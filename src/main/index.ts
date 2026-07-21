/*
 * Electron main entry and composition root.
 *
 * Every state-source (userData, the clock, the inherited environment) is read once,
 * here, and injected downward as a parameter. Nothing below reaches for app.getPath
 * or process.env itself, which is what keeps the services testable
 * (references/architecture.md).
 *
 * The single top-level catch lives here (rule 17): everything below returns Result.
 */
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { BrowserWindow, app, shell } from 'electron';
import { CHAT_EVENT, MEMORY_EVENT } from '../shared/ipc-contract.ts';
import { registerIpc } from './ipc/register.ts';
import { createAgentRuntime } from './services/agent/agent-runtime.ts';
import { readAgentCore, readBundledText } from './services/agent/agent-core-io.ts';
import { createConversationsStore } from './services/store/conversations-store.ts';
import { createSettingsStore } from './services/store/settings-store.ts';
import { createSkillsService } from './services/skills/skills-service.ts';
import { createAgentsStore } from './services/store/agents-store.ts';
import { createAgentFilesStore } from './services/store/agent-files-store.ts';
import { createBackgroundRunner } from './services/background/background-runner.ts';
import { createMemoryService } from './services/memory/memory-service.ts';
import { createMemoryExtractor } from './services/memory/memory-extractor.ts';
import { createIdleWatcher } from './services/memory/idle-watcher.ts';
import { createBackgroundJobs } from './services/background/background-jobs.ts';
import { createRunAgentText } from './services/background/background-agent-io.ts';
import { createVoiceProfileJob } from './services/background/voice-profile-job.ts';
import { createSignatureService } from './services/office/signature-service.ts';
import { parseAgentFileDoc } from '../shared/agent-files.ts';
import { createModelTestService } from './services/models/model-test-service.ts';
import { backgroundWorkspaceDir, signatureFilePath, voiceProfileFilePath } from '../shared/paths.ts';
import { BUILTIN_AGENTS } from './services/agent/builtin-agents.ts';
import { EMPTY_AGENTS_DOC, mergeAgents, toSdkAgents } from '../shared/agents-doc.ts';
import { err, ok } from '../shared/result.ts';
import { createGateway } from './services/gateway/gateway-server.ts';
import { createOfficeService } from './services/office/office-service.ts';
import { createOfficeRun, writeOfficeShim } from './services/office/office-io.ts';
import { createOfficeCatalog } from './services/office/office-catalog-io.ts';
import { writeToolShims } from './services/shims/tool-shims-io.ts';
import { createPythonService } from './services/python/python-service.ts';
import { createPythonIo } from './services/python/python-io.ts';
import { platformOf, pythonVenvDir, runtimePythonPath, venvPythonPath } from '../shared/python-paths.ts';
import type { OfficeCliLocation } from './services/office/office-io.ts';
import type { ToolCliLocation } from './services/shims/tool-shims-io.ts';
import type { AgentRuntime } from './services/agent/agent-runtime.ts';
import type { SkillsService } from './services/skills/skills-service.ts';
import type { Gateway } from './services/gateway/gateway-server.ts';
import type { BackgroundRunner } from './services/background/background-runner.ts';
import type { MemoryEvent, UIEvent } from '../shared/ipc-contract.ts';
import type { IdleWatcher } from './services/memory/idle-watcher.ts';
import type { MemoryService } from './services/memory/memory-service.ts';
import type { ConversationsStore } from './services/store/conversations-store.ts';

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // .mjs, not .js: this package is "type": "module" (hard rule 9), so
      // electron-vite emits the preload as index.mjs. The upstream scaffold says
      // index.js only because it is a CJS package. Loading ESM in a preload
      // requires sandbox: false, which is why that stays off.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // Renderer must never reach Node or electron directly: everything crosses
      // the contextBridge in src/preload. This is the trust boundary.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show only once painted, so the window never flashes an empty frame.
  window.on('ready-to-show', () => window.show());

  // Anything that is not the app itself opens in the real browser, never in
  // an Electron window we would then have to secure.
  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (is.dev && devUrl !== undefined) {
    void window.loadURL(devUrl);
    return window;
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'));
  return window;
};

// Bundled skills ship in resources/. In dev that is the repo folder; packaged, it is
// inside the app bundle. app.isPackaged is the only thing that knows which.
const builtinSkillsSource = (): string => (app.isPackaged ? join(process.resourcesPath, 'builtin-skills') : join(__dirname, '../../resources/builtin-skills'));

// The always-on Microsoft 365 core, appended to the agent's system prompt every turn.
// Same dev/packaged split as the skills; the read (and its try/catch) lives in
// agent-core-io. Read once at launch.
const agentCoreSource = (): string => (app.isPackaged ? join(process.resourcesPath, 'agent-core', 'core.md') : join(__dirname, '../../resources/agent-core/core.md'));

// The prompts for work the app does on its own. Same dev/packaged split.
const backgroundPromptSource = (name: string): string => (app.isPackaged ? join(process.resourcesPath, 'background', name) : join(__dirname, '../../resources/background', name));

// The two on-demand M365 skills the app now ships, carved by trigger (read vs draft).
const BUILTIN_SKILLS = ['answer-from-m365', 'draft-outlook-email'];

// The single skill the app used to ship. Its folder is deleted from userData on launch,
// so an install that predates the rename does not keep loading the old monolith. Its
// knowledge now lives in the core (routing/doctrine) and the two skills above.
const RETIRED_BUILTIN_SKILLS = ['ask-marcel-office'];

// Resolve the office CLI's cli.js through Node's own resolution, so it works in dev
// (repo node_modules) and packaged alike. It is launched as `execPath cliPath ...` with
// ELECTRON_RUN_AS_NODE, i.e. the app's Electron binary run as Node, so a machine with
// no Node still works.
const officeCliLocation = (): OfficeCliLocation => {
  const resolveFrom = createRequire(__filename);
  return { execPath: process.execPath, cliPath: join(dirname(resolveFrom.resolve('ask-marcel-office-cli/package.json')), 'dist', 'cli.js') };
};

// The CLI's own description of every command it has, shipped beside its cli.js. Read
// once so settings can list the categories and the shell guard can place a command in
// one.
const officeCatalogPath = (): string => {
  const resolveFrom = createRequire(__filename);
  return join(dirname(resolveFrom.resolve('ask-marcel-office-cli/package.json')), 'dist', 'commands.json');
};

// The bundled npm package's bin scripts, resolved the same way as the office CLI so it
// works in dev and packaged alike. node is the app binary itself (run as Node), so it
// needs no path. This gives the agent node/npm/npx with no Node on the machine (M8).
const toolCliLocation = (): ToolCliLocation => {
  const resolveFrom = createRequire(__filename);
  const npmDir = dirname(resolveFrom.resolve('npm/package.json'));
  return { execPath: process.execPath, npmCliPath: join(npmDir, 'bin', 'npm-cli.js'), npxCliPath: join(npmDir, 'bin', 'npx-cli.js') };
};

// How long a conversation has to be quiet before the app reads it for words worth
// remembering. Long enough that a pause mid-thought does not trigger it.
const IDLE_MS = 300_000;

// How far back the app looks at launch for conversations it never got to read.
const CATCH_UP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// The embedded Python runtime (M8 Phase B). The build string is the runtime pin from
// scripts/fetch-python.ts; a change forces the venv to be rebuilt.
//
// Nothing is seeded any more. Naming preinstalled libraries only confused the people this
// app is for; the agent pip-installs whatever a task needs, and an empty seed list skips
// the offline wheel install entirely.
const PYTHON_BUILD = '3.13.14+20260718';
const PYTHON_SEED: readonly string[] = [];

// dev on darwin resolves the vendored triple; any other host falls through to a name with
// no vendor dir, so provisioning just fails to launch rather than crashing the app.
const hostPythonTriple = (): string => {
  if (process.platform !== 'darwin') return 'x86_64-pc-windows-msvc';
  return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
};

// Packaged, the runtime and wheels ship as extraResources; in dev they are the fetched
// vendor/ folders (bun run fetch:python && bun run fetch:wheels). Provisioning is kicked
// off here and runs in the background; nothing reports it, because the app no longer
// shows a runtime section.
const startPython = (userData: string): void => {
  const runtimeDir = app.isPackaged ? join(process.resourcesPath, 'python-runtime') : join(__dirname, '../../vendor/python', hostPythonTriple());
  const wheelsDir = app.isPackaged ? join(process.resourcesPath, 'python-wheels') : join(__dirname, '../../vendor/wheels');
  const platform = platformOf(process.platform);
  const venvDir = pythonVenvDir(userData);
  const python = createPythonService(createPythonIo(userData, process.env), {
    runtimePython: runtimePythonPath(runtimeDir, platform),
    venvPython: venvPythonPath(venvDir, platform),
    venvDir,
    wheelsDir,
    seedPackages: PYTHON_SEED,
    build: PYTHON_BUILD,
  });
  // Not awaited: the venv builds in the background and is a no-op once the marker matches.
  // A python3 call before it finishes simply fails, like the office CLI before sign-in.
  void python.provision();
};

// Whether a file exists and has something in it. Used to decide whether a prefill has
// anything to do; an unreadable file counts as absent, which means it is tried again.
const hasContent = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

const buildRuntime = (
  emit: (event: UIEvent) => void,
  emitMemory: (event: MemoryEvent) => void
): { agent: AgentRuntime; skills: SkillsService; gateway: Gateway; background: BackgroundRunner; idle: IdleWatcher; memory: MemoryService; conversations: ConversationsStore } => {
  const userData = app.getPath('userData');
  const now = (): string => new Date().toISOString();
  const settings = createSettingsStore({ userData });
  const conversations = createConversationsStore({ userData, now });
  const skills = createSkillsService({ userData, builtinSource: builtinSkillsSource(), builtinNames: BUILTIN_SKILLS, retiredBuiltinNames: RETIRED_BUILTIN_SKILLS });
  // Providers are read per request, not captured: a key changed in settings must take
  // effect on the next turn without restarting the gateway.
  const gateway = createGateway({
    findProvider: async (providerId) => {
      const current = await settings.get();
      return current.ok ? current.value.providers.find((p) => p.id === providerId) : undefined;
    },
  });
  const officeCatalog = createOfficeCatalog(officeCatalogPath());
  const agentsStore = createAgentsStore({ userData, builtins: BUILTIN_AGENTS });
  const agentFiles = createAgentFilesStore({ userData });
  const memory = createMemoryService({ userData, now, newId: () => crypto.randomUUID(), emit: emitMemory });
  const agent = createAgentRuntime({
    settings,
    glossary: () => memory.glossaryBlock(),
    conversations,
    gateway,
    officeCommandCategories: officeCatalog.commandCategories(),
    userData,
    now,
    emit,
    inheritedEnv: process.env,
    corePrompt: readAgentCore(agentCoreSource()),
    // Read per send, not captured: a skill added in settings applies from the next
    // message. A listing failure is an empty list, which only means `/name` is not
    // recognised that turn, never that the turn fails.
    listSkillFolders: async () => {
      const listed = await skills.list();
      return listed.ok ? listed.value.map((skill) => skill.folder) : [];
    },
    // Read per send too: a helper edited in settings applies from the next message. A
    // read failure falls back to the built-ins rather than failing the turn.
    listAgents: async () => {
      const listed = await agentsStore.list();
      return toSdkAgents(listed.ok ? listed.value : mergeAgents(BUILTIN_AGENTS, EMPTY_AGENTS_DOC));
    },
  });

  const location = officeCliLocation();
  const officeRun = createOfficeRun(location, process.env);
  const office = createOfficeService(officeRun);
  // Rewritten every launch: process.execPath and the cli.js path both move across
  // updates, so a stale shim would exec a binary that is gone. Not awaited, like the
  // skills seed: it lands long before the first turn could call ask-marcel-office.
  void writeOfficeShim(userData, location);
  // Same reasoning for node/npm/npx: rewritten every launch, lands well before a turn.
  void writeToolShims(userData, toolCliLocation());
  // Build the per-user Python venv in the background so python3 resolves offline.
  startPython(userData);

  // Work the app does for the user without being asked: their signature, and how they
  // write. One at a time, never while the app is closing.
  const background = createBackgroundRunner({
    runJob: (job, signal) => jobs.run(job, signal),
    onStatus: () => undefined,
  });
  const jobs = createBackgroundJobs({
    settings,
    gateway,
    userData,
    workspaceDir: backgroundWorkspaceDir(userData),
    inheritedEnv: process.env,
    officeCommandCategories: officeCatalog.commandCategories(),
    signature: createSignatureService({
      run: officeRun,
      signaturePath: signatureFilePath(userData),
      hasSignature: () => hasContent(signatureFilePath(userData)),
      wroteSomething: () => hasContent(signatureFilePath(userData)),
    }),
    memoryExtractor: createMemoryExtractor({
      conversations,
      memory,
      runAgentText: createRunAgentText(),
      prompt: readBundledText(backgroundPromptSource('memory-extract-prompt.md')),
      session: () => jobs.session(),
    }),
    voice: createVoiceProfileJob({
      runAgentText: createRunAgentText(),
      prompt: readBundledText(backgroundPromptSource('voice-profile-prompt.md')),
      hasProfile: () => hasContent(voiceProfileFilePath(userData)),
      write: async (markdown) => {
        const saved = await agentFiles.save('voice-profile', markdown);
        return saved.ok ? ok(null) : err(saved.error.message);
      },
      session: () => jobs.session(),
    }),
  });

  registerIpc({
    settings,
    // The real fetch, with the deadline the service puts on every call.
    modelTest: createModelTestService({ fetch: (url, init) => fetch(url, init) }),
    conversations,
    agent,
    skills,
    office,
    officeCatalog,
    agentsStore,
    agentFiles,
    memory,
    // Rebuilding a document is the same job the app runs on its own, asked for
    // explicitly. It resolves with the new contents so the panel shows them at once.
    regenerateAgentFile: async (doc) => {
      const checked = parseAgentFileDoc(doc);
      if (!checked.ok) return checked;
      const done = await background.enqueue(checked.value === 'signature' ? { kind: 'signature-prefill', force: true } : { kind: 'voice-profile', force: true });
      if (!done.ok) return err({ kind: done.error.kind === 'skipped' ? 'unavailable' : 'write-failed', message: done.error.message });
      return agentFiles.get(checked.value);
    },
  });
  // Reading a conversation costs the user tokens, so it happens once, a few minutes
  // after the last thing was said, rather than after every turn.
  const idle = createIdleWatcher({
    idleMs: IDLE_MS,
    onIdle: (conversationId) => void background.enqueue({ kind: 'memory-extract', conversationId }),
    setTimer: (fire, ms) => setTimeout(fire, ms),
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  });

  return { agent, skills, gateway, background, idle, memory, conversations };
};

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.askmarcel.studio');
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window));

  const window = createWindow();
  // Events go to the window that exists now. There is one window in v1 (multi-window
  // is a stated non-goal), so a lookup per event would be ceremony.
  const {
    agent: runtime,
    skills,
    gateway,
    background: runtimeBackground,
    idle,
    memory,
    conversations,
  } = buildRuntime(
    (event) => {
      // The idle watcher sees the same stream the renderer does: a turn ending is
      // exactly when a conversation might have gone quiet.
      idle.onUiEvent(event);
      if (!window.isDestroyed()) window.webContents.send(CHAT_EVENT, event);
    },
    (event) => {
      if (!window.isDestroyed()) window.webContents.send(MEMORY_EVENT, event);
    }
  );

  // Re-seeded every launch so an app update ships an updated skill, and a folder the
  // user deleted by hand comes back. Not awaited: a skill lands before the first
  // message can possibly be sent, and blocking startup on a copy would be worse.
  void skills.seedBuiltins();

  // Not awaited, and nothing surfaces: the signature is a cheap CLI fetch and the voice
  // profile costs a few tokens once. Both skip themselves when there is nothing to do.
  void runtimeBackground.enqueue({ kind: 'signature-prefill' });
  void runtimeBackground.enqueue({ kind: 'voice-profile' });

  // Conversations that went quiet while the app was closed. Recent ones only: reading
  // a year of history at launch would spend money nobody asked to spend.
  void (async (): Promise<void> => {
    const listed = await conversations.list();
    if (!listed.ok) return;
    const cutoff = new Date(Date.now() - CATCH_UP_WINDOW_MS).toISOString();
    for (const meta of listed.value.filter((candidate) => candidate.updatedAt >= cutoff)) {
      const conversation = await conversations.get(meta.id);
      if (!conversation.ok) continue;
      if (await memory.extractionDue(meta.id, conversation.value.messages.length)) void runtimeBackground.enqueue({ kind: 'memory-extract', conversationId: meta.id });
    }
  })();

  // A turn left running would keep an orphaned agent subprocess alive after quit, and
  // the gateway would keep a socket listening.
  app.on('before-quit', () => {
    runtime.cancelAll();
    idle.stop();
    runtimeBackground.stop();
    void gateway.stop();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
