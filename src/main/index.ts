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
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { BrowserWindow, app, shell } from 'electron';
import { CHAT_EVENT } from '../shared/ipc-contract.ts';
import { registerIpc } from './ipc/register.ts';
import { createAgentRuntime } from './services/agent/agent-runtime.ts';
import { createConversationsStore } from './services/store/conversations-store.ts';
import { createSettingsStore } from './services/store/settings-store.ts';
import type { AgentRuntime } from './services/agent/agent-runtime.ts';
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

const buildRuntime = (emit: (event: UIEvent) => void): AgentRuntime => {
  const userData = app.getPath('userData');
  const now = (): string => new Date().toISOString();
  const settings = createSettingsStore({ userData });
  const conversations = createConversationsStore({ userData, now });
  const agent = createAgentRuntime({ settings, conversations, userData, now, emit, inheritedEnv: process.env });
  registerIpc({ settings, conversations, agent });
  return agent;
};

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.askmarcel.studio');
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window));

  const window = createWindow();
  // Events go to the window that exists now. There is one window in v1 (multi-window
  // is a stated non-goal), so a lookup per event would be ceremony.
  const runtime = buildRuntime((event) => {
    if (!window.isDestroyed()) window.webContents.send(CHAT_EVENT, event);
  });

  // A turn left running would keep an orphaned agent subprocess alive after quit.
  app.on('before-quit', () => runtime.cancelAll());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
