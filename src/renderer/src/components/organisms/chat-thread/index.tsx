import type { FC } from 'react';
import { ChatMessage } from '../../molecules/chat-message/index.tsx';
import type { ChatPart } from '../../molecules/chat-message/index.tsx';
import { Spinner } from '../../atoms/spinner/index.tsx';

export type ThreadMessage = { id: string; role: 'user' | 'assistant'; parts: readonly ChatPart[] };

export type ChatThreadProps = {
  messages: readonly ThreadMessage[];
  isStreaming: boolean;
  error?: string;
  emptyHint: string;
};

export const ChatThread: FC<ChatThreadProps> = ({ messages, isStreaming, error, emptyHint }) => (
  <section className="flex flex-1 flex-col gap-y-4 overflow-y-auto p-4">
    {messages.length === 0 && !isStreaming && <p className="m-auto max-w-sm text-center text-sm text-ink-muted">{emptyHint}</p>}
    {messages.map((message) => (
      <ChatMessage key={message.id} role={message.role} parts={message.parts} />
    ))}
    {isStreaming && <Spinner label="Working…" />}
    {error !== undefined && (
      <p role="alert" className="rounded-md border border-danger bg-danger-wash px-3 py-2 text-xs text-danger">
        {error}
      </p>
    )}
  </section>
);

ChatThread.displayName = 'ChatThread';
