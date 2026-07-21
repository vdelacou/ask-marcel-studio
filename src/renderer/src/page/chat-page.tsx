/*
 * The chat page shell. Owns the composer draft, the attachments waiting to be sent and
 * the "/" skill menu, and hands plain props to the design system.
 *
 * It does NOT own the transcript. That lives in use-chat-views, above this screen, so
 * that switching conversations cannot throw away a turn that is still running. Carries
 * no class string (rule 22); every decision it makes is a call into src/renderer/src/lib.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DragEvent, FC } from 'react';
import { ChatThread } from '../components/organisms/chat-thread/index.tsx';
import type { ThreadMessage } from '../components/organisms/chat-thread/index.tsx';
import { Composer } from '../components/organisms/composer/index.tsx';
import { DropTarget } from '../components/organisms/drop-target/index.tsx';
import { Toast } from '../components/molecules/toast/index.tsx';
import type { ChatPart } from '../components/molecules/chat-message/index.tsx';
import type { ToolStep } from '../components/molecules/tool-call-card/index.tsx';
import type { SuggestItem } from '../components/molecules/suggest-popover/index.tsx';
import { useAttachments } from '../hooks/use-attachments.ts';
import { toolLabel } from '../lib/tool-label.ts';
import { filterSkills, insertSkill, slashQuery, stepActive } from '../lib/slash-suggest.ts';
import type { SkillSuggestion } from '../lib/slash-suggest.ts';
import { attachmentSuffix } from '../../../shared/import-plan.ts';
import type { ChatView } from '../lib/ui-event-fold.ts';
import { renderMarkdown } from '../render/markdown.tsx';
import type { Message } from '../../../shared/types.ts';

export type ChatPageProps = {
  conversationId: string;
  view: ChatView;
  onHydrate: () => void;
  onSend: (text: string) => void;
  onCancel: () => void;
  // The app asks the user about things it noticed, and does it only when they are not
  // mid-sentence. This is how it knows.
  onComposerActivity: (hasText: boolean) => void;
};

const MENU_ITEMS = [{ id: 'import-file', label: 'Attach a file…' }];

// Maps the domain message onto the design system's view model. The components never
// import src/shared (rule 21), so the shell is where the two meet.
//
// Takes the live subagent steps because they are keyed by the tool call that spawned
// them, and this is where a tool part and its steps can be put back together.
const toThreadMessage =
  (subagentSteps: ChatView['subagentSteps']) =>
  (message: Message): ThreadMessage => ({
    id: message.id,
    role: message.role,
    parts: message.parts.map((part): ChatPart => {
      // The assistant speaks markdown; the user's own text is shown verbatim.
      if (part.type === 'text') return { kind: 'text', content: message.role === 'assistant' ? renderMarkdown(part.text) : part.text };

      const steps: readonly ToolStep[] = (subagentSteps?.[part.toolUseId] ?? []).map((step) => ({
        id: step.toolUseId,
        label: toolLabel(step.name, step.input),
        name: step.name,
        status: step.status,
      }));
      return {
        kind: 'tool',
        id: part.toolUseId,
        label: toolLabel(part.name, part.input),
        name: part.name,
        // Pretty-printed here rather than in the card: the card renders strings.
        input: JSON.stringify(part.input ?? {}, null, 2),
        ...(part.result === undefined ? {} : { result: part.result }),
        status: part.status,
        ...(steps.length === 0 ? {} : { steps }),
      };
    }),
  });

export const ChatPage: FC<ChatPageProps> = ({ conversationId, view, onHydrate, onSend, onCancel, onComposerActivity }) => {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [skills, setSkills] = useState<readonly SkillSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  // A counter, not a boolean: dragging over a child fires dragleave on the parent, and
  // a boolean would flicker the overlay away under the cursor.
  const [dragDepth, setDragDepth] = useState(0);
  const attachments = useAttachments(conversationId);

  useEffect(onHydrate, [onHydrate]);

  useEffect(() => {
    void (async (): Promise<void> => {
      const listed = await studio.skills.list();
      // A failure here only means the "/" menu is empty, never that the page fails.
      if (listed.ok) setSkills(listed.value.map((skill) => ({ name: skill.folder, description: skill.description })));
    })();
  }, []);

  const query = slashQuery(draft);
  const suggestions: readonly SuggestItem[] =
    query === undefined || suggestionsDismissed ? [] : filterSkills(skills, query).map((skill) => ({ id: skill.name, title: `/${skill.name}`, subtitle: skill.description }));

  const changeDraft = useCallback(
    (next: string): void => {
      setDraft(next);
      setSuggestionsDismissed(false);
      setActiveSuggestion(0);
      onComposerActivity(next.trim().length > 0);
    },
    [onComposerActivity]
  );

  const pickSuggestion = useCallback((name: string): void => {
    setDraft(insertSkill(name));
    setSuggestionsDismissed(false);
    setActiveSuggestion(0);
  }, []);

  const { items: attached, clear } = attachments;
  const send = useCallback((): void => {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft('');
    setMenuOpen(false);
    onComposerActivity(false);
    onSend(`${text}${attachmentSuffix(attached)}`);
    clear();
  }, [draft, onSend, attached, clear, onComposerActivity]);

  const { pick, acceptDrop } = attachments;
  const pickMenu = useCallback(
    (id: string): void => {
      setMenuOpen(false);
      if (id === 'import-file') pick();
    },
    [pick]
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      setDragDepth(0);
      acceptDrop([...event.dataTransfer.files]);
    },
    [acceptDrop]
  );

  // preventDefault on dragover is what tells the browser a drop is allowed here;
  // without it the file just opens in the window.
  const allowDrop = useCallback((event: DragEvent<HTMLDivElement>): void => event.preventDefault(), []);
  const onDragEnter = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragDepth((depth) => depth + 1);
  }, []);
  const onDragLeave = useCallback((): void => setDragDepth((depth) => Math.max(0, depth - 1)), []);

  return (
    <DropTarget
      isActive={dragDepth > 0}
      hint="Drop the files here to attach them to this conversation"
      onDragEnter={onDragEnter}
      onDragOver={allowDrop}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ChatThread
        messages={view.messages.map(toThreadMessage(view.subagentSteps))}
        isStreaming={view.isStreaming}
        error={view.error}
        emptyHint="Ask anything. The agent can run commands and read files in this conversation's workspace."
      />
      <Composer
        value={draft}
        isStreaming={view.isStreaming}
        canSend={draft.trim().length > 0 && !view.isStreaming}
        placeholder="Send a message…"
        attachments={attachments.items.map((item) => ({ id: item.relativePath, name: item.name }))}
        menuOpen={menuOpen}
        menuItems={MENU_ITEMS}
        suggestions={suggestions}
        activeSuggestion={activeSuggestion}
        onChange={changeDraft}
        onSend={send}
        onCancel={onCancel}
        onRemoveAttachment={attachments.remove}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onPickMenu={pickMenu}
        onPickSuggestion={pickSuggestion}
        onMoveSuggestion={(delta) => setActiveSuggestion((current) => stepActive(suggestions.length, current, delta))}
        onHoverSuggestion={setActiveSuggestion}
        onDismissSuggestions={() => setSuggestionsDismissed(true)}
      />
      {attachments.error !== undefined && <Toast message={attachments.error} onDismiss={attachments.dismissError} />}
    </DropTarget>
  );
};

ChatPage.displayName = 'ChatPage';
