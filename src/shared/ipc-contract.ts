/*
 * The typed contract between renderer and main. Pure types plus channel-name
 * constants; zero electron imports so both sides and `bun test` can read it.
 *
 * Every invoke channel answers with a Result (hard rule 16): IPC is an IO
 * boundary, and a rejected ipcMain handler would surface in the renderer as an
 * opaque Error string with the main-process stack glued on.
 *
 * M1 scope: settings + conversations. The chat channels and the UIEvent stream
 * land in M2 with the agent runtime that emits them.
 */
import type { Conversation, ConversationMeta, Settings } from './types.ts';
import type { AgentFileDoc, AgentFileError } from './agent-files.ts';
import type { MemoryFileName } from './memory-file-name.ts';
import type { MemoryCandidate } from './memory-queue-doc.ts';
import type { AgentView, SubAgent } from './agents-doc.ts';
import type { ModelTestTarget, ModelTestVerdict } from './model-test.ts';
import type { OfficeCategory } from './office-catalog.ts';
import type { OfficeStatus } from './office-status.ts';
import type { QuickContext } from './quick-context.ts';
import type { Result } from './result.ts';

export const CHANNEL = {
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  conversationsList: 'conversations:list',
  conversationsCreate: 'conversations:create',
  conversationsGet: 'conversations:get',
  conversationsRename: 'conversations:rename',
  conversationsSetModel: 'conversations:setModel',
  conversationsDelete: 'conversations:delete',
  conversationsImportPick: 'conversations:importPick',
  conversationsImportPaths: 'conversations:importPaths',
  conversationsImportData: 'conversations:importData',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  skillsList: 'skills:list',
  skillsAdd: 'skills:add',
  skillsRemove: 'skills:remove',
  skillsRead: 'skills:read',
  skillsWrite: 'skills:write',
  skillsCreate: 'skills:create',
  skillsRestore: 'skills:restore',
  agentsList: 'agents:list',
  agentsSave: 'agents:save',
  agentsRemove: 'agents:remove',
  agentsRestore: 'agents:restore',
  agentFileGet: 'agent-file:get',
  agentFileSave: 'agent-file:save',
  agentFileRegenerate: 'agent-file:regenerate',
  modelsTest: 'models:test',
  officeStatus: 'office:status',
  officeLogin: 'office:login',
  officeLogout: 'office:logout',
  officeCommands: 'office:commands',
  officeQuickContext: 'office:quickContext',
  memoryPending: 'memory:pending',
  memoryResolve: 'memory:resolve',
  memoryRead: 'memory:read',
  memoryWrite: 'memory:write',
} as const;

// The one main-to-renderer stream. Everything the UI learns during a turn arrives here.
export const CHAT_EVENT = 'chat:event';

// A second, much quieter stream: the app has noticed something it would like to ask
// about. Separate from the chat stream because it has nothing to do with a turn.
export const MEMORY_EVENT = 'memory:event';

export type MemoryEvent = { readonly type: 'pending-changed'; readonly count: number };

//   accept  remember this term with this meaning
//   reject  never mind
export type MemoryResolveInput = { readonly id: string; readonly action: 'accept'; readonly detail: string } | { readonly id: string; readonly action: 'reject' };

export type TurnUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd?: number;
};

export type UIEvent =
  | { readonly type: 'turn-start'; readonly conversationId: string; readonly messageId: string }
  | { readonly type: 'text-delta'; readonly conversationId: string; readonly messageId: string; readonly delta: string }
  | { readonly type: 'tool-start'; readonly conversationId: string; readonly messageId: string; readonly toolUseId: string; readonly name: string; readonly input: unknown }
  | { readonly type: 'tool-result'; readonly conversationId: string; readonly messageId: string; readonly toolUseId: string; readonly result: string; readonly isError: boolean }
  // What a subagent is doing, nested under the tool call that spawned it. The fold
  // also persists these as child parts (tagged parentToolUseId), so the live view and
  // the reopened conversation show the same delegated steps.
  | {
      readonly type: 'subagent-tool-start';
      readonly conversationId: string;
      readonly messageId: string;
      readonly parentToolUseId: string;
      readonly toolUseId: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'subagent-tool-result';
      readonly conversationId: string;
      readonly messageId: string;
      readonly parentToolUseId: string;
      readonly toolUseId: string;
      readonly result: string;
      readonly isError: boolean;
    }
  | { readonly type: 'turn-done'; readonly conversationId: string; readonly usage: TurnUsage }
  // Emitted once the turn's file write has landed. turn-done fires from the SDK's
  // result message, which is BEFORE the save, so a renderer that re-reads on turn-done
  // races the write and gets the previous turn back. This is the "disk is current now"
  // signal.
  | { readonly type: 'turn-saved'; readonly conversationId: string }
  | { readonly type: 'error'; readonly conversationId: string; readonly message: string }
  | { readonly type: 'title'; readonly conversationId: string; readonly title: string };

export type Skill = {
  // The folder it lives in, which is its checkpointed name (skill-name.ts).
  readonly folder: string;
  // The name from its frontmatter, which is what the agent sees.
  readonly name: string;
  // The same skill said in words, for the settings list and the "/" menu. Resolved in
  // main: its own displayName if it has one, otherwise its folder read as words.
  readonly displayName: string;
  readonly description: string;
  // Shipped with the app: removing it is refused rather than silently undone on the
  // next start.
  readonly isBuiltIn: boolean;
  // A built-in the user has edited. It no longer follows app updates, and the panel
  // offers to put the original back.
  readonly isModified: boolean;
};

//   not-a-skill       the folder has no SKILL.md, or it has no usable frontmatter
//   bad-name          the name could not be a folder (it reaches a path)
//   already-installed a skill of that name is already there; we never overwrite
//   built-in          ships with the app; removal is refused
export type SkillsError =
  | { readonly kind: 'not-a-skill'; readonly message: string }
  | { readonly kind: 'bad-name'; readonly message: string }
  | { readonly kind: 'already-installed'; readonly message: string }
  | { readonly kind: 'built-in'; readonly message: string }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'not-found'; readonly message: string }
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string };

export type ChatSendInput = {
  readonly conversationId: string;
  readonly text: string;
};

//   no-provider  nothing configured yet: the UI shows a settings call to action
//   busy         a turn is already in flight for this conversation
//   agent-failed the SDK turn itself failed
export type ChatError =
  | { readonly kind: 'no-provider'; readonly message: string }
  | { readonly kind: 'busy'; readonly message: string }
  | { readonly kind: 'unknown-model'; readonly message: string }
  | { readonly kind: 'agent-failed'; readonly message: string }
  | StoreError;

// Why every kind exists, so the renderer can say something true to the user:
//   malformed-id   the conversation id failed its checkpoint (never trust IPC input)
//   not-found      no such conversation on disk
//   invalid        what the USER just typed cannot be stored — the form is fixable
//   unreadable     the FILE on disk is corrupt or hand-edited — the form cannot fix it
//   write-failed   the atomic write could not complete (disk full, permissions)
//   no-encryption  safeStorage has no OS keychain available, so a key cannot be sealed
//
// invalid and unreadable are deliberately distinct even though the same shape checks
// produce both: they send the user to different places.
export type StoreError =
  | { readonly kind: 'malformed-id'; readonly message: string }
  | { readonly kind: 'not-found'; readonly message: string }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'no-encryption'; readonly message: string };

export type CreateConversationInput = {
  // A model reference, 'providerId::modelId'. Optional, and normally absent: main resolves
  // which model a new conversation opens on from the last one used (model-ref.ts), because
  // the renderer's copy dates from boot and a model switched since would be missed.
  readonly model?: string;
};

export type RenameConversationInput = {
  // A plain string, deliberately NOT the branded ConversationId. A brand is a
  // compile-time proof, and nothing survives the JSON trip across IPC: whatever the
  // renderer sends arrives here as an untrusted string. Typing this as ConversationId
  // would claim a validation that has not happened yet. Main brands it at the
  // checkpoint (conversation-id.ts) before it reaches any path.
  readonly id: string;
  readonly title: string;
};

// Changing which model answers this conversation. Applies from the next message: the
// runtime reads the conversation's model on every send.
export type SetConversationModelInput = {
  // Untrusted, like every id crossing IPC. See RenameConversationInput.
  readonly id: string;
  // A model reference, 'providerId::modelId'.
  readonly model: string;
};

// A file copied into the conversation's workspace, ready for the agent to open.
export type ImportedFile = {
  readonly name: string;
  // Relative to the workspace, which is the agent's working directory.
  readonly relativePath: string;
  readonly size: number;
};

//   cancelled  the user closed the file picker; not a failure, and says nothing
//   too-large  one of the files is bigger than the app will copy into a conversation
export type ImportError = StoreError | { readonly kind: 'cancelled'; readonly message: string } | { readonly kind: 'too-large'; readonly message: string };

export type ImportPathsInput = {
  readonly id: string;
  // Real paths, resolved in the preload via webUtils. Untrusted all the same: main
  // reduces each to a bare filename before it joins anything.
  readonly paths: readonly string[];
};

// A file that has no path on disk, e.g. an attachment dragged straight out of Outlook.
// Its bytes cross IPC because there is nothing else to copy from.
export type ImportDataInput = {
  readonly id: string;
  readonly name: string;
  readonly bytes: ArrayBuffer;
};

// Why each kind exists (see office-service):
//   spawn-failed  the office CLI could not be launched at all
//   busy          a login is already in progress (single-flight)
//   timed-out     login exceeded its ten-minute deadline
//   login-failed  login ran and exited non-zero (cancelled, network, etc.)
// A signed-out user is NOT an error: status resolves ok with { signedIn: false }.
export type OfficeError =
  | { readonly kind: 'spawn-failed'; readonly message: string }
  | { readonly kind: 'busy'; readonly message: string }
  | { readonly kind: 'timed-out'; readonly message: string }
  | { readonly kind: 'login-failed'; readonly message: string };

// The renderer-facing api surfaced by the preload bridge. The preload wires each
// member to its CHANNEL; this type is what keeps the two sides honest.
export type StudioApi = {
  readonly settings: {
    readonly get: () => Promise<Result<Settings, StoreError>>;
    readonly save: (settings: Settings) => Promise<Result<Settings, StoreError>>;
  };
  readonly conversations: {
    readonly list: () => Promise<Result<readonly ConversationMeta[], StoreError>>;
    readonly create: (input: CreateConversationInput) => Promise<Result<Conversation, StoreError>>;
    readonly get: (id: string) => Promise<Result<Conversation, StoreError>>;
    readonly rename: (input: RenameConversationInput) => Promise<Result<ConversationMeta, StoreError>>;
    readonly setModel: (input: SetConversationModelInput) => Promise<Result<ConversationMeta, StoreError>>;
    readonly remove: (id: string) => Promise<Result<null, StoreError>>;
    // Opens the file picker in MAIN, for the same reason skills.add does: a path
    // chosen renderer-side would be an untrusted string reaching the filesystem.
    readonly importPick: (id: string) => Promise<Result<readonly ImportedFile[], ImportError>>;
    readonly importPaths: (input: ImportPathsInput) => Promise<Result<readonly ImportedFile[], ImportError>>;
    readonly importData: (input: ImportDataInput) => Promise<Result<ImportedFile, ImportError>>;
  };
  // Not a channel: a renderer-side call into electron's webUtils, which is the only
  // way to learn a dropped File's real path since Electron 32 removed File.path.
  // Resolves to '' for a file that has no path, which is the signal to send bytes.
  readonly files: {
    readonly pathForFile: (file: File) => string;
  };
  readonly chat: {
    // Resolves when the turn is ACCEPTED, not when it finishes. Everything the turn
    // produces arrives on onChatEvent.
    readonly send: (input: ChatSendInput) => Promise<Result<null, ChatError>>;
    readonly cancel: (conversationId: string) => Promise<Result<null, ChatError>>;
    // Returns an unsubscribe function; the renderer attaches one listener at mount.
    readonly onEvent: (listener: (event: UIEvent) => void) => () => void;
  };
  readonly skills: {
    readonly list: () => Promise<Result<readonly Skill[], SkillsError>>;
    // Opens the folder picker in MAIN and installs what was chosen. The renderer
    // never sees a path: a path chosen in the renderer would be an untrusted string
    // reaching the filesystem.
    readonly add: () => Promise<Result<Skill, SkillsError>>;
    readonly remove: (name: string) => Promise<Result<null, SkillsError>>;
    readonly read: (folder: string) => Promise<Result<string, SkillsError>>;
    readonly write: (input: { readonly folder: string; readonly contents: string }) => Promise<Result<Skill, SkillsError>>;
    // Create a new skill from a folder name and its SKILL.md text.
    readonly create: (input: { readonly folder: string; readonly contents: string }) => Promise<Result<Skill, SkillsError>>;
    readonly restore: (folder: string) => Promise<Result<Skill, SkillsError>>;
  };
  readonly agents: {
    readonly list: () => Promise<Result<readonly AgentView[], StoreError>>;
    readonly save: (agent: SubAgent) => Promise<Result<AgentView, StoreError>>;
    readonly remove: (name: string) => Promise<Result<null, StoreError>>;
    readonly restore: (name: string) => Promise<Result<AgentView, StoreError>>;
  };
  readonly memory: {
    readonly pending: () => Promise<Result<readonly MemoryCandidate[], StoreError>>;
    // Resolves with what is still waiting, so the dialog can move to the next question.
    readonly resolve: (input: MemoryResolveInput) => Promise<Result<readonly MemoryCandidate[], StoreError>>;
    readonly read: (name: MemoryFileName) => Promise<Result<string, StoreError>>;
    readonly write: (input: { readonly name: MemoryFileName; readonly contents: string }) => Promise<Result<null, StoreError>>;
    readonly onEvent: (listener: (event: MemoryEvent) => void) => () => void;
  };
  readonly agentFiles: {
    readonly get: (doc: AgentFileDoc) => Promise<Result<string, AgentFileError>>;
    readonly save: (input: { readonly doc: AgentFileDoc; readonly text: string }) => Promise<Result<string, AgentFileError>>;
    // Resolves with the new contents once the background job that writes it finishes.
    // Long, like login: the renderer shows a spinner rather than polling.
    readonly regenerate: (doc: AgentFileDoc) => Promise<Result<string, AgentFileError>>;
  };
  readonly models: {
    // Asks the provider whether this key and this model name actually work, with one
    // one-token request. No Result: not reaching the provider is one of the answers,
    // and a malformed request from this app would be a bug, not a state to render.
    readonly test: (target: ModelTestTarget) => Promise<ModelTestVerdict>;
  };
  readonly office: {
    // A cheap local token decode: signed-out resolves ok with { signedIn: false }.
    readonly status: () => Promise<Result<OfficeStatus, OfficeError>>;
    // Opens the interactive browser sign-in. Single-flight in main. `force` re-captures
    // every token, which is the only way to renew the one that cannot refresh itself.
    readonly login: (options?: { readonly force?: boolean }) => Promise<Result<null, OfficeError>>;
    // Drops the cached tokens. Only the user can ask for this; the agent's shell guard
    // denies the command outright.
    readonly logout: () => Promise<Result<null, OfficeError>>;
    // What the bundled CLI can do, grouped by category, for the settings toggles. No
    // Result: a catalog that could not be read is an empty list, which the panel shows
    // as "nothing to configure" rather than as a failure.
    readonly commands: () => Promise<readonly OfficeCategory[]>;
    // Who the user is, as the app last fetched it. Undefined until a first successful
    // fetch: no Result, because "not known yet" is an answer, not a failure.
    readonly quickContext: () => Promise<QuickContext | undefined>;
  };
};
