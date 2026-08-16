/*
 * The per-token picture for the dot's hover tooltip. Marcel runs on the main token, which
 * re-mints itself from the shared refresh token forever, so there is no human-actionable
 * countdown to show, only what actually ends that cycle. The elevated-token countdown this
 * module used to carry ("Colleague lookups: N minutes left") is gone: colleague lookups run
 * on the main token now, so there is nothing to count down.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import type { OfficeStatus } from '../../../shared/office-status.ts';

// The access token behind mail/calendar/files/Teams chats is short-lived, but that number is
// not worth showing: it silently re-mints itself from the shared refresh token, forever, so a
// countdown would just tick down and reset with nothing for anyone to do. What is worth saying
// is what actually ends that cycle.
const AUTO_TOKENS_LINE = 'Mail, calendar, files and Teams chats: renew automatically, and only stop if you sign out, change your password, or access is revoked.';

export const tokenBreakdown = (status: OfficeStatus | undefined): string | undefined => {
  if (status === undefined || !status.signedIn) return undefined;
  return AUTO_TOKENS_LINE;
};
