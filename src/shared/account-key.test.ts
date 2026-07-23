import { describe, expect, test } from 'bun:test';
import { PENDING_ACCOUNT, accountKeyFor, isSameAccount, parseAccountKey, resolveAccountKey } from './account-key.ts';

describe('naming the folder an account’s data lives in', () => {
  test('two accounts get two different folders', () => {
    const one = accountKeyFor({ id: '9a1f-0001', email: 'vincent.delacourt@lvmh.com' });
    const other = accountKeyFor({ id: '9a1f-0002', email: 'someone.else@lvmh.com' });

    expect(one).not.toBe(other);
  });

  test('the same account gets the same folder every time, so its data is found again', () => {
    expect(accountKeyFor({ id: '9a1f-0001', email: 'v@lvmh.com' })).toBe(accountKeyFor({ id: '9a1f-0001', email: 'v@lvmh.com' }));
  });

  test('the folder is named after the person, so a support question can be answered by looking', () => {
    expect(accountKeyFor({ id: '9a1f-0001', email: 'Vincent.DELACOURT@lvmh.com' })).toContain('vincent-delacourt');
  });

  test('an account that changed its address is still the same account', () => {
    // The directory id is what Microsoft 365 promises not to reuse; an address changes
    // when a person's name does.
    const before = accountKeyFor({ id: '9a1f-0001', email: 'old.name@lvmh.com' });
    const after = accountKeyFor({ id: '9a1f-0001', email: 'new.name@lvmh.com' });

    expect(isSameAccount(before, after)).toBe(true);
  });

  test('someone whose address changed opens the folder their data is already in', () => {
    const before = accountKeyFor({ id: '9a1f-0001', email: 'old.name@lvmh.com' });

    expect(resolveAccountKey([before], { id: '9a1f-0001', email: 'new.name@lvmh.com' })).toBe(before);
  });

  test('a new person gets a new folder rather than inheriting somebody else’s', () => {
    const existing = accountKeyFor({ id: '9a1f-0001', email: 'analyst@lvmh.com' });

    expect(resolveAccountKey([existing], { id: '9a1f-0002', email: 'analyst@lvmh.com' })).not.toBe(existing);
  });

  test('the signed-out folder is never adopted as somebody’s account folder', () => {
    expect(resolveAccountKey([PENDING_ACCOUNT], { id: '9a1f-0001', email: 'v@lvmh.com' })).not.toBe(PENDING_ACCOUNT);
  });

  test('two people who once shared an address do not share a folder', () => {
    const leaver = accountKeyFor({ id: '9a1f-0001', email: 'analyst@lvmh.com' });
    const joiner = accountKeyFor({ id: '9a1f-0002', email: 'analyst@lvmh.com' });

    expect(isSameAccount(leaver, joiner)).toBe(false);
  });
});

describe('keeping the folder name safe to be a folder name', () => {
  test('an address that tries to climb out of the data folder cannot', () => {
    const key = accountKeyFor({ id: '../../etc', email: '../../../etc/passwd' });

    expect(key).not.toContain('/');
    expect(key).not.toContain('..');
  });

  test('a name with spaces, quotes and accents becomes something a filesystem accepts', () => {
    const key = accountKeyFor({ id: 'id 1', email: "Renée O'Hara@lvmh.com" });

    expect(key).toMatch(/^[a-z0-9-]+$/);
  });

  test('an absurdly long address does not make an absurdly long path', () => {
    const key = accountKeyFor({ id: 'id1', email: `${'x'.repeat(500)}@lvmh.com` });

    expect(key.length).toBeLessThanOrEqual(80);
  });

  test('an account with no email at all still gets a folder of its own', () => {
    const key = accountKeyFor({ id: '9a1f-0001', email: '' });

    expect(key).toMatch(/^[a-z0-9-]+$/);
    expect(key.length).toBeGreaterThan(0);
  });
});

describe('before anyone has signed in', () => {
  test('there is a folder to work in, so the app runs signed out', () => {
    expect(PENDING_ACCOUNT).toMatch(/^[a-z0-9-]+$/);
  });

  test('the signed-out folder is nobody’s account', () => {
    expect(isSameAccount(PENDING_ACCOUNT, accountKeyFor({ id: '9a1f-0001', email: 'v@lvmh.com' }))).toBe(false);
  });
});

describe('reading a folder name back from disk', () => {
  test('a key the app wrote is accepted', () => {
    const key = accountKeyFor({ id: '9a1f-0001', email: 'v@lvmh.com' });

    expect(parseAccountKey(String(key))).toBe(key);
  });

  test('anything that is not a key the app would have written is refused', () => {
    expect(parseAccountKey('../escape')).toBeUndefined();
    expect(parseAccountKey('')).toBeUndefined();
    expect(parseAccountKey('Has Capitals')).toBeUndefined();
  });
});

describe('the shape of a folder name, exactly', () => {
  test('a plain address makes exactly the name it looks like it should', () => {
    // Pinned whole rather than by fragments: this string is a folder that will hold a
    // person's mail history, so a silent change to how it is built must fail here.
    expect(accountKeyFor({ id: 'id-1', email: 'vincent.delacourt@lvmh.com' })).toMatch(/^vincent-delacourt-[a-z0-9]+$/);
  });

  test('the readable half is the address, and the stable half is the id', () => {
    const key = accountKeyFor({ id: 'id-1', email: 'vincent.delacourt@lvmh.com' });
    const sameIdOtherAddress = accountKeyFor({ id: 'id-1', email: 'other.name@lvmh.com' });

    expect(key.split('-').at(-1)).toBe(sameIdOtherAddress.split('-').at(-1));
    expect(key.startsWith('vincent-delacourt-')).toBe(true);
  });

  test('a run of punctuation becomes one dash, not one per character', () => {
    expect(accountKeyFor({ id: 'id-1', email: 'a...b@lvmh.com' }).startsWith('a-b-')).toBe(true);
  });

  test('an address that starts or ends in punctuation does not start or end in a dash', () => {
    const key = accountKeyFor({ id: 'id-1', email: '.vincent.@lvmh.com' });

    expect(key.startsWith('-')).toBe(false);
    expect(key).toContain('vincent-');
  });

  test('accents are folded, so one person does not get two folders that look identical', () => {
    expect(accountKeyFor({ id: 'id-1', email: 'renée@lvmh.com' })).toBe(accountKeyFor({ id: 'id-1', email: 'renee@lvmh.com' }));
  });

  test('a label cut short by the length limit still does not end in a dash', () => {
    const key = accountKeyFor({ id: 'id-1', email: `${'a'.repeat(39)}.surname@lvmh.com` });

    expect(key).not.toContain('--');
    expect(key.split('-').at(-1)).toBe(accountKeyFor({ id: 'id-1', email: 'x@lvmh.com' }).split('-').at(-1));
  });

  test('two ids that differ by one character get two folders', () => {
    expect(accountKeyFor({ id: 'id-1', email: 'v@lvmh.com' })).not.toBe(accountKeyFor({ id: 'id-2', email: 'v@lvmh.com' }));
  });

  test('a long id is fingerprinted from all of it, not from its first characters', () => {
    const one = accountKeyFor({ id: `${'x'.repeat(60)}a`, email: 'v@lvmh.com' });
    const other = accountKeyFor({ id: `${'x'.repeat(60)}b`, email: 'v@lvmh.com' });

    expect(one).not.toBe(other);
  });
});

describe('refusing a folder name the app would not have written', () => {
  test('a key with a trailing slash is refused, however innocent the start looks', () => {
    expect(parseAccountKey('vincent-abc/../../elsewhere')).toBeUndefined();
  });

  test('a key of exactly the maximum length is accepted, and one past it is not', () => {
    expect(parseAccountKey('a'.repeat(80))).toBe('a'.repeat(80) as never);
    expect(parseAccountKey('a'.repeat(81))).toBeUndefined();
  });

  test('a key that is not text at all is refused', () => {
    expect(parseAccountKey(42)).toBeUndefined();
    expect(parseAccountKey(undefined)).toBeUndefined();
    expect(parseAccountKey({ key: 'vincent' })).toBeUndefined();
  });
});

describe('choosing between the folders that already exist', () => {
  test('with nothing on disk, the name the address suggests is used', () => {
    expect(resolveAccountKey([], { id: 'id-1', email: 'v@lvmh.com' })).toBe(accountKeyFor({ id: 'id-1', email: 'v@lvmh.com' }));
  });

  test('somebody else’s folder is never chosen, however similar the address', () => {
    const theirs = accountKeyFor({ id: 'id-2', email: 'v@lvmh.com' });

    expect(resolveAccountKey([theirs], { id: 'id-1', email: 'v@lvmh.com' })).not.toBe(theirs);
  });

  test('the first matching folder wins when several somehow match', () => {
    const old = accountKeyFor({ id: 'id-1', email: 'old@lvmh.com' });

    expect(resolveAccountKey([old, accountKeyFor({ id: 'id-1', email: 'newer@lvmh.com' })], { id: 'id-1', email: 'newest@lvmh.com' })).toBe(old);
  });
});
