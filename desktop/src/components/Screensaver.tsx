import { useEffect, useState, useRef } from 'react';
import { useIdleTimer } from '../hooks/useIdleTimer';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface ScreensaverProps {
  idleTimeout?: number;
  onExit?: () => void;
}

export function Screensaver({ idleTimeout = 300000, onExit }: ScreensaverProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const { isIdle } = useIdleTimer({
    timeout: idleTimeout,
    onIdle: () => {},
    onActive: () => onExit?.(),
  });

  useEffect(() => {
    if (!isIdle) return;

    const initialParticles: Particle[] = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    }));

    setParticles(initialParticles);

    const animate = () => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: (p.x + p.vx + window.innerWidth) % window.innerWidth,
        y: (p.y + p.vy + window.innerHeight) % window.innerHeight,
      })));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isIdle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
      ctx.fill();
    });
  }, [particles]);

  if (!isIdle) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black cursor-none">
      <canvas ref={canvasRef} />
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-white/10 text-6xl font-bold tracking-widest">
          TV-OS
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-sm">
        Move mouse or press any key to exit
      </div>
    </div>
  );
}
