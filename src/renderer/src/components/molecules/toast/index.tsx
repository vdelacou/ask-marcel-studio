import type { FC } from 'react';

// Props-only (rule 21). A dismissible alert for failures that have no inline home:
// a rename or delete that the store rejected. The turn-level error still shows in the
// thread; this is for the sidebar's actions. Owns its own fixed placement so the page
// shell stays class-free (rule 22).
export type ToastProps = {
  message: string;
  onDismiss: () => void;
};

export const Toast: FC<ToastProps> = ({ message, onDismiss }) => (
  <div
    role="alert"
    className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-x-3 rounded-panel border border-danger bg-danger-wash px-4 py-3 text-sm text-danger shadow-lg"
  >
    <span className="flex-1">{message}</span>
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss"
      className="shrink-0 rounded px-1 leading-none transition hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
    >
      ×
    </button>
  </div>
);

Toast.displayName = 'Toast';
