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
