import { useState, useEffect } from 'react';

interface ServerInfo {
  ip: string;
  port: number;
}

export function ConnectionInfo() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!window.electronAPI) return;

    const handleServerReady = (info: ServerInfo) => {
      setServerInfo(info);
    };

    window.electronAPI.onServerReady?.(handleServerReady);

    return () => {
      window.electronAPI.removeAllListeners?.('server:ready');
    };
  }, []);

  if (!serverInfo || !visible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white px-4 py-2 rounded-lg flex items-center gap-3">
      <span className="text-green-500">●</span>
      <span>Mobile: http://{serverInfo.ip}:{serverInfo.port}</span>
      <button 
        onClick={() => setVisible(false)}
        className="ml-2 text-gray-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
