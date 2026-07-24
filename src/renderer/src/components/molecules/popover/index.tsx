import type { FC, ReactNode } from 'react';

export type PopoverPlacement = 'up-start' | 'up-end' | 'down-start' | 'down-end';

// A floating panel anchored to the nearest positioned parent, with a transparent
// full-window backdrop behind it so clicking anywhere else dismisses it. The backdrop is a
// real button because a component holds no listeners of its own (rule 21): the page shell
// owns the open state and gets the dismissal as a callback.
//
// no-drag matters: the window has no title bar, so the sidebar strip and the conversation
// header are draggable window-move surfaces. A backdrop overlaying one of them has to hand
// the clicks back, or the OS swallows them and the backdrop never fires.
export type PopoverProps = {
  placement: PopoverPlacement;
  dismissLabel: string;
  onDismiss: () => void;
  children: ReactNode;
};

const placementStyles: Record<PopoverPlacement, string> = {
  'up-start': 'bottom-full left-0 mb-2',
  'up-end': 'bottom-full right-0 mb-2',
  'down-start': 'top-full left-0 mt-1.5',
  'down-end': 'top-full right-0 mt-1.5',
};

export const Popover: FC<PopoverProps> = ({ placement, dismissLabel, onDismiss, children }) => (
  <>
    <button type="button" aria-label={dismissLabel} onClick={onDismiss} className="fixed inset-0 z-20 cursor-default [-webkit-app-region:no-drag]" />
    <div className={`absolute z-30 min-w-52 rounded-panel border border-border-subtle bg-surface p-1 shadow-lg [-webkit-app-region:no-drag] ${placementStyles[placement]}`}>
      {children}
    </div>
  </>
);

Popover.displayName = 'Popover';
