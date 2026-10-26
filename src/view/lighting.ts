/**
 * The scene's light: one look for the vale — soft late-afternoon light, a little worn — turned by the
 * time of day (warm dawns and dusks, a moonlit night that stays readable) and giving way to
 * lantern-dark below ground. Inside a building it is the light of KayKit's dungeon dioramas: clean,
 * bright and even, the room standing in a purple-black void with nothing of the world around it.
 * Every colour knob of the scene is set here: sun, sky, fog, colour grading, terrain and grass tint,
 * the models' tint, water.
 */
import * as THREE from 'three';
import { DAY, daylight } from '../game/content.ts';
import type { Stage } from './stage.ts';
import { worldUniforms } from './assets.ts';
import { skyUniforms } from './sky.ts';

/** The vale's look (sun angle in degrees). */
const LOOK = {
  sun: '#ffd9a8',
  sunIntensity: 2.7,
  sunElevation: 46,
  sunAzimuth: 225,
  sky: '#b6c8e6',
  ground: '#5c4c3a',
  hemiIntensity: 1.05,
  envIntensity: 0.26,
  fog: '#93a4b4',
  fogNear: 60,
  fogFar: 140,
  exposure: 1.0,
  saturation: 0.96,
  contrast: 1.08,
  vignette: 0.38,
  warm: [1.05, 1.0, 0.92] as const,
  cool: [0.9, 0.96, 1.1] as const,
  rim: '#ffe2c0',
  rimStrength: 0.2,
  terrainTint: '#e8e6d4',
  grassTint: '#d8e0b8',
  blight: 0.15,
  modelTint: '#f2ece2',
  modelDesat: 0.12,
  waterShallow: '#3b8f8c',
  waterDeep: '#0d2f45',
  glow: 1,
};

/** Extra uniforms read by the terrain, foliage and water shaders. */
export const tintUniforms = {
  uTerrainTint: { value: new THREE.Color(LOOK.terrainTint) },
  uGrassTint: { value: new THREE.Color(LOOK.grassTint) },
  uBlightBoost: { value: LOOK.blight },
  uWaterShallow: { value: new THREE.Color(LOOK.waterShallow) },
  uWaterDeep: { value: new THREE.Color(LOOK.waterDeep) },
};

/** The void a room stands in: a soft purple glow behind it, darkening to the edges. */
function voidTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 104, 8, 128, 128, 190);
  grd.addColorStop(0, '#2e2045');
  grd.addColorStop(0.55, '#170f26');
  grd.addColorStop(1, '#07050c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VOID = '#140d20';

export class Lighting {
  private stage: Stage;

  /** Time of day (0–1), set every frame from the game's clock. */
  tod = DAY.start;
  /** Inside a building's room (its own light; the world gone). */
  room = false;
  /** In Space: the dark all round, the stars, one hard white sun. */
  space = false;
  /** 0 = in the vale, 1 = down a mine (eased while the lift moves). */
  private under = 0;
  private underGoal = 0;
  /** The sky colour behind the world, and the void behind a room. */
  private sky: THREE.Color;
  private voidTex = voidTexture();

  constructor(stage: Stage) {
    this.stage = stage;

    this.sky = stage.scene.background as THREE.Color;
    this.update();
  }

  setUnderground(on: boolean, dt: number): void {
    this.underGoal = on ? 1 : 0;
    this.under +=
      Math.sign(this.underGoal - this.under) * Math.min(Math.abs(this.underGoal - this.under), dt * 2.5);
  }

  /** Every frame: the look, turned by the time of day and by being underground — or a room's light. */
  update(): void {
    skyUniforms.uSpace.value = this.space && !this.room ? 1 : 0;
    if (this.room) {
      this.applyRoom();
      return;
    }
    this.stage.scene.background = this.sky;
    if (this.space) {
      this.applySpace();
      return;
    }
    this.applyLook();
    this.applyDay(this.tod);
    if (this.under > 0.001) this.applyUnderground(this.under);
  }

  private applyLook(): void {
    const s = this.stage;
    const m = LOOK;
    s.sun.color.set(m.sun);
    // Cartoon light: a generous sky fill and a gentle sun — every side reads in its own colour
    // (the detail lives in the textures, not in the shading).
    s.sun.intensity = m.sunIntensity * 0.8;
    const el = (m.sunElevation * Math.PI) / 180;
    const az = (m.sunAzimuth * Math.PI) / 180;
    s.setSunDirection(
      new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)),
    );
    s.hemi.color.set(m.sky);
    s.hemi.groundColor.set(m.ground);
    s.hemi.intensity = m.hemiIntensity * 2;
    s.scene.environmentIntensity = m.envIntensity * 0.45;
    const fog = s.scene.fog as THREE.Fog;
    fog.color.set(m.fog);
    fog.near = m.fogNear;
    fog.far = m.fogFar;
    (s.scene.background as THREE.Color).set(m.fog);
    s.renderer.toneMappingExposure = m.exposure;
    const g = s.grade.uniforms;
    g.uSaturation.value = m.saturation;
    g.uContrast.value = m.contrast;
    g.uVignette.value = m.vignette;
    g.uWarm.value.set(...m.warm);
    g.uCool.value.set(...m.cool);
    worldUniforms.uRim.value.set(m.rim).multiplyScalar(m.rimStrength * 0.55);
    worldUniforms.uMist.value.set(m.fog).multiplyScalar(0.9);
    worldUniforms.uModelTint.value.set(m.modelTint);
    worldUniforms.uModelDesat.value = m.modelDesat;
    worldUniforms.uGlow.value = m.glow;
    skyUniforms.uSkyHorizon.value.set(m.fog).lerp(new THREE.Color(m.sky), 0.25);
    skyUniforms.uSkyTop.value.set(m.sky).multiplyScalar(0.62);
    skyUniforms.uSunCol.value.set(m.sun);
    skyUniforms.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    skyUniforms.uFarTint.value
      .set(m.fog)
      .lerp(new THREE.Color(m.ground), 0.35)
      .lerp(new THREE.Color('#3f5a3c'), 0.35)
      .multiplyScalar(0.75);
  }

  /** The sun crosses the sky; dawn and dusk run warm; night is moonlit and blue (but readable). */
  private applyDay(t: number): void {
    const s = this.stage;
    const day = daylight(t);
    const elev = Math.sin((t - 0.25) * Math.PI * 2);
    const warm = Math.exp(-(((elev - 0.08) / 0.18) ** 2));
    // The light keeps its angle all day (nothing shifts or flickers across the scene); the time of
    // day is colour: warm at dawn and dusk, moonlit blue at night.
    const nightK = 1 - day;
    s.sun.color.lerp(new THREE.Color('#ff9a4a'), warm * 0.6 * day).lerp(new THREE.Color('#a3b8ff'), nightK);
    s.sun.intensity = THREE.MathUtils.lerp(s.sun.intensity, 1.1, nightK);
    // Night is a colour grade, not darkness (the WoW / D3 way): moonlit blue, everything readable;
    // fires and lamps lay drawn pools of warm light (GlowLights).
    const night = 1 - day;
    s.hemi.intensity = THREE.MathUtils.lerp(s.hemi.intensity, 1.55, night);
    s.hemi.color.lerp(new THREE.Color('#5d76bd'), night);
    s.hemi.groundColor.lerp(new THREE.Color('#2c3452'), night);
    s.scene.environmentIntensity *= 1 - night * 0.5;
    const fog = s.scene.fog as THREE.Fog;
    fog.color.lerp(new THREE.Color('#ff9a63'), warm * 0.18).lerp(new THREE.Color('#22335a'), night);
    fog.far *= 1 - night * 0.15;
    fog.near *= 1 - night * 0.2;
    (s.scene.background as THREE.Color).copy(fog.color);
    s.renderer.toneMappingExposure *= 1 + night * 0.1;
    const gu = s.grade.uniforms;
    gu.uSaturation.value *= 1 - night * 0.1;
    gu.uCool.value.lerp(new THREE.Vector3(0.84, 0.94, 1.22), night * 0.7);
    skyUniforms.uNight.value = night;
    skyUniforms.uSkyHorizon.value
      .lerp(new THREE.Color('#ffae73'), warm * 0.45)
      .lerp(new THREE.Color('#2e4677'), night);
    skyUniforms.uSkyTop.value.lerp(new THREE.Color('#0d1a3d'), night);
    skyUniforms.uSunCol.value
      .lerp(new THREE.Color('#ff8a3c'), warm * 0.6)
      .multiplyScalar(Math.min(1, day * 1.5));
    skyUniforms.uFarTint.value.lerp(new THREE.Color('#1f2c4c'), night * 0.8);
    worldUniforms.uMist.value.copy(fog.color);
  }

  /**
   * In Space: no air, so no blue and no haze — the black of space all round, the stars, and one hard
   * white sun. Cartoon-readable all the same: a cool fill from the sky keeps the shadow sides in
   * their colours, and a cold rim light picks every shape out against the dark.
   */
  private applySpace(): void {
    const s = this.stage;
    s.sun.color.set('#fff8ee');
    s.sun.intensity = 2.7;
    s.setSunDirection(new THREE.Vector3(0.55, 0.62, 0.35).normalize());
    s.hemi.color.set('#a2a8c8');
    s.hemi.groundColor.set('#2a2a34');
    s.hemi.intensity = 1.2;
    s.scene.environmentIntensity = 0.12;
    const fog = s.scene.fog as THREE.Fog;
    fog.color.set('#070a18');
    fog.near = 160;
    fog.far = 900;
    this.sky.set('#03050c');
    s.renderer.toneMappingExposure = 1;
    const g = s.grade.uniforms;
    g.uSaturation.value = 1.04;
    g.uContrast.value = 1.12;
    g.uVignette.value = 0.45;
    g.uWarm.value.set(1.0, 1.0, 0.98);
    g.uCool.value.set(0.95, 0.98, 1.08);
    worldUniforms.uRim.value.set('#bcd0ff').multiplyScalar(0.28);
    worldUniforms.uMist.value.set('#070a18');
    worldUniforms.uModelTint.value.set('#f4f6ff');
    worldUniforms.uModelDesat.value = 0.04;
    worldUniforms.uGlow.value = 1;
    skyUniforms.uNight.value = 0;
    skyUniforms.uSunCol.value.set('#fff8ee');
    skyUniforms.uSunDir.value.set(0.55, 0.62, 0.35);
  }

  /** In a room: an even, clean light from above and to the left, the void all round. */
  private applyRoom(): void {
    const s = this.stage;
    s.scene.background = this.voidTex;
    s.sun.color.set('#fff2de');
    s.sun.intensity = 2.4;
    s.setSunDirection(new THREE.Vector3(-0.45, 0.82, 0.38).normalize());
    s.hemi.color.set('#e8ebf6');
    s.hemi.groundColor.set('#7a6a5b');
    s.hemi.intensity = 2.15;
    s.scene.environmentIntensity = 0.2;
    const fog = s.scene.fog as THREE.Fog;
    fog.color.set(VOID);
    fog.near = 26;
    fog.far = 60;
    s.renderer.toneMappingExposure = 1;
    const g = s.grade.uniforms;
    g.uSaturation.value = 1.02;
    g.uContrast.value = 1.05;
    g.uVignette.value = 0.5;
    g.uWarm.value.set(1.03, 1, 0.95);
    g.uCool.value.set(0.96, 0.97, 1.05);
    worldUniforms.uRim.value.set('#fff0dc').multiplyScalar(0.08);
    worldUniforms.uMist.value.set(VOID);
    worldUniforms.uModelTint.value.set('#ffffff');
    worldUniforms.uModelDesat.value = 0;
    worldUniforms.uGlow.value = 1;
    skyUniforms.uNight.value = 0;
  }

  /**
   * Below ground: cool painted fill keeps the terrain and tool contact readable. A purchased torch supplies the
   * nearby warmth; there is no automatic character light.
   */
  private applyUnderground(k: number): void {
    const s = this.stage;
    s.sun.intensity = THREE.MathUtils.lerp(s.sun.intensity, 0.03, k);
    s.hemi.intensity = THREE.MathUtils.lerp(s.hemi.intensity, 0.48, k);
    s.hemi.color.lerp(new THREE.Color('#e8e1d4'), k);
    s.hemi.groundColor.lerp(new THREE.Color('#756b5d'), k);
    s.scene.environmentIntensity *= 1 - k * 0.95;
    const fog = s.scene.fog as THREE.Fog;
    fog.color.lerp(new THREE.Color('#040609'), k);
    fog.near = THREE.MathUtils.lerp(fog.near, 7, k);
    fog.far = THREE.MathUtils.lerp(fog.far, 24, k);
    (s.scene.background as THREE.Color).lerp(new THREE.Color('#020305'), k);
    worldUniforms.uMist.value.lerp(new THREE.Color('#040609'), k);
    s.renderer.toneMappingExposure *= 1 - 0.12 * k;
    const g = s.grade.uniforms;
    g.uVignette.value = THREE.MathUtils.lerp(g.uVignette.value, 0.3, k);
    g.uSaturation.value *= 1 - 0.04 * k;
    g.uContrast.value *= 1 + 0.06 * k;
    g.uCool.value.lerp(new THREE.Vector3(0.9, 0.97, 1.12), k);
  }
}
