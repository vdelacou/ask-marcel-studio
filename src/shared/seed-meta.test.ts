import { describe, expect, test } from 'bun:test';
import { EMPTY_SEED_META, hasSeedRecord, isSeededContent, parseSeedMeta, rememberSeed, serialiseSeedMeta } from './seed-meta.ts';

describe('remembering what the app last wrote into a built-in skill', () => {
  test('a recorded hash comes back', () => {
    const meta = rememberSeed(EMPTY_SEED_META, 'draft-outlook-email', 'abc123');

    expect(isSeededContent(meta, 'draft-outlook-email', 'abc123')).toBe(true);
  });

  test('different contents means the user changed it', () => {
    const meta = rememberSeed(EMPTY_SEED_META, 'draft-outlook-email', 'abc123');

    expect(isSeededContent(meta, 'draft-outlook-email', 'different')).toBe(false);
  });

  test('a folder nobody recorded is not treated as edited', () => {
    // It predates this bookkeeping. Calling it edited would freeze it against every
    // future app update.
    expect(hasSeedRecord(EMPTY_SEED_META, 'answer-from-m365')).toBe(false);
  });

  test('recording one folder leaves the others alone', () => {
    const meta = rememberSeed(rememberSeed(EMPTY_SEED_META, 'a', 'one'), 'b', 'two');

    expect(isSeededContent(meta, 'a', 'one')).toBe(true);
    expect(isSeededContent(meta, 'b', 'two')).toBe(true);
  });

  test('recording the same folder twice keeps the newer hash', () => {
    const meta = rememberSeed(rememberSeed(EMPTY_SEED_META, 'a', 'one'), 'a', 'two');

    expect(isSeededContent(meta, 'a', 'two')).toBe(true);
    expect(isSeededContent(meta, 'a', 'one')).toBe(false);
  });
});

describe('reading the record back off disk', () => {
  test('a written record round trips', () => {
    const meta = rememberSeed(EMPTY_SEED_META, 'a', 'one');

    expect(parseSeedMeta(JSON.parse(serialiseSeedMeta(meta)))).toEqual(meta);
  });

  test('a corrupt record degrades to nothing known rather than blocking a launch', () => {
    expect(parseSeedMeta('nope')).toEqual({});
    expect(parseSeedMeta(null)).toEqual({});
    expect(parseSeedMeta([1, 2])).toEqual({});
  });

  test('an entry whose hash is not a string is dropped, and the rest survive', () => {
    expect(parseSeedMeta({ a: 42, b: 'kept' })).toEqual({ b: 'kept' });
  });

  test('an entry with an empty hash is dropped', () => {
    expect(parseSeedMeta({ a: '' })).toEqual({});
  });

  test('an empty record is a valid record', () => {
    expect(parseSeedMeta({})).toEqual({});
  });
});
