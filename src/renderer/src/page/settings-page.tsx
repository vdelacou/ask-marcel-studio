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
import { SkillEditor } from '../components/organisms/skill-editor/index.tsx';
import { AgentsPanel } from '../components/organisms/agents-panel/index.tsx';
import { AgentEditor } from '../components/organisms/agent-editor/index.tsx';
import { SignaturePanel } from '../components/organisms/signature-panel/index.tsx';
import { VoicePanel } from '../components/organisms/voice-panel/index.tsx';
import { MemoryPanel } from '../components/organisms/memory-panel/index.tsx';
import type { MemoryNoteId } from '../components/organisms/memory-panel/index.tsx';
import { DocumentEditor } from '../components/organisms/document-editor/index.tsx';
import { OfficePanel } from '../components/organisms/office-panel/index.tsx';
import type { OfficeView } from '../components/organisms/office-panel/index.tsx';
import { SettingsLayout } from '../components/organisms/settings-layout/index.tsx';
import { SettingsNav } from '../components/organisms/settings-nav/index.tsx';
import type { SettingsNavGroup } from '../components/organisms/settings-nav/index.tsx';
import type { ProviderDraft } from '../components/molecules/provider-form/index.tsx';
import { draftsToSettings, emptyDraft, settingsToDrafts } from '../lib/provider-draft.ts';
import { scopeRows, scopesSummary } from '../lib/office-scopes.ts';
import { categoryRows } from '../lib/office-categories.ts';
import { toggleCategory } from '../../../shared/office-policy.ts';
import type { OfficeCategory } from '../../../shared/office-catalog.ts';
import type { OfficePolicy } from '../../../shared/types.ts';
import { AGENT_TOOL_OPTIONS } from '../../../shared/agents-doc.ts';
import { useModelTest } from '../hooks/use-model-test.ts';
import { rowForTest } from '../lib/model-test-view.ts';
import { canSaveNote, memoryRoomNotice } from '../lib/memory-room.ts';
import { useSkills } from '../hooks/use-skills.ts';
import { useAgents } from '../hooks/use-agents.ts';
import { useAgentFile } from '../hooks/use-agent-file.ts';
import { MarkdownEditor } from '../render/markdown-editor.tsx';

// The left-menu structure. Models and Skills configure the agent; Microsoft 365 is a
// connected app. Each id matches a section rendered on the right.
const NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    heading: 'Agent',
    items: [
      { id: 'models', label: 'Models', icon: 'models' },
      { id: 'skills', label: 'Skills', icon: 'skills' },
      { id: 'agents', label: 'Helpers', icon: 'agents' },
      { id: 'memory', label: 'What it remembers', icon: 'memory' },
    ],
  },
  {
    heading: 'About you',
    items: [
      { id: 'signature', label: 'Email signature', icon: 'signature' },
      { id: 'voice', label: 'Writing voice', icon: 'voice' },
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

// The tool checkboxes for a helper: every tool the app offers, ticked when this one
// asks for it.
const agentToolChoices = (chosen: readonly string[]): readonly { id: string; label: string; checked: boolean }[] =>
  AGENT_TOOL_OPTIONS.map((tool) => ({ id: tool, label: tool, checked: chosen.includes(tool) }));

export const SettingsPage: FC<SettingsPageProps> = ({ initialSection, onOfficeChanged }) => {
  const [section, setSection] = useState(initialSection ?? 'models');
  const [drafts, setDrafts] = useState<readonly ProviderDraft[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | undefined>(undefined);
  // The model last used, which main writes whenever a conversation's model is switched and
  // reads to open the next new conversation. There is no control for it on this screen: it
  // is a record of what happened, not a preference. Read and written back untouched so that
  // saving a provider does not wipe the memory of it.
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<PanelNotice | undefined>(undefined);
  const skills = useSkills();
  const agents = useAgents();
  const signature = useAgentFile('signature');
  const voice = useAgentFile('voice-profile');
  const [isEditingSignature, setIsEditingSignature] = useState(false);
  const [memoryNote, setMemoryNote] = useState<MemoryNoteId>('jargon');
  const [memoryText, setMemoryText] = useState('');
  const [memoryStored, setMemoryStored] = useState('');
  const [memorySaving, setMemorySaving] = useState(false);
  const [officeView, setOfficeView] = useState<OfficeView>({ kind: 'loading' });
  const [isScopesOpen, setIsScopesOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [officeError, setOfficeError] = useState<string | undefined>(undefined);
  const [officeCatalog, setOfficeCatalog] = useState<readonly OfficeCategory[]>([]);
  const [pendingNotes, setPendingNotes] = useState(0);
  const [officePolicy, setOfficePolicy] = useState<OfficePolicy | undefined>(undefined);
  const [expandedCategory, setExpandedCategory] = useState<string | undefined>(undefined);
  const [expandedCommand, setExpandedCommand] = useState<string | undefined>(undefined);

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

  useEffect(() => {
    void (async (): Promise<void> => {
      const read = await studio.memory.read(memoryNote);
      const text = read.ok ? read.value : '';
      setMemoryStored(text);
      setMemoryText(text);
    })();
  }, [memoryNote]);

  useEffect(() => {
    void (async (): Promise<void> => {
      const waiting = await studio.memory.pending();
      if (waiting.ok) setPendingNotes(waiting.value.length);
    })();
  }, []);

  const saveMemory = useCallback((): void => {
    setMemorySaving(true);
    void (async (): Promise<void> => {
      await studio.memory.write({ name: memoryNote, contents: memoryText });
      setMemorySaving(false);
      setMemoryStored(memoryText);
    })();
  }, [memoryNote, memoryText]);

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

  const { tests: modelTests, run: runModelTest, clear: clearModelTests } = useModelTest();

  // Closing or switching provider drops the results with it: they were about the key
  // and address that were on screen at the time.
  const onToggleRow = useCallback(
    (rowId: string): void => {
      clearModelTests();
      setExpandedRowId((current) => (current === rowId ? undefined : rowId));
    },
    [clearModelTests]
  );

  // Tests what is typed, not what is saved: the useful moment to check a key is before
  // committing it.
  const onTestModel = useCallback(
    (model: string): void => {
      const draft = drafts.find((candidate) => candidate.rowId === expandedRowId);
      if (draft === undefined) return;
      runModelTest({ kind: draft.kind, baseUrl: draft.baseUrl, apiKey: draft.apiKey, modelId: model });
    },
    [drafts, expandedRowId, runModelTest]
  );

  const modelTestRows = Object.fromEntries(
    Object.entries(modelTests).flatMap(([model, state]) => {
      const row = rowForTest(state);
      return row === undefined ? [] : [[model, row] as const];
    })
  );

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

  // Optional props are spread from a value rather than from a conditional inside the
  // JSX: exactOptionalPropertyTypes means an explicit undefined is not the same as an
  // absent prop, and a ternary inside a ternary reads like neither.
  const skillNotice = skills.notice === undefined ? {} : { notice: skills.notice };
  const agentError = agents.error === undefined ? {} : { error: agents.error };

  // Built as values rather than nested inside the JSX: a section that is a list until
  // you open one of its rows is two screens, and reading that as a ternary inside a
  // conditional is worse than naming it.
  const skillsSection =
    skills.editing === undefined ? (
      <SkillsPanel skills={skills.skills} error={skills.error} isAdding={skills.isAdding} onAdd={skills.add} onEdit={skills.edit} onRemove={skills.remove} />
    ) : (
      <SkillEditor
        name={skills.editing.skill.name}
        isBuiltIn={skills.editing.skill.isBuiltIn}
        isModified={skills.editing.skill.isModified}
        onBack={skills.closeEditor}
        onRestore={skills.restore}
      >
        <DocumentEditor
          mode="rich"
          richNode={<MarkdownEditor key={`${skills.editing.skill.folder}-${skills.editing.stored}`} defaultValue={skills.editing.draft} onChange={skills.setDraft} />}
          markdownValue={skills.editing.draft}
          isSaving={skills.isSaving}
          isDirty={skills.editing.draft !== skills.editing.stored}
          {...skillNotice}
          onChangeMarkdown={skills.setDraft}
          onSave={skills.save}
          onCancel={skills.closeEditor}
        />
      </SkillEditor>
    );

  const agentsSection =
    agents.editing === undefined ? (
      <AgentsPanel agents={agents.agents} error={agents.error} onAdd={agents.startNew} onEdit={agents.edit} />
    ) : (
      <AgentEditor
        name={agents.editing.name}
        description={agents.editing.description}
        tools={agentToolChoices(agents.editing.tools)}
        isBuiltIn={agents.editing.isBuiltIn}
        isNew={agents.editing.isNew}
        isModified={agents.editing.isModified}
        {...agentError}
        onChangeName={agents.changeName}
        onChangeDescription={agents.changeDescription}
        onToggleTool={agents.toggleTool}
        onBack={agents.closeEditor}
        onRemove={agents.remove}
        onRestore={agents.restore}
      >
        <DocumentEditor
          mode="markdown"
          markdownValue={agents.editing.prompt}
          isSaving={agents.isSaving}
          isDirty
          onChangeMarkdown={agents.changePrompt}
          onSave={agents.save}
          onCancel={agents.closeEditor}
        />
      </AgentEditor>
    );

  return (
    <SettingsLayout nav={<SettingsNav groups={NAV_GROUPS} activeId={section} onSelect={setSection} />}>
      {section === 'models' && (
        <ProvidersPanel
          drafts={drafts}
          expandedRowId={expandedRowId}
          notice={notice}
          onToggleRow={onToggleRow}
          onChangeDraft={onChangeDraft}
          onRemoveDraft={onRemoveDraft}
          modelTests={modelTestRows}
          onAddDraft={onAddDraft}
          onSave={onSave}
          onTestModel={onTestModel}
        />
      )}
      {section === 'skills' && skillsSection}

      {section === 'agents' && agentsSection}

      {section === 'memory' && (
        <MemoryPanel note={memoryNote} pendingCount={pendingNotes} onSelectNote={setMemoryNote}>
          <DocumentEditor
            mode="rich"
            richNode={<MarkdownEditor key={`${memoryNote}-${memoryStored}`} defaultValue={memoryText} onChange={setMemoryText} />}
            markdownValue={memoryText}
            emptyHint="Nothing yet. Marcel adds to this as it notices words you use, and always asks first."
            isSaving={memorySaving}
            isDirty={memoryText !== memoryStored}
            canSave={canSaveNote(memoryText)}
            {...(memoryRoomNotice(memoryText) === undefined ? {} : { notice: memoryRoomNotice(memoryText) })}
            onChangeMarkdown={setMemoryText}
            onSave={saveMemory}
            onCancel={() => setMemoryText(memoryStored)}
          />
        </MemoryPanel>
      )}

      {section === 'signature' && (
        <SignaturePanel
          html={signature.draft}
          isEditing={isEditingSignature}
          isSaving={signature.isSaving}
          isRegenerating={signature.isRegenerating}
          canRegenerate={signature.canRegenerate}
          {...(signature.notice === undefined ? {} : { notice: signature.notice })}
          onChangeHtml={signature.setDraft}
          onStartEdit={() => setIsEditingSignature(true)}
          onSave={() => {
            signature.save();
            setIsEditingSignature(false);
          }}
          onCancel={() => {
            signature.cancel();
            setIsEditingSignature(false);
          }}
          onRegenerate={signature.regenerate}
        />
      )}

      {section === 'voice' && (
        <VoicePanel isRegenerating={voice.isRegenerating} canRegenerate={voice.canRegenerate} onRegenerate={voice.regenerate}>
          <DocumentEditor
            mode="rich"
            richNode={<MarkdownEditor key={voice.stored} defaultValue={voice.draft} onChange={voice.setDraft} />}
            markdownValue={voice.draft}
            emptyHint="Nothing yet. Marcel writes one from your sent mail the first time it can, or you can write your own."
            isSaving={voice.isSaving}
            isDirty={voice.isDirty}
            {...(voice.notice === undefined ? {} : { notice: voice.notice })}
            onChangeMarkdown={voice.setDraft}
            onSave={voice.save}
            onCancel={voice.cancel}
          />
        </VoicePanel>
      )}

      {section === 'office' && (
        <OfficePanel
          view={officeView}
          isLoggingIn={isLoggingIn}
          error={officeError}
          isScopesOpen={isScopesOpen}
          categories={categoryRows(officeCatalog, officePolicy)}
          {...(expandedCategory === undefined ? {} : { expandedCategory })}
          {...(expandedCommand === undefined ? {} : { expandedCommand })}
          onToggleScopes={() => setIsScopesOpen((open) => !open)}
          onToggleCategory={onToggleCategory}
          // Closing a category forgets which command was open inside it, so reopening it
          // starts from the list rather than from whatever was read last time.
          onExpandCategory={(name) => {
            setExpandedCommand(undefined);
            setExpandedCategory((current) => (current === name ? undefined : name));
          }}
          onExpandCommand={(name) => setExpandedCommand((current) => (current === name ? undefined : name))}
          onLogin={onLogin}
        />
      )}
    </SettingsLayout>
  );
};

SettingsPage.displayName = 'SettingsPage';
