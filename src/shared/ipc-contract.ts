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
};
