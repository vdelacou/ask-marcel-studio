import type { FC } from 'react';
import { ToolCallCard } from '../tool-call-card/index.tsx';
import type { ToolCallStatus, ToolStep } from '../tool-call-card/index.tsx';

// One call the agent made, in the shape the row inside the card needs. Named here rather
// than in chat-message because the card is what owns the row: chat-message imports this,
// and the reverse import would be a cycle.
export type WorkingCardItem = {
  id: string;
  label: string;
  name: string;
  input: string;
  result?: string;
  status: ToolCallStatus;
  steps?: readonly ToolStep[];
};

// Props-only (rule 21). A run of tool calls, shown as one thing the agent did rather than
// a loose stack of rows: the transcript reads as question, work, answer, and the work is a
// single object the eye can skip over or open.
export type WorkingCardProps = {
  // Whether the work is under way or over, said in words. Written by the page shell
  // (lib/tool-runs), because a card left in the transcript must stop claiming to be
  // working once it has stopped.
  title: string;
  items: readonly WorkingCardItem[];
};

export const WorkingCard: FC<WorkingCardProps> = ({ title, items }) => (
  <section className="rounded-2xl border border-border-subtle bg-surface-raised py-2">
    <p className="px-3 pb-0.5 text-xs font-medium text-ink">{title}</p>
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <ToolCallCard label={item.label} name={item.name} input={item.input} result={item.result} status={item.status} steps={item.steps} />
        </li>
      ))}
    </ul>
  </section>
);

WorkingCard.displayName = 'WorkingCard';
