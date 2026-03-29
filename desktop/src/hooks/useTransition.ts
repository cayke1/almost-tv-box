import { useState, useCallback, useRef } from 'react';
import type { TransitionType, AnimationState } from '../types';

interface UseTransitionOptions {
  duration?: number;
  type?: TransitionType;
  onMidpoint?: () => void;
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

    setTimeout(() => {
      if (!midpointCalled.current) {
        midpointCalled.current = true;
        onMidpoint?.();
      }
    }, duration / 2);

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
            : state.isEntering && state.direction === 'forward'
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
  }, [type, duration, state]);

  return {
    state,
    isAnimating,
    startTransition,
    exitTransition,
    getTransitionStyle,
  };
}
