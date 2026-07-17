/*
 * The settings page shell. Owns every piece of state, resolves it, and hands plain
 * props to the design system.
 *
 * Carries no class string (rule 22) and no design decisions: it stacks organisms and
 * wires callbacks. The only logic it contains is orchestration; the transforms live
 * in lib/provider-draft.ts where they are tested.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';
import { ProvidersPanel } from '../components/organisms/providers-panel/index.tsx';
import type { PanelNotice } from '../components/organisms/providers-panel/index.tsx';
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import { draftsToSettings, emptyDraft, settingsToDrafts } from '../lib/provider-draft.ts';

export const SettingsPage: FC = () => {
  const [drafts, setDrafts] = useState<readonly ProviderDraft[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<PanelNotice | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      const loaded = await studio.settings.get();
      if (!loaded.ok) {
        setNotice({ tone: 'error', message: loaded.error.message });
        return;
      }
      setDrafts(settingsToDrafts(loaded.value));
      setDefaultModel(loaded.value.defaultModel);
    })();
  }, []);

  const onChangeDraft = useCallback((rowId: string, patch: Partial<ProviderDraft>): void => {
    setNotice(undefined);
    setDrafts((current) => current.map((d) => (d.rowId === rowId ? { ...d, ...patch } : d)));
  }, []);

  const onRemoveDraft = useCallback((rowId: string): void => {
    setNotice(undefined);
    setDrafts((current) => current.filter((d) => d.rowId !== rowId));
  }, []);

  const onAddDraft = useCallback((): void => {
    setNotice(undefined);
    setDrafts((current) => [...current, emptyDraft()]);
  }, []);

  const onSave = useCallback((): void => {
    setIsSaving(true);
    void (async (): Promise<void> => {
      const saved = await studio.settings.save(draftsToSettings(drafts, defaultModel));
      setIsSaving(false);
      if (!saved.ok) {
        // The main process is the only real validator, so its message is the one to
        // show: it is what actually refused to write the file.
        setNotice({ tone: 'error', message: saved.error.message });
        return;
      }
      // Re-seed from what main echoed back, not from local state: main trims and
      // normalises, and the form should show what was actually stored.
      setDrafts(settingsToDrafts(saved.value));
      setNotice({ tone: 'saved', message: 'Settings saved' });
    })();
  }, [drafts, defaultModel]);

  return <ProvidersPanel drafts={drafts} notice={notice} isSaving={isSaving} onChangeDraft={onChangeDraft} onRemoveDraft={onRemoveDraft} onAddDraft={onAddDraft} onSave={onSave} />;
};

SettingsPage.displayName = 'SettingsPage';
