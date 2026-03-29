# Phone Controller - WebSocket Server & Mobile UI

## Visão Geral

Criar um servidor WebSocket dentro do Electron para permitir controle remoto via smartphone. O mesmo servidor serve uma interface web responsiva para o mobile.

---

## 1. Arquitetura

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Mobile Phone  │ ◄─────────────────────────► │   TV (Electron) │
│                 │                              │                 │
│  ┌───────────┐  │      HTTP (static files)    │  ┌───────────┐  │
│  │ Mobile UI │  │ ◄────────────────────────── │  │ WS Server │  │
│  └───────────┘  │                              │  └───────────┘  │
└─────────────────┘                              └─────────────────┘
         │                                                │
         │                                                ▼
         │                                       ┌─────────────────┐
         └──────────────────────────────────────► │  Event Handler │
                                                  └─────────────────┘
```

### Estrutura de Arquivos

```
src-electron/
├── services/
│   ├── websocket-server.ts    # WS server implementation
│   ├── mobile-controller.ts   # Mobile controller logic
│   └── ipc-bridge.ts          # Bridge WS events to IPC
src/
├── mobile/
│   ├── index.html             # Mobile UI entry
│   ├── styles.css             # Mobile styles
│   └── app.js                 # Mobile UI logic
```

---

## 2. Protocolo de Comunicação

### Message Types

```typescript
// Client -> Server (Mobile to TV)
type ClientMessage = 
  | { type: 'NAVIGATION'; payload: { direction: 'up' | 'down' | 'left' | 'right' } }
  | { type: 'SELECT'; payload: {} }
  | { type: 'BACK'; payload: {} }
  | { type: 'TEXT_INPUT'; payload: { text: string } }
  | { type: 'TOUCH_START'; payload: { x: number; y: number } }
  | { type: 'TOUCH_MOVE'; payload: { dx: number; dy: number } }
  | { type: 'TOUCH_END'; payload: {} }
  | { type: 'SCROLL'; payload: { dx: number; dy: number } }
  | { type: 'MOUSE_MOVE'; payload: { dx: number; dy: number } }
  | { type: 'MOUSE_CLICK'; payload: { button: 'left' | 'right' } }
  | { type: 'PING'; payload: {} };

// Server -> Client (TV to Mobile)
type ServerMessage =
  | { type: 'PONG'; payload: {} }
  | { type: 'CONNECTION_STATUS'; payload: { connected: boolean; clientCount: number } }
  | { type: 'TV_INFO'; payload: { appName: string; screen: string } }
  | { type: 'ERROR'; payload: { message: string } };
```

---

## 3. WebSocket Server

### src-electron/services/websocket-server.ts

```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { ipcMain, BrowserWindow } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

interface MobileClient {
  id: string;
  ws: WebSocket;
  lastActivity: number;
}

export class MobileControllerServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private clients: Map<string, MobileClient> = new Map();
  private mainWindow: BrowserWindow;
  private port: number = 8080;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(mainWindow: BrowserWindow, port: number = 8080) {
    this.mainWindow = mainWindow;
    this.port = port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Create HTTP server for mobile UI
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Create WebSocket server
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleConnection(ws);
      });

      this.wss.on('error', (error: Error) => {
        console.error('[WebSocketServer] Error:', error);
        reject(error);
      });

      this.httpServer.on('error', (error: Error) => {
        console.error('[HTTPServer] Error:', error);
        reject(error);
      });

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`[MobileControllerServer] Running on port ${this.port}`);
        this.startPingInterval();
        resolve(this.port);
      });
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Serve mobile UI
    if (req.url === '/' || req.url === '/mobile') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getMobileUI());
      return;
    }

    // Serve static assets
    if (req.url?.startsWith('/static/')) {
      const filePath = req.url.slice(9);
      this.serveStaticFile(filePath, res);
      return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  }

  private serveStaticFile(filePath: string, res: http.ServerResponse) {
    const ext = path.extname(filePath);
    const contentTypes: Record<string, string> = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end();
  }

  private handleConnection(ws: WebSocket) {
    const clientId = this.generateClientId();
    const client: MobileClient = {
      id: clientId,
      ws,
      lastActivity: Date.now(),
    };

    this.clients.set(clientId, client);
    console.log(`[WebSocketServer] Client connected: ${clientId}`);

    // Send connection status to all clients
    this.broadcastConnectionStatus();

    // Send TV info
    this.sendToClient(clientId, {
      type: 'TV_INFO',
      payload: {
        appName: 'TV-OS',
        screen: 'home',
      },
    });

    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      console.log(`[WebSocketServer] Client disconnected: ${clientId}`);
      this.broadcastConnectionStatus();
    });

    ws.on('error', (error: Error) => {
      console.error(`[WebSocketServer] Client error (${clientId}):`, error);
    });
  }

  private handleMessage(clientId: string, data: Buffer) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = Date.now();

    try {
      const message = JSON.parse(data.toString());
      this.processMessage(clientId, message);
    } catch (error) {
      console.error('[WebSocketServer] Invalid message:', error);
    }
  }

  private processMessage(clientId: string, message: ClientMessage) {
    console.log(`[WebSocketServer] Message from ${clientId}:`, message.type);

    switch (message.type) {
      case 'NAVIGATION':
        this.mainWindow.webContents.send('navigate', message.payload.direction);
        break;

      case 'SELECT':
        this.mainWindow.webContents.send('select');
        break;

      case 'BACK':
        this.mainWindow.webContents.send('back');
        break;

      case 'TEXT_INPUT':
        this.mainWindow.webContents.send('text-input', message.payload.text);
        break;

      case 'TOUCH_START':
      case 'TOUCH_MOVE':
      case 'TOUCH_END':
      case 'SCROLL':
      case 'MOUSE_MOVE':
      case 'MOUSE_CLICK':
        this.forwardToTouchpadHandler(message);
        break;

      case 'PING':
        this.sendToClient(clientId, { type: 'PONG', payload: {} });
        break;
    }
  }

  private forwardToTouchpadHandler(message: ClientMessage) {
    // Forward touch/mouse events to main window
    this.mainWindow.webContents.send('touch-event', message);
  }

  private sendToClient(clientId: string, message: ServerMessage) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`[WebSocketServer] Failed to send to ${clientId}:`, error);
    }
  }

  private broadcastConnectionStatus() {
    const message: ServerMessage = {
      type: 'CONNECTION_STATUS',
      payload: {
        connected: true,
        clientCount: this.clients.size,
      },
    };

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients) {
        // Remove stale connections (no activity for 5 minutes)
        if (now - client.lastActivity > 5 * 60 * 1000) {
          client.ws.close();
          this.clients.delete(clientId);
          continue;
        }

        // Send ping if needed
        if (client.ws.readyState === WebSocket.OPEN) {
          this.sendToClient(clientId, { type: 'PONG', payload: {} });
        }
      }
    }, 30000);
  }

  private generateClientId(): string {
    return `mobile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  stop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    this.wss?.close();
    this.httpServer?.close();
  }

  getPort(): number {
    return this.port;
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

type ClientMessage = 
  | { type: 'NAVIGATION'; payload: { direction: 'up' | 'down' | 'left' | 'right' } }
  | { type: 'SELECT'; payload: {} }
  | { type: 'BACK'; payload: {} }
  | { type: 'TEXT_INPUT'; payload: { text: string } }
  | { type: 'TOUCH_START' | 'TOUCH_MOVE' | 'TOUCH_END'; payload: { x?: number; y?: number; dx?: number; dy?: number } }
  | { type: 'SCROLL'; payload: { dx: number; dy: number } }
  | { type: 'MOUSE_MOVE'; payload: { dx: number; dy: number } }
  | { type: 'MOUSE_CLICK'; payload: { button: 'left' | 'right' } }
  | { type: 'PING'; payload: {} };

type ServerMessage = 
  | { type: 'PONG' | 'CONNECTION_STATUS'; payload: any }
  | { type: 'TV_INFO'; payload: { appName: string; screen: string } }
  | { type: 'ERROR'; payload: { message: string } };
```

---

## 4. Mobile UI HTML

### src/mobile/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>TV Remote</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <!-- Connection Status -->
    <div class="status-bar">
      <div class="status-indicator" id="statusIndicator"></div>
      <span id="statusText">Connecting...</span>
    </div>

    <!-- Direction Pad -->
    <div class="dpad">
      <button class="dpad-btn dpad-up" data-direction="up">
        <svg viewBox="0 0 24 24"><path d="M12 4l-8 8h16z"/></svg>
      </button>
      <button class="dpad-btn dpad-left" data-direction="left">
        <svg viewBox="0 0 24 24"><path d="M4 12l8-8v16z"/></svg>
      </button>
      <button class="dpad-center" data-action="select">
        <span>OK</span>
      </button>
      <button class="dpad-btn dpad-right" data-direction="right">
        <svg viewBox="0 0 24 24"><path d="M20 12l-8-8v16z"/></svg>
      </button>
      <button class="dpad-btn dpad-down" data-direction="down">
        <svg viewBox="0 0 24 24"><path d="M12 20l8-8H4z"/></svg>
      </button>
    </div>

    <!-- Back Button -->
    <button class="action-btn back-btn" data-action="back">
      <span>← Back</span>
    </button>

    <!-- Text Input -->
    <div class="text-section">
      <input type="text" id="textInput" placeholder="Type text..." />
      <button class="send-btn" id="sendBtn">Send</button>
    </div>

    <!-- Touchpad Area -->
    <div class="touchpad" id="touchpad">
      <div class="touchpad-hint">Touch to move cursor</div>
    </div>

    <!-- Mouse Buttons -->
    <div class="mouse-buttons">
      <button class="mouse-btn left-btn" data-action="left-click">Left</button>
      <button class="mouse-btn right-btn" data-action="right-click">Right</button>
    </div>

    <!-- Sensitivity Slider -->
    <div class="sensitivity-control">
      <label>Speed: <span id="sensitivityValue">50</span>%</label>
      <input type="range" id="sensitivity" min="10" max="100" value="50">
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

---

## 5. Mobile UI CSS

### src/mobile/styles.css

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

:root {
  --bg-color: #0a0a0a;
  --surface: #1a1a1a;
  --primary: #3b82f6;
  --text: #ffffff;
  --text-muted: #888888;
  --success: #22c55e;
  --error: #ef4444;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-color);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 20px;
}

.container {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Status Bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--surface);
  border-radius: 8px;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--error);
  animation: pulse 2s infinite;
}

.status-indicator.connected {
  background: var(--success);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* D-Pad */
.dpad {
  display: grid;
  grid-template-areas:
    ". up ."
    "left center right"
    ". down .";
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 60px);
  gap: 4px;
}

.dpad-btn {
  background: var(--surface);
  border: none;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.dpad-btn:active {
  background: var(--primary);
  transform: scale(0.95);
}

.dpad-btn svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
}

.dpad-up { grid-area: up; }
.dpad-down { grid-area: down; }
.dpad-left { grid-area: left; }
.dpad-right { grid-area: right; }

.dpad-center {
  grid-area: center;
  background: var(--primary);
  border: none;
  border-radius: 50%;
  color: var(--text);
  font-weight: bold;
  cursor: pointer;
}

.dpad-center:active {
  transform: scale(0.9);
}

/* Action Buttons */
.action-btn {
  padding: 16px;
  background: var(--surface);
  border: none;
  border-radius: 8px;
  color: var(--text);
  font-size: 16px;
  cursor: pointer;
}

.action-btn:active {
  background: #2a2a2a;
}

/* Text Input */
.text-section {
  display: flex;
  gap: 8px;
}

.text-section input {
  flex: 1;
  padding: 12px;
  background: var(--surface);
  border: 1px solid #333;
  border-radius: 8px;
  color: var(--text);
  font-size: 16px;
}

.send-btn {
  padding: 12px 20px;
  background: var(--primary);
  border: none;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
}

/* Touchpad */
.touchpad {
  height: 200px;
  background: var(--surface);
  border: 2px solid #333;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  touch-action: none;
}

.touchpad-hint {
  color: var(--text-muted);
  font-size: 14px;
  pointer-events: none;
}

.touchpad.touched .touchpad-hint {
  display: none;
}

/* Mouse Buttons */
.mouse-buttons {
  display: flex;
  gap: 8px;
}

.mouse-btn {
  flex: 1;
  padding: 12px;
  background: var(--surface);
  border: 1px solid #333;
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
}

.mouse-btn:active {
  background: #2a2a2a;
}

/* Sensitivity */
.sensitivity-control {
  padding: 12px;
  background: var(--surface);
  border-radius: 8px;
}

.sensitivity-control label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 14px;
}

.sensitivity-control input[type="range"] {
  width: 100%;
  height: 8px;
  background: #333;
  border-radius: 4px;
  appearance: none;
}

.sensitivity-control input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

/* Responsive */
@media (max-width: 320px) {
  .dpad {
    grid-template-rows: repeat(3, 50px);
  }
}
```

---

## 6. Mobile UI JavaScript

### src/mobile/app.js

```javascript
class MobileController {
  constructor() {
    this.ws = null;
    this.sensitivity = 50;
    this.touchStartPos = null;
    this.isConnected = false;

    this.initElements();
    this.initEventListeners();
    this.connect();
  }

  initElements() {
    this.statusIndicator = document.getElementById('statusIndicator');
    this.statusText = document.getElementById('statusText');
    this.touchpad = document.getElementById('touchpad');
    this.textInput = document.getElementById('textInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.sensitivitySlider = document.getElementById('sensitivity');
    this.sensitivityValue = document.getElementById('sensitivityValue');
  }

  initEventListeners() {
    // D-Pad buttons
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const direction = btn.dataset.direction;
        this.sendNavigation(direction);
      });
    });

    // Center button (select)
    document.querySelector('.dpad-center').addEventListener('click', () => {
      this.sendSelect();
    });

    // Back button
    document.querySelector('.back-btn').addEventListener('click', () => {
      this.sendBack();
    });

    // Text input
    this.sendBtn.addEventListener('click', () => {
      this.sendText(this.textInput.value);
      this.textInput.value = '';
    });

    this.textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendText(this.textInput.value);
        this.textInput.value = '';
      }
    });

    // Touchpad
    this.touchpad.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.touchpad.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.touchpad.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    // Mouse buttons
    document.querySelector('.left-btn').addEventListener('click', () => {
      this.sendMouseClick('left');
    });

    document.querySelector('.right-btn').addEventListener('click', () => {
      this.sendMouseClick('right');
    });

    // Sensitivity
    this.sensitivitySlider.addEventListener('input', (e) => {
      this.sensitivity = parseInt(e.target.value);
      this.sensitivityValue.textContent = this.sensitivity;
    });
  }

  connect() {
    const wsUrl = `ws://${window.location.hostname}:8080`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to TV');
        this.isConnected = true;
        this.updateStatus(true);
      };

      this.ws.onclose = () => {
        console.log('Disconnected from TV');
        this.isConnected = false;
        this.updateStatus(false);
        
        // Reconnect after 3 seconds
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setTimeout(() => this.connect(), 3000);
    }
  }

  updateStatus(connected) {
    this.statusIndicator.classList.toggle('connected', connected);
    this.statusText.textContent = connected ? 'Connected' : 'Disconnected';
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendNavigation(direction) {
    this.send({ type: 'NAVIGATION', payload: { direction } });
  }

  sendSelect() {
    this.send({ type: 'SELECT', payload: {} });
  }

  sendBack() {
    this.send({ type: 'BACK', payload: {} });
  }

  sendText(text) {
    if (!text) return;
    this.send({ type: 'TEXT_INPUT', payload: { text } });
  }

  sendMouseMove(dx, dy) {
    const multiplier = this.sensitivity / 50;
    this.send({ 
      type: 'MOUSE_MOVE', 
      payload: { 
        dx: Math.round(dx * multiplier), 
        dy: Math.round(dy * multiplier) 
      } 
    });
  }

  sendMouseClick(button) {
    this.send({ type: 'MOUSE_CLICK', payload: { button } });
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    this.touchpad.classList.add('touched');
    this.send({ type: 'TOUCH_START', payload: { x: touch.clientX, y: touch.clientY } });
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (!this.touchStartPos) return;

    const touch = e.touches[0];
    const dx = touch.clientX - this.touchStartPos.x;
    const dy = touch.clientY - this.touchStartPos.y;

    // Send movement only if significant
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      this.sendMouseMove(dx, dy);
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    }
  }

  handleTouchEnd(e) {
    e.preventDefault();
    this.touchStartPos = null;
    this.touchpad.classList.remove('touched');
    this.send({ type: 'TOUCH_END', payload: {} });
  }

  handleMessage(message) {
    console.log('Received:', message);
    
    switch (message.type) {
      case 'PONG':
        // Connection alive
        break;
      case 'CONNECTION_STATUS':
        console.log('Clients connected:', message.payload.clientCount);
        break;
      case 'TV_INFO':
        console.log('TV Info:', message.payload);
        break;
      case 'ERROR':
        console.error('TV Error:', message.payload.message);
        break;
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MobileController();
});
```

---

## 7. IPC Bridge

### src-electron/services/ipc-bridge.ts

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { MobileControllerServer } from './websocket-server';

export function setupIpcBridge(server: MobileControllerServer) {
  ipcMain.handle('network:get-local-ip', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  });

  // Allow renderer to update TV info shown on mobile
  ipcMain.on('tv:update-info', (_event, info: { appName: string; screen: string }) => {
    // Server will broadcast this to all clients
  });
}
```

---

## 8. Integração no Main Process

### src-electron/main.ts

```typescript
import { app, BrowserWindow } from 'electron';
import { setupIpcHandlers, getAppManager } from './services/ipc-handlers';
import { MobileControllerServer } from './services/websocket-server';

let mainWindow: BrowserWindow | null = null;
let mobileServer: MobileControllerServer | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);

  // Start mobile controller server
  mobileServer = new MobileControllerServer(mainWindow, 8080);
  await mobileServer.start();

  console.log(`Mobile controller available at http://${getLocalIP()}:8080`);

  // Show IP on screen
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('server:ready', {
      ip: getLocalIP(),
      port: mobileServer?.getPort(),
    });
  });
}

function getLocalIP(): string {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  mobileServer?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

---

## 9. Mostrar IP na TV

### src/components/ConnectionInfo.tsx

```tsx
import { useState, useEffect } from 'react';

interface ServerInfo {
  ip: string;
  port: number;
}

export function ConnectionInfo() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!window.electronAPI) return;

    const handleServerReady = (info: ServerInfo) => {
      setServerInfo(info);
    };

    window.electronAPI.onServerReady?.(handleServerReady);

    return () => {
      window.electronAPI.removeAllListeners?.('server:ready');
    };
  }, []);

  if (!serverInfo || !visible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white px-4 py-2 rounded-lg flex items-center gap-3">
      <span className="text-green-500">●</span>
      <span>Mobile: http://{serverInfo.ip}:{serverInfo.port}</span>
      <button 
        onClick={() => setVisible(false)}
        className="ml-2 text-gray-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
```

---

## 10. Múltiplos Dispositivos

O servidor suporta múltiplos dispositivos simultaneamente:
- Cada cliente recebe um ID único
- Broadcasts (como status de conexão) vão para todos
- Navegação de qualquer dispositivo funciona
- ClienteCount é mostrado no mobile UI

---

## 11. Checklist de Implementação

- [ ] Criar WebSocket server class
- [ ] Implementar HTTP server para mobile UI
- [ ] Definir protocolo JSON
- [ ] Criar mobile UI HTML/CSS/JS
- [ ] Implementar D-pad controls
- [ ] Implementar touchpad gestures
- [ ] Implementar text input
- [ ] Adicionar sensitivity slider
- [ ] Implementar reconnection logic
- [ ] Mostrar IP na TV
- [ ] Testar com múltiplos devices
- [ ] Adicionar connection status
- [ ] Testar performance
