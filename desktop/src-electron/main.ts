import { app, BrowserWindow, ipcMain, screen, globalShortcut, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';
import { setupIpcHandlers } from './services/ipc-handlers';

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
  console.log('[Desktop] Session data path:', DATA_PATH);
}

let serverWs: WebSocket | null = null;
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

  switch (msg.type) {
    case 'NAVIGATION': mainWindow.webContents.send('navigate', msg.payload.direction); break;
    case 'SELECT': mainWindow.webContents.send('select'); break;
    case 'BACK': mainWindow.webContents.send('back'); break;
    case 'TEXT_INPUT': mainWindow.webContents.send('text-input', msg.payload.text); break;
    case 'TOUCH_START':
    case 'TOUCH_MOVE':
    case 'TOUCH_END':
    case 'SCROLL':
    case 'MOUSE_MOVE':
    case 'MOUSE_CLICK':
      mainWindow.webContents.send('touch-event', msg);
      break;
  }

  broadcastToServer({ type: msg.type, payload: msg.payload });
}

let serverReconnectAttempts = 0;
let serverReconnectTimeout: NodeJS.Timeout | null = null;
let serverPingInterval: NodeJS.Timeout | null = null;
const maxServerReconnectAttempts = 10;

function getServerReconnectDelay(): number {
  return Math.min(1000 * Math.pow(2, serverReconnectAttempts), 30000);
}

function connectToServer() {
  if (serverReconnectTimeout) {
    clearTimeout(serverReconnectTimeout);
    serverReconnectTimeout = null;
  }

  if (serverReconnectAttempts >= maxServerReconnectAttempts) {
    console.log('[Desktop] Max server reconnect attempts reached');
    return;
  }

  const serverUrl = `ws://${SERVER_HOST}:${SERVER_PORT}`;
  console.log(`[Desktop] Connecting to server: ${serverUrl} (attempt ${serverReconnectAttempts + 1})`);

  try {
    serverWs = new WebSocket(serverUrl);

    serverWs.on('open', () => {
      console.log('[Desktop] Connected to server');
      serverReconnectAttempts = 0;
      broadcastToServer({ type: 'CONNECTION_STATUS', payload: { electronConnected: true } });
      startServerPing();
    });

    serverWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PONG') return;
        for (const ws of mobileClients) {
          if (ws.readyState === WebSocket.OPEN) ws.send(data.toString());
        }
      } catch (error) {
        console.error('[Desktop] Failed to parse server message:', error);
      }
    });

    serverWs.on('close', () => {
      console.log('[Desktop] Disconnected from server');
      stopServerPing();
      broadcastToServer({ type: 'CONNECTION_STATUS', payload: { electronConnected: false } });
      
      if (serverReconnectAttempts < maxServerReconnectAttempts) {
        const delay = getServerReconnectDelay();
        console.log(`[Desktop] Reconnecting in ${delay}ms...`);
        serverReconnectTimeout = setTimeout(() => {
          serverReconnectAttempts++;
          connectToServer();
        }, delay);
      }
    });

    serverWs.on('error', (error) => {
      console.error('[Desktop] Server connection error:', error.message);
    });
  } catch (error) {
    console.error('[Desktop] Failed to create WebSocket:', error);
  }
}

function startServerPing(): void {
  stopServerPing();
  serverPingInterval = setInterval(() => {
    if (serverWs && serverWs.readyState === WebSocket.OPEN) {
      serverWs.send(JSON.stringify({ type: 'PING', payload: {} }));
    }
  }, 15000);
}

function stopServerPing(): void {
  if (serverPingInterval) {
    clearInterval(serverPingInterval);
    serverPingInterval = null;
  }
}

function broadcastToServer(msg: { type: string; payload: Record<string, unknown> }) {
  if (serverWs && serverWs.readyState === WebSocket.OPEN) {
    serverWs.send(JSON.stringify(msg));
  }
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
  serverWs?.close();
  localWss?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  serverWs?.close();
  localWss?.close();
  if (mainWindow) { mainWindow.removeAllListeners('close'); mainWindow.close(); }
});
