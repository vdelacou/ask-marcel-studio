import type { FC, KeyboardEvent } from 'react';
import { Button } from '../../atoms/button/index.tsx';

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
      className="flex shrink-0 items-end gap-x-2 border-t border-border-subtle p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <textarea
        rows={2}
        value={value}
        placeholder={placeholder}
        aria-label="Message"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="flex-1 resize-none rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      {isStreaming ? (
        <Button variant="danger" onClick={onCancel}>
          Stop
        </Button>
      ) : (
        <Button type="submit" disabled={!canSend}>
          Send
        </Button>
      )}
    </form>
  );
};

Composer.displayName = 'Composer';
