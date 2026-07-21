import { describe, expect, test } from 'bun:test';
import { friendlyScope, scopeRows, scopesSummary } from './office-scopes.ts';

describe('saying what Microsoft 365 access was granted', () => {
  test('a known scope is replaced by wording an office employee can act on', () => {
    expect(friendlyScope('Mail.Read')).toBe('Read your email');
  });

  test('the drafting scope says drafts are never sent, because that is the promise the app makes', () => {
    expect(friendlyScope('Mail.ReadWrite')).toBe('Prepare email drafts (it never sends them)');
  });

  test('a scope written as a full Graph resource URI reads the same as the bare one', () => {
    expect(friendlyScope('https://graph.microsoft.com/Calendars.Read')).toBe('Read your calendar');
  });

  test('an outlook-resource scope is recognised too', () => {
    expect(friendlyScope('https://outlook.office.com/Mail.Read')).toBe('Read your email');
  });

  test('a scope we have no wording for is shown verbatim rather than hidden', () => {
    expect(friendlyScope('Bookings.Read.All')).toBe('Bookings.Read.All');
  });

  test('rows carry both the wording and the raw scope, so the list is checkable', () => {
    expect(scopeRows(['Mail.Read'])).toEqual([{ scope: 'Mail.Read', label: 'Read your email' }]);
  });

  test('rows are ordered by what the reader sees', () => {
    expect(scopeRows(['User.Read', 'Calendars.Read']).map((r) => r.label)).toEqual(['Read your calendar', 'Read your own profile']);
  });

  test('two scopes sharing one wording keep a stable order', () => {
    expect(scopeRows(['Mail.ReadBasic', 'Mail.Read']).map((r) => r.scope)).toEqual(['Mail.Read', 'Mail.ReadBasic']);
  });

  test('a repeated scope is listed once', () => {
    expect(scopeRows(['Mail.Read', 'Mail.Read'])).toHaveLength(1);
  });

  test('an empty token lists nothing', () => {
    expect(scopeRows([])).toEqual([]);
  });

  test('the summary names the areas the token actually covers, in reading order', () => {
    expect(scopesSummary(['Tasks.Read', 'Mail.Read', 'Calendars.Read'])).toBe('Marcel can read your mail, calendar and tasks.');
  });

  test('one area needs no list punctuation', () => {
    expect(scopesSummary(['Mail.Read'])).toBe('Marcel can read your mail.');
  });

  test('files and sharepoint sites are one area, not two', () => {
    expect(scopesSummary(['Files.Read.All', 'Sites.Read.All'])).toBe('Marcel can read your files.');
  });

  test('directory scopes are described as colleagues, not as users', () => {
    expect(scopesSummary(['User.ReadBasic.All'])).toBe('Marcel can read your colleagues.');
  });

  test('a bare profile scope is not mistaken for directory access', () => {
    expect(scopesSummary(['User.Read'])).toBe('Signed in to Microsoft 365.');
  });

  test('a token covering nothing we name still reports being signed in', () => {
    expect(scopesSummary(['openid', 'profile'])).toBe('Signed in to Microsoft 365.');
  });

  test('no scopes at all still reports being signed in', () => {
    expect(scopesSummary([])).toBe('Signed in to Microsoft 365.');
  });

  test('the summary reads through full resource URIs as well', () => {
    expect(scopesSummary(['https://graph.microsoft.com/Mail.Read'])).toBe('Marcel can read your mail.');
  });
});
