/**
 * The studio runtime: renderer + stage + fixed loop + pointer routing + one specimen.
 * UI layers talk to it through a small API (setters and a per-frame stats callback).
 */
import type { Material } from 'three/webgpu';
import type { ObjectMesher } from '../objects/build';
import type { Shape, Variant } from '../objects/types';
import { SIM } from '../config';
import { audio } from '../audio/engine';
import { Particles, type ParticleKind } from '../render/particles';
import { createRenderer, type RendererKind } from '../render/renderer';
import { StageOverlay } from '../ui/stageOverlay';
import { Stage } from '../render/stage';
import type { SoftBodyParams } from '../sim/softbody';
import type { Tint } from '../tint/tint';
import { HandTool } from '../tools/hand';
import type { Tool } from '../tools/tool';
import { FixedLoop, FpsMeter } from './loop';
import { PointerRouter } from './pointer';
import { QualityGovernor } from './quality';
import { RENDER } from '../config';
import { Specimen } from './specimen';

export interface FrameStats {
  fps: number;
  renderer: RendererKind;
  massG: number;
  volumePct: number;
  kinetic: number;
  pieces: number;
}

export interface Quality {
  /** Lattice cells across the object's largest dimension. */
  resolution: number;
  substeps: number;
  /** Render mesh grid resolution. */
  meshResolution: number;
}

/** Landing speeds (units/s) mapped to sound intensity 0..1. */
const IMPACT_MIN_SPEED = 0.7;
const IMPACT_FULL_SPEED = 5;

export class Runtime {
  readonly stage: Stage;
  readonly loop: FixedLoop;
  readonly fps = new FpsMeter();
  readonly pointer: PointerRouter;
  specimen: Specimen | null = null;
  displayDensity = 1;
  onFrame: ((s: FrameStats) => void) | null = null;
  /** Called once per physics step after the solver (special actions animate here). */
  onStep: ((dt: number) => void) | null = null;
  readonly particles: Particles;
  readonly overlay = new StageOverlay();
  /** Debris style for the current object (set by the studio). */
  debrisStyle: { kind: ParticleKind; color: string } = { kind: 'shimmer', color: '#ffffff' };
  objectId = '';
  /** Crumbly objects shed debris when they land hard. */
  crumbles = false;
  /** Called after a successful cut. */
  onCut: (() => void) | null = null;
  private statsTimer = 0;
  private readonly governor: QualityGovernor;
  private pendingCapture: ((b: Blob | null) => void) | null = null;
  private readonly footprint = { x: 0, z: 0, radius: 0.5, minY: 0 };
  quality: Quality;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly kind: RendererKind,
    private readonly renderer: Awaited<ReturnType<typeof createRenderer>>['renderer'],
  ) {
    this.stage = new Stage(renderer);
    this.particles = new Particles(this.stage.scene);
    canvas.parentElement?.insertBefore(this.overlay.root, canvas.nextSibling);
    this.quality = Runtime.defaultQuality();
    this.loop = new FixedLoop({
      step: (dt) => {
        this.pointer.step(dt);
        this.specimen?.step(dt);
        this.onStep?.(dt);
      },
      render: (alpha, frameMs, now) => this.render(alpha, frameMs, now),
    });
    this.pointer = new PointerRouter(
      canvas,
      this.stage.camera,
      this.stage.scene,
      {
        sound: (e, i) => audio.play(e, i),
        stiffness: () => this.specimen?.body.params.stiffness ?? 20,
        firstGesture: () => audio.unlock(),
        debris: (at, n, dir, color) =>
          this.particles.burst(this.debrisStyle.kind, at, n, color ?? this.debrisStyle.color, dir),
        objectId: () => this.objectId,
        overlay: this.overlay,
        afterCut: () => this.onCut?.(),
      },
      new HandTool(),
    );
    const dpr = window.devicePixelRatio || 1;
    this.governor = new QualityGovernor(
      {
        setPixelRatio: (r) => {
          renderer.setPixelRatio(Math.min(r, RENDER.maxPixelRatio));
          this.resize();
        },
        setSubsteps: (n) => {
          this.quality.substeps = n;
          if (this.specimen) this.specimen.substepCount = n;
        },
        setShadowMapSize: (n) => {
          const sh = this.stage.keyLight.shadow;
          sh.mapSize.set(n, n);
          sh.map?.dispose();
          sh.map = null;
        },
        setParticleAmount: (f) => {
          this.particles.amount = Math.min(this.particles.amount, f);
        },
        setFutureResolution: (lattice, mesh) => {
          this.quality.resolution = Math.min(this.quality.resolution, lattice);
          this.quality.meshResolution = Math.min(this.quality.meshResolution, mesh);
        },
      },
      dpr,
    );
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** PNG of the next rendered frame (read right after rendering, before compositing). */
  grabFrame(): Promise<Blob | null> {
    return new Promise((resolve) => {
      this.pendingCapture = resolve;
    });
  }

  get qualityLevel() {
    return this.governor.level;
  }

  static async create(canvas: HTMLCanvasElement, forceWebGL: boolean) {
    const { renderer, kind } = await createRenderer(canvas, forceWebGL);
    const rt = new Runtime(canvas, kind, renderer);
    await renderer.setAnimationLoop((t: number) => rt.loop.tick(t));
    return rt;
  }

  /** Phones and low-core devices start lighter. */
  static defaultQuality(): Quality {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    if (coarse || cores <= 4) return { resolution: 8, substeps: 10, meshResolution: 52 };
    return { resolution: SIM.latticeResolution, substeps: SIM.substeps, meshResolution: 72 };
  }

  setSpecimen(
    shape: Shape,
    mesher: ObjectMesher,
    variant: Variant,
    params: SoftBodyParams,
    material: Material,
    dropHeight = 0.5,
  ) {
    this.pointer.detach();
    const old = this.specimen;
    this.specimen = new Specimen(this.stage.scene, {
      shape,
      mesher,
      variant,
      params,
      material,
      resolution: this.quality.resolution,
      dropHeight,
    });
    this.specimen.substepCount = this.quality.substeps;
    this.pointer.specimen = this.specimen;
    // Aim at the middle of the object so tall and flat things both sit well in frame.
    this.pointer.controls.target.y = Math.max(0.25, this.specimen.height * 0.45);
    if (old) {
      const oldMat = old.meshes()[0]?.material as Material | undefined;
      old.dispose();
      if (oldMat && oldMat !== material) oldMat.dispose();
    }
  }

  setParams(p: Partial<SoftBodyParams>) {
    if (this.specimen) Object.assign(this.specimen.body.params, p);
  }

  setTint(t: Tint, instant = false) {
    this.stage.setTint(t, instant || matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    if (!this.loop.paused) this.particles.update(Math.min(0.05, frameMs / 1000) * this.loop.timeScale);
    const s = this.specimen;
    if (s) {
      s.render(alpha);
      const f = s.footprint(this.footprint);
      this.stage.updateContact(f.x, f.z, f.radius, f.minY);
      const impact = s.body.takeImpact();
      if (impact.speed > IMPACT_MIN_SPEED && impact.fraction > 0.01) {
        const i = (impact.speed - IMPACT_MIN_SPEED) / (IMPACT_FULL_SPEED - IMPACT_MIN_SPEED);
        audio.play('impact', i * Math.min(1, impact.fraction * 8));
        if (this.crumbles && i > 0.25) {
          const f = this.footprint;
          this.particles.burst(this.debrisStyle.kind, [f.x, 0.04, f.z], Math.round(6 + i * 18), this.debrisStyle.color, [0, 0.5, 0]);
        }
      }
    }
    this.renderer.render(this.stage.scene, this.stage.camera);
    if (this.pendingCapture) {
      const done = this.pendingCapture;
      this.pendingCapture = null;
      this.canvas.toBlob((b) => done(b), 'image/png');
    }
    this.governor.update(this.fps.frameMs, frameMs);

    // Stats are cheap but not free; 8 updates a second reads as live.
    this.statsTimer += frameMs;
    if (this.statsTimer > 125 && s && this.onFrame) {
      this.statsTimer = 0;
      const st = s.stats(this.displayDensity);
      this.onFrame({ fps: this.fps.fps, renderer: this.kind, ...st });
    }
  }
}
