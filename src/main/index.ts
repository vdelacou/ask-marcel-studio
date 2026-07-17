/*
 * Electron main entry and composition root.
 *
 * The single top-level catch lives here (rule 17): everything below returns
 * Result. M0 wires only the window; services and IPC land in M1/M2.
 */
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { BrowserWindow, app, shell } from 'electron';
import { registerIpc } from './ipc/register.ts';
import { createConversationsStore } from './services/store/conversations-store.ts';
import { createSettingsStore } from './services/store/settings-store.ts';

const createWindow = (): void => {
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
    return;
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'));
};

// Composition root: every state-source is read once, here, and injected downward
// as a parameter. Nothing below reaches for app.getPath or the clock itself, which
// is what keeps the stores testable (references/architecture.md).
const buildDeps = (): Parameters<typeof registerIpc>[0] => {
  const userData = app.getPath('userData');
  return {
    settings: createSettingsStore({ userData }),
    conversations: createConversationsStore({ userData, now: () => new Date().toISOString() }),
  };
};

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.askmarcel.studio');
  registerIpc(buildDeps());
  app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
