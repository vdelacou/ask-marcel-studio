/*
 * How wide the sidebar is, and whether it is open at all.
 *
 * Pure: the hook owns the pointer events and localStorage, this owns the arithmetic and
 * the reading of whatever was stored, which is untrusted like any other input.
 */
export type SidebarLayout = {
  readonly width: number;
  readonly collapsed: boolean;
};

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
// Drag this far in and the sidebar closes rather than becoming a column too narrow to
// read a title in.
const COLLAPSE_AT = 140;

export const DEFAULT_SIDEBAR: SidebarLayout = { width: 240, collapsed: false };

export const clampSidebarWidth = (raw: number): number => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(raw)));

// startWidth/startX are where the drag began, clientX where the pointer is now.
export const resolveDrag = (startWidth: number, startX: number, clientX: number): SidebarLayout => {
  const wanted = startWidth + (clientX - startX);
  // The width is kept rather than clamped away, so reopening restores the size the user
  // had chosen before they closed it.
  if (wanted < COLLAPSE_AT) return { width: clampSidebarWidth(startWidth), collapsed: true };
  return { width: clampSidebarWidth(wanted), collapsed: false };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const parseSidebarLayout = (raw: string | null): SidebarLayout => {
  if (raw === null) return DEFAULT_SIDEBAR;
  const parsed = ((): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  })();
  if (!isRecord(parsed) || typeof parsed['width'] !== 'number' || typeof parsed['collapsed'] !== 'boolean') return DEFAULT_SIDEBAR;
  return { width: clampSidebarWidth(parsed['width']), collapsed: parsed['collapsed'] };
};

export const serialiseSidebarLayout = (layout: SidebarLayout): string => JSON.stringify(layout);
