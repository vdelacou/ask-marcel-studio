import type { FC } from 'react';
import { MemoryReviewRow } from '../../molecules/memory-review-row/index.tsx';
import type { MemoryReviewKind } from '../../molecules/memory-review-row/index.tsx';
import { ActionNotice } from '../../molecules/action-notice/index.tsx';
import type { ActionNoticeProps } from '../../molecules/action-notice/index.tsx';
import { PanelNotice } from '../../molecules/panel-notice/index.tsx';
import { Button } from '../../atoms/button/index.tsx';

export type MemoryReviewItem = {
  readonly id: string;
  readonly term: string;
  readonly kind: MemoryReviewKind;
  readonly quote: string;
  readonly enrichment?: string;
  readonly source?: string;
  readonly meaning: string;
  readonly alternatives: readonly string[];
  readonly canRemember: boolean;
  readonly isSaving: boolean;
};

// The whole surface: everything Marcel noticed and has not been told about yet. Props-only
// (rule 21), and it builds its own rows the way the sidebar builds its conversation rows,
// so no Tailwind leaves this folder (rule 22).
export type MemoryReviewPanelProps = {
  items: readonly MemoryReviewItem[];
  error?: string;
  // What was just done that can still be taken back: the last skip.
  notice?: Omit<ActionNoticeProps, 'tone'>;
  // How the cards work from the keyboard, said once under the heading while there are cards.
  hint?: string;
  // Remember all: the button while there are cards to take, and the question it asks first.
  bulk?: { readonly label: string; readonly onStart: () => void };
  confirm?: { readonly message: string; readonly confirmLabel: string; readonly cancelLabel: string; readonly onConfirm: () => void; readonly onCancel: () => void };
  onChoose: (id: string, wording: string) => void;
  onChangeMeaning: (id: string, text: string) => void;
  onChangeTerm: (id: string, text: string) => void;
  onChangeKind: (id: string, kind: string) => void;
  onOpenSource: (id: string) => void;
  onMove: (id: string, step: number) => void;
  onRemember: (id: string) => void;
  onSkip: (id: string) => void;
};

export const MemoryReviewPanel: FC<MemoryReviewPanelProps> = ({
  items,
  error,
  notice,
  hint,
  bulk,
  confirm,
  onChoose,
  onChangeMeaning,
  onChangeTerm,
  onChangeKind,
  onOpenSource,
  onMove,
  onRemember,
  onSkip,
}) => (
  <section className="flex flex-col gap-y-6">
    <header className="flex items-start justify-between gap-x-4">
      <div className="flex flex-col gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-ink">To review</h2>
        <p className="text-sm text-ink-muted">
          Words and names Marcel noticed in your conversations and did not know, waiting here until you say what they mean. Nothing is remembered until you say so, and nothing here
          interrupts you while you work.
        </p>
        {hint !== undefined && items.length > 0 && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
      {bulk !== undefined && (
        <Button variant="secondary" onClick={bulk.onStart}>
          {bulk.label}
        </Button>
      )}
    </header>

    {confirm !== undefined && (
      <div role="alert" className="flex items-center gap-x-3 rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-ink">
        <span className="min-w-0 flex-1">{confirm.message}</span>
        <Button variant="secondary" onClick={confirm.onCancel}>
          {confirm.cancelLabel}
        </Button>
        <Button onClick={confirm.onConfirm}>{confirm.confirmLabel}</Button>
      </div>
    )}

    {error !== undefined && <PanelNotice tone="error" message={error} />}
    {notice !== undefined && <ActionNotice tone="neutral" message={notice.message} {...(notice.action === undefined ? {} : { action: notice.action })} />}

    {items.length === 0 ? (
      <p className="rounded-panel border border-dashed border-border-subtle p-6 text-center text-sm text-ink-muted">
        Nothing waiting. Marcel adds to this list as it comes across words you use that it does not know.
      </p>
    ) : (
      <div className="flex flex-col gap-y-3">
        {items.map((item) => (
          <MemoryReviewRow
            key={item.id}
            term={item.term}
            kind={item.kind}
            quote={item.quote}
            {...(item.enrichment === undefined ? {} : { enrichment: item.enrichment })}
            {...(item.source === undefined ? {} : { source: item.source })}
            meaning={item.meaning}
            alternatives={item.alternatives}
            canRemember={item.canRemember}
            isSaving={item.isSaving}
            onChangeMeaning={(text) => onChangeMeaning(item.id, text)}
            onChoose={(wording) => onChoose(item.id, wording)}
            onChangeTerm={(text) => onChangeTerm(item.id, text)}
            onChangeKind={(kind) => onChangeKind(item.id, kind)}
            onOpenSource={() => onOpenSource(item.id)}
            onMove={(step) => onMove(item.id, step)}
            onRemember={() => onRemember(item.id)}
            onSkip={() => onSkip(item.id)}
          />
        ))}
      </div>
    )}
  </section>
);

MemoryReviewPanel.displayName = 'MemoryReviewPanel';
