/**
 * Renderer, lights and the screen overlays — built for mediocre laptops first: one plain render
 * (no post-processing passes, no shadow maps, no reflection probes), matte materials lit by a sun
 * and a sky fill, resolution that adapts to keep the frame rate up. Colour grading happens inside
 * the materials (see worldUniforms); the vignette and the hit/heal flash are CSS overlays (free).
 */
import * as THREE from 'three';
import { verticalFov } from './camera.ts';
import { worldUniforms } from './assets.ts';

export class Stage {
  private container: HTMLElement;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** The colour grade (set by lighting.ts): saturation, contrast and split toning (read by the materials), vignette and flash (CSS). */
  readonly grade = {
    uniforms: {
      uSaturation: worldUniforms.uSaturation,
      uContrast: worldUniforms.uContrast,
      uWarm: worldUniforms.uWarm,
      uCool: worldUniforms.uCool,
      uVignette: { value: 0.32 },
      uFlash: { value: new THREE.Vector4(1, 0.2, 0.15, 0) },
    },
  };
  private sunOffset = new THREE.Vector3(-26, 42, 22);
  private vignette = document.createElement('div');
  private flash = document.createElement('div');
  private door = document.createElement('div');
  private shownVignette = -1;
  private shownFlash = '';
  /** Resolution scale and how high it may go (it backs off when frames get slow). */
  private scale: number;
  private ceiling: number;
  private lastT = performance.now();
  private frameMs = 16.7;
  private slowFor = 0;
  private quickFor = 0;
  /** A step down being tried: the scale and frame time before it, and when it started. */
  private trial: { scale: number; frameMs: number; at: number } | null = null;
  /** Frame time the browser holds us to (a capped frame rate, e.g. a laptop saving energy); 0 if none seen. */
  private capMs = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.ceiling = Math.min(window.devicePixelRatio, 1);
    this.scale = Math.min(window.devicePixelRatio, 1);
    r.setPixelRatio(this.scale);
    r.setSize(container.clientWidth, container.clientHeight);
    r.shadowMap.enabled = false;
    // Neutral keeps colours pure (no filmic hue shifts).
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;
    container.appendChild(r.domElement);
    this.renderer = r;

    // MMO-style field of view: 90° horizontal, vertical follows the window shape.
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(verticalFov(aspect), aspect, 0.05, 800);

    const bg = new THREE.Color('#9fb7c9');
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 70, 150);

    this.hemi = new THREE.HemisphereLight('#c4dcff', '#6b5a43', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe0b5', 3.1);
    this.scene.add(this.sun, this.sun.target);

    for (const [el, cls] of [
      [this.vignette, 'screen-vignette'],
      [this.flash, 'screen-flash'],
      [this.door, 'screen-door'],
    ] as const) {
      el.className = cls;
      container.appendChild(el);
    }
    this.door.style.transition = 'opacity 60ms linear';
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.fov = verticalFov(w / h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setSunDirection(dir: THREE.Vector3): void {
    this.sunOffset.copy(dir).normalize().multiplyScalar(60);
  }

  /** Keeps the sun's direction while the camera moves (no shadows: only its angle matters). */
  followShadow(target: THREE.Vector3, _span: number): void {
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.position.set(target.x + this.sunOffset.x, this.sunOffset.y, target.z + this.sunOffset.z);
  }

  render(): void {
    this.adapt();
    this.renderer.render(this.scene, this.camera);
    this.overlays();
  }

  /**
   * Resolution that keeps the game smooth: when frames run slow (< ~45 fps) for a moment, draw
   * fewer pixels; when they stay quick for a while, try a little more (never back to a level that
   * was too slow). A step down that buys no speed is undone: the browser is capping the frame rate
   * (a laptop saving energy runs at 30), and a blurrier picture wouldn't help.
   */
  private adapt(): void {
    const now = performance.now();
    const dt = now - this.lastT;
    this.lastT = now;
    if (dt > 250) return; // a hitch or a hidden tab, not the steady state
    this.frameMs = this.frameMs * 0.94 + dt * 0.06;
    if (this.trial && now - this.trial.at > 2500) {
      if (this.frameMs > this.trial.frameMs * 0.9) {
        this.capMs = this.trial.frameMs;
        this.ceiling = Math.max(this.ceiling, this.trial.scale);
        this.setScale(this.trial.scale);
      }
      this.trial = null;
    }
    const slow = this.capMs ? Math.max(22, this.capMs * 1.3) : 22;
    this.slowFor = this.frameMs > slow ? this.slowFor + dt : 0;
    this.quickFor = this.frameMs < 17.6 ? this.quickFor + dt : 0;
    if (this.slowFor > 1500 && this.scale > 0.6 && !this.trial) {
      this.trial = { scale: this.scale, frameMs: this.frameMs, at: now };
      this.ceiling = Math.min(this.ceiling, this.scale - 0.05);
      this.setScale(this.scale - 0.1);
    } else if (this.quickFor > 6000 && this.scale + 0.1 <= this.ceiling + 1e-3) {
      this.setScale(this.scale + 0.1);
    }
  }

  private setScale(s: number): void {
    this.scale = Math.round(Math.max(0.6, s) * 100) / 100;
    this.slowFor = 0;
    this.quickFor = 0;
    this.renderer.setPixelRatio(this.scale);
    this.resize();
  }

  /** A travel fade is driven by the saved journey clock, with blackout covering relocation. */
  setDoorFade(alpha: number): void {
    this.door.style.transition = alpha >= 1 ? 'none' : 'opacity 60ms linear';
    this.door.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  }

  /** Vignette and the hit/heal flash, as CSS over the canvas (updated only when they change). */
  private overlays(): void {
    const v = this.grade.uniforms.uVignette.value;
    if (Math.abs(v - this.shownVignette) > 0.01) {
      this.shownVignette = v;
      this.vignette.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(0,0,0,${(v * 0.9).toFixed(2)}) 100%)`;
    }
    const f = this.grade.uniforms.uFlash.value;
    const key = f.w > 0.01 ? `${f.x.toFixed(2)},${f.y.toFixed(2)},${f.z.toFixed(2)},${f.w.toFixed(2)}` : '';
    if (key !== this.shownFlash) {
      this.shownFlash = key;
      this.flash.style.boxShadow = key
        ? `inset 0 0 180px 40px rgba(${Math.round(f.x * 255)},${Math.round(f.y * 255)},${Math.round(f.z * 255)},${Math.min(0.85, f.w).toFixed(2)})`
        : 'none';
    }
  }
}
