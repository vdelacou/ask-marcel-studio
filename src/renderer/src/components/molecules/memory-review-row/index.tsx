import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';

export type MemoryReviewKind = 'jargon' | 'team' | 'people';

// One thing Marcel noticed, waiting for an answer. Props-only (rule 21): the review page
// owns every draft answer and hands this row the one that belongs to it.
export type MemoryReviewRowProps = {
  // The radio group is per row: several rows are on screen at once, and one shared group
  // name would make picking a wording here clear the wording picked three rows down.
  id: string;
  term: string;
  kind: MemoryReviewKind;
  quote: string;
  enrichment?: string;
  choices: readonly string[];
  // The wording picked, or undefined while the user is writing their own.
  selected?: string;
  own: string;
  canRemember: boolean;
  isSaving: boolean;
  onChoose: (choice: string) => void;
  onChangeOwn: (text: string) => void;
  onChangeTerm: (text: string) => void;
  onRemember: () => void;
  onSkip: () => void;
};

// Where an answer would be filed. The same three words the notes use in settings, so the
// row and the note it lands in are recognisably the same thing.
const KINDS: Record<MemoryReviewKind, string> = {
  jargon: 'words we use',
  team: 'my team',
  people: 'people I work with',
};

export const MemoryReviewRow: FC<MemoryReviewRowProps> = ({
  id,
  term,
  kind,
  quote,
  enrichment,
  choices,
  selected,
  own,
  canRemember,
  isSaving,
  onChoose,
  onChangeOwn,
  onChangeTerm,
  onRemember,
  onSkip,
}) => (
  <article className="flex flex-col gap-y-3 rounded-panel border border-border-subtle bg-surface-raised p-4">
    {/* The word itself is a field, not a heading: Marcel hears it inside a sentence and
        sometimes hears it slightly wrong (a capital, a plural, half a name), and correcting
        it here is quicker than skipping the row and editing the note by hand. It is styled
        as the heading it replaces, so the row still reads as a card rather than a form. */}
    <header className="flex items-center gap-x-2">
      <input
        value={term}
        aria-label="The word to remember"
        onChange={(event) => onChangeTerm(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-sm font-semibold text-ink hover:border-border-subtle focus-visible:border-border-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{KINDS[kind]}</span>
    </header>

    {quote.length > 0 && <blockquote className="border-l-2 border-border-subtle pl-3 text-xs italic text-ink-muted">{quote}</blockquote>}
    {enrichment !== undefined && <p className="text-xs text-ink-muted">From your directory: {enrichment}</p>}

    <fieldset className="flex flex-col gap-y-2">
      <legend className="sr-only">What this word means where you work</legend>
      {choices.map((choice) => (
        <label
          key={choice}
          className={`flex cursor-pointer items-start gap-x-2 rounded-md border p-2.5 text-sm ${choice === selected ? 'border-accent bg-surface text-ink' : 'border-border-subtle text-ink-muted'}`}
        >
          <input type="radio" name={`memory-${id}`} checked={choice === selected} onChange={() => onChoose(choice)} className="mt-0.5 accent-accent" />
          {choice}
        </label>
      ))}
      <div className={`flex flex-col gap-y-1.5 rounded-md border p-2.5 ${selected === undefined ? 'border-accent bg-surface' : 'border-border-subtle'}`}>
        <label className="flex cursor-pointer items-center gap-x-2 text-sm text-ink">
          <input type="radio" name={`memory-${id}`} checked={selected === undefined} onChange={() => onChangeOwn(own)} className="accent-accent" />
          In my own words
        </label>
        <TextInput value={own} placeholder="What it means here…" aria-label="What it means, in your own words" onChange={(event) => onChangeOwn(event.target.value)} />
      </div>
    </fieldset>

    <footer className="flex items-center justify-end gap-x-2">
      <Button variant="secondary" onClick={onSkip} disabled={isSaving}>
        Skip
      </Button>
      {/* Refused rather than absent: a row with nothing written still shows the button it
          would use, so the fix is obvious. */}
      <Button onClick={onRemember} disabled={isSaving || !canRemember}>
        {isSaving ? 'Saving…' : 'Remember it'}
      </Button>
    </footer>
  </article>
);

MemoryReviewRow.displayName = 'MemoryReviewRow';
