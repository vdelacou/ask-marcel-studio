/*
 * Saving a document as it is typed, without a Save button.
 *
 * A save takes a moment, and the user may type on while it is on its way. When it lands, the
 * draft becomes what was saved only if nothing new was typed since it was sent; otherwise the
 * newer text stays, still unsaved, and goes next. Taking the saved text regardless would throw
 * away the last words typed.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
export const draftAfterSave = (draft: string, sent: string, saved: string): string => (draft === sent ? saved : draft);

// Whether the text an editor holds as it closes is saved. Only from the editor showing the
// document's current version: one closing because a newer version replaced it (a rebuild, or
// the first read landing) holds an older text, and saving it would undo the newer one. Only
// once the file has been read, and only when it differs from what is on disk.
export const shouldSaveOnLeave = (
  leaving: { readonly text: string; readonly revision: number },
  current: { readonly text: string; readonly revision: number; readonly isLoaded: boolean }
): boolean => current.isLoaded && leaving.revision === current.revision && leaving.text !== current.text;
