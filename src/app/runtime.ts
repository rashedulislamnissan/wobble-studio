/**
 * The studio runtime: renderer + stage + fixed loop + pointer routing + one specimen.
 * UI layers talk to it through a small API (setters and a per-frame stats callback).
 */
import type { Material } from 'three/webgpu';
import { SIM } from '../config';
import { createRenderer, type RendererKind } from '../render/renderer';
import { Stage } from '../render/stage';
import type { SoftBodyParams } from '../sim/softbody';
import type { Tint } from '../tint/tint';
import { HandTool } from '../tools/hand';
import type { Tool } from '../tools/tool';
import { FixedLoop, FpsMeter } from './loop';
import { PointerRouter } from './pointer';
import { Specimen, type SpecimenShape } from './specimen';

export interface FrameStats {
  fps: number;
  renderer: RendererKind;
  massG: number;
  volumePct: number;
  kinetic: number;
  pieces: number;
}

export interface Quality {
  resolution: number;
  substeps: number;
  renderDetail: number;
}

export class Runtime {
  readonly stage: Stage;
  readonly loop: FixedLoop;
  readonly fps = new FpsMeter();
  readonly pointer: PointerRouter;
  specimen: Specimen | null = null;
  displayDensity = 1;
  onFrame: ((s: FrameStats) => void) | null = null;
  private statsTimer = 0;
  private readonly footprint = { x: 0, z: 0, radius: 0.5, minY: 0 };
  quality: Quality;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly kind: RendererKind,
    private readonly renderer: Awaited<ReturnType<typeof createRenderer>>['renderer'],
  ) {
    this.stage = new Stage(renderer);
    this.quality = Runtime.defaultQuality();
    this.loop = new FixedLoop({
      step: (dt) => this.specimen?.step(dt),
      render: (alpha, frameMs, now) => this.render(alpha, frameMs, now),
    });
    this.pointer = new PointerRouter(canvas, this.stage.camera, new HandTool());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  static async create(canvas: HTMLCanvasElement, forceWebGL: boolean) {
    const { renderer, kind } = await createRenderer(canvas, forceWebGL);
    const rt = new Runtime(canvas, kind, renderer);
    await renderer.setAnimationLoop((t: number) => rt.loop.tick(t));
    return rt;
  }

  /** Phones and low-core devices start lighter; the governor adjusts from there. */
  static defaultQuality(): Quality {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    if (coarse || cores <= 4) return { resolution: 8, substeps: 10, renderDetail: 20 };
    return { resolution: SIM.latticeResolution, substeps: SIM.substeps, renderDetail: 28 };
  }

  setSpecimen(shape: SpecimenShape, params: SoftBodyParams, material: Material, dropHeight = 0.5) {
    this.pointer.cancel();
    this.specimen?.dispose();
    this.specimen = new Specimen(this.stage.scene, {
      shape,
      params,
      material,
      resolution: this.quality.resolution,
      renderDetail: this.quality.renderDetail,
      dropHeight,
    });
    this.specimen.body.substeps = this.quality.substeps;
    this.pointer.specimen = this.specimen;
  }

  setParams(p: Partial<SoftBodyParams>) {
    if (this.specimen) Object.assign(this.specimen.body.params, p);
  }

  setTint(t: Tint, instant = false) {
    this.stage.setTint(t, instant);
  }

  setTool(tool: Tool) {
    this.pointer.setTool(tool);
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.stage.resize(w, h);
  }

  private render(alpha: number, frameMs: number, now: number) {
    this.fps.push(frameMs);
    this.pointer.update();
    this.stage.update(now);
    const s = this.specimen;
    if (s) {
      s.render(alpha);
      const f = s.view.footprint(this.footprint);
      this.stage.updateContact(f.x, f.z, f.radius, f.minY);
    }
    this.renderer.render(this.stage.scene, this.stage.camera);

    // Stats are cheap but not free; 8 updates a second reads as live.
    this.statsTimer += frameMs;
    if (this.statsTimer > 125 && s && this.onFrame) {
      this.statsTimer = 0;
      const st = s.stats(this.displayDensity);
      this.onFrame({ fps: this.fps.fps, renderer: this.kind, ...st });
    }
  }
}
