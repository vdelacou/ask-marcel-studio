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

// node:path is path manipulation, not IO, so it is allowed anywhere (rule 20).

export const settingsFilePath = (userData: string): string => join(userData, 'settings.json');

export const conversationsDir = (userData: string): string => join(userData, 'conversations');

export const conversationFilePath = (userData: string, id: ConversationId): string => join(conversationsDir(userData), `${id}.json`);

export const workspacesDir = (userData: string): string => join(userData, 'workspaces');

export const workspaceDir = (userData: string, id: ConversationId): string => join(workspacesDir(userData), id);

// CLAUDE_CONFIG_DIR for the agent subprocess. Its skills/ subfolder is what
// settingSources: ['user'] loads.
export const claudeConfigDir = (userData: string): string => join(userData, 'claude-config');

// Prepended to the agent's PATH so `ask-marcel-office` resolves to our shim (M4).
export const binDir = (userData: string): string => join(userData, 'bin');
