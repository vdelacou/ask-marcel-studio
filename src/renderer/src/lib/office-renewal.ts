/*
 * How long until the elevated token needs a human. Its own module, separate from
 * office-health: this is a display concern for the curious, not the break/fix triage
 * office-health owns, and the elevated token is the only one worth counting down (the
 * others self-heal silently, so a countdown for them would be noise).
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import type { OfficeStatus, TokenTier } from '../../../shared/office-status.ts';

const formatRenewsIn = (seconds: number): string => {
  if (seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
};

// undefined whenever there is nothing worth telling the user: not signed in, no
// elevated tier in the response, it already died (the reassurance covers that case), or
// the CLI gave no expiry to count down.
export const renewalNote = (status: OfficeStatus | undefined): string | undefined => {
  if (status === undefined || !status.signedIn) return undefined;
  const elevated = status.tiers.elevated;
  if (elevated === undefined || !elevated.available || elevated.expiresInSeconds === undefined) return undefined;
  return `Colleague lookups: ${formatRenewsIn(elevated.expiresInSeconds)} left, then refresh to keep using them. Everything else renews itself.`;
};

// Genuinely negative means the CLI can prove it is overdue, worth a number. A small
// positive value here is the 5-minute preflight buffer, not an actual expiry: the tier
// already reads as unavailable, so a countdown on top of that would contradict it.
const overdueBy = (elevated: TokenTier): string | undefined =>
  elevated.expiresInSeconds !== undefined && elevated.expiresInSeconds < 0 ? `, expired ${formatRenewsIn(-elevated.expiresInSeconds)} ago` : undefined;

const elevatedBreakdownLine = (elevated: TokenTier | undefined): string => {
  if (elevated === undefined) return 'Colleague lookups: status unknown';
  if (!elevated.available) return `Colleague lookups: needs a refresh${overdueBy(elevated) ?? ''}`;
  if (elevated.expiresInSeconds === undefined) return 'Colleague lookups: available';
  return `Colleague lookups: ${formatRenewsIn(elevated.expiresInSeconds)} left`;
};

// The access token behind mail/calendar/files/Teams chats is short-lived, but that
// number is not worth showing: it silently re-mints itself from the shared refresh
// token, forever, so a countdown would just tick down and reset with nothing for
// anyone to do. What is worth saying is what actually ends that cycle.
const AUTO_TOKENS_LINE = 'Mail, calendar, files and Teams chats: renew automatically, and only stop if you sign out, change your password, or access is revoked.';

// The fuller picture, for the dot's hover tooltip: not shown by default (the popover
// only ever states the one number worth acting on), but available for whoever goes
// looking for it.
export const tokenBreakdown = (status: OfficeStatus | undefined): string | undefined => {
  if (status === undefined || !status.signedIn) return undefined;
  return [AUTO_TOKENS_LINE, elevatedBreakdownLine(status.tiers.elevated)].join('\n');
};
