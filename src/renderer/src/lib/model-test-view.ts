/*
 * Turning a test verdict into the row underneath the model.
 *
 * The tone is a typed variant, not a class name: the design system decides what "bad"
 * looks like (rule 22), and this decides which of the six outcomes counts as bad.
 *
 * Pure: no react, no electron.
 */
import type { ModelTestOutcome, ModelTestVerdict } from '../../../shared/model-test.ts';

export type ModelTestTone = 'good' | 'warn' | 'bad';

export type ModelTestRow = { readonly isRunning: boolean; readonly message?: string; readonly tone?: ModelTestTone };

// Busy is not a fault: the key and the model name were both accepted, the provider
// just has nothing spare this second. Everything else that is not a pass is something
// the person has to change.
export const toneForOutcome = (outcome: ModelTestOutcome): ModelTestTone => {
  if (outcome === 'works') return 'good';
  if (outcome === 'busy' || outcome === 'provider-error') return 'warn';
  return 'bad';
};

export const rowForTest = (state: { readonly isRunning: boolean; readonly verdict?: ModelTestVerdict } | undefined): ModelTestRow | undefined => {
  if (state === undefined) return undefined;
  if (state.isRunning) return { isRunning: true, message: 'Testing…' };
  if (state.verdict === undefined) return undefined;
  return { isRunning: false, message: state.verdict.message, tone: toneForOutcome(state.verdict.outcome) };
};
