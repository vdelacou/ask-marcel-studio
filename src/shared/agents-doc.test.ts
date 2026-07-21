import { describe, expect, test } from 'bun:test';
import { EMPTY_AGENTS_DOC, mergeAgents, parseAgentsDoc, serialiseAgentsDoc, toSdkAgents, validateAgentsDoc, validateSubAgent } from './agents-doc.ts';
import type { SubAgent } from './agents-doc.ts';
import { unwrap } from './result.ts';

const agent = (over: Partial<SubAgent> = {}): SubAgent => ({
  name: 'm365-reader',
  description: 'Reads one oversized document and hands back a summary.',
  prompt: 'Read the artifact named in the request.',
  tools: ['Bash', 'Read'],
  ...over,
});

describe('checking a helper before it is stored', () => {
  test('a complete helper is accepted and trimmed', () => {
    expect(unwrap(validateSubAgent({ ...agent(), description: '  Reads things.  ', prompt: '  Do it.  ' }))).toMatchObject({ description: 'Reads things.', prompt: 'Do it.' });
  });

  test('a name that is not a plain identifier is refused: it becomes the key the agent routes on', () => {
    expect(validateSubAgent(agent({ name: 'My Reader' })).ok).toBe(false);
    expect(validateSubAgent(agent({ name: '-leading-dash' })).ok).toBe(false);
    expect(validateSubAgent(agent({ name: 'UPPER' })).ok).toBe(false);
  });

  test('an absurdly long name is refused', () => {
    expect(validateSubAgent(agent({ name: 'a'.repeat(65) })).ok).toBe(false);
  });

  test('a helper with no description is refused, because nothing would ever reach it', () => {
    const refused = validateSubAgent(agent({ description: '   ' }));

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.message).toContain('never know when to use it');
  });

  test('a helper with no instructions is refused', () => {
    expect(validateSubAgent(agent({ prompt: '' })).ok).toBe(false);
  });

  test('a tool that does not exist is refused rather than silently dropped', () => {
    expect(validateSubAgent({ ...agent(), tools: ['Bash', 'LaunchMissiles'] }).ok).toBe(false);
  });

  test('the same tool listed twice is stored once', () => {
    expect(unwrap(validateSubAgent({ ...agent(), tools: ['Bash', 'Bash'] })).tools).toEqual(['Bash']);
  });

  test('no tools at all is allowed: it means whatever the main agent may use', () => {
    expect(unwrap(validateSubAgent(agent({ tools: [] }))).tools).toEqual([]);
  });

  test('something that is not a helper at all is refused', () => {
    expect(validateSubAgent('nope').ok).toBe(false);
    expect(validateSubAgent({ ...agent(), tools: 'Bash' }).ok).toBe(false);
  });
});

describe('reading and writing the helpers file', () => {
  test('a file round trips', () => {
    const doc = { userAgents: [agent({ name: 'summariser' })], builtinOverrides: { 'm365-reader': agent() } };

    expect(unwrap(parseAgentsDoc(JSON.parse(serialiseAgentsDoc(doc))))).toEqual(doc);
  });

  test('an empty document is valid', () => {
    expect(unwrap(validateAgentsDoc({ userAgents: [] }))).toEqual(EMPTY_AGENTS_DOC);
  });

  test('two helpers with the same name are refused', () => {
    expect(validateAgentsDoc({ userAgents: [agent({ name: 'a' }), agent({ name: 'a' })] }).ok).toBe(false);
  });

  test('a change stored under the wrong name is refused: it would override something else', () => {
    expect(validateAgentsDoc({ userAgents: [], builtinOverrides: { 'm365-reader': agent({ name: 'someone-else' }) } }).ok).toBe(false);
  });

  test('a file that is not a document is refused', () => {
    expect(validateAgentsDoc('nope').ok).toBe(false);
    expect(validateAgentsDoc({}).ok).toBe(false);
    expect(validateAgentsDoc({ userAgents: [], builtinOverrides: 'nope' }).ok).toBe(false);
  });

  test('a corrupt file on disk is unreadable, not invalid: no form can fix a file', () => {
    const parsed = parseAgentsDoc('nope');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('unreadable');
  });

  test('what the user just typed is invalid, not unreadable: the form can fix it', () => {
    const parsed = validateAgentsDoc({ userAgents: [agent({ name: 'Bad Name' })] });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('invalid');
  });
});

describe('putting the built-ins and the user’s own together', () => {
  const builtins = [agent()];

  test('an untouched built-in is listed as it ships', () => {
    expect(mergeAgents(builtins, EMPTY_AGENTS_DOC)).toEqual([{ ...agent(), isBuiltIn: true, isModified: false }]);
  });

  test('a changed built-in is listed as changed, so the panel can offer the original back', () => {
    const doc = { userAgents: [], builtinOverrides: { 'm365-reader': agent({ description: 'My own wording.' }) } };

    expect(mergeAgents(builtins, doc)[0]).toMatchObject({ description: 'My own wording.', isBuiltIn: true, isModified: true });
  });

  test('the user’s own helpers come after the built-ins', () => {
    const doc = { userAgents: [agent({ name: 'summariser' })], builtinOverrides: {} };

    expect(mergeAgents(builtins, doc).map((a) => a.name)).toEqual(['m365-reader', 'summariser']);
  });

  test('a helper the user added is never marked as changed', () => {
    const doc = { userAgents: [agent({ name: 'summariser' })], builtinOverrides: {} };

    expect(mergeAgents(builtins, doc)[1]).toMatchObject({ isBuiltIn: false, isModified: false });
  });
});

describe('handing the helpers to the agent', () => {
  test('each helper becomes an entry keyed by its name', () => {
    const sdk = toSdkAgents(mergeAgents([agent()], EMPTY_AGENTS_DOC));

    expect(sdk['m365-reader']).toEqual({ description: agent().description, prompt: agent().prompt, tools: ['Bash', 'Read'] });
  });

  test('a helper with no tools omits the field, which means it inherits them', () => {
    const sdk = toSdkAgents(mergeAgents([agent({ tools: [] })], EMPTY_AGENTS_DOC));

    expect(sdk['m365-reader']).not.toHaveProperty('tools');
  });

  test('no helpers at all is an empty record, not an error', () => {
    expect(toSdkAgents([])).toEqual({});
  });
});

describe('refusing a helper the app could not actually run', () => {
  test('a name that is not text is refused, not coerced into one', () => {
    expect(validateSubAgent({ ...agent(), name: 42 }).ok).toBe(false);
  });

  test('a description that is not text is refused', () => {
    expect(validateSubAgent({ ...agent(), description: 42 }).ok).toBe(false);
  });

  test('instructions that are not text are refused', () => {
    expect(validateSubAgent({ ...agent(), prompt: 42 }).ok).toBe(false);
  });

  test('instructions of only whitespace are no instructions at all', () => {
    expect(validateSubAgent(agent({ prompt: '   ' })).ok).toBe(false);
  });

  test('nothing at all is refused', () => {
    expect(validateSubAgent(null).ok).toBe(false);
    expect(validateSubAgent([agent()]).ok).toBe(false);
    expect(validateSubAgent(42).ok).toBe(false);
  });

  test('each refusal says what is wrong, because the settings form shows it verbatim', () => {
    const reason = (raw: unknown): string => {
      const checked = validateSubAgent(raw);
      return checked.ok ? '' : checked.error.message;
    };

    expect(reason('nope')).toContain('must be an object');
    expect(reason(agent({ name: 'Bad Name' }))).toContain('lowercase letters');
    expect(reason(agent({ prompt: '' }))).toContain('needs instructions');
    expect(reason({ ...agent(), tools: 'Bash' })).toContain('which tools');
    expect(reason({ ...agent(), tools: ['Nope'] })).toContain('does not exist');
  });

  test('a document refusal says what is wrong too', () => {
    const reason = (raw: unknown): string => {
      const checked = validateAgentsDoc(raw);
      return checked.ok ? '' : checked.error.message;
    };

    expect(reason('nope')).toContain('must be an object');
    expect(reason({})).toContain('userAgents array');
    expect(reason({ userAgents: [], builtinOverrides: 'nope' })).toContain('builtinOverrides');
    expect(reason({ userAgents: [agent({ name: 'a' }), agent({ name: 'a' })] })).toContain('share the name');
    expect(reason({ userAgents: [], builtinOverrides: { 'm365-reader': agent({ name: 'other' }) } })).toContain('wrong name');
  });

  test('an overrides map that is not a map is refused, and one that is absent is fine', () => {
    expect(validateAgentsDoc({ userAgents: [], builtinOverrides: [1] }).ok).toBe(false);
    expect(validateAgentsDoc({ userAgents: [] }).ok).toBe(true);
  });
});
