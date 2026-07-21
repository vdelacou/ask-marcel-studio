/*
 * When it is polite to ask.
 *
 * The app notices things worth remembering while the user works, and asking about them
 * mid-sentence would make it an interruption rather than a helper. So the question
 * waits for a moment when nothing is happening: no turn running anywhere, nothing
 * half-typed, no settings screen open.
 *
 * Pure: no react, no electron, so `bun test` runs it.
 */
export type MemoryGateInput = {
  readonly pendingCount: number;
  // How many conversations are answering right now, anywhere in the app.
  readonly streamingCount: number;
  readonly composerEmpty: boolean;
  readonly settingsOpen: boolean;
  readonly dialogOpen: boolean;
  // Set once the user has waved the question away; it comes back when something new
  // turns up.
  readonly snoozed: boolean;
};

export const shouldOpenMemoryDialog = (input: MemoryGateInput): boolean => {
  if (input.pendingCount === 0) return false;
  if (input.dialogOpen || input.snoozed) return false;
  if (input.streamingCount > 0) return false;
  if (!input.composerEmpty) return false;
  return !input.settingsOpen;
};
