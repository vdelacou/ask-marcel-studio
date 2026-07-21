import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from './memory-service.ts';
import type { MemoryService } from './memory-service.ts';
import type { MemoryEvent } from '../../../shared/ipc-contract.ts';
import type { RawCandidate } from '../../../shared/memory-extract.ts';
import { NOTE_LIMIT } from '../../../shared/memory-glossary.ts';

let userData = '';
let service: MemoryService;
let events: MemoryEvent[] = [];
let nextId = 0;

const found = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  kind: 'jargon',
  term: 'QW',
  detail: 'quick win',
  alternatives: ['quality watch'],
  quote: 'another QW',
  ...over,
});

const noteAt = (name: string): string => join(userData, 'claude-config', 'memory', `${name}.md`);

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-memory-'));
  events = [];
  nextId = 0;
  service = createMemoryService({
    userData,
    now: () => '2026-07-21T10:00:00.000Z',
    newId: () => {
      nextId += 1;
      return `c${String(nextId)}`;
    },
    emit: (event) => events.push(event),
  });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('asking before remembering', () => {
  test('nothing is waiting on a fresh install', async () => {
    expect(await service.pending()).toEqual({ ok: true, value: [] });
  });

  test('something found in a conversation is queued, not written', async () => {
    // Guessing what somebody's abbreviation means and acting on it forever is the
    // failure this whole feature is arranged to avoid.
    expect(await service.addCandidates([found()], 'conv-1')).toEqual({ ok: true, value: 1 });

    const waiting = await service.pending();
    expect(waiting.ok && waiting.value[0]).toMatchObject({ term: 'QW', suggestedDetail: 'quick win', conversationId: 'conv-1', quote: 'another QW' });
    expect(await service.read('jargon')).toEqual({ ok: true, value: '' });
  });

  test('the renderer is told there is something to ask', async () => {
    await service.addCandidates([found()], 'conv-1');

    expect(events).toEqual([{ type: 'pending-changed', count: 1 }]);
  });

  test('finding nothing new tells nobody anything', async () => {
    await service.addCandidates([found()], 'conv-1');
    events = [];

    expect(await service.addCandidates([found()], 'conv-2')).toEqual({ ok: true, value: 0 });
    expect(events).toEqual([]);
  });

  test('a term already in the notes is never asked about', async () => {
    await service.write('jargon', '# Words we use\n\n- **QW**: quick win\n');

    expect(await service.addCandidates([found()], 'conv-1')).toEqual({ ok: true, value: 0 });
  });

  test('what a directory lookup added rides along to the question', async () => {
    await service.addCandidates([found({ kind: 'people', term: 'Anna', enrichment: 'anna@example.com' })], 'conv-1');

    const waiting = await service.pending();
    expect(waiting.ok && waiting.value[0]?.enrichment).toBe('anna@example.com');
  });
});

describe('answering a question', () => {
  test('accepting writes the note the user confirmed, not the one that was suggested', async () => {
    await service.addCandidates([found()], 'conv-1');

    const left = await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win, as finance uses it' });

    expect(left).toEqual({ ok: true, value: [] });
    expect(readFileSync(noteAt('jargon'), 'utf8')).toContain('- **QW**: quick win, as finance uses it');
  });

  test('the note lands where the agent reads it', async () => {
    await service.addCandidates([found()], 'conv-1');
    await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win' });

    expect(readFileSync(join(userData, 'claude-config', 'memory', 'jargon.md'), 'utf8')).toContain('QW');
  });

  test('rejecting writes nothing and drops the question', async () => {
    await service.addCandidates([found()], 'conv-1');

    expect(await service.resolve({ id: 'c1', action: 'reject' })).toEqual({ ok: true, value: [] });
    expect(await service.read('jargon')).toEqual({ ok: true, value: '' });
  });

  test('accepting one leaves the rest waiting', async () => {
    await service.addCandidates([found(), found({ term: 'Sync', detail: 'the standup' })], 'conv-1');

    const left = await service.resolve({ id: 'c1', action: 'accept', detail: 'quick win' });

    expect(left.ok && left.value.map((item) => item.term)).toEqual(['Sync']);
  });

  test('a question already answered elsewhere is not an error', async () => {
    expect((await service.resolve({ id: 'gone', action: 'reject' })).ok).toBe(true);
  });

  test('accepting with nothing written is refused', async () => {
    await service.addCandidates([found()], 'conv-1');

    const refused = await service.resolve({ id: 'c1', action: 'accept', detail: '   ' });

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.kind).toBe('invalid');
  });

  test('an answer to nothing at all is refused', async () => {
    expect((await service.resolve({ action: 'reject' })).ok).toBe(false);
  });
});

describe('the notes themselves', () => {
  test('a note the user edits is stored verbatim', async () => {
    await service.write('team', '# My team\n\n- **Ben**: design\n');

    expect(await service.read('team')).toEqual({ ok: true, value: '# My team\n\n- **Ben**: design\n' });
  });

  test('a name that could reach a path is refused', async () => {
    expect((await service.read('../../etc/passwd')).ok).toBe(false);
    expect((await service.write('../escape', 'x')).ok).toBe(false);
  });

  test('a note longer than the agent will read is refused, not trimmed', async () => {
    const tooLong = 'x'.repeat(NOTE_LIMIT + 1);

    const written = await service.write('jargon', tooLong);

    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.error.kind).toBe('invalid');
    // And nothing landed: a half-saved note would be the very thing this prevents.
    expect(await service.read('jargon')).toEqual({ ok: true, value: '' });
  });

  test('a note at exactly the limit still saves', async () => {
    expect((await service.write('jargon', 'x'.repeat(NOTE_LIMIT))).ok).toBe(true);
  });

  test('accepting a word into a note that is already full is refused, and the question stays', async () => {
    await service.write('jargon', `# Words we use\n\n- **PAD**: ${'x'.repeat(NOTE_LIMIT - 60)}`);
    await service.addCandidates([found({ term: 'SEAO', detail: 'Southeast Asia and Oceania' })], 'c1');
    const waiting = await service.pending();
    const id = waiting.ok ? waiting.value[0]?.id : undefined;

    const resolved = await service.resolve({ id, action: 'accept', detail: 'Southeast Asia and Oceania' });

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error.message).toContain('full');
    // Still queued, so it can be accepted once there is room for it.
    const stillWaiting = await service.pending();
    expect(stillWaiting.ok && stillWaiting.value).toHaveLength(1);
  });

  test('a note that is not text is refused', async () => {
    expect((await service.write('team', 42)).ok).toBe(false);
  });

  test('the glossary handed to the agent is built from all three notes', async () => {
    await service.write('jargon', '- **QW**: quick win');
    await service.write('team', '- **Ben**: design');

    const block = await service.glossaryBlock();

    expect(block).toContain('QW');
    expect(block).toContain('Ben');
  });

  test('nothing written yet adds nothing to the prompt', async () => {
    expect(await service.glossaryBlock()).toBe('');
  });
});

describe('remembering how far each conversation has been read', () => {
  test('a conversation nobody has read has something to read', async () => {
    expect(await service.extractionDue('conv-1', 4)).toBe(true);
  });

  test('one already read is left alone until it carries on', async () => {
    await service.markExtracted('conv-1', 4);

    expect(await service.extractionDue('conv-1', 4)).toBe(false);
    expect(await service.extractionDue('conv-1', 6)).toBe(true);
  });

  test('the app knows where to start reading from', async () => {
    await service.markExtracted('conv-1', 4);

    expect(await service.readSoFar('conv-1')).toBe(4);
    expect(await service.readSoFar('conv-2')).toBe(0);
  });
});

describe('surviving files that are not what they should be', () => {
  test('a corrupt queue is reported rather than silently emptied', async () => {
    mkdirSync(join(userData, 'memory'), { recursive: true });
    writeFileSync(join(userData, 'memory', 'queue.json'), '{"items": "nope"}');

    const waiting = await service.pending();

    expect(waiting.ok).toBe(false);
    if (waiting.ok) return;
    expect(waiting.error.kind).toBe('unreadable');
  });

  test('a corrupt progress file means a conversation is simply read again', async () => {
    mkdirSync(join(userData, 'memory'), { recursive: true });
    writeFileSync(join(userData, 'memory', 'state.json'), 'not json');

    expect(await service.extractionDue('conv-1', 1)).toBe(true);
    expect(await service.readSoFar('conv-1')).toBe(0);
  });
});
