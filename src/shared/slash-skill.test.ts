import { describe, expect, test } from 'bun:test';
import { rewriteSlashSkill } from './slash-skill.ts';

const FOLDERS = ['answer-from-m365', 'draft-outlook-email'];

const rewrite = (text: string, skillFolders: readonly string[] = FOLDERS): string => rewriteSlashSkill({ text, skillFolders });

describe('invoking a skill by name', () => {
  test('naming a skill turns the message into an instruction to load it', () => {
    const out = rewrite('/draft-outlook-email reply to Anna about the budget');

    expect(out).toContain('Use the Skill tool to load the skill "draft-outlook-email" now');
    expect(out).toContain('Request: reply to Anna about the budget');
  });

  test('the rest of the message is carried through verbatim', () => {
    expect(rewrite('/answer-from-m365   what did Anna send me?')).toContain('Request: what did Anna send me?');
  });

  test('naming a skill with nothing else still loads it and tells it to ask', () => {
    const out = rewrite('/draft-outlook-email');

    expect(out).toContain('load the skill "draft-outlook-email"');
    expect(out).toContain('ask for whatever it still needs');
  });

  test('a trailing newline after the name counts as nothing else', () => {
    expect(rewrite('/draft-outlook-email\n')).toContain('ask for whatever it still needs');
  });

  test('the name is matched however it was capitalised', () => {
    expect(rewrite('/Draft-Outlook-Email hello')).toContain('load the skill "draft-outlook-email"');
  });

  test('leading whitespace does not stop a skill being recognised', () => {
    expect(rewrite('  /answer-from-m365 hello')).toContain('load the skill "answer-from-m365"');
  });

  test('a multi-line request keeps its shape', () => {
    expect(rewrite('/answer-from-m365 find:\n- the deck\n- the budget')).toContain('Request: find:\n- the deck\n- the budget');
  });
});

describe('leaving an ordinary message alone', () => {
  test('a slash word that names no skill is not rewritten', () => {
    expect(rewrite('/deploy the thing')).toBe('/deploy the thing');
  });

  test('a file path is a message, not an invocation', () => {
    expect(rewrite('/Users/x/report.pdf is the one I meant')).toBe('/Users/x/report.pdf is the one I meant');
  });

  test('a lone slash is left alone', () => {
    expect(rewrite('/')).toBe('/');
  });

  test('a skill named mid-sentence is not an invocation', () => {
    expect(rewrite('use /draft-outlook-email for this')).toBe('use /draft-outlook-email for this');
  });

  test('an ordinary message is untouched', () => {
    expect(rewrite('what is in my inbox?')).toBe('what is in my inbox?');
  });

  test('an empty message is untouched', () => {
    expect(rewrite('')).toBe('');
  });

  test('with no skills installed nothing is an invocation', () => {
    expect(rewrite('/draft-outlook-email hello', [])).toBe('/draft-outlook-email hello');
  });

  test('a name that only starts like a skill is not that skill', () => {
    expect(rewrite('/draft hello')).toBe('/draft hello');
  });
});
