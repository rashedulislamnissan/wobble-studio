/**
 * Auto-quality governor (§11): when frame time stays high, step quality down — render
 * scale, solver substeps, shadow resolution, particles — one notch at a time. Lattice and
 * mesh resolution can't change under a live object, so lower levels also make the *next*
 * object lighter. It never steps back up within a session (avoids oscillating).
 */
export interface QualityTargets {
  setPixelRatio(r: number): void;
  setSubsteps(n: number): void;
  setShadowMapSize(n: number): void;
  setParticleAmount(f: number): void;
  setFutureResolution(lattice: number, mesh: number): void;
}

const SLOW_FRAME_MS = 23; // sustained below ~43 fps
const WINDOW_MS = 2500;

export class QualityGovernor {
  level = 0;
  private slowFor = 0;
  private settle = 3000; // ignore the first seconds (loading, JIT warm-up)

  constructor(
    private readonly t: QualityTargets,
    private readonly dpr: number,
  ) {}

  /** Feed the smoothed frame time once per frame. */
  update(frameMs: number, elapsedMs: number) {
    if (this.settle > 0) {
      this.settle -= elapsedMs;
      return;
    }
    this.slowFor = frameMs > SLOW_FRAME_MS ? this.slowFor + elapsedMs : 0;
    if (this.slowFor < WINDOW_MS || this.level >= 3) return;
    this.slowFor = 0;
    this.level++;
    this.settle = 1500; // let the change take effect before judging again
    if (this.level === 1) {
      this.t.setPixelRatio(Math.min(this.dpr, 1.5));
      this.t.setSubsteps(10);
    } else if (this.level === 2) {
      this.t.setPixelRatio(1);
      this.t.setShadowMapSize(1024);
      this.t.setParticleAmount(0.5);
      this.t.setFutureResolution(8, 52);
    } else {
      this.t.setPixelRatio(0.8);
      this.t.setSubsteps(7);
      this.t.setFutureResolution(7, 44);
    }
  }
}
