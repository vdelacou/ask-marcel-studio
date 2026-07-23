/*
 * The skills panel: the list, the one skill being edited as fields, and the on/off switch.
 *
 * Wiring only. Whether a SKILL.md is still a skill is decided in main, which is why a save
 * that would break it comes back as an error rather than being caught here. The form
 * mapping (fields to file text and back) is the pure lib/skill-form.
 */
import { useCallback, useEffect, useState } from 'react';
import { skillFormFromText, textFromSkillForm } from '../lib/skill-form.ts';
import type { SkillForm } from '../lib/skill-form.ts';
import { slugify } from '../lib/slugify.ts';
import type { Skill } from '../../../shared/ipc-contract.ts';

export type SkillsNotice = { readonly tone: 'saved' | 'error'; readonly message: string };

// Editing an existing skill (skill present) or writing a new one from scratch (skill
// undefined). `stored` is the form as last saved, for dirty tracking.
export type SkillEditing = {
  readonly skill?: Skill;
  readonly form: SkillForm;
  readonly stored: SkillForm;
};

export type SkillsController = {
  readonly skills: readonly Skill[];
  readonly disabledFolders: ReadonlySet<string>;
  readonly error?: string;
  readonly isImporting: boolean;
  readonly isSaving: boolean;
  readonly editing?: SkillEditing;
  readonly notice?: SkillsNotice;
  readonly importFolder: () => void;
  readonly startCreate: () => void;
  readonly remove: (folder: string) => void;
  readonly edit: (folder: string) => void;
  readonly closeEditor: () => void;
  readonly setField: (patch: Partial<SkillForm>) => void;
  readonly setBody: (body: string) => void;
  readonly save: () => void;
  readonly restore: () => void;
  readonly toggleActive: (folder: string) => void;
};

const BLANK: SkillForm = { name: '', displayName: '', description: '', extras: [], body: '# New skill\n\nWhat this skill does.\n' };

export const useSkills = (): SkillsController => {
  const [skills, setSkills] = useState<readonly Skill[]>([]);
  const [disabledFolders, setDisabledFolders] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | undefined>(undefined);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<SkillEditing | undefined>(undefined);
  const [notice, setNotice] = useState<SkillsNotice | undefined>(undefined);

  const load = useCallback((): void => {
    void (async (): Promise<void> => {
      const listed = await studio.skills.list();
      if (!listed.ok) return setError(listed.error.message);
      setSkills(listed.value);
      const settings = await studio.settings.get();
      if (settings.ok) setDisabledFolders(new Set(settings.value.skillsPolicy?.disabledFolders ?? []));
      return undefined;
    })();
  }, []);

  useEffect(load, [load]);

  const importFolder = useCallback((): void => {
    setError(undefined);
    setIsImporting(true);
    void (async (): Promise<void> => {
      const added = await studio.skills.add();
      setIsImporting(false);
      if (!added.ok && added.error.kind === 'cancelled') return;
      if (!added.ok) return setError(added.error.message);
      return load();
    })();
  }, [load]);

  const startCreate = useCallback((): void => {
    setNotice(undefined);
    setEditing({ form: BLANK, stored: BLANK });
  }, []);

  const remove = useCallback(
    (folder: string): void => {
      setError(undefined);
      void (async (): Promise<void> => {
        const removed = await studio.skills.remove(folder);
        if (!removed.ok) return setError(removed.error.message);
        return load();
      })();
    },
    [load]
  );

  const edit = useCallback(
    (folder: string): void => {
      setNotice(undefined);
      void (async (): Promise<void> => {
        const skill = skills.find((candidate) => candidate.folder === folder);
        const read = await studio.skills.read(folder);
        if (skill === undefined || !read.ok) return setError(read.ok ? `no skill called ${folder}` : read.error.message);
        const form = skillFormFromText(read.value);
        setEditing({ skill, form, stored: form });
        return undefined;
      })();
    },
    [skills]
  );

  const closeEditor = useCallback((): void => {
    setEditing(undefined);
    setNotice(undefined);
  }, []);

  const setField = useCallback((patch: Partial<SkillForm>): void => {
    setEditing((current) => (current === undefined ? current : { ...current, form: { ...current.form, ...patch } }));
  }, []);
  const setBody = useCallback((body: string): void => setField({ body }), [setField]);

  const save = useCallback((): void => {
    if (editing === undefined) return;
    setNotice(undefined);
    setIsSaving(true);
    void (async (): Promise<void> => {
      const contents = textFromSkillForm(editing.form);
      // A skill with no folder yet is a new one; its handle is the display name slugified,
      // or the handle field if the user typed one.
      const folder = editing.skill?.folder ?? (editing.form.name.trim().length > 0 ? editing.form.name.trim() : slugify(editing.form.displayName));
      const written = editing.skill === undefined ? await studio.skills.create({ folder, contents }) : await studio.skills.write({ folder, contents });
      setIsSaving(false);
      if (!written.ok) return setNotice({ tone: 'error', message: written.error.message });
      const reread = skillFormFromText(contents);
      setEditing({ skill: written.value, form: reread, stored: reread });
      setNotice({ tone: 'saved', message: 'Saved' });
      return load();
    })();
  }, [editing, load]);

  const restore = useCallback((): void => {
    if (editing?.skill === undefined) return;
    const folder = editing.skill.folder;
    setNotice(undefined);
    void (async (): Promise<void> => {
      const restored = await studio.skills.restore(folder);
      if (!restored.ok) return setNotice({ tone: 'error', message: restored.error.message });
      const read = await studio.skills.read(folder);
      if (read.ok) {
        const form = skillFormFromText(read.value);
        setEditing({ skill: restored.value, form, stored: form });
      }
      setNotice({ tone: 'saved', message: 'The original is back' });
      return load();
    })();
  }, [editing, load]);

  const toggleActive = useCallback(
    (folder: string): void => {
      setError(undefined);
      void (async (): Promise<void> => {
        const settings = await studio.settings.get();
        if (!settings.ok) return setError(settings.error.message);
        const disabled = new Set(settings.value.skillsPolicy?.disabledFolders ?? []);
        if (disabled.has(folder)) disabled.delete(folder);
        else disabled.add(folder);
        const saved = await studio.settings.save({ ...settings.value, skillsPolicy: { disabledFolders: [...disabled] } });
        if (!saved.ok) return setError(saved.error.message);
        return load();
      })();
    },
    [load]
  );

  return {
    skills,
    disabledFolders,
    ...(error === undefined ? {} : { error }),
    isImporting,
    isSaving,
    ...(editing === undefined ? {} : { editing }),
    ...(notice === undefined ? {} : { notice }),
    importFolder,
    startCreate,
    remove,
    edit,
    closeEditor,
    setField,
    setBody,
    save,
    restore,
    toggleActive,
  };
};
