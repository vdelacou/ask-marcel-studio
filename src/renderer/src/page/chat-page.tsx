/*
 * The chat page shell. Owns every hook, subscribes to the event stream once, and
 * hands plain props to the design system.
 *
 * Carries no class string (rule 22). The transcript logic lives in
 * lib/ui-event-fold.ts, where it is tested; this file only wires.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';
import { ChatThread } from '../components/organisms/chat-thread/index.tsx';
import type { ThreadMessage } from '../components/organisms/chat-thread/index.tsx';
import { Composer } from '../components/organisms/composer/index.tsx';
import { ConversationHeader } from '../components/molecules/conversation-header/index.tsx';
import type { ChatPart } from '../components/molecules/chat-message/index.tsx';
import { appendUserMessage, applyUIEvent, emptyChat } from '../lib/ui-event-fold.ts';
import type { ChatView } from '../lib/ui-event-fold.ts';
import { formatUsage } from '../lib/format-usage.ts';
import { renderMarkdown } from '../render/markdown.tsx';
import type { Message } from '../../../shared/types.ts';

export type ChatPageProps = {
  conversationId: string;
};

// Maps the domain message onto the design system's view model. The components never
// import src/shared (rule 21), so the shell is where the two meet.
const toThreadMessage = (message: Message): ThreadMessage => ({
  id: message.id,
  role: message.role,
  parts: message.parts.map((part): ChatPart =>
    part.type === 'text'
      ? // The assistant speaks markdown; the user's own text is shown verbatim.
        { kind: 'text', content: message.role === 'assistant' ? renderMarkdown(part.text) : part.text }
      : {
          kind: 'tool',
          id: part.toolUseId,
          name: part.name,
          // Pretty-printed here rather than in the card: the card renders strings.
          input: JSON.stringify(part.input ?? {}, null, 2),
          ...(part.result === undefined ? {} : { result: part.result }),
          status: part.status,
        }
  ),
});

export const ChatPage: FC<ChatPageProps> = ({ conversationId }) => {
  const [view, setView] = useState<ChatView>(() => emptyChat(conversationId));
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setView(emptyChat(conversationId));
    void (async (): Promise<void> => {
      const loaded = await studio.conversations.get(conversationId);
      if (!loaded.ok) {
        setView((v) => ({ ...v, error: loaded.error.message }));
        return;
      }
      setView((v) => ({ ...v, title: loaded.value.title, messages: loaded.value.messages }));
    })();
  }, [conversationId]);

  useEffect(() => {
    // One listener for the lifetime of the page. The fold drops events belonging to
    // other conversations, so a background turn cannot write in here.
    const unsubscribe = studio.chat.onEvent((event) => setView((v) => applyUIEvent(v, event)));
    return unsubscribe;
  }, []);

  const onSend = useCallback((): void => {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft('');
    // Echoed immediately so the message appears on Enter, not when the turn starts.
    setView((v) => appendUserMessage(v, crypto.randomUUID(), text, new Date().toISOString()));
    void (async (): Promise<void> => {
      const sent = await studio.chat.send({ conversationId, text });
      if (!sent.ok) setView((v) => ({ ...v, isStreaming: false, error: sent.error.message }));
    })();
  }, [draft, conversationId]);

  const onCancel = useCallback((): void => {
    void studio.chat.cancel(conversationId);
    setView((v) => ({ ...v, isStreaming: false }));
  }, [conversationId]);

  return (
    <>
      <ConversationHeader title={view.title === '' ? 'New conversation' : view.title} usage={formatUsage(view.lastUsage)} />
      <ChatThread
        messages={view.messages.map(toThreadMessage)}
        isStreaming={view.isStreaming}
        error={view.error}
        emptyHint="Ask anything. The agent can run commands and read files in this conversation's workspace."
      />
      <Composer
        value={draft}
        isStreaming={view.isStreaming}
        canSend={draft.trim().length > 0 && !view.isStreaming}
        placeholder="Send a message. Enter to send, shift+enter for a new line."
        onChange={setDraft}
        onSend={onSend}
        onCancel={onCancel}
      />
    </>
  );
};

ChatPage.displayName = 'ChatPage';
