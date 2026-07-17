import type { FC } from 'react';

export type ToolCallStatus = 'running' | 'done' | 'error';

export type ToolCallCardProps = {
  name: string;
  input: string;
  result?: string;
  status: ToolCallStatus;
};

const statusStyles: Record<ToolCallStatus, string> = {
  running: 'border-border-subtle text-ink-muted',
  done: 'border-border-subtle text-ink-muted',
  error: 'border-danger text-danger',
};

const statusLabel: Record<ToolCallStatus, string> = {
  running: 'running…',
  done: 'done',
  error: 'failed',
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

// Native <details>: the interactivity ladder's first rung. Collapsing a tool call
// needs no state, no hook and no prop plumbing (rule 21).
export const ToolCallCard: FC<ToolCallCardProps> = ({ name, input, result, status }) => (
  <details className={`group rounded-md border bg-surface ${status === 'error' ? statusStyles.error : statusStyles.done}`}>
    <summary className="flex cursor-pointer list-none items-center gap-x-2 px-3 py-2 text-xs">
      <span aria-hidden="true" className="transition group-open:rotate-90">
        ›
      </span>
      <span className="font-mono font-medium text-ink">{name}</span>
      <span className="ml-auto">{labelFor(status)}</span>
    </summary>
    <div className="flex flex-col gap-y-2 border-t border-border-subtle px-3 py-2">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-muted">{input}</pre>
      {result !== undefined && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border-subtle pt-2 font-mono text-xs text-ink-muted">{result}</pre>
      )}
    </div>
  </details>
);

ToolCallCard.displayName = 'ToolCallCard';
