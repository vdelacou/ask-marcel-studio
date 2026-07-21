import { describe, expect, test } from 'bun:test';
import { MEMORY_FILES, memoryFileName } from './memory-file-name.ts';
import { unwrap } from './result.ts';

describe('naming which note is being read or written', () => {
  test('each of the three notes is accepted', () => {
    for (const name of MEMORY_FILES) expect(unwrap(memoryFileName(name))).toBe(name);
  });

  test('the three are exactly the notes this app keeps', () => {
    expect(MEMORY_FILES).toEqual(['jargon', 'team', 'people']);
  });

  test('anything else is refused, because this name reaches a path', () => {
    expect(memoryFileName('../../etc/passwd').ok).toBe(false);
    expect(memoryFileName('jargon.md').ok).toBe(false);
    expect(memoryFileName('').ok).toBe(false);
  });

  test('something that is not a string is refused', () => {
    expect(memoryFileName(42).ok).toBe(false);
    expect(memoryFileName(undefined).ok).toBe(false);
  });
});

describe('saying why a name was refused', () => {
  test('the refusal reads as something about this app, not about a path', () => {
    const refused = memoryFileName('../secrets');

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.kind).toBe('bad-name');
    expect(refused.error.message).toContain('notes this app keeps');
  });
});
