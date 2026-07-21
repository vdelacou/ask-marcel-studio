import { describe, expect, test } from 'bun:test';
import { canSaveNote, memoryRoomNotice } from './memory-room.ts';
import { NOTE_LIMIT } from '../../../shared/memory-glossary.ts';

const of = (length: number): string => 'x'.repeat(length);

describe('counting down to the limit', () => {
  test('a short note is not nagged about room it is nowhere near using', () => {
    expect(memoryRoomNotice(of(100))).toBeUndefined();
  });

  test('the count appears once it is close enough to matter', () => {
    expect(memoryRoomNotice(of(NOTE_LIMIT - 300))?.message).toBe('300 characters left.');
  });

  test('a full note says none left rather than nothing at all', () => {
    expect(memoryRoomNotice(of(NOTE_LIMIT))).toEqual({ tone: 'saved', message: '0 characters left.' });
  });

  test('over the limit says by how much, and why there is a limit', () => {
    const notice = memoryRoomNotice(of(NOTE_LIMIT + 25));

    expect(notice?.tone).toBe('error');
    expect(notice?.message).toContain('25 characters too many');
    expect(notice?.message).toContain('before every message');
  });
});

describe('whether it can be saved at all', () => {
  test('anything up to the limit saves', () => {
    expect(canSaveNote('')).toBe(true);
    expect(canSaveNote(of(NOTE_LIMIT))).toBe(true);
  });

  test('one character past it does not', () => {
    expect(canSaveNote(of(NOTE_LIMIT + 1))).toBe(false);
  });
});
