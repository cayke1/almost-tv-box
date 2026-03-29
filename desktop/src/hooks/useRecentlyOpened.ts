import { useState, useEffect, useCallback } from 'react';
import type { AppConfig } from '../types';

const STORAGE_KEY = 'recently_opened';
const MAX_RECENT = 5;

export function useRecentlyOpened() {
  const [recentApps, setRecentApps] = useState<AppConfig[]>([]);

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
      const filtered = prev.filter(a => a.id !== app.id);
      const updated = [app, ...filtered].slice(0, MAX_RECENT);
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
