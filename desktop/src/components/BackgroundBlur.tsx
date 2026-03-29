import { useEffect, useState } from 'react';

interface BackgroundBlurProps {
  active: boolean;
  children?: React.ReactNode;
}

export function BackgroundBlur({ active, children }: BackgroundBlurProps) {
  const [shouldBlur, setShouldBlur] = useState(false);

  useEffect(() => {
    if (active) {
      setShouldBlur(true);
    } else {
      const timeout = setTimeout(() => setShouldBlur(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [active]);

  return (
    <div
      className={`
        fixed inset-0 z-40 transition-all duration-300
        ${shouldBlur ? 'bg-black/60 backdrop-blur-md' : 'bg-transparent'}
      `}
    >
      {children}
    </div>
  );
}
