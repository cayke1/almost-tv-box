import { ipcMain, screen, BrowserWindow } from 'electron';
import { CursorManager } from './cursor-manager';

export class TouchpadHandler {
  private cursorManager: CursorManager;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.cursorManager = new CursorManager();
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    ipcMain.on('mouse:move', (_event, dx: number, dy: number) => {
      this.handleMouseMove(dx, dy);
    });

    ipcMain.on('mouse:click', (_event, button: 'left' | 'right') => {
      this.handleMouseClick(button);
    });

    ipcMain.on('mouse:drag-start', () => {
      this.cursorManager.startDrag();
    });

    ipcMain.on('mouse:drag-end', () => {
      this.cursorManager.endDrag();
    });
  }

  private handleMouseMove(dx: number, dy: number) {
    const { x, y } = this.cursorManager.calculateNewPosition(dx, dy);
    
    const display = screen.getPrimaryDisplay();
    const clampedX = Math.max(0, Math.min(display.workAreaSize.width, x));
    const clampedY = Math.max(0, Math.min(display.workAreaSize.height, y));

    this.mainWindow.webContents.send('cursor:move', { x: clampedX, y: clampedY });
  }

  private handleMouseClick(button: 'left' | 'right') {
    this.mainWindow.webContents.send('cursor:click', { button });
  }
}
