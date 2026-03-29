import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeout: number;
  onIdle: () => void;
  onActive: () => void;
  events?: string[];
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
    resetTimer();

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
