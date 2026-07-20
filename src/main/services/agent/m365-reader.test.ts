/*
 * A shape guard for the m365-reader agent definition. It never imports electron or the
 * SDK bundle (the type is erased), so the bun runner covers it. The point is not to test
 * prose but to catch the ways a hand-edited prompt goes silently wrong: an empty field,
 * the read-only doctrine deleted, the delegation contract dropped, or a write tool added.
 */
import { describe, expect, test } from 'bun:test';
import { m365Reader } from './m365-reader.ts';

describe('the m365-reader subagent definition', () => {
  test('carries a description and a prompt that are not empty', () => {
    expect(m365Reader.description.length).toBeGreaterThan(0);
    expect(m365Reader.prompt.length).toBeGreaterThan(0);
  });

  test('is a reader, not a writer: it has Bash and Read but no Write or Edit', () => {
    expect(m365Reader.tools).toContain('Bash');
    expect(m365Reader.tools).toContain('Read');
    expect(m365Reader.tools).not.toContain('Write');
    expect(m365Reader.tools).not.toContain('Edit');
  });

  test('keeps the never-login and never-draft doctrine in the prompt', () => {
    expect(m365Reader.prompt).toContain('login');
    expect(m365Reader.prompt.toLowerCase()).toContain('read-only');
    expect(m365Reader.prompt.toLowerCase()).toContain('never');
  });

  test('states the return contract, so a delegated read comes back sourced', () => {
    expect(m365Reader.prompt.toLowerCase()).toContain('quote');
    expect(m365Reader.prompt.toLowerCase()).toContain('inaccessible');
  });
});
