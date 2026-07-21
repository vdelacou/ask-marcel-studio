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
import { modelRefIsConfigured } from '../../shared/model-ref.ts';
import type { AgentRuntime } from '../services/agent/agent-runtime.ts';
import type { SkillsService } from '../services/skills/skills-service.ts';
import type { OfficeService } from '../services/office/office-service.ts';
import type { OfficeCatalog } from '../services/office/office-catalog-io.ts';
import type { ConversationsStore } from '../services/store/conversations-store.ts';
import type { SettingsStore } from '../services/store/settings-store.ts';
import { err } from '../../shared/result.ts';

export type IpcDeps = {
  readonly settings: SettingsStore;
  readonly conversations: ConversationsStore;
  readonly agent: AgentRuntime;
  readonly skills: SkillsService;
  readonly office: OfficeService;
  readonly officeCatalog: OfficeCatalog;
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
  // The reference is checked against what is actually configured here, where settings
  // are readable: a conversation pinned to a model the user has since removed would
  // fail deep inside the runtime on its next turn instead of at the click that caused it.
  ipcMain.handle(CHANNEL.conversationsSetModel, async (_event, input: unknown) => {
    const draft = input as { id?: unknown; model?: unknown } | undefined;
    const model = asString(draft?.model);
    const settings = await deps.settings.get();
    if (!settings.ok) return err(settings.error);
    if (!modelRefIsConfigured(settings.value.providers, model)) return err({ kind: 'invalid', message: 'that model is not set up any more' });
    return deps.conversations.setModel({ id: asString(draft?.id), model });
  });
  ipcMain.handle(CHANNEL.conversationsDelete, (_event, id: unknown) => deps.conversations.remove(asString(id)));

  // The picker opens HERE, like the skills one: a path chosen renderer-side would be
  // an untrusted string reaching the filesystem.
  ipcMain.handle(CHANNEL.conversationsImportPick, async (_event, id: unknown) => {
    const picked = await dialog.showOpenDialog({ title: 'Choose files to attach', properties: ['openFile', 'multiSelections'], buttonLabel: 'Attach' });
    if (picked.canceled || picked.filePaths.length === 0) return err({ kind: 'cancelled', message: 'no file chosen' });
    return deps.conversations.importPaths({ id: asString(id), paths: picked.filePaths });
  });
  ipcMain.handle(CHANNEL.conversationsImportPaths, (_event, input: unknown) => {
    const draft = input as { id?: unknown; paths?: unknown } | undefined;
    const paths = Array.isArray(draft?.paths) ? draft.paths.filter((p): p is string => typeof p === 'string') : [];
    return deps.conversations.importPaths({ id: asString(draft?.id), paths });
  });
  ipcMain.handle(CHANNEL.conversationsImportData, (_event, input: unknown) => {
    const draft = input as { id?: unknown; name?: unknown; bytes?: unknown } | undefined;
    const bytes = draft?.bytes;
    if (!(bytes instanceof ArrayBuffer)) return Promise.resolve(err({ kind: 'invalid', message: 'that file could not be read' }));
    return deps.conversations.importBytes({ id: asString(draft?.id), name: asString(draft?.name), bytes: new Uint8Array(bytes) });
  });

  ipcMain.handle(CHANNEL.chatSend, (_event, input: unknown) => {
    const draft = input as { conversationId?: unknown; text?: unknown } | undefined;
    return deps.agent.send({ conversationId: asString(draft?.conversationId), text: asString(draft?.text) });
  });
  ipcMain.handle(CHANNEL.chatCancel, (_event, conversationId: unknown) => deps.agent.cancel(asString(conversationId)));

  // Status and login take no argument: the CLI reads the one cached token, and login
  // is a single-flight action with no parameters.
  ipcMain.handle(CHANNEL.officeStatus, () => deps.office.status());
  // Only a literal true forces a full re-capture; anything else crossing IPC is an
  // ordinary sign-in.
  ipcMain.handle(CHANNEL.officeLogin, (_event, input: unknown) => deps.office.login((input as { force?: unknown } | undefined)?.force === true));
  ipcMain.handle(CHANNEL.officeCommands, () => Promise.resolve(deps.officeCatalog.categories()));

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
