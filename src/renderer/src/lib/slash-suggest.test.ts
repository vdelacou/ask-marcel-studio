import { describe, expect, test } from 'bun:test';
import { filterSkills, insertSkill, slashQuery, stepActive } from './slash-suggest.ts';
import type { SkillSuggestion } from './slash-suggest.ts';

const SKILLS: readonly SkillSuggestion[] = [
  { folder: 'answer-from-m365', displayName: 'answer-from-m365', description: 'Search mail, files and people' },
  { folder: 'draft-outlook-email', displayName: 'draft-outlook-email', description: 'Prepare an unsent reply or new message' },
  { folder: 'weekly-report', displayName: 'weekly-report', description: 'Summarise the week from your calendar' },
];

describe('deciding when the skill menu is open', () => {
  test('a bare slash offers everything', () => {
    expect(slashQuery('/')).toBe('');
  });

  test('a name being typed narrows the list', () => {
    expect(slashQuery('/dra')).toBe('dra');
  });

  test('the menu closes once the name is finished', () => {
    // A space means the user has moved on to the message itself.
    expect(slashQuery('/draft-outlook-email ')).toBeUndefined();
  });

  test('a slash mid-message is not an invocation', () => {
    expect(slashQuery('see /notes')).toBeUndefined();
  });

  test('a slash that is not at the very start is not an invocation', () => {
    expect(slashQuery(' /notes')).toBeUndefined();
  });

  test('a path is not an invocation', () => {
    expect(slashQuery('/Users/x/report.pdf')).toBeUndefined();
  });

  test('an empty message has no menu', () => {
    expect(slashQuery('')).toBeUndefined();
  });
});

describe('choosing which skills to offer', () => {
  test('an empty query offers all of them, in their own order', () => {
    expect(filterSkills(SKILLS, '').map((s) => s.folder)).toEqual(['answer-from-m365', 'draft-outlook-email', 'weekly-report']);
  });

  test('what was typed matches the start of a name first', () => {
    expect(filterSkills(SKILLS, 'dra').map((s) => s.folder)).toEqual(['draft-outlook-email']);
  });

  test('a word from the description finds a skill whose name was half-remembered', () => {
    expect(filterSkills(SKILLS, 'calendar').map((s) => s.folder)).toEqual(['weekly-report']);
  });

  test('name matches come before description matches', () => {
    // 'report' starts weekly-report's name and appears in no other name.
    expect(filterSkills(SKILLS, 'report')[0]?.folder).toBe('weekly-report');
  });

  test('matching ignores capitals', () => {
    expect(filterSkills(SKILLS, 'DRAFT').map((s) => s.folder)).toEqual(['draft-outlook-email']);
  });

  test('a skill is never offered twice', () => {
    expect(filterSkills(SKILLS, 'answer')).toHaveLength(1);
  });

  test('nothing matching offers nothing', () => {
    expect(filterSkills(SKILLS, 'zzz')).toEqual([]);
  });
});

describe('moving the highlight with the arrow keys', () => {
  test('down moves to the next one', () => {
    expect(stepActive(3, 0, 1)).toBe(1);
  });

  test('down at the end wraps to the top', () => {
    expect(stepActive(3, 2, 1)).toBe(0);
  });

  test('up at the top wraps to the end', () => {
    expect(stepActive(3, 0, -1)).toBe(2);
  });

  test('a single entry stays where it is', () => {
    expect(stepActive(1, 0, 1)).toBe(0);
    expect(stepActive(1, 0, -1)).toBe(0);
  });

  test('an empty list has nowhere to move', () => {
    expect(stepActive(0, 0, 1)).toBe(0);
  });
});

describe('picking a skill', () => {
  test('picking leaves the composer ready for the rest of the message', () => {
    expect(insertSkill('draft-outlook-email')).toBe('/draft-outlook-email ');
  });
});

describe('offering skills by the name a person would use', () => {
  const skills = [
    { folder: 'answer-from-m365', displayName: 'Answer from Microsoft 365', description: 'Reads mail, files and the directory.' },
    { folder: 'draft-outlook-email', displayName: 'Draft an Outlook email', description: 'Prepares an unsent draft.' },
  ];

  test('typing the start of a folder finds it, which is what the slash is for', () => {
    expect(filterSkills(skills, 'ans').map((skill) => skill.folder)).toEqual(['answer-from-m365']);
  });

  test('typing the words a person would use finds it too', () => {
    expect(filterSkills(skills, 'draft an').map((skill) => skill.folder)).toEqual(['draft-outlook-email']);
  });

  test('picking one types the folder, because that is what an invocation matches', () => {
    expect(insertSkill('answer-from-m365')).toBe('/answer-from-m365 ');
  });

  test('what is typed still wins over what is merely mentioned', () => {
    const both = [
      { folder: 'notes', displayName: 'Notes', description: 'nothing' },
      { folder: 'other', displayName: 'Other', description: 'about notes' },
    ];

    expect(filterSkills(both, 'notes').map((skill) => skill.folder)).toEqual(['notes', 'other']);
  });
});
