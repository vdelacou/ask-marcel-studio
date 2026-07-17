import { describe, expect, test } from 'bun:test';
import { draftsToSettings, emptyDraft, settingsToDrafts } from './provider-draft.ts';
import type { Settings } from '../../../shared/types.ts';

const anthropic: Settings['providers'][number] = {
  id: 'anthropic-work',
  kind: 'anthropic',
  label: 'Anthropic',
  apiKey: 'sk-ant-real',
  modelIds: ['claude-opus-4-8', 'claude-sonnet-5'],
};

describe('opening the settings screen on what is already saved', () => {
  test('a saved provider fills the form, with its models on one editable line', () => {
    const drafts = settingsToDrafts({ providers: [anthropic] });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.label).toBe('Anthropic');
    expect(drafts[0]?.apiKey).toBe('sk-ant-real');
    expect(drafts[0]?.modelIds).toBe('claude-opus-4-8, claude-sonnet-5');
  });

  test('an anthropic provider with no base url shows a blank field rather than the word undefined', () => {
    expect(settingsToDrafts({ providers: [anthropic] })[0]?.baseUrl).toBe('');
  });

  test('each row gets its own stable key, so editing one row cannot retarget another', () => {
    const drafts = settingsToDrafts({ providers: [anthropic, { ...anthropic, id: 'second' }] });

    expect(drafts[0]?.rowId).not.toBe(drafts[1]?.rowId);
  });

  test('a fresh row starts as an empty anthropic provider', () => {
    const draft = emptyDraft();

    expect(draft.kind).toBe('anthropic');
    expect(draft.id).toBe('');
    expect(draft.apiKey).toBe('');
  });

  test('two fresh rows do not share a key', () => {
    expect(emptyDraft().rowId).not.toBe(emptyDraft().rowId);
  });
});

describe('saving what the user typed', () => {
  test('a filled-in form becomes settings the main process can store', () => {
    const settings = draftsToSettings(settingsToDrafts({ providers: [anthropic] }));

    expect(settings.providers).toHaveLength(1);
    expect(settings.providers[0]).toEqual(anthropic);
  });

  test('the models line is split back into a list, ignoring the spaces the user typed', () => {
    const draft = { ...emptyDraft(), id: 'p', label: 'P', apiKey: 'k', modelIds: ' a ,b,  c ' };

    expect(draftsToSettings([draft]).providers[0]?.modelIds).toEqual(['a', 'b', 'c']);
  });

  test('a trailing comma does not become a blank model id', () => {
    const draft = { ...emptyDraft(), id: 'p', label: 'P', apiKey: 'k', modelIds: 'a, b,' };

    expect(draftsToSettings([draft]).providers[0]?.modelIds).toEqual(['a', 'b']);
  });

  test('an anthropic provider left without a base url omits the field entirely', () => {
    const draft = { ...emptyDraft(), id: 'p', label: 'P', apiKey: 'k', modelIds: 'm', baseUrl: '   ' };

    // Omitted rather than sent as an empty string: settings-doc treats a present-but-blank
    // baseUrl differently from an absent one.
    expect('baseUrl' in (draftsToSettings([draft]).providers[0] ?? {})).toBe(false);
  });

  test('an openai provider keeps the base url the user typed', () => {
    const draft = { ...emptyDraft(), kind: 'openai' as const, id: 'p', label: 'P', apiKey: 'k', modelIds: 'm', baseUrl: 'http://127.0.0.1:1234/v1' };

    const provider = draftsToSettings([draft]).providers[0];

    expect(provider?.kind === 'openai' && provider.baseUrl).toBe('http://127.0.0.1:1234/v1');
  });

  test('surrounding whitespace is trimmed off every field the user typed', () => {
    const draft = { ...emptyDraft(), id: '  p  ', label: '  P  ', apiKey: '  k  ', modelIds: 'm' };

    const provider = draftsToSettings([draft]).providers[0];

    expect(provider?.id).toBe('p');
    expect(provider?.label).toBe('P');
    // The key especially: a trailing newline from a paste would otherwise be encrypted
    // and sent to the provider verbatim.
    expect(provider?.apiKey).toBe('k');
  });

  test('a form the user emptied saves as no providers', () => {
    expect(draftsToSettings([]).providers).toEqual([]);
  });

  test('the chosen default model is carried through untouched', () => {
    const settings = { providers: [anthropic], defaultModel: 'anthropic-work::claude-opus-4-8' };

    expect(draftsToSettings(settingsToDrafts(settings), settings.defaultModel).defaultModel).toBe('anthropic-work::claude-opus-4-8');
  });
});
