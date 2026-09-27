/*
 * "Clear all memories", run against the real memory service and document store in a scratch
 * folder: every note, every waiting suggestion, every skipped word and the three documents
 * gone, and nothing more. All data here is invented.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClearAll } from './clear-all.ts';
import { createMemoryService } from './memory-service.ts';
import type { MemoryService } from './memory-service.ts';
import { createAgentFilesStore } from '../store/agent-files-store.ts';
import type { AgentFilesStore } from '../store/agent-files-store.ts';
import type { AgentFileDoc } from '../../../shared/agent-files.ts';
import type { RawCandidate } from '../../../shared/memory-extract.ts';
import { err } from '../../../shared/result.ts';

let userData = '';
let memory: MemoryService;
let documents: AgentFilesStore;
let nextId = 0;

const config = (...parts: readonly string[]): string => join(userData, 'claude-config', ...parts);

const read = (at: string): string => (existsSync(at) ? readFileSync(at, 'utf8') : '');

const found = (term: string, detail: string): RawCandidate => ({ kind: 'jargon', term, detail, alternatives: [], quote: `${term} came up again` });

const clearEverything = (): ReturnType<ReturnType<typeof createClearAll>> =>
  createClearAll({ clearMemory: memory.clearAll, clearDocument: (doc: AgentFileDoc) => documents.save(doc, '') })();

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'studio-clear-all-'));
  nextId = 0;
  memory = createMemoryService({
    userData,
    now: () => '2026-09-26T10:00:00.000Z',
    newId: () => {
      nextId += 1;
      return `c${String(nextId)}`;
    },
    emit: () => undefined,
  });
  documents = createAgentFilesStore({ userData });
  mkdirSync(config('memory'), { recursive: true });
  writeFileSync(config('memory', 'jargon.md'), '- **QW**: quick win\n');
  writeFileSync(config('memory', 'team.md'), '- **Mei Chen**: finance lead\n');
  writeFileSync(config('memory', 'people.md'), '- **Hannah Weiss**: audit partner\n');
  writeFileSync(config('global-context.md'), 'I run IT for the Shanghai site.\n');
  writeFileSync(config('voice-profile.md'), 'Short sentences.\n');
  writeFileSync(config('signature.html'), '<p>Mei Chen</p>');
  await memory.addCandidates([found('OTIF', 'on time, in full'), found('TMFF', 'an old freight system')], 'conv-1');
  await memory.resolve({ id: 'c2', action: 'reject' });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('clearing all memories', () => {
  test('clearing everything empties the three notes, the waiting suggestions, the skipped words and the three documents', async () => {
    expect(await clearEverything()).toEqual({ ok: true, value: null });

    expect([read(config('memory', 'jargon.md')), read(config('memory', 'team.md')), read(config('memory', 'people.md'))]).toEqual(['', '', '']);
    expect(await memory.pending()).toEqual({ ok: true, value: [] });
    expect(read(join(userData, 'memory', 'queue.json'))).not.toContain('tmff');
    expect([read(config('global-context.md')), read(config('voice-profile.md')), read(config('signature.html'))]).toEqual(['', '', '']);
    expect(await memory.addCandidates([found('TMFF', 'an old freight system')], 'conv-2')).toEqual({ ok: true, value: 1 });
  });

  test('the reading progress is kept, so old conversations are not read again for what was just cleared', async () => {
    await memory.markExtracted('conv-1', 4);

    await clearEverything();

    expect(await memory.extractionDue('conv-1', 4)).toBe(false);
  });

  test('a document that cannot be cleared is named in the error, and the rest is still cleared', async () => {
    const clearAll = createClearAll({
      clearMemory: memory.clearAll,
      clearDocument: (doc: AgentFileDoc) => (doc === 'signature' ? Promise.resolve(err({ message: 'the disk is full' })) : documents.save(doc, '')),
    });

    const cleared = await clearAll();

    expect(cleared.ok ? 'cleared' : cleared.error.message).toContain('email signature');
    expect(read(config('memory', 'jargon.md'))).toBe('');
    expect(read(config('global-context.md'))).toBe('');
    expect(read(config('signature.html'))).toBe('<p>Mei Chen</p>');
  });
});
