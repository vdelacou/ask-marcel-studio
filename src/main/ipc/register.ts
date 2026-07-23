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
import { modelForNewConversation, modelRefIsConfigured } from '../../shared/model-ref.ts';
import type { AgentRuntime } from '../services/agent/agent-runtime.ts';
import type { SkillsService } from '../services/skills/skills-service.ts';
import { parseModelTestTarget } from '../../shared/model-test.ts';
import type { ModelTestService } from '../services/models/model-test-service.ts';
import type { OfficeService } from '../services/office/office-service.ts';
import type { OfficeCatalog } from '../services/office/office-catalog-io.ts';
import type { ConversationsStore } from '../services/store/conversations-store.ts';
import type { SettingsStore } from '../services/store/settings-store.ts';
import type { AgentsStore } from '../services/store/agents-store.ts';
import type { AgentFilesStore } from '../services/store/agent-files-store.ts';
import type { MemoryService } from '../services/memory/memory-service.ts';
import type { AgentFileError } from '../../shared/agent-files.ts';
import type { Result } from '../../shared/result.ts';
import { err } from '../../shared/result.ts';

export type IpcDeps = {
  readonly settings: SettingsStore;
  readonly conversations: ConversationsStore;
  readonly agent: AgentRuntime;
  readonly skills: SkillsService;
  readonly modelTest: ModelTestService;
  readonly office: OfficeService;
  readonly officeCatalog: OfficeCatalog;
  readonly agentsStore: AgentsStore;
  readonly agentFiles: AgentFilesStore;
  readonly memory: MemoryService;
  // Filled by the background runner once it exists; until then it says so honestly and
  // the panel disables the button.
  readonly regenerateAgentFile: (doc: unknown) => Promise<Result<string, AgentFileError>>;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export const registerIpc = (deps: IpcDeps): void => {
  ipcMain.handle(CHANNEL.settingsGet, () => deps.settings.get());
  ipcMain.handle(CHANNEL.settingsSave, (_event, candidate: unknown) => deps.settings.save(candidate));

  ipcMain.handle(CHANNEL.conversationsList, () => deps.conversations.list());
  // The model is resolved HERE, not sent by the renderer, because "the model last used" is
  // written by a different click (setModel) than the one that reads it. A renderer holding
  // the value from boot would open a new conversation on the model that was current when the
  // window opened, not the one just switched to.
  ipcMain.handle(CHANNEL.conversationsCreate, async (_event, input: unknown) => {
    const asked = asString((input as { model?: unknown } | undefined)?.model);
    const settings = await deps.settings.get();
    if (!settings.ok) return err(settings.error);
    // An explicit model still wins, and is checked like any other reference crossing IPC.
    if (asked.length > 0 && modelRefIsConfigured(settings.value.providers, asked)) return deps.conversations.create({ model: asked });
    const model = modelForNewConversation(settings.value.providers, settings.value.defaultModel);
    if (model === undefined) return err({ kind: 'invalid', message: 'no model is set up yet' });
    return deps.conversations.create({ model });
  });
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
    const changed = await deps.conversations.setModel({ id: asString(draft?.id), model });
    // Remembered as the model the NEXT new conversation opens on. There is no setting for
    // it: switching model here is the only way it is ever chosen. Saved after the
    // conversation itself, and its failure is deliberately not reported, because the model
    // did change: losing the memory of it is not worth failing the click the user made.
    if (changed.ok) await deps.settings.save({ ...settings.value, defaultModel: model });
    return changed;
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
  // The target is a renderer object, so it is parsed before it is used. It carries the
  // key as typed, not as saved: the useful moment to test one is before committing it.
  ipcMain.handle(CHANNEL.modelsTest, (_event, input: unknown) => deps.modelTest.test(parseModelTestTarget(input)));

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
  ipcMain.handle(CHANNEL.skillsRead, (_event, folder: unknown) => deps.skills.read(asString(folder)));
  ipcMain.handle(CHANNEL.skillsWrite, (_event, input: unknown) => {
    const draft = input as { folder?: unknown; contents?: unknown } | undefined;
    return deps.skills.write(asString(draft?.folder), asString(draft?.contents));
  });
  ipcMain.handle(CHANNEL.skillsRestore, (_event, folder: unknown) => deps.skills.restore(asString(folder)));

  // The stores validate what arrives; nothing is coerced on the way in beyond the
  // shape the handler needs to read.
  ipcMain.handle(CHANNEL.agentsList, () => deps.agentsStore.list());
  ipcMain.handle(CHANNEL.agentsSave, (_event, agent: unknown) => deps.agentsStore.save(agent));
  ipcMain.handle(CHANNEL.agentsRemove, (_event, name: unknown) => deps.agentsStore.remove(name));
  ipcMain.handle(CHANNEL.agentsRestore, (_event, name: unknown) => deps.agentsStore.restore(name));

  ipcMain.handle(CHANNEL.memoryPending, () => deps.memory.pending());
  ipcMain.handle(CHANNEL.memoryResolve, (_event, input: unknown) => deps.memory.resolve(input));
  ipcMain.handle(CHANNEL.memoryRead, (_event, name: unknown) => deps.memory.read(name));
  ipcMain.handle(CHANNEL.memoryWrite, (_event, input: unknown) => {
    const draft = input as { name?: unknown; contents?: unknown } | undefined;
    return deps.memory.write(draft?.name, draft?.contents);
  });

  ipcMain.handle(CHANNEL.agentFileGet, (_event, doc: unknown) => deps.agentFiles.get(doc));
  ipcMain.handle(CHANNEL.agentFileSave, (_event, input: unknown) => {
    const draft = input as { doc?: unknown; text?: unknown } | undefined;
    return deps.agentFiles.save(draft?.doc, draft?.text);
  });
  ipcMain.handle(CHANNEL.agentFileRegenerate, (_event, doc: unknown) => deps.regenerateAgentFile(doc));
};
