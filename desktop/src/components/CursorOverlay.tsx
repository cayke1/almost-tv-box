import { useState, useEffect, useRef } from 'react';

interface CursorOverlayProps {
  visible: boolean;
  onClick?: (x: number, y: number) => void;
}

export function CursorOverlay({ visible, onClick }: CursorOverlayProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!window.electronAPI) return;

    const handleCursorMove = ({ x, y }: { x: number; y: number }) => {
      setPosition({ x, y });
      setIsVisible(true);
    };

    const handleCursorClick = ({ button }: { button: 'left' | 'right' }) => {
      onClick?.(position.x, position.y);
    };

    window.electronAPI.onCursorMove?.(handleCursorMove);
    window.electronAPI.onCursorClick?.(handleCursorClick);

    let hideTimeout: NodeJS.Timeout;
    const resetHideTimer = () => {
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => setIsVisible(false), 3000);
    };

    resetHideTimer();

    return () => {
      window.electronAPI.removeAllListeners?.('cursor:move');
      window.electronAPI.removeAllListeners?.('cursor:click');
      clearTimeout(hideTimeout);
    };
  }, [position, onClick]);

  if (!visible || !isVisible) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 transition-all duration-75"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        className="drop-shadow-lg"
      >
        <path
          d="M4 4L20 12L12 14L8 20L4 4Z"
          fill="white"
          stroke="black"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
