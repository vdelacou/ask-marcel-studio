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
