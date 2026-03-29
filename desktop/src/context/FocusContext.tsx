import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import type { FocusState, FocusableElement, Direction, GridPosition } from '../types';

interface FocusContextValue {
  state: FocusState;
  elements: Map<string, FocusableElement>;
  
  registerElement: (element: FocusableElement) => void;
  unregisterElement: (id: string) => void;
  moveFocus: (direction: Direction) => void;
  setFocus: (id: string) => void;
  selectCurrent: () => void;
  clearFocus: () => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

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
        history: action.id ? [...state.history.slice(-20), action.id] : state.history,
      };
    case 'MOVE_FOCUS':
      return {
        ...state,
        currentId: action.id,
        position: action.position,
        history: [...state.history.slice(-20), action.id],
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
      const firstElement = elements.values().next().value;
      if (firstElement) {
        dispatch({ type: 'SET_FOCUS', id: firstElement.id });
      }
      return;
    }

    const current = elements.get(currentId);
    if (!current) return;

    const target = findBestTarget(current, direction, elements);
    if (target) {
      dispatch({ 
        type: 'MOVE_FOCUS', 
        id: target.id, 
        position: target.position 
      });
    }
  }, [state, elements]);

  const selectCurrent = useCallback(() => {
    // Selection is handled by the component
  }, []);

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

function findBestTarget(
  current: FocusableElement,
  direction: Direction,
  elements: Map<string, FocusableElement>
): { id: string; position: GridPosition } | null {
  
  const candidates = Array.from(elements.values())
    .filter(el => el.id !== current.id && !el.disabled);

  switch (direction) {
    case 'up': {
      const candidatesAbove = candidates.filter(el => el.position.row < current.position.row);
      if (candidatesAbove.length === 0) return null;
      
      candidatesAbove.sort((a, b) => {
        const aDistance = Math.abs(a.position.col - current.position.col);
        const bDistance = Math.abs(b.position.col - current.position.col);
        if (aDistance !== bDistance) return aDistance - bDistance;
        return (current.position.row - a.position.row) - (current.position.row - b.position.row);
      });
      
      return { id: candidatesAbove[0].id, position: candidatesAbove[0].position };
    }
    
    case 'down': {
      const candidatesBelow = candidates.filter(el => el.position.row > current.position.row);
      if (candidatesBelow.length === 0) return null;
      
      candidatesBelow.sort((a, b) => {
        const aDistance = Math.abs(a.position.col - current.position.col);
        const bDistance = Math.abs(b.position.col - current.position.col);
        if (aDistance !== bDistance) return aDistance - bDistance;
        return a.position.row - b.position.row - (current.position.row - a.position.row);
      });
      
      return { id: candidatesBelow[0].id, position: candidatesBelow[0].position };
    }
    
    case 'left': {
      const candidatesLeft = candidates.filter(el => el.position.col < current.position.col);
      if (candidatesLeft.length === 0) return null;
      
      candidatesLeft.sort((a, b) => {
        const aDistance = Math.abs(a.position.row - current.position.row);
        const bDistance = Math.abs(b.position.row - current.position.row);
        if (aDistance !== bDistance) return aDistance - bDistance;
        return (current.position.col - a.position.col) - (current.position.col - b.position.col);
      });
      
      return { id: candidatesLeft[0].id, position: candidatesLeft[0].position };
    }
    
    case 'right': {
      const candidatesRight = candidates.filter(el => el.position.col > current.position.col);
      if (candidatesRight.length === 0) return null;
      
      candidatesRight.sort((a, b) => {
        const aDistance = Math.abs(a.position.row - current.position.row);
        const bDistance = Math.abs(b.position.row - current.position.row);
        if (aDistance !== bDistance) return aDistance - bDistance;
        return a.position.col - b.position.col - (current.position.col - a.position.col);
      });
      
      return { id: candidatesRight[0].id, position: candidatesRight[0].position };
    }
  }
}
