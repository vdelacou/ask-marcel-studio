import type { FC } from 'react';
import { ToolCallCard } from '../tool-call-card/index.tsx';
import type { ToolCallStatus } from '../tool-call-card/index.tsx';

// A view model, not the domain Message: the design system never imports src/shared
// (rule 21). The page shell maps one to the other.
export type ChatPart = { kind: 'text'; text: string } | { kind: 'tool'; id: string; name: string; input: string; result?: string; status: ToolCallStatus };

export type ChatMessageProps = {
  role: 'user' | 'assistant';
  parts: readonly ChatPart[];
};

export const ChatMessage: FC<ChatMessageProps> = ({ role, parts }) => (
  <article className={`flex flex-col gap-y-2 ${role === 'user' ? 'items-end' : 'items-start'}`}>
    {parts.map((part, index) =>
      part.kind === 'text' ? (
        <p
          key={`text-${String(index)}`}
          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-panel px-3 py-2 text-sm ${role === 'user' ? 'bg-accent text-accent-ink' : 'bg-surface-raised text-ink'}`}
        >
          {part.text}
        </p>
      ) : (
        <div key={part.id} className="w-full max-w-[85%]">
          <ToolCallCard name={part.name} input={part.input} result={part.result} status={part.status} />
        </div>
      )
    )}
  </article>
);

ChatMessage.displayName = 'ChatMessage';
