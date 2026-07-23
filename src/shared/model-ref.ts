/*
 * A model reference addresses one model on one configured provider.
 *
 * Wire format is `providerId::modelId`. The agent runtime passes the bare
 * modelId to the SDK when the provider is Anthropic (direct), and the whole
 * reference when the provider is OpenAI-compatible (routed via the local
 * gateway, which reads providerId back out to pick the upstream baseURL).
 *
 * Pure: zero electron imports, so `bun test` can cover it.
 */
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

// Exported so settings-doc can reject a provider id containing it, rather than
// hardcoding '::' in a second place where the two could drift apart.
export const MODEL_REF_SEPARATOR = '::';
const SEPARATOR = MODEL_REF_SEPARATOR;

export type ModelRef = {
  readonly providerId: string;
  readonly modelId: string;
};

export type ModelRefError = {
  readonly kind: 'malformed';
  readonly reference: string;
  readonly message: string;
};

export const formatModelRef = (ref: ModelRef): string => `${ref.providerId}${SEPARATOR}${ref.modelId}`;

// Just enough of a provider to check a reference against it, so both the settings
// document and an in-progress draft can be checked by the same function.
export type ConfiguredProvider = { readonly id: string; readonly modelIds: readonly string[] };

export const parseModelRef = (reference: string): Result<ModelRef, ModelRefError> => {
  const at = reference.indexOf(SEPARATOR);
  if (at <= 0) return err({ kind: 'malformed', reference, message: `model reference must be 'providerId${SEPARATOR}modelId'` });

  const providerId = reference.slice(0, at);
  // Everything after the FIRST separator is the model id: OpenAI-compatible
  // gateways route ids that themselves contain colons.
  const modelId = reference.slice(at + SEPARATOR.length);
  if (modelId.length === 0) return err({ kind: 'malformed', reference, message: `model reference must be 'providerId${SEPARATOR}modelId'` });

  return ok({ providerId, modelId });
};

// Whether a reference still names something the user has set up. A conversation
// carries its model, and a provider can be removed or renamed long after: pointing a
// turn at a model that is gone fails deep inside the runtime, so it is checked at the
// boundary instead.
export const modelRefIsConfigured = (providers: readonly ConfiguredProvider[], reference: string): boolean => {
  const parsed = parseModelRef(reference);
  if (!parsed.ok) return false;
  const provider = providers.find((p) => p.id === parsed.value.providerId);
  if (provider === undefined) return false;
  return provider.modelIds.includes(parsed.value.modelId);
};

// Which model a new conversation opens on: the one last used, as long as it still exists.
//
// There is no setting for this. The app remembers the last model chosen and opens the next
// conversation on it, so switching model in a conversation quietly sets the direction for
// the ones after it. `remembered` is therefore only ever a record of what happened, never a
// preference the user maintained, which is why it is allowed to go stale: a provider removed
// in settings simply moves the answer on to the first model still configured rather than
// leaving a new conversation pinned to a model that would fail on its first turn.
//
// Undefined means nothing is configured at all, so there is no conversation to open.
export const modelForNewConversation = (providers: readonly ConfiguredProvider[], remembered: string | undefined): string | undefined => {
  if (remembered !== undefined && modelRefIsConfigured(providers, remembered)) return remembered;
  // Every reference the user has configured, in the order they arranged their providers;
  // the first is the answer, and undefined when there is none. Built as a flat list rather
  // than found-then-indexed because a provider carrying no models then contributes nothing
  // and is passed over for free, with no guard that no test could ever tell apart.
  return providers.flatMap((provider) => provider.modelIds.map((modelId) => formatModelRef({ providerId: provider.id, modelId })))[0];
};
