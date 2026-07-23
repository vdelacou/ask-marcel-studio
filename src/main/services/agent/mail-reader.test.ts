/*
 * A shape guard for the mail-reader agent definition. It never imports electron or the
 * SDK bundle (the type is erased), so the bun runner covers it. The point is not to test
 * prose but to catch the ways a hand-edited prompt goes silently wrong: an empty field,
 * the read-only doctrine deleted, the return contract dropped, or a write tool added.
 */
import { describe, expect, test } from 'bun:test';
import { mailReader } from './mail-reader.ts';

describe('the mail-reader subagent definition', () => {
  test('carries a description and a prompt that are not empty', () => {
    expect(mailReader.description.length).toBeGreaterThan(0);
    expect(mailReader.prompt.length).toBeGreaterThan(0);
  });

  test('is a reader, not a writer: it has Bash and Read but no Write or Edit', () => {
    expect(mailReader.tools).toContain('Bash');
    expect(mailReader.tools).toContain('Read');
    expect(mailReader.tools).not.toContain('Write');
    expect(mailReader.tools).not.toContain('Edit');
  });

  test('keeps the never-login and read-only doctrine in the prompt', () => {
    expect(mailReader.prompt).toContain('login');
    expect(mailReader.prompt.toLowerCase()).toContain('read-only');
    expect(mailReader.prompt.toLowerCase()).toContain('never');
  });

  test('states the return contract, so a delegated read comes back sourced', () => {
    expect(mailReader.prompt.toLowerCase()).toContain('quote');
    expect(mailReader.prompt.toLowerCase()).toContain('inaccessible');
  });

  test('reads the newest message with its quoted history', () => {
    expect(mailReader.prompt).toContain('keep-quoted');
  });
});
