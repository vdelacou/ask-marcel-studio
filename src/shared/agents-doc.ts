/*
 * The helpers the agent can delegate to.
 *
 * One ships with the app (the heavy-document reader). The user can change what it does,
 * add their own, and put the built-in back. Stored as the user's own agents plus
 * overrides for the built-ins, so an app update improves a built-in nobody has touched
 * while leaving a changed one alone.
 *
 * Programmatic, not files on disk: the SDK takes these as an option, and the app does
 * not load project setting sources, so there is nowhere on disk for the agent to read
 * them from anyway.
 *
 * Pure: zero electron imports, so `bun test` covers it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

// What a helper is allowed to touch. Deliberately short: these are the tools the
// bundled reader uses, plus the web one, and every entry is something a
// non-technical user can be told the meaning of.
export const AGENT_TOOL_OPTIONS = ['Bash', 'Read', 'Grep', 'Glob', 'Write', 'Edit', 'WebFetch'] as const;
export type AgentToolName = (typeof AGENT_TOOL_OPTIONS)[number];

// Tools the app used to offer and no longer does. One list, two jobs: the agent is
// started with these in `disallowedTools`, and a helper saved while they were still
// on offer loads with them dropped instead of being refused. Dropping the name from
// the list above without recording it here would make an older helpers file
// unreadable, taking every helper in it down with the retired one.
//
// WebSearch is Anthropic's own server-side tool. Pointed at any other provider it
// comes back empty rather than failing, and the agent then answers from memory as
// if it had searched. A tool that says "no results" when it means "I cannot" is
// worse than no tool.
export const WITHDRAWN_TOOLS = ['WebSearch'] as const;

export type SubAgent = {
  // Becomes the key the SDK routes on, so it has to be a plain identifier.
  readonly name: string;
  // What it is for. The main agent reads this to decide when to delegate, so an empty
  // one makes the helper unreachable.
  readonly description: string;
  readonly prompt: string;
  // Empty means "whatever the main agent may use".
  readonly tools: readonly AgentToolName[];
};

export type AgentsDoc = {
  readonly userAgents: readonly SubAgent[];
  // Keyed by built-in name. Present only for built-ins the user has changed.
  readonly builtinOverrides: Readonly<Record<string, SubAgent>>;
};

export const EMPTY_AGENTS_DOC: AgentsDoc = { userAgents: [], builtinOverrides: {} };

export type AgentsDocError = { readonly kind: 'unreadable'; readonly message: string } | { readonly kind: 'invalid'; readonly message: string };

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const NAME_LIMIT = 64;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (message: string): Result<never, AgentsDocError> => err({ kind: 'invalid', message });

export const validateSubAgent = (raw: unknown): Result<SubAgent, AgentsDocError> => {
  if (!isRecord(raw)) return invalid('a helper must be an object');
  const { name, description, prompt, tools } = raw;
  if (typeof name !== 'string' || !NAME.test(name) || name.length > NAME_LIMIT) return invalid('a helper name may only use lowercase letters, numbers and dashes');
  if (typeof description !== 'string' || description.trim().length === 0) return invalid(`${name} needs a description, or the agent will never know when to use it`);
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return invalid(`${name} needs instructions`);
  if (!Array.isArray(tools)) return invalid(`${name} must say which tools it may use`);

  const chosen: AgentToolName[] = [];
  for (const tool of tools) {
    if (WITHDRAWN_TOOLS.some((withdrawn) => withdrawn === tool)) continue;
    const known = AGENT_TOOL_OPTIONS.find((option) => option === tool);
    if (known === undefined) return invalid(`${name} asks for a tool that does not exist: ${String(tool)}`);
    if (!chosen.includes(known)) chosen.push(known);
  }
  return ok({ name, description: description.trim(), prompt: prompt.trim(), tools: chosen });
};

const parseDoc = (raw: unknown): Result<AgentsDoc, AgentsDocError> => {
  if (!isRecord(raw)) return invalid('the helpers file must be an object');

  const rawUsers = raw['userAgents'];
  if (!Array.isArray(rawUsers)) return invalid('the helpers file must have a userAgents array');
  const userAgents: SubAgent[] = [];
  for (const candidate of rawUsers) {
    const agent = validateSubAgent(candidate);
    if (!agent.ok) return agent;
    if (userAgents.some((existing) => existing.name === agent.value.name)) return invalid(`two helpers share the name ${agent.value.name}`);
    userAgents.push(agent.value);
  }

  const rawOverrides = raw['builtinOverrides'];
  if (rawOverrides !== undefined && !isRecord(rawOverrides)) return invalid('builtinOverrides must be an object');
  const builtinOverrides: Record<string, SubAgent> = {};
  for (const [key, candidate] of Object.entries(rawOverrides ?? {})) {
    const agent = validateSubAgent(candidate);
    if (!agent.ok) return agent;
    // The key IS the built-in being overridden; a mismatch would silently override
    // something else.
    if (agent.value.name !== key) return invalid(`the changed helper ${key} is stored under the wrong name`);
    builtinOverrides[key] = agent.value;
  }
  return ok({ userAgents, builtinOverrides });
};

// Same checks, different error kind: a bad file is not something a form can fix.
export const parseAgentsDoc = (raw: unknown): Result<AgentsDoc, AgentsDocError> => {
  const parsed = parseDoc(raw);
  if (parsed.ok) return parsed;
  return err({ kind: 'unreadable', message: parsed.error.message });
};

export const validateAgentsDoc = (raw: unknown): Result<AgentsDoc, AgentsDocError> => parseDoc(raw);

export const serialiseAgentsDoc = (doc: AgentsDoc): string => JSON.stringify(doc, null, 2);

// What the settings screen lists and what the runtime spawns: the built-ins with any
// change applied, then the user's own.
export type AgentView = SubAgent & { readonly isBuiltIn: boolean; readonly isModified: boolean };

export const mergeAgents = (builtins: readonly SubAgent[], doc: AgentsDoc): readonly AgentView[] => {
  const fromBuiltins = builtins.map((builtin): AgentView => {
    const override = doc.builtinOverrides[builtin.name];
    if (override === undefined) return { ...builtin, isBuiltIn: true, isModified: false };
    return { ...override, isBuiltIn: true, isModified: true };
  });
  const mine = doc.userAgents.map((agent): AgentView => ({ ...agent, isBuiltIn: false, isModified: false }));
  return [...fromBuiltins, ...mine];
};

// The shape the SDK's `agents` option takes. Structural on purpose: importing the SDK's
// type here would pull it into the pure tier.
export type SdkAgentDefinition = { description: string; prompt: string; tools?: string[] };

export const toSdkAgents = (views: readonly AgentView[]): Readonly<Record<string, SdkAgentDefinition>> =>
  Object.fromEntries(
    views.map((view) => [
      view.name,
      // Omitted, not empty: an empty list would mean "no tools at all", where the
      // intent is "whatever the main agent may use".
      { description: view.description, prompt: view.prompt, ...(view.tools.length === 0 ? {} : { tools: [...view.tools] }) },
    ])
  );
