/*
 * A word the user writes into the notes themselves, while Marcel's suggestion for it is still
 * waiting, takes that suggestion off the review list: remembering it would write over what they
 * wrote. Run against real files in a scratch folder. All data here is invented.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from './memory-service.ts';
import type { MemoryService } from './memory-service.ts';
import type { MemoryEvent } from '../../../shared/ipc-contract.ts';
import type { RawCandidate } from '../../../shared/memory-extract.ts';

let userData = '';
let service: MemoryService;
let nextId = 0;
let events: MemoryEvent[] = [];

const found = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  kind: 'jargon',
  term: 'QW',
  detail: 'quick win',
  alternatives: [],
  quote: 'another QW for the quarter',
  ...over,
});

const waitingTerms = async (): Promise<readonly string[]> => {
  const waiting = await service.pending();
  return waiting.ok ? waiting.value.map((item) => item.term) : [];
};

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-memory-known-'));
  nextId = 0;
  events = [];
  service = createMemoryService({
    userData,
    now: () => '2026-09-27T10:00:00.000Z',
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

describe('a word written into the notes by hand', () => {
  test('leaves the review list, and the list is told', async () => {
    await service.addCandidates([found(), found({ term: 'OTIF', detail: 'on time, in full' })], 'conv-1');
    events = [];

    await service.edit({ action: 'add', note: 'jargon', entry: { term: 'qw', detail: 'quality watch, as finance uses it' } });

    expect(await waitingTerms()).toEqual(['OTIF']);
    expect(events).toEqual([{ type: 'pending-changed', count: 1 }]);
  });

  test('stays off the list after another suggestion is answered', async () => {
    await service.addCandidates([found(), found({ term: 'OTIF', detail: 'on time, in full' })], 'conv-1');
    await service.edit({ action: 'add', note: 'jargon', entry: { term: 'QW', detail: 'quality watch' } });

    expect(await service.resolve({ id: 'c2', action: 'reject' })).toEqual({ ok: true, value: [] });
  });

  test('a person added to the team leaves the list, whichever list Marcel filed them under', async () => {
    await service.addCandidates([found({ kind: 'people', term: 'Mei Chen', detail: 'finance lead' })], 'conv-1');

    await service.edit({ action: 'add', note: 'team', entry: { term: 'Mei Chen', detail: 'finance lead for Greater China' } });

    expect(await waitingTerms()).toEqual([]);
  });

  test('a word saved from the text view leaves the list too', async () => {
    await service.addCandidates([found()], 'conv-1');

    await service.write('jargon', '- **QW**: quality watch\n', '');

    expect(await waitingTerms()).toEqual([]);
  });

  test('a word written nowhere yet is still asked about', async () => {
    await service.addCandidates([found()], 'conv-1');

    await service.edit({ action: 'add', note: 'jargon', entry: { term: 'OTIF', detail: 'on time, in full' } });

    expect(await waitingTerms()).toEqual(['QW']);
  });
});
