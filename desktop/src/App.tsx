import { useState, useEffect, useCallback } from 'react';
import { FocusProvider } from './context/FocusContext';
import { AppCard } from './components/AppCard';
import { AppView } from './components/AppView';
import { ConnectionInfo } from './components/ConnectionInfo';
import { Screensaver } from './components/Screensaver';
import { RecentlyOpened } from './components/RecentlyOpened';
import { OnScreenKeyboard } from './components/OnScreenKeyboard';
import { useGridNavigation } from './hooks/useGridNavigation';
import { useAppManager } from './services/useAppManager';

function AppContent() {
  const [showScreensaver, setShowScreensaver] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardInput, setKeyboardInput] = useState('');
  const { state: appState, closeApp, apps, launchApp } = useAppManager();

  useEffect(() => {
    if (appState.isOpen && showKeyboard) {
      setShowKeyboard(false);
      setKeyboardInput('');
    }
  }, [appState.isOpen, showKeyboard]);

  useEffect(() => {
    const handleTextInput = (text: string) => {
      console.log('Text input received:', text);
      setKeyboardInput(text);
      setShowKeyboard(true);
    };

    const handleNavigate = (direction: string) => {
      console.log('Navigate:', direction);
    };

    const handleBack = () => {
      console.log('Back pressed, appState.isOpen:', appState.isOpen);
      if (appState.isOpen) {
        closeApp();
      }
    };

    const handleSelect = () => {
      console.log('Select pressed');
    };

    window.electronAPI?.onTextInput?.(handleTextInput);
    window.electronAPI?.onNavigate?.(handleNavigate);
    window.electronAPI?.onBack?.(handleBack);
    window.electronAPI?.onSelect?.(handleSelect);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (!appState.isOpen) {
          setShowKeyboard(true);
          setKeyboardInput('debug');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState.isOpen, closeApp]);

  const { focusedId } = useGridNavigation({
    rows: 2,
    cols: 4,
    onSelect: (id) => {
      launchApp(id);
    },
  });

  useEffect(() => {
    window.electronAPI?.onAppClosed?.(() => {
    });

    window.electronAPI?.onServerReady?.((info) => {
      console.log('Server ready:', info);
    });
  }, []);

  const handleScreensaverExit = () => {
    setShowScreensaver(false);
  };

  const handleKeyboardClose = useCallback(() => {
    console.log('Keyboard closed');
    setShowKeyboard(false);
    setKeyboardInput('');
  }, []);

  const handleKeyboardSubmit = useCallback((text: string) => {
    console.log('Keyboard submitted:', text);
    setShowKeyboard(false);
    setKeyboardInput('');
  }, []);

  return (
    <div className="min-h-screen bg-tv-bg flex flex-col items-center justify-center p-8">
      <header className="mb-12 text-center">
        <h1 className="text-6xl font-bold text-white mb-2">TV-OS</h1>
        <p className="text-gray-400 text-lg">Smart TV Interface</p>
      </header>

      <RecentlyOpened />

      <main className="flex flex-wrap gap-6 justify-center max-w-6xl">
        {apps.map((app, index) => (
          <AppCard
            key={app.id}
            app={app}
            isFocused={focusedId === app.id}
            onFocus={() => {}}
            onSelect={() => launchApp(app.id)}
            row={Math.floor(index / 4)}
            col={index % 4}
          />
        ))}
      </main>

      <footer className="mt-12 text-gray-500 text-sm flex flex-col items-center gap-2">
        <p>Use arrow keys to navigate • Press Enter to select • Press Escape to go back</p>
      </footer>

      <ConnectionInfo />
      <AppView />
      {showKeyboard && (
        <OnScreenKeyboard
          initialValue={keyboardInput}
          onTextChange={setKeyboardInput}
          onSubmit={handleKeyboardSubmit}
          onClose={handleKeyboardClose}
        />
      )}
      <Screensaver 
        idleTimeout={300000}
        onExit={handleScreensaverExit}
      />
    </div>
  );
}

function App() {
  return (
    <FocusProvider>
      <AppContent />
    </FocusProvider>
  );
}

export default App;
