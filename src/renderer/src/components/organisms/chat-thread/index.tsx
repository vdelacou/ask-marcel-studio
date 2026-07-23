import type { FC, ReactNode } from 'react';
import { ChatMessage } from '../../molecules/chat-message/index.tsx';
import type { ChatPart } from '../../molecules/chat-message/index.tsx';
import { Spinner } from '../../atoms/spinner/index.tsx';

export type ThreadMessage = { id: string; role: 'user' | 'assistant'; parts: readonly ChatPart[] };

export type ChatThreadProps = {
  messages: readonly ThreadMessage[];
  isStreaming: boolean;
  error?: string;
  emptyHint: string;
  // The conversation's title bar. It belongs INSIDE this scroller so it can stick to the
  // top of the scrolled content rather than floating above an unrelated box.
  header?: ReactNode;
};

export const ChatThread: FC<ChatThreadProps> = ({ messages, isStreaming, error, emptyHint, header }) => (
  // The horizontal padding sits on the scroll container, not inside the column, so the
  // reading column and the composer below it land on exactly the same two edges.
  <section className="flex-1 overflow-y-auto px-6">
    {header}
    <div className="mx-auto flex w-full min-w-0 max-w-reading flex-col gap-y-6 pb-8 pt-6">
      {messages.length === 0 && !isStreaming && <p className="m-auto max-w-sm py-16 text-center text-sm text-ink-muted">{emptyHint}</p>}
      {messages.map((message) => (
        <ChatMessage key={message.id} role={message.role} parts={message.parts} />
      ))}
      {isStreaming && <Spinner label="Working…" />}
      {error !== undefined && (
        <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  </section>
);

ChatThread.displayName = 'ChatThread';
