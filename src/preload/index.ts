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
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { CHANNEL, CHAT_EVENT } from '../shared/ipc-contract.ts';
import type {
  ChatSendInput,
  CreateConversationInput,
  ImportDataInput,
  ImportPathsInput,
  RenameConversationInput,
  SetConversationModelInput,
  StudioApi,
  UIEvent,
} from '../shared/ipc-contract.ts';
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
    setModel: (input: SetConversationModelInput) => ipcRenderer.invoke(CHANNEL.conversationsSetModel, input),
    remove: (id: string) => ipcRenderer.invoke(CHANNEL.conversationsDelete, id),
    importPick: (id: string) => ipcRenderer.invoke(CHANNEL.conversationsImportPick, id),
    importPaths: (input: ImportPathsInput) => ipcRenderer.invoke(CHANNEL.conversationsImportPaths, input),
    importData: (input: ImportDataInput) => ipcRenderer.invoke(CHANNEL.conversationsImportData, input),
  },
  files: {
    // Electron 32 removed File.path; webUtils is the supported replacement and it only
    // works on this side of the bridge. A file with no path on disk (an attachment
    // dragged out of a mail client) resolves to '', and the renderer sends its bytes
    // instead.
    pathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  chat: {
    send: (input: ChatSendInput) => ipcRenderer.invoke(CHANNEL.chatSend, input),
    cancel: (conversationId: string) => ipcRenderer.invoke(CHANNEL.chatCancel, conversationId),
    onEvent: (listener: (event: UIEvent) => void) => {
      // Wrapped rather than passing the listener straight to ipcRenderer: the raw
      // handler receives an IpcRendererEvent first, and handing the renderer that
      // object across the bridge would leak a main-process handle.
      const wrapped = (_event: unknown, payload: UIEvent): void => listener(payload);
      ipcRenderer.on(CHAT_EVENT, wrapped);
      return () => {
        ipcRenderer.removeListener(CHAT_EVENT, wrapped);
      };
    },
  },
  skills: {
    list: () => ipcRenderer.invoke(CHANNEL.skillsList),
    add: () => ipcRenderer.invoke(CHANNEL.skillsAdd),
    remove: (name: string) => ipcRenderer.invoke(CHANNEL.skillsRemove, name),
    read: (folder: string) => ipcRenderer.invoke(CHANNEL.skillsRead, folder),
    write: (input) => ipcRenderer.invoke(CHANNEL.skillsWrite, input),
    restore: (folder: string) => ipcRenderer.invoke(CHANNEL.skillsRestore, folder),
  },
  agents: {
    list: () => ipcRenderer.invoke(CHANNEL.agentsList),
    save: (agent) => ipcRenderer.invoke(CHANNEL.agentsSave, agent),
    remove: (name: string) => ipcRenderer.invoke(CHANNEL.agentsRemove, name),
    restore: (name: string) => ipcRenderer.invoke(CHANNEL.agentsRestore, name),
  },
  agentFiles: {
    get: (doc) => ipcRenderer.invoke(CHANNEL.agentFileGet, doc),
    save: (input) => ipcRenderer.invoke(CHANNEL.agentFileSave, input),
    regenerate: (doc) => ipcRenderer.invoke(CHANNEL.agentFileRegenerate, doc),
  },
  office: {
    status: () => ipcRenderer.invoke(CHANNEL.officeStatus),
    login: (options) => ipcRenderer.invoke(CHANNEL.officeLogin, options),
    commands: () => ipcRenderer.invoke(CHANNEL.officeCommands),
  },
};

contextBridge.exposeInMainWorld('studio', api);
