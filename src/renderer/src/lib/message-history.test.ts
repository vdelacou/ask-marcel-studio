import { describe, expect, test } from 'bun:test';
import { stepHistory } from './message-history.ts';

// Oldest first, the order the transcript has them in.
const SENT: readonly string[] = ['what is in my inbox', 'who is the CIO of Celine', 'draft a reply to Herve'];

describe('bringing back something you already sent', () => {
  test('pressing up in an empty box brings back the last thing you sent', () => {
    expect(stepHistory({ entries: SENT, pending: '', direction: -1 })).toEqual({ draft: 'draft a reply to Herve', depth: 1 });
  });

  test('pressing up again brings back the message before it', () => {
    expect(stepHistory({ entries: SENT, depth: 1, pending: '', direction: -1 })).toEqual({ draft: 'who is the CIO of Celine', depth: 2 });
  });

  test('pressing up at the oldest message stays there', () => {
    expect(stepHistory({ entries: SENT, depth: 3, pending: '', direction: -1 })).toBeUndefined();
  });

  test('pressing down comes back to the newer message', () => {
    expect(stepHistory({ entries: SENT, depth: 2, pending: '', direction: 1 })).toEqual({ draft: 'draft a reply to Herve', depth: 1 });
  });

  test('pressing down past the newest gives back what you were typing', () => {
    expect(stepHistory({ entries: SENT, depth: 1, pending: 'half a thought', direction: 1 })).toEqual({ draft: 'half a thought' });
  });

  test('pressing up with nothing sent yet does nothing', () => {
    expect(stepHistory({ entries: [], pending: '', direction: -1 })).toBeUndefined();
  });
});
