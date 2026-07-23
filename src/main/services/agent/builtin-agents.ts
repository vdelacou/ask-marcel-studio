/*
 * The helpers that ship with the app, in the shape the settings screen and the store
 * work with.
 *
 * Derived from the definitions themselves rather than retyped, so there is one place a
 * built-in helper's wording lives and the panel cannot drift from what actually runs.
 *
 * `import type` only for the SDK, so the bun runner still covers this.
 */
import { docReader } from './doc-reader.ts';
import { mailReader } from './mail-reader.ts';
import { AGENT_TOOL_OPTIONS } from '../../../shared/agents-doc.ts';
import type { AgentToolName, SubAgent } from '../../../shared/agents-doc.ts';

// The SDK's tools list is `string[]`; ours is a closed set the settings screen can show
// as checkboxes. Anything outside that set is dropped rather than shown as a tick nobody
// can explain.
const knownTools = (tools: readonly string[] | undefined): readonly AgentToolName[] => (tools ?? []).flatMap((tool) => AGENT_TOOL_OPTIONS.filter((option) => option === tool));

export const BUILTIN_AGENTS: readonly SubAgent[] = [
  {
    name: 'doc-reader',
    description: docReader.description,
    prompt: docReader.prompt,
    tools: knownTools(docReader.tools),
  },
  {
    name: 'mail-reader',
    description: mailReader.description,
    prompt: mailReader.prompt,
    tools: knownTools(mailReader.tools),
  },
];
