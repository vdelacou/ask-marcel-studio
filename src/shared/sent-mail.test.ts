import { describe, expect, test } from 'bun:test';
import { pickSentMessageId } from './sent-mail.ts';

const envelope = (value: unknown): string => JSON.stringify({ ok: true, data: { value } });

describe('finding a sent message to take a signature from', () => {
  test('the first message in the folder is the one', () => {
    expect(pickSentMessageId(envelope([{ id: 'AAA', subject: 'Re: budget' }, { id: 'BBB' }]))).toBe('AAA');
  });

  test('an entry with no id is skipped rather than ending the search', () => {
    expect(pickSentMessageId(envelope([{ subject: 'no id' }, { id: 'BBB' }]))).toBe('BBB');
  });

  test('an empty id counts as no id', () => {
    expect(pickSentMessageId(envelope([{ id: '' }, { id: 'BBB' }]))).toBe('BBB');
  });

  test('an entry that is not an object is skipped', () => {
    expect(pickSentMessageId(envelope(['nope', { id: 'BBB' }]))).toBe('BBB');
  });

  test('an empty sent folder yields nothing', () => {
    expect(pickSentMessageId(envelope([]))).toBeUndefined();
  });

  test('output that is not the expected envelope yields nothing', () => {
    expect(pickSentMessageId(JSON.stringify({ ok: false, error: 'not signed in' }))).toBeUndefined();
    expect(pickSentMessageId(JSON.stringify({ ok: true, data: { value: 'nope' } }))).toBeUndefined();
    expect(pickSentMessageId(JSON.stringify({ ok: true, data: 'nope' }))).toBeUndefined();
  });

  test('output that is not json at all yields nothing', () => {
    expect(pickSentMessageId('command not found')).toBeUndefined();
    expect(pickSentMessageId('')).toBeUndefined();
  });
});
