import * as THREE from 'three';
import { MINE_AT, STATION, pathAt, type MineLayout } from '../../game/mines.ts';
import { patchMaterial } from '../assets.ts';
const CAGE_HALF = 0.82;
/** Lift/shaft geometry and fading for the frame materials cloned by this owner. */
export class MineLift {
  private cageMats: THREE.MeshLambertMaterial[] = [];
  constructor(group: THREE.Group, L: MineLayout) {
    const g = group;
    const wood = new THREE.MeshLambertMaterial({ color: '#6b4a2b', flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: '#2a2420', flatShading: true });
    const iron = new THREE.MeshLambertMaterial({ color: '#4a4a52', flatShading: true });
    // The lift: a timber cage on a plank floor, its hoist ropes going up into the shaft. (Its frame
    // fades while the lens is inside it or looks through it at you: see fadeCage.)
    const cage = new THREE.Group();
    const half = CAGE_HALF;
    const frameWood = patchMaterial(wood.clone(), { fog: false, rim: false });
    const frameIron = patchMaterial(iron.clone(), { fog: false, rim: false });
    this.cageMats = [frameWood, frameIron];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.08, half * 2), wood);
    deck.position.y = 0.04;
    cage.add(deck);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), frameWood);
      post.position.set(x * half, 0.75, z * half);
      cage.add(post);
    }
    for (const y of [1.5, 0.75]) {
      for (const [x, z, w, d] of [
        [0, -half, half * 2, 0.08],
        [0, half, half * 2, 0.08],
        [-half, 0, 0.08, half * 2],
        [half, 0, 0.08, half * 2],
      ] as const) {
        if (y < 1 && Math.abs(x) > 0.5) continue;
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.04, 0.07, d + 0.04),
          y > 1 ? frameWood : frameIron,
        );
        bar.position.set(x, y, z);
        cage.add(bar);
      }
    }
    const rope = new THREE.MeshBasicMaterial({ color: '#3a2c1c' });
    for (const x of [-0.25, 0.25]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 8, 4), rope);
      r.position.set(x, 1.5 + 4, 0);
      cage.add(r);
    }
    // The shaft: timbered walls going up into the dark (open below, where the roof is cut away).
    const sh = STATION.shaft + 0.02;
    const wallMat = new THREE.MeshLambertMaterial({ color: '#3a2f26', side: THREE.DoubleSide });
    for (let q = 0; q < 4; q++) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(sh * 2, 7), wallMat);
      const a = (q * Math.PI) / 2;
      wall.position.set(Math.sin(a) * sh, STATION.roof - 0.6 + 3.5, Math.cos(a) * sh);
      wall.rotation.y = a;
      cage.add(wall);
      // Timbers round it, every metre or so up.
      for (let k = 0; k < 5; k++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(sh * 2, 0.12, 0.1), wood);
        t.position.set(Math.sin(a) * (sh - 0.06), STATION.roof - 0.2 + k * 1.2, Math.cos(a) * (sh - 0.06));
        t.rotation.y = a;
        cage.add(t);
      }
    }
    cage.position.set(MINE_AT.x, 0, MINE_AT.z);
    g.add(cage);
    // Buffer stops at every line's end and at the station's platforms.
    for (const line of L.lines) {
      for (const [d, back] of [
        [0, -1],
        [line.length, 1],
      ] as const) {
        const p = pathAt(line, d);
        const buf = new THREE.Group();
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.14), wood);
        beam.position.y = 0.22;
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.22), dark);
        block.position.set(0, 0.1, back * 0.06);
        buf.add(beam, block);
        buf.position.set(p.x + p.tx * back * 0.1, 0, p.z + p.tz * back * 0.1);
        buf.rotation.y = Math.atan2(p.tx, p.tz);
        g.add(buf);
      }
    }
  }
  fade(dt: number, eye: THREE.Vector3, target: THREE.Vector3): void {
    if (!this.cageMats.length) return;
    const cx = MINE_AT.x;
    const cz = MINE_AT.z;
    const inside = (x: number, z: number, m: number) =>
      Math.abs(x - cx) < CAGE_HALF + m && Math.abs(z - cz) < CAGE_HALF + m;
    let want = 1;
    if (inside(eye.x, eye.z, 0.3)) want = 0.15;
    else if (inside(target.x, target.z, 0.1)) want = 0.3;
    else {
      // The lens's sight line to you: does it pass over the cage?
      const dx = target.x - eye.x;
      const dz = target.z - eye.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((cx - eye.x) * dx + (cz - eye.z) * dz) / l2));
      if (Math.hypot(eye.x + dx * t - cx, eye.z + dz * t - cz) < CAGE_HALF + 0.1) want = 0.3;
    }
    const k = Math.min(1, dt * 8);
    for (const m of this.cageMats) {
      m.opacity += (want - m.opacity) * k;
      if (Math.abs(m.opacity - want) < 0.01) m.opacity = want;
      const see = m.opacity < 0.99;
      if (m.transparent !== see) {
        m.transparent = see;
        m.depthWrite = !see;
        m.needsUpdate = true;
      }
    }
  }
}
