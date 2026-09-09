/*
 * Folds a turn's parts into what the thread shows: a run of tool calls with nothing
 * between them is one working card, not a stack of loose rows.
 *
 * The rule lives here rather than in the card because the design system holds no logic
 * (rule 21), and because the card's own heading is a claim about time ("Marcel is
 * working") that has to stop being made the moment the last call finishes. A card sits in
 * the transcript for good; the sentence on it must age correctly.
 *
 * Pure: no react, no electron.
 */
import type { ChatPart } from '../components/molecules/chat-message/index.tsx';
import type { WorkingCardItem } from '../components/molecules/working-card/index.tsx';

// What the page shell builds before the fold: the text parts the thread already showed,
// and one entry per top-level tool call.
export type UngroupedPart = Extract<ChatPart, { kind: 'text' }> | { readonly kind: 'tool'; readonly item: WorkingCardItem };

type Fold = { readonly done: readonly ChatPart[]; readonly run: readonly WorkingCardItem[] };

const title = (run: readonly WorkingCardItem[]): string => (run.some((item) => item.status === 'running') ? 'Marcel is working' : 'What Marcel did');

// Keyed on the first call of the run: stable while the run grows, and unique because a
// tool use id is. The absent first call IS the empty run, so there is one guard here, not
// a length check and a fallback id for a state that cannot happen.
const closeRun = ({ done, run }: Fold): readonly ChatPart[] => {
  const first = run[0];
  if (first === undefined) return done;
  return [...done, { kind: 'tools', id: `run-${first.id}`, title: title(run), items: run }];
};

const step = (fold: Fold, part: UngroupedPart): Fold => (part.kind === 'tool' ? { done: fold.done, run: [...fold.run, part.item] } : { done: [...closeRun(fold), part], run: [] });

export const groupToolRuns = (parts: readonly UngroupedPart[]): readonly ChatPart[] => closeRun(parts.reduce(step, { done: [], run: [] }));
