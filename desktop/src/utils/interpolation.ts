export interface InterpolationConfig {
  smoothing: number;
  minDelta: number;
  maxDelta: number;
}

const defaultConfig: InterpolationConfig = {
  smoothing: 0.3,
  minDelta: 0.5,
  maxDelta: 20,
};

export class SmoothInterpolator {
  private currentX: number = 0;
  private currentY: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;
  private config: InterpolationConfig;

  constructor(config: Partial<InterpolationConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  updateTarget(dx: number, dy: number) {
    const clampedDx = Math.max(-this.config.maxDelta, 
                       Math.min(this.config.maxDelta, dx));
    const clampedDy = Math.max(-this.config.maxDelta, 
                       Math.min(this.config.maxDelta, dy));

    this.targetX += clampedDx;
    this.targetY += clampedDy;
  }

  tick(): { x: number; y: number; moved: boolean } {
    const prevX = this.currentX;
    const prevY = this.currentY;

    this.currentX += (this.targetX - this.currentX) * this.config.smoothing;
    this.currentY += (this.targetY - this.currentY) * this.config.smoothing;

    if (Math.abs(this.targetX - this.currentX) < this.config.minDelta) {
      this.currentX = this.targetX;
    }
    if (Math.abs(this.targetY - this.currentY) < this.config.minDelta) {
      this.currentY = this.targetY;
    }

    return {
      x: Math.round(this.currentX),
      y: Math.round(this.currentY),
      moved: prevX !== this.currentX || prevY !== this.currentY,
    };
  }

  setTarget(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }
}

export class VelocityTracker {
  private samples: { dx: number; dy: number; time: number }[] = [];
  private maxSamples: number = 10;
  private decayFactor: number = 0.95;

  addSample(dx: number, dy: number) {
    this.samples.push({ dx, dy, time: Date.now() });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getVelocity(): { vx: number; vy: number } {
    if (this.samples.length < 2) {
      return { vx: 0, vy: 0 };
    }

    const recent = this.samples.slice(-5);
    let totalDx = 0;
    let totalDy = 0;

    for (const sample of recent) {
      totalDx += sample.dx;
      totalDy += sample.dy;
    }

    return {
      vx: totalDx / recent.length,
      vy: totalDy / recent.length,
    };
  }

  clear() {
    this.samples = [];
  }
}
