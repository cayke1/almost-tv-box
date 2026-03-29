import { AppLoading } from './AppLoading';
import { AppError } from './AppError';
import { useAppManager } from '../services/useAppManager';

export function AppView() {
  const { state, closeApp } = useAppManager();

  if (!state.isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {state.isLoading && <AppLoading appName={state.currentApp?.name || ''} />}

      {state.error && (
        <AppError 
          message={state.error} 
          onRetry={() => state.currentApp && window.electronAPI?.launchApp(state.currentApp.id)}
          onClose={closeApp}
        />
      )}
    </div>
  );
}
