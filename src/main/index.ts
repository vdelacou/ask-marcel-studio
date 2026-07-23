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
import { createSqliteMemoryStore } from './services/memory/sqlite-memory-store.ts';
import type { Embedder } from './services/memory/sqlite-memory-store.ts';
import { createEmbedder } from './services/memory/embedder-io.ts';
import type { MemoryStore } from '../shared/memory-store.ts';
import { createMemoryExtractor } from './services/memory/memory-extractor.ts';
import { createIdleWatcher } from './services/memory/idle-watcher.ts';
import { createBackgroundJobs } from './services/background/background-jobs.ts';
import { createRunAgentText } from './services/background/background-agent-io.ts';
import { createVoiceProfileJob } from './services/background/voice-profile-job.ts';
import { createTitleJob } from './services/background/title-job.ts';
import { createSignatureService } from './services/office/signature-service.ts';
import { parseAgentFileDoc } from '../shared/agent-files.ts';
import { createModelTestService } from './services/models/model-test-service.ts';
import { accountDir, backgroundWorkspaceDir, memoryDbPath, quickContextFilePath, signatureFilePath, voiceProfileFilePath } from '../shared/paths.ts';
import { parseStoredQuickContext } from '../shared/quick-context.ts';
import { readJsonFile, writeJsonFileAtomic } from './services/store/json-file.ts';
import { BUILTIN_AGENTS } from './services/agent/builtin-agents.ts';
import { EMPTY_AGENTS_DOC, mergeAgents, toSdkAgents } from '../shared/agents-doc.ts';
import { err, ok } from '../shared/result.ts';
import { createGateway } from './services/gateway/gateway-server.ts';
import { createOfficeService } from './services/office/office-service.ts';
import { createQuickContextService } from './services/office/quick-context-service.ts';
import { createAccountService } from './services/account/account-service.ts';
import type { AccountService } from './services/account/account-service.ts';
import { createAccountFs } from './services/account/account-io.ts';
import type { QuickContextService, StoredQuickContext } from './services/office/quick-context-service.ts';
import { createOfficeRun, writeCliCheatsheet, writeOfficeShim } from './services/office/office-io.ts';
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

// The always-on line that tells the agent it has a searchable memory. Kept short: it is
// appended to every system prompt, and its whole job is to make the agent reach for
// memory_search before claiming ignorance, and to add or forget only on request.
const MEMORY_PREAMBLE = [
  '## Your memory',
  '',
  "You have a searchable memory of this user's world: terms their organisation uses, who",
  'people are, their preferences. Before you say you do not know a term, a person, or a',
  'preference, call memory_search. Add something (memory_add) or forget something',
  '(memory_forget) ONLY when the user asks you to; never on your own initiative. Everything',
  'you remember shows on their Memory page, where they can edit or remove it.',
].join('\n');

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
  emitMemory: (event: MemoryEvent) => void,
  accounts: AccountService
): {
  agent: AgentRuntime;
  skills: SkillsService;
  gateway: Gateway;
  background: BackgroundRunner;
  idle: IdleWatcher;
  memory: MemoryService;
  conversations: ConversationsStore;
  quickContext: QuickContextService;
} => {
  const toolsRoot = app.getPath('userData');
  // Everything the app learns from Microsoft 365 is read and written under the signed-in
  // account's own folder. Handing the stores this instead of the top folder is the whole
  // of the separation: none of them had to learn what an account is.
  const userData = accountDir(toolsRoot, accounts.current().key);
  const now = (): string => new Date().toISOString();
  // Providers and their keys, and the helpers, stay shared: they are the person at the
  // keyboard's tooling, not the mailbox's data.
  const settings = createSettingsStore({ userData: toolsRoot });
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
  const agentsStore = createAgentsStore({ userData: toolsRoot, builtins: BUILTIN_AGENTS });
  const agentFiles = createAgentFilesStore({ userData });
  const memory = createMemoryService({ userData, now, newId: () => crypto.randomUUID(), emit: emitMemory });

  // The searchable memory: a native sqlite store behind the port when an embedding
  // provider is configured, and a not-set-up store otherwise. The embedder reads its
  // provider from settings per call, so changing it in settings applies without a restart.
  const memoryStore = ((): MemoryStore => {
    const embed: Embedder = async (text) => {
      const current = await settings.get();
      const config = current.ok ? current.value.memory : undefined;
      if (config === undefined) return err('memory is not set up');
      const provider = current.ok ? current.value.providers.find((candidate) => candidate.id === config.providerId) : undefined;
      if (provider === undefined || provider.kind !== 'openai') return err('the memory provider is not configured');
      const one = createEmbedder((url, init) => fetch(url, init), { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: config.embeddingModelId });
      return one(text);
    };
    return createSqliteMemoryStore({ dbPath: memoryDbPath(userData), embed, now, newId: () => crypto.randomUUID() });
  })();

  const location = officeCliLocation();
  const officeRun = createOfficeRun(location, process.env);
  const office = createOfficeService(officeRun);
  // Built before the agent, which reads its block on every send.
  const quickContext = createQuickContextService({
    run: officeRun,
    now: () => new Date(),
    read: async () => {
      const read = await readJsonFile(quickContextFilePath(userData));
      return read.ok ? parseStoredQuickContext(read.value) : undefined;
    },
    write: async (stored: StoredQuickContext) => {
      await writeJsonFileAtomic(quickContextFilePath(userData), JSON.stringify(stored, null, 2));
    },
  });

  const agent = createAgentRuntime({
    settings,
    // Who the user is, read per send so a sign-in mid-session reaches the next turn.
    quickContextBlock: () => quickContext.block(),
    memoryStore,
    memoryPreamble: MEMORY_PREAMBLE,
    // What the user wrote about themselves, read per send from the global-context file.
    aboutYou: async () => {
      const read = await agentFiles.get('global-context');
      return read.ok ? read.value : '';
    },
    glossary: () => memory.glossaryBlocks(),
    conversations,
    gateway,
    officeCommandCategories: officeCatalog.commandCategories(),
    userData,
    toolsRoot,
    now,
    emit,
    // A conversation earns its name once it has had an exchange worth naming.
    onFirstTurnSaved: (conversationId) => void background.enqueue({ kind: 'conversation-title', conversationId }),
    inheritedEnv: process.env,
    corePrompt: readAgentCore(agentCoreSource()),
    // Read per send, not captured: a skill added in settings applies from the next
    // message. A listing failure is an empty list, which only means `/name` is not
    // recognised that turn, never that the turn fails.
    // A skill the user switched off is kept out of BOTH what the agent may load and the
    // "/" suggestions, because this same list feeds slash recognition. The disabled set
    // is read per send so a toggle in settings applies from the next message.
    listSkillFolders: async () => {
      const listed = await skills.list();
      if (!listed.ok) return [];
      const current = await settings.get();
      const disabled = new Set(current.ok ? (current.value.skillsPolicy?.disabledFolders ?? []) : []);
      return listed.value.map((skill) => skill.folder).filter((folder) => !disabled.has(folder));
    },
    // Read per send too: a helper edited in settings applies from the next message. A
    // read failure falls back to the built-ins rather than failing the turn.
    listAgents: async () => {
      const listed = await agentsStore.list();
      return toSdkAgents(listed.ok ? listed.value : mergeAgents(BUILTIN_AGENTS, EMPTY_AGENTS_DOC));
    },
  });

  // Rewritten every launch: process.execPath and the cli.js path both move across
  // updates, so a stale shim would exec a binary that is gone. Not awaited, like the
  // skills seed: it lands long before the first turn could call ask-marcel-office.
  void writeOfficeShim(toolsRoot, location);
  // The exact-flags cheat-sheet, regenerated every launch so a CLI upgrade updates it.
  // Under the account folder, where the agent's CLAUDE_CONFIG_DIR points.
  void writeCliCheatsheet(userData, officeCatalogPath());
  // Same reasoning for node/npm/npx: rewritten every launch, lands well before a turn.
  void writeToolShims(toolsRoot, toolCliLocation());
  // Build the per-user Python venv in the background so python3 resolves offline.
  startPython(toolsRoot);

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
    toolsRoot,
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
    title: createTitleJob({
      runAgentText: createRunAgentText(),
      conversations,
      session: (preferredModel) => jobs.session(preferredModel),
      onTitle: (conversationId, title) => emit({ type: 'title', conversationId, title }),
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
    quickContext,
    officeCatalog,
    agentsStore,
    agentFiles,
    memory,
    memoryStore,
    // Rebuilding a document is the same job the app runs on its own, asked for
    // explicitly. It resolves with the new contents so the panel shows them at once.
    regenerateAgentFile: async (doc) => {
      const checked = parseAgentFileDoc(doc);
      if (!checked.ok) return checked;
      // Nothing regenerates the global context: the user writes it themselves, there is
      // no background job that could, and asking for one is a mistake, not a wait.
      if (checked.value === 'global-context') return err({ kind: 'unavailable', message: 'the global context is yours to write; there is nothing to regenerate' });
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

  return { agent, skills, gateway, background, idle, memory, conversations, quickContext };
};

void app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.askmarcel.studio');
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window));

  // Before any store exists: whose data is this? Resolving it here is what lets every
  // store below stay ignorant of accounts and simply be handed a folder. An installation
  // from before accounts existed is moved under its owner in the same step.
  const accounts = await createAccountService(createAccountFs(app.getPath('userData')));

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
    quickContext: quickContextRuntime,
  } = buildRuntime(
    (event) => {
      // The idle watcher sees the same stream the renderer does: a turn ending is
      // exactly when a conversation might have gone quiet.
      idle.onUiEvent(event);
      if (!window.isDestroyed()) window.webContents.send(CHAT_EVENT, event);
    },
    (event) => {
      if (!window.isDestroyed()) window.webContents.send(MEMORY_EVENT, event);
    },
    accounts
  );

  // Re-seeded every launch so an app update ships an updated skill, and a folder the
  // user deleted by hand comes back. Not awaited: a skill lands before the first
  // message can possibly be sent, and blocking startup on a copy would be worse.
  void skills.seedBuiltins();
  // Who the user is: read what was stored, then fetch again only if it has gone stale.
  // Not awaited, and silent on failure: the window opens either way, and the block is
  // simply absent from the prompt until it lands.
  void quickContextRuntime
    .load()
    .then(() => quickContextRuntime.refresh(false))
    .then(() => onAccountKnown());

  // The stores were opened against the account the app knew about at launch, so anything
  // that moves a folder underneath them has to be followed by starting again. Two cases
  // do: signing in as somebody else, and a first sign-in claiming the folder that was
  // being worked in while signed out. Both happen once and land before a turn can run.
  const onAccountKnown = async (): Promise<void> => {
    const context = quickContextRuntime.current();
    if (context === undefined) return;
    const outcome = await accounts.observe(context);
    if (outcome === 'unchanged') return;
    app.relaunch();
    app.exit(0);
  };

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
