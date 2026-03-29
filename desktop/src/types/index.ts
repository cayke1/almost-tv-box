// ============================================
// SHARED TYPES - Used across the entire app
// ============================================

// App Configuration
export interface AppConfig {
  id: string;
  name: string;
  icon: string;
  url: string;
  color: string;
  category: 'streaming' | 'browser' | 'settings';
  externalPath?: string; // Path to external .exe or app
}

// App Manager
export interface AppViewState {
  isOpen: boolean;
  currentApp: AppConfig | null;
  isLoading: boolean;
  error: string | null;
}

export interface AppRegistry {
  apps: AppConfig[];
}

// Navigation & Focus
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface GridPosition {
  row: number;
  col: number;
}

export interface FocusableElement {
  id: string;
  position: GridPosition;
  rowSpan?: number;
  colSpan?: number;
  disabled?: boolean;
}

export interface FocusState {
  currentId: string | null;
  position: GridPosition;
  history: string[];
}

// WebSocket Protocol
export type ClientMessageType = 
  | 'NAVIGATION' 
  | 'SELECT' 
  | 'BACK' 
  | 'TEXT_INPUT' 
  | 'TOUCH_START' 
  | 'TOUCH_MOVE' 
  | 'TOUCH_END' 
  | 'SCROLL' 
  | 'MOUSE_MOVE' 
  | 'MOUSE_CLICK'
  | 'PING';

export type ServerMessageType = 
  | 'PONG' 
  | 'CONNECTION_STATUS' 
  | 'TV_INFO' 
  | 'ERROR';

export interface ClientMessage {
  type: ClientMessageType;
  payload: Record<string, unknown>;
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: Record<string, unknown>;
}

// Touchpad
export interface TouchEvent {
  type: 'TOUCH_START' | 'TOUCH_MOVE' | 'TOUCH_END' | 'TAP' | 'DOUBLE_TAP';
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  timestamp: number;
}

export interface TouchpadConfig {
  sensitivity: number;
  acceleration: number;
  smoothing: number;
  tapThreshold: number;
  doubleTapDelay: number;
}

export interface CursorPosition {
  x: number;
  y: number;
}

// UX
export type TransitionType = 
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'scale'
  | 'blur-fade';

export interface TransitionConfig {
  type: TransitionType;
  duration: number;
  easing: string;
}

export interface AnimationState {
  isEntering: boolean;
  isExiting: boolean;
  direction: 'forward' | 'backward';
}

export interface ScreensaverConfig {
  idleTimeout: number;
  animationDuration: number;
  particleCount: number;
}

export interface OnScreenKeyboardConfig {
  layout: 'qwerty' | 'abc' | 'numbers';
  showSuggestions: boolean;
  maxSuggestions: number;
}

// Electron API Types (exposed via preload)
export interface ElectronAPI {
  // App lifecycle
  closeApp: () => Promise<void>;
  minimizeApp: () => Promise<void>;
  
  // App manager
  launchApp: (appId: string) => Promise<void>;
  closeAppView: () => Promise<void>;
  
  // Network
  getLocalIP: () => Promise<string>;
  
  // Mouse simulation
  moveMouse: (dx: number, dy: number) => Promise<void>;
  clickMouse: (button: 'left' | 'right') => Promise<void>;
  
  // Event listeners
  onNavigate: (callback: (direction: Direction) => void) => void;
  onSelect: (callback: () => void) => void;
  onBack: (callback: () => void) => void;
  onTextInput: (callback: (text: string) => void) => void;
  onAppClosed: (callback: () => void) => void;
  
  // App-specific events
  onAppLoadingChange?: (callback: (data: { isLoading: boolean }) => void) => void;
  onAppError?: (callback: (data: { message: string }) => void) => void;
  onAppLaunched?: (callback: (data: { appId: string }) => void) => void;
  onServerReady?: (callback: (data: { ip: string; port: number }) => void) => void;
  onCursorMove?: (callback: (data: CursorPosition) => void) => void;
  onCursorClick?: (callback: (data: { button: 'left' | 'right' }) => void) => void;
  
  // Cleanup
  removeAllListeners: (channel: string) => void;
}

// Global window extension
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
