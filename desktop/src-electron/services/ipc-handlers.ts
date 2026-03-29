import { ipcMain, app } from 'electron';
import os from 'os';
import { AppManager } from './app-manager';

let appManager: AppManager | null = null;

export function setupIpcHandlers(mainWindow: Electron.BrowserWindow) {
  appManager = new AppManager(mainWindow);

  ipcMain.handle('app:launch', async (_event, appId: string) => {
    console.log('[IPC] Launching app:', appId);
    await appManager?.launchApp(appId);
  });

  ipcMain.handle('app:close-view', async () => {
    console.log('[IPC] Closing app view');
    await appManager?.closeAllViews();
    mainWindow.webContents.send('app-closed');
  });

  ipcMain.handle('app:close', () => {
    app.quit();
  });

  ipcMain.handle('app:minimize', () => {
    mainWindow.minimize();
  });

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
