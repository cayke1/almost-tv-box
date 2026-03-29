import { BrowserView, screen, BrowserWindow, shell, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { appRegistry } from './app-registry';

const STREMIO_PATHS = [
  'C:\\Program Files\\Stremio\\stremio.exe',
  'C:\\Program Files (x86)\\Stremio\\stremio.exe',
  'C:\\Program Files (x86)\\Stremio\\Stremio.exe',
  path.join(app.getPath('home'), 'AppData', 'Local', 'Programs', 'stremio', 'Stremio.exe'),
  path.join(app.getPath('home'), 'AppData', 'Roaming', 'Stremio', 'stremio.exe'),
  // Shortcuts
  path.join(app.getPath('home'), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Stremio.lnk'),
  path.join(app.getPath('home'), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Stremio', 'Stremio.lnk'),
];

function findExecutable(possiblePaths: string[]): string | null {
  for (const p of possiblePaths) {
    console.log('[AppManager] Checking path:', p, 'exists:', fs.existsSync(p));
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function resolveShortcut(lnkPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const ps = `($sh=New-Object -ComObject WScript.Shell; $s=$sh.CreateShortcut('${lnkPath}'); Write-Output $s.TargetPath)`;
    exec(`powershell -Command "${ps}"`, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

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
  }

  async launchApp(appId: string): Promise<void> {
    const appConfig = appRegistry.get(appId);
    if (!appConfig) {
      console.error('[AppManager] App not found:', appId);
      this.mainWindow.webContents.send('app:error', { 
        message: `App not found: ${appId}` 
      });
      return;
    }

    console.log('[AppManager] Launching app:', appId, appConfig.url);

    // Check for external app
    if (appConfig.externalPath) {
      const execPath = appConfig.externalPath === 'auto' 
        ? findExecutable(STREMIO_PATHS)
        : appConfig.externalPath;
      
      if (!execPath) {
        this.mainWindow.webContents.send('app:error', { 
          message: `App not found: ${appConfig.name}` 
        });
        return;
      }

      console.log('[AppManager] Opening external app:', execPath);
      try {
        // Check if it's a shortcut (.lnk)
        if (execPath.endsWith('.lnk')) {
          const resolved = await resolveShortcut(execPath);
          if (resolved && fs.existsSync(resolved)) {
            console.log('[AppManager] Resolved shortcut to:', resolved);
            execPath = resolved;
          } else {
            this.mainWindow.webContents.send('app:error', { 
              message: `Could not resolve shortcut: ${execPath}` 
            });
            return;
          }
        }
        await shell.openPath(execPath);
        this.mainWindow.webContents.send('app:launched', { appId });
        return;
      } catch (error) {
        console.error('[AppManager] Failed to open external app:', error);
        this.mainWindow.webContents.send('app:error', { 
          message: `Failed to open: ${execPath}` 
        });
        return;
      }
    }

    // Close all existing views first
    await this.closeAllViews();

    if (!appConfig.url) {
      console.error('[AppManager] No URL for app:', appId);
      this.mainWindow.webContents.send('app:error', { 
        message: `No URL configured for: ${appId}` 
      });
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:${appId}`,
        webviewTag: false,
      },
    });

    if (appConfig.userAgent) {
      view.webContents.setUserAgent(appConfig.userAgent);
    }

    view.setBounds({
      x: 0,
      y: 0,
      width,
      height,
    });

    view.setAutoResize({ width: true, height: true });

    // Capture keyboard events from BrowserView
    view.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        console.log('[AppManager] ESC pressed in BrowserView, closing...');
        this.closeAllViews().then(() => {
          this.mainWindow.webContents.send('app-closed');
        });
      }
    });

    view.webContents.on('did-start-loading', () => {
      this.mainWindow.webContents.send('app:loading-change', { isLoading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      this.mainWindow.webContents.send('app:loading-change', { isLoading: false });
    });

    view.webContents.on('did-navigate', (_event, url) => {
      console.log(`[AppManager] ${appId} navigated to:`, url);
    });

    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[AppManager] Failed to load:', errorCode, errorDescription, validatedURL);
      if (errorCode === -2) {
        console.log('[AppManager] Retrying load...');
        setTimeout(() => view.webContents.loadURL(appConfig.url), 1000);
      } else {
        this.mainWindow.webContents.send('app:error', { 
          message: errorDescription 
        });
      }
    });

    view.webContents.on('crashed', () => {
      console.error('[AppManager] BrowserView crashed');
    });

    view.webContents.on('render-process-gone', (_event, details) => {
      console.error('[AppManager] Render process gone:', details.reason);
    });

    this.views.set(appId, { view, appId });
    this.activeViewId = appId;

    this.mainWindow.addBrowserView(view);

    try {
      await view.webContents.loadURL(appConfig.url);
      this.mainWindow.webContents.send('app:launched', { appId });
    } catch (error) {
      console.error('[AppManager] Error loading URL:', error);
    }
  }

  async closeAllViews(): Promise<void> {
    for (const [appId, instance] of this.views) {
      try {
        this.mainWindow.removeBrowserView(instance.view);
        instance.view.webContents.destroy();
      } catch (e) {
        console.error('[AppManager] Error closing view:', appId, e);
      }
    }
    this.views.clear();
    this.activeViewId = null;
  }

  async closeView(appId: string): Promise<void> {
    const instance = this.views.get(appId);
    if (!instance) return;

    this.mainWindow.removeBrowserView(instance.view);
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

    if (this.activeViewId && this.activeViewId !== appId) {
      const current = this.views.get(this.activeViewId);
      if (current) {
        this.mainWindow.removeBrowserView(current.view);
      }
    }

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
