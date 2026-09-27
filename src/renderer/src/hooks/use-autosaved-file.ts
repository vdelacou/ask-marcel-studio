/*
 * A document the user writes and Marcel reads (who they are, how they write), saved as it is
 * typed: a moment after the typing stops, and at once when its editor closes with something
 * still unsaved. No Save button and no Cancel. Nothing is saved while the page says its saving is
 * paused (everything on it being cleared).
 *
 * Wiring only. What the draft becomes once a save lands is lib/autosave's call. Saves go one
 * after another in the order they were asked for: two in flight could land out of order and
 * leave the older text on disk.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { draftAfterSave, draftOnLeave, isDueForSave, shouldSaveEditorOnClose } from '../lib/autosave.ts';
import type { AgentFileDoc } from '../../../shared/agent-files.ts';

export type AutosaveStatus = { readonly kind: 'idle' | 'saving' | 'saved' } | { readonly kind: 'error'; readonly message: string };

export type AutosavedFile = {
  readonly draft: string;
  // Moves only when the text comes from somewhere other than the editor (the first read, a
  // rebuild): the editor is remounted then, and never while the user types.
  readonly revision: number;
  readonly status: AutosaveStatus;
  readonly isRegenerating: boolean;
  // False once the app has said it cannot rebuild this yet.
  readonly canRegenerate: boolean;
  readonly setDraft: (text: string) => void;
  // The editor's last word as it closes, with the text it opened with and the revision it was
  // showing: its own reporting lags the typing, so the final keystrokes reach the page only this way.
  readonly saveOnLeave: (leaving: { readonly text: string; readonly opened: string; readonly revision: number }) => void;
  readonly regenerate: () => void;
};

const IDLE: AutosaveStatus = { kind: 'idle' };

// How long the typing has to pause before the draft is saved.
const QUIET_MS = 800;

export const useAutosavedFile = (doc: AgentFileDoc, isPaused: boolean): AutosavedFile => {
  const [draft, setDraft] = useState('');
  const [stored, setStored] = useState('');
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<AutosaveStatus>(IDLE);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [canRegenerate, setCanRegenerate] = useState(true);
  // Nothing is saved until the document has been read: typing over a file that could not be
  // read would otherwise write over whatever it holds.
  const [isLoaded, setIsLoaded] = useState(false);
  // What the file holds as far as this page knows, which version the editor should be showing,
  // and whether it was read: for a save asked for as an editor closes, when no render is coming
  // to carry the state.
  const onDisk = useRef({ text: '', revision: 0, isLoaded: false });
  // Read as an editor closes, when the page may be going away with the pause still on.
  const paused = useRef(isPaused);
  paused.current = isPaused;
  const queue = useRef<Promise<void>>(Promise.resolve());

  const replace = useCallback((text: string): void => {
    onDisk.current = { text, revision: onDisk.current.revision + 1, isLoaded: true };
    setStored(text);
    setDraft(text);
    setRevision(onDisk.current.revision);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    void (async (): Promise<void> => {
      const read = await studio.agentFiles.get(doc);
      if (!read.ok) {
        setStatus({ kind: 'error', message: read.error.message });
        return;
      }
      replace(read.value);
    })();
  }, [doc, replace]);

  const persist = useCallback(
    (text: string): void => {
      setStatus({ kind: 'saving' });
      queue.current = queue.current.then(async (): Promise<void> => {
        const saved = await studio.agentFiles.save({ doc, text });
        if (!saved.ok) {
          setStatus({ kind: 'error', message: saved.error.message });
          return;
        }
        onDisk.current = { ...onDisk.current, text: saved.value };
        setStored(saved.value);
        setDraft((current) => draftAfterSave(current, text, saved.value));
        setStatus({ kind: 'saved' });
      });
    },
    [doc]
  );

  // Saved once the typing pauses; never while a save is still on its way, and again when it
  // lands if more was typed meanwhile. A failed save waits for the next keystroke.
  useEffect(() => {
    if (!isDueForSave({ draft, stored, status: status.kind, isLoaded, isPaused })) return undefined;
    const timer = setTimeout(() => persist(draft), QUIET_MS);
    return () => clearTimeout(timer);
  }, [draft, stored, status, isLoaded, isPaused, persist]);

  const edit = useCallback((text: string): void => {
    setDraft(text);
    setStatus((current) => (current.kind === 'error' ? IDLE : current));
  }, []);

  const saveOnLeave = useCallback(
    (leaving: { readonly text: string; readonly opened: string; readonly revision: number }): void => {
      const isSaved = shouldSaveEditorOnClose(leaving, { ...onDisk.current, isPaused: paused.current });
      setDraft((current) => draftOnLeave(current, leaving.text, isSaved));
      if (isSaved) persist(leaving.text);
    },
    [persist]
  );

  const regenerate = useCallback((): void => {
    setIsRegenerating(true);
    void (async (): Promise<void> => {
      const rebuilt = await studio.agentFiles.regenerate(doc);
      setIsRegenerating(false);
      if (!rebuilt.ok) {
        // "Not yet" is a fact about the app, not a failure of this click: remember it so the
        // button stops offering something that cannot happen.
        if (rebuilt.error.kind === 'unavailable') setCanRegenerate(false);
        setStatus({ kind: 'error', message: rebuilt.error.message });
        return;
      }
      replace(rebuilt.value);
      setStatus({ kind: 'saved' });
    })();
  }, [doc, replace]);

  return { draft, revision, status, isRegenerating, canRegenerate, setDraft: edit, saveOnLeave, regenerate };
};
