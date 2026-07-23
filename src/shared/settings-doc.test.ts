import { describe, expect, test } from 'bun:test';
import { EMPTY_STORED_SETTINGS, parseStoredSettings, serialiseStoredSettings, validateSettings } from './settings-doc.ts';
import type { StoredSettings } from './types.ts';

const sealedAnthropic = {
  id: 'anthropic-work',
  kind: 'anthropic',
  label: 'Anthropic',
  apiKey: { enc: 'v10:c2VhbGVk' },
  modelIds: ['claude-opus-4-8'],
};

describe('loading the settings file the app wrote last time', () => {
  test('a settings file with one anthropic provider comes back with that provider', () => {
    const parsed = parseStoredSettings({ providers: [sealedAnthropic], defaultModel: 'anthropic-work::claude-opus-4-8' });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.providers).toHaveLength(1);
    expect(parsed.value.providers[0]?.label).toBe('Anthropic');
    expect(parsed.value.defaultModel).toBe('anthropic-work::claude-opus-4-8');
  });

  test('the sealed key survives a load without being inspected', () => {
    const parsed = parseStoredSettings({ providers: [sealedAnthropic] });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.providers[0]?.apiKey).toEqual({ enc: 'v10:c2VhbGVk' });
  });

  test('a first launch with no providers yet is a valid empty settings file', () => {
    const parsed = parseStoredSettings({ providers: [] });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.providers).toEqual([]);
  });

  test('an openai provider keeps its required base url', () => {
    const parsed = parseStoredSettings({
      providers: [{ id: 'local', kind: 'openai', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: { enc: 'x' }, modelIds: ['qwen'] }],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const provider = parsed.value.providers[0];
    expect(provider?.kind === 'openai' && provider.baseUrl).toBe('http://127.0.0.1:1234/v1');
  });

  test('settings with no default model chosen yet load fine', () => {
    const parsed = parseStoredSettings({ providers: [] });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.defaultModel).toBeUndefined();
  });
});

describe('refusing a settings file that has been corrupted or hand-edited', () => {
  // Every rejection asserts its exact message, not just that it failed. The message
  // is what tells the user which provider is broken and why, so it is contract; and
  // it is the only thing distinguishing branches that otherwise all return "unreadable".
  const rejections: ReadonlyArray<{ readonly why: string; readonly file: unknown; readonly message: string }> = [
    { why: 'a settings file that is not an object', file: 'nonsense', message: 'settings must be an object' },
    { why: 'a number where the settings object should be', file: 42, message: 'settings must be an object' },
    { why: 'an array where the settings object should be', file: [], message: 'settings must be an object' },
    { why: 'a null settings file, rather than treating it as empty', file: null, message: 'settings must be an object' },
    { why: 'a settings file with no providers array', file: { defaultModel: 'a::b' }, message: 'settings must have a providers array' },
    { why: 'a defaultModel that is not a string', file: { providers: [], defaultModel: 7 }, message: 'defaultModel must be a string' },
    { why: 'a providers list holding something that is not an object', file: { providers: ['nope'] }, message: 'provider must be an object' },
    {
      why: 'a provider missing its id',
      file: { providers: [{ kind: 'anthropic', label: 'A', apiKey: { enc: 'x' }, modelIds: [] }] },
      message: 'provider id must be a non-empty string',
    },
    {
      why: 'a provider with a blank id, which no model reference could name',
      file: { providers: [{ ...sealedAnthropic, id: '' }] },
      message: 'provider id must be a non-empty string',
    },
    {
      why: 'a provider with an unknown kind, rather than silently dropping it',
      file: { providers: [{ ...sealedAnthropic, kind: 'gemini' }] },
      message: 'provider kind must be anthropic or openai, got gemini',
    },
    {
      why: 'a provider missing its kind',
      file: { providers: [{ id: 'a', label: 'A', apiKey: { enc: 'x' }, modelIds: [] }] },
      message: 'provider kind must be anthropic or openai, got undefined',
    },
    {
      why: 'a provider missing its label',
      file: { providers: [{ id: 'a', kind: 'anthropic', apiKey: { enc: 'x' }, modelIds: [] }] },
      message: 'provider label must be a non-empty string',
    },
    {
      why: 'a provider with a blank label, which would render as an unnamed row',
      file: { providers: [{ ...sealedAnthropic, label: '' }] },
      message: 'provider label must be a non-empty string',
    },
    {
      why: 'a provider whose model list is missing',
      file: { providers: [{ id: 'a', kind: 'anthropic', label: 'A', apiKey: { enc: 'x' } }] },
      message: 'provider modelIds must be an array of strings',
    },
    { why: 'a provider with a non-string model id', file: { providers: [{ ...sealedAnthropic, modelIds: [42] }] }, message: 'provider modelIds must be an array of strings' },
    {
      why: 'a provider whose model list is only partly strings',
      file: { providers: [{ ...sealedAnthropic, modelIds: ['claude-opus-4-8', 42] }] },
      message: 'provider modelIds must be an array of strings',
    },
    { why: 'a provider whose baseUrl is not a string', file: { providers: [{ ...sealedAnthropic, baseUrl: 42 }] }, message: 'provider baseUrl must be a string' },
    {
      why: 'an openai provider with no baseUrl, since there is no default to fall back on',
      file: { providers: [{ id: 'x', kind: 'openai', label: 'X', apiKey: { enc: 'x' }, modelIds: [] }] },
      message: 'an openai provider needs a baseUrl',
    },
    {
      why: 'an openai provider whose baseUrl is blank',
      file: { providers: [{ id: 'x', kind: 'openai', label: 'X', baseUrl: '', apiKey: { enc: 'x' }, modelIds: [] }] },
      message: 'an openai provider needs a baseUrl',
    },
    {
      why: 'a provider whose key was hand-edited into a plain string',
      file: { providers: [{ ...sealedAnthropic, apiKey: 'sk-ant-plaintext' }] },
      message: 'provider apiKey must be a sealed { enc } envelope',
    },
    { why: 'a provider whose key envelope is empty', file: { providers: [{ ...sealedAnthropic, apiKey: {} }] }, message: 'provider apiKey must be a sealed { enc } envelope' },
    {
      why: 'a provider whose key envelope holds a non-string enc',
      file: { providers: [{ ...sealedAnthropic, apiKey: { enc: 42 } }] },
      message: 'provider apiKey must be a sealed { enc } envelope',
    },
    {
      why: 'a provider with no key at all',
      file: { providers: [{ id: 'a', kind: 'anthropic', label: 'A', modelIds: [] }] },
      message: 'provider apiKey must be a sealed { enc } envelope',
    },
  ];

  for (const rejection of rejections) {
    test(`${rejection.why} is unreadable`, () => {
      const parsed = parseStoredSettings(rejection.file);

      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.error.kind).toBe('unreadable');
      expect(parsed.error.message).toBe(rejection.message);
    });
  }
});

describe('accepting provider changes the user made in the settings screen', () => {
  test('a provider with a key and a model is accepted', () => {
    const validated = validateSettings({
      providers: [{ id: 'anthropic-work', kind: 'anthropic', label: 'Anthropic', apiKey: 'sk-ant-real', modelIds: ['claude-opus-4-8'] }],
    });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.providers[0]?.apiKey).toBe('sk-ant-real');
  });

  test('a key pasted with surrounding whitespace is stored trimmed', () => {
    // Caught live: main stored the raw key while only the renderer trimmed. A pasted
    // key carries a trailing newline, which gets encrypted verbatim and sent to the
    // provider, returning a 401 that reads like a bad key.
    const validated = validateSettings({ providers: [{ id: 'a', kind: 'anthropic', label: 'A', apiKey: '  sk-ant-real\n', modelIds: ['m'] }] });

    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.providers[0]?.apiKey).toBe('sk-ant-real');
  });

  test('a provider saved with a blank key is rejected before anything is written', () => {
    const validated = validateSettings({ providers: [{ id: 'a', kind: 'anthropic', label: 'A', apiKey: '   ', modelIds: ['m'] }] });

    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.error.kind).toBe('invalid');
  });

  test('two providers sharing an id are rejected, because a model reference could not name one of them', () => {
    const provider = { id: 'same', kind: 'anthropic' as const, label: 'A', apiKey: 'k', modelIds: ['m'] };
    const validated = validateSettings({ providers: [provider, { ...provider, label: 'B' }] });

    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.error.kind).toBe('invalid');
  });

  test('a local openai-compatible server on a real http url is accepted', () => {
    const validated = validateSettings({
      providers: [{ id: 'lmstudio', kind: 'openai', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'k', modelIds: ['qwen'] }],
    });

    expect(validated.ok).toBe(true);
  });

  test('a hosted openai-compatible provider on https is accepted', () => {
    const validated = validateSettings({
      providers: [{ id: 'openrouter', kind: 'openai', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k', modelIds: ['meta-llama/llama-3'] }],
    });

    expect(validated.ok).toBe(true);
  });

  test('a provider with a base url that is not a url is rejected', () => {
    const validated = validateSettings({ providers: [{ id: 'x', kind: 'openai', label: 'X', baseUrl: 'not a url', apiKey: 'k', modelIds: ['m'] }] });

    expect(validated.ok).toBe(false);
  });

  test('a base url on a non-http scheme is rejected even though it parses as a url', () => {
    // 'file:///etc/passwd' is a perfectly valid URL, so only the protocol check
    // rejects it. Without that check the gateway would be pointed at the filesystem.
    const validated = validateSettings({ providers: [{ id: 'x', kind: 'openai', label: 'X', baseUrl: 'file:///etc/passwd', apiKey: 'k', modelIds: ['m'] }] });

    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.error.kind).toBe('invalid');
  });

  test('a provider whose id could not survive a model reference is rejected, naming the id', () => {
    // 'a::b' would parse back as provider 'a', model 'b'. See model-ref.ts.
    const validated = validateSettings({ providers: [{ id: 'a::b', kind: 'anthropic', label: 'A', apiKey: 'k', modelIds: ['m'] }] });

    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.error.message).toBe("provider id cannot contain '::': a::b");
  });

  test('a structurally broken provider from the settings screen is reported as invalid, not unreadable', () => {
    // The same shape checks run on both paths, but a bad value the USER just typed is
    // 'invalid' (fix the form), whereas the identical shape on disk is 'unreadable'
    // (the file is corrupt). The kind is what the renderer branches on.
    const validated = validateSettings({ providers: [{ id: 'a', kind: 'gemini', label: 'A', apiKey: 'k', modelIds: ['m'] }] });

    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.error.kind).toBe('invalid');
    expect(validated.error.message).toBe('provider kind must be anthropic or openai, got gemini');
  });
});

describe('writing settings back to disk', () => {
  test('settings round-trip through serialise and parse unchanged', () => {
    const settings: StoredSettings = { providers: [sealedAnthropic as StoredSettings['providers'][number]], defaultModel: 'anthropic-work::claude-opus-4-8' };

    const parsed = parseStoredSettings(JSON.parse(serialiseStoredSettings(settings)));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(settings);
  });

  test('the file is written as readable json, since a human may open it', () => {
    expect(serialiseStoredSettings(EMPTY_STORED_SETTINGS)).toBe('{\n  "providers": []\n}');
  });
});

describe('remembering which parts of Microsoft 365 are switched off', () => {
  const withPolicy = (officePolicy: unknown): unknown => ({ providers: [], officePolicy });

  test('settings with nothing switched off store nothing about it', () => {
    const parsed = validateSettings({ providers: [] });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect('officePolicy' in parsed.value).toBe(false);
  });

  test('a switched-off category round trips', () => {
    const parsed = validateSettings(withPolicy({ disabledCategories: ['calendar'] }));

    expect(parsed.ok && parsed.value.officePolicy).toEqual({ disabledCategories: ['calendar'] });
  });

  test('the list is sorted and deduplicated, so the file does not churn', () => {
    const parsed = validateSettings(withPolicy({ disabledCategories: ['mail', 'calendar', 'mail'] }));

    expect(parsed.ok && parsed.value.officePolicy).toEqual({ disabledCategories: ['calendar', 'mail'] });
  });

  test('the self-check category cannot be switched off, however it arrives', () => {
    const parsed = validateSettings(withPolicy({ disabledCategories: ['meta'] }));

    expect(parsed.ok && parsed.value.officePolicy).toEqual({ disabledCategories: [] });
  });

  test('a blank category name is dropped rather than stored', () => {
    const parsed = validateSettings(withPolicy({ disabledCategories: ['  ', 'mail'] }));

    expect(parsed.ok && parsed.value.officePolicy).toEqual({ disabledCategories: ['mail'] });
  });

  test('a policy that is not an object is refused as something the user can fix', () => {
    const parsed = validateSettings(withPolicy('nope'));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('invalid');
  });

  test('a disabled list that is not a list of strings is refused', () => {
    expect(validateSettings(withPolicy({ disabledCategories: [1, 2] })).ok).toBe(false);
  });

  test('a policy on disk that is corrupt is unreadable, not invalid: the form cannot fix a file', () => {
    const parsed = parseStoredSettings({ providers: [], officePolicy: 'nope' });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe('unreadable');
  });

  test('a policy on disk round trips back out', () => {
    const parsed = parseStoredSettings({ providers: [], officePolicy: { disabledCategories: ['calendar'] } });

    expect(parsed.ok && parsed.value.officePolicy).toEqual({ disabledCategories: ['calendar'] });
  });
});

describe('remembering which skills are switched off', () => {
  test('a settings file with no skills policy still parses', () => {
    const parsed = parseStoredSettings({ providers: [] });

    expect(parsed.ok && 'skillsPolicy' in parsed.value).toBe(false);
  });

  test('disabled folders are stored sorted and without duplicates', () => {
    const parsed = parseStoredSettings({ providers: [], skillsPolicy: { disabledFolders: ['weekly', 'answer-from-m365', 'weekly'] } });

    expect(parsed.ok && parsed.value.skillsPolicy).toEqual({ disabledFolders: ['answer-from-m365', 'weekly'] });
  });

  test('a blank folder name is dropped rather than kept as a phantom skill', () => {
    const parsed = parseStoredSettings({ providers: [], skillsPolicy: { disabledFolders: ['  ', 'weekly'] } });

    expect(parsed.ok && parsed.value.skillsPolicy).toEqual({ disabledFolders: ['weekly'] });
  });

  test('a skills policy that is not an object is refused, not ignored', () => {
    expect(parseStoredSettings({ providers: [], skillsPolicy: 'nope' }).ok).toBe(false);
  });

  test('disabled folders that are not strings are refused', () => {
    expect(parseStoredSettings({ providers: [], skillsPolicy: { disabledFolders: [42] } }).ok).toBe(false);
  });

  test('a validated settings object keeps its skills policy through to storage', () => {
    const validated = validateSettings({ providers: [], skillsPolicy: { disabledFolders: ['weekly'] } });

    expect(validated.ok && validated.value.skillsPolicy).toEqual({ disabledFolders: ['weekly'] });
  });
});
