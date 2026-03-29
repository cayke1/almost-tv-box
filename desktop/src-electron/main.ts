import { app, BrowserWindow, ipcMain, screen, globalShortcut, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import * as http from 'http';
import { setupIpcHandlers, getAppManager } from './services/ipc-handlers';

app.commandLine.appendSwitch('disable-features', 'CrossSiteDocumentBlockingIfIsolating');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('allow-universal-access-from-file');

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const SERVER_HOST = process.env.SERVER_HOST || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.SERVER_PORT || '8080', 10);
const LOCAL_WS_PORT = parseInt(process.env.LOCAL_WS_PORT || '8081', 10);
const DATA_PATH = process.env.DATA_PATH || path.join(app.getPath('userData'), 'data');

function setupSession() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
  }
  session.setPartitionPersistPath(DATA_PATH);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  console.log('[Desktop] Session data path:', DATA_PATH);
}

let serverPollInterval: NodeJS.Timeout | null = null;
let lastMessageIndex = 0;
let localWss: WebSocketServer | null = null;
const mobileClients: Set<WebSocket> = new Set();

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

  if (VITE_DEV_SERVER_URL) {
    startLocalServer();
    connectToServer();
  }

  mainWindow.webContents.on('did-finish-load', () => {
    const localIP = getLocalIP();
    mainWindow?.webContents.send('server:ready', { ip: localIP, port: LOCAL_WS_PORT });
    broadcastToServer({ type: 'TV_INFO', payload: { appName: 'TV-OS', screen: 'home' } });
  });
}

function startLocalServer() {
  localWss = new WebSocketServer({ port: LOCAL_WS_PORT, host: '0.0.0.0' });

  localWss.on('connection', (ws) => {
    console.log('[Desktop] Mobile client connected (local)');
    mobileClients.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', payload: {} }));
          return;
        }
        handleMobileMessage(ws, msg);
      } catch (e) {}
    });

    ws.on('close', () => {
      mobileClients.delete(ws);
      console.log('[Desktop] Mobile client disconnected');
    });
  });

  localWss.on('error', (error) => {
    console.error('[Desktop] Local server error:', error.message);
  });

  console.log(`[Desktop] Local WebSocket server on port ${LOCAL_WS_PORT}`);
}

function handleMobileMessage(ws: WebSocket, msg: { type: string; payload: Record<string, unknown> }) {
  if (!mainWindow) return;

  const appManager = getAppManager();
  const activeViewId = appManager?.getActiveViewId();
  const hasActiveView = activeViewId !== null && activeViewId !== undefined;

  console.log(`[Desktop] handleMobileMessage: type=${msg.type}, activeViewId=${activeViewId}, hasActiveView=${hasActiveView}`);

  switch (msg.type) {
    case 'NAVIGATION': {
      const direction = msg.payload.direction as string;
      if (hasActiveView) {
        const keyMap: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
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
        appManager?.sendKeyToActiveView('Escape', 'keyDownUp');
      } else {
        mainWindow.webContents.send('back');
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
      if (hasActiveView) {
        // Touch events go to active BrowserView if supported
      } else {
        mainWindow.webContents.send('touch-event', msg);
      }
      break;
    }
  }

  broadcastToServer({ type: msg.type, payload: msg.payload });
}

let serverReconnectAttempts = 0;
let serverReconnectTimeout: NodeJS.Timeout | null = null;
let serverConnected = false;

function getServerReconnectDelay(): number {
  return Math.min(1000 * Math.pow(2, serverReconnectAttempts), 30000);
}

function httpRequest(options: http.RequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

async function sendToServer(msg: { type: string; payload: Record<string, unknown> }): Promise<void> {
  try {
    const postData = JSON.stringify(msg);
    await httpRequest({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/api/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    });
  } catch (error) {
    console.error('[Desktop] Failed to send to server:', error);
  }
}

async function pollServer(): Promise<void> {
  try {
    const data = await httpRequest({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: `/api/poll?index=${lastMessageIndex}`,
      method: 'GET',
    });

    const response = JSON.parse(data);
    serverConnected = response.electronConnected !== undefined ? response.electronConnected : true;

    if (response.messages && Array.isArray(response.messages)) {
      for (const msg of response.messages) {
        lastMessageIndex++;
        console.log('[Desktop] Server message:', msg.type);
        
        for (const ws of mobileClients) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        }
      }
    }
  } catch (error) {
    console.error('[Desktop] Poll error:', error);
    serverConnected = false;
  }
}

function startServerPolling(): void {
  if (serverPollInterval) return;
  
  pollServer();
  serverPollInterval = setInterval(() => {
    pollServer();
  }, 1000);
}

function stopServerPolling(): void {
  if (serverPollInterval) {
    clearInterval(serverPollInterval);
    serverPollInterval = null;
  }
}

function connectToServer(): void {
  if (serverReconnectTimeout) {
    clearTimeout(serverReconnectTimeout);
    serverReconnectTimeout = null;
  }

  if (serverReconnectAttempts >= 10) {
    console.log('[Desktop] Max server reconnect attempts reached');
    return;
  }

  console.log(`[Desktop] Connecting to server (HTTP polling): http://${SERVER_HOST}:${SERVER_PORT} (attempt ${serverReconnectAttempts + 1})`);

  startServerPolling();
  
  console.log('[Desktop] Connected to server (polling mode)');
  serverReconnectAttempts = 0;
  broadcastToServer({ type: 'CONNECTION_STATUS', payload: { electronConnected: true } });
}

function broadcastToServer(msg: { type: string; payload: Record<string, unknown> }) {
  sendToServer(msg);
}

function getLocalIP(): string {
  const { networkInterfaces } = require('os');
  for (const name of Object.keys(networkInterfaces())) {
    for (const net of networkInterfaces()[name]!) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  stopServerPolling();
  localWss?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServerPolling();
  localWss?.close();
  if (mainWindow) { mainWindow.removeAllListeners('close'); mainWindow.close(); }
});
