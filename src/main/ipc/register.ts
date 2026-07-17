/*
 * Wires the stores to IPC channels. The composition seam between main and renderer.
 *
 * Every handler returns a Result rather than throwing. A thrown error inside an
 * ipcMain.handle callback is serialised to the renderer as an opaque Error with the
 * main-process stack glued onto the message, which is both a leak and unusable for
 * showing the user anything true (rule 16).
 *
 * Nothing arriving here is trusted: it crossed a process boundary as JSON, so every
 * id is re-branded and every document re-validated by the store it reaches.
 */
import { ipcMain } from 'electron';
import { CHANNEL } from '../../shared/ipc-contract.ts';
import type { ConversationsStore } from '../services/store/conversations-store.ts';
import type { SettingsStore } from '../services/store/settings-store.ts';

export type IpcDeps = {
  readonly settings: SettingsStore;
  readonly conversations: ConversationsStore;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export const registerIpc = (deps: IpcDeps): void => {
  ipcMain.handle(CHANNEL.settingsGet, () => deps.settings.get());
  ipcMain.handle(CHANNEL.settingsSave, (_event, candidate: unknown) => deps.settings.save(candidate));

  ipcMain.handle(CHANNEL.conversationsList, () => deps.conversations.list());
  ipcMain.handle(CHANNEL.conversationsCreate, (_event, input: unknown) => deps.conversations.create({ model: asString((input as { model?: unknown } | undefined)?.model) }));
  ipcMain.handle(CHANNEL.conversationsGet, (_event, id: unknown) => deps.conversations.get(asString(id)));
  ipcMain.handle(CHANNEL.conversationsRename, (_event, input: unknown) => {
    const draft = input as { id?: unknown; title?: unknown } | undefined;
    return deps.conversations.rename({ id: asString(draft?.id), title: asString(draft?.title) });
  });
  ipcMain.handle(CHANNEL.conversationsDelete, (_event, id: unknown) => deps.conversations.remove(asString(id)));
};
