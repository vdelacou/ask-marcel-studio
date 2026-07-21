/*
 * The settings page shell. Owns every piece of state, resolves it, and hands plain
 * props to the design system.
 *
 * Carries no class string (rule 22) and no design decisions: it drives the left menu,
 * shows one section's panel at a time, and wires callbacks. The only logic it contains
 * is orchestration; the transforms live in lib/ where they are tested.
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
import { modelOptionsFromDrafts } from '../lib/model-options.ts';
import { scopeRows, scopesSummary } from '../lib/office-scopes.ts';
import { categoryRows } from '../lib/office-categories.ts';
import { toggleCategory } from '../../../shared/office-policy.ts';
import type { OfficeCategory } from '../../../shared/office-catalog.ts';
import type { OfficePolicy } from '../../../shared/types.ts';

// The left-menu structure. Models and Skills configure the agent; Microsoft 365 is a
// connected app. Each id matches a section rendered on the right.
const NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    heading: 'Agent',
    items: [
      { id: 'models', label: 'Models', icon: 'models' },
      { id: 'skills', label: 'Skills', icon: 'skills' },
    ],
  },
  { heading: 'Connections', items: [{ id: 'office', label: 'Microsoft 365', icon: 'office' }] },
];

export type SettingsPageProps = {
  // Which section to open on, when the user arrived from somewhere specific (the
  // Microsoft 365 dot, say) rather than from the Settings button.
  initialSection?: string;
  // Called after anything that could change the sign-in, so the dot in the sidebar
  // updates without waiting for its next poll.
  onOfficeChanged?: () => void;
};

export const SettingsPage: FC<SettingsPageProps> = ({ initialSection, onOfficeChanged }) => {
  const [section, setSection] = useState(initialSection ?? 'models');
  const [drafts, setDrafts] = useState<readonly ProviderDraft[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | undefined>(undefined);
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<PanelNotice | undefined>(undefined);
  const [skills, setSkills] = useState<readonly SkillRow[]>([]);
  const [skillsError, setSkillsError] = useState<string | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  const [officeView, setOfficeView] = useState<OfficeView>({ kind: 'loading' });
  const [isScopesOpen, setIsScopesOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [officeError, setOfficeError] = useState<string | undefined>(undefined);
  const [officeCatalog, setOfficeCatalog] = useState<readonly OfficeCategory[]>([]);
  const [officePolicy, setOfficePolicy] = useState<OfficePolicy | undefined>(undefined);
  const [expandedCategory, setExpandedCategory] = useState<string | undefined>(undefined);

  const loadOffice = useCallback((): void => {
    void (async (): Promise<void> => {
      const status = await studio.office.status();
      if (!status.ok) {
        // A failure to launch the CLI is worth showing; treat the user as signed out.
        setOfficeError(status.error.message);
        setOfficeView({ kind: 'signed-out' });
        return;
      }
      setOfficeView(status.value.signedIn ? { kind: 'signed-in', summary: scopesSummary(status.value.scopes), scopes: scopeRows(status.value.scopes) } : { kind: 'signed-out' });
    })();
  }, []);

  useEffect(loadOffice, [loadOffice]);

  useEffect(() => {
    void (async (): Promise<void> => {
      setOfficeCatalog(await studio.office.commands());
    })();
  }, []);

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
      onOfficeChanged?.();
    })();
  }, [loadOffice, onOfficeChanged]);

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
      setOfficePolicy(loaded.value.officePolicy);
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

  // A new provider opens straight away: an empty collapsed row would be a dead end.
  const onAddDraft = useCallback((): void => {
    setNotice(undefined);
    const created = emptyDraft();
    setDrafts((current) => [...current, created]);
    setExpandedRowId(created.rowId);
  }, []);

  const onToggleRow = useCallback((rowId: string): void => {
    setExpandedRowId((current) => (current === rowId ? undefined : rowId));
  }, []);

  // A provider's Save button persists the whole set. Re-seed from what main echoed back
  // (trimmed, ids assigned) so the form shows exactly what was stored.
  const persist = useCallback((nextDrafts: readonly ProviderDraft[], nextDefaultModel: string | undefined, nextPolicy: OfficePolicy | undefined): void => {
    void (async (): Promise<void> => {
      const saved = await studio.settings.save(draftsToSettings(nextDrafts, nextDefaultModel, nextPolicy));
      if (!saved.ok) {
        setNotice({ tone: 'error', message: saved.error.message });
        return;
      }
      setDrafts(settingsToDrafts(saved.value));
      setNotice({ tone: 'saved', message: 'Saved' });
    })();
  }, []);

  const onSave = useCallback((): void => {
    persist(drafts, defaultModel, officePolicy);
  }, [persist, drafts, defaultModel, officePolicy]);

  // The empty option means "no explicit choice", which is stored as an absent field,
  // not as an empty reference.
  const onChangeDefaultModel = useCallback(
    (reference: string): void => {
      const next = reference.length === 0 ? undefined : reference;
      setDefaultModel(next);
      persist(drafts, next, officePolicy);
    },
    [persist, drafts, officePolicy]
  );

  // Optimistic: the switch moves at once and the save follows. A save that fails
  // reports through the same notice as everything else, and the next settings read
  // puts the switch back where it belongs.
  const onToggleCategory = useCallback(
    (name: string): void => {
      const rows = categoryRows(officeCatalog, officePolicy);
      const isEnabled = rows.find((row) => row.name === name)?.isEnabled ?? true;
      const next = toggleCategory(officePolicy, name, !isEnabled);
      setOfficePolicy(next);
      persist(drafts, defaultModel, next);
    },
    [persist, drafts, defaultModel, officeCatalog, officePolicy]
  );

  return (
    <SettingsLayout nav={<SettingsNav groups={NAV_GROUPS} activeId={section} onSelect={setSection} />}>
      {section === 'models' && (
        <ProvidersPanel
          drafts={drafts}
          expandedRowId={expandedRowId}
          defaultModel={defaultModel}
          modelChoices={modelOptionsFromDrafts(drafts)}
          notice={notice}
          onToggleRow={onToggleRow}
          onChangeDefaultModel={onChangeDefaultModel}
          onChangeDraft={onChangeDraft}
          onRemoveDraft={onRemoveDraft}
          onAddDraft={onAddDraft}
          onSave={onSave}
        />
      )}
      {section === 'skills' && <SkillsPanel skills={skills} error={skillsError} isAdding={isAdding} onAdd={onAddSkill} onRemove={onRemoveSkill} />}
      {section === 'office' && (
        <OfficePanel
          view={officeView}
          isLoggingIn={isLoggingIn}
          error={officeError}
          isScopesOpen={isScopesOpen}
          categories={categoryRows(officeCatalog, officePolicy)}
          {...(expandedCategory === undefined ? {} : { expandedCategory })}
          onToggleScopes={() => setIsScopesOpen((open) => !open)}
          onToggleCategory={onToggleCategory}
          onExpandCategory={(name) => setExpandedCategory((current) => (current === name ? undefined : name))}
          onLogin={onLogin}
        />
      )}
    </SettingsLayout>
  );
};

SettingsPage.displayName = 'SettingsPage';
