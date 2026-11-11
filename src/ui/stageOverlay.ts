/**
 * A 2D layer over the stage for tool guides: the knife's drawn line, the wavy knife's
 * ripple, the cutter's stamp outline. Purely visual (pointer-events: none).
 */
const NS = 'http://www.w3.org/2000/svg';

export type StampShape = 'star' | 'heart' | 'flower' | 'round';

export class StageOverlay {
  readonly root: SVGSVGElement;
  private readonly path: SVGPathElement;
  private readonly stamp: SVGPathElement;

  constructor() {
    this.root = document.createElementNS(NS, 'svg');
    this.root.setAttribute('class', 'stage-overlay');
    this.root.setAttribute('aria-hidden', 'true');
    this.path = document.createElementNS(NS, 'path');
    this.path.setAttribute('class', 'stage-overlay__line');
    this.stamp = document.createElementNS(NS, 'path');
    this.stamp.setAttribute('class', 'stage-overlay__stamp');
    this.root.append(this.path, this.stamp);
  }

  /** Straight or rippled guide between two points (client px). */
  line(x0: number, y0: number, x1: number, y1: number, ripple = 0, wavelength = 26) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (ripple <= 0 || len < 1) {
      this.path.setAttribute('d', `M${x0},${y0}L${x1},${y1}`);
      return;
    }
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const steps = Math.max(8, Math.round(len / 3));
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * len;
      const o = Math.sin((s / wavelength) * Math.PI * 2) * ripple;
      d += `${i ? 'L' : 'M'}${(x0 + ux * s - uy * o).toFixed(1)},${(y0 + uy * s + ux * o).toFixed(1)}`;
    }
    this.path.setAttribute('d', d);
  }

  clearLine() {
    this.path.setAttribute('d', '');
  }

  /** Stamp outline centred at (x, y) with radius r (client px). */
  showStamp(shape: StampShape, x: number, y: number, r: number) {
    const pts = stampOutline(shape, 72).map(([u, v]) => `${(x + u * r).toFixed(1)},${(y - v * r).toFixed(1)}`);
    this.stamp.setAttribute('d', `M${pts.join('L')}Z`);
  }

  hideStamp() {
    this.stamp.setAttribute('d', '');
  }
}

/** Unit-radius outline points for the cutter shapes (y up). */
export function stampOutline(shape: StampShape, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let r = 1;
    if (shape === 'star') {
      const k = (t + Math.PI / 2) % ((Math.PI * 2) / 5);
      const f = Math.abs(k / ((Math.PI * 2) / 5) - 0.5) * 2; // 1 at points, 0 between
      r = 0.5 + 0.5 * f;
    } else if (shape === 'flower') {
      r = 0.78 + 0.22 * Math.cos(5 * (t - Math.PI / 2));
    } else if (shape === 'heart') {
      // Classic heart curve, normalised to roughly unit radius.
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push([x / 17, (y + 3) / 17]);
      continue;
    }
    out.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return out;
}
