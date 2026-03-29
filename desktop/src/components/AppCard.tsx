import { useRef, useEffect } from 'react';
import { useFocusContext } from '../context/FocusContext';
import type { AppConfig } from '../types';

interface AppCardProps {
  app: AppConfig;
  isFocused: boolean;
  onSelect: () => void;
  onFocus: () => void;
  row?: number;
  col?: number;
}

export function AppCard({ app, isFocused, onSelect, onFocus, row = 0, col = 0 }: AppCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { registerElement, unregisterElement } = useFocusContext();

  useEffect(() => {
    registerElement({
      id: app.id,
      position: { row, col },
    });

    return () => {
      unregisterElement(app.id);
    };
  }, [app.id, row, col, registerElement, unregisterElement]);

  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onFocus={onFocus}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={`
        relative w-64 h-40 rounded-xl overflow-hidden cursor-pointer
        transition-all duration-200 ease-out
        ${isFocused 
          ? 'scale-110 ring-4 ring-white/50 shadow-2xl z-10' 
          : 'scale-100 opacity-80 hover:opacity-100'
        }
      `}
      style={{ 
        backgroundColor: app.color,
        boxShadow: isFocused ? `0 0 40px ${app.color}40` : 'none'
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-white text-opacity-90 font-bold text-3xl">
          {app.name.charAt(0)}
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-white font-semibold text-lg">
          {app.name}
        </span>
      </div>

      {isFocused && (
        <div 
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            animation: 'pulse-ring 2s ease-in-out infinite',
          }}
        />
      )}

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { 
            box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.8);
          }
          50% { 
            box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.4);
          }
        }
      `}</style>
    </div>
  );
}
