import type { FC, KeyboardEvent } from 'react';
import { AttachmentChip } from '../../molecules/attachment-chip/index.tsx';
import { ComposerMenu } from '../../molecules/composer-menu/index.tsx';
import type { ComposerMenuItem } from '../../molecules/composer-menu/index.tsx';
import { SuggestPopover } from '../../molecules/suggest-popover/index.tsx';
import type { SuggestItem } from '../../molecules/suggest-popover/index.tsx';

export type ComposerAttachment = { id: string; name: string };

export type ComposerProps = {
  value: string;
  isStreaming: boolean;
  canSend: boolean;
  placeholder: string;
  attachments: readonly ComposerAttachment[];
  menuOpen: boolean;
  menuItems: readonly ComposerMenuItem[];
  // Open only while a "/" name is being typed; the page shell decides (lib/slash-suggest).
  suggestions: readonly SuggestItem[];
  activeSuggestion: number;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onRemoveAttachment: (id: string) => void;
  onToggleMenu: () => void;
  onPickMenu: (id: string) => void;
  onPickSuggestion: (id: string) => void;
  onMoveSuggestion: (delta: 1 | -1) => void;
  onHoverSuggestion: (index: number) => void;
  onDismissSuggestions: () => void;
};

export const Composer: FC<ComposerProps> = ({
  value,
  isStreaming,
  canSend,
  placeholder,
  attachments,
  menuOpen,
  menuItems,
  suggestions,
  activeSuggestion,
  onChange,
  onSend,
  onCancel,
  onRemoveAttachment,
  onToggleMenu,
  onPickMenu,
  onPickSuggestion,
  onMoveSuggestion,
  onHoverSuggestion,
  onDismissSuggestions,
}) => {
  const isSuggesting = suggestions.length > 0;

  // While the skill list is open the arrows and Enter drive it; otherwise Enter sends
  // and shift+enter newlines. A keydown handler on a real textarea, not a
  // contenteditable div: the native element already does selection, IME and undo.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isSuggesting) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        onMoveSuggestion(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        onPickSuggestion(suggestions[activeSuggestion]?.id ?? '');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismissSuggestions();
        return;
      }
    }
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
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-y-1.5 rounded-2xl border border-border-subtle bg-surface px-3 py-2 shadow-sm transition focus-within:border-ink-muted">
        {menuOpen && <ComposerMenu items={menuItems} onPick={onPickMenu} />}
        {isSuggesting && <SuggestPopover items={suggestions} activeIndex={activeSuggestion} onPick={onPickSuggestion} onHover={onHoverSuggestion} />}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1 pt-1">
            {attachments.map((attachment) => (
              <AttachmentChip key={attachment.id} name={attachment.name} onRemove={() => onRemoveAttachment(attachment.id)} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-x-2">
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label="Attach a file"
            aria-expanded={menuOpen}
            className="shrink-0 rounded-lg p-2 text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <textarea
            rows={1}
            value={value}
            placeholder={placeholder}
            aria-label="Message"
            aria-autocomplete="list"
            aria-expanded={isSuggesting}
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
      </div>
    </form>
  );
};

Composer.displayName = 'Composer';
