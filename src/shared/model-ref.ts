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

const SEPARATOR = '::';

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
