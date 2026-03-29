import { ReactNode, useEffect } from 'react';
import { useTransition } from '../hooks/useTransition';
import type { TransitionType } from '../types';

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
