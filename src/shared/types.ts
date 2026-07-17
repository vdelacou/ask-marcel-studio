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

export type Settings = {
  readonly providers: readonly Provider[];
  // A model reference, 'providerId::modelId'. See model-ref.ts.
  readonly defaultModel?: string;
};

export type StoredSettings = {
  readonly providers: readonly StoredProvider[];
  readonly defaultModel?: string;
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
    };

export type Message = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly parts: readonly MessagePart[];
  readonly createdAt: string;
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
  readonly messages: readonly Message[];
};

// What the sidebar lists: a conversation without its messages, so listing does
// not read every message of every conversation off disk.
export type ConversationMeta = Omit<Conversation, 'messages'>;
