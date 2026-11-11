/**
 * Routes pointer input on the stage: the active tool gets first refusal; anything it
 * declines (empty space, or a second finger) goes to the orbit camera.
 */
import { Raycaster, Vector2, type PerspectiveCamera } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RENDER } from '../config';
import type { Tool, ToolContext } from '../tools/tool';
import type { Specimen } from './specimen';

export class PointerRouter {
  readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private activePointer: number | null = null;
  private readonly touches = new Set<number>();
  tool: Tool;
  specimen: Specimen | null = null;
  /** Called on the first gesture (unlock audio, hide hints...). */
  onFirstGesture: (() => void) | null = null;
  onGrabChange: ((active: boolean) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
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

  /** Built lazily: class fields initialise before constructor parameter properties. */
  private ctx: ToolContext | null = null;

  get context(): ToolContext {
    if (this.ctx) return this.ctx;
    this.ctx = {
      camera: this.camera,
      specimen: undefined as unknown as Specimen,
      pick: (x, y) => {
        if (!this.specimen) return null;
        this.ndc.set(x, y);
        this.raycaster.setFromCamera(this.ndc, this.camera);
        const mesh = this.specimen.view.mesh;
        mesh.geometry.computeBoundingSphere();
        const hits = this.raycaster.intersectObject(mesh, false);
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
    return this.ctx;
  }

  setTool(tool: Tool) {
    this.cancel();
    this.tool = tool;
    this.setCursor(tool.cursor.idle);
  }

  cancel() {
    if (this.activePointer !== null && this.specimen) {
      this.context.specimen = this.specimen;
      this.tool.cancel(this.context);
      this.onGrabChange?.(false);
    }
    this.activePointer = null;
  }

  private sample(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      ndcX: ((e.clientX - r.left) / r.width) * 2 - 1,
      ndcY: -((e.clientY - r.top) / r.height) * 2 + 1,
      t: performance.now(),
    };
  }

  private onDown = (e: PointerEvent) => {
    this.onFirstGesture?.();
    if (e.pointerType === 'touch') this.touches.add(e.pointerId);
    // A second finger means "orbit/zoom": release the object and let the camera have it.
    if (this.touches.size > 1) {
      this.cancel();
      return;
    }
    if (e.button !== 0 || !this.specimen || this.activePointer !== null) return;
    this.context.specimen = this.specimen;
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
    const s = this.sample(e);
    this.setCursor(this.context.pick(s.ndcX, s.ndcY) ? this.tool.cursor.hover : this.tool.cursor.idle);
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
