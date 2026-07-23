/*
 * A shape guard for the doc-reader agent definition. It never imports electron or the
 * SDK bundle (the type is erased), so the bun runner covers it. The point is not to test
 * prose but to catch the ways a hand-edited prompt goes silently wrong: an empty field,
 * the read-only doctrine deleted, the return contract dropped, or a write tool added.
 */
import { describe, expect, test } from 'bun:test';
import { docReader } from './doc-reader.ts';

describe('the doc-reader subagent definition', () => {
  test('carries a description and a prompt that are not empty', () => {
    expect(docReader.description.length).toBeGreaterThan(0);
    expect(docReader.prompt.length).toBeGreaterThan(0);
  });

  test('is a reader, not a writer: it has Bash and Read but no Write or Edit', () => {
    expect(docReader.tools).toContain('Bash');
    expect(docReader.tools).toContain('Read');
    expect(docReader.tools).not.toContain('Write');
    expect(docReader.tools).not.toContain('Edit');
  });

  test('keeps the never-login and read-only doctrine in the prompt', () => {
    expect(docReader.prompt).toContain('login');
    expect(docReader.prompt.toLowerCase()).toContain('read-only');
    expect(docReader.prompt.toLowerCase()).toContain('never');
  });

  test('states the return contract, so a delegated read comes back sourced', () => {
    expect(docReader.prompt.toLowerCase()).toContain('quote');
    expect(docReader.prompt.toLowerCase()).toContain('inaccessible');
  });

  test('keeps the deck-text-first and no-python-pdf doctrine', () => {
    expect(docReader.prompt).toContain('download-drive-item-as-markdown');
    expect(docReader.prompt.toLowerCase()).toContain('python');
  });
});
