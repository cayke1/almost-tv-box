import { screen } from 'electron';

interface VelocityTracker {
  dx: number;
  dy: number;
  timestamp: number;
}

export class CursorManager {
  private x: number = 0;
  private y: number = 0;
  private velocityHistory: VelocityTracker[] = [];
  private maxHistorySize: number = 5;
  private isDragging: boolean = false;
  private sensitivity: number = 1.0;
  private smoothing: number = 0.5;

  constructor() {
    const display = screen.getPrimaryDisplay();
    this.x = display.workAreaSize.width / 2;
    this.y = display.workAreaSize.height / 2;
  }

  calculateNewPosition(dx: number, dy: number): { x: number; y: number } {
    this.addVelocity(dx, dy);

    const smoothed = this.getSmoothedMovement();

    const finalDx = smoothed.dx * this.sensitivity;
    const finalDy = smoothed.dy * this.sensitivity;

    const multiplier = this.isDragging ? 2.0 : 1.0;

    this.x += finalDx * multiplier;
    this.y += finalDy * multiplier;

    return { x: this.x, y: this.y };
  }

  private addVelocity(dx: number, dy: number) {
    this.velocityHistory.push({
      dx,
      dy,
      timestamp: Date.now(),
    });

    if (this.velocityHistory.length > this.maxHistorySize) {
      this.velocityHistory.shift();
    }
  }

  private getSmoothedMovement(): { dx: number; dy: number } {
    if (this.velocityHistory.length === 0) {
      return { dx: 0, dy: 0 };
    }

    let totalWeight = 0;
    let weightedDx = 0;
    let weightedDy = 0;

    this.velocityHistory.forEach((v, index) => {
      const weight = (index + 1) / this.velocityHistory.length;
      weightedDx += v.dx * weight;
      weightedDy += v.dy * weight;
      totalWeight += weight;
    });

    return {
      dx: weightedDx / totalWeight,
      dy: weightedDy / totalWeight,
    };
  }

  startDrag() {
    this.isDragging = true;
  }

  endDrag() {
    this.isDragging = false;
  }

  setSensitivity(sensitivity: number) {
    this.sensitivity = Math.max(0.1, Math.min(2.0, sensitivity));
  }

  setSmoothing(smoothing: number) {
    this.smoothing = Math.max(0, Math.min(1, smoothing));
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  reset() {
    const display = screen.getPrimaryDisplay();
    this.x = display.workAreaSize.width / 2;
    this.y = display.workAreaSize.height / 2;
    this.velocityHistory = [];
  }
}
