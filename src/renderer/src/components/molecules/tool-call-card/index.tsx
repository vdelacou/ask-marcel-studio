import type { FC } from 'react';

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

// While a delegated job runs, the collapsed card says what the helper is doing right
// now rather than a generic "working": that is the only view of it the user has.
const summaryStatus = (status: ToolCallStatus, steps: readonly ToolStep[]): string => {
  const current = steps.at(-1);
  if (status !== 'running' || current === undefined || current.status !== 'running') return labelFor(status);
  return current.label;
};

// Native <details>: the interactivity ladder's first rung. Collapsing a tool call
// needs no state, no hook and no prop plumbing (rule 21).
export const ToolCallCard: FC<ToolCallCardProps> = ({ label, name, input, result, status, steps = [] }) => (
  <details className="group border-b border-border-subtle">
    <summary className="flex cursor-pointer list-none items-center gap-x-2 px-3 py-2 text-xs">
      <span aria-hidden="true" className="transition group-open:rotate-90">
        ›
      </span>
      <span className={`min-w-0 truncate ${labelTone(name)}`}>{label}</span>
      <span className="shrink-0 font-mono text-[10px] text-ink-muted">{name}</span>
      <span className="ml-auto shrink-0 pl-2 text-ink-muted">{summaryStatus(status, steps)}</span>
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
