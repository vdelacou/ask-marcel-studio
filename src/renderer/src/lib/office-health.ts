/*
 * Whether Microsoft 365 is actually working right now, said as one dot and one sentence.
 *
 * Marcel runs on the main token alone: mail, files, calendar, people, and colleague lookups
 * (get-user reads the directory on the main token now). That token re-mints itself from the
 * shared refresh token, so health is simply whether the sign-in is live. The elevated token
 * that once gated colleague lookups is no longer used by the app, so a stale one costs nothing
 * and is not surfaced; the substrate tokens self-heal on their next real call. What remains is
 * the one failure worth a dot: the sign-in itself has ended.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import { tokenBreakdown } from './office-renewal.ts';
import type { OfficeError } from '../../../shared/ipc-contract.ts';
import type { OfficeStatus } from '../../../shared/office-status.ts';

export type OfficeHealth = 'checking' | 'healthy' | 'signed-out';

export type OfficeHealthView = {
  readonly health: OfficeHealth;
  readonly message: string;
};

// The popover behind the dot. Fields the elevated-token era needed (unavailable / reassurance /
// renewalNote) are kept on the shape so the components that read them stay unchanged; they are
// simply never populated now that nothing degrades short of a full sign-out.
export type OfficePopoverView = {
  readonly health: OfficeHealth;
  readonly headline: string;
  readonly unavailable: readonly string[];
  readonly reassurance?: string;
  readonly renewalNote?: string;
  // The fuller per-token picture for the dot's hover tooltip. Shown whenever signed in.
  readonly dotDetail?: string;
  readonly action: 'refresh' | 'sign-in';
  readonly canRefresh: boolean;
  readonly canSignOut: boolean;
};

// undefined means the probe itself could not run, which the user experiences as being
// signed out: nothing will work until they sign in again.
export const healthFromStatus = (status: OfficeStatus | undefined): OfficeHealthView => {
  if (status === undefined) return { health: 'signed-out', message: 'Marcel cannot reach Microsoft 365 right now.' };
  if (!status.signedIn) return { health: 'signed-out', message: 'You are not signed in to Microsoft 365.' };
  // Negative or zero seconds means the main token is already dead.
  if (status.expiresInSeconds !== undefined && status.expiresInSeconds <= 0) return { health: 'signed-out', message: 'Your Microsoft 365 sign-in has expired.' };
  return { health: 'healthy', message: 'Connected to Microsoft 365.' };
};

const HEADLINES: Record<OfficeHealth, string> = {
  checking: 'Checking your Microsoft 365 sign-in.',
  healthy: 'Marcel can read your mail, files, calendar, colleagues and Teams chats.',
  'signed-out': 'Your Microsoft 365 sign-in has ended. To let Marcel read your mail, files and calendar, sign in again.',
};

// The dot's own tooltip. Deliberately not the CLI's reason string: that is written for
// someone debugging a token, not for the user reading it on hover.
const DOT_LABELS: Record<OfficeHealth, string> = {
  checking: 'Checking your Microsoft 365 sign-in',
  healthy: 'Microsoft 365 is connected',
  'signed-out': 'You are signed out of Microsoft 365',
};

export const dotLabel = (health: OfficeHealth): string => DOT_LABELS[health];

export const popoverViewFromStatus = (status: OfficeStatus | undefined, isChecking = false): OfficePopoverView => {
  const health = isChecking ? 'checking' : healthFromStatus(status).health;
  const detail = tokenBreakdown(status);
  return {
    health,
    headline: HEADLINES[health],
    unavailable: [],
    ...(detail === undefined ? {} : { dotDetail: detail }),
    action: health === 'signed-out' ? 'sign-in' : 'refresh',
    canRefresh: health === 'signed-out',
    canSignOut: health === 'healthy',
  };
};

const LOGIN_ERRORS: Record<OfficeError['kind'], string> = {
  busy: 'A sign-in window is already open. Finish it, or close it and try again.',
  'login-failed': 'The sign-in did not finish. If you closed the browser window, just try again.',
  'timed-out': 'The sign-in window stayed open too long. Try again.',
  'spawn-failed': 'Marcel could not start the sign-in. Restart the app and try again.',
};

export const loginErrorMessage = (error: OfficeError): string => LOGIN_ERRORS[error.kind];
