import { useState, useCallback, useEffect } from 'react';

interface OnScreenKeyboardProps {
  onTextChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onClose: () => void;
  initialValue?: string;
}

const KEYBOARD_LAYOUTS = {
  qwerty: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  numbers: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ],
};

export function OnScreenKeyboard({
  onTextChange,
  onSubmit,
  onClose,
  initialValue = '',
}: OnScreenKeyboardProps) {
  const [text, setText] = useState(initialValue);
  const [layout, setLayout] = useState<'qwerty' | 'numbers'>('qwerty');
  const [isShifted, setIsShifted] = useState(false);

  const currentLayout = KEYBOARD_LAYOUTS[layout];

  const handleKeyPress = useCallback((key: string) => {
    let newText = text;
    
    if (key === 'space') {
      newText = text + ' ';
    } else if (key === 'backspace') {
      newText = text.slice(0, -1);
    } else if (key === 'shift') {
      setIsShifted(s => !s);
      return;
    } else if (key === '123') {
      setLayout(l => l === 'qwerty' ? 'numbers' : 'qwerty');
      return;
    } else if (key === 'enter') {
      onSubmit(text);
      return;
    } else {
      newText = text + (isShifted ? key.toUpperCase() : key);
    }

    setText(newText);
    onTextChange(newText);
  }, [text, isShifted, onTextChange, onSubmit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Backspace':
          e.preventDefault();
          handleKeyPress('backspace');
          break;
        case 'Enter':
          e.preventDefault();
          onSubmit(text);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, onSubmit, onClose, handleKeyPress]);

  return (
    <div className="fixed inset-x-0 bottom-0 bg-gray-900/95 backdrop-blur-lg p-4 z-50">
      <div className="mb-4 px-4 py-3 bg-black/50 rounded-lg">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTextChange(e.target.value);
          }}
          className="w-full bg-transparent text-white text-xl outline-none"
          placeholder="Type here..."
          autoFocus
        />
      </div>

      <div className="max-w-2xl mx-auto">
        {currentLayout.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-2 mb-2">
            {rowIndex === 2 && (
              <button
                onClick={() => handleKeyPress('shift')}
                className={`px-4 py-3 rounded-lg text-white font-medium
                  ${isShifted ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                Shift
              </button>
            )}
            
            {row.map((key, keyIndex) => (
              <button
                key={keyIndex}
                onClick={() => handleKeyPress(key)}
                className="w-10 h-12 rounded-lg text-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-all"
              >
                {isShifted ? key.toUpperCase() : key}
              </button>
            ))}

            {rowIndex === 2 && (
              <button
                onClick={() => handleKeyPress('backspace')}
                className="px-4 py-3 rounded-lg bg-gray-700 text-white"
              >
                ⌫
              </button>
            )}
          </div>
        ))}

        <div className="flex justify-center gap-2 mt-2">
          <button
            onClick={() => setLayout(l => l === 'qwerty' ? 'numbers' : 'qwerty')}
            className="px-6 py-3 rounded-lg bg-gray-700 text-white font-medium"
          >
            {layout === 'qwerty' ? '123' : 'ABC'}
          </button>
          
          <button
            onClick={() => handleKeyPress('space')}
            className="px-12 py-3 rounded-lg bg-gray-700 text-white"
          >
            space
          </button>
          
          <button
            onClick={() => handleKeyPress('enter')}
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium"
          >
            Done
          </button>
        </div>
      </div>

      <div className="absolute top-2 right-4 text-gray-500 text-sm">
        Press ESC to close
      </div>
    </div>
  );
}
