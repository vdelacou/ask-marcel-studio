/*
 * Keyboard triage on the review list: which card holds the focus.
 *
 * Wiring only; where the focus goes is lib/review-focus's call. A card answered from the
 * keyboard (the card itself held the focus) hands the focus to the card that takes its place,
 * once the list has caught up, so the next answer is one key away. An answer given with the
 * mouse moves nothing.
 */
import { useCallback, useEffect, useState } from 'react';
import { cardToFocus } from '../lib/review-focus.ts';

// The card to focus, and, after an answer, how many cards the list must be down to first.
type FocusRequest = { readonly index: number; readonly whenCount?: number };

export type ReviewFocus = {
  // Up or Down on a card: its neighbour takes the focus.
  readonly move: (index: number, step: number) => void;
  // Called as the card at `index` is answered: when the card itself held the focus, the card
  // that takes its place gets it once the answer has landed.
  readonly keepAfterAnswer: (index: number) => void;
};

// The review cards mark themselves with this attribute.
const CARD = '[data-review-card]';

export const useReviewFocus = (count: number): ReviewFocus => {
  const [request, setRequest] = useState<FocusRequest | undefined>(undefined);

  useEffect(() => {
    if (request === undefined || (request.whenCount !== undefined && count !== request.whenCount)) return;
    setRequest(undefined);
    const target = cardToFocus(request.index, 0, count);
    const card = target === undefined ? null : document.querySelectorAll(CARD).item(target);
    if (card instanceof HTMLElement) card.focus();
  }, [request, count]);

  const move = useCallback(
    (index: number, step: number): void => {
      const target = cardToFocus(index, step, count);
      if (target !== undefined) setRequest({ index: target });
    },
    [count]
  );

  const keepAfterAnswer = useCallback(
    (index: number): void => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(CARD)) return;
      setRequest({ index, whenCount: count - 1 });
    },
    [count]
  );

  return { move, keepAfterAnswer };
};
