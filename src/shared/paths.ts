/*
 * Where everything lives under Electron's userData folder.
 *
 * Pure on purpose: userData arrives as a parameter rather than being read from
 * `app.getPath('userData')` in here. That is the "parameterise every state-source"
 * switch from references/architecture.md — it keeps electron out of src/shared/**
 * and makes the security-relevant joins unit-testable.
 *
 * Every conversation path takes a branded ConversationId, so the traversal
 * checkpoint (conversation-id.ts) is enforced by the type, not by convention.
 *
 * Runtime layout:
 *   <userData>/settings.json
 *   <userData>/conversations/<id>.json
 *   <userData>/workspaces/<id>/          the agent's cwd for that conversation
 */
import { join } from 'node:path';
import type { ConversationId } from './conversation-id.ts';
import type { SkillFolderName } from './skill-name.ts';
import type { MemoryFileName } from './memory-file-name.ts';
import type { AccountKey } from './account-key.ts';

// node:path is path manipulation, not IO, so it is allowed anywhere (rule 20).

export const settingsFilePath = (userData: string): string => join(userData, 'settings.json');

// The helpers the agent can delegate to: the user's own, plus their changes to the ones
// that ship with the app.
export const agentsFilePath = (userData: string): string => join(userData, 'agents.json');

export const conversationsDir = (userData: string): string => join(userData, 'conversations');

export const conversationFilePath = (userData: string, id: ConversationId): string => join(conversationsDir(userData), `${id}.json`);

export const workspacesDir = (userData: string): string => join(userData, 'workspaces');

export const workspaceDir = (userData: string, id: ConversationId): string => join(workspacesDir(userData), id);

// Files the user dragged in or picked, copied into the conversation's workspace so the
// agent can open them by a short relative path and they go when the conversation does.
export const importsDir = (userData: string, id: ConversationId): string => join(workspaceDir(userData, id), 'imports');

// Everything the app learns from one Microsoft 365 account lives under its own folder, so
// signing in as somebody else opens their world and signing back in finds the first one
// where it was left. What is NOT under here is the user's own tooling: providers and their
// keys, and the helpers, which belong to the person at the keyboard rather than to the
// mailbox they happen to be reading.
//
// Every store still takes a `userData` and derives its paths from it. The composition root
// simply hands them the account's folder instead of the top one, which is why nothing
// below this line had to learn what an account is.
export const accountsDir = (userData: string): string => join(userData, 'accounts');

export const accountDir = (userData: string, account: AccountKey): string => join(accountsDir(userData), account);

// Which account the app opened last. At the top level, because it is what decides where
// everything else is read from.
export const currentAccountPath = (userData: string): string => join(userData, 'current-account.json');

// CLAUDE_CONFIG_DIR for the agent subprocess. Its skills/ subfolder is what
// settingSources: ['user'] loads.
export const claudeConfigDir = (userData: string): string => join(userData, 'claude-config');

// The user's own email signature, written by the app and read by the drafting skill as
// $CLAUDE_CONFIG_DIR/signature.html. Plain HTML on purpose: it is pasted into a draft
// whole, and it holds nothing secret.
export const signatureFilePath = (userData: string): string => join(claudeConfigDir(userData), 'signature.html');

// How the user writes, in markdown, read by the drafting skill as
// $CLAUDE_CONFIG_DIR/voice-profile.md.
export const voiceProfileFilePath = (userData: string): string => join(claudeConfigDir(userData), 'voice-profile.md');

// Who the user is, fetched once from `my-quick-context` and re-read on every turn.
// Under claude-config on purpose: nothing in it is secret, and a skill that wants an id
// the block did not carry can open the file itself.
export const quickContextFilePath = (userData: string): string => join(claudeConfigDir(userData), 'quick-context.json');

// The exact-flags cheat-sheet for the office CLI, generated at launch and read by the
// agent under $CLAUDE_CONFIG_DIR before it guesses a flag.
export const cliCheatsheetPath = (userData: string): string => join(claudeConfigDir(userData), 'cli-cheatsheet.md');

// What settingSources: ['user'] loads. One folder per skill, each with a SKILL.md.
export const skillsDir = (userData: string): string => join(claudeConfigDir(userData), 'skills');

export const skillDir = (userData: string, folder: SkillFolderName): string => join(skillsDir(userData), folder);

// The notes the app keeps for the user, read by the agent as
// $CLAUDE_CONFIG_DIR/memory/<name>.md and editable in settings.
export const memoryDir = (userData: string): string => join(claudeConfigDir(userData), 'memory');

export const memoryFilePath = (userData: string, name: MemoryFileName): string => join(memoryDir(userData), `${name}.md`);

// The app's own bookkeeping about those notes: what it wants to ask, and how far it has
// read. Not under claude-config: the agent has no business reading either.
export const memoryQueuePath = (userData: string): string => join(userData, 'memory', 'queue.json');

export const memoryStatePath = (userData: string): string => join(userData, 'memory', 'state.json');

// Where a background job runs. Deliberately NOT under workspaces/: those belong to
// conversations and are deleted with them.
export const backgroundWorkspaceDir = (userData: string): string => join(userData, 'background-workspace');

// Prepended to the agent's PATH so `ask-marcel-office` resolves to our shim (M4).
export const binDir = (userData: string): string => join(userData, 'bin');

// npm's global prefix and cache, pinned inside the data folder so `npm i -g` and the
// download cache never touch the system or the signed app bundle (M8).
export const npmPrefixDir = (userData: string): string => join(userData, 'npm-global');

export const npmCacheDir = (userData: string): string => join(userData, 'npm-cache');

// pip's download cache, pinned inside the data folder so the embedded Python's installs
// stay self-contained (M8 Phase B).
export const pipCacheDir = (userData: string): string => join(userData, 'pip-cache');
