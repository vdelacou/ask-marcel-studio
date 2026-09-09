import type { FC, ReactNode } from 'react';
import { WorkingCard } from '../working-card/index.tsx';
import type { WorkingCardItem } from '../working-card/index.tsx';
import { MarkdownView } from '../../atoms/markdown-view/index.tsx';

// A view model, not the domain Message: the design system never imports src/shared
// (rule 21). Text arrives as an already-rendered node so the page shell owns the
// markdown library (render/markdown) and this stays prop-pure. Tool calls arrive already
// folded into runs (lib/tool-runs): one card per run, never a loose row.
export type ChatPart = { kind: 'text'; content: ReactNode } | { kind: 'tools'; id: string; title: string; items: readonly WorkingCardItem[] };

export type ChatMessageProps = {
  role: 'user' | 'assistant';
  parts: readonly ChatPart[];
  // What the turn cost, already said in words by the page shell. Absent on a user
  // message and on anything answered before this was recorded.
  stats?: string;
};

// The user's own words sit in a filled bubble on the right, the answer in a bordered card
// on the left: two surfaces rather than one, so a glance down the thread tells the question
// from the answer before either is read. The filled bubble is the warm ink, not black: the
// paper-and-clay palette stands, and only the contrast is borrowed from the design.
// `spaced` widens the gap above the answer that follows a run of tool calls: the list's
// own tight rows read as one activity log, and the answer needs to visibly end it, not
// just be the next thing in the same rhythm.
const TextBubble: FC<{ role: 'user' | 'assistant'; content: ReactNode; spaced: boolean }> = ({ role, content, spaced }) => {
  if (role === 'user') return <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-ink px-4 py-2.5 text-sm text-surface">{content}</div>;
  return (
    <div className={`w-full min-w-0 rounded-2xl border border-border-subtle bg-surface px-4 py-3 text-ink ${spaced ? 'mt-4' : ''}`}>
      <MarkdownView>{content}</MarkdownView>
    </div>
  );
};

export const ChatMessage: FC<ChatMessageProps> = ({ role, parts, stats }) => (
  <article className={`flex flex-col gap-y-2 ${role === 'user' ? 'items-end' : 'items-stretch'}`}>
    {parts.map((part, index) =>
      part.kind === 'text' ? (
        <TextBubble key={`text-${String(index)}`} role={role} content={part.content} spaced={parts[index - 1]?.kind === 'tools'} />
      ) : (
        <div key={part.id} className="w-full min-w-0">
          <WorkingCard title={part.title} items={part.items} />
        </div>
      )
    )}
    {stats !== undefined && <p className="text-[11px] text-ink-faint">{stats}</p>}
  </article>
);

ChatMessage.displayName = 'ChatMessage';
