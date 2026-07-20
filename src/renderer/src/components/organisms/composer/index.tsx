import type { FC, KeyboardEvent } from 'react';

export type ComposerProps = {
  value: string;
  isStreaming: boolean;
  canSend: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
};

export const Composer: FC<ComposerProps> = ({ value, isStreaming, canSend, placeholder, onChange, onSend, onCancel }) => {
  // Enter sends, shift+enter newlines. A keydown handler on a real textarea, not a
  // contenteditable div: the native element already does selection, IME and undo.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (canSend) onSend();
  };

  return (
    <form
      className="shrink-0 px-6 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-end gap-x-2 rounded-2xl border border-border-subtle bg-surface px-3 py-2 shadow-sm transition focus-within:border-ink-muted">
        <textarea
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          // field-sizing lets the box start at one line and grow with the text, so the
          // send icon sits right next to what was typed instead of floating below it.
          className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm text-ink placeholder:text-ink-muted [field-sizing:content] focus:outline-none"
        />
        {isStreaming ? (
          <button type="button" onClick={onCancel} aria-label="Stop" className="shrink-0 rounded-lg p-2 text-ink-muted transition hover:text-ink">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <rect x="7.5" y="7.5" width="9" height="9" rx="2.5" />
            </svg>
          </button>
        ) : (
          <button type="submit" disabled={!canSend} aria-label="Send" className="shrink-0 rounded-lg p-2 text-ink-muted transition hover:text-ink disabled:opacity-40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <polyline points="9 10 4 15 9 20" />
              <path d="M20 4v7a4 4 0 0 1-4 4H4" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
};

Composer.displayName = 'Composer';
