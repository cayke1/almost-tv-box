import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  closeApp: () => ipcRenderer.invoke('app:close'),
  minimizeApp: () => ipcRenderer.invoke('app:minimize'),
  
  launchApp: (appId: string) => ipcRenderer.invoke('app:launch', appId),
  closeAppView: () => ipcRenderer.invoke('app:close-view'),
  
  getLocalIP: () => ipcRenderer.invoke('network:get-local-ip'),
  
  moveMouse: (dx: number, dy: number) => ipcRenderer.invoke('mouse:move', dx, dy),
  clickMouse: (button: 'left' | 'right') => ipcRenderer.invoke('mouse:click', button),
  
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
  onAppLoadingChange: (callback: (data: { isLoading: boolean }) => void) => {
    ipcRenderer.on('app:loading-change', (_event, data) => callback(data));
  },
  onAppError: (callback: (data: { message: string }) => void) => {
    ipcRenderer.on('app:error', (_event, data) => callback(data));
  },
  onAppLaunched: (callback: (data: { appId: string }) => void) => {
    ipcRenderer.on('app:launched', (_event, data) => callback(data));
  },
  onServerReady: (callback: (data: { ip: string; port: number }) => void) => {
    ipcRenderer.on('server:ready', (_event, data) => callback(data));
  },
  onCursorMove: (callback: (data: { x: number; y: number }) => void) => {
    ipcRenderer.on('cursor:move', (_event, data) => callback(data));
  },
  onCursorClick: (callback: (data: { button: 'left' | 'right' }) => void) => {
    ipcRenderer.on('cursor:click', (_event, data) => callback(data));
  },
  
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
