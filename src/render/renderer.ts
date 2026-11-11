import { WebGPURenderer } from 'three/webgpu';
import { RENDER } from '../config';

export type RendererKind = 'webgpu' | 'webgl';

export interface RendererInfo {
  renderer: WebGPURenderer;
  kind: RendererKind;
}

/** True when the browser can render at all (WebGPU or WebGL2). */
export function canRender(): boolean {
  if ('gpu' in navigator) return true;
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Create the renderer: WebGPU when available, otherwise three's WebGL2 backend.
 * `?renderer=webgl` forces the fallback for testing.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  forceWebGL: boolean,
): Promise<RendererInfo> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    forceWebGL,
    powerPreference: 'high-performance',
  });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.shadowMap.enabled = true;
  const backend = renderer.backend as { isWebGPUBackend?: boolean };
  return { renderer, kind: backend.isWebGPUBackend ? 'webgpu' : 'webgl' };
}
