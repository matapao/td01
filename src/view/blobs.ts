/**
 * Blob shadows: a soft dark disc on the ground under each tree, person and creature — the classic
 * cheap grounding (no shadow maps), one draw call per set.
 */
import * as THREE from 'three';

let tex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c);
  return tex;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Blobs {
  private max: number;
  private groundAt: (x: number, z: number) => number;

  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private n = new THREE.Vector3();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  count = 0;

  /** `darkness`: how dark the middle of a blob is (0–1). */
  constructor(max: number, darkness: number, groundAt: (x: number, z: number) => number) {
    this.max = max;
    this.groundAt = groundAt;

    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: blobTexture(),
      transparent: true,
      opacity: darkness,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  begin(): void {
    this.count = 0;
  }

  /** A blob of radius r under (x, z), lying on the ground (tilted to the slope). */
  add(x: number, z: number, r: number, y?: number): void {
    if (this.count >= this.max) return;
    const e = 0.5;
    this.n
      .set(
        this.groundAt(x - e, z) - this.groundAt(x + e, z),
        2 * e,
        this.groundAt(x, z - e) - this.groundAt(x, z + e),
      )
      .normalize();
    this.q.setFromUnitVectors(UP, this.n);
    this.p.set(x, (y ?? this.groundAt(x, z)) + 0.02, z);
    this.s.set(r, 1, r);
    this.mesh.setMatrixAt(this.count++, this.m.compose(this.p, this.q, this.s));
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
