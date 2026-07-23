import { describe, expect, test } from 'bun:test';
import { AGENT_FILE_MAX_BYTES, agentFilePath, parseAgentFileDoc, validateAgentFileText } from './agent-files.ts';
import { claudeConfigDir, signatureFilePath, voiceProfileFilePath } from './paths.ts';
import { unwrap } from './result.ts';

describe('naming which document is being read or written', () => {
  test('the two documents the app stores are accepted', () => {
    expect(unwrap(parseAgentFileDoc('signature'))).toBe('signature');
    expect(unwrap(parseAgentFileDoc('voice-profile'))).toBe('voice-profile');
  });

  test('anything else is refused, because this name reaches a path', () => {
    expect(parseAgentFileDoc('../../etc/passwd').ok).toBe(false);
  });

  test('a name that merely starts like one of them is refused', () => {
    expect(parseAgentFileDoc('signature.html').ok).toBe(false);
  });

  test('something that is not a string at all is refused', () => {
    expect(parseAgentFileDoc(42).ok).toBe(false);
    expect(parseAgentFileDoc(undefined).ok).toBe(false);
  });

  test('each document resolves to its own file in the agent’s config folder', () => {
    expect(agentFilePath('/data', 'signature')).toBe(signatureFilePath('/data'));
    expect(agentFilePath('/data', 'voice-profile')).toBe(voiceProfileFilePath('/data'));
  });
});

describe('checking what is about to be stored', () => {
  test('ordinary text is accepted', () => {
    expect(unwrap(validateAgentFileText('<p>Kind regards</p>'))).toBe('<p>Kind regards</p>');
  });

  test('an empty document is accepted: clearing a signature is a real thing to do', () => {
    expect(unwrap(validateAgentFileText(''))).toBe('');
  });

  test('something that is not text is refused', () => {
    expect(validateAgentFileText({ html: 'x' }).ok).toBe(false);
  });

  test('a document at the limit is accepted', () => {
    expect(validateAgentFileText('a'.repeat(AGENT_FILE_MAX_BYTES)).ok).toBe(true);
  });

  test('a document past the limit is refused', () => {
    expect(validateAgentFileText('a'.repeat(AGENT_FILE_MAX_BYTES + 1)).ok).toBe(false);
  });

  test('the limit counts bytes, not characters, so accents and inline images count fully', () => {
    expect(validateAgentFileText('é'.repeat(AGENT_FILE_MAX_BYTES / 2 + 1)).ok).toBe(false);
  });

  test('the refusal says what the limit is, so the message is actionable', () => {
    const refused = validateAgentFileText('a'.repeat(AGENT_FILE_MAX_BYTES + 1));

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.message).toContain('256 KB');
  });
});

describe('the file the user writes about themselves', () => {
  test('global-context is a document the app stores', () => {
    const parsed = parseAgentFileDoc('global-context');

    expect(parsed.ok && parsed.value).toBe('global-context');
  });

  test('it lives in the agent config folder, so the agent reads it by a fixed path', () => {
    expect(agentFilePath('/data', 'global-context')).toBe(`${claudeConfigDir('/data')}/global-context.md`);
  });

  test('something that is not one of the three documents is still refused', () => {
    expect(parseAgentFileDoc('secrets').ok).toBe(false);
  });
});
