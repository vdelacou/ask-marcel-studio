/*
 * One of the two documents the user writes about themselves (their signature, their
 * writing voice): load it, edit it, save it, or ask the app to rebuild it.
 *
 * Wiring only. The panels decide how it is edited; this owns the IPC and the draft.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AgentFileDoc } from '../../../shared/agent-files.ts';

export type AgentFileNotice = { readonly tone: 'saved' | 'error'; readonly message: string };

export type AgentFileController = {
  readonly stored: string;
  readonly draft: string;
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly isRegenerating: boolean;
  // False once the app has said it cannot rebuild this yet, so the button is disabled
  // by the answer rather than by a flag the panel has to be told separately.
  readonly canRegenerate: boolean;
  readonly notice?: AgentFileNotice;
  readonly setDraft: (text: string) => void;
  readonly save: () => void;
  readonly cancel: () => void;
  readonly regenerate: () => void;
};

export const useAgentFile = (doc: AgentFileDoc): AgentFileController => {
  const [stored, setStored] = useState('');
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [canRegenerate, setCanRegenerate] = useState(true);
  const [notice, setNotice] = useState<AgentFileNotice | undefined>(undefined);

  const apply = useCallback((text: string): void => {
    setStored(text);
    setDraft(text);
  }, []);

  useEffect(() => {
    void (async (): Promise<void> => {
      const read = await studio.agentFiles.get(doc);
      if (!read.ok) {
        setNotice({ tone: 'error', message: read.error.message });
        return;
      }
      apply(read.value);
    })();
  }, [doc, apply]);

  const save = useCallback((): void => {
    setNotice(undefined);
    setIsSaving(true);
    void (async (): Promise<void> => {
      const saved = await studio.agentFiles.save({ doc, text: draft });
      setIsSaving(false);
      if (!saved.ok) {
        setNotice({ tone: 'error', message: saved.error.message });
        return;
      }
      apply(saved.value);
      setNotice({ tone: 'saved', message: 'Saved' });
    })();
  }, [doc, draft, apply]);

  const cancel = useCallback((): void => {
    setDraft(stored);
    setNotice(undefined);
  }, [stored]);

  const regenerate = useCallback((): void => {
    setNotice(undefined);
    setIsRegenerating(true);
    void (async (): Promise<void> => {
      const rebuilt = await studio.agentFiles.regenerate(doc);
      setIsRegenerating(false);
      if (!rebuilt.ok) {
        // "Not yet" is a fact about the app, not a failure of this click: remember it
        // so the button stops offering something that cannot happen.
        if (rebuilt.error.kind === 'unavailable') setCanRegenerate(false);
        setNotice({ tone: 'error', message: rebuilt.error.message });
        return;
      }
      apply(rebuilt.value);
      setNotice({ tone: 'saved', message: 'Rebuilt' });
    })();
  }, [doc, apply]);

  return {
    stored,
    draft,
    isDirty: draft !== stored,
    isSaving,
    isRegenerating,
    canRegenerate,
    ...(notice === undefined ? {} : { notice }),
    setDraft,
    save,
    cancel,
    regenerate,
  };
};
