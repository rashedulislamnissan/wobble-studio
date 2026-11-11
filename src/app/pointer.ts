/**
 * Routes pointer input on the stage: the active tool gets first refusal; anything it
 * declines (empty space, or a second finger) goes to the orbit camera.
 */
import { MOUSE, Raycaster, Vector2, Vector3, type PerspectiveCamera, type Scene } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RENDER } from '../config';
import type { SoundEvent } from '../audio/engine';
import type { PointerSample, Tool, ToolContext } from '../tools/tool';
import type { StageOverlay } from '../ui/stageOverlay';
import type { Specimen } from './specimen';

export interface PointerHooks {
  sound(event: SoundEvent, intensity: number): void;
  stiffness(): number;
  /** First interaction of the session (unlock audio). */
  firstGesture(): void;
  debris(at: [number, number, number], count: number, dir?: [number, number, number], color?: string): void;
  objectId(): string;
  overlay: StageOverlay;
  /** A cut changed the pieces (stats, sounds). */
  afterCut?(): void;
}

export class PointerRouter {
  readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private activePointer: number | null = null;
  private readonly touches = new Set<number>();
  private ctx: ToolContext | null = null;
  tool: Tool;
  specimen: Specimen | null = null;
  onGrabChange: ((active: boolean) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    private readonly scene: Scene,
    private readonly hooks: PointerHooks,
    initialTool: Tool,
  ) {
    this.tool = initialTool;
    this.controls = new OrbitControls(camera, canvas);
    this.controls.target.set(0, RENDER.lookAtHeight, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3.6;
    this.controls.maxDistance = 10;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minAzimuthAngle = -1.2;
    this.controls.maxAzimuthAngle = 1.2;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.6;
    // Right-drag also orbits, so cutting tools (which own left-drag) can still turn the view.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    this.controls.update();

    // Capture phase on the canvas runs before OrbitControls' own listener.
    canvas.addEventListener('pointerdown', this.onDown, { capture: true });
    canvas.addEventListener('pointermove', this.onHover);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.style.touchAction = 'none';
    this.setCursor(this.tool.cursor.idle);
  }

  get context(): ToolContext {
    if (!this.ctx) {
      this.ctx = {
        camera: this.camera,
        scene: this.scene,
        specimen: undefined as unknown as Specimen,
        stiffness: () => this.hooks.stiffness(),
        sound: (e, i) => this.hooks.sound(e, i),
        debris: (at, n, dir, color) => this.hooks.debris(at, n, dir, color),
        overlay: this.hooks.overlay,
        objectId: () => this.hooks.objectId(),
        cut: (field, opts) => {
          if (!this.specimen) return false;
          const ok = this.specimen.cut(field, opts);
          if (ok) this.hooks.afterCut?.();
          return ok;
        },
        toScreen: (x, y, z) => {
          const v = new Vector3(x, y, z).project(this.camera);
          const r = this.canvas.getBoundingClientRect();
          return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
        },
        pick: (x, y) => {
          if (!this.specimen) return null;
          this.ndc.set(x, y);
          this.raycaster.setFromCamera(this.ndc, this.camera);
          const meshes = this.specimen.meshes();
          for (const m of meshes) m.geometry.computeBoundingSphere();
          const hits = this.raycaster.intersectObjects(meshes, false);
          return hits[0] ? { point: hits[0].point.clone(), object: hits[0].object } : null;
        },
        ray: (x, y) => {
          this.ndc.set(x, y);
          this.raycaster.setFromCamera(this.ndc, this.camera);
          return {
            origin: this.raycaster.ray.origin.clone(),
            direction: this.raycaster.ray.direction.clone(),
          };
        },
      };
    }
    const ctx = this.ctx!;
    if (this.specimen) ctx.specimen = this.specimen;
    return ctx;
  }

  setTool(tool: Tool) {
    this.cancel();
    if (this.specimen) this.tool.dispose?.(this.context);
    this.tool = tool;
    this.setCursor(tool.cursor.idle);
  }

  /** Called when the specimen is about to change. */
  detach() {
    this.cancel();
    if (this.specimen) this.tool.dispose?.(this.context);
    this.specimen = null;
  }

  cancel() {
    if (this.specimen) this.tool.cancel(this.context);
    if (this.activePointer !== null) this.onGrabChange?.(false);
    this.activePointer = null;
  }

  /** Per physics step: let continuous tools animate. */
  step(dt: number) {
    if (this.specimen && this.tool.update) this.tool.update(this.context, dt);
  }

  private sample(e: PointerEvent): PointerSample {
    const r = this.canvas.getBoundingClientRect();
    return {
      ndcX: ((e.clientX - r.left) / r.width) * 2 - 1,
      ndcY: -((e.clientY - r.top) / r.height) * 2 + 1,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
    };
  }

  private onDown = (e: PointerEvent) => {
    this.hooks.firstGesture();
    if (e.pointerType === 'touch') this.touches.add(e.pointerId);
    // A second finger means "orbit/zoom": release the object and let the camera have it.
    if (this.touches.size > 1) {
      this.cancel();
      return;
    }
    if (e.button !== 0 || !this.specimen || this.activePointer !== null) return;
    if (this.tool.down(this.context, this.sample(e))) {
      this.activePointer = e.pointerId;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      this.setCursor(this.tool.cursor.active);
      this.onGrabChange?.(true);
      this.tool.move(this.context, this.sample(e));
    }
  };

  private onHover = (e: PointerEvent) => {
    if (this.activePointer !== null || e.pointerType !== 'mouse' || e.buttons !== 0) return;
    if (this.tool.anywhere) return this.setCursor(this.tool.cursor.hover);
    const s = this.sample(e);
    const over = !!this.context.pick(s.ndcX, s.ndcY);
    this.setCursor(over ? this.tool.cursor.hover : this.tool.cursor.idle);
    this.tool.hover?.(this.context, s, over);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointer || !this.specimen) return;
    this.tool.move(this.context, this.sample(e));
  };

  private onUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (e.pointerId !== this.activePointer || !this.specimen) return;
    this.tool.up(this.context, this.sample(e));
    this.activePointer = null;
    this.setCursor(this.tool.cursor.hover);
    this.onGrabChange?.(false);
  };

  private setCursor(c: string) {
    this.canvas.style.cursor = c;
  }

  update() {
    this.controls.update();
  }
}
