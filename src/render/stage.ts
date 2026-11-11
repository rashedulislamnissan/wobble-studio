/**
 * The studio stage: tinted background with a soft spotlight halo, key/rim/fill lights,
 * a tinted shadow catcher and a soft contact shadow. Tint changes crossfade (§8.7).
 */
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowNodeMaterial,
  VSMShadowMap,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  float,
  length,
  mix,
  screenUV,
  positionGeometry,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RENDER } from '../config';
import type { Tint } from '../tint/tint';

export const TINT_FADE_MS = 600;

interface StageColors {
  background: Color;
  spotlight: Color;
  shadow: Color;
}

export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly keyLight: DirectionalLight;

  private readonly uBackground = uniform(new Color('#E9EEF3'));
  private readonly uSpotlight = uniform(new Color('#F4F7FA'));
  private readonly uShadow = uniform(new Color('#5A6E8A'));
  private readonly uAspect = uniform(1);
  private readonly uContact = uniform(1);
  private readonly contact: Mesh;
  private readonly shadowCatcher: Mesh;

  private fadeFrom: StageColors | null = null;
  private fadeTo: StageColors | null = null;
  private fadeStart = 0;

  constructor(private readonly renderer: WebGPURenderer) {
    this.camera = new PerspectiveCamera(RENDER.fov, 1, 0.1, 100);
    this.camera.position.set(0, RENDER.cameraHeight, RENDER.cameraDistance);
    this.camera.lookAt(0, RENDER.lookAtHeight, 0);

    // Background: flat tint with a soft lighter halo behind the object. Drawn as our own
    // full-screen quad (not scene.background) so it skips tone mapping and matches the CSS
    // tint exactly; only the object gets the filmic highlight rolloff.
    const centred = screenUV.sub(vec2(0.5, 0.52)).mul(vec2(this.uAspect, 1));
    const halo = smoothstep(float(0.08), float(0.62), length(centred));
    const bgMat = new MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
    bgMat.vertexNode = vec4(positionGeometry.xy, 0.9999, 1);
    bgMat.colorNode = mix(this.uSpotlight, this.uBackground, halo);
    bgMat.toneMapped = false;
    const backdrop = new Mesh(new PlaneGeometry(2, 2), bgMat);
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -100;
    this.scene.add(backdrop);
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;

    // Image-based lighting for glossy highlights (procedural, no downloads).
    const pmrem = new PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    renderer.shadowMap.type = VSMShadowMap;

    const hemi = new HemisphereLight(0xffffff, 0xd9d4cc, 0.9);
    this.scene.add(hemi);

    this.keyLight = new DirectionalLight(0xfffaf2, 2.1);
    this.keyLight.position.set(-2.2, 6, 3.2);
    this.keyLight.castShadow = true;
    const s = this.keyLight.shadow;
    s.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    s.camera.left = -5;
    s.camera.right = 5;
    s.camera.top = 5;
    s.camera.bottom = -5;
    s.camera.near = 1;
    s.camera.far = 14;
    s.radius = 14;
    s.blurSamples = 16;
    s.bias = -0.0004;
    this.scene.add(this.keyLight);

    // Rim light from behind separates the silhouette from the background (§8.5).
    const rim = new DirectionalLight(0xffffff, 1.6);
    rim.position.set(1.5, 2.5, -4);
    this.scene.add(rim);

    // Shadow catcher: invisible floor that only shows the tinted shadow.
    const catcherMat = new ShadowNodeMaterial();
    catcherMat.colorNode = this.uShadow;
    catcherMat.opacity = 0.55;
    catcherMat.transparent = true;
    catcherMat.toneMapped = false;
    // Sized to the shadow camera frustum: beyond it VSM samples garbage (dotted artefacts).
    this.shadowCatcher = new Mesh(new PlaneGeometry(6, 6), catcherMat);
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.receiveShadow = true;
    this.scene.add(this.shadowCatcher);

    // Contact shadow: soft radial darkening right under the object; fades with height.
    const contactMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const r = length(uv().sub(vec2(0.5)).mul(2));
    contactMat.colorNode = this.uShadow;
    contactMat.opacityNode = smoothstep(float(1), float(0.0), r).pow(1.8).mul(this.uContact).mul(0.5);
    this.contact = new Mesh(new PlaneGeometry(1, 1), contactMat);
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.002;
    this.contact.renderOrder = 1;
    this.scene.add(this.contact);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep the object comfortably framed on narrow (phone) screens.
    const narrow = width / height < 0.85;
    this.camera.fov = narrow ? RENDER.fov * 1.35 : RENDER.fov;
    this.camera.updateProjectionMatrix();
    this.uAspect.value = width / height;
  }

  /** Place the contact shadow under the object: footprint radius and lowest point height. */
  updateContact(x: number, z: number, radius: number, lowestY: number) {
    this.contact.position.x = x;
    this.contact.position.z = z;
    const size = radius * 2.6;
    this.contact.scale.set(size, size, 1);
    this.uContact.value = Math.max(0, 1 - lowestY / (radius * 1.6));
  }

  setTint(tint: Tint, instant = false) {
    const to: StageColors = {
      background: new Color(tint.background),
      spotlight: new Color(tint.spotlight),
      shadow: new Color(tint.shadow),
    };
    if (instant) {
      this.apply(to);
      this.fadeFrom = this.fadeTo = null;
      return;
    }
    this.fadeFrom = {
      background: this.uBackground.value.clone(),
      spotlight: this.uSpotlight.value.clone(),
      shadow: this.uShadow.value.clone(),
    };
    this.fadeTo = to;
    this.fadeStart = performance.now();
  }

  /** Advance the tint crossfade; call once per frame. */
  update(now: number) {
    if (!this.fadeFrom || !this.fadeTo) return;
    const t = Math.min(1, (now - this.fadeStart) / TINT_FADE_MS);
    const e = t * t * (3 - 2 * t);
    this.uBackground.value.lerpColors(this.fadeFrom.background, this.fadeTo.background, e);
    this.uSpotlight.value.lerpColors(this.fadeFrom.spotlight, this.fadeTo.spotlight, e);
    this.uShadow.value.lerpColors(this.fadeFrom.shadow, this.fadeTo.shadow, e);
    if (t >= 1) this.fadeFrom = this.fadeTo = null;
  }

  private apply(c: StageColors) {
    this.uBackground.value.copy(c.background);
    this.uSpotlight.value.copy(c.spotlight);
    this.uShadow.value.copy(c.shadow);
  }
}
