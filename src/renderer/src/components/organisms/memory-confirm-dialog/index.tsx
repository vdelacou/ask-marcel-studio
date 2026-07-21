import type { FC } from 'react';
import { Button } from '../../atoms/button/index.tsx';
import { TextInput } from '../../atoms/text-input/index.tsx';

export type MemoryQuestion = {
  readonly term: string;
  readonly kind: 'jargon' | 'team' | 'people';
  readonly quote: string;
  readonly choices: readonly string[];
  readonly enrichment?: string;
};

// One question at a time, phrased as a thing noticed rather than a form to fill in.
export type MemoryConfirmDialogProps = {
  question: MemoryQuestion;
  remaining: number;
  // The choice currently selected, or undefined while the user is writing their own.
  selected?: string;
  ownAnswer: string;
  isSaving: boolean;
  onSelect: (choice: string) => void;
  onChangeOwn: (text: string) => void;
  onAccept: () => void;
  onSkip: () => void;
  onClose: () => void;
};

const ASKS: Record<MemoryQuestion['kind'], string> = {
  jargon: 'What does this mean where you work?',
  team: 'Is this someone on your team?',
  people: 'Is this someone you work with?',
};

export const MemoryConfirmDialog: FC<MemoryConfirmDialogProps> = ({ question, remaining, selected, ownAnswer, isSaving, onSelect, onChangeOwn, onAccept, onSkip, onClose }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/20 p-6">
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Something Marcel noticed"
      className="flex w-full max-w-md flex-col gap-y-4 rounded-panel border border-border-subtle bg-surface p-5 shadow-xl"
    >
      <header className="flex flex-col gap-y-1">
        <p className="text-xs text-ink-muted">While you were working, Marcel noticed a word it did not know.</p>
        <h2 className="font-mono text-lg font-semibold text-ink">{question.term}</h2>
        <p className="text-sm text-ink-muted">{ASKS[question.kind]}</p>
      </header>

      {question.quote.length > 0 && <blockquote className="border-l-2 border-border-subtle pl-3 text-xs italic text-ink-muted">{question.quote}</blockquote>}
      {question.enrichment !== undefined && <p className="text-xs text-ink-muted">From your directory: {question.enrichment}</p>}

      <div className="flex flex-col gap-y-2">
        {question.choices.map((choice) => (
          <label
            key={choice}
            className={`flex cursor-pointer items-start gap-x-2 rounded-md border p-2.5 text-sm ${choice === selected ? 'border-accent bg-surface-raised text-ink' : 'border-border-subtle text-ink-muted'}`}
          >
            <input type="radio" name="memory-choice" checked={choice === selected} onChange={() => onSelect(choice)} className="mt-0.5 accent-accent" />
            {choice}
          </label>
        ))}
        <div className={`flex flex-col gap-y-1.5 rounded-md border p-2.5 ${selected === undefined ? 'border-accent bg-surface-raised' : 'border-border-subtle'}`}>
          <label className="flex cursor-pointer items-center gap-x-2 text-sm text-ink">
            <input type="radio" name="memory-choice" checked={selected === undefined} onChange={() => onChangeOwn(ownAnswer)} className="accent-accent" />
            In my own words
          </label>
          <TextInput value={ownAnswer} placeholder="What it means here…" aria-label="Your own wording" onChange={(event) => onChangeOwn(event.target.value)} />
        </div>
      </div>

      <footer className="flex items-center justify-between gap-x-2">
        <button type="button" onClick={onClose} className="rounded-md px-1 text-xs text-ink-muted underline-offset-4 transition hover:text-ink hover:underline">
          Not now
        </button>
        <div className="flex items-center gap-x-2">
          {remaining > 1 && <span className="text-xs text-ink-muted">{remaining - 1} more</span>}
          <Button variant="secondary" onClick={onSkip} disabled={isSaving}>
            Skip
          </Button>
          <Button onClick={onAccept} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Remember it'}
          </Button>
        </div>
      </footer>
    </section>
  </div>
);

MemoryConfirmDialog.displayName = 'MemoryConfirmDialog';
