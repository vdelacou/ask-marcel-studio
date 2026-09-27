/*
 * Keyboard focus on a memory list once a change lands: a delete, a save or a cancel, a move,
 * an Undo. Each takes away the control that held the focus, which would otherwise fall to the
 * page and send the next Tab back to the top.
 *
 * Wiring only; which row takes it is lib/list-focus's call, asked with the rows on screen as
 * they are once the change has redrawn the list. The rows mark themselves with
 * data-memory-row, the Add button with data-memory-add.
 */
import { useEffect, useState } from 'react';
import { rowToFocus } from '../lib/list-focus.ts';
import type { ListFocusTarget } from '../lib/list-focus.ts';
import type { MemoryListRow } from '../lib/memory-list.ts';

const ROW = '[data-memory-row]';
const ADD = '[data-memory-add]';

export const useListFocus = (shown: readonly MemoryListRow[]): ((target: ListFocusTarget) => void) => {
  const [target, setTarget] = useState<ListFocusTarget | undefined>(undefined);

  useEffect(() => {
    if (target === undefined) return;
    setTarget(undefined);
    const index = rowToFocus(target, shown);
    const element = index === undefined ? document.querySelector(ADD) : document.querySelectorAll(ROW).item(index);
    if (element instanceof HTMLElement) element.focus();
  }, [target, shown]);

  return setTarget;
};
