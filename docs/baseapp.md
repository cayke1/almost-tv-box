# Base App - Electron Smart TV Interface

## Visão Geral

Criar uma aplicação Electron de produção que funciona como interface de Smart TV (10-foot UI). Este é o foundation do projeto - sem ele, as outras fases não funcionam.

---

## 1. Estrutura de Diretórios

```
tv-os/
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # Preload script (IPC bridge)
│   └── services/
│       └── ipc-handlers.ts  # IPC event handlers
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root component
│   ├── index.css            # Global styles + Tailwind
│   ├── config/
│   │   └── apps.json        # App registry
│   ├── types/
│   │   └── index.ts         # Shared TypeScript types
│   ├── hooks/
│   │   └── useIpc.ts        # IPC communication hook
│   └── components/
│       └── AppCard.tsx      # App card component
└── public/
    └── index.html
```

---

## 2. Configuração do Projeto

### package.json (dependências essenciais)

```json
{
  "name": "tv-os",
  "version": "1.0.0",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "npm run build && electron-builder"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "concurrently": "^8.0.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vite-plugin-electron": "^0.28.0",
    "wait-on": "^7.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## 3. Electron Main Process

### src-electron/main.ts

```typescript
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,                    // Kiosk mode
    frame: false,                        // No window chrome
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a0a',
  });

  // Load the app
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers - register in src-electron/services/ipc-handlers.ts
```

---

## 4. Preload Script

### src-electron/preload.ts

```typescript
import { contextBridge, ipcRenderer } from 'electron';

// Define the API exposed to renderer
const electronAPI = {
  // App lifecycle
  closeApp: () => ipcRenderer.invoke('app:close'),
  minimizeApp: () => ipcRenderer.invoke('app:minimize'),
  
  // App manager
  launchApp: (appId: string) => ipcRenderer.invoke('app:launch', appId),
  closeAppView: () => ipcRenderer.invoke('app:close-view'),
  
  // Network info
  getLocalIP: () => ipcRenderer.invoke('network:get-local-ip'),
  
  // Mouse simulation (for touchpad)
  moveMouse: (dx: number, dy: number) => ipcRenderer.invoke('mouse:move', dx, dy),
  clickMouse: (button: 'left' | 'right') => ipcRenderer.invoke('mouse:click', button),
  
  // Events from main to renderer
  onNavigate: (callback: (direction: string) => void) => {
    ipcRenderer.on('navigate', (_event, direction) => callback(direction));
  },
  onSelect: (callback: () => void) => {
    ipcRenderer.on('select', () => callback());
  },
  onBack: (callback: () => void) => {
    ipcRenderer.on('back', () => callback());
  },
  onTextInput: (callback: (text: string) => void) => {
    ipcRenderer.on('text-input', (_event, text) => callback(text));
  },
  onAppClosed: (callback: () => void) => {
    ipcRenderer.on('app-closed', () => callback());
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
```

---

## 5. App Registry

### src/config/apps.json

```typescript
// Interfaces - src/types/index.ts
export interface AppConfig {
  id: string;
  name: string;
  icon: string;
  url: string;
  color: string;          // Accent color for card
  category: 'streaming' | 'browser' | 'settings';
}

export interface AppRegistry {
  apps: AppConfig[];
}
```

```json
{
  "apps": [
    {
      "id": "netflix",
      "name": "Netflix",
      "icon": "/icons/netflix.svg",
      "url": "https://www.netflix.com",
      "color": "#E50914",
      "category": "streaming"
    },
    {
      "id": "youtube",
      "name": "YouTube",
      "icon": "/icons/youtube.svg",
      "url": "https://www.youtube.com/tv",
      "color": "#FF0000",
      "category": "streaming"
    },
    {
      "id": "prime",
      "name": "Prime Video",
      "icon": "/icons/prime.svg",
      "url": "https://www.primevideo.com",
      "color": "#00A8E1",
      "category": "streaming"
    },
    {
      "id": "browser",
      "name": "Browser",
      "icon": "/icons/browser.svg",
      "url": "",
      "color": "#4A90D9",
      "category": "browser"
    }
  ]
}
```

---

## 6. Componentes React

### src/components/AppCard.tsx

```tsx
import { useRef, useEffect } from 'react';
import type { AppConfig } from '../types';

interface AppCardProps {
  app: AppConfig;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
}

export function AppCard({ app, isFocused, onSelect, onFocus }: AppCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={`
        relative w-64 h-40 rounded-xl overflow-hidden cursor-pointer
        transition-all duration-200 ease-out
        ${isFocused 
          ? 'scale-110 ring-4 ring-white/50 shadow-2xl z-10' 
          : 'scale-100 opacity-80 hover:opacity-100'
        }
      `}
      style={{ 
        backgroundColor: app.color,
        boxShadow: isFocused ? `0 0 40px ${app.color}40` : 'none'
      }}
    >
      {/* App Icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img 
          src={app.icon} 
          alt={app.name}
          className="w-20 h-20 object-contain"
          loading="lazy"
        />
      </div>
      
      {/* App Name */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-white font-semibold text-lg">
          {app.name}
        </span>
      </div>
    </div>
  );
}
```

---

## 7. Estado Global da Aplicação

### src/types/index.ts (complemento)

```typescript
export interface AppState {
  currentScreen: 'home' | 'app-view';
  activeApp: AppConfig | null;
  recentlyOpened: string[];           // App IDs
  focusState: FocusState;
}

export interface FocusState {
  currentAppId: string | null;
  gridPosition: { row: number; col: number };
  lastFocusedPerScreen: Record<string, string | null>;
}

export interface IpcChannels {
  // Renderer -> Main
  'app:launch': (appId: string) => Promise<void>;
  'app:close-view': () => Promise<void>;
  'mouse:move': (dx: number, dy: number) => Promise<void>;
  'mouse:click': (button: 'left' | 'right') => Promise<void>;
  
  // Main -> Renderer (events)
  'navigate': (direction: 'up' | 'down' | 'left' | 'right') => void;
  'select': () => void;
  'back': () => void;
  'text-input': (text: string) => void;
}
```

---

## 8. Regras de Negócio

### Kiosk Mode
- A aplicação deve iniciar em fullscreen automaticamente
- Não deve haver nenhuma borda ou barra de título do Windows
- Tecla F11 ou similares não devem sair do modo fullscreen

### Lazy Loading
- Ícones de apps devem ser carregados sob demanda
- Apps só devem ser inicializados quando o usuário interage com eles

### Keyboard Navigation
- Arrow keys movem o foco entre apps
- Enter abre o app selecionado
- Escape volta para a home ou fecha app view

---

## 9. Checklist de Implementação

- [ ] Inicializar projeto com Vite + React + TypeScript
- [ ] Configurar TailwindCSS com tema escuro
- [ ] Criar estrutura de diretórios
- [ ] Implementar main.ts com kiosk mode
- [ ] Criar preload.ts com API bridge
- [ ] Definir types compartilhados
- [ ] Criar app registry (apps.json)
- [ ] Implementar AppCard component
- [ ] Implementar App.tsx com grid de apps
- [ ] Adicionar animações CSS (focus scale, glow)
- [ ] Testar navegação por teclado
- [ ] Build de produção funcionando
