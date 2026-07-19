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

const bubble = 'max-w-[85%] break-words rounded-panel px-3 py-2 text-sm';

// The user's own text is shown verbatim (whitespace preserved); the assistant's is
// markdown. Split out so the two live side by side without nesting ternaries.
const TextBubble: FC<{ role: 'user' | 'assistant'; content: ReactNode }> = ({ role, content }) => {
  if (role === 'user') return <div className={`${bubble} whitespace-pre-wrap bg-accent text-accent-ink`}>{content}</div>;
  return (
    <div className={`${bubble} bg-surface-raised text-ink`}>
      <MarkdownView>{content}</MarkdownView>
    </div>
  );
};

export const ChatMessage: FC<ChatMessageProps> = ({ role, parts }) => (
  <article className={`flex flex-col gap-y-2 ${role === 'user' ? 'items-end' : 'items-start'}`}>
    {parts.map((part, index) =>
      part.kind === 'text' ? (
        <TextBubble key={`text-${String(index)}`} role={role} content={part.content} />
      ) : (
        <div key={part.id} className="w-full max-w-[85%]">
          <ToolCallCard name={part.name} input={part.input} result={part.result} status={part.status} />
        </div>
      )
    )}
  </article>
);

ChatMessage.displayName = 'ChatMessage';
