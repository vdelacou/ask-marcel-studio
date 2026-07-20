/*
 * The settings page shell. Owns every piece of state, resolves it, and hands plain
 * props to the design system.
 *
 * Carries no class string (rule 22) and no design decisions: it drives the left menu,
 * shows one section's panel at a time, and wires callbacks. The only logic it contains
 * is orchestration; the transforms live in lib/provider-draft.ts where they are tested.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FC } from 'react';
import { ProvidersPanel } from '../components/organisms/providers-panel/index.tsx';
import type { PanelNotice } from '../components/organisms/providers-panel/index.tsx';
import { SkillsPanel } from '../components/organisms/skills-panel/index.tsx';
import type { SkillRow } from '../components/organisms/skills-panel/index.tsx';
import { OfficePanel } from '../components/organisms/office-panel/index.tsx';
import type { OfficeView } from '../components/organisms/office-panel/index.tsx';
import { SettingsLayout } from '../components/organisms/settings-layout/index.tsx';
import { SettingsNav } from '../components/organisms/settings-nav/index.tsx';
import type { SettingsNavGroup } from '../components/organisms/settings-nav/index.tsx';
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import { draftsToSettings, emptyDraft, settingsToDrafts } from '../lib/provider-draft.ts';

// The left-menu structure. Providers and Skills configure the agent; Microsoft 365 is a
// connected app. Each id matches a section rendered on the right.
const NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    heading: 'Agent',
    items: [
      { id: 'providers', label: 'Providers', icon: 'providers' },
      { id: 'skills', label: 'Skills', icon: 'skills' },
    ],
  },
  { heading: 'Connections', items: [{ id: 'office', label: 'Microsoft 365', icon: 'office' }] },
];

export const SettingsPage: FC = () => {
  const [section, setSection] = useState('providers');
  const [drafts, setDrafts] = useState<readonly ProviderDraft[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<PanelNotice | undefined>(undefined);
  const [skills, setSkills] = useState<readonly SkillRow[]>([]);
  const [skillsError, setSkillsError] = useState<string | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  const [officeView, setOfficeView] = useState<OfficeView>({ kind: 'loading' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [officeError, setOfficeError] = useState<string | undefined>(undefined);

  const loadOffice = useCallback((): void => {
    void (async (): Promise<void> => {
      const status = await studio.office.status();
      if (!status.ok) {
        // A failure to launch the CLI is worth showing; treat the user as signed out.
        setOfficeError(status.error.message);
        setOfficeView({ kind: 'signed-out' });
        return;
      }
      setOfficeView(status.value.signedIn ? { kind: 'signed-in', scopeCount: status.value.scopes.length } : { kind: 'signed-out' });
    })();
  }, []);

  useEffect(loadOffice, [loadOffice]);

  const onLogin = useCallback((): void => {
    setOfficeError(undefined);
    setIsLoggingIn(true);
    void (async (): Promise<void> => {
      const done = await studio.office.login();
      setIsLoggingIn(false);
      if (!done.ok) {
        setOfficeError(done.error.message);
        return;
      }
      loadOffice();
    })();
  }, [loadOffice]);

  const loadSkills = useCallback((): void => {
    void (async (): Promise<void> => {
      const listed = await studio.skills.list();
      if (!listed.ok) {
        setSkillsError(listed.error.message);
        return;
      }
      setSkills(listed.value);
    })();
  }, []);

  useEffect(loadSkills, [loadSkills]);

  const onAddSkill = useCallback((): void => {
    setSkillsError(undefined);
    setIsAdding(true);
    void (async (): Promise<void> => {
      const added = await studio.skills.add();
      setIsAdding(false);
      // Closing the picker is not a failure, so it says nothing.
      if (!added.ok && added.error.kind === 'cancelled') return;
      if (!added.ok) {
        setSkillsError(added.error.message);
        return;
      }
      loadSkills();
    })();
  }, [loadSkills]);

  const onRemoveSkill = useCallback(
    (folder: string): void => {
      setSkillsError(undefined);
      void (async (): Promise<void> => {
        const removed = await studio.skills.remove(folder);
        if (!removed.ok) {
          setSkillsError(removed.error.message);
          return;
        }
        loadSkills();
      })();
    },
    [loadSkills]
  );

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

  // A provider's Save button persists the whole set. Re-seed from what main echoed back
  // (trimmed, ids assigned) so the form shows exactly what was stored.
  const onSave = useCallback((): void => {
    void (async (): Promise<void> => {
      const saved = await studio.settings.save(draftsToSettings(drafts, defaultModel));
      if (!saved.ok) {
        setNotice({ tone: 'error', message: saved.error.message });
        return;
      }
      setDrafts(settingsToDrafts(saved.value));
      setNotice({ tone: 'saved', message: 'Saved' });
    })();
  }, [drafts, defaultModel]);

  return (
    <SettingsLayout nav={<SettingsNav groups={NAV_GROUPS} activeId={section} onSelect={setSection} />}>
      {section === 'providers' && (
        <ProvidersPanel drafts={drafts} notice={notice} onChangeDraft={onChangeDraft} onRemoveDraft={onRemoveDraft} onAddDraft={onAddDraft} onSave={onSave} />
      )}
      {section === 'skills' && <SkillsPanel skills={skills} error={skillsError} isAdding={isAdding} onAdd={onAddSkill} onRemove={onRemoveSkill} />}
      {section === 'office' && <OfficePanel view={officeView} isLoggingIn={isLoggingIn} error={officeError} onLogin={onLogin} />}
    </SettingsLayout>
  );
};

SettingsPage.displayName = 'SettingsPage';
