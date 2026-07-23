import type { FC, ReactNode } from 'react';
import { ToolCallCard } from '../tool-call-card/index.tsx';
import type { ToolCallStatus, ToolStep } from '../tool-call-card/index.tsx';
import { MarkdownView } from '../../atoms/markdown-view/index.tsx';

// A view model, not the domain Message: the design system never imports src/shared
// (rule 21). Text arrives as an already-rendered node so the page shell owns the
// markdown library (render/markdown) and this stays prop-pure.
export type ChatPart =
  | { kind: 'text'; content: ReactNode }
  | { kind: 'tool'; id: string; label: string; name: string; input: string; result?: string; status: ToolCallStatus; steps?: readonly ToolStep[] };

export type ChatMessageProps = {
  role: 'user' | 'assistant';
  parts: readonly ChatPart[];
  // What the turn cost, already said in words by the page shell. Absent on a user
  // message and on anything answered before this was recorded.
  stats?: string;
};

// The user's own words sit in a soft bubble on the right; the assistant answers as
// full-width prose with no bubble, the way a document reads, rather than a chat card.
const TextBubble: FC<{ role: 'user' | 'assistant'; content: ReactNode }> = ({ role, content }) => {
  if (role === 'user') return <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-surface-raised px-4 py-2.5 text-sm text-ink">{content}</div>;
  return (
    <div className="w-full min-w-0 text-ink">
      <MarkdownView>{content}</MarkdownView>
    </div>
  );
};

export const ChatMessage: FC<ChatMessageProps> = ({ role, parts, stats }) => (
  <article className={`flex flex-col gap-y-2 ${role === 'user' ? 'items-end' : 'items-stretch'}`}>
    {parts.map((part, index) =>
      part.kind === 'text' ? (
        <TextBubble key={`text-${String(index)}`} role={role} content={part.content} />
      ) : (
        <div key={part.id} className="w-full min-w-0">
          <ToolCallCard label={part.label} name={part.name} input={part.input} result={part.result} status={part.status} steps={part.steps} />
        </div>
      )
    )}
    {stats !== undefined && <p className="text-[11px] text-ink-faint">{stats}</p>}
  </article>
);

ChatMessage.displayName = 'ChatMessage';
