import { describe, expect, test } from 'bun:test';
import { createAccountService } from './account-service.ts';
import type { AccountFs } from './account-service.ts';
import { PENDING_ACCOUNT, accountKeyFor } from '../../../shared/account-key.ts';
import type { AccountKey } from '../../../shared/account-key.ts';
import type { CurrentAccount } from '../../../shared/current-account.ts';
import type { QuickContext } from '../../../shared/quick-context.ts';

const contextFor = (userId: string, email: string, displayName = 'Someone'): QuickContext => ({
  userId,
  displayName,
  firstName: displayName.split(' ')[0] ?? '',
  email,
  ids: {},
});

const VINCENT = contextFor('id-vincent', 'vincent.delacourt@lvmh.com', 'Vincent DELACOURT');
const OTHER = contextFor('id-other', 'someone.else@lvmh.com', 'Someone Else');

// Hand-written fake filesystem (rule 13): folders as a set, moves as set operations.
const fakeFs = (
  options: {
    readonly accounts?: readonly AccountKey[];
    readonly current?: CurrentAccount;
    readonly legacy?: boolean;
    readonly legacyContext?: QuickContext;
    // What each account folder has cached about whose it is. A folder naming somebody
    // else is the leftover pointer a sign-in in that folder wrote.
    readonly storedContexts?: Readonly<Record<string, QuickContext>>;
  } = {}
): {
  readonly fs: AccountFs;
  readonly moves: string[];
  readonly folders: Set<string>;
  readonly written: CurrentAccount[];
  readonly cleared: string[];
} => {
  const folders = new Set<string>(options.accounts ?? []);
  const moves: string[] = [];
  const written: CurrentAccount[] = [];
  const cleared: string[] = [];
  const contexts = new Map<string, QuickContext>(Object.entries(options.storedContexts ?? {}));
  let current = options.current;
  let legacy = options.legacy ?? false;
  const fs: AccountFs = {
    listAccounts: () => Promise.resolve([...folders] as AccountKey[]),
    hasLegacyLayout: () => Promise.resolve(legacy),
    adoptLegacy: (into) => {
      moves.push(`legacy -> ${into}`);
      folders.add(into);
      legacy = false;
      return Promise.resolve();
    },
    renameAccount: (from, to) => {
      moves.push(`${from} -> ${to}`);
      folders.delete(from);
      folders.add(to);
      return Promise.resolve();
    },
    readCurrent: () => Promise.resolve(current),
    writeCurrent: (account) => {
      written.push(account);
      current = account;
      return Promise.resolve();
    },
    readQuickContextIn: (account) => Promise.resolve(account === undefined ? options.legacyContext : contexts.get(account)),
    clearQuickContextIn: (account) => {
      cleared.push(account);
      contexts.delete(account);
      return Promise.resolve();
    },
  };
  return { fs, moves, folders, written, cleared };
};

describe('opening the app on the right account', () => {
  test('the account opened last time is the one opened again', async () => {
    const key = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const { fs } = fakeFs({ accounts: [key], current: { key, userId: VINCENT.userId, email: VINCENT.email, displayName: 'Vincent DELACOURT' } });

    const service = await createAccountService(fs);

    expect(service.current().key).toBe(key);
  });

  test('a first ever launch works signed out, with a folder of its own', async () => {
    const { fs } = fakeFs();

    const service = await createAccountService(fs);

    expect(service.current().key).toBe(PENDING_ACCOUNT);
  });
});

describe('moving data written before accounts existed', () => {
  test('an existing installation’s data moves under the account it belonged to', async () => {
    const { fs, moves } = fakeFs({ legacy: true, legacyContext: VINCENT });

    const service = await createAccountService(fs);

    expect(moves).toEqual([`legacy -> ${accountKeyFor({ id: VINCENT.userId, email: VINCENT.email })}`]);
    expect(service.current().displayName).toBe('Vincent DELACOURT');
  });

  test('an installation that never signed in moves to the signed-out folder, to be claimed later', async () => {
    const { fs, moves } = fakeFs({ legacy: true });

    const service = await createAccountService(fs);

    expect(moves).toEqual([`legacy -> ${PENDING_ACCOUNT}`]);
    expect(service.current().key).toBe(PENDING_ACCOUNT);
  });

  test('the move happens once, not on every launch', async () => {
    const key = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const { fs, moves } = fakeFs({ legacy: true, current: { key, userId: VINCENT.userId, email: VINCENT.email, displayName: 'Vincent DELACOURT' } });

    await createAccountService(fs);

    expect(moves).toEqual([]);
  });
});

describe('signing in', () => {
  test('a first sign-in claims the work done before it', async () => {
    const { fs, moves } = fakeFs({ accounts: [PENDING_ACCOUNT] });
    const service = await createAccountService(fs);

    const outcome = await service.observe(VINCENT);

    expect(outcome).toBe('adopted');
    expect(moves).toEqual([`${PENDING_ACCOUNT} -> ${accountKeyFor({ id: VINCENT.userId, email: VINCENT.email })}`]);
  });

  test('signing in again as the same person changes nothing', async () => {
    const key = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const { fs, moves } = fakeFs({ accounts: [key], current: { key, userId: VINCENT.userId, email: VINCENT.email, displayName: 'Vincent DELACOURT' } });
    const service = await createAccountService(fs);

    expect(await service.observe(VINCENT)).toBe('unchanged');
    expect(moves).toEqual([]);
  });

  test('the same person under a new address keeps their folder', async () => {
    const key = accountKeyFor({ id: VINCENT.userId, email: 'old.address@lvmh.com' });
    const { fs, moves } = fakeFs({ accounts: [key], current: { key, userId: VINCENT.userId, email: 'old.address@lvmh.com', displayName: 'Vincent DELACOURT' } });
    const service = await createAccountService(fs);

    expect(await service.observe(VINCENT)).toBe('unchanged');
    expect(moves).toEqual([]);
  });

  test('signing in as somebody else is a switch, and never moves the first account’s data', async () => {
    const mine = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const { fs, moves, written } = fakeFs({ accounts: [mine], current: { key: mine, userId: VINCENT.userId, email: VINCENT.email, displayName: 'Vincent DELACOURT' } });
    const service = await createAccountService(fs);

    const outcome = await service.observe(OTHER);

    expect(outcome).toBe('switched');
    expect(moves).toEqual([]);
    expect(written.at(-1)?.key).toBe(accountKeyFor({ id: OTHER.userId, email: OTHER.email }));
  });

  test('coming back to the first account finds its own folder again', async () => {
    const mine = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const theirs = accountKeyFor({ id: OTHER.userId, email: OTHER.email });
    const { fs } = fakeFs({ accounts: [mine, theirs], current: { key: theirs, userId: OTHER.userId, email: OTHER.email, displayName: 'Someone Else' } });
    const service = await createAccountService(fs);

    expect(await service.observe(VINCENT)).toBe('switched');
    expect(service.current().key).toBe(mine);
  });

  test('the pointer that sends the app away is not left behind to send it back', async () => {
    const mine = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const theirs = accountKeyFor({ id: OTHER.userId, email: OTHER.email });
    // Signing in as somebody else while in my folder cached them there: that cache is how
    // the next launch knows to switch, and it must not survive the switch it caused.
    const { fs, cleared } = fakeFs({
      accounts: [mine, theirs],
      current: { key: mine, userId: VINCENT.userId, email: VINCENT.email, displayName: VINCENT.displayName },
      storedContexts: { [mine]: OTHER },
    });
    const service = await createAccountService(fs);

    expect(await service.observe(OTHER)).toBe('switched');
    expect(cleared).toEqual([mine]);
    expect(await fs.readQuickContextIn(mine)).toBeUndefined();
  });

  test('two folders each cached as the other’s do not bounce the app between them forever', async () => {
    const mine = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const theirs = accountKeyFor({ id: OTHER.userId, email: OTHER.email });
    // The state that had the app relaunching in a loop: each folder cached as belonging to
    // the account the other folder is named for.
    const { fs } = fakeFs({
      accounts: [mine, theirs],
      current: { key: mine, userId: VINCENT.userId, email: VINCENT.email, displayName: VINCENT.displayName },
      storedContexts: { [mine]: OTHER, [theirs]: VINCENT },
    });

    // Launch, switch, relaunch, switch: two hops is all the pointers can pay for.
    expect(await (await createAccountService(fs)).observe(OTHER)).toBe('switched');
    expect(await (await createAccountService(fs)).observe(VINCENT)).toBe('switched');

    // Nothing is left to read whose answer would move the app again: the next launch has
    // to ask Microsoft 365 who is signed in, and that answer is the true one.
    expect(await fs.readQuickContextIn(mine)).toBeUndefined();
    expect(await fs.readQuickContextIn(theirs)).toBeUndefined();
  });

  test('a context with no id at all leaves the open account alone', async () => {
    const key = accountKeyFor({ id: VINCENT.userId, email: VINCENT.email });
    const { fs, written } = fakeFs({ accounts: [key], current: { key, userId: VINCENT.userId, email: VINCENT.email, displayName: 'Vincent DELACOURT' } });
    const service = await createAccountService(fs);

    expect(await service.observe(contextFor('', ''))).toBe('unchanged');
    expect(written).toEqual([]);
  });
});
