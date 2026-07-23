import type { FC } from 'react';
import { IconButton } from '../../atoms/icon-button/index.tsx';

const CloseIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
  </svg>
);

// A quiet strip that appears only when a newer release was found. It links the download and
// can be dismissed for the session. Logic-free: the parent decides whether to render it and
// what the links are (rule 21). The links are plain anchors, so Electron's window-open
// handler sends them to the real browser.
export type UpdateBannerProps = {
  version: string;
  downloadUrl?: string;
  releaseUrl?: string;
  onDismiss: () => void;
};

export const UpdateBanner: FC<UpdateBannerProps> = ({ version, downloadUrl, releaseUrl, onDismiss }) => (
  <div role="status" className="flex shrink-0 items-center gap-x-3 border-b border-border-subtle bg-surface-raised px-4 py-2 text-xs text-ink [-webkit-app-region:no-drag]">
    <span className="flex-1">
      Version {version} is available.{' '}
      {downloadUrl !== undefined && (
        <a href={downloadUrl} target="_blank" rel="noreferrer" className="font-medium text-accent underline underline-offset-2">
          Download
        </a>
      )}
      {downloadUrl === undefined && releaseUrl !== undefined && (
        <a href={releaseUrl} target="_blank" rel="noreferrer" className="font-medium text-accent underline underline-offset-2">
          See the release
        </a>
      )}
    </span>
    <IconButton label="Dismiss" onClick={onDismiss}>
      <CloseIcon />
    </IconButton>
  </div>
);

UpdateBanner.displayName = 'UpdateBanner';
