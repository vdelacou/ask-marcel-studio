/*
 * Fetching the user's own Outlook signature, once, without telling them.
 *
 * No model involved: the office CLI already knows how to pull the signature out of a
 * sent message, images inlined and all. This is the cheapest useful thing the app can
 * do for someone who has just signed in, and a signature that is already there is never
 * overwritten: the moment the user edits it, it is theirs. That holds while the fetch runs
 * too: the CLI writes beside the signature, and what it fetched takes the signature's place
 * only if the user still has none once it is done, or asked for it.
 *
 * Silent failure is the design. Not signed in yet, no sent mail, a network blip: none
 * of these are worth a dialog for something nobody asked for. It is tried again on the
 * next launch.
 */
import { pickSentMessageId } from '../../../shared/sent-mail.ts';
import type { OfficeRun } from './office-service.ts';
import type { BackgroundJobError } from '../background/background-runner.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type SignatureServiceDeps = {
  readonly run: OfficeRun;
  // Where the CLI writes what it fetched: beside the signature, never over it.
  readonly fetchPath: string;
  // The tiny filesystem slice this needs, injected so a test spawns nothing and writes
  // nothing. The last three are about the fetched file: whether the fetch wrote something
  // there, putting it in the signature's place, and throwing it away.
  readonly hasSignature: () => Promise<boolean>;
  readonly wroteSomething: () => Promise<boolean>;
  readonly keepFetched: () => Promise<boolean>;
  readonly dropFetched: () => Promise<void>;
};

export type SignatureService = {
  readonly prefill: (force: boolean) => Promise<Result<null, BackgroundJobError>>;
};

const STATUS_TIMEOUT_MS = 15_000;
const SIGNATURE_TIMEOUT_MS = 60_000;
const LIST_TIMEOUT_MS = 30_000;

const ALREADY: BackgroundJobError = { kind: 'skipped', message: 'there is already a signature' };

export const createSignatureService = (deps: SignatureServiceDeps): SignatureService => {
  // Each fetch starts from nothing, so a file an earlier one left is never taken for this one.
  const fetchInto = async (messageId?: string): Promise<boolean> => {
    await deps.dropFetched();
    const args = ['get-mail-signature', '--output-path', deps.fetchPath, ...(messageId === undefined ? [] : ['--message-id', messageId])];
    const outcome = await deps.run(args, SIGNATURE_TIMEOUT_MS);
    if (!outcome.ran || outcome.code !== 0) return false;
    // The CLI can exit cleanly having written nothing when the message it picked has no
    // signature block in it.
    return deps.wroteSomething();
  };

  // A signature the user wrote while the CLI read their mail stays theirs, unless they asked
  // for the one in their mailbox: what was fetched is thrown away then.
  const settle = async (force: boolean): Promise<Result<null, BackgroundJobError>> => {
    if (!force && (await deps.hasSignature())) {
      await deps.dropFetched();
      return err(ALREADY);
    }
    return (await deps.keepFetched()) ? ok(null) : err({ kind: 'failed', message: 'the signature fetched could not be put in place' });
  };

  const prefill = async (force: boolean): Promise<Result<null, BackgroundJobError>> => {
    // Never overwrite what the user has: the moment they edit it, it is theirs.
    if (!force && (await deps.hasSignature())) return err(ALREADY);

    const status = await deps.run(['scopes-check', '--output', 'json'], STATUS_TIMEOUT_MS);
    if (!status.ran || status.code !== 0) return err({ kind: 'skipped', message: 'not signed in to Microsoft 365 yet' });

    // The CLI finds a sent message itself when given no id, which is the usual path.
    if (await fetchInto()) return settle(force);

    const listed = await deps.run(['list-mail-folder-messages', '--mail-folder-id', 'sentitems', '--top', '5', '--select', 'id', '--output', 'json'], LIST_TIMEOUT_MS);
    const messageId = listed.ran && listed.code === 0 ? pickSentMessageId(listed.stdout) : undefined;
    if (messageId === undefined) return err({ kind: 'skipped', message: 'no sent message to take a signature from yet' });

    if (await fetchInto(messageId)) return settle(force);
    return err({ kind: 'skipped', message: 'that sent message carried no signature' });
  };

  return { prefill };
};
