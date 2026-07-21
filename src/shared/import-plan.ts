/*
 * Naming a file the user just dragged in, and telling the agent it is there.
 *
 * A dropped file's name is untrusted: it comes from the operating system, another app's
 * drag payload, or an email attachment, and it goes on to be joined onto a path. So the
 * name is reduced to a bare filename here, before anything touches the filesystem.
 *
 * Pure: no electron and no IO, so `bun test` covers the security-relevant part.
 */
import { basename } from 'node:path';

// Big enough for a deck or a workbook, small enough that a mis-drop of a disk image is
// refused rather than copied.
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const MAX_NAME_LENGTH = 120;

// A name with no path, no separators, no control characters and no leading dot. The
// windows separator is handled explicitly because basename() on a posix host does not
// treat a backslash as one, and a drag from a Windows app can carry either.
export const safeImportName = (raw: string): string => {
  const lastSegment = basename(raw.replace(/\\/g, '/'));
  // A newline or a NUL in a filename is either a mistake or an attempt at one.
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = lastSegment.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const withoutLeadingDots = cleaned.replace(/^\.+/, '');
  const trimmed = withoutLeadingDots.slice(0, MAX_NAME_LENGTH).trim();
  // '..', '/', '   ' and '' all end up here. The file is still worth keeping; it just
  // needs a name of our own.
  return trimmed.length === 0 ? 'file' : trimmed;
};

// Splits at the last dot, keeping a dotfile-style name whole.
const splitExtension = (name: string): { readonly base: string; readonly extension: string } => {
  const at = name.lastIndexOf('.');
  if (at <= 0) return { base: name, extension: '' };
  return { base: name.slice(0, at), extension: name.slice(at) };
};

// Dropping the same file twice must not overwrite the first one: the user may well
// have meant both.
export const resolveCollision = (existing: readonly string[], name: string): string => {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;

  const { base, extension } = splitExtension(name);
  const numbered = (counter: number): string => `${base} (${String(counter)})${extension}`;
  // Terminates: only finitely many names are taken, so some counter is free.
  let counter = 2;
  while (taken.has(numbered(counter))) counter += 1;
  return numbered(counter);
};

// Appended to the message so the agent knows the files exist and where. Written as
// plain instructions rather than a marker syntax: the model reads it as English, and
// the user sees nothing (the transcript keeps their own text).
export const attachmentSuffix = (files: readonly { readonly relativePath: string }[]): string => {
  if (files.length === 0) return '';
  const list = files.map((file) => `- ${file.relativePath}`).join('\n');
  const noun = files.length === 1 ? 'this file' : 'these files';
  return `\n\nThe user attached ${noun}. They are in your working directory:\n${list}`;
};
