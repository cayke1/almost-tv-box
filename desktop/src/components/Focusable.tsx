import React, { useEffect, useRef, ReactNode } from 'react';
import { useFocusContext } from '../context/FocusContext';
import type { FocusableElement, GridPosition } from '../types';

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
      
      {isFocused && !disabled && (
        <FocusRing />
      )}
    </div>
  );
}

function FocusRing() {
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
