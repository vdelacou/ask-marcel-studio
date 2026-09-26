import type { FC } from 'react';
import { MemoryReviewRow } from '../../molecules/memory-review-row/index.tsx';
import type { MemoryReviewKind } from '../../molecules/memory-review-row/index.tsx';
import { ActionNotice } from '../../molecules/action-notice/index.tsx';
import type { ActionNoticeProps } from '../../molecules/action-notice/index.tsx';
import { PanelNotice } from '../../molecules/panel-notice/index.tsx';

export type MemoryReviewItem = {
  readonly id: string;
  readonly term: string;
  readonly kind: MemoryReviewKind;
  readonly quote: string;
  readonly enrichment?: string;
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
  onChoose: (id: string, wording: string) => void;
  onChangeMeaning: (id: string, text: string) => void;
  onChangeTerm: (id: string, text: string) => void;
  onChangeKind: (id: string, kind: string) => void;
  onRemember: (id: string) => void;
  onSkip: (id: string) => void;
};

export const MemoryReviewPanel: FC<MemoryReviewPanelProps> = ({ items, error, notice, onChoose, onChangeMeaning, onChangeTerm, onChangeKind, onRemember, onSkip }) => (
  <section className="flex flex-col gap-y-6">
    <header className="flex flex-col gap-y-1">
      <h2 className="text-lg font-semibold tracking-tight text-ink">What Marcel noticed</h2>
      <p className="text-sm text-ink-muted">
        Words and names it did not know, waiting here until you say what they mean. Nothing is remembered until you say so, and nothing here interrupts you while you work.
      </p>
    </header>

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
            meaning={item.meaning}
            alternatives={item.alternatives}
            canRemember={item.canRemember}
            isSaving={item.isSaving}
            onChangeMeaning={(text) => onChangeMeaning(item.id, text)}
            onChoose={(wording) => onChoose(item.id, wording)}
            onChangeTerm={(text) => onChangeTerm(item.id, text)}
            onChangeKind={(kind) => onChangeKind(item.id, kind)}
            onRemember={() => onRemember(item.id)}
            onSkip={() => onSkip(item.id)}
          />
        ))}
      </div>
    )}
  </section>
);

MemoryReviewPanel.displayName = 'MemoryReviewPanel';
