/*
 * Which account the app has open, as written next to the account folders.
 *
 * Read at launch before anything else, because it decides where every store looks. The
 * display fields are there so the UI can say whose world this is without waiting for a
 * Graph call.
 */
import { parseAccountKey } from './account-key.ts';
import type { AccountKey } from './account-key.ts';

export type CurrentAccount = {
  readonly key: AccountKey;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const stringOr = (value: unknown): string => (typeof value === 'string' ? value : '');

export const parseCurrentAccount = (value: unknown): CurrentAccount | undefined => {
  if (!isRecord(value)) return undefined;
  const key = parseAccountKey(value['key']);
  if (key === undefined) return undefined;
  return {
    key,
    userId: stringOr(value['userId']),
    email: stringOr(value['email']),
    displayName: stringOr(value['displayName']),
  };
};

export const serialiseCurrentAccount = (account: CurrentAccount): string => JSON.stringify(account, null, 2);
