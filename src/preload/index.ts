/*
 * The renderer's only door to the main process (contextIsolation is on).
 *
 * M0 exposes just the app version, enough to prove the bridge works end to end.
 * The typed IPC surface (conversations, chat, settings, skills, office) lands in M1/M2.
 */
import { contextBridge } from 'electron';

const api = {
  version: process.versions.electron,
} as const;

export type StudioApi = typeof api;

contextBridge.exposeInMainWorld('studio', api);
