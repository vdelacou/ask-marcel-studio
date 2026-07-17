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
} as const;

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
};
