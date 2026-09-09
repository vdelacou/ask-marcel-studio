import type { FC } from 'react';
import { Spinner } from '../../atoms/spinner/index.tsx';

export type ToolCallStatus = 'running' | 'done' | 'error';

// One thing a delegated helper did while this tool call was running. The label is
// already a sentence, and input/result arrive pre-rendered as strings, both written
// by the page shell (lib/tool-label, JSON pretty-print).
export type ToolStep = {
  id: string;
  label: string;
  name: string;
  status: ToolCallStatus;
  input: string;
  result?: string;
};

export type ToolCallCardProps = {
  // What the agent is doing, in words. The tool's own name rides along beside it for
  // anyone who wants it, but it is not what the card leads with.
  label: string;
  name: string;
  input: string;
  result?: string;
  status: ToolCallStatus;
  steps?: readonly ToolStep[];
};

const statusLabel: Record<ToolCallStatus, string> = {
  running: 'Working on it…',
  done: 'Done',
  error: "Didn't work",
};

const stepDot: Record<ToolCallStatus, string> = {
  running: 'bg-accent animate-pulse',
  done: 'bg-success',
  error: 'bg-danger',
};

// Looked up via switch, not statusLabel[status]: a bracket lookup on a prop is the
// object-injection shape the standard's switch idiom avoids.
const labelFor = (status: ToolCallStatus): string => {
  switch (status) {
    case 'running':
      return statusLabel.running;
    case 'error':
      return statusLabel.error;
    default:
      return statusLabel.done;
  }
};

const dotFor = (status: ToolCallStatus): string => {
  switch (status) {
    case 'running':
      return stepDot.running;
    case 'error':
      return stepDot.error;
    default:
      return stepDot.done;
  }
};

// Setup the agent does for itself, the same every time and never about the user's own
// data: it recedes so the rows that actually touch something (a real command, a
// delegated agent) read as what matters, by contrast rather than decoration.
const SETUP_TOOLS: readonly string[] = ['Skill', 'Read'];

const isSetupStep = (name: string): boolean => SETUP_TOOLS.includes(name);

const labelTone = (name: string): string => (isSetupStep(name) ? 'text-ink-muted' : 'font-medium text-ink');

// A nested step never carried the top-level's bold weight to begin with (it is already
// one tier down); de-emphasis here only has the muted color to give.
const stepLabelTone = (name: string): string => (isSetupStep(name) ? 'text-ink-muted' : 'text-ink');

// While a delegated job runs, the row says what the helper is doing right now: that is
// the only view of it the user has. Every other state is carried by the glyph alone, so
// the run reads as a checklist rather than a column of repeated words.
const currentStep = (status: ToolCallStatus, steps: readonly ToolStep[]): string | undefined => {
  const current = steps.at(-1);
  if (status !== 'running' || current === undefined || current.status !== 'running') return undefined;
  return current.label;
};

const CheckIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
  </svg>
);

const CrossIcon: FC = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3" aria-hidden="true">
    <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
  </svg>
);

// The row's status as a glyph, with the words kept for a screen reader: a tick for a call
// that landed, a cross for one that did not, the spinner for the one under way. The words
// used to be printed at the end of every row, which made a finished run a column of
// "Done".
const StatusGlyph: FC<{ status: ToolCallStatus }> = ({ status }) => {
  if (status === 'running')
    return (
      <span className="shrink-0">
        <Spinner label={statusLabel.running} isLabelHidden />
      </span>
    );
  return (
    <span className={`shrink-0 ${status === 'error' ? 'text-danger' : 'text-ink-faint'}`}>
      {status === 'error' ? <CrossIcon /> : <CheckIcon />}
      <span className="sr-only">{labelFor(status)}</span>
    </span>
  );
};

// Native <details>: the interactivity ladder's first rung. Collapsing a tool call
// needs no state, no hook and no prop plumbing (rule 21).
//
// One row of a working card, which owns the separation between rows: hence no border of
// its own. The chevron stays, quiet, at the right: the design this follows has plain
// checklist rows, and a row that opens onto the call's arguments and output needs to say
// somewhere that it opens.
export const ToolCallCard: FC<ToolCallCardProps> = ({ label, name, input, result, status, steps = [] }) => (
  <details className="group">
    <summary className="flex cursor-pointer list-none items-center gap-x-2 px-3 py-1.5 text-xs">
      <StatusGlyph status={status} />
      <span className={`min-w-0 truncate ${labelTone(name)}`}>{label}</span>
      <span className="shrink-0 font-mono text-[10px] text-ink-muted">{name}</span>
      <span className="ml-auto flex shrink-0 items-center gap-x-2 pl-2 text-ink-muted">
        {currentStep(status, steps) !== undefined && <span className="max-w-64 truncate">{currentStep(status, steps)}</span>}
        <span aria-hidden="true" className="transition group-open:rotate-90">
          ›
        </span>
      </span>
    </summary>
    <div className="flex flex-col gap-y-2 border-t border-border-subtle px-3 py-2">
      {steps.length > 0 && (
        <ul className="flex flex-col gap-y-1 pb-1">
          {steps.map((step) => (
            <li key={step.id}>
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-x-2 text-xs">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotFor(step.status)}`} />
                  <span className={`min-w-0 truncate ${stepLabelTone(step.name)}`}>{step.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-muted">{step.name}</span>
                </summary>
                <div className="ml-3.5 mt-1 flex flex-col gap-y-1 border-l border-border-subtle pl-2.5">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-muted">{step.input}</pre>
                  {step.result !== undefined && (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-border-subtle pt-1 font-mono text-xs text-ink-muted">{step.result}</pre>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-muted">{input}</pre>
      {/* Deliberately uncapped, like the input above it. A max-height here put long output
          in a 16rem box with its own scrollbar, which left the thread almost nothing to
          scroll: the page stopped after a few pixels and the text only moved while the
          pointer sat inside that small pane. The card is collapsed until asked, so the
          height it takes when open is the height the reader wanted. */}
      {result !== undefined && <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-border-subtle pt-2 font-mono text-xs text-ink-muted">{result}</pre>}
    </div>
  </details>
);

ToolCallCard.displayName = 'ToolCallCard';
