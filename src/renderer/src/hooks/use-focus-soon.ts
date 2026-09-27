/*
 * Hands the keyboard focus to a control once the page has redrawn: the control that opened a
 * question, when the question closes and takes its buttons with it. Asked for by a selector,
 * since the control may only exist again after that redraw.
 */
import { useEffect, useState } from 'react';

export const useFocusSoon = (): ((selector: string) => void) => {
  const [selector, setSelector] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (selector === undefined) return;
    setSelector(undefined);
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) element.focus();
  }, [selector]);

  return setSelector;
};
