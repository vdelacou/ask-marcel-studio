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
import { dialog, ipcMain } from 'electron';
import { CHANNEL } from '../../shared/ipc-contract.ts';
import type { AgentRuntime } from '../services/agent/agent-runtime.ts';
import type { SkillsService } from '../services/skills/skills-service.ts';
import type { OfficeService } from '../services/office/office-service.ts';
import type { PythonService } from '../services/python/python-service.ts';
import type { ConversationsStore } from '../services/store/conversations-store.ts';
import type { SettingsStore } from '../services/store/settings-store.ts';
import { err } from '../../shared/result.ts';

export type IpcDeps = {
  readonly settings: SettingsStore;
  readonly conversations: ConversationsStore;
  readonly agent: AgentRuntime;
  readonly skills: SkillsService;
  readonly office: OfficeService;
  readonly python: PythonService;
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

  ipcMain.handle(CHANNEL.chatSend, (_event, input: unknown) => {
    const draft = input as { conversationId?: unknown; text?: unknown } | undefined;
    return deps.agent.send({ conversationId: asString(draft?.conversationId), text: asString(draft?.text) });
  });
  ipcMain.handle(CHANNEL.chatCancel, (_event, conversationId: unknown) => deps.agent.cancel(asString(conversationId)));

  // Status and login take no argument: the CLI reads the one cached token, and login
  // is a single-flight action with no parameters.
  ipcMain.handle(CHANNEL.officeStatus, () => deps.office.status());
  ipcMain.handle(CHANNEL.officeLogin, () => deps.office.login());

  // No argument and no Result: the status is a total type read from the venv marker.
  ipcMain.handle(CHANNEL.pythonStatus, () => deps.python.status());

  ipcMain.handle(CHANNEL.skillsList, () => deps.skills.list());
  ipcMain.handle(CHANNEL.skillsRemove, (_event, name: unknown) => deps.skills.remove(asString(name)));
  // The picker opens HERE, in main, and the renderer never names a path. A path
  // chosen renderer-side would be an untrusted string reaching the filesystem.
  ipcMain.handle(CHANNEL.skillsAdd, async () => {
    const picked = await dialog.showOpenDialog({ title: 'Choose a skill folder', properties: ['openDirectory'], buttonLabel: 'Add skill' });
    const dir = picked.filePaths[0];
    if (picked.canceled || dir === undefined) return err({ kind: 'cancelled', message: 'no folder chosen' });
    return deps.skills.add(dir);
  });
};
