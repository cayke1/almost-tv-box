# Touchpad System

## Visão Geral

Implementar sistema de touchpad no mobile controller que traduz gestos de toque em movimento de cursor no TV. Requer cooperação entre mobile UI e Electron main process.

---

## 1. Conceitos

### Touch vs Mouse
- **Touch**: Posição absoluta na tela do mobile
- **Mouse**: Movimento relativo (delta X, delta Y)

### Smooth Interpolation
Movimentos pequenos e frequentes são melhores que saltos grandes. O touchpad deve:
1. Capturar movimento relativo (delta) em cada touch move
2. Aplicar multiplicador de sensibilidade
3. Enviar para TV via WebSocket
4. TV aplica interpolação suave

---

## 2. Estrutura de Arquivos

```
src-electron/
├── services/
│   ├── touchpad-handler.ts    # Mouse simulation
│   └── cursor-manager.ts      # Cursor position & smoothing
src/
├── mobile/
│   └── touchpad.js            # Touchpad logic (already in app.js)
├── components/
│   └── CursorOverlay.tsx      # Visual cursor on TV
└── utils/
    └── interpolation.ts       # Smooth movement algorithms
```

---

## 3. Tipos TypeScript

### src/types/touchpad.ts

```typescript
export interface TouchEvent {
  type: 'TOUCH_START' | 'TOUCH_MOVE' | 'TOUCH_END' | 'TAP' | 'DOUBLE_TAP';
  x: number;
  y: number;
  dx?: number;           // Delta X (for MOVE)
  dy?: number;           // Delta Y (for MOVE)
  timestamp: number;
}

export interface TouchpadConfig {
  sensitivity: number;    // 0.1 - 2.0, default 1.0
  acceleration: number;  // Speed multiplier for fast movements
  smoothing: number;     // 0-1, how much to average movements
  tapThreshold: number;  // Max movement for a tap (px)
  doubleTapDelay: number; // Max delay for double tap (ms)
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface MouseSimulatorEvent {
  type: 'MOVE' | 'CLICK' | 'DRAG';
  dx: number;
  dy: number;
  button?: 'left' | 'right';
}
```

---

## 4. Touchpad Handler (Main Process)

### src-electron/services/touchpad-handler.ts

```typescript
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
    
    // Clamp to screen bounds
    const display = screen.getPrimaryDisplay();
    const clampedX = Math.max(0, Math.min(display.workAreaSize.width, x));
    const clampedY = Math.max(0, Math.min(display.workAreaSize.height, y));

    // Move cursor using Electron's screen API
    // Note: Electron doesn't have direct cursor API, we use webContents
    this.mainWindow.webContents.send('cursor:move', { x: clampedX, y: clampedY });

    // For actual cursor movement, we need to use robotjs or similar
    // This is a simplified version that sends position to renderer
  }

  private handleMouseClick(button: 'left' | 'right') {
    this.mainWindow.webContents.send('cursor:click', { button });
  }
}
```

---

## 5. Cursor Manager

### src-electron/services/cursor-manager.ts

```typescript
import { screen } from 'electron';

interface VelocityTracker {
  dx: number;
  dy: number;
  timestamp: number;
}

export class CursorManager {
  private x: number = 0;
  private y: number = 0;
  private velocityHistory: VelocityTracker[] = [];
  private maxHistorySize: number = 5;
  private isDragging: boolean = false;
  private sensitivity: number = 1.0;
  private smoothing: number = 0.5;

  constructor() {
    // Initialize to center of screen
    const display = screen.getPrimaryDisplay();
    this.x = display.workAreaSize.width / 2;
    this.y = display.workAreaSize.height / 2;
  }

  calculateNewPosition(dx: number, dy: number): { x: number; y: number } {
    // Track velocity for smoothing
    this.addVelocity(dx, dy);

    // Apply smoothing (average with previous movements)
    const smoothed = this.getSmoothedMovement();

    // Apply sensitivity
    const finalDx = smoothed.dx * this.sensitivity;
    const finalDy = smoothed.dy * this.sensitivity;

    // If dragging, movement is faster
    const multiplier = this.isDragging ? 2.0 : 1.0;

    this.x += finalDx * multiplier;
    this.y += finalDy * multiplier;

    return { x: this.x, y: this.y };
  }

  private addVelocity(dx: number, dy: number) {
    this.velocityHistory.push({
      dx,
      dy,
      timestamp: Date.now(),
    });

    // Keep only recent history
    if (this.velocityHistory.length > this.maxHistorySize) {
      this.velocityHistory.shift();
    }
  }

  private getSmoothedMovement(): { dx: number; dy: number } {
    if (this.velocityHistory.length === 0) {
      return { dx: 0, dy: 0 };
    }

    // Weighted average - recent movements have more weight
    let totalWeight = 0;
    let weightedDx = 0;
    let weightedDy = 0;

    this.velocityHistory.forEach((v, index) => {
      const weight = (index + 1) / this.velocityHistory.length;
      weightedDx += v.dx * weight;
      weightedDy += v.dy * weight;
      totalWeight += weight;
    });

    return {
      dx: weightedDx / totalWeight,
      dy: weightedDy / totalWeight,
    };
  }

  startDrag() {
    this.isDragging = true;
  }

  endDrag() {
    this.isDragging = false;
  }

  setSensitivity(sensitivity: number) {
    this.sensitivity = Math.max(0.1, Math.min(2.0, sensitivity));
  }

  setSmoothing(smoothing: number) {
    this.smoothing = Math.max(0, Math.min(1, smoothing));
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  reset() {
    const display = screen.getPrimaryDisplay();
    this.x = display.workAreaSize.width / 2;
    this.y = display.workAreaSize.height / 2;
    this.velocityHistory = [];
  }
}
```

---

## 6. Interpolação Suave

### src/utils/interpolation.ts

```typescript
export interface InterpolationConfig {
  smoothing: number;      // 0-1, higher = smoother but slower
  minDelta: number;       // Minimum movement to register
  maxDelta: number;       // Maximum movement per frame
}

const defaultConfig: InterpolationConfig = {
  smoothing: 0.3,
  minDelta: 0.5,
  maxDelta: 20,
};

export class SmoothInterpolator {
  private currentX: number = 0;
  private currentY: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;
  private config: InterpolationConfig;

  constructor(config: Partial<InterpolationConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  updateTarget(dx: number, dy: number) {
    // Clamp delta to reasonable range
    const clampedDx = Math.max(-this.config.maxDelta, 
                       Math.min(this.config.maxDelta, dx));
    const clampedDy = Math.max(-this.config.maxDelta, 
                       Math.min(this.config.maxDelta, dy));

    this.targetX += clampedDx;
    this.targetY += clampedDy;
  }

  tick(): { x: number; y: number; moved: boolean } {
    const prevX = this.currentX;
    const prevY = this.currentY;

    // Lerp towards target
    this.currentX += (this.targetX - this.currentX) * this.config.smoothing;
    this.currentY += (this.targetY - this.currentY) * this.config.smoothing;

    // Snap if close enough
    if (Math.abs(this.targetX - this.currentX) < this.config.minDelta) {
      this.currentX = this.targetX;
    }
    if (Math.abs(this.targetY - this.currentY) < this.config.minDelta) {
      this.currentY = this.targetY;
    }

    return {
      x: Math.round(this.currentX),
      y: Math.round(this.currentY),
      moved: prevX !== this.currentX || prevY !== this.currentY,
    };
  }

  setTarget(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }
}

export class VelocityTracker {
  private samples: { dx: number; dy: number; time: number }[] = [];
  private maxSamples: number = 10;
  private decayFactor: number = 0.95;

  addSample(dx: number, dy: number) {
    this.samples.push({ dx, dy, time: Date.now() });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getVelocity(): { vx: number; vy: number } {
    if (this.samples.length < 2) {
      return { vx: 0, vy: 0 };
    }

    const recent = this.samples.slice(-5);
    let totalDx = 0;
    let totalDy = 0;

    for (const sample of recent) {
      totalDx += sample.dx;
      totalDy += sample.dy;
    }

    return {
      vx: totalDx / recent.length,
      vy: totalDy / recent.length,
    };
  }

  clear() {
    this.samples = [];
  }
}
```

---

## 7. Cursor Overlay Component

### src/components/CursorOverlay.tsx

```tsx
import { useState, useEffect, useRef } from 'react';

interface CursorOverlayProps {
  visible: boolean;
  onClick?: (x: number, y: number) => void;
}

export function CursorOverlay({ visible, onClick }: CursorOverlayProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!window.electronAPI) return;

    const handleCursorMove = ({ x, y }: { x: number; y: number }) => {
      setPosition({ x, y });
      setIsVisible(true);
    };

    const handleCursorClick = ({ button }: { button: 'left' | 'right' }) => {
      onClick?.(position.x, position.y);
    };

    window.electronAPI.onCursorMove?.(handleCursorMove);
    window.electronAPI.onCursorClick?.(handleCursorClick);

    // Auto-hide cursor after 3 seconds of inactivity
    let hideTimeout: NodeJS.Timeout;
    const resetHideTimer = () => {
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => setIsVisible(false), 3000);
    };

    resetHideTimer();

    return () => {
      window.electronAPI.removeAllListeners?.('cursor:move');
      window.electronAPI.removeAllListeners?.('cursor:click');
      clearTimeout(hideTimeout);
    };
  }, [position, onClick]);

  if (!visible || !isVisible) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 transition-all duration-75"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Custom cursor SVG */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        className="drop-shadow-lg"
      >
        <path
          d="M4 4L20 12L12 14L8 20L4 4Z"
          fill="white"
          stroke="black"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
```

---

## 8. Touchpad no Mobile (atualizar app.js)

### Enhanced Touchpad Logic

```javascript
// Adicionar ao MobileController em app.js

class MobileController {
  // ... existing code ...

  initTouchpad() {
    this.touchHistory = [];
    this.lastTapTime = 0;
    this.tapThreshold = 10; // pixels
    this.doubleTapDelay = 300; // ms
    
    // Two-finger scroll state
    this.scrollStartY = 0;
    this.isScrolling = false;
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    
    // Check for two-finger touch (scroll mode)
    if (e.touches.length === 2) {
      this.isScrolling = true;
      this.scrollStartY = touch.clientY;
      return;
    }

    // Single finger - tap detection
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    this.touchStartTime = Date.now();
    this.hasMoved = false;
    this.touchpad.classList.add('touched');

    this.send({ type: 'TOUCH_START', payload: { x: touch.clientX, y: touch.clientY } });
  }

  handleTouchMove(e) {
    e.preventDefault();
    
    // Two-finger scroll
    if (e.touches.length === 2 && this.isScrolling) {
      const touch = e.touches[0];
      const dy = touch.clientY - this.scrollStartY;
      this.send({ type: 'SCROLL', payload: { dx: 0, dy } });
      this.scrollStartY = touch.clientY;
      return;
    }

    if (!this.touchStartPos) return;

    const touch = e.touches[0];
    const dx = touch.clientX - this.touchStartPos.x;
    const dy = touch.clientY - this.touchStartPos.y;

    // Track if movement exceeds threshold
    if (Math.abs(dx) > this.tapThreshold || Math.abs(dy) > this.tapThreshold) {
      this.hasMoved = true;
    }

    // Send relative movement
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      this.sendMouseMove(dx, dy);
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    }
  }

  handleTouchEnd(e) {
    e.preventDefault();
    
    // End scroll mode
    if (e.touches.length < 2) {
      this.isScrolling = false;
    }

    if (!this.touchStartPos) return;

    this.touchpad.classList.remove('touched');
    this.send({ type: 'TOUCH_END', payload: {} });

    // Tap detection
    if (!this.hasMoved) {
      const tapDuration = Date.now() - this.touchStartTime;
      
      // Double tap check
      if (tapDuration < this.doubleTapDelay && 
          Date.now() - this.lastTapTime < this.doubleTapDelay) {
        this.send({ type: 'DOUBLE_TAP', payload: {} });
        this.lastTapTime = 0;
      } else {
        // Single tap = left click
        this.sendMouseClick('left');
        this.lastTapTime = Date.now();
      }
    }

    this.touchStartPos = null;
    this.hasMoved = false;
  }
}
```

---

## 9. Two-Finger Scroll (Opcional)

Quando o usuário faz scroll com dois dedos no mobile:

1. Mobile detecta `touches.length === 2`
2. Calcula delta Y
3. Envia evento `SCROLL`
4. TV interpreta como scroll vertical no app atual

```javascript
// In TV side handler
ipcMain.on('scroll', (_event, { dx, dy }) => {
  // For apps with scrollable content
  mainWindow.webContents.send('scroll', { dx, dy });
});
```

---

## 10. Sensibilidade Ajustável

### Sensitivity Levels

| Level | Multiplier | Use Case |
|-------|------------|----------|
| Low   | 0.5x       | Precise cursor control |
| Medium| 1.0x       | Default, balanced |
| High  | 2.0x       | Fast cursor movement |

### Implementation

```javascript
// In MobileController
sendMouseMove(dx, dy) {
  const sensitivityMap = {
    10: 0.5,
    25: 0.75,
    50: 1.0,
    75: 1.5,
    100: 2.0,
  };
  
  const multiplier = sensitivityMap[this.sensitivity] || 1.0;
  const scaledDx = dx * multiplier;
  const scaledDy = dy * multiplier;
  
  this.send({ 
    type: 'MOUSE_MOVE', 
    payload: { 
      dx: Math.round(scaledDx), 
      dy: Math.round(scaledDy) 
    } 
  });
}
```

---

## 11. Estados do Touchpad

```
┌─────────────┐
│   IDLE      │ ◄────────────────┐
│ (no touch)  │                  │
└──────┬──────┘                  │
       │ touchstart              │ touchend (no movement)
       ▼                         │
┌─────────────┐                  │
│  TOUCHING   │                  │
│ (tracking)  │                  │
└──────┬──────┘                  │
       │ touchmove > threshold   │ touchend (movement < threshold)
       ▼                         ▼
┌─────────────┐            ┌─────────────┐
│  DRAGGING   │            │    TAP      │
│ (sending    │            │  (click)    │
│  MOVE events)             └─────────────┘
└──────┬──────┘
       │
       │ touchend
       ▼
┌─────────────┐
│  RELEASED   │
└─────────────┘
```

---

## 12. Performance Considerations

1. **Throttle touch events**: Max 60fps (16ms between events)
2. **Batch small movements**: Combine movements < 2px
3. **Use requestAnimationFrame**: For smooth interpolation on TV side
4. **Avoid memory leaks**: Clear touch history regularly

---

## 13. Checklist de Implementação

- [ ] Criar TouchpadHandler class
- [ ] Implementar CursorManager com smoothing
- [ ] Criar interpolator util
- [ ] Implementar CursorOverlay component
- [ ] Adicionar tap detection (single/double)
- [ ] Implementar drag state
- [ ] Adicionar two-finger scroll
- [ ] Configurar sensitivity slider
- [ ] Implementar throttle para performance
- [ ] Testar smoothness do cursor
- [ ] Testar tap vs drag detection
- [ ] Testar multi-device scenarios
