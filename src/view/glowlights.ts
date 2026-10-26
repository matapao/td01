/**
 * Light, drawn (the cheap way, for mediocre laptops): every fire, lamp, mine torch and your lantern
 * lays a soft warm pool on the ground under it — a flat additive disc, tilted to the slope, that
 * brightens as night falls. A local effect instead of lighting the scene: no per-pixel light loops,
 * nothing to recompile, one draw call for all of them.
 */
import * as THREE from 'three';

export interface GlowSource {
  x: number;
  y: number;
  z: number;
  /** Reach of the pool (world units). */
  r: number;
  color: THREE.Color;
  /** Brightness. */
  k: number;
}

export const GLOW_COLORS = {
  fire: new THREE.Color('#ff9440'),
  torch: new THREE.Color('#ffa24a'),
  lantern: new THREE.Color('#ffc070'),
  lamp: new THREE.Color('#ffe6b0'),
  cauldron: new THREE.Color('#7dff6a'),
};

/** Pools drawn at once (the nearest), and how far from the viewer they still show. */
const MAX = 48;
const FAR = 40;

function poolTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const UP = new THREE.Vector3(0, 1, 0);

export class GlowLights {
  private groundAt: (x: number, z: number) => number;

  readonly mesh: THREE.InstancedMesh;
  private near: { s: GlowSource; d: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private n = new THREE.Vector3();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(groundAt: (x: number, z: number) => number) {
    this.groundAt = groundAt;

    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(viewer: THREE.Vector3, sources: Iterable<GlowSource>): void {
    const near = this.near;
    near.length = 0;
    for (const s of sources) {
      if (s.k <= 0.01) continue;
      const d = Math.hypot(s.x - viewer.x, s.z - viewer.z);
      if (d < FAR + s.r) near.push({ s, d });
    }
    near.sort((a, b) => a.d - b.d);
    const n = Math.min(MAX, near.length);
    for (let i = 0; i < n; i++) {
      const { s, d } = near[i]!; // i < min(MAX, near.length).
      // Lie on the ground under the light, tilted to the slope.
      const y = this.groundAt(s.x, s.z);
      const e = 0.8;
      this.n
        .set(
          this.groundAt(s.x - e, s.z) - this.groundAt(s.x + e, s.z),
          2 * e,
          this.groundAt(s.x, s.z - e) - this.groundAt(s.x, s.z + e),
        )
        .normalize();
      this.q.setFromUnitVectors(UP, this.n);
      this.p.set(s.x, Math.min(y, s.y) + 0.05, s.z);
      this.sc.set(s.r, 1, s.r);
      this.m.compose(this.p, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
      const fade = 1 - THREE.MathUtils.smoothstep(d, FAR * 0.7, FAR);
      this.mesh.setColorAt(i, this.c.copy(s.color).multiplyScalar(Math.min(1.2, s.k * 0.55) * fade));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
