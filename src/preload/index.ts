/*
 * The renderer's only door to the main process (contextIsolation is on).
 *
 * This is a transport, not a place for logic: each member forwards to its channel
 * and returns whatever Result main sent back. Anything smarter belongs in a store
 * on the main side, where it can be tested.
 *
 * The api shape is declared by StudioApi in the shared ipc-contract, so main and
 * renderer cannot drift apart without a typecheck failure.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL } from '../shared/ipc-contract.ts';
import type { CreateConversationInput, RenameConversationInput, StudioApi } from '../shared/ipc-contract.ts';
import type { Settings } from '../shared/types.ts';

const api: StudioApi = {
  settings: {
    get: () => ipcRenderer.invoke(CHANNEL.settingsGet),
    save: (settings: Settings) => ipcRenderer.invoke(CHANNEL.settingsSave, settings),
  },
  conversations: {
    list: () => ipcRenderer.invoke(CHANNEL.conversationsList),
    create: (input: CreateConversationInput) => ipcRenderer.invoke(CHANNEL.conversationsCreate, input),
    get: (id: string) => ipcRenderer.invoke(CHANNEL.conversationsGet, id),
    rename: (input: RenameConversationInput) => ipcRenderer.invoke(CHANNEL.conversationsRename, input),
    remove: (id: string) => ipcRenderer.invoke(CHANNEL.conversationsDelete, id),
  },
};

contextBridge.exposeInMainWorld('studio', api);
