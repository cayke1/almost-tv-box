# App Manager - BrowserView Integration

## Visão Geral

Implementar sistema de lançamento de apps usando BrowserView do Electron. Cada app externo (Netflix, YouTube, etc.) abre em sua própria BrowserView isolada, mantendo sessão e cookies separados.

---

## 1. Arquitetura

### Fluxo de Dados

```
User selects app → IPC: app:launch → Main process creates BrowserView
                                        ↓
                              BrowserView loads URL
                                        ↓
                              Renderer receives app-closed event
```

### Estrutura de Arquivos

```
src-electron/
├── main.ts                 # Entry point
├── services/
│   ├── app-manager.ts      # BrowserView lifecycle
│   └── ipc-handlers.ts     # IPC registration
src/
├── services/
│   └── useAppManager.ts    # React hook for app management
├── components/
│   ├── AppView.tsx         # App view container
│   └── AppLoading.tsx      # Loading state
├── screens/
│   └── HomeScreen.tsx      # Home with app grid
└── types/
    └── app-manager.ts      # Types
```

---

## 2. Tipos TypeScript

### src/types/app-manager.ts

```typescript
export interface AppConfig {
  id: string;
  name: string;
  icon: string;
  url: string;
  color: string;
  category: 'streaming' | 'browser' | 'settings';
}

export interface AppViewState {
  isOpen: boolean;
  currentApp: AppConfig | null;
  isLoading: boolean;
  error: string | null;
}

export interface AppManagerEvents {
  'app:launch': { appId: string };
  'app:close': void;
  'app:loading-change': { isLoading: boolean };
  'app:error': { message: string };
  'app:ready': void;
}

export interface BrowserViewConfig {
  webPreferences: {
    nodeIntegration: boolean;
    contextIsolation: boolean;
    partition: string;        // For cookie persistence
  };
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

---

## 3. App Manager Service (Main Process)

### src-electron/services/app-manager.ts

```typescript
import { BrowserView, screen, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import { appRegistry } from './app-registry';

interface AppViewInstance {
  view: BrowserView;
  appId: string;
}

export class AppManager {
  private views: Map<string, AppViewInstance> = new Map();
  private mainWindow: BrowserWindow;
  private activeViewId: string | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.handle('app:launch', async (_event, appId: string) => {
      await this.launchApp(appId);
    });

    ipcMain.handle('app:close-view', async () => {
      await this.closeActiveView();
    });

    ipcMain.handle('app:open-browser', async (_event, url: string) => {
      await this.launchBrowser(url);
    });
  }

  async launchApp(appId: string): Promise<void> {
    const appConfig = appRegistry.get(appId);
    if (!appConfig) {
      this.mainWindow.webContents.send('app:error', { 
        message: `App not found: ${appId}` 
      });
      return;
    }

    // Close existing view for this app if any
    if (this.views.has(appId)) {
      await this.closeView(appId);
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:${appId}`,  // Persistent cookies per app
        webviewTag: false,
      },
    });

    // Set view bounds (fullscreen)
    view.setBounds({
      x: 0,
      y: 0,
      width,
      height,
    });

    view.setAutoResize({ width: true, height: true });

    // Track loading state
    view.webContents.on('did-start-loading', () => {
      this.mainWindow.webContents.send('app:loading-change', { isLoading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      this.mainWindow.webContents.send('app:loading-change', { isLoading: false });
    });

    // Handle navigation
    view.webContents.on('did-navigate', (_event, url) => {
      console.log(`[AppManager] ${appId} navigated to:`, url);
    });

    // Handle errors
    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      this.mainWindow.webContents.send('app:error', { 
        message: errorDescription 
      });
    });

    // Store view reference
    this.views.set(appId, { view, appId });
    this.activeViewId = appId;

    // Add to main window
    this.mainWindow.addBrowserView(view);

    // Load URL
    await view.webContents.loadURL(appConfig.url);

    // Notify renderer
    this.mainWindow.webContents.send('app:launched', { appId });
  }

  async closeView(appId: string): Promise<void> {
    const instance = this.views.get(appId);
    if (!instance) return;

    this.mainWindow.removeBrowserView(instance.view);
    
    // Destroy the view
    instance.view.webContents.destroy();
    
    this.views.delete(appId);

    if (this.activeViewId === appId) {
      this.activeViewId = null;
    }
  }

  async closeActiveView(): Promise<void> {
    if (this.activeViewId) {
      await this.closeView(this.activeViewId);
      this.mainWindow.webContents.send('app:closed', {});
    }
  }

  async switchToView(appId: string): Promise<void> {
    const instance = this.views.get(appId);
    if (!instance) return;

    // Hide current active view
    if (this.activeViewId && this.activeViewId !== appId) {
      const current = this.views.get(this.activeViewId);
      if (current) {
        this.mainWindow.removeBrowserView(current.view);
      }
    }

    // Show target view
    this.mainWindow.addBrowserView(instance.view);
    this.activeViewId = appId;
  }

  async launchBrowser(url: string): Promise<void> {
    await this.launchApp('browser');
    
    const browserView = this.views.get('browser');
    if (browserView) {
      await browserView.view.webContents.loadURL(url);
    }
  }

  getView(appId: string): BrowserView | undefined {
    return this.views.get(appId)?.view;
  }

  getActiveViewId(): string | null {
    return this.activeViewId;
  }

  getAllViews(): string[] {
    return Array.from(this.views.keys());
  }

  destroy(): void {
    for (const [appId, instance] of this.views) {
      this.mainWindow.removeBrowserView(instance.view);
      instance.view.webContents.destroy();
    }
    this.views.clear();
    this.activeViewId = null;
  }
}
```

---

## 4. App Registry (Main Process)

### src-electron/services/app-registry.ts

```typescript
import type { AppConfig } from '../../src/types/app-manager';

interface AppRegistryData {
  apps: AppConfig[];
}

const defaultApps: AppRegistryData = {
  apps: [
    {
      id: 'netflix',
      name: 'Netflix',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23E50914"><path d="M... (Netflix logo path)</svg>',
      url: 'https://www.netflix.com',
      color: '#E50914',
      category: 'streaming',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF0000"><path d="M... (YouTube logo path)</svg>',
      url: 'https://www.youtube.com/tv',
      color: '#FF0000',
      category: 'streaming',
    },
    {
      id: 'prime',
      name: 'Prime Video',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2300A8E1"><path d="M... (Prime logo path)</svg>',
      url: 'https://www.primevideo.com',
      color: '#00A8E1',
      category: 'streaming',
    },
    {
      id: 'browser',
      name: 'Browser',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234A90D9"><path d="M... (Browser logo path)</svg>',
      url: '',
      color: '#4A90D9',
      category: 'browser',
    },
  ],
};

class AppRegistry {
  private apps: Map<string, AppConfig> = new Map();

  constructor() {
    this.loadApps(defaultApps);
  }

  private loadApps(data: AppRegistryData) {
    for (const app of data.apps) {
      this.apps.set(app.id, app);
    }
  }

  get(id: string): AppConfig | undefined {
    return this.apps.get(id);
  }

  getAll(): AppConfig[] {
    return Array.from(this.apps.values());
  }

  add(app: AppConfig): void {
    this.apps.set(app.id, app);
  }

  remove(id: string): void {
    this.apps.delete(id);
  }

  getByCategory(category: AppConfig['category']): AppConfig[] {
    return Array.from(this.apps.values()).filter(app => app.category === category);
  }
}

export const appRegistry = new AppRegistry();
```

---

## 5. IPC Handlers (Main Process)

### src-electron/services/ipc-handlers.ts

```typescript
import { ipcMain, app } from 'electron';
import os from 'os';
import { AppManager } from './app-manager';

let appManager: AppManager | null = null;

export function setupIpcHandlers(mainWindow: Electron.BrowserWindow) {
  // Initialize App Manager
  appManager = new AppManager(mainWindow);

  // App lifecycle
  ipcMain.handle('app:close', () => {
    app.quit();
  });

  ipcMain.handle('app:minimize', () => {
    mainWindow.minimize();
  });

  // Network
  ipcMain.handle('network:get-local-ip', () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  });

  // Mouse simulation
  ipcMain.handle('mouse:move', async (_event, dx: number, dy: number) => {
    mainWindow.webContents.send('mouse:move', { dx, dy });
  });

  ipcMain.handle('mouse:click', async (_event, button: 'left' | 'right') => {
    mainWindow.webContents.send('mouse:click', { button });
  });

  return appManager;
}

export function getAppManager(): AppManager | null {
  return appManager;
}
```

---

## 6. React Hook - useAppManager

### src/services/useAppManager.ts

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { AppConfig, AppViewState } from '../types/app-manager';

interface UseAppManagerReturn {
  state: AppViewState;
  launchApp: (appId: string) => Promise<void>;
  closeApp: () => Promise<void>;
  openBrowser: (url: string) => Promise<void>;
  apps: AppConfig[];
}

export function useAppManager(): UseAppManagerReturn {
  const [state, setState] = useState<AppViewState>({
    isOpen: false,
    currentApp: null,
    isLoading: false,
    error: null,
  });

  const [apps, setApps] = useState<AppConfig[]>([]);

  // Load apps from config
  useEffect(() => {
    // Could fetch from API or load from JSON
    setApps([
      { id: 'netflix', name: 'Netflix', url: 'https://netflix.com', icon: '', color: '#E50914', category: 'streaming' },
      { id: 'youtube', name: 'YouTube', url: 'https://youtube.com/tv', icon: '', color: '#FF0000', category: 'streaming' },
      { id: 'prime', name: 'Prime Video', url: 'https://primevideo.com', icon: '', color: '#00A8E1', category: 'streaming' },
      { id: 'browser', name: 'Browser', url: '', icon: '', color: '#4A90D9', category: 'browser' },
    ]);
  }, []);

  // Listen to IPC events
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleLoadingChange = ({ isLoading }: { isLoading: boolean }) => {
      setState(prev => ({ ...prev, isLoading }));
    };

    const handleError = ({ message }: { message: string }) => {
      setState(prev => ({ ...prev, error: message }));
    };

    const handleClosed = () => {
      setState({
        isOpen: false,
        currentApp: null,
        isLoading: false,
        error: null,
      });
    };

    const handleLaunched = ({ appId }: { appId: string }) => {
      const app = apps.find(a => a.id === appId);
      setState({
        isOpen: true,
        currentApp: app || null,
        isLoading: true,
        error: null,
      });
    };

    window.electronAPI.onAppLoadingChange?.(handleLoadingChange);
    window.electronAPI.onAppError?.(handleError);
    window.electronAPI.onAppClosed?.(handleClosed);
    window.electronAPI.onAppLaunched?.(handleLaunched);

    return () => {
      window.electronAPI.removeAllListeners?.('app:loading-change');
      window.electronAPI.removeAllListeners?.('app:error');
      window.electronAPI.removeAllListeners?.('app:closed');
      window.electronAPI.removeAllListeners?.('app:launched');
    };
  }, [apps]);

  const launchApp = useCallback(async (appId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    await window.electronAPI?.launchApp(appId);
  }, []);

  const closeApp = useCallback(async () => {
    await window.electronAPI?.closeAppView();
  }, []);

  const openBrowser = useCallback(async (url: string) => {
    await launchApp('browser');
    // Additional URL handling if needed
  }, [launchApp]);

  return {
    state,
    launchApp,
    closeApp,
    openBrowser,
    apps,
  };
}
```

---

## 7. AppView Component

### src/components/AppView.tsx

```tsx
import { useAppManager } from '../services/useAppManager';
import { AppLoading } from './AppLoading';
import { AppError } from './AppError';

export function AppView() {
  const { state, closeApp } = useAppManager();

  if (!state.isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Loading Overlay */}
      {state.isLoading && <AppLoading appName={state.currentApp?.name || ''} />}

      {/* Error Overlay */}
      {state.error && (
        <AppError 
          message={state.error} 
          onRetry={() => state.currentApp && launchApp(state.currentApp.id)}
          onClose={closeApp}
        />
      )}

      {/* BrowserView is rendered by Electron, not React */}
      {/* This component manages the loading/error states */}
    </div>
  );
}
```

---

## 8. Loading Component

### src/components/AppLoading.tsx

```tsx
interface AppLoadingProps {
  appName: string;
}

export function AppLoading({ appName }: AppLoadingProps) {
  return (
    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
      <div className="relative w-16 h-16">
        {/* Pulsing ring animation */}
        <div className="absolute inset-0 border-4 border-white/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-white rounded-full animate-spin" />
      </div>
      <p className="mt-4 text-white text-lg">Opening {appName}...</p>
    </div>
  );
}
```

---

## 9. Error Component

### src/components/AppError.tsx

```tsx
interface AppErrorProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

export function AppError({ message, onRetry, onClose }: AppErrorProps) {
  return (
    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
      <div className="text-center max-w-md">
        <div className="text-red-500 text-6xl mb-4">⚠</div>
        <h2 className="text-white text-2xl font-bold mb-2">Failed to Load</h2>
        <p className="text-gray-400 mb-8">{message}</p>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 10. Atualizações no Preload

Adicionar novos métodos ao preload.ts:

```typescript
// src-electron/preload.ts additions

// App events
onAppLoadingChange: (callback: (data: { isLoading: boolean }) => void) => {
  ipcRenderer.on('app:loading-change', (_event, data) => callback(data));
},
onAppError: (callback: (data: { message: string }) => void) => {
  ipcRenderer.on('app:error', (_event, data) => callback(data));
},
onAppClosed: (callback: () => void) => {
  ipcRenderer.on('app:closed', () => callback());
},
onAppLaunched: (callback: (data: { appId: string }) => void) => {
  ipcRenderer.on('app:launched', (_event, data) => callback(data));
},
```

---

## 11. Fluxo de Eventos

### Launch Sequence
```
1. User presses Enter on app card
2. React: launchApp(appId) called
3. IPC: app:launch event sent to main
4. Main: AppManager.launchApp() creates BrowserView
5. Main: BrowserView loads URL
6. Main: 'app:loading-change' sent with isLoading=true
7. Renderer: Loading overlay shown
8. BrowserView: 'did-stop-loading' fires
9. Main: 'app:loading-change' sent with isLoading=false
10. Renderer: Loading overlay hidden
```

### Close Sequence
```
1. User presses Escape OR back button
2. React: closeApp() called
3. IPC: app:close-view event sent
4. Main: AppManager.closeActiveView() removes BrowserView
5. Main: 'app:closed' event sent
6. Renderer: AppView unmounts, returns to home
```

---

## 12. Keyboard Navigation in BrowserViews

Para injetar navegação em apps externos, use:

```typescript
// In BrowserView's webContents
view.webContents.on('before-input-event', (event, input) => {
  // Forward TV remote keys to the webview
  if (input.type === 'keyDown') {
    // Map arrow keys, enter, escape
    view.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: mapKeyCode(input.key),
      modifiers: [],
    });
  }
});
```

---

## 13. Checklist de Implementação

- [ ] Criar AppManager class
- [ ] Implementar app-registry.ts
- [ ] Setup IPC handlers
- [ ] Atualizar preload.ts com novos eventos
- [ ] Criar useAppManager hook
- [ ] Implementar AppView component
- [ ] Criar AppLoading component
- [ ] Criar AppError component
- [ ] Testar launch de cada app
- [ ] Testar close com Escape
- [ ] Verificar persistência de cookies
- [ ] Adicionar error handling
- [ ] Testar loading states
