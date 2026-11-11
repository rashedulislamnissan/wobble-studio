/**
 * Fixed-timestep simulation with render interpolation: physics behaves identically at
 * 60, 90, 120 or 144 Hz displays; rendering lerps between the last two physics states.
 */
import { SIM } from '../config';

export interface LoopCallbacks {
  /** Run one fixed physics step of `dt` seconds (already scaled by time scale). */
  step(dt: number): void;
  /** Render with interpolation factor alpha in [0, 1). */
  render(alpha: number, frameMs: number, now: number): void;
}

export class FixedLoop {
  private acc = 0;
  private last = -1;
  timeScale = 1;
  paused = false;
  readonly stepDt = 1 / SIM.stepHz;

  constructor(private readonly cb: LoopCallbacks) {}

  tick(now: number) {
    if (this.last < 0) this.last = now;
    const frameMs = now - this.last;
    this.last = now;
    if (!this.paused) {
      // Clamp long frames (tab switches) so we never spiral.
      this.acc += Math.min(frameMs / 1000, this.stepDt * SIM.maxStepsPerFrame) * this.timeScale;
      while (this.acc >= this.stepDt) {
        this.cb.step(this.stepDt);
        this.acc -= this.stepDt;
      }
    }
    this.cb.render(this.paused ? 1 : this.acc / this.stepDt, frameMs, now);
  }
}

/** Exponentially smoothed fps meter. */
export class FpsMeter {
  fps = 60;
  frameMs = 16.7;
  push(frameMs: number) {
    if (frameMs <= 0 || frameMs > 1000) return;
    this.frameMs += (frameMs - this.frameMs) * 0.05;
    this.fps = 1000 / this.frameMs;
  }
}
