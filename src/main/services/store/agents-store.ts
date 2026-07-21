/*
 * The helpers file: the user's own sub-agents plus their changes to the built-in ones.
 *
 * The IO shell around agents-doc.ts. One file, <userData>/agents.json, read whole and
 * written whole: there are a handful of these, not thousands.
 *
 * The renderer only ever sees merged views, so it never has to know whether something
 * is a built-in with a change applied or an agent the user wrote from scratch.
 */
import { EMPTY_AGENTS_DOC, mergeAgents, parseAgentsDoc, serialiseAgentsDoc, validateSubAgent } from '../../../shared/agents-doc.ts';
import type { AgentView, AgentsDoc, SubAgent } from '../../../shared/agents-doc.ts';
import { agentsFilePath } from '../../../shared/paths.ts';
import { readJsonFile, writeTextFileAtomic } from './json-file.ts';
import type { StoreError } from '../../../shared/ipc-contract.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type AgentsStoreDeps = {
  readonly userData: string;
  readonly builtins: readonly SubAgent[];
};

export type AgentsStore = {
  readonly list: () => Promise<Result<readonly AgentView[], StoreError>>;
  // Upsert one helper. A built-in name is stored as a change to that built-in; anything
  // else is the user's own.
  readonly save: (candidate: unknown) => Promise<Result<AgentView, StoreError>>;
  readonly remove: (name: unknown) => Promise<Result<null, StoreError>>;
  // Drops a change, so the built-in goes back to what ships with the app.
  readonly restore: (name: unknown) => Promise<Result<AgentView, StoreError>>;
};

export const createAgentsStore = (deps: AgentsStoreDeps): AgentsStore => {
  const path = agentsFilePath(deps.userData);
  const isBuiltIn = (name: string): boolean => deps.builtins.some((builtin) => builtin.name === name);

  const read = async (): Promise<Result<AgentsDoc, StoreError>> => {
    const raw = await readJsonFile(path);
    // No file yet is the normal empty state, not a failure.
    if (!raw.ok && raw.error.kind === 'not-found') return ok(EMPTY_AGENTS_DOC);
    if (!raw.ok) return err({ kind: 'unreadable', message: raw.error.message });

    const parsed = parseAgentsDoc(raw.value);
    if (!parsed.ok) return err({ kind: 'unreadable', message: parsed.error.message });
    return ok(parsed.value);
  };

  const write = async (doc: AgentsDoc): Promise<Result<null, StoreError>> => {
    const written = await writeTextFileAtomic(path, serialiseAgentsDoc(doc));
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    return ok(null);
  };

  const viewOf = (doc: AgentsDoc, name: string): Result<AgentView, StoreError> => {
    const found = mergeAgents(deps.builtins, doc).find((view) => view.name === name);
    if (found === undefined) return err({ kind: 'not-found', message: `no helper called ${name}` });
    return ok(found);
  };

  const list = async (): Promise<Result<readonly AgentView[], StoreError>> => {
    const doc = await read();
    if (!doc.ok) return doc;
    return ok(mergeAgents(deps.builtins, doc.value));
  };

  const save = async (candidate: unknown): Promise<Result<AgentView, StoreError>> => {
    const agent = validateSubAgent(candidate);
    if (!agent.ok) return err({ kind: 'invalid', message: agent.error.message });

    const doc = await read();
    if (!doc.ok) return doc;

    const next: AgentsDoc = isBuiltIn(agent.value.name)
      ? { ...doc.value, builtinOverrides: { ...doc.value.builtinOverrides, [agent.value.name]: agent.value } }
      : {
          ...doc.value,
          userAgents: doc.value.userAgents.some((existing) => existing.name === agent.value.name)
            ? doc.value.userAgents.map((existing) => (existing.name === agent.value.name ? agent.value : existing))
            : [...doc.value.userAgents, agent.value],
        };

    const written = await write(next);
    if (!written.ok) return written;
    return viewOf(next, agent.value.name);
  };

  const remove = async (name: unknown): Promise<Result<null, StoreError>> => {
    if (typeof name !== 'string') return err({ kind: 'invalid', message: 'that is not a helper name' });
    // A built-in is restored, never removed: it would come back with the app anyway.
    if (isBuiltIn(name)) return err({ kind: 'invalid', message: `${name} came with the app; put the original back instead of deleting it` });

    const doc = await read();
    if (!doc.ok) return doc;
    if (!doc.value.userAgents.some((agent) => agent.name === name)) return err({ kind: 'not-found', message: `no helper called ${name}` });

    const written = await write({ ...doc.value, userAgents: doc.value.userAgents.filter((agent) => agent.name !== name) });
    if (!written.ok) return written;
    return ok(null);
  };

  const restore = async (name: unknown): Promise<Result<AgentView, StoreError>> => {
    if (typeof name !== 'string') return err({ kind: 'invalid', message: 'that is not a helper name' });
    if (!isBuiltIn(name)) return err({ kind: 'not-found', message: `${name} did not come with the app, so there is no original to restore` });

    const doc = await read();
    if (!doc.ok) return doc;

    const { [name]: _dropped, ...rest } = doc.value.builtinOverrides;
    const next: AgentsDoc = { ...doc.value, builtinOverrides: rest };
    const written = await write(next);
    if (!written.ok) return written;
    return viewOf(next, name);
  };

  return { list, save, remove, restore };
};
