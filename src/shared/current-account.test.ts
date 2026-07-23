import { describe, expect, test } from 'bun:test';
import { parseCurrentAccount, serialiseCurrentAccount } from './current-account.ts';
import { accountKeyFor } from './account-key.ts';

const account = {
  key: accountKeyFor({ id: 'id-1', email: 'vincent@lvmh.com' }),
  userId: 'id-1',
  email: 'vincent@lvmh.com',
  displayName: 'Vincent DELACOURT',
};

describe('remembering which account was open', () => {
  test('what was written is what is read back', () => {
    expect(parseCurrentAccount(JSON.parse(serialiseCurrentAccount(account)))).toEqual(account);
  });

  test('a record with no key names no account, because the key is what opens the folder', () => {
    expect(parseCurrentAccount({ userId: 'id-1', email: 'vincent@lvmh.com' })).toBeUndefined();
  });

  test('a key that could climb out of the data folder is refused', () => {
    expect(parseCurrentAccount({ key: '../../elsewhere', userId: 'id-1' })).toBeUndefined();
  });

  test('a record that is not a record at all names no account', () => {
    expect(parseCurrentAccount(null)).toBeUndefined();
    expect(parseCurrentAccount('vincent')).toBeUndefined();
  });

  test('a record missing its display fields still opens the right folder', () => {
    const parsed = parseCurrentAccount({ key: account.key });

    expect(parsed?.key).toBe(account.key);
    expect(parsed?.displayName).toBe('');
    expect(parsed?.email).toBe('');
    expect(parsed?.userId).toBe('');
  });

  test('display fields that are not text are dropped rather than shown as objects', () => {
    const parsed = parseCurrentAccount({ key: account.key, displayName: { first: 'V' }, email: 42, userId: null });

    expect(parsed?.displayName).toBe('');
    expect(parsed?.email).toBe('');
    expect(parsed?.userId).toBe('');
  });
});
