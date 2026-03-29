# UX Enhancements

## Visão Geral

Elevar a experiência do usuário para nível de produto premium (Apple TV / Android TV). Foco em animações suaves, feedback visual, e polish geral.

---

## 1. Estrutura de Arquivos

```
src/
├── animations/
│   ├── transitions.ts       # Screen transition animations
│   ├── focus-animations.ts  # Focus-related animations
│   └── useAnimation.ts       # Animation hook
├── components/
│   ├── ScreenContainer.tsx   # Animated screen wrapper
│   ├── OnScreenKeyboard.tsx  # Keyboard component
│   ├── Screensaver.tsx       # Idle screensaver
│   └── RecentlyOpened.tsx   # Recently opened apps row
├── hooks/
│   ├── useIdleTimer.ts      # Idle detection
│   ├── useRecentlyOpened.ts # Track recently opened
│   └── useTransition.ts     # Transition management
└── styles/
    └── animations.css       # CSS animation definitions
```

---

## 2. Tipos TypeScript

### src/types/ux.ts

```typescript
export type TransitionType = 
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'scale'
  | 'blur-fade';

export interface TransitionConfig {
  type: TransitionType;
  duration: number;       // ms
  easing: string;         // CSS easing
}

export interface AnimationState {
  isEntering: boolean;
  isExiting: boolean;
  direction: 'forward' | 'backward';
}

export interface ScreensaverConfig {
  idleTimeout: number;     // ms before activating
  animationDuration: number;
  particleCount: number;
}

export interface OnScreenKeyboardConfig {
  layout: 'qwerty' | 'abc' | 'numbers';
  showSuggestions: boolean;
  maxSuggestions: number;
}
```

---

## 3. Hooks de Animação

### src/hooks/useTransition.ts

```typescript
import { useState, useCallback, useRef } from 'react';
import type { TransitionType, AnimationState } from '../types/ux';

interface UseTransitionOptions {
  duration?: number;
  type?: TransitionType;
  onMidpoint?: () => void;  // Called when animation is 50% complete
}

export function useTransition(options: UseTransitionOptions = {}) {
  const { duration = 300, type = 'fade', onMidpoint } = options;
  
  const [state, setState] = useState<AnimationState>({
    isEntering: true,
    isExiting: false,
    direction: 'forward',
  });

  const [isAnimating, setIsAnimating] = useState(false);
  const midpointCalled = useRef(false);

  const startTransition = useCallback((direction: 'forward' | 'backward' = 'forward') => {
    setIsAnimating(true);
    midpointCalled.current = false;
    
    setState({
      isEntering: true,
      isExiting: false,
      direction,
    });

    // Call midpoint callback
    setTimeout(() => {
      if (!midpointCalled.current) {
        midpointCalled.current = true;
        onMidpoint?.();
      }
    }, duration / 2);

    // Complete animation
    setTimeout(() => {
      setState(prev => ({ ...prev, isEntering: false }));
      setIsAnimating(false);
    }, duration);
  }, [duration, onMidpoint]);

  const exitTransition = useCallback((callback?: () => void) => {
    setIsAnimating(true);
    
    setState(prev => ({ ...prev, isExiting: true }));

    setTimeout(() => {
      callback?.();
      setState({
        isEntering: true,
        isExiting: false,
        direction: 'forward',
      });
      setIsAnimating(false);
    }, duration);
  }, [duration]);

  const getTransitionStyle = useCallback(() => {
    const base: React.CSSProperties = {
      transitionDuration: `${duration}ms`,
      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    };

    switch (type) {
      case 'fade':
        return {
          ...base,
          opacity: state.isExiting ? 0 : 1,
        };
      
      case 'slide-left':
        return {
          ...base,
          transform: state.isExiting 
            ? 'translateX(-100%)' 
            : state.isEntering && direction === 'forward'
              ? 'translateX(100%)'
              : 'translateX(0)',
        };
      
      case 'scale':
        return {
          ...base,
          opacity: state.isExiting ? 0 : 1,
          transform: state.isExiting 
            ? 'scale(0.9)' 
            : state.isEntering 
              ? 'scale(1.05)' 
              : 'scale(1)',
        };
      
      default:
        return base;
    }
  }, [type, duration, state, direction]);

  return {
    state,
    isAnimating,
    startTransition,
    exitTransition,
    getTransitionStyle,
  };
}
```

---

## 4. Screen Container

### src/components/ScreenContainer.tsx

```typescript
import { ReactNode, useEffect } from 'react';
import { useTransition } from '../hooks/useTransition';
import type { TransitionType } from '../types/ux';

interface ScreenContainerProps {
  children: ReactNode;
  transitionType?: TransitionType;
  duration?: number;
  className?: string;
}

export function ScreenContainer({
  children,
  transitionType = 'fade',
  duration = 300,
  className = '',
}: ScreenContainerProps) {
  const { state, getTransitionStyle } = useTransition({ 
    type: transitionType, 
    duration 
  });

  return (
    <div
      className={`screen-container ${className}`}
      style={getTransitionStyle()}
      data-transition-state={state.isEntering ? 'enter' : 'idle'}
    >
      {children}
      
      <style>{`
        .screen-container {
          will-change: transform, opacity;
        }
        
        .screen-container[data-transition-state="enter"] {
          animation: screenEnter ${duration}ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        @keyframes screenEnter {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
```

---

## 5. App Launch Animation

### src/components/AppCard.tsx (com animação)

```tsx
import { useState, useRef } from 'react';
import type { AppConfig } from '../types';
import { launchApp } from '../services/useAppManager';

interface AppCardProps {
  app: AppConfig;
  isFocused: boolean;
  onFocus: () => void;
}

export function AppCard({ app, isFocused, onFocus }: AppCardProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleSelect = async () => {
    if (isLaunching) return;
    
    setIsLaunching(true);
    
    // Animate card before launch
    cardRef.current?.classList.add('app-launching');
    
    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Launch the app
    await launchApp(app.id);
    
    // Reset state after navigation
    setTimeout(() => setIsLaunching(false), 500);
  };

  return (
    <div
      ref={cardRef}
      className={`
        relative w-64 h-40 rounded-xl overflow-hidden cursor-pointer
        transition-all duration-200 ease-out
        ${isFocused ? 'scale-110 z-10' : 'scale-100'}
        ${isLaunching ? 'launching' : ''}
      `}
      style={{ backgroundColor: app.color }}
      onClick={handleSelect}
      onMouseEnter={onFocus}
      tabIndex={0}
      onFocus={onFocus}
    >
      {/* Glow effect when focused */}
      {isFocused && (
        <div 
          className="absolute inset-0 rounded-xl"
          style={{
            boxShadow: `0 0 40px ${app.color}`,
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex items-center justify-center">
        <img 
          src={app.icon} 
          alt={app.name}
          className="w-20 h-20 object-contain"
        />
      </div>

      {/* App name */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-white font-semibold text-lg">{app.name}</span>
      </div>

      <style>{`
        .app-launching {
          animation: appLaunch 300ms ease-out forwards;
        }
        
        @keyframes appLaunch {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(0); opacity: 0; }
        }
        
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
```

---

## 6. Background Blur

### src/components/BackgroundBlur.tsx

```tsx
import { useEffect, useState } from 'react';

interface BackgroundBlurProps {
  active: boolean;
  children?: React.ReactNode;
}

export function BackgroundBlur({ active, children }: BackgroundBlurProps) {
  const [shouldBlur, setShouldBlur] = useState(false);

  useEffect(() => {
    if (active) {
      setShouldBlur(true);
    } else {
      // Delay removal for smooth transition
      const timeout = setTimeout(() => setShouldBlur(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [active]);

  return (
    <div
      className={`
        fixed inset-0 z-40 transition-all duration-300
        ${shouldBlur ? 'bg-black/60 backdrop-blur-md' : 'bg-transparent'}
      `}
    >
      {children}
    </div>
  );
}
```

---

## 7. Recently Opened Apps

### src/hooks/useRecentlyOpened.ts

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '../types';

const STORAGE_KEY = 'recently_opened';
const MAX_RECENT = 5;

export function useRecentlyOpened() {
  const [recentApps, setRecentApps] = useState<AppConfig[]>([]);

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setRecentApps(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recently opened:', e);
      }
    }
  }, []);

  const addToRecent = useCallback((app: AppConfig) => {
    setRecentApps(prev => {
      // Remove if already exists
      const filtered = prev.filter(a => a.id !== app.id);
      // Add to front
      const updated = [app, ...filtered].slice(0, MAX_RECENT);
      // Persist
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentApps([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    recentApps,
    addToRecent,
    clearRecent,
  };
}
```

### src/components/RecentlyOpened.tsx

```tsx
import { AppCard } from './AppCard';
import { useRecentlyOpened } from '../hooks/useRecentlyOpened';

export function RecentlyOpened() {
  const { recentApps } = useRecentlyOpened();

  if (recentApps.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-white/60 text-sm font-medium mb-4 uppercase tracking-wider">
        Recently Opened
      </h2>
      
      <div className="flex gap-4 overflow-x-auto pb-4">
        {recentApps.map(app => (
          <div key={app.id} className="flex-shrink-0">
            <AppCard
              app={app}
              isFocused={false}
              onFocus={() => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 8. On-Screen Keyboard

### src/components/OnScreenKeyboard.tsx

```typescript
import { useState, useCallback, useEffect } from 'react';

interface OnScreenKeyboardProps {
  onTextChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onClose: () => void;
  initialValue?: string;
}

const KEYBOARD_LAYOUTS = {
  qwerty: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  numbers: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ],
};

export function OnScreenKeyboard({
  onTextChange,
  onSubmit,
  onClose,
  initialValue = '',
}: OnScreenKeyboardProps) {
  const [text, setText] = useState(initialValue);
  const [layout, setLayout] = useState<'qwerty' | 'numbers'>('qwerty');
  const [isShifted, setIsShifted] = useState(false);
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedKey, setFocusedKey] = useState(0);

  const currentLayout = KEYBOARD_LAYOUTS[layout];

  const handleKeyPress = useCallback((key: string) => {
    let newText = text;
    
    if (key === 'space') {
      newText = text + ' ';
    } else if (key === 'backspace') {
      newText = text.slice(0, -1);
    } else if (key === 'shift') {
      setIsShifted(s => !s);
      return;
    } else if (key === '123') {
      setLayout(l => l === 'qwerty' ? 'numbers' : 'qwerty');
      return;
    } else if (key === 'enter') {
      onSubmit(text);
      return;
    } else {
      newText = text + (isShifted ? key.toUpperCase() : key);
    }

    setText(newText);
    onTextChange(newText);
  }, [text, isShifted, onTextChange, onSubmit]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const rows = currentLayout.length;
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setFocusedRow(r => Math.max(0, r - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedRow(r => Math.min(rows - 1, r + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedKey(k => Math.max(0, k - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusedKey(k => Math.min(currentLayout[focusedRow].length - 1, k + 1));
          break;
        case 'Enter':
          e.preventDefault();
          handleKeyPress(currentLayout[focusedRow][focusedKey]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentLayout, focusedRow, focusedKey, handleKeyPress, onClose]);

  return (
    <div className="fixed inset-x-0 bottom-0 bg-gray-900/95 backdrop-blur-lg p-4 z-50">
      {/* Text display */}
      <div className="mb-4 px-4 py-3 bg-black/50 rounded-lg">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTextChange(e.target.value);
          }}
          className="w-full bg-transparent text-white text-xl outline-none"
          placeholder="Type here..."
          autoFocus
        />
      </div>

      {/* Keyboard */}
      <div className="max-w-2xl mx-auto">
        {currentLayout.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-2 mb-2">
            {rowIndex === 2 && (
              <button
                onClick={() => handleKeyPress('shift')}
                className={`px-4 py-3 rounded-lg text-white font-medium
                  ${isShifted ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                Shift
              </button>
            )}
            
            {row.map((key, keyIndex) => (
              <button
                key={keyIndex}
                onClick={() => handleKeyPress(key)}
                className={`
                  w-10 h-12 rounded-lg text-lg font-medium transition-all
                  ${isFocused(rowIndex, keyIndex)
                    ? 'bg-blue-600 scale-110 ring-2 ring-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                  }
                `}
              >
                {isShifted ? key.toUpperCase() : key}
              </button>
            ))}

            {rowIndex === 2 && (
              <button
                onClick={() => handleKeyPress('backspace')}
                className="px-4 py-3 rounded-lg bg-gray-700 text-white"
              >
                ⌫
              </button>
            )}
          </div>
        ))}

        {/* Bottom row */}
        <div className="flex justify-center gap-2 mt-2">
          <button
            onClick={() => setLayout(l => l === 'qwerty' ? 'numbers' : 'qwerty')}
            className="px-6 py-3 rounded-lg bg-gray-700 text-white font-medium"
          >
            {layout === 'qwerty' ? '123' : 'ABC'}
          </button>
          
          <button
            onClick={() => handleKeyPress('space')}
            className="px-12 py-3 rounded-lg bg-gray-700 text-white"
          >
            space
          </button>
          
          <button
            onClick={() => handleKeyPress('enter')}
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium"
          >
            Done
          </button>
        </div>
      </div>

      {/* Close hint */}
      <div className="absolute top-2 right-4 text-gray-500 text-sm">
        Press ESC to close
      </div>
    </div>
  );
}

function isFocused(row: number, key: number): boolean {
  return false; // Simplified - would need state management
}
```

---

## 9. Screensaver

### src/hooks/useIdleTimer.ts

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeout: number;         // ms before considered idle
  onIdle: () => void;      // Called when user becomes idle
  onActive: () => void;   // Called when user returns
  events?: string[];       // Events to listen for
}

export function useIdleTimer({
  timeout,
  onIdle,
  onActive,
  events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'],
}: UseIdleTimerOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (isIdle) {
      setIsIdle(false);
      onActive();
    }

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
      onIdle();
    }, timeout);
  }, [isIdle, timeout, onIdle, onActive]);

  useEffect(() => {
    // Start timer
    resetTimer();

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(timeoutRef.current);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [resetTimer, events]);

  return { isIdle, lastActivity: lastActivityRef.current };
}
```

### src/components/Screensaver.tsx

```typescript
import { useEffect, useState, useRef } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface ScreensaverProps {
  idleTimeout?: number;  // ms
  onExit?: () => void;
}

export function Screensaver({ idleTimeout = 300000, onExit }: ScreensaverProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const { isIdle } = useIdleTimer({
    timeout: idleTimeout,
    onIdle: () => {}, // Already showing
    onActive: () => onExit?.(),
  });

  useEffect(() => {
    if (!isIdle) return;

    // Initialize particles
    const initialParticles: Particle[] = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    }));

    setParticles(initialParticles);

    // Animation loop
    const animate = () => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: (p.x + p.vx + window.innerWidth) % window.innerWidth,
        y: (p.y + p.vy + window.innerHeight) % window.innerHeight,
      })));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isIdle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
      ctx.fill();
    });
  }, [particles]);

  if (!isIdle) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black cursor-none">
      <canvas ref={canvasRef} />
      
      {/* Logo/Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-white/10 text-6xl font-bold tracking-widest">
          TV-OS
        </div>
      </div>

      {/* Exit hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-sm">
        Move mouse or press any key to exit
      </div>
    </div>
  );
}
```

---

## 10. Quick Resume

### src/services/useQuickResume.ts

```typescript
import { useState, useEffect, useCallback } from 'react';

const RESUME_STORAGE_KEY = 'quick_resume';

interface ResumeState {
  appId: string;
  timestamp: number;
  scrollPosition?: number;
}

export function useQuickResume() {
  const [resumeState, setResumeState] = useState<ResumeState | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(RESUME_STORAGE_KEY);
    if (stored) {
      try {
        const state = JSON.parse(stored) as ResumeState;
        // Only resume if within 30 minutes
        if (Date.now() - state.timestamp < 30 * 60 * 1000) {
          setResumeState(state);
        }
      } catch (e) {
        console.error('Failed to parse resume state:', e);
      }
    }
  }, []);

  const saveState = useCallback((appId: string, scrollPosition?: number) => {
    const state: ResumeState = {
      appId,
      timestamp: Date.now(),
      scrollPosition,
    };
    sessionStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(state));
    setResumeState(state);
  }, []);

  const clearState = useCallback(() => {
    sessionStorage.removeItem(RESUME_STORAGE_KEY);
    setResumeState(null);
  }, []);

  const shouldResume = useCallback((appId: string): boolean => {
    return resumeState?.appId === appId && resumeState.scrollPosition !== undefined;
  }, [resumeState]);

  return {
    resumeState,
    saveState,
    clearState,
    shouldResume,
  };
}
```

---

## 11. CSS Animations

### src/styles/animations.css

```css
/* Focus animations */
@keyframes focus-ring-pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.2);
  }
}

.focus-ring-pulse {
  animation: focus-ring-pulse 2s ease-in-out infinite;
}

/* Screen transitions */
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slide-out-left {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

/* App card hover */
@keyframes card-hover {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1.1); }
}

/* Loading spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Fade in */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Scale in */
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Utility classes */
.animate-focus-pulse {
  animation: focus-ring-pulse 2s ease-in-out infinite;
}

.animate-slide-right {
  animation: slide-in-right 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-slide-left {
  animation: slide-out-left 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-spin-slow {
  animation: spin 1.5s linear infinite;
}

.animate-fade-in {
  animation: fade-in 300ms ease-out;
}

.animate-scale-in {
  animation: scale-in 200ms ease-out;
}
```

---

## 12. Performance Checklist

### Memory Optimization
- [ ] Lazy load images with `loading="lazy"`
- [ ] Use `React.memo` for static components
- [ ] Virtualize long lists (react-window)
- [ ] Cleanup animation frames on unmount

### Render Optimization
- [ ] Avoid re-renders with `useMemo`/`useCallback`
- [ ] Use CSS transforms over layout changes
- [ ] Batch state updates
- [ ] Use `will-change` sparingly

### Animation Performance
- [ ] Use `transform` and `opacity` only
- [ ] Target 60fps
- [ ] Use `requestAnimationFrame` for JS animations
- [ ] Avoid animating expensive properties (width, height, top, left)

---

## 13. Checklist de Implementação

- [ ] Implementar useTransition hook
- [ ] Criar ScreenContainer component
- [ ] Adicionar app launch animation
- [ ] Implementar BackgroundBlur component
- [ ] Criar RecentlyOpened component
- [ ] Implementar OnScreenKeyboard
- [ ] Criar Screensaver component
- [ ] Implementar useIdleTimer hook
- [ ] Adicionar useQuickResume hook
- [ ] Criar CSS animations file
- [ ] Testar todas transições
- [ ] Verificar performance
- [ ] Testar em diferentes resoluções
