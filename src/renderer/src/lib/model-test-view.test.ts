import { describe, expect, test } from 'bun:test';
import { rowForTest, toneForOutcome } from './model-test-view.ts';

describe('how a verdict reads under the model', () => {
  test('a model that works reads as good', () => {
    expect(toneForOutcome('works')).toBe('good');
  });

  test('a busy provider is not the user doing something wrong', () => {
    expect(toneForOutcome('busy')).toBe('warn');
    expect(toneForOutcome('provider-error')).toBe('warn');
  });

  test('anything the person has to fix reads as bad', () => {
    expect(toneForOutcome('key-refused')).toBe('bad');
    expect(toneForOutcome('model-unknown')).toBe('bad');
    expect(toneForOutcome('unreachable')).toBe('bad');
  });
});

describe('the row under a model', () => {
  test('a model never tested has no row at all', () => {
    expect(rowForTest(undefined)).toBeUndefined();
  });

  test('a test in flight says so, without a tone to colour it', () => {
    expect(rowForTest({ isRunning: true })).toEqual({ isRunning: true, message: 'Testing…' });
  });

  test('a finished test shows what came back', () => {
    expect(rowForTest({ isRunning: false, verdict: { outcome: 'works', message: 'Works. The model answered.' } })).toEqual({
      isRunning: false,
      message: 'Works. The model answered.',
      tone: 'good',
    });
  });

  test('a running test outranks the verdict it is replacing, so the old answer is not shown as current', () => {
    expect(rowForTest({ isRunning: true, verdict: { outcome: 'key-refused', message: 'stale' } })).toEqual({ isRunning: true, message: 'Testing…' });
  });

  test('a row that is neither running nor answered shows nothing', () => {
    expect(rowForTest({ isRunning: false })).toBeUndefined();
  });
});
