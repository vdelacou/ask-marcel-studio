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
import type { OfficeStatus, TokenTier } from '../../../shared/office-status.ts';

export type OfficeHealth = 'checking' | 'healthy' | 'attention' | 'signed-out';

export type OfficeHealthView = {
  readonly health: OfficeHealth;
  readonly message: string;
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
