/**
 * The Port and what flies from it, built in code in the KayKit look (flat colours, chunky shapes):
 * the launch pad with its flame trench, the lattice tower with its swing arm, the fuel tanks; the
 * rocket — a core stage with two boosters, an upper stage and the payload fairing; the descent stage
 * every payload rides down on in Space (with no air there, it brakes and lands on its engine and
 * legs, and stays as the module's footing) with its engine flame; and for the way home the capsule
 * with its heat shield and the parachute.
 */
import * as THREE from 'three';
import type { PayloadId } from '../game/space.ts';
import { patchMaterial } from './assets.ts';

const lam = (color: string, emissive = '#000000', e = 0) =>
  patchMaterial(new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: e, flatShading: true }));

const M = {
  concrete: lam('#a7a39b'),
  dark: lam('#3b3a3f'),
  steel: lam('#8d96a3'),
  red: lam('#c4442e'),
  white: lam('#eeeae2'),
  black: lam('#2a2a2e'),
  gold: lam('#d9b04a', '#3a2a00', 0.25),
  orange: lam('#e0773a'),
  shield: lam('#7a4a2a'),
  chute: lam('#f2f0ea'),
  chuteRed: lam('#d8553c'),
  glass: lam('#8fc8ff', '#2a5a8a', 0.3),
  panel: lam('#1d2f5a', '#0a1430', 0.3),
};

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
};
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 14) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  mesh.position.set(x, y, z);
  return mesh;
};

/** The Port: a round concrete pad over its flame trench, the launch tower, two fuel tanks (about 5 m across). */
export function portModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(2.3, 2.45, 0.32, M.concrete, 0, 0.16, 0, 24));
  g.add(box(4.2, 0.06, 0.7, M.dark, 0, 0.33, 0));
  // The launch tower: a red lattice with a swing arm reaching for the rocket.
  const tower = new THREE.Group();
  tower.position.set(-1.9, 0, -0.9);
  for (const [x, z] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ] as const)
    tower.add(box(0.08, 9.2, 0.08, M.red, x, 4.6, z));
  for (let y = 0.6; y < 9.2; y += 0.8) {
    tower.add(box(0.66, 0.05, 0.05, M.red, 0, y, -0.3), box(0.66, 0.05, 0.05, M.red, 0, y, 0.3));
    tower.add(box(0.05, 0.05, 0.66, M.red, -0.3, y, 0), box(0.05, 0.05, 0.66, M.red, 0.3, y, 0));
  }
  tower.add(box(1.3, 0.08, 0.18, M.steel, 0.95, 7.8, 0.3));
  tower.add(cyl(0.05, 0.05, 0.5, M.white, 0, 9.45, 0));
  g.add(tower);
  // Fuel tanks with their domes.
  for (const [x, z] of [
    [1.6, -1.6],
    [2.1, -0.7],
  ] as const) {
    g.add(cyl(0.38, 0.38, 1.4, M.white, x, 0.7, z));
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      M.white,
    );
    dome.position.set(x, 1.4, z);
    g.add(dome);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A launcher on the pad: core stage, two boosters, upper stage and fairing (about 10 m tall). */
export function rocketModel(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Group();
  core.name = 'core';
  core.add(cyl(0.48, 0.5, 5.2, M.white, 0, 2.9, 0));
  core.add(cyl(0.505, 0.505, 0.22, M.black, 0, 1.2, 0), cyl(0.505, 0.505, 0.18, M.black, 0, 4.9, 0));
  core.add(cyl(0.34, 0.5, 0.35, M.dark, 0, 0.2, 0));
  for (const s of [-1, 1]) {
    const b = new THREE.Group();
    b.name = `booster${s}`;
    b.add(
      cyl(0.24, 0.24, 3.4, M.white, s * 0.74, 2.0, 0),
      cyl(0.0, 0.24, 0.55, M.white, s * 0.74, 3.98, 0),
      cyl(0.16, 0.24, 0.25, M.dark, s * 0.74, 0.18, 0),
    );
    core.add(b);
  }
  g.add(core);
  const upper = new THREE.Group();
  upper.name = 'upper';
  upper.add(cyl(0.4, 0.48, 0.35, M.dark, 0, 5.68, 0), cyl(0.4, 0.4, 1.6, M.white, 0, 6.65, 0));
  g.add(upper);
  const fairing = new THREE.Group();
  fairing.name = 'fairing';
  fairing.add(
    cyl(0.5, 0.42, 0.25, M.white, 0, 7.58, 0),
    cyl(0.5, 0.5, 1.5, M.white, 0, 8.45, 0),
    cyl(0.05, 0.5, 1.3, M.white, 0, 9.85, 0),
  );
  fairing.add(cyl(0.505, 0.505, 0.12, M.red, 0, 8.0, 0));
  g.add(fairing);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** The entry capsule: a blunt cone with its heat shield under it (about 1.4 m across). */
export function capsuleModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.68, 0.7, M.white, 0, 0.35, 0, 16));
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 16, 5, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38),
    M.shield,
  );
  shield.name = 'shield';
  shield.position.y = 0.42;
  g.add(shield);
  g.add(cyl(0.12, 0.2, 0.12, M.dark, 0, 0.76, 0));
  return g;
}

/** A parachute canopy in red and white gores, with its lines (about 5 m across). */
export function chuteModel(): THREE.Group {
  const g = new THREE.Group();
  const gores = 12;
  for (let i = 0; i < gores; i++) {
    const mat = (i % 2 ? M.chute : M.chuteRed).clone();
    mat.side = THREE.DoubleSide;
    const seg = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 2, 5, (i / gores) * Math.PI * 2, (Math.PI * 2) / gores, 0, Math.PI / 2.6),
      mat,
    );
    seg.scale.y = 0.6;
    seg.position.y = 3.2;
    g.add(seg);
  }
  const lineMat = new THREE.LineBasicMaterial({ color: '#d9d4c8' });
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push(new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(Math.cos(a) * 1.9, 3.15, Math.sin(a) * 1.9));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  return g;
}

/** A strut between two points. */
const strut = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
};

/** How high a descent stage's deck stands: its payload stands on it. */
export const STAGE_H = 0.62;

/**
 * The descent stage a payload rides down on: an eight-sided deck in gold foil on four splayed legs
 * with footpads, the engine bell underneath (`half`: the payload's half footprint, m).
 */
export function descentStage(half: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stage';
  const r = Math.max(0.7, half * 0.8);
  g.add(cyl(r, r * 0.94, 0.14, M.steel, 0, STAGE_H - 0.07, 0, 8));
  g.add(cyl(r * 0.82, r * 0.7, 0.3, M.gold, 0, STAGE_H - 0.29, 0, 8));
  g.add(cyl(0.13, 0.28, 0.3, M.dark, 0, 0.17, 0, 10));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const foot = new THREE.Vector3(c * (r + 0.4), 0.06, s * (r + 0.4));
    g.add(strut(new THREE.Vector3(c * r * 0.75, STAGE_H - 0.12, s * r * 0.75), foot, 0.05, M.steel));
    g.add(
      strut(
        new THREE.Vector3(c * r * 0.5, STAGE_H - 0.42, s * r * 0.5),
        foot.clone().lerp(new THREE.Vector3(0, STAGE_H, 0), 0.25),
        0.03,
        M.dark,
      ),
    );
    g.add(cyl(0.17, 0.2, 0.07, M.dark, foot.x, 0.035, foot.z, 8));
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** An engine's flame: a bright cone pointing down from the origin (scale y with the throttle). */
export function flameModel(): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 1.6, 12, 1, true).rotateX(Math.PI).translate(0, -0.8, 0),
    new THREE.MeshBasicMaterial({
      color: '#ffb35a',
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 1.0, 10, 1, true).rotateX(Math.PI).translate(0, -0.5, 0),
    new THREE.MeshBasicMaterial({
      color: '#fff4d0',
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  g.add(outer, inner);
  g.traverse((o) => (o.renderOrder = 5));
  return g;
}

/**
 * What a payload looks like standing at the base (until KayKit's Space Base pieces stand in for it):
 * a lander with its petals open, panels, a habitat, a capsule, a rover, a drill rig, an oxygen plant,
 * an ascent vehicle on its legs.
 */
export function payloadModel(id: PayloadId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'lander': {
      g.add(cyl(0.5, 0.6, 0.5, M.white, 0, 0.35, 0, 6));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const petal = box(0.9, 0.04, 0.8, M.panel, Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95);
        petal.rotation.y = -a;
        g.add(petal);
      }
      g.add(
        cyl(0.02, 0.02, 0.8, M.steel, 0.2, 1.0, 0),
        new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), M.red),
      );
      g.children[g.children.length - 1]!.position // The dome was added immediately above.
        .set(0.2, 1.42, 0);
      break;
    }
    case 'solarfarm':
      for (let i = 0; i < 6; i++) {
        const p = box(1.1, 0.05, 0.7, M.panel, ((i % 3) - 1) * 1.25, 0.7, Math.floor(i / 3) * 1.0 - 0.5);
        p.rotation.x = -0.5;
        g.add(p, cyl(0.03, 0.03, 0.7, M.steel, ((i % 3) - 1) * 1.25, 0.35, Math.floor(i / 3) * 1.0 - 0.5, 6));
      }
      break;
    case 'habitat': {
      g.add(cyl(1.6, 1.7, 1.6, M.white, 0, 0.8, 0, 16));
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        M.white,
      );
      dome.position.y = 1.6;
      g.add(dome, box(0.7, 1.1, 0.4, M.steel, 0, 0.55, 1.65), box(0.5, 0.3, 0.05, M.glass, 0.8, 1.3, 1.45));
      break;
    }
    case 'crew': {
      const c = capsuleModel();
      c.scale.setScalar(1.3);
      g.add(c);
      for (const [x, z] of [
        [-0.7, 0.7],
        [0.7, 0.7],
        [0, -0.9],
      ] as const)
        g.add(cyl(0.04, 0.06, 0.5, M.steel, x, 0.2, z, 6));
      break;
    }
    case 'rover': {
      g.add(box(1.1, 0.25, 0.8, M.white, 0, 0.55, 0));
      for (const x of [-0.45, 0, 0.45])
        for (const z of [-0.5, 0.5]) {
          const w = cyl(0.17, 0.17, 0.14, M.dark, x, 0.17, z, 10);
          w.rotation.x = Math.PI / 2;
          g.add(w);
        }
      g.add(
        cyl(0.04, 0.04, 0.6, M.steel, 0.35, 0.95, -0.2, 6),
        box(0.22, 0.12, 0.12, M.white, 0.35, 1.28, -0.2),
        box(0.04, 0.04, 0.6, M.steel, -0.6, 0.6, 0.2),
      );
      break;
    }
    case 'drill': {
      for (const [x, z] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [0, 0.9],
      ] as const) {
        const leg = cyl(0.06, 0.06, 4, M.orange, x * 0.6, 2, z * 0.6, 6);
        leg.rotation.z = -x * 0.15;
        leg.rotation.x = z * 0.15;
        g.add(leg);
      }
      g.add(cyl(0.1, 0.1, 3.4, M.steel, 0, 1.5, 0, 8), box(1.2, 0.5, 1.0, M.white, 0, 0.25, 0));
      break;
    }
    case 'oxygen':
      g.add(box(1.4, 0.8, 1.0, M.white, 0, 0.4, 0));
      for (const x of [-0.45, 0, 0.45]) g.add(cyl(0.18, 0.18, 1.1, M.steel, x, 1.35, 0.2, 10));
      g.add(box(0.6, 0.06, 0.3, M.glass, 0, 0.6, 0.52));
      break;
    case 'ascent': {
      g.add(
        cyl(0.32, 0.36, 2.2, M.white, 0, 1.6, 0),
        cyl(0.05, 0.32, 0.7, M.white, 0, 3.05, 0),
        cyl(0.37, 0.37, 0.12, M.red, 0, 2.2, 0),
      );
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = cyl(0.04, 0.05, 1.0, M.steel, Math.cos(a) * 0.55, 0.4, Math.sin(a) * 0.55, 6);
        leg.rotation.z = -Math.cos(a) * 0.5;
        leg.rotation.x = Math.sin(a) * 0.5;
        g.add(leg);
      }
      break;
    }
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}
