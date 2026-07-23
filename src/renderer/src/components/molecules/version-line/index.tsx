import type { FC } from 'react';

// The running version, tucked under the settings nav. Says nothing more than the number,
// plus a hint when a newer build exists. Props-only (rule 21): the page reads the status.
export type VersionLineProps = {
  version: string;
  updateAvailable: boolean;
};

export const VersionLine: FC<VersionLineProps> = ({ version, updateAvailable }) => (
  <p className="px-1 text-xs text-ink-faint">
    Version {version}
    {updateAvailable && <span className="text-accent"> · update available</span>}
  </p>
);

VersionLine.displayName = 'VersionLine';
