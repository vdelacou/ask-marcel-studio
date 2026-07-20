import type { FC, ReactNode } from 'react';
import { ToolCallCard } from '../tool-call-card/index.tsx';
import type { ToolCallStatus } from '../tool-call-card/index.tsx';
import { MarkdownView } from '../../atoms/markdown-view/index.tsx';

// A view model, not the domain Message: the design system never imports src/shared
// (rule 21). Text arrives as an already-rendered node so the page shell owns the
// markdown library (render/markdown) and this stays prop-pure.
export type ChatPart = { kind: 'text'; content: ReactNode } | { kind: 'tool'; id: string; name: string; input: string; result?: string; status: ToolCallStatus };

export type ChatMessageProps = {
  role: 'user' | 'assistant';
  parts: readonly ChatPart[];
};

// The user's own words sit in a soft bubble on the right; the assistant answers as
// full-width prose with no bubble, the way a document reads, rather than a chat card.
const TextBubble: FC<{ role: 'user' | 'assistant'; content: ReactNode }> = ({ role, content }) => {
  if (role === 'user') return <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-surface-raised px-4 py-2.5 text-sm text-ink">{content}</div>;
  return (
    <div className="w-full text-ink">
      <MarkdownView>{content}</MarkdownView>
    </div>
  );
};

export const ChatMessage: FC<ChatMessageProps> = ({ role, parts }) => (
  <article className={`flex flex-col gap-y-2 ${role === 'user' ? 'items-end' : 'items-stretch'}`}>
    {parts.map((part, index) =>
      part.kind === 'text' ? (
        <TextBubble key={`text-${String(index)}`} role={role} content={part.content} />
      ) : (
        <div key={part.id} className="w-full">
          <ToolCallCard name={part.name} input={part.input} result={part.result} status={part.status} />
        </div>
      )
    )}
  </article>
);

ChatMessage.displayName = 'ChatMessage';
