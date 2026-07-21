/*
 * The chat page shell. Owns the composer draft and hands plain props to the design
 * system.
 *
 * It does NOT own the transcript. That lives in use-chat-views, above this screen, so
 * that switching conversations cannot throw away a turn that is still running. This
 * file only maps the domain messages onto the design system's view model and wires the
 * composer. Carries no class string (rule 22).
 */
import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';
import { ChatThread } from '../components/organisms/chat-thread/index.tsx';
import type { ThreadMessage } from '../components/organisms/chat-thread/index.tsx';
import { Composer } from '../components/organisms/composer/index.tsx';
import type { ChatPart } from '../components/molecules/chat-message/index.tsx';
import type { ToolStep } from '../components/molecules/tool-call-card/index.tsx';
import { toolLabel } from '../lib/tool-label.ts';
import type { ChatView } from '../lib/ui-event-fold.ts';
import { renderMarkdown } from '../render/markdown.tsx';
import type { Message } from '../../../shared/types.ts';

export type ChatPageProps = {
  conversationId: string;
  view: ChatView;
  onHydrate: () => void;
  onSend: (text: string) => void;
  onCancel: () => void;
};

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

export const ChatPage: FC<ChatPageProps> = ({ view, onHydrate, onSend, onCancel }) => {
  const [draft, setDraft] = useState('');

  useEffect(onHydrate, [onHydrate]);

  const send = useCallback((): void => {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft('');
    onSend(text);
  }, [draft, onSend]);

  return (
    <>
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
        onChange={setDraft}
        onSend={send}
        onCancel={onCancel}
      />
    </>
  );
};

ChatPage.displayName = 'ChatPage';
