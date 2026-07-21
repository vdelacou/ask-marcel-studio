import type { DragEvent, FC, ReactNode } from 'react';

// Wraps the chat column so a file can be dropped anywhere on it, not just on the
// composer. Layout and the overlay only; the page shell owns the drag counting and
// decides when this is active (rule 21).
export type DropTargetProps = {
  isActive: boolean;
  hint: string;
  children: ReactNode;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

export const DropTarget: FC<DropTargetProps> = ({ isActive, hint, children, onDragEnter, onDragOver, onDragLeave, onDrop }) => (
  <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
    {children}
    {isActive && (
      <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-panel border-2 border-dashed border-accent bg-surface/85 text-sm text-ink">
        {hint}
      </div>
    )}
  </div>
);

DropTarget.displayName = 'DropTarget';
