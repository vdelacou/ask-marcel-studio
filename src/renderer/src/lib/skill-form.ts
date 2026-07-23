/*
 * The skill editor's model: a SKILL.md as a set of fields and a body.
 *
 * The renderer half of skill-md's SkillDoc. It keeps the editor from having to know the
 * frontmatter syntax: the page shell edits a name, a description, a handful of extra
 * fields and the body, and this maps that to and from the file text the store keeps.
 *
 * Pure: no react, no electron. The parsing and folding live in shared/skill-md; this is
 * the thin renderer-side view over it.
 */
import { parseSkillDoc, serialiseSkillDoc } from '../../../shared/skill-doc.ts';
import type { SkillDoc } from '../../../shared/skill-doc.ts';

export type SkillForm = {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly extras: readonly { readonly key: string; readonly value: string }[];
  readonly body: string;
};

const EMPTY_FORM: SkillForm = { name: '', displayName: '', description: '', extras: [], body: '' };

// A SKILL.md the store handed us, as a form. Unreadable frontmatter yields an empty form
// rather than throwing: a built-in should never fail to open, and the caller can decide
// whether to allow saving.
export const skillFormFromText = (text: string): SkillForm => {
  const doc = parseSkillDoc(text);
  if (!doc.ok) return EMPTY_FORM;
  return { name: doc.value.name, displayName: doc.value.displayName ?? '', description: doc.value.description, extras: doc.value.extras, body: doc.value.body };
};

export const textFromSkillForm = (form: SkillForm): string => {
  const doc: SkillDoc = {
    name: form.name,
    description: form.description,
    ...(form.displayName.trim().length === 0 ? {} : { displayName: form.displayName }),
    extras: form.extras,
    body: form.body,
  };
  return serialiseSkillDoc(doc);
};

// Whether anything a save would write has changed. Compared through the serialiser so a
// difference that folds away (a trailing space, a newline in the description) is not
// reported as a dirty edit.
export const isSkillFormDirty = (a: SkillForm, b: SkillForm): boolean => textFromSkillForm(a) !== textFromSkillForm(b);
