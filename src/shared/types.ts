/*
 * The app's data model. Pure types, zero electron imports.
 *
 * Shape follows docs/PLAN.md, with one deliberate divergence: `apiKey` is not a
 * plain string on disk. The user chose Electron safeStorage, so a provider has
 * two shapes — sealed at rest, plaintext in memory — and the store's IO shell is
 * the only thing that converts between them. See .claude/LESSONS.md
 * ([decision] provider API keys are encrypted at rest with Electron safeStorage).
 */
import type { ConversationId } from './conversation-id.ts';

// An api key encrypted by the main process. Opaque: the pure core moves it
// around and never looks inside, which is what keeps safeStorage (and electron)
// out of src/shared/**.
export type SealedSecret = { readonly enc: string };

export type ProviderKind = 'anthropic' | 'openai';

// One union, parameterised by how the secret is carried, so the sealed and
// plaintext shapes cannot drift apart. `baseUrl` is optional for anthropic
// (defaults to the real API) and required for openai (there is no default).
type ProviderOf<TSecret> =
  | { readonly id: string; readonly kind: 'anthropic'; readonly label: string; readonly baseUrl?: string; readonly apiKey: TSecret; readonly modelIds: readonly string[] }
  | { readonly id: string; readonly kind: 'openai'; readonly label: string; readonly baseUrl: string; readonly apiKey: TSecret; readonly modelIds: readonly string[] };

// In memory, after the store's shell has decrypted. What the app works with.
export type Provider = ProviderOf<string>;

// On disk, in settings.json. What the pure core parses and serialises.
export type StoredProvider = ProviderOf<SealedSecret>;

// Which parts of Microsoft 365 the agent may reach. A DISABLED list, not an allowed
// one: a category added by a CLI update is available by default, and switching
// nothing off (the normal case) stores nothing at all.
export type OfficePolicy = {
  readonly disabledCategories: readonly string[];
};

export type Settings = {
  readonly providers: readonly Provider[];
  // The model last used, as a reference 'providerId::modelId' (model-ref.ts). Written when
  // a conversation's model is switched, read to open the next new conversation. Not a
  // setting: nothing on the settings screen edits it.
  readonly defaultModel?: string;
  readonly officePolicy?: OfficePolicy;
};

export type StoredSettings = {
  readonly providers: readonly StoredProvider[];
  readonly defaultModel?: string;
  readonly officePolicy?: OfficePolicy;
};

export type MessagePart =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool';
      readonly toolUseId: string;
      readonly name: string;
      readonly input: unknown;
      readonly result?: string;
      readonly status: 'running' | 'done' | 'error';
      // Set when this call ran inside a delegated subagent: the id of the tool call
      // that spawned it. The thread nests these under their parent's card.
      readonly parentToolUseId?: string;
    };

// What a turn cost, for the faint line under an answer. Absent on every message written
// before it was recorded, and on user messages, which cost nothing.
export type TurnStats = {
  readonly durationMs: number;
  readonly toolCalls: number;
  readonly toolErrors: number;
};

export type Message = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly parts: readonly MessagePart[];
  readonly createdAt: string;
  readonly stats?: TurnStats;
};

export type Conversation = {
  readonly id: ConversationId;
  readonly title: string;
  // A model reference, 'providerId::modelId'.
  readonly model: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  // Captured from the SDK so a turn can resume after a restart. Absent on turn one.
  readonly sdkSessionId?: string;
  // True once the user has named this conversation themselves. Their name then survives
  // everything the app would otherwise call it.
  readonly userRenamed?: boolean;
  readonly messages: readonly Message[];
};

// What the sidebar lists: a conversation without its messages, so listing does
// not read every message of every conversation off disk.
export type ConversationMeta = Omit<Conversation, 'messages'>;
