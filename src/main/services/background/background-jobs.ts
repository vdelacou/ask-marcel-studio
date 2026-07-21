/*
 * What each background job actually does.
 *
 * The seam between the queue (which knows about order and failure) and the services
 * (which know about signatures and voice). It also resolves the one thing every
 * model-backed job needs and no service should resolve for itself: which model, in
 * which environment, under which guard. That resolution is deliberately the same one a
 * conversation does, so a background job cannot end up on a different model or a looser
 * shell than the user's own turns.
 */
import { buildAgentHooks } from '../agent/agent-hooks.ts';
import { buildSessionEnv } from '../../../shared/session-env.ts';
import { formatModelRef, parseModelRef } from '../../../shared/model-ref.ts';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { BackgroundJob, BackgroundJobError } from './background-runner.ts';
import type { SignatureService } from '../office/signature-service.ts';
import type { VoiceProfileJob } from './voice-profile-job.ts';
import type { MemoryExtractor } from '../memory/memory-extractor.ts';
import type { Gateway } from '../gateway/gateway-server.ts';
import type { SettingsStore } from '../store/settings-store.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type BackgroundSession = {
  readonly model: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly hooks: NonNullable<Options['hooks']>;
};

export type BackgroundJobsDeps = {
  readonly settings: SettingsStore;
  readonly gateway: Gateway;
  readonly signature: SignatureService;
  readonly voice: VoiceProfileJob;
  readonly memoryExtractor: MemoryExtractor;
  readonly userData: string;
  readonly workspaceDir: string;
  readonly inheritedEnv: Readonly<Record<string, string | undefined>>;
  readonly officeCommandCategories: ReadonlyMap<string, string>;
};

export type BackgroundJobs = {
  readonly run: (job: BackgroundJob, signal: AbortSignal) => Promise<Result<null, BackgroundJobError>>;
  // Handed to the model-backed jobs so they never resolve a model themselves.
  readonly session: () => Promise<Result<BackgroundSession, string>>;
};

export const createBackgroundJobs = (deps: BackgroundJobsDeps): BackgroundJobs => {
  const session = async (): Promise<Result<BackgroundSession, string>> => {
    const settings = await deps.settings.get();
    if (!settings.ok) return err(settings.error.message);

    const reference = settings.value.defaultModel ?? defaultReference(settings.value.providers);
    if (reference === undefined) return err('no model is set up yet');

    const parsed = parseModelRef(reference);
    if (!parsed.ok) return err(parsed.error.message);
    const provider = settings.value.providers.find((candidate) => candidate.id === parsed.value.providerId);
    if (provider === undefined) return err('the model this app is set to use is not configured any more');

    // Same gateway path a conversation takes, so an OpenAI-compatible provider works
    // here exactly as it does on screen.
    const gateway = provider.kind === 'openai' ? await deps.gateway.start() : undefined;
    const model = gateway === undefined ? parsed.value.modelId : formatModelRef({ providerId: provider.id, modelId: parsed.value.modelId });
    const disabledOfficeCategories = settings.value.officePolicy?.disabledCategories ?? [];

    return ok({
      model,
      cwd: deps.workspaceDir,
      env: buildSessionEnv({ provider, modelId: parsed.value.modelId, userData: deps.userData, inheritedEnv: deps.inheritedEnv, ...(gateway === undefined ? {} : { gateway }) }),
      hooks: buildAgentHooks({ workspaceDir: deps.workspaceDir, disabledOfficeCategories, officeCommandCategories: deps.officeCommandCategories }),
    });
  };

  const run = (job: BackgroundJob, signal: AbortSignal): Promise<Result<null, BackgroundJobError>> => {
    if (job.kind === 'signature-prefill') return deps.signature.prefill(job.force === true);
    if (job.kind === 'voice-profile') return deps.voice.run(job.force === true, signal);
    return deps.memoryExtractor.extract(job.conversationId, signal);
  };

  return { run, session };
};

// With no explicit choice, the same fallback the app makes on screen: the first model
// of the first provider.
const defaultReference = (providers: readonly { readonly id: string; readonly modelIds: readonly string[] }[]): string | undefined => {
  const first = providers[0];
  const model = first?.modelIds[0];
  if (first === undefined || model === undefined) return undefined;
  return formatModelRef({ providerId: first.id, modelId: model });
};
