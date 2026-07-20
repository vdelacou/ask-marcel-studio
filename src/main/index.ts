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
import { createRequire } from 'node:module';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { BrowserWindow, app, shell } from 'electron';
import { CHAT_EVENT } from '../shared/ipc-contract.ts';
import { registerIpc } from './ipc/register.ts';
import { createAgentRuntime } from './services/agent/agent-runtime.ts';
import { createConversationsStore } from './services/store/conversations-store.ts';
import { createSettingsStore } from './services/store/settings-store.ts';
import { createSkillsService } from './services/skills/skills-service.ts';
import { createGateway } from './services/gateway/gateway-server.ts';
import { createOfficeService } from './services/office/office-service.ts';
import { createOfficeRun, writeOfficeShim } from './services/office/office-io.ts';
import { writeToolShims } from './services/shims/tool-shims-io.ts';
import { createPythonService } from './services/python/python-service.ts';
import { createPythonIo } from './services/python/python-io.ts';
import { platformOf, pythonVenvDir, runtimePythonPath, venvPythonPath } from '../shared/python-paths.ts';
import type { OfficeCliLocation } from './services/office/office-io.ts';
import type { ToolCliLocation } from './services/shims/tool-shims-io.ts';
import type { PythonService } from './services/python/python-service.ts';
import type { AgentRuntime } from './services/agent/agent-runtime.ts';
import type { SkillsService } from './services/skills/skills-service.ts';
import type { Gateway } from './services/gateway/gateway-server.ts';
import type { UIEvent } from '../shared/ipc-contract.ts';

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

const BUILTIN_SKILLS = ['ask-marcel-office'];

// Resolve the office CLI's cli.js through Node's own resolution, so it works in dev
// (repo node_modules) and packaged alike. It is launched as `execPath cliPath ...` with
// ELECTRON_RUN_AS_NODE, i.e. the app's Electron binary run as Node, so a machine with
// no Node still works.
const officeCliLocation = (): OfficeCliLocation => {
  const resolveFrom = createRequire(__filename);
  return { execPath: process.execPath, cliPath: join(dirname(resolveFrom.resolve('ask-marcel-office-cli/package.json')), 'dist', 'cli.js') };
};

// The bundled npm package's bin scripts, resolved the same way as the office CLI so it
// works in dev and packaged alike. node is the app binary itself (run as Node), so it
// needs no path. This gives the agent node/npm/npx with no Node on the machine (M8).
const toolCliLocation = (): ToolCliLocation => {
  const resolveFrom = createRequire(__filename);
  const npmDir = dirname(resolveFrom.resolve('npm/package.json'));
  return { execPath: process.execPath, npmCliPath: join(npmDir, 'bin', 'npm-cli.js'), npxCliPath: join(npmDir, 'bin', 'npx-cli.js') };
};

// The embedded Python runtime and its seed wheels (M8 Phase B). The build string is the
// runtime pin from scripts/fetch-python.ts; a change forces the venv to be rebuilt.
const PYTHON_BUILD = '3.13.14+20260718';
const PYTHON_SEED = ['openpyxl', 'pandas'];

// dev on darwin resolves the vendored triple; any other host falls through to a name with
// no vendor dir, so provisioning just fails to launch rather than crashing the app.
const hostPythonTriple = (): string => {
  if (process.platform !== 'darwin') return 'x86_64-pc-windows-msvc';
  return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
};

// Packaged, the runtime and wheels ship as extraResources; in dev they are the fetched
// vendor/ folders (bun run fetch:python && bun run fetch:wheels). Returns the service so
// IPC can report status; provisioning is kicked off here and runs in the background.
const startPython = (userData: string): PythonService => {
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
  return python;
};

const buildRuntime = (emit: (event: UIEvent) => void): { agent: AgentRuntime; skills: SkillsService; gateway: Gateway } => {
  const userData = app.getPath('userData');
  const now = (): string => new Date().toISOString();
  const settings = createSettingsStore({ userData });
  const conversations = createConversationsStore({ userData, now });
  const skills = createSkillsService({ userData, builtinSource: builtinSkillsSource(), builtinNames: BUILTIN_SKILLS });
  // Providers are read per request, not captured: a key changed in settings must take
  // effect on the next turn without restarting the gateway.
  const gateway = createGateway({
    findProvider: async (providerId) => {
      const current = await settings.get();
      return current.ok ? current.value.providers.find((p) => p.id === providerId) : undefined;
    },
  });
  const agent = createAgentRuntime({ settings, conversations, gateway, userData, now, emit, inheritedEnv: process.env });

  const location = officeCliLocation();
  const office = createOfficeService(createOfficeRun(location, process.env));
  // Rewritten every launch: process.execPath and the cli.js path both move across
  // updates, so a stale shim would exec a binary that is gone. Not awaited, like the
  // skills seed: it lands long before the first turn could call ask-marcel-office.
  void writeOfficeShim(userData, location);
  // Same reasoning for node/npm/npx: rewritten every launch, lands well before a turn.
  void writeToolShims(userData, toolCliLocation());
  // Build the per-user Python venv in the background so python3 resolves offline.
  const python = startPython(userData);

  registerIpc({ settings, conversations, agent, skills, office, python });
  return { agent, skills, gateway };
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
  } = buildRuntime((event) => {
    if (!window.isDestroyed()) window.webContents.send(CHAT_EVENT, event);
  });

  // Re-seeded every launch so an app update ships an updated skill, and a folder the
  // user deleted by hand comes back. Not awaited: a skill lands before the first
  // message can possibly be sent, and blocking startup on a copy would be worse.
  void skills.seedBuiltins();

  // A turn left running would keep an orphaned agent subprocess alive after quit, and
  // the gateway would keep a socket listening.
  app.on('before-quit', () => {
    runtime.cancelAll();
    void gateway.stop();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
