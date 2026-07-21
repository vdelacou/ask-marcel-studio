/*
 * The helpers panel: the list, and the one being edited or created.
 *
 * Wiring only. What a helper must have to be usable is decided in shared/agents-doc,
 * which is why an incomplete one comes back as an error rather than being caught here.
 */
import { useCallback, useEffect, useState } from 'react';
import { AGENT_TOOL_OPTIONS } from '../../../shared/agents-doc.ts';
import type { AgentToolName, AgentView, SubAgent } from '../../../shared/agents-doc.ts';

export type AgentDraft = SubAgent & { readonly isBuiltIn: boolean; readonly isModified: boolean; readonly isNew: boolean };

export type AgentsController = {
  readonly agents: readonly AgentView[];
  readonly error?: string;
  readonly editing?: AgentDraft;
  readonly isSaving: boolean;
  readonly startNew: () => void;
  readonly edit: (name: string) => void;
  readonly closeEditor: () => void;
  readonly changeName: (name: string) => void;
  readonly changeDescription: (description: string) => void;
  readonly changePrompt: (prompt: string) => void;
  readonly toggleTool: (tool: string) => void;
  readonly save: () => void;
  readonly remove: () => void;
  readonly restore: () => void;
};

const EMPTY_DRAFT: AgentDraft = { name: '', description: '', prompt: '', tools: [], isBuiltIn: false, isModified: false, isNew: true };

export const useAgents = (): AgentsController => {
  const [agents, setAgents] = useState<readonly AgentView[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<AgentDraft | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback((): void => {
    void (async (): Promise<void> => {
      const listed = await studio.agents.list();
      if (!listed.ok) {
        setError(listed.error.message);
        return;
      }
      setAgents(listed.value);
    })();
  }, []);

  useEffect(load, [load]);

  const startNew = useCallback((): void => {
    setError(undefined);
    setEditing(EMPTY_DRAFT);
  }, []);

  const edit = useCallback(
    (name: string): void => {
      setError(undefined);
      const found = agents.find((agent) => agent.name === name);
      if (found === undefined) return;
      setEditing({ ...found, isNew: false });
    },
    [agents]
  );

  const closeEditor = useCallback((): void => setEditing(undefined), []);

  const patch = useCallback((change: Partial<AgentDraft>): void => {
    setEditing((current) => (current === undefined ? current : { ...current, ...change }));
  }, []);

  const changeName = useCallback((name: string): void => patch({ name }), [patch]);
  const changeDescription = useCallback((description: string): void => patch({ description }), [patch]);
  const changePrompt = useCallback((prompt: string): void => patch({ prompt }), [patch]);

  const toggleTool = useCallback((tool: string): void => {
    const known = AGENT_TOOL_OPTIONS.find((option) => option === tool);
    if (known === undefined) return;
    setEditing((current) => {
      if (current === undefined) return current;
      const next: readonly AgentToolName[] = current.tools.includes(known) ? current.tools.filter((existing) => existing !== known) : [...current.tools, known];
      return { ...current, tools: next };
    });
  }, []);

  const save = useCallback((): void => {
    if (editing === undefined) return;
    setError(undefined);
    setIsSaving(true);
    void (async (): Promise<void> => {
      const saved = await studio.agents.save({ name: editing.name, description: editing.description, prompt: editing.prompt, tools: editing.tools });
      setIsSaving(false);
      if (!saved.ok) {
        setError(saved.error.message);
        return;
      }
      setEditing({ ...saved.value, isNew: false });
      load();
    })();
  }, [editing, load]);

  const remove = useCallback((): void => {
    if (editing === undefined) return;
    setError(undefined);
    void (async (): Promise<void> => {
      const removed = await studio.agents.remove(editing.name);
      if (!removed.ok) {
        setError(removed.error.message);
        return;
      }
      setEditing(undefined);
      load();
    })();
  }, [editing, load]);

  const restore = useCallback((): void => {
    if (editing === undefined) return;
    setError(undefined);
    void (async (): Promise<void> => {
      const restored = await studio.agents.restore(editing.name);
      if (!restored.ok) {
        setError(restored.error.message);
        return;
      }
      setEditing({ ...restored.value, isNew: false });
      load();
    })();
  }, [editing, load]);

  return {
    agents,
    ...(error === undefined ? {} : { error }),
    ...(editing === undefined ? {} : { editing }),
    isSaving,
    startNew,
    edit,
    closeEditor,
    changeName,
    changeDescription,
    changePrompt,
    toggleTool,
    save,
    remove,
    restore,
  };
};
