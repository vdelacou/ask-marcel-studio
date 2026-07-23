/*
 * Whose data the app is looking at.
 *
 * One Microsoft 365 account, one folder. Signing in as somebody else opens their folder,
 * and signing back in finds the first one exactly as it was left, because nothing was ever
 * written across the two.
 *
 * Three moments matter:
 *
 *   - Launch. Read the record of the account last opened. If there is none but the old
 *     single-account layout is on disk, move it under the account it belonged to, which
 *     the stored quick context names.
 *   - A first sign-in. Work done before signing in sits in the signed-out folder; the
 *     account that signs in adopts it, so a first session does not split in two.
 *   - A different sign-in. The stores are already pointing at the old folder, so the app
 *     relaunches rather than half-switching. The caller decides how.
 *
 * Every filesystem move is injected, so the policy here is testable without a disk.
 */
import { PENDING_ACCOUNT, accountKeyFor, isSameAccount, resolveAccountKey } from '../../../shared/account-key.ts';
import type { AccountKey } from '../../../shared/account-key.ts';
import type { CurrentAccount } from '../../../shared/current-account.ts';
import type { QuickContext } from '../../../shared/quick-context.ts';

export type AccountFs = {
  // The account folders that already exist, so an address that changed still opens the
  // folder its data is in.
  readonly listAccounts: () => Promise<readonly AccountKey[]>;
  // True when the pre-account layout is still on disk (conversations sitting at the top).
  readonly hasLegacyLayout: () => Promise<boolean>;
  // Moves the pre-account layout into an account's folder.
  readonly adoptLegacy: (into: AccountKey) => Promise<void>;
  // Renames one account folder to another, for a signed-out folder being adopted.
  readonly renameAccount: (from: AccountKey, to: AccountKey) => Promise<void>;
  readonly readCurrent: () => Promise<CurrentAccount | undefined>;
  readonly writeCurrent: (account: CurrentAccount) => Promise<void>;
  // The quick context stored inside an account folder, which is how a legacy tree says
  // whose it was.
  readonly readQuickContextIn: (account: AccountKey | undefined) => Promise<QuickContext | undefined>;
};

export type AccountService = {
  readonly current: () => CurrentAccount;
  // Called whenever the app learns who is signed in. Answers what the caller must do.
  readonly observe: (context: QuickContext) => Promise<'unchanged' | 'adopted' | 'switched'>;
};

const accountFrom = (key: AccountKey, context: QuickContext): CurrentAccount => ({
  key,
  userId: context.userId,
  email: context.email,
  displayName: context.displayName,
});

const SIGNED_OUT: CurrentAccount = { key: PENDING_ACCOUNT, userId: '', email: '', displayName: '' };

// Resolves the account to open, doing any move the old layout needs, and returns a service
// that keeps it. Async because it reads disk; the composition root awaits it before
// building a single store.
export const createAccountService = async (fs: AccountFs): Promise<AccountService> => {
  const stored = await fs.readCurrent();

  const openLegacy = async (): Promise<CurrentAccount> => {
    // The old layout's quick context names the account it belonged to. Without one, the
    // app was never signed in, so the work is nobody's yet and moves to the signed-out
    // folder to be adopted by whoever signs in first.
    const context = await fs.readQuickContextIn(undefined);
    const key = context === undefined || context.userId.length === 0 ? PENDING_ACCOUNT : accountKeyFor({ id: context.userId, email: context.email });
    await fs.adoptLegacy(key);
    const account = context === undefined ? SIGNED_OUT : accountFrom(key, context);
    await fs.writeCurrent(account);
    return account;
  };

  let current = stored ?? ((await fs.hasLegacyLayout()) ? await openLegacy() : SIGNED_OUT);
  if (stored === undefined && current === SIGNED_OUT) await fs.writeCurrent(SIGNED_OUT);

  const observe = async (context: QuickContext): Promise<'unchanged' | 'adopted' | 'switched'> => {
    if (context.userId.length === 0) return 'unchanged';
    const wanted = resolveAccountKey(await fs.listAccounts(), { id: context.userId, email: context.email });
    if (current.key !== PENDING_ACCOUNT && isSameAccount(current.key, wanted)) {
      // Same person, possibly a new address or display name: keep the folder, refresh the
      // label so the UI has their current name.
      current = { ...accountFrom(current.key, context) };
      await fs.writeCurrent(current);
      return 'unchanged';
    }
    if (current.key === PENDING_ACCOUNT) {
      // Their first sign-in: the folder they have been working in becomes theirs, so
      // nothing done before signing in is stranded.
      await fs.renameAccount(PENDING_ACCOUNT, wanted);
      current = accountFrom(wanted, context);
      await fs.writeCurrent(current);
      return 'adopted';
    }
    // Somebody else. Record it and let the caller start again pointing at their folder.
    current = accountFrom(wanted, context);
    await fs.writeCurrent(current);
    return 'switched';
  };

  return { current: () => current, observe };
};
