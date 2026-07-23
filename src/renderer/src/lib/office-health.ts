/*
 * Whether Microsoft 365 is actually working right now, said as one dot and one
 * sentence.
 *
 * The failure this exists to catch is quiet: the main token refreshes itself, but the
 * elevated one carries no refresh token and can only come back from a browser sign-in.
 * So mail keeps working while looking a colleague up starts failing, and the only
 * symptom the user sees is the agent apologising. The dot says it before that happens.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
import type { OfficeError } from '../../../shared/ipc-contract.ts';
import type { OfficeStatus, TokenTier } from '../../../shared/office-status.ts';

export type OfficeHealth = 'checking' | 'healthy' | 'attention' | 'signed-out';

export type OfficeHealthView = {
  readonly health: OfficeHealth;
  readonly message: string;
};

// What the popover behind the dot shows. The distinction it exists to draw: a tier that
// died is an inconvenience with a named cost, while a dead main token stops everything.
// The first must not read as "sign in again", because that is not what it takes to fix.
export type OfficePopoverView = {
  readonly health: OfficeHealth;
  readonly headline: string;
  // The things Marcel cannot do until the sign-in is refreshed, in the user's words.
  readonly unavailable: readonly string[];
  readonly reassurance?: string;
  readonly action: 'refresh' | 'sign-in';
  readonly canSignOut: boolean;
};

const tiersOf = (status: Extract<OfficeStatus, { signedIn: true }>): readonly TokenTier[] =>
  [status.tiers.elevated, status.tiers.chatsvcagg, status.tiers.ic3].filter((tier): tier is TokenTier => tier !== undefined);

// undefined means the probe itself could not run, which the user experiences as being
// signed out: nothing will work until they sign in again.
export const healthFromStatus = (status: OfficeStatus | undefined): OfficeHealthView => {
  if (status === undefined) return { health: 'signed-out', message: 'Marcel cannot reach Microsoft 365 right now.' };
  if (!status.signedIn) return { health: 'signed-out', message: 'You are not signed in to Microsoft 365.' };
  // Negative or zero seconds means the token is already dead, whatever the CLI says
  // about the rest.
  if (status.expiresInSeconds !== undefined && status.expiresInSeconds <= 0) return { health: 'signed-out', message: 'Your Microsoft 365 sign-in has expired.' };

  const broken = tiersOf(status).find((tier) => !tier.available);
  if (broken === undefined) return { health: 'healthy', message: 'Connected to Microsoft 365.' };
  return { health: 'attention', message: broken.reason ?? 'Part of your Microsoft 365 sign-in has expired. Refreshing it takes a moment.' };
};

// One line per token, in the terms of the job it does. Teams rides two tokens; losing
// either costs the same thing, so the list says it once.
const COLLEAGUE_DETAILS = 'Look up colleague details like phone numbers, offices and managers';
const TEAMS_CHATS = 'Read your Teams chats';

const lostFunctions = (status: OfficeStatus | undefined): readonly string[] => {
  if (status === undefined || !status.signedIn) return [];
  const lost = [
    status.tiers.elevated?.available === false ? COLLEAGUE_DETAILS : undefined,
    status.tiers.chatsvcagg?.available === false || status.tiers.ic3?.available === false ? TEAMS_CHATS : undefined,
  ];
  return lost.filter((entry): entry is string => entry !== undefined);
};

const HEADLINES: Record<OfficeHealth, string> = {
  checking: 'Checking your Microsoft 365 sign-in.',
  healthy: 'Marcel can read your mail, files, calendar, colleagues and Teams chats.',
  attention: 'Part of your sign-in has expired. Most things still work, but until you refresh it Marcel cannot:',
  'signed-out': 'Your Microsoft 365 sign-in has ended. Marcel cannot read your mail, files or calendar until you sign in again.',
};

// The dot's own tooltip. Deliberately not the CLI's reason string: that is written for
// someone debugging a token, and it was what the user read on hover.
const DOT_LABELS: Record<OfficeHealth, string> = {
  checking: 'Checking your Microsoft 365 sign-in',
  healthy: 'Microsoft 365 is connected',
  attention: 'Part of your Microsoft 365 sign-in has expired',
  'signed-out': 'You are signed out of Microsoft 365',
};

export const dotLabel = (health: OfficeHealth): string => DOT_LABELS[health];

export const popoverViewFromStatus = (status: OfficeStatus | undefined, isChecking = false): OfficePopoverView => {
  const health = isChecking ? 'checking' : healthFromStatus(status).health;
  const unavailable = health === 'attention' ? lostFunctions(status) : [];
  return {
    health,
    headline: HEADLINES[health],
    unavailable,
    ...(health === 'attention' ? { reassurance: 'You will not need to sign in again from scratch: refreshing opens a quick browser window and closes itself.' } : {}),
    action: health === 'signed-out' ? 'sign-in' : 'refresh',
    canSignOut: health === 'healthy' || health === 'attention',
  };
};

const LOGIN_ERRORS: Record<OfficeError['kind'], string> = {
  busy: 'A sign-in window is already open. Finish it, or close it and try again.',
  'login-failed': 'The sign-in did not finish. If you closed the browser window, just try again.',
  'timed-out': 'The sign-in window stayed open too long. Try again.',
  'spawn-failed': 'Marcel could not start the sign-in. Restart the app and try again.',
};

export const loginErrorMessage = (error: OfficeError): string => LOGIN_ERRORS[error.kind];
