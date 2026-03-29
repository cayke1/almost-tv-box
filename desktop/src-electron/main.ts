import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import * as http from 'http';
import { setupIpcHandlers, getAppManager } from './services/ipc-handlers';
import { getSettingsManager } from './services/settings-manager';
import { MobileControllerServer } from './services/websocket-server';

app.commandLine.appendSwitch('disable-features', 'CrossSiteDocumentBlockingIfIsolating');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('allow-universal-access-from-file');

let mainWindow: BrowserWindow | null = null;
let mobileServer: MobileControllerServer | null = null;
let isPolling = false;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const DATA_PATH = process.env.DATA_PATH || path.join(app.getPath('userData'), 'data');

function getSettings() {
  return getSettingsManager().getSettings();
}

function getServerHost() { return getSettings().serverHost; }
function getServerPort() { return getSettings().serverPort; }

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#0a0a0a',
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('resize', () => { if (mainWindow && !mainWindow.isFullScreen()) mainWindow.setFullScreen(true); });
  
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      event.preventDefault();
      return;
    }

    if (input.type === 'keyDown') {
      switch (input.key) {
        case 'ArrowUp':
          mainWindow?.webContents.send('navigate', 'up');
          event.preventDefault();
          break;
        case 'ArrowDown':
          mainWindow?.webContents.send('navigate', 'down');
          event.preventDefault();
          break;
        case 'ArrowLeft':
          mainWindow?.webContents.send('navigate', 'left');
          event.preventDefault();
          break;
        case 'ArrowRight':
          mainWindow?.webContents.send('navigate', 'right');
          event.preventDefault();
          break;
        case 'Escape':
          mainWindow?.webContents.send('back');
          event.preventDefault();
          break;
        case 'Enter':
          mainWindow?.webContents.send('select');
          event.preventDefault();
          break;
      }
    }
  });

  setupIpcHandlers(mainWindow);
  connectToServer();

  // Start internal mobile controller server
  mobileServer = new MobileControllerServer(mainWindow, (msg) => {
    handleServerMessage(msg);
  }, 8080);
  mobileServer.start().catch(err => console.error('[Main] Failed to start mobile server:', err));

  mainWindow.webContents.on('did-finish-load', () => {
    const localIP = getLocalIP();
    mainWindow?.webContents.send('server:ready', { ip: localIP, port: 0 });
    broadcastToServer({ type: 'TV_INFO', payload: { appName: 'TV-OS', screen: 'home' } });
  });
}

function handleServerMessage(msg: { type: string; payload: Record<string, unknown> }) {
  if (!mainWindow) return;

  const appManager = getAppManager();
  const activeViewId = appManager?.getActiveViewId();
  const hasActiveView = activeViewId !== null && activeViewId !== undefined;

  console.log(`[Desktop] handleServerMessage: type=${msg.type}, activeViewId=${activeViewId}`);

  switch (msg.type) {
    case 'NAVIGATION': {
      const direction = msg.payload.direction as string;
      if (hasActiveView) {
        const keyMap: Record<string, string> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' };
        if (keyMap[direction]) {
          appManager?.sendKeyToActiveView(keyMap[direction], 'keyDownUp');
        }
      } else {
        mainWindow.webContents.send('navigate', direction);
      }
      break;
    }
    case 'SELECT': {
      if (hasActiveView) {
        appManager?.sendKeyToActiveView('Enter', 'keyDownUp');
      } else {
        mainWindow.webContents.send('select');
      }
      break;
    }
    case 'BACK': {
      if (hasActiveView) {
        console.log('[Desktop] BACK received, sending Escape to active view...');
        appManager?.sendKeyToActiveView('Escape', 'keyDownUp');
      } else {
        mainWindow.webContents.send('back');
      }
      break;
    }
    case 'HOME': {
      console.log('[Desktop] HOME received, closing all views...');
      appManager?.closeAllViews();
      break;
    }
    case 'VOLUME_UP': {
      if (hasActiveView) {
        appManager?.sendKeyToActiveView('VolumeUp', 'keyDownUp');
      } else {
        mainWindow.webContents.send('volume-up');
      }
      break;
    }
    case 'VOLUME_DOWN': {
      if (hasActiveView) {
        appManager?.sendKeyToActiveView('VolumeDown', 'keyDownUp');
      } else {
        mainWindow.webContents.send('volume-down');
      }
      break;
    }
    case 'VOLUME_MUTE': {
      if (hasActiveView) {
        appManager?.sendKeyToActiveView('VolumeMute', 'keyDownUp');
      } else {
        mainWindow.webContents.send('volume-mute');
      }
      break;
    }
    case 'TEXT_INPUT': {
      if (hasActiveView) {
        appManager?.sendTextToActiveView(msg.payload.text as string);
      } else {
        mainWindow.webContents.send('text-input', msg.payload.text);
      }
      break;
    }
    case 'TOUCH_START':
    case 'TOUCH_MOVE':
    case 'TOUCH_END':
    case 'SCROLL':
    case 'MOUSE_MOVE':
    case 'MOUSE_CLICK': {
      if (!hasActiveView) {
        mainWindow.webContents.send('touch-event', msg);
      }
      break;
    }
  }
}

let lastMessageIndex = 0;
let serverConnected = false;

function httpRequest(options: http.RequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    // Set a long timeout for long-polling
    req.setTimeout(45000, () => {
      req.destroy();
      reject(new Error('Request Timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function sendToServer(msg: { type: string; payload: Record<string, unknown> }): Promise<void> {
  try {
    const postData = JSON.stringify(msg);
    await httpRequest({
      hostname: getServerHost(),
      port: getServerPort(),
      path: '/api/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    });
  } catch (error) {
    console.error('[Desktop] Failed to send to server:', error.message);
  }
}

async function pollServer(): Promise<void> {
  if (!isPolling) return;

  try {
    const data = await httpRequest({
      hostname: getServerHost(),
      port: getServerPort(),
      path: `/api/poll?clientId=television&index=${lastMessageIndex}`,
      method: 'GET',
    });

    const response = JSON.parse(data);
    serverConnected = response.electronConnected !== undefined ? response.electronConnected : true;

    if (response.messages && Array.isArray(response.messages)) {
      for (const msg of response.messages) {
        lastMessageIndex++;
        console.log('[Desktop] Processing polled message:', msg.type);
        handleServerMessage(msg);
      }
    }
    // Immediate re-poll on success
    setImmediate(pollServer);
  } catch (error) {
    console.error('[Desktop] Poll error:', error.message);
    serverConnected = false;
    // Wait bit longer on error before re-polling
    setTimeout(pollServer, 2000);
  }
}

function startServerPolling(): void {
  if (isPolling) return;
  isPolling = true;
  pollServer();
}

function stopServerPolling(): void {
  isPolling = false;
}

function connectToServer(): void {
  console.log(`[Desktop] Starting long-polling to backend: http://${getServerHost()}:${getServerPort()}`);
  startServerPolling();
  broadcastToServer({ type: 'CONNECTION_STATUS', payload: { electronConnected: true } });
}

function broadcastToServer(msg: { type: string; payload: Record<string, unknown> }) {
  sendToServer(msg);
}

function getLocalIP(): string {
  const settings = getSettings();
  const { networkInterfaces } = require('os');
  const interfaces = networkInterfaces();

  if (settings.selectedInterface && interfaces[settings.selectedInterface]) {
    const iface = interfaces[settings.selectedInterface].find((i: any) => i.family === 'IPv4' && !i.internal);
    if (iface) return iface.address;
  }

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]!) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

ipcMain.on('settings:updated', () => {
  console.log('[Desktop] Settings updated, restarting connection...');
  stopServerPolling();
  connectToServer();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  stopServerPolling();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServerPolling();
  if (mobileServer) mobileServer.stop();
  if (mainWindow) { mainWindow.removeAllListeners('close'); mainWindow.close(); }
});
