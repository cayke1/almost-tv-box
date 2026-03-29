import { useState, useEffect, useCallback, useRef } from "react";
import type { AppConfig, AppViewState } from "../types";

interface UseAppManagerReturn {
  state: AppViewState;
  launchApp: (appId: string) => Promise<void>;
  closeApp: () => Promise<void>;
  openBrowser: (url: string) => Promise<void>;
  apps: AppConfig[];
}

export function useAppManager(): UseAppManagerReturn {
  const [state, setState] = useState<AppViewState>({
    isOpen: false,
    currentApp: null,
    isLoading: false,
    error: null,
  });

  const [apps, setApps] = useState<AppConfig[]>([]);
  const appsRef = useRef(apps);
  appsRef.current = apps;

  useEffect(() => {
    setApps([
      {
        id: "netflix",
        name: "Netflix",
        url: "https://netflix.com",
        icon: "",
        color: "#E50914",
        category: "streaming",
      },
      {
        id: "youtube",
        name: "YouTube",
        url: "https://youtube.com/tv",
        icon: "",
        color: "#FF0000",
        category: "streaming",
      },
      {
        id: "prime",
        name: "Prime Video",
        url: "https://primevideo.com",
        icon: "",
        color: "#00A8E1",
        category: "streaming",
      },
      {
        id: "browser",
        name: "Browser",
        url: "",
        icon: "",
        color: "#4A90D9",
        category: "browser",
      },
      {
        id: "stremio",
        name: "Stremio",
        url: "C:\\Users\\Usuario\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Stremio.exe",
        icon: "",
        color: "#1DB954",
        category: "streaming",
      },
    ]);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    const handleLoadingChange = ({ isLoading }: { isLoading: boolean }) => {
      setState((prev) => ({ ...prev, isLoading }));
    };

    const handleError = ({ message }: { message: string }) => {
      setState((prev) => ({ ...prev, error: message, isLoading: false }));
    };

    const handleClosed = () => {
      setState({
        isOpen: false,
        currentApp: null,
        isLoading: false,
        error: null,
      });
    };

    const handleLaunched = ({ appId }: { appId: string }) => {
      const app = appsRef.current.find((a) => a.id === appId);
      setState({
        isOpen: true,
        currentApp: app || null,
        isLoading: true,
        error: null,
      });
    };

    window.electronAPI.onAppLoadingChange?.(handleLoadingChange);
    window.electronAPI.onAppError?.(handleError);
    window.electronAPI.onAppClosed?.(handleClosed);
    window.electronAPI.onAppLaunched?.(handleLaunched);

    return () => {
      window.electronAPI.removeAllListeners?.("app:loading-change");
      window.electronAPI.removeAllListeners?.("app:error");
      window.electronAPI.removeAllListeners?.("app-closed");
      window.electronAPI.removeAllListeners?.("app:launched");
    };
  }, []);

  const launchApp = useCallback(async (appId: string) => {
    const app = appsRef.current.find((a) => a.id === appId);
    setState({
      isOpen: true,
      currentApp: app || null,
      isLoading: true,
      error: null,
    });
    await window.electronAPI?.launchApp(appId);
  }, []);

  const closeApp = useCallback(async () => {
    setState({
      isOpen: false,
      currentApp: null,
      isLoading: false,
      error: null,
    });
    await window.electronAPI?.closeAppView();
  }, []);

  const openBrowser = useCallback(
    async (url: string) => {
      await launchApp("browser");
    },
    [launchApp],
  );

  return {
    state,
    launchApp,
    closeApp,
    openBrowser,
    apps,
  };
}
