/*
 * The lists on the memory page change a note one entry at a time. These run the service
 * against real files in a scratch folder, because what matters is what lands on disk: the
 * note rewritten without the entry, or left byte for byte when a change is refused, and two
 * changes arriving together never undoing each other. All data here is invented.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryService } from './memory-service.ts';
import type { MemoryService } from './memory-service.ts';

let userData = '';
let service: MemoryService;

const notesDir = (): string => join(userData, 'claude-config', 'memory');

const noteAt = (name: string): string => join(notesDir(), `${name}.md`);

const writeNote = (name: string, text: string): void => {
  mkdirSync(notesDir(), { recursive: true });
  writeFileSync(noteAt(name), text);
};

const readNote = (name: string): string => readFileSync(noteAt(name), 'utf8');

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'studio-memory-edits-'));
  service = createMemoryService({ userData, now: () => '2026-09-26T10:00:00.000Z', newId: () => 'c1', emit: () => undefined });
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('changing a note one entry at a time', () => {
  test('removing a word rewrites its note and hands back all three notes', async () => {
    writeNote('jargon', '- **QW**: quick win\n- **OTIF**: on time, in full\n');
    writeNote('team', '- **Mei Chen**: finance lead\n');

    const changed = await service.edit({ action: 'remove', note: 'jargon', entry: { term: 'QW', detail: 'quick win' } });

    expect(changed).toEqual({ ok: true, value: { jargon: '- **OTIF**: on time, in full\n', team: '- **Mei Chen**: finance lead\n', people: '' } });
    expect(readNote('jargon')).toBe('- **OTIF**: on time, in full\n');
  });

  test('a refused change leaves the note on disk exactly as it was', async () => {
    const handWritten = '# Words we use\n\nThings finance says:\n- **QW**: quick win\n';
    writeNote('jargon', handWritten);

    const refused = await service.edit({ action: 'add', note: 'jargon', entry: { term: 'qw', detail: 'quality watch' } });

    expect(refused.ok ? 'accepted' : refused.error.kind).toBe('duplicate');
    expect(readNote('jargon')).toBe(handWritten);
  });

  test('moving someone writes both notes', async () => {
    writeNote('team', '- **Mei Chen**: finance lead\n- **Tom Okafor**: head of infrastructure\n');

    await service.edit({ action: 'move', note: 'team', to: 'people', entry: { term: 'Mei Chen', detail: 'finance lead' } });

    expect(readNote('team')).toBe('- **Tom Okafor**: head of infrastructure\n');
    expect(readNote('people')).toBe('- **Mei Chen**: finance lead\n');
  });

  test('two removals sent together both stick', async () => {
    writeNote('jargon', '- **QW**: quick win\n- **OTIF**: on time, in full\n- **PO**: purchase order\n');

    await Promise.all([
      service.edit({ action: 'remove', note: 'jargon', entry: { term: 'QW', detail: 'quick win' } }),
      service.edit({ action: 'remove', note: 'jargon', entry: { term: 'PO', detail: 'purchase order' } }),
    ]);

    expect(readNote('jargon')).toBe('- **OTIF**: on time, in full\n');
  });

  test('a change and an accepted suggestion sent together both stick', async () => {
    writeNote('jargon', '- **QW**: quick win\n- **PO**: purchase order\n');
    await service.addCandidates([{ kind: 'jargon', term: 'OTIF', detail: 'on time, in full', alternatives: [], quote: 'OTIF slipped again' }], 'conv-1');

    await Promise.all([
      service.edit({ action: 'remove', note: 'jargon', entry: { term: 'QW', detail: 'quick win' } }),
      service.resolve({ id: 'c1', action: 'accept', detail: 'on time, in full' }),
    ]);

    expect(readNote('jargon')).toBe('- **PO**: purchase order\n- **OTIF**: on time, in full\n');
  });

  test('a malformed change is refused before any note is touched', async () => {
    const refused = await service.edit({ action: 'add', note: '../../outside', entry: { term: 'QW', detail: 'quick win' } });

    expect(refused.ok ? 'accepted' : refused.error.kind).toBe('invalid');
    expect(existsSync(join(userData, 'claude-config'))).toBe(false);
  });
});
