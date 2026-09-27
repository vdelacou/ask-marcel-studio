/*
 * How the document checkpoints refuse: always as invalid, and always with words the window can
 * show. The neighbouring agent-files tests pin that each refusal happens; these pin what it
 * says. Plain comparisons on purpose: bun 1.4.2's toMatchObject with an asymmetric matcher fails
 * on an object it has already compared once (see .claude/LESSONS.md).
 */
import { describe, expect, test } from 'bun:test';
import { AGENT_FILE_MAX_BYTES, parseAgentFileDoc, validateAgentFileText } from './agent-files.ts';
import type { AgentFileError } from './agent-files.ts';
import type { Result } from './result.ts';

const refusal = (result: Result<unknown, AgentFileError>): AgentFileError | undefined => (result.ok ? undefined : result.error);

describe('what a refused document says', () => {
  test('a document name the app does not store is refused as invalid, with a message to show', () => {
    const refused = refusal(parseAgentFileDoc('secrets'));

    expect(refused?.kind).toBe('invalid');
    expect(refused?.message.length).toBeGreaterThan(0);
  });

  test('something that is not text is refused as invalid, with a message to show', () => {
    const refused = refusal(validateAgentFileText(42));

    expect(refused?.kind).toBe('invalid');
    expect(refused?.message.length).toBeGreaterThan(0);
  });

  test('a document over the size limit is refused as invalid', () => {
    expect(refusal(validateAgentFileText('a'.repeat(AGENT_FILE_MAX_BYTES + 1)))?.kind).toBe('invalid');
  });
});
