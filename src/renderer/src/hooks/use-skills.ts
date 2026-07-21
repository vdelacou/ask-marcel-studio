/*
 * The skills panel: the list, and the one skill being edited.
 *
 * Wiring only. Whether a SKILL.md is still a skill is decided in main, which is why a
 * save that would break it comes back as an error rather than being caught here.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Skill } from '../../../shared/ipc-contract.ts';

export type SkillsNotice = { readonly tone: 'saved' | 'error'; readonly message: string };

export type SkillEditing = {
  readonly skill: Skill;
  readonly stored: string;
  readonly draft: string;
};

export type SkillsController = {
  readonly skills: readonly Skill[];
  readonly error?: string;
  readonly isAdding: boolean;
  readonly isSaving: boolean;
  readonly editing?: SkillEditing;
  readonly notice?: SkillsNotice;
  readonly add: () => void;
  readonly remove: (folder: string) => void;
  readonly edit: (folder: string) => void;
  readonly closeEditor: () => void;
  readonly setDraft: (contents: string) => void;
  readonly save: () => void;
  readonly restore: () => void;
};

export const useSkills = (): SkillsController => {
  const [skills, setSkills] = useState<readonly Skill[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<SkillEditing | undefined>(undefined);
  const [notice, setNotice] = useState<SkillsNotice | undefined>(undefined);

  const load = useCallback((): void => {
    void (async (): Promise<void> => {
      const listed = await studio.skills.list();
      if (!listed.ok) {
        setError(listed.error.message);
        return;
      }
      setSkills(listed.value);
    })();
  }, []);

  useEffect(load, [load]);

  const add = useCallback((): void => {
    setError(undefined);
    setIsAdding(true);
    void (async (): Promise<void> => {
      const added = await studio.skills.add();
      setIsAdding(false);
      // Closing the picker is not a failure, so it says nothing.
      if (!added.ok && added.error.kind === 'cancelled') return;
      if (!added.ok) {
        setError(added.error.message);
        return;
      }
      load();
    })();
  }, [load]);

  const remove = useCallback(
    (folder: string): void => {
      setError(undefined);
      void (async (): Promise<void> => {
        const removed = await studio.skills.remove(folder);
        if (!removed.ok) {
          setError(removed.error.message);
          return;
        }
        load();
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
        if (skill === undefined || !read.ok) {
          setError(read.ok ? `no skill called ${folder}` : read.error.message);
          return;
        }
        setEditing({ skill, stored: read.value, draft: read.value });
      })();
    },
    [skills]
  );

  const closeEditor = useCallback((): void => {
    setEditing(undefined);
    setNotice(undefined);
  }, []);

  const setDraft = useCallback((contents: string): void => {
    setEditing((current) => (current === undefined ? current : { ...current, draft: contents }));
  }, []);

  const save = useCallback((): void => {
    if (editing === undefined) return;
    setNotice(undefined);
    setIsSaving(true);
    void (async (): Promise<void> => {
      const saved = await studio.skills.write({ folder: editing.skill.folder, contents: editing.draft });
      setIsSaving(false);
      if (!saved.ok) {
        setNotice({ tone: 'error', message: saved.error.message });
        return;
      }
      setEditing({ skill: saved.value, stored: editing.draft, draft: editing.draft });
      setNotice({ tone: 'saved', message: 'Saved' });
      load();
    })();
  }, [editing, load]);

  const restore = useCallback((): void => {
    if (editing === undefined) return;
    setNotice(undefined);
    void (async (): Promise<void> => {
      const restored = await studio.skills.restore(editing.skill.folder);
      if (!restored.ok) {
        setNotice({ tone: 'error', message: restored.error.message });
        return;
      }
      const read = await studio.skills.read(editing.skill.folder);
      if (read.ok) setEditing({ skill: restored.value, stored: read.value, draft: read.value });
      setNotice({ tone: 'saved', message: 'The original is back' });
      load();
    })();
  }, [editing, load]);

  return {
    skills,
    ...(error === undefined ? {} : { error }),
    isAdding,
    isSaving,
    ...(editing === undefined ? {} : { editing }),
    ...(notice === undefined ? {} : { notice }),
    add,
    remove,
    edit,
    closeEditor,
    setDraft,
    save,
    restore,
  };
};
