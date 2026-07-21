import type { FC } from 'react';

// A saved/error banner. A typed variant, not a free-form className, so the app cannot
// style it (rule 22).
export type PanelNoticeTone = 'saved' | 'error';

export type PanelNoticeProps = {
  tone: PanelNoticeTone;
  message: string;
};

const tones: Record<PanelNoticeTone, string> = {
  saved: 'border-success text-success',
  error: 'border-danger text-danger',
};

export const PanelNotice: FC<PanelNoticeProps> = ({ tone, message }) => (
  <p role="status" className={`self-end rounded-md border px-2.5 py-1.5 text-xs ${tone === 'saved' ? tones.saved : tones.error}`}>
    {message}
  </p>
);

PanelNotice.displayName = 'PanelNotice';
