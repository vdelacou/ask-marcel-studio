/*
 * What the memory service never does to the notes, run against real files in a scratch folder:
 * split a remembered entry over two lines, write over a note it could not read, or let a
 * suggestion found in the background undo an answer. All data here is invented.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createMemoryService } from './memory-service.ts';
import type { MemoryService } from './memory-service.ts';
import type { RawCandidate } from '../../../shared/memory-extract.ts';

let userData = '';
let service: MemoryService;
let nextId = 0;

const found = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  kind: 'jargon',
  term: 'QW',
  detail: 'quick win',
  alternatives: [],
  quote: 'another QW for the quarter',
  ...over,
});

const noteAt = (name: string): string => join(userData, 'claude-config', 'memory', `${name}.md`);

const readNote = (name: string): string => (existsSync(noteAt(name)) ? readFileSync(noteAt(name), 'utf8') : '');

const writeNote = (name: string, text: string): void => {
  mkdirSync(dirname(noteAt(name)), { recursive: true });
  writeFileSync(noteAt(name), text);
};

const waitingTerms = async (): Promise<readonly string[]> => {
  const waiting = await service.pending();
  return waiting.ok ? waiting.value.map((item) => item.term) : [];
};

// The note is there, but the app is not allowed to read it: the stand-in for a file that exists
// and cannot be read for any reason other than being missing.
const lockNote = (name: string, text: string): void => {
  writeNote(name, text);
  chmodSync(noteAt(name), 0o000);
};

const unlockNote = (name: string): void => chmodSync(noteAt(name), 0o644);

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-memory-safety-'));
  nextId = 0;
  service = createMemoryService({
    userData,
    now: () => '2026-09-27T10:00:00.000Z',
    newId: () => {
      nextId += 1;
      return `c${String(nextId)}`;
    },
    emit: () => undefined,
  });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('an entry remembered from the review list is one line', () => {
  test('a meaning written over two lines is remembered on one', async () => {
    await service.addCandidates([found()], 'conv-1');

    await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win:\na saving that lands inside the quarter' });

    expect(readNote('jargon')).toBe('- **QW**: quick win: a saving that lands inside the quarter\n');
  });

  test('a word written over two lines is remembered as one word', async () => {
    await service.addCandidates([found({ term: 'Green lane', detail: 'customs pre-clearance' })], 'conv-1');

    await service.resolve({ id: 'c1', action: 'accept', detail: 'customs pre-clearance', term: 'Green\nlane' });

    expect(readNote('jargon')).toBe('- **Green lane**: customs pre-clearance\n');
  });

  test('a word with an asterisk in it is refused, whoever wrote it, and the suggestion stays waiting', async () => {
    await service.addCandidates([found(), found({ term: 'Q*W', detail: 'quick win' })], 'conv-1');

    const typed = await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win', term: 'Q*W' });
    const heard = await service.resolve({ id: 'c2', action: 'accept', detail: 'quick win' });

    expect(typed.ok ? 'remembered' : typed.error.kind).toBe('invalid');
    expect(heard.ok ? 'remembered' : heard.error.kind).toBe('invalid');
    expect(readNote('jargon')).toBe('');
    expect(await waitingTerms()).toEqual(['QW', 'Q*W']);
  });
});

describe('a note that cannot be read is never written over', () => {
  const HELD = '- **OTIF**: on time, in full\n';

  test('remembering a suggestion into it leaves the note, and the suggestion, as they were', async () => {
    await service.addCandidates([found()], 'conv-1');
    lockNote('jargon', HELD);

    const answered = await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win' });
    unlockNote('jargon');

    expect(answered.ok ? 'remembered' : answered.error.kind).toBe('unreadable');
    expect(readNote('jargon')).toBe(HELD);
    expect(await waitingTerms()).toEqual(['QW']);
  });

  test('a change from the list is refused and the note is left as it was', async () => {
    lockNote('jargon', HELD);

    const changed = await service.edit({ action: 'add', note: 'jargon', entry: { term: 'QW', detail: 'quick win' } });
    unlockNote('jargon');

    expect(changed.ok ? 'changed' : changed.error.kind).toBe('unreadable');
    expect(readNote('jargon')).toBe(HELD);
  });

  test('saving it as text is refused, even from a window that opened it empty', async () => {
    lockNote('jargon', HELD);

    const saved = await service.write('jargon', '- **QW**: quick win\n', '');
    unlockNote('jargon');

    expect(saved.ok ? 'saved' : saved.error.kind).toBe('unreadable');
    expect(readNote('jargon')).toBe(HELD);
  });

  test('a change to another note still goes through', async () => {
    lockNote('people', '- **Hannah Weiss**: partner at the audit firm\n');

    const changed = await service.edit({ action: 'add', note: 'jargon', entry: { term: 'QW', detail: 'quick win' } });
    unlockNote('people');

    expect(changed.ok).toBe(true);
    expect(readNote('jargon')).toBe('- **QW**: quick win\n');
  });
});

describe('a suggestion found in the background waits for the answers', () => {
  test('a suggestion found while a word is being skipped does not bring the word back', async () => {
    await service.addCandidates([found()], 'conv-1');

    const [skipped] = await Promise.all([service.resolve({ id: 'c1', action: 'reject' }), service.addCandidates([found({ term: 'OTIF', detail: 'on time, in full' })], 'conv-2')]);

    expect(skipped.ok).toBe(true);
    expect(await waitingTerms()).toEqual(['OTIF']);
    expect(await service.addCandidates([found()], 'conv-3')).toEqual({ ok: true, value: 0 });
  });
});
