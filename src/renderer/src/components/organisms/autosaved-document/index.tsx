import type { FC, ReactNode } from 'react';

// A document saved as it is typed: the editor, and a quiet line saying where the saving is.
// No Save and no Cancel. Props-only (rule 21): the editor arrives mounted (it owns a
// third-party library and a ref), and the status words come from the page.
export type AutosavedDocumentTone = 'quiet' | 'error';

export type AutosavedDocumentProps = {
  editor: ReactNode;
  // Shown above an empty document, where a blank editor would say nothing about what belongs in it.
  emptyHint?: string;
  status: string;
  tone: AutosavedDocumentTone;
};

export const AutosavedDocument: FC<AutosavedDocumentProps> = ({ editor, emptyHint, status, tone }) => (
  <div className="flex flex-col gap-y-3">
    {emptyHint !== undefined && <p className="text-sm text-ink-muted">{emptyHint}</p>}
    <div className="rounded-panel border border-border-subtle p-2">{editor}</div>
    <p role="status" className={`self-end text-xs ${tone === 'error' ? 'text-danger' : 'text-ink-faint'}`}>
      {status}
    </p>
  </div>
);

AutosavedDocument.displayName = 'AutosavedDocument';
