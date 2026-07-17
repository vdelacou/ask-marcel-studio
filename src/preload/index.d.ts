/*
 * The renderer sees `studio` as a global, injected by contextBridge in index.ts.
 *
 * Declared as a global const rather than a `Window` interface augmentation:
 * augmenting Window requires declaration merging, which needs the `interface`
 * keyword that hard rule 3 bans. A global const needs neither, and reads the
 * same at the call site.
 */
import type { StudioApi } from './index.ts';

declare global {
  const studio: StudioApi;
}

export {};
