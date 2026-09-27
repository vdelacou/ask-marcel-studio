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

// Whether the editor still holds the document it opened with. It settles a moment after opening
// with one more blank line at the end, and blank lines at the end mean nothing in markdown.
const isAsOpened = (text: string, opened: string): boolean => text.trimEnd() === opened.trimEnd();

// The same question asked of an editor as it closes, which knows the text it opened with too. One
// closed without a change saves nothing: it writes markdown in its own style (its own bullets, its
// own spacing), so a document merely looked at would otherwise come back rewritten. And nothing is
// saved while everything on the page is being cleared, or the page closing after the clear would
// write back what was just cleared.
export const shouldSaveEditorOnClose = (
  leaving: { readonly text: string; readonly opened: string; readonly revision: number },
  current: { readonly text: string; readonly revision: number; readonly isLoaded: boolean; readonly isPaused: boolean }
): boolean => !current.isPaused && !isAsOpened(leaving.text, leaving.opened) && shouldSaveOnLeave(leaving, current);

// What an editor reports as its text. It writes markdown in its own style (its own bullets, its
// own spacing) and reports that once as it opens: a document it still holds exactly as it opened
// is reported as the text it was given, so one only looked at never differs from what is on disk
// and is never saved back restyled. Nothing before it has opened, when nobody can have typed yet.
export const reportedText = (markdown: string, opened: string | undefined, given: string): string | undefined => {
  if (opened === undefined) return undefined;
  return isAsOpened(markdown, opened) ? given : markdown;
};

// The page's draft once an editor has closed. When its last words go to be saved, the draft
// becomes them: the editor reports typing a moment late, so the draft may still hold an older
// text, which would be saved over the newer one as soon as this save lands.
export const draftOnLeave = (draft: string, leaving: string, isSaved: boolean): string => (isSaved ? leaving : draft);

// Whether the draft is due to be saved once the typing pauses: after the file has been read, when
// it differs from what is saved, and not while a save is on its way (it goes again when that one
// lands), after one failed (the next keystroke tries again), or while everything is being cleared.
export const isDueForSave = (state: {
  readonly draft: string;
  readonly stored: string;
  readonly status: 'idle' | 'saving' | 'saved' | 'error';
  readonly isLoaded: boolean;
  readonly isPaused: boolean;
}): boolean => state.isLoaded && !state.isPaused && state.draft !== state.stored && state.status !== 'saving' && state.status !== 'error';

// Whether typing clears the error the page shows. A failed save, yes: the next pause tries again.
// Not the one saying the document could not be read, since nothing typed over it is ever saved.
export const isClearedByTyping = (status: 'idle' | 'saving' | 'saved' | 'error', isLoaded: boolean): boolean => status === 'error' && isLoaded;
