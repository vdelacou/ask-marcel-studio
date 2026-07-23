import type { FC, ReactNode } from 'react';

// Props-only (rule 21). A centered modal over a dimmed backdrop; the page shell owns the
// open state and the Escape key (a component holds no hooks). The backdrop is a real
// button so clicking outside closes without a static-div click handler.
export type SettingsOverlayProps = {
  onClose: () => void;
  children: ReactNode;
};

export const SettingsOverlay: FC<SettingsOverlayProps> = ({ onClose, children }) => (
  <div className="fixed inset-0 z-40 flex items-center justify-center p-6 sm:p-10">
    <button type="button" aria-label="Close settings" onClick={onClose} className="absolute inset-0 cursor-default bg-black/30" />
    {/* Takes the window it is given, less the padding above. The sheet itself is a frame,
        so it has no cap of its own: the column inside it stops at the reading width, which
        is where the near-empty-sheet problem actually lives. Capping the frame instead
        left settings as a fixed box in the middle of a maximised window. */}
    <div role="dialog" aria-modal="true" aria-label="Settings" className="relative z-10 flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close settings"
        className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      {/* flex, not a plain block: the settings layout inside claims flex-1 to fill this
          space, and flex-1 does nothing to the child of a block box. Without it the
          layout was as tall as its content, its own scroll container never had a height
          to scroll within, and everything past the fold was simply clipped. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  </div>
);

SettingsOverlay.displayName = 'SettingsOverlay';
