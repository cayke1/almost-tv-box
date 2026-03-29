import { WebSocket, WebSocketServer } from 'ws';
import { ipcMain, BrowserWindow } from 'electron';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

interface MobileClient {
  id: string;
  ws: WebSocket;
  lastActivity: number;
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
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

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
    if (req.url === '/' || req.url === '/mobile') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getMobileUI());
      return;
    }

    if (req.url?.startsWith('/static/')) {
      const filePath = req.url.slice(9);
      this.serveStaticFile(filePath, res);
      return;
    }

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
    
    const fileContent = fs.readFileSync(path.join(__dirname, '../../src/mobile', filePath));
    res.end(fileContent);
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

    this.broadcastConnectionStatus();

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
      const message = JSON.parse(data.toString()) as ClientMessage;
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
        if (now - client.lastActivity > 5 * 60 * 1000) {
          client.ws.close();
          this.clients.delete(clientId);
          continue;
        }

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
