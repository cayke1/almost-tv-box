import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const PORT = parseInt(process.env.PORT || '8080', 10);
const ELECTRON_HOST = process.env.ELECTRON_HOST || '127.0.0.1';
const ELECTRON_WS_PORT = parseInt(process.env.ELECTRON_WS_PORT || '8081', 10);

interface MobileClient {
  id: string;
  ws: WebSocket;
  lastActivity: number;
}

interface ClientMessage {
  type: string;
  payload: Record<string, unknown>;
}

let electronWs: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let pingInterval: NodeJS.Timeout | null = null;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 1000;

const mobileClients: Map<string, MobileClient> = new Map();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

function getReconnectDelay(): number {
  const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts), 30000);
  return delay;
}

function connectToElectron(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (reconnectAttempts >= maxReconnectAttempts) {
    console.log('[Server] Max reconnect attempts reached, stopping...');
    return;
  }

  const wsUrl = `ws://${ELECTRON_HOST}:${ELECTRON_WS_PORT}`;
  console.log(`[Server] Connecting to Electron at ${wsUrl} (attempt ${reconnectAttempts + 1})`);

  try {
    electronWs = new WebSocket(wsUrl);

    electronWs.on('open', () => {
      console.log('[Server] Connected to Electron');
      reconnectAttempts = 0;
      broadcastToMobile({ type: 'CONNECTION_STATUS', payload: { electronConnected: true } });
      startPing();
    });

    electronWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PONG') {
          return;
        }
        broadcastToMobile(msg);
      } catch (error) {
        console.error('[Server] Failed to parse message:', error);
      }
    });

    electronWs.on('close', () => {
      console.log('[Server] Disconnected from Electron');
      stopPing();
      broadcastToMobile({ type: 'CONNECTION_STATUS', payload: { electronConnected: false } });
      
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = getReconnectDelay();
        console.log(`[Server] Reconnecting in ${delay}ms...`);
        reconnectTimeout = setTimeout(() => {
          reconnectAttempts++;
          connectToElectron();
        }, delay);
      }
    });

    electronWs.on('error', (error) => {
      console.error('[Server] Electron connection error:', error.message);
    });
  } catch (error) {
    console.error('[Server] Failed to create WebSocket:', error);
  }
}

function startPing(): void {
  stopPing();
  pingInterval = setInterval(() => {
    if (electronWs && electronWs.readyState === WebSocket.OPEN) {
      electronWs.send(JSON.stringify({ type: 'PING', payload: {} }));
    }
  }, 15000);
}

function stopPing(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

function startMobilePing(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [clientId, client] of mobileClients) {
      if (now - client.lastActivity > 60000) {
        client.ws.close();
        mobileClients.delete(clientId);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'PING', payload: {} }));
      }
    }
  }, 30000);
}

function broadcastToMobile(msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const client of mobileClients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

function handleMobileMessage(clientId: string, msg: ClientMessage): void {
  const client = mobileClients.get(clientId);
  if (!client) return;

  client.lastActivity = Date.now();

  if (electronWs && electronWs.readyState === WebSocket.OPEN) {
    electronWs.send(JSON.stringify({ ...msg, clientId }));
  } else {
    client.ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'TV not connected' } }));
  }
}

function getMobileUI(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TV-OS Controller</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 20px; }
    h1 { font-size: 1.5rem; margin-bottom: 20px; }
    #status { padding: 8px 16px; border-radius: 20px; font-size: 0.875rem; margin-bottom: 20px; background: #22c55e; }
    #status.disconnected { background: #ef4444; }
    .controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
    button { width: 60px; height: 60px; border-radius: 12px; border: none; background: #1f1f1f; color: #fff; font-size: 1.5rem; cursor: pointer; }
    button:active { background: #3f3f3f; transform: scale(0.95); }
    .touchpad { width: 280px; height: 180px; background: #1a1a1a; border-radius: 12px; margin-bottom: 20px; touch-action: none; }
    .row { display: flex; gap: 10px; margin-bottom: 20px; }
    .row button { width: auto; height: auto; padding: 12px 24px; }
    #info { font-size: 0.75rem; color: #666; }
  </style>
</head>
<body>
  <h1>TV-OS Controller</h1>
  <div id="status">Connecting...</div>
  <div class="controls">
    <div></div><button id="up">▲</button><div></div>
    <button id="left">◀</button><button id="ok">OK</button><button id="right">▶</button>
    <div></div><button id="down">▼</button><div></div>
  </div>
  <div class="touchpad" id="touchpad"></div>
  <div class="row">
    <button id="back">BACK</button>
    <button id="keyboard">⌨</button>
  </div>
  <div id="info">TV: <span id="tvInfo">-</span></div>
  <script>
    const ws = new WebSocket('ws://' + location.host);
    const status = document.getElementById('status');
    const tvInfo = document.getElementById('tvInfo');

    ws.onopen = () => { status.textContent = 'Connected'; };
    ws.onclose = () => { status.textContent = 'Disconnected'; status.classList.add('disconnected'); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'CONNECTION_STATUS') {
        status.textContent = msg.payload.electronConnected ? 'TV Connected' : 'TV Disconnected';
        status.classList.toggle('disconnected', !msg.payload.electronConnected);
      }
      if (msg.type === 'TV_INFO') tvInfo.textContent = msg.payload.appName + ' / ' + msg.payload.screen;
    };

    const send = (type, payload = {}) => ws.send(JSON.stringify({ type, payload }));

    document.getElementById('up').onclick = () => send('NAVIGATION', { direction: 'up' });
    document.getElementById('down').onclick = () => send('NAVIGATION', { direction: 'down' });
    document.getElementById('left').onclick = () => send('NAVIGATION', { direction: 'left' });
    document.getElementById('right').onclick = () => send('NAVIGATION', { direction: 'right' });
    document.getElementById('ok').onclick = () => send('SELECT');
    document.getElementById('back').onclick = () => send('BACK');
    document.getElementById('keyboard').onclick = () => { const t = prompt('Text:'); if (t) send('TEXT_INPUT', { text: t }); };

    const tp = document.getElementById('touchpad'), sendTouch = (type, data) => send(type, data);
    let lx, ly;
    tp.ontouchstart = (e) => { lx = e.touches[0].clientX; ly = e.touches[0].clientY; sendTouch('TOUCH_START', { x: lx, y: ly }); };
    tp.ontouchmove = (e) => { const x = e.touches[0].clientX, y = e.touches[0].clientY; sendTouch('TOUCH_MOVE', { x, y, dx: x - lx, dy: y - ly }); lx = x; ly = y; };
    tp.ontouchend = () => sendTouch('TOUCH_END');
    tp.onmousedown = (e) => { lx = e.clientX; ly = e.clientY; sendTouch('TOUCH_START', { x: lx, y: ly }); };
    tp.onmousemove = (e) => { if (e.buttons === 1) { sendTouch('TOUCH_MOVE', { x: e.clientX, y: e.clientY, dx: e.clientX - lx, dy: e.clientY - ly }); lx = e.clientX; ly = e.clientY; } };
    tp.onmouseup = () => sendTouch('TOUCH_END');
  </script>
</body>
</html>`;
}

wss.on('connection', (ws: WebSocket) => {
  const clientId = `mobile_${Date.now()}`;
  mobileClients.set(clientId, { id: clientId, ws, lastActivity: Date.now() });

  console.log(`[Server] Client connected: ${clientId}`);
  ws.send(JSON.stringify({ type: 'TV_INFO', payload: { appName: 'TV-OS', screen: 'home' } }));
  ws.send(JSON.stringify({ type: 'CONNECTION_STATUS', payload: { electronConnected: electronWs?.readyState === WebSocket.OPEN, clientCount: mobileClients.size } }));

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', payload: {} }));
        return;
      }
      handleMobileMessage(clientId, msg);
    } catch (error) {
      console.error('[Server] Invalid message:', error);
    }
  });

  ws.on('close', () => {
    mobileClients.delete(clientId);
    broadcastToMobile({ type: 'CONNECTION_STATUS', payload: { clientCount: mobileClients.size } });
  });
});

app.get('/', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.send(getMobileUI()); });
app.get('/health', (_req, res) => res.json({ status: 'ok', electron: electronWs?.readyState === WebSocket.OPEN }));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  connectToElectron();
  startMobilePing();
});

process.on('SIGTERM', () => { electronWs?.close(); server.close(); process.exit(0); });
