/*
 * The line under a memory note that says how much room is left in it.
 *
 * These notes are read before every message, so their limit is real: the panel counts
 * down to it and refuses to save past it, rather than saving and cutting. The counter
 * stays out of the way until it is close to mattering.
 *
 * Pure: no react, no electron.
 */
import { NOTE_LIMIT, roomLeftInNote } from '../../../shared/memory-glossary.ts';

export type MemoryRoomNotice = { readonly tone: 'saved' | 'error'; readonly message: string };

// Far enough out to be a warning rather than a surprise, close enough to stay quiet
// while there is nothing to say.
const SHOW_FROM = 300;

export const memoryRoomNotice = (text: string): MemoryRoomNotice | undefined => {
  const left = roomLeftInNote(text);
  if (left < 0) {
    return { tone: 'error', message: `${String(-left)} characters too many. Marcel reads this before every message, so a note has to stay under ${String(NOTE_LIMIT)}.` };
  }
  if (left <= SHOW_FROM) return { tone: 'saved', message: `${String(left)} characters left.` };
  return undefined;
};

export const canSaveNote = (text: string): boolean => roomLeftInNote(text) >= 0;
