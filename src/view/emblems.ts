/**
 * What a tower's archer carries in its element, shown as one small, finely made emblem drifting
 * slowly round him at shoulder height — the archer himself never changes colour. A flame in a
 * brass cup (fire), a snowflake of ice (frost), a lightning bolt in gold (storm), a rune ring
 * (arcane), a black-powder bomb with its fuse alight (blast). A plain archer carries nothing.
 * Kept to one, and small: the windows already tell the rest.
 */
import * as THREE from 'three';
import type { DamageType } from '../game/content.ts';
import { patchMaterial } from './assets.ts';
import { flickerFlame, makeFlame } from './flame.ts';

export interface Emblem {
  obj: THREE.Group;
  update: (t: number, night: number) => void;
}

const lam = (color: string, emissive = '#000000', e = 0, extra: THREE.MeshLambertMaterialParameters = {}) =>
  patchMaterial(
    new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: e, flatShading: true, ...extra }),
  );

const M = {
  brass: lam('#c9993a', '#3a2600', 0.3),
  darkBrass: lam('#7a5a24'),
  ice: lam('#d8f6ff', '#5fcfff', 0.55, { transparent: true, opacity: 0.92 }),
  gold: lam('#ffd84a', '#ffb800', 0.7),
  rune: lam('#c9a0ff', '#8a4dff', 0.8),
  runeDark: lam('#3b2a55'),
  iron: lam('#2c2c33'),
  fuse: lam('#8a6a3a'),
};

const sprite = (tex: THREE.Texture, color: string, size: number, opacity = 0.8) => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      color,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.scale.setScalar(size);
  return s;
};

/** The emblem of an element, about 0.2 m across (world units). Null for none. */
export function makeEmblem(element: DamageType | undefined, glowTex: THREE.Texture): Emblem | null {
  const g = new THREE.Group();
  g.name = `emblem:${element}`;
  switch (element) {
    case 'fire': {
      // A little brass cup on three feet with a live flame in it.
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.04, 10, 1, true), M.brass);
      cup.material.side = THREE.DoubleSide;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 4, 16), M.brass);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.02;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 10), M.darkBrass);
      base.position.y = -0.02;
      g.add(cup, rim, base);
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.04, 4), M.darkBrass);
        const a = (i / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.028, -0.038, Math.sin(a) * 0.028);
        leg.rotation.z = Math.cos(a) * 0.35;
        leg.rotation.x = -Math.sin(a) * 0.35;
        g.add(leg);
      }
      const flame = makeFlame(glowTex, 0.16);
      flame.position.y = 0.012;
      g.add(flame);
      return { obj: g, update: (t, night) => flickerFlame(flame, t, night, 1.3) };
    }
    case 'frost': {
      // A six-armed snowflake: each arm with two pairs of side twigs and a bead at its tip.
      const arm = new THREE.BoxGeometry(0.008, 0.1, 0.008).translate(0, 0.05, 0);
      const twig = new THREE.BoxGeometry(0.006, 0.032, 0.006).translate(0, 0.016, 0);
      const flake = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const branch = new THREE.Group();
        branch.add(new THREE.Mesh(arm, M.ice));
        for (const [y, s] of [
          [0.04, 1],
          [0.065, 0.7],
        ] as const) {
          for (const side of [-1, 1]) {
            const t = new THREE.Mesh(twig, M.ice);
            t.position.y = y;
            t.rotation.z = side * 0.9;
            t.scale.setScalar(s);
            branch.add(t);
          }
        }
        const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), M.ice);
        tip.position.y = 0.1;
        branch.add(tip);
        branch.rotation.z = a;
        flake.add(branch);
      }
      flake.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), M.ice));
      const halo = sprite(glowTex, '#8fe3ff', 0.22, 0.45);
      g.add(flake, halo);
      return { obj: g, update: (t) => (flake.rotation.z = t * 0.7) };
    }
    case 'lightning': {
      // A gold lightning bolt, sparking now and then at its point.
      const s = new THREE.Shape();
      const pts: [number, number][] = [
        [0.02, 0.1],
        [-0.035, 0.005],
        [0.0, 0.005],
        [-0.03, -0.1],
        [0.04, 0.02],
        [0.005, 0.02],
        [0.04, 0.1],
      ];
      s.moveTo(...pts[0]!); // Literal polygon has seven vertices.
      for (const p of pts.slice(1)) s.lineTo(...p);
      s.closePath();
      const bolt = new THREE.Mesh(
        new THREE.ExtrudeGeometry(s, {
          depth: 0.014,
          bevelEnabled: true,
          bevelSize: 0.003,
          bevelThickness: 0.003,
          bevelSegments: 1,
        }).translate(0, 0, -0.007),
        M.gold,
      );
      const spark = sprite(glowTex, '#fff6a0', 0.1, 0.9);
      spark.position.set(-0.03, -0.1, 0);
      g.add(bolt, spark);
      return {
        obj: g,
        update: (t) => {
          const flash = Math.max(0, Math.sin(t * 5.3) * Math.sin(t * 2.1));
          spark.scale.setScalar(0.04 + flash * 0.14);
          bolt.rotation.y = Math.sin(t * 0.8) * 0.5;
        },
      };
    }
    case 'arcane': {
      // A rune ring: a band with runes set round it and a small stone at its heart, turning.
      const ring = new THREE.Group();
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 5, 28), M.rune);
      ring.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.028, 0.006), M.runeDark);
        plate.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0);
        plate.rotation.z = a - Math.PI / 2;
        const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.002), M.rune);
        glyph.position.set(0, 0, 0.004);
        glyph.rotation.z = i * 0.7;
        plate.add(glyph);
        ring.add(plate);
      }
      const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), M.rune);
      const halo = sprite(glowTex, '#c18bff', 0.2, 0.5);
      g.add(ring, heart, halo);
      return {
        obj: g,
        update: (t) => {
          ring.rotation.z = t * 0.9;
          heart.rotation.y = t * 1.6;
        },
      };
    }
    case 'impact': {
      // A round black-powder bomb, iron-banded, its fuse sputtering.
      const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 9), M.iron);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, 4, 18), M.darkBrass);
      band.rotation.x = Math.PI / 2;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.014, 8), M.darkBrass);
      neck.position.y = 0.048;
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.035, 4), M.fuse);
      fuse.position.set(0.006, 0.068, 0);
      fuse.rotation.z = -0.4;
      const spark = sprite(glowTex, '#ffb347', 0.06, 1);
      spark.position.set(0.014, 0.084, 0);
      g.add(bomb, band, neck, fuse, spark);
      return {
        obj: g,
        update: (t) => spark.scale.setScalar(0.05 + Math.abs(Math.sin(t * 17) * Math.sin(t * 7)) * 0.06),
      };
    }
    default:
      return null;
  }
}
