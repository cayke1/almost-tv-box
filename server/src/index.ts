import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import Bonjour from 'bonjour-service';

const bonjour = new Bonjour();

dotenv.config();

const PORT = parseInt(process.env.PORT || '8080', 10);
const TV_POLL_TIMEOUT_MS = 10000; // TV considered disconnected after 10s without poll
const LONG_POLL_TIMEOUT_MS = 30000; // Max time to hold a poll request

interface ClientMessage {
  type: string;
  payload: Record<string, unknown>;
  clientId?: string;
  timestamp?: number;
}

const messageQueue: Array<ClientMessage> = [];
const clientLastPoll: Map<string, number> = new Map();
const messageEmitter = new EventEmitter();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);

function addToQueue(msg: ClientMessage): void {
  msg.timestamp = Date.now();
  messageQueue.push(msg);
  
  // Keep queue size manageable
  const maxQueueSize = 100;
  if (messageQueue.length > maxQueueSize) {
    messageQueue.shift();
  }
  
  // Signal that a new message is available
  messageEmitter.emit('new_message');
}

function handleMobileMessage(clientId: string, msg: { type: string; payload: Record<string, unknown> }): void {
  console.log(`[Server] Received command from ${clientId}: ${msg.type}`);
  addToQueue({ ...msg, clientId });
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
    const clientId = 'mobile_' + Math.random().toString(36).substr(2, 9);
    const status = document.getElementById('tvInfo');
    const statusEl = document.getElementById('status');
    let lastMsgIndex = 0;

    async function poll() {
      try {
        const res = await fetch('/api/poll?clientId=' + clientId + '&index=' + lastMsgIndex);
        const data = await res.json();
        
        statusEl.textContent = data.electronConnected ? 'TV Connected' : 'TV Offline';
        statusEl.classList.toggle('disconnected', !data.electronConnected);

        if (data.messages && data.messages.length > 0) {
          data.messages.forEach(msg => {
            lastMsgIndex++;
            if (msg.type === 'TV_INFO') status.textContent = msg.payload.appName + ' / ' + msg.payload.screen;
          });
        }
        // Immediate re-poll for long-polling responsiveness
        poll();
      } catch (e) {
        console.error('Poll error:', e);
        setTimeout(poll, 2000); // Wait bit longer on error
      }
    }

    poll();

    const send = (type, payload = {}) => fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, type, payload })
    });

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

app.get('/', (_req, res) => { 
  res.setHeader('Content-Type', 'text/html'); 
  res.send(getMobileUI()); 
});

app.post('/api/command', (req, res) => {
  const { clientId, type, payload } = req.body;
  if (!clientId || !type) {
    res.status(400).json({ error: 'Missing clientId or type' });
    return;
  }
  handleMobileMessage(clientId, { type, payload: payload || {} });
  res.json({ success: true });
});

app.get('/api/poll', async (req, res) => {
  const clientId = (req.query.clientId as string) || 'television';
  const index = parseInt(req.query.index as string || '0', 10);
  
  clientLastPoll.set(clientId, Date.now());

  // Function to get current response data
  const getResponseData = () => {
    const messages = messageQueue.slice(index);
    const lastTVPoll = clientLastPoll.get('television') || 0;
    const electronConnected = (Date.now() - lastTVPoll) < TV_POLL_TIMEOUT_MS;
    return { messages, electronConnected };
  };

  // If we have messages, return immediately
  let data = getResponseData();
  if (data.messages.length > 0) {
    return res.json(data);
  }

  // Otherwise, wait for a new message or timeout
  const onNewMessage = () => {
    // Clear timeout and listeners when we get a message
    clearTimeout(timeoutHandle);
    messageEmitter.off('new_message', onNewMessage);
    res.json(getResponseData());
  };

  const timeoutHandle = setTimeout(() => {
    messageEmitter.off('new_message', onNewMessage);
    res.json(getResponseData());
  }, LONG_POLL_TIMEOUT_MS);

  messageEmitter.once('new_message', onNewMessage);
});

app.get('/api/status', (_req, res) => {
  const lastTVPoll = clientLastPoll.get('television') || 0;
  res.json({ 
    electronConnected: (Date.now() - lastTVPoll) < TV_POLL_TIMEOUT_MS,
    clientCount: clientLastPoll.size
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Mode: Optimized Long-Polling (Near-Instant Response)`);
  
  // Announce service for mDNS discovery
  bonjour.publish({ name: 'TV-OS-Server', type: 'http', port: PORT });
  console.log(`[Server] mDNS Service 'TV-OS-Server' published on port ${PORT}`);
});

process.on('SIGTERM', () => { 
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    server.close(); 
    process.exit(0); 
  });
});

process.on('SIGINT', () => {
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    server.close();
    process.exit(0);
  });
});
