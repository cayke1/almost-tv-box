import { useCallback, useEffect, useRef } from 'react';
import { useFocusContext } from '../context/FocusContext';
import type { Direction } from '../types';

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
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const currentId = stateRef.current.currentId;
    
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
        if (currentId) {
          console.log('[GridNav] Enter pressed, currentId:', currentId);
          onSelectRef.current?.(currentId);
        }
        break;
    }
  }, [moveFocus, options]);

  const handleNavigate = useCallback((direction: string) => {
    moveFocus(direction as Direction);
    options.onNavigate?.(direction as Direction);
  }, [moveFocus, options]);

  const handleSelect = useCallback(() => {
    const currentId = stateRef.current.currentId;
    if (currentId) {
      console.log('[GridNav] Select event, currentId:', currentId);
      onSelectRef.current?.(currentId);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    window.electronAPI?.onNavigate?.(handleNavigate);
    window.electronAPI?.onSelect?.(handleSelect);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, handleNavigate, handleSelect]);

  return {
    focusedId: state.currentId,
    position: state.position,
    setFocus,
    moveFocus,
    selectCurrent,
  };
}
