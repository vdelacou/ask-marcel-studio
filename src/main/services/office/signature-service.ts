/*
 * Fetching the user's own Outlook signature, once, without telling them.
 *
 * No model involved: the office CLI already knows how to pull the signature out of a
 * sent message, images inlined and all. This is the cheapest useful thing the app can
 * do for someone who has just signed in, and a signature that is already there is never
 * overwritten: the moment the user edits it, it is theirs.
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
  readonly signaturePath: string;
  // The tiny filesystem slice this needs, injected so a test spawns nothing and writes
  // nothing.
  readonly hasSignature: () => Promise<boolean>;
  readonly wroteSomething: () => Promise<boolean>;
};

export type SignatureService = {
  readonly prefill: (force: boolean) => Promise<Result<null, BackgroundJobError>>;
};

const STATUS_TIMEOUT_MS = 15_000;
const SIGNATURE_TIMEOUT_MS = 60_000;
const LIST_TIMEOUT_MS = 30_000;

export const createSignatureService = (deps: SignatureServiceDeps): SignatureService => {
  const fetchInto = async (messageId?: string): Promise<boolean> => {
    const args = ['get-mail-signature', '--output-path', deps.signaturePath, ...(messageId === undefined ? [] : ['--message-id', messageId])];
    const outcome = await deps.run(args, SIGNATURE_TIMEOUT_MS);
    if (!outcome.ran || outcome.code !== 0) return false;
    // The CLI can exit cleanly having written nothing when the message it picked has no
    // signature block in it.
    return deps.wroteSomething();
  };

  const prefill = async (force: boolean): Promise<Result<null, BackgroundJobError>> => {
    // Never overwrite what the user has: the moment they edit it, it is theirs.
    if (!force && (await deps.hasSignature())) return err({ kind: 'skipped', message: 'there is already a signature' });

    const status = await deps.run(['scopes-check', '--output', 'json'], STATUS_TIMEOUT_MS);
    if (!status.ran || status.code !== 0) return err({ kind: 'skipped', message: 'not signed in to Microsoft 365 yet' });

    // The CLI finds a sent message itself when given no id, which is the usual path.
    if (await fetchInto()) return ok(null);

    const listed = await deps.run(['list-mail-folder-messages', '--mail-folder-id', 'sentitems', '--top', '5', '--select', 'id', '--output', 'json'], LIST_TIMEOUT_MS);
    const messageId = listed.ran && listed.code === 0 ? pickSentMessageId(listed.stdout) : undefined;
    if (messageId === undefined) return err({ kind: 'skipped', message: 'no sent message to take a signature from yet' });

    if (await fetchInto(messageId)) return ok(null);
    return err({ kind: 'skipped', message: 'that sent message carried no signature' });
  };

  return { prefill };
};
