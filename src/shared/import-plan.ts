/*
 * Naming a file the user just dragged in, and telling the agent it is there.
 *
 * A dropped file's name is untrusted: it comes from the operating system, another app's
 * drag payload, or an email attachment, and it goes on to be joined onto a path. So the
 * name is reduced to a bare filename here, before anything touches the filesystem.
 *
 * Pure, and deliberately free of node:path: the renderer imports attachmentSuffix from
 * here, and node:path does not exist in a browser bundle. Splitting on the separators
 * by hand is all this needs anyway.
 */

// Big enough for a deck or a workbook, small enough that a mis-drop of a disk image is
// refused rather than copied.
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const MAX_NAME_LENGTH = 120;

// Both separators, because a drag from a Windows app carries backslashes and a posix
// basename() would not treat those as separators at all.
const lastSegmentOf = (raw: string): string => {
  const normalised = raw.replace(/\\/g, '/');
  return normalised.slice(normalised.lastIndexOf('/') + 1);
};

// A name with no path, no separators, no control characters and no leading dot.
// A newline or a NUL in a filename is either a mistake or an attempt at one. Checked by
// code point rather than by a regex, because a regex that matches control characters is
// itself a lint finding, and this reads plainer anyway.
const isPrintable = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return code > 31 && code !== 127;
};

export const safeImportName = (raw: string): string => {
  const lastSegment = lastSegmentOf(raw);
  const cleaned = [...lastSegment].filter(isPrintable).join('').trim();
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
// Shared so the two functions below cannot drift: one writes the paragraph, the other
// finds it again.
const SUFFIX_OPENING = '\n\nThe user attached ';

export const attachmentSuffix = (files: readonly { readonly relativePath: string }[]): string => {
  if (files.length === 0) return '';
  const list = files.map((file) => `- ${file.relativePath}`).join('\n');
  const noun = files.length === 1 ? 'this file' : 'these files';
  return `${SUFFIX_OPENING}${noun}. They are in your working directory:\n${list}`;
};

// The message as the user typed it. What was sent, and therefore what the transcript
// keeps, carries the paragraph above; putting that back in the box when they press up
// would have them re-send a claim about files that are no longer attached.
//
// Last occurrence, not first: the paragraph is always last, so a message that happens to
// quote the same words keeps them.
export const withoutAttachmentSuffix = (text: string): string => {
  const opening = text.lastIndexOf(SUFFIX_OPENING);
  return opening === -1 ? text : text.slice(0, opening);
};
