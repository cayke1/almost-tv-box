# Navigation System - Focus Manager

## Visão Geral

Implementar um sistema de navegação baseado em foco para interface de TV. Sem mouse - navegação puramente por teclado/remote. Este é o sistema central que todas as outras funcionalidades dependem.

---

## 1. Conceitos Fundamentais

### 10-Foot UI
Interface projetada para ser visualizada a 3 metros de distância (10 pés). Isso significa:
- Elementos grandes e facilmente legíveis
- Contraste alto
- Navegação clara com feedback visual forte

### Focus-Based Navigation
- Apenas UM elemento pode ter foco por vez
- Foco é móvel (não clicável)
- Arrow keys movem o foco espacialmente
- Enter confirma seleção

---

## 2. Arquitetura do Focus Manager

### Estrutura de Arquivos

```
src/
├── hooks/
│   ├── useFocusManager.ts      # Main focus logic
│   ├── useGridNavigation.ts    # Grid-specific navigation
│   └── useKeyboardNavigation.ts # Keyboard event handling
├── context/
│   └── FocusContext.tsx        # React context for global focus state
├── components/
│   ├── Focusable.tsx           # HOC for focusable elements
│   └── FocusRing.tsx           # Visual focus indicator
└── utils/
    └── focusUtils.ts           # Helper functions
```

---

## 3. Tipos TypeScript

### src/types/focus.ts

```typescript
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

export interface FocusManagerConfig {
  rows: number;
  cols: number;
  wrap?: boolean;           // Wrap at edges (default: true)
  onFocusChange?: (elementId: string | null) => void;
  onSelect?: (elementId: string) => void;
}

export interface FocusState {
  currentId: string | null;
  position: GridPosition;
  history: string[];        // For back navigation
}
```

---

## 4. Focus Context

### src/context/FocusContext.tsx

```typescript
import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import type { FocusState, FocusableElement, Direction, GridPosition } from '../types/focus';

interface FocusContextValue {
  state: FocusState;
  elements: Map<string, FocusableElement>;
  
  // Actions
  registerElement: (element: FocusableElement) => void;
  unregisterElement: (id: string) => void;
  moveFocus: (direction: Direction) => void;
  setFocus: (id: string) => void;
  selectCurrent: () => void;
  clearFocus: () => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

// Action types
type FocusAction =
  | { type: 'REGISTER'; element: FocusableElement }
  | { type: 'UNREGISTER'; id: string }
  | { type: 'SET_FOCUS'; id: string }
  | { type: 'MOVE_FOCUS'; id: string; position: GridPosition }
  | { type: 'CLEAR_FOCUS' };

const initialState: FocusState = {
  currentId: null,
  position: { row: 0, col: 0 },
  history: [],
};

function focusReducer(state: FocusState, action: FocusAction): FocusState {
  switch (action.type) {
    case 'SET_FOCUS':
      return {
        ...state,
        currentId: action.id,
        history: action.id ? [...state.history, action.id] : state.history,
      };
    case 'MOVE_FOCUS':
      return {
        ...state,
        currentId: action.id,
        position: action.position,
        history: [...state.history, action.id],
      };
    case 'CLEAR_FOCUS':
      return { ...state, currentId: null };
    default:
      return state;
  }
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(focusReducer, initialState);
  const [elements, setElements] = React.useState<Map<string, FocusableElement>>(new Map());

  const registerElement = useCallback((element: FocusableElement) => {
    setElements(prev => new Map(prev).set(element.id, element));
  }, []);

  const unregisterElement = useCallback((id: string) => {
    setElements(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const setFocus = useCallback((id: string) => {
    const element = elements.get(id);
    if (element && !element.disabled) {
      dispatch({ type: 'SET_FOCUS', id });
    }
  }, [elements]);

  const moveFocus = useCallback((direction: Direction) => {
    const currentId = state.currentId;
    if (!currentId) {
      // Focus first available element
      const firstElement = elements.values().next().value;
      if (firstElement) {
        dispatch({ type: 'SET_FOCUS', id: firstElement.id });
      }
      return;
    }

    const current = elements.get(currentId);
    if (!current) return;

    const target = findBestTarget(current, direction, elements, state.position);
    if (target) {
      dispatch({ 
        type: 'MOVE_FOCUS', 
        id: target.id, 
        position: target.position 
      });
    }
  }, [state, elements]);

  const selectCurrent = useCallback(() => {
    if (state.currentId) {
      const element = elements.get(state.currentId);
      if (element && !element.disabled) {
        // Trigger select callback - handled by consumer
      }
    }
  }, [state.currentId, elements]);

  const clearFocus = useCallback(() => {
    dispatch({ type: 'CLEAR_FOCUS' });
  }, []);

  return (
    <FocusContext.Provider value={{
      state,
      elements,
      registerElement,
      unregisterElement,
      moveFocus,
      setFocus,
      selectCurrent,
      clearFocus,
    }}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocusContext() {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocusContext must be used within FocusProvider');
  }
  return context;
}
```

---

## 5. Algoritmo de Navegação Grid

### src/utils/focusUtils.ts

```typescript
import type { FocusableElement, Direction, GridPosition } from '../types/focus';

interface NavigationResult {
  id: string;
  position: GridPosition;
}

export function findBestTarget(
  current: FocusableElement,
  direction: Direction,
  elements: Map<string, FocusableElement>,
  currentPosition: GridPosition,
  wrap: boolean = true
): NavigationResult | null {
  
  const candidates = Array.from(elements.values())
    .filter(el => el.id !== current.id && !el.disabled);

  switch (direction) {
    case 'up':
      return findVerticalTarget(candidates, current, -1, wrap, currentPosition);
    case 'down':
      return findVerticalTarget(candidates, current, 1, wrap, currentPosition);
    case 'left':
      return findHorizontalTarget(candidates, current, -1, wrap, currentPosition);
    case 'right':
      return findHorizontalTarget(candidates, current, 1, wrap, currentPosition);
  }
}

function findVerticalTarget(
  candidates: FocusableElement[],
  current: FocusableElement,
  direction: number,
  wrap: boolean,
  currentPosition: GridPosition
): NavigationResult | null {
  
  // Filter elements in the same column range
  const inSameCol = candidates.filter(el => {
    const colOverlap = rangesOverlap(
      el.position.col, el.colSpan || 1,
      current.position.col, current.colSpan || 1
    );
    return colOverlap && (el.position.row - current.position.row) * direction > 0;
  });

  if (inSameCol.length > 0) {
    // Find closest in direction
    inSameCol.sort((a, b) => 
      (a.position.row - current.position.row) * direction -
      (b.position.row - current.position.row) * direction
    );
    return { id: inSameCol[0].id, position: inSameCol[0].position };
  }

  // No direct match - find closest by column
  const sortedByDistance = candidates
    .map(el => ({
      ...el,
      distance: Math.abs(el.position.row - current.position.row)
    }))
    .sort((a, b) => a.distance - b.distance);

  if (sortedByDistance.length > 0) {
    return { id: sortedByDistance[0].id, position: sortedByDistance[0].position };
  }

  return null;
}

function findHorizontalTarget(
  candidates: FocusableElement[],
  current: FocusableElement,
  direction: number,
  wrap: boolean,
  currentPosition: GridPosition
): NavigationResult | null {
  
  // Filter elements in the same row range
  const inSameRow = candidates.filter(el => {
    const rowOverlap = rangesOverlap(
      el.position.row, el.rowSpan || 1,
      current.position.row, current.rowSpan || 1
    );
    return rowOverlap && (el.position.col - current.position.col) * direction > 0;
  });

  if (inSameRow.length > 0) {
    inSameRow.sort((a, b) => 
      (a.position.col - current.position.col) * direction -
      (b.position.col - current.position.col) * direction
    );
    return { id: inSameRow[0].id, position: inSameRow[0].position };
  }

  // No direct match - find closest
  const sortedByDistance = candidates
    .map(el => ({
      ...el,
      distance: Math.abs(el.position.col - current.position.col)
    }))
    .sort((a, b) => a.distance - b.distance);

  if (sortedByDistance.length > 0) {
    return { id: sortedByDistance[0].id, position: sortedByDistance[0].position };
  }

  return null;
}

function rangesOverlap(
  start1: number, span1: number,
  start2: number, span2: number
): boolean {
  const end1 = start1 + span1;
  const end2 = start2 + span2;
  return start1 < end2 && end1 > start2;
}
```

---

## 6. Hooks de Navegação

### src/hooks/useGridNavigation.ts

```typescript
import { useCallback, useEffect, useRef } from 'react';
import { useFocusContext } from '../context/FocusContext';
import type { Direction } from '../types/focus';

interface UseGridNavigationOptions {
  rows: number;
  cols: number;
  wrap?: boolean;
  onSelect?: (id: string) => void;
  onNavigate?: (direction: Direction) => void;
}

export function useGridNavigation(options: UseGridNavigationOptions) {
  const { 
    state, 
    moveFocus, 
    setFocus, 
    selectCurrent 
  } = useFocusContext();

  const onSelectRef = useRef(options.onSelect);
  onSelectRef.current = options.onSelect;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveFocus('up');
        options.onNavigate?.('up');
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveFocus('down');
        options.onNavigate?.('down');
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus('left');
        options.onNavigate?.('left');
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveFocus('right');
        options.onNavigate?.('right');
        break;
      case 'Enter':
        event.preventDefault();
        if (state.currentId) {
          onSelectRef.current?.(state.currentId);
        }
        break;
    }
  }, [moveFocus, state.currentId, options]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    focusedId: state.currentId,
    position: state.position,
    setFocus,
    moveFocus,
    selectCurrent,
  };
}
```

---

## 7. Componente Focusable (HOC)

### src/components/Focusable.tsx

```typescript
import React, { useEffect, useRef, ReactNode } from 'react';
import { useFocusContext } from '../context/FocusContext';
import type { FocusableElement, GridPosition } from '../types/focus';

interface FocusableProps {
  id: string;
  position: GridPosition;
  rowSpan?: number;
  colSpan?: number;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  onFocus?: () => void;
  onSelect?: () => void;
}

export function Focusable({
  id,
  position,
  rowSpan = 1,
  colSpan = 1,
  disabled = false,
  children,
  className = '',
  onFocus,
  onSelect,
}: FocusableProps) {
  const { state, registerElement, unregisterElement, setFocus } = useFocusContext();
  const isFocused = state.currentId === id;

  useEffect(() => {
    registerElement({ id, position, rowSpan, colSpan, disabled });
    return () => unregisterElement(id);
  }, [id, position, rowSpan, colSpan, disabled, registerElement, unregisterElement]);

  const handleFocus = () => {
    if (!disabled) {
      setFocus(id);
      onFocus?.();
    }
  };

  return (
    <div
      onClick={handleFocus}
      className={`
        transition-all duration-150 ease-out
        ${isFocused ? 'scale-105' : 'scale-100'}
        ${isFocused && !disabled ? 'focused' : ''}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
        ${className}
      `}
      data-focus-id={id}
    >
      {children}
      
      {/* Focus Ring Indicator */}
      {isFocused && !disabled && (
        <FocusRing />
      )}
    </div>
  );
}
```

---

## 8. Componente Focus Ring

### src/components/FocusRing.tsx

```tsx
export function FocusRing() {
  return (
    <>
      <style>{`
        .focused::before {
          content: '';
          position: absolute;
          inset: -4px;
          border: 3px solid rgba(255, 255, 255, 0.8);
          border-radius: inherit;
          animation: pulse-ring 2s ease-in-out infinite;
        }
        
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
```

---

## 9. Integração com WebSocket (Mobile)

Quando eventos de navegação chegam via WebSocket do mobile controller, eles devem mapear para o focus manager:

### src/hooks/useWebSocketNavigation.ts

```typescript
import { useEffect } from 'react';
import { useGridNavigation } from './useGridNavigation';
import type { Direction } from '../types/focus';

export function useWebSocketNavigation(
  ws: WebSocket | null,
  options: Parameters<typeof useGridNavigation>[0]
) {
  const { moveFocus, setFocus, selectCurrent } = useGridNavigation(options);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'NAVIGATION':
            moveFocus(data.payload.direction as Direction);
            break;
          case 'SELECT':
            selectCurrent();
            break;
          case 'SET_FOCUS':
            setFocus(data.payload.id);
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, moveFocus, setFocus, selectCurrent]);
}
```

---

## 10. Exemplo de Uso

### src/screens/HomeScreen.tsx

```tsx
import { FocusProvider } from '../context/FocusContext';
import { useGridNavigation } from '../hooks/useGridNavigation';
import { Focusable } from '../components/Focusable';
import { AppCard } from '../components/AppCard';
import apps from '../config/apps.json';

export function HomeScreen() {
  const { focusedId, setFocus } = useGridNavigation({
    rows: 2,
    cols: 4,
    onSelect: (id) => console.log('Selected app:', id),
  });

  return (
    <div className="flex flex-wrap gap-6 p-8">
      {apps.apps.map((app, index) => (
        <Focusable
          key={app.id}
          id={app.id}
          position={{
            row: Math.floor(index / 4),
            col: index % 4,
          }}
          onSelect={() => launchApp(app.id)}
        >
          <AppCard
            app={app}
            isFocused={focusedId === app.id}
            onFocus={() => setFocus(app.id)}
            onSelect={() => launchApp(app.id)}
          />
        </Focusable>
      ))}
    </div>
  );
}
```

---

## 11. Checklist de Implementação

- [ ] Criar FocusContext com reducer
- [ ] Implementar tipos TypeScript
- [ ] Criar focusUtils com algoritmo de navegação
- [ ] Implementar useGridNavigation hook
- [ ] Criar componente Focusable (HOC)
- [ ] Criar componente FocusRing
- [ ] Integrar com WebSocket (mobile events)
- [ ] Testar navegação com arrow keys
- [ ] Testar edge wrapping
- [ ] Adicionar animações de foco
- [ ] Testar com dynamic layouts
