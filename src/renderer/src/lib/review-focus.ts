/*
 * Where the keyboard focus goes on the review list.
 *
 * A card answered from the keyboard leaves the list, and the card that slides into its place
 * takes the focus, or the new last card when it was the last, so the next answer is one key
 * away. Up and Down move to the neighbouring card and stop at either end.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */

// The card `step` away from `from` (up -1, down 1, staying put 0), kept inside a list of
// `count` cards; nothing when no card is left.
export const cardToFocus = (from: number, step: number, count: number): number | undefined => (count === 0 ? undefined : Math.min(Math.max(from + step, 0), count - 1));
