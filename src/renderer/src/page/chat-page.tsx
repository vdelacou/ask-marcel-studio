/*
 * The chat page shell. Owns the composer draft, the attachments waiting to be sent and
 * the "/" skill menu, and hands plain props to the design system.
 *
 * It does NOT own the transcript. That lives in use-chat-views, above this screen, so
 * that switching conversations cannot throw away a turn that is still running. Carries
 * no class string (rule 22); every decision it makes is a call into src/renderer/src/lib.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, FC, ReactNode } from 'react';
import { ChatThread } from '../components/organisms/chat-thread/index.tsx';
import type { ThreadMessage } from '../components/organisms/chat-thread/index.tsx';
import { Composer } from '../components/organisms/composer/index.tsx';
import type { ComposerModel } from '../components/organisms/composer/index.tsx';
import { DropTarget } from '../components/organisms/drop-target/index.tsx';
import { Toast } from '../components/molecules/toast/index.tsx';
import type { ChatPart } from '../components/molecules/chat-message/index.tsx';
import type { ToolStep } from '../components/molecules/tool-call-card/index.tsx';
import type { SuggestItem } from '../components/molecules/suggest-popover/index.tsx';
import { useAttachments } from '../hooks/use-attachments.ts';
import { toolLabel } from '../lib/tool-label.ts';
import { filterSkills, insertSkill, slashQuery, stepActive } from '../lib/slash-suggest.ts';
import type { SkillSuggestion } from '../lib/slash-suggest.ts';
import { stepHistory } from '../lib/message-history.ts';
import { attachmentSuffix, withoutAttachmentSuffix } from '../../../shared/import-plan.ts';
import type { ChatView } from '../lib/ui-event-fold.ts';
import { renderMarkdown } from '../render/markdown.tsx';
import type { Message } from '../../../shared/types.ts';

export type ChatPageProps = {
  conversationId: string;
  view: ChatView;
  // Absent when only one model is set up: there is nothing to choose.
  model?: ComposerModel;
  onChangeModel: (value: string) => void;
  onHydrate: () => void;
  onSend: (text: string) => void;
  onCancel: () => void;
  // The app asks the user about things it noticed, and does it only when they are not
  // mid-sentence. This is how it knows.
  onComposerActivity: (hasText: boolean) => void;
  // The conversation's sticky title bar, built by the app shell (it owns rename and
  // delete, which the sidebar shares).
  header?: ReactNode;
};

const MENU_ITEMS = [{ id: 'import-file', label: 'Attach a file…' }];

// Maps the domain message onto the design system's view model. The components never
// import src/shared (rule 21), so the shell is where the two meet.
//
// Child tool parts (a delegated reader's own steps, tagged parentToolUseId) render
// nested inside the tool call that spawned them, never as top-level cards.
const toThreadMessage = (message: Message): ThreadMessage => {
  const stepsFor = (parentId: string): readonly ToolStep[] =>
    message.parts.flatMap((part): ToolStep[] =>
      part.type === 'tool' && part.parentToolUseId === parentId
        ? [
            {
              id: part.toolUseId,
              label: toolLabel(part.name, part.input),
              name: part.name,
              status: part.status,
              input: JSON.stringify(part.input ?? {}, null, 2),
              ...(part.result === undefined ? {} : { result: part.result }),
            },
          ]
        : []
    );

  return {
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap((part): ChatPart[] => {
      // The assistant speaks markdown; the user's own text is shown verbatim.
      if (part.type === 'text') return [{ kind: 'text', content: message.role === 'assistant' ? renderMarkdown(part.text) : part.text }];
      if (part.parentToolUseId !== undefined) return [];

      const steps = stepsFor(part.toolUseId);
      return [
        {
          kind: 'tool',
          id: part.toolUseId,
          label: toolLabel(part.name, part.input),
          name: part.name,
          // Pretty-printed here rather than in the card: the card renders strings.
          input: JSON.stringify(part.input ?? {}, null, 2),
          ...(part.result === undefined ? {} : { result: part.result }),
          status: part.status,
          ...(steps.length === 0 ? {} : { steps }),
        },
      ];
    }),
  };
};

export const ChatPage: FC<ChatPageProps> = ({ conversationId, view, model, onHydrate, onSend, onCancel, onChangeModel, onComposerActivity, header }) => {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [skills, setSkills] = useState<readonly SkillSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  // How far back through what was already sent the box currently is, and the text that was
  // in it before that started. Undefined depth means the box is the user's own again.
  const [historyDepth, setHistoryDepth] = useState<number | undefined>(undefined);
  const [pending, setPending] = useState('');
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

  // What they have already sent, oldest first, as they typed it. The transcript keeps the
  // attached-files paragraph the composer appended on the way out, and that paragraph is
  // not theirs to send again.
  const sent = useMemo(
    () =>
      view.messages
        .filter((message) => message.role === 'user')
        .map((message) => withoutAttachmentSuffix(message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')))
        .filter((text) => text.length > 0),
    [view.messages]
  );

  // Only when the box is empty or already holds something recalled. With their own text in
  // it the arrows belong to the caret.
  const canRecallHistory = sent.length > 0 && (historyDepth !== undefined || draft.length === 0);

  const recall = useCallback(
    (direction: 1 | -1): void => {
      // Captured on the way in rather than on every keystroke: this is the text to hand
      // back if they walk all the way forward again.
      const carried = historyDepth === undefined ? draft : pending;
      const step = stepHistory({ entries: sent, ...(historyDepth === undefined ? {} : { depth: historyDepth }), pending: carried, direction });
      if (step === undefined) return;
      setPending(carried);
      setDraft(step.draft);
      setHistoryDepth(step.depth);
      onComposerActivity(step.draft.trim().length > 0);
    },
    [sent, historyDepth, pending, draft, onComposerActivity]
  );

  const changeDraft = useCallback(
    (next: string): void => {
      setDraft(next);
      setSuggestionsDismissed(false);
      setActiveSuggestion(0);
      // Typing ends the browsing, so the next press of up starts from the newest again.
      setHistoryDepth(undefined);
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
    setHistoryDepth(undefined);
    setPending('');
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
        messages={view.messages.map(toThreadMessage)}
        isStreaming={view.isStreaming}
        error={view.error}
        emptyHint="Ask anything. The agent can run commands and read files in this conversation's workspace."
        {...(header === undefined ? {} : { header })}
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
        canRecallHistory={canRecallHistory}
        {...(model === undefined ? {} : { model })}
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
        onRecall={recall}
        onChangeModel={onChangeModel}
      />
      {attachments.error !== undefined && <Toast message={attachments.error} onDismiss={attachments.dismissError} />}
    </DropTarget>
  );
};

ChatPage.displayName = 'ChatPage';
