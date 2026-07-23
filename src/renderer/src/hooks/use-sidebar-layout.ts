/*
 * The sidebar's width and open state.
 *
 * Wiring only: the arithmetic and the parsing are in the pure lib/sidebar-layout. This
 * owns the pointer listeners a drag needs (they belong on the window, because the pointer
 * leaves the 6px handle immediately) and the one line of localStorage.
 *
 * localStorage rather than settings.json: this is a per-window presentation preference
 * with no main-process reader, and it has to be known at first paint. A settings round
 * trip would show the default width for a frame and then jump.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SIDEBAR, parseSidebarLayout, resolveDrag, serialiseSidebarLayout } from '../lib/sidebar-layout.ts';
import type { SidebarLayout } from '../lib/sidebar-layout.ts';

const STORAGE_KEY = 'studio.sidebar.layout';

export type SidebarLayoutController = {
  readonly width: number;
  readonly isCollapsed: boolean;
  readonly startResize: (clientX: number) => void;
  readonly toggleCollapse: () => void;
};

export const useSidebarLayout = (): SidebarLayoutController => {
  const [layout, setLayout] = useState<SidebarLayout>(() => parseSidebarLayout(window.localStorage.getItem(STORAGE_KEY)));
  // Where the drag started. Held in a ref because the move listener is attached once per
  // drag and would otherwise close over a stale width.
  const dragFrom = useRef<{ readonly width: number; readonly x: number } | undefined>(undefined);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, serialiseSidebarLayout(layout));
  }, [layout]);

  // Kept in a ref so startResize can stay stable while still reading the current width.
  const widthNow = useRef(layout.width);
  widthNow.current = layout.width;

  const startResize = useCallback((clientX: number): void => {
    dragFrom.current = { width: widthNow.current, x: clientX };
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const from = dragFrom.current;
      if (from === undefined) return;
      setLayout(resolveDrag(from.width, from.x, event.clientX));
    };
    const onUp = (): void => {
      dragFrom.current = undefined;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // pointercancel matters: dragging out of the window and releasing there fires no
    // pointerup, and the sidebar would keep resizing on the next mouse move.
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const toggleCollapse = useCallback((): void => {
    setLayout((current) => ({ width: current.width === 0 ? DEFAULT_SIDEBAR.width : current.width, collapsed: !current.collapsed }));
  }, []);

  return { width: layout.width, isCollapsed: layout.collapsed, startResize, toggleCollapse };
};
