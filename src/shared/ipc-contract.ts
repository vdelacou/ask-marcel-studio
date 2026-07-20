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
import type { OfficeStatus } from './office-status.ts';
import type { PythonStatus } from './python-status.ts';
import type { Result } from './result.ts';

export const CHANNEL = {
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  conversationsList: 'conversations:list',
  conversationsCreate: 'conversations:create',
  conversationsGet: 'conversations:get',
  conversationsRename: 'conversations:rename',
  conversationsDelete: 'conversations:delete',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  skillsList: 'skills:list',
  skillsAdd: 'skills:add',
  skillsRemove: 'skills:remove',
  officeStatus: 'office:status',
  officeLogin: 'office:login',
  pythonStatus: 'python:status',
} as const;

// The one main-to-renderer stream. Everything the UI learns during a turn arrives here.
export const CHAT_EVENT = 'chat:event';

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
  | { readonly type: 'turn-done'; readonly conversationId: string; readonly usage: TurnUsage }
  | { readonly type: 'error'; readonly conversationId: string; readonly message: string }
  | { readonly type: 'title'; readonly conversationId: string; readonly title: string };

export type Skill = {
  // The folder it lives in, which is its checkpointed name (skill-name.ts).
  readonly folder: string;
  // The name from its frontmatter, which is what the agent sees.
  readonly name: string;
  readonly description: string;
  // Shipped with the app: re-seeded every launch, so removing it is refused rather
  // than silently undone on the next start.
  readonly isBuiltIn: boolean;
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
  // A model reference, 'providerId::modelId'.
  readonly model: string;
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
    readonly remove: (id: string) => Promise<Result<null, StoreError>>;
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
  };
  readonly office: {
    // A cheap local token decode: signed-out resolves ok with { signedIn: false }.
    readonly status: () => Promise<Result<OfficeStatus, OfficeError>>;
    // Opens the interactive browser sign-in. Single-flight in main.
    readonly login: () => Promise<Result<null, OfficeError>>;
  };
  readonly python: {
    // No Result envelope on purpose: PythonStatus is a total type that already models
    // every outcome including 'failed', so the read cannot error, only report a state.
    readonly status: () => Promise<PythonStatus>;
  };
};
