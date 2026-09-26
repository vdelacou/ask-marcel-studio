import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { Select } from '../../atoms/select/index.tsx';
import { TextArea } from '../../atoms/text-area/index.tsx';

export type MemoryReviewKind = 'jargon' | 'team' | 'people';

// One thing Marcel noticed, waiting for an answer. Props-only (rule 21): the review page
// owns every draft answer and hands this row the one that belongs to it.
//
// The meaning is the text itself, Marcel's suggestion until the user rewords it: across real
// suggestions Marcel almost never offers a second wording, so a choice between wordings was a
// radio group with one option in it. The wordings it does offer sit under the text and fill it
// when picked.
export type MemoryReviewRowProps = {
  term: string;
  kind: MemoryReviewKind;
  quote: string;
  enrichment?: string;
  // The title of the conversation it was heard in, while that conversation still exists.
  source?: string;
  meaning: string;
  alternatives: readonly string[];
  canRemember: boolean;
  isSaving: boolean;
  onChangeMeaning: (text: string) => void;
  onChoose: (wording: string) => void;
  onChangeTerm: (text: string) => void;
  // One of the three lists, as the select names it; the page reads it back into a note name.
  onChangeKind: (kind: string) => void;
  onOpenSource: () => void;
  onRemember: () => void;
  onSkip: () => void;
};

// Where an answer would be filed, named the way the lists name themselves.
const KIND_OPTIONS: readonly { value: MemoryReviewKind; label: string }[] = [
  { value: 'jargon', label: 'Words we use' },
  { value: 'team', label: 'My team' },
  { value: 'people', label: 'Other people' },
];

export const MemoryReviewRow: FC<MemoryReviewRowProps> = ({
  term,
  kind,
  quote,
  enrichment,
  source,
  meaning,
  alternatives,
  canRemember,
  isSaving,
  onChangeMeaning,
  onChoose,
  onChangeTerm,
  onChangeKind,
  onOpenSource,
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
      <label className="flex shrink-0 items-center gap-x-1.5 text-xs text-ink-muted">
        File under
        <Select options={KIND_OPTIONS} value={kind} onChange={(event) => onChangeKind(event.target.value)} />
      </label>
    </header>

    {quote.length > 0 && <blockquote className="border-l-2 border-border-subtle pl-3 text-xs italic text-ink-muted">{quote}</blockquote>}
    {enrichment !== undefined && <p className="text-xs text-ink-muted">From your directory: {enrichment}</p>}
    {source !== undefined && (
      <p className="text-xs text-ink-muted">
        Heard in{' '}
        <button
          type="button"
          onClick={onOpenSource}
          aria-label={`Open ${source}`}
          className="rounded font-medium text-ink underline underline-offset-2 transition hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {source}
        </button>
      </p>
    )}

    <TextArea
      size="compact"
      value={meaning}
      placeholder="What it means here…"
      aria-label="What it means where you work"
      onChange={(event) => onChangeMeaning(event.target.value)}
    />

    {alternatives.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <span>Or:</span>
        {alternatives.map((wording) => (
          <button
            key={wording}
            type="button"
            onClick={() => onChoose(wording)}
            className="rounded-full border border-border-subtle px-2.5 py-0.5 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {wording}
          </button>
        ))}
      </div>
    )}

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
