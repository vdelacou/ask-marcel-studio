/*
 * Answering a suggestion from the review list, run against real files in a scratch folder:
 * filing it under another list, skipping it for good, and taking a skip back. Plus the guard
 * on saving a note as text over a version the window never saw. All data here is invented.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const queueFile = (): string => readFileSync(join(userData, 'memory', 'queue.json'), 'utf8');

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-memory-answers-'));
  nextId = 0;
  service = createMemoryService({
    userData,
    now: () => '2026-09-26T10:00:00.000Z',
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

describe('filing a suggestion under the right list', () => {
  test('a suggestion remembered under another list lands in that note, not the one Marcel guessed', async () => {
    await service.addCandidates([found({ term: 'Mei Chen', detail: 'finance lead' })], 'conv-1');

    const answered = await service.resolve({ id: 'c1', action: 'accept', detail: 'finance lead for Greater China', kind: 'team' });

    expect(answered).toEqual({ ok: true, value: [] });
    expect(readNote('team')).toBe('- **Mei Chen**: finance lead for Greater China\n');
    expect(readNote('jargon')).toBe('');
  });

  test('a list that is not one of the three is refused, and the suggestion stays waiting', async () => {
    await service.addCandidates([found()], 'conv-1');

    const answered = await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win', kind: 'secrets' });
    const waiting = await service.pending();

    expect(answered.ok ? 'accepted' : answered.error.kind).toBe('invalid');
    expect(waiting.ok ? waiting.value.map((item) => item.term) : []).toEqual(['QW']);
  });
});

describe('skipping for good', () => {
  test('a skipped word is never asked about again, even from another conversation', async () => {
    await service.addCandidates([found()], 'conv-1');
    await service.resolve({ id: 'c1', action: 'reject' });

    expect(await service.addCandidates([found({ term: 'qw' })], 'conv-2')).toEqual({ ok: true, value: 0 });
    expect(await service.pending()).toEqual({ ok: true, value: [] });
  });

  test('a skip keeps the word and nothing of the sentence it came from', async () => {
    await service.addCandidates([found({ quote: 'the QW slipped past the steering committee again' })], 'conv-1');
    await service.resolve({ id: 'c1', action: 'reject' });

    expect(queueFile()).toContain('"qw"');
    expect(queueFile()).not.toContain('steering committee');
  });

  test('undoing a skip puts the suggestion back, and the word is no longer held back', async () => {
    await service.addCandidates([found()], 'conv-1');
    const waiting = await service.pending();
    await service.resolve({ id: 'c1', action: 'reject' });

    const restored = await service.resolve({ action: 'restore', candidate: waiting.ok ? waiting.value[0] : undefined });

    expect(restored.ok ? restored.value.map((item) => item.term) : []).toEqual(['QW']);
    expect(queueFile()).not.toContain('"qw"');
  });

  test('an answer that is neither remember, skip nor undo is refused, and the suggestion stays waiting', async () => {
    await service.addCandidates([found()], 'conv-1');

    const answered = await service.resolve({ id: 'c1', action: 'forget' });
    const waiting = await service.pending();

    expect(answered.ok ? 'answered' : answered.error.kind).toBe('invalid');
    expect(waiting.ok ? waiting.value.map((item) => item.term) : []).toEqual(['QW']);
    expect(queueFile()).not.toContain('"qw"');
  });

  test('an undo carrying something that is not a suggestion is refused', async () => {
    const answered = await service.resolve({ action: 'restore', candidate: { term: 'QW' } });

    expect(answered.ok ? 'restored' : answered.error.kind).toBe('invalid');
  });
});

describe('saving a note as text', () => {
  const seed = (text: string): void => {
    mkdirSync(join(userData, 'claude-config', 'memory'), { recursive: true });
    writeFileSync(noteAt('jargon'), text);
  };

  test('a note saved over a version the window never opened is refused, and the file is left as it is', async () => {
    seed('- **QW**: quick win\n- **OTIF**: on time, in full\n');

    const saved = await service.write('jargon', '- **QW**: quick win\n', '- **QW**: quick win\n');

    expect(saved.ok ? 'written' : saved.error.kind).toBe('conflict');
    expect(readNote('jargon')).toBe('- **QW**: quick win\n- **OTIF**: on time, in full\n');
  });

  test('a note saved over the version it opened is written', async () => {
    seed('- **QW**: quick win\n');

    expect(await service.write('jargon', '- **QW**: a saving inside the quarter\n', '- **QW**: quick win\n')).toEqual({ ok: true, value: null });
    expect(readNote('jargon')).toBe('- **QW**: a saving inside the quarter\n');
  });
});
