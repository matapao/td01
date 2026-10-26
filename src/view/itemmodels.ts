/**
 * Small meshes for items lying on the ground, flying to the player, set into plans and drawn as
 * icons. Most come from KayKit Resource Bits (CC0); the rest are made here.
 */
import * as THREE from 'three';
import { GEM_COLORS, type GemColor, type ItemId } from '../game/content.ts';
import type { Assets } from './assets.ts';
import { gearMesh } from './procmodels.ts';

const M = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial({ ...o });
const mat = {
  bark: M({ color: '#8a5a33' }),
  wood: M({ color: '#e0a564' }),
  rings: M({ color: '#f2c98e' }),
  stone: M({ color: '#9aa3ad', flatShading: true }),
  block: M({ color: '#d5dbe3' }),
  ore: M({ color: '#b5643a', flatShading: true }),
  ingot: M({ color: '#aab8c8' }),
  gold: M({ color: '#ffcb47', emissive: '#5a3a00', emissiveIntensity: 0.4 }),
  crystal: M({ color: '#b583ff', emissive: '#6a2cff', emissiveIntensity: 1.2, flatShading: true }),
  rune: M({ color: '#c9a8ff', emissive: '#8a4dff', emissiveIntensity: 1.8, flatShading: true }),
  scrap: M({ color: '#8d7f6e' }),
};

const geos = {
  log: new THREE.CylinderGeometry(0.11, 0.12, 0.6, 8).rotateZ(Math.PI / 2),
  ringEnd: new THREE.CircleGeometry(0.1, 8),
  stone: new THREE.DodecahedronGeometry(0.17, 0),
  plank: new THREE.BoxGeometry(0.62, 0.06, 0.18),
  block: new THREE.BoxGeometry(0.3, 0.24, 0.3),
  ore: new THREE.IcosahedronGeometry(0.16, 0),
  ingot: new THREE.CylinderGeometry(0.1, 0.14, 0.42, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4),
  crystal: new THREE.OctahedronGeometry(0.16, 0).scale(0.7, 1.6, 0.7),
  rune: new THREE.OctahedronGeometry(0.15, 0),
  coin: new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14),
};

/**
 * Items drawn from KayKit Resource Bits, and how long their longest side is in the vale (a person is
 * half a unit tall; items are a touch large so they read on the ground).
 */
const KIT_ITEMS: Partial<Record<ItemId, [model: string, size: number]>> = {
  wood: ['Wood_Log_A', 0.55],
  planks: ['Wood_Planks_Stack_Small', 0.55],
  stone: ['Stone_Chunks_Small', 0.4],
  blocks: ['Stone_Brick', 0.34],
  ore: ['Iron_Nugget_Medium', 0.27],
  copper: ['Copper_Nugget_Medium', 0.27],
  silver: ['Silver_Nugget_Medium', 0.27],
  nugget: ['Gold_Nugget_Medium', 0.27],
  ingot: ['Iron_Bar', 0.4],
  gears: ['Parts_Cog', 0.32],
  scrap: ['Parts_Pile_Small', 0.46],
};

/** A kit model scaled so its longest side is `size`, centred and resting on the ground at the origin. */
function fitted(model: THREE.Object3D, size: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(model);
  const dim = box.getSize(new THREE.Vector3());
  const s = size / Math.max(dim.x, dim.y, dim.z);
  const c = box.getCenter(new THREE.Vector3());
  model.scale.setScalar(s);
  model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  return model;
}

export function itemMesh(item: ItemId | 'gold', assets?: Assets): THREE.Object3D {
  const g = new THREE.Group();
  const kit = item === 'gold' ? undefined : KIT_ITEMS[item];
  if (kit && assets?.has('resources', kit[0])) {
    g.add(fitted(assets.model('resources', kit[0]), kit[1]));
    return g;
  }
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (item) {
    case 'wood': {
      add(geos.log, mat.bark, 0, 0.12, 0);
      const e1 = add(geos.ringEnd, mat.rings, 0.301, 0.12, 0);
      e1.rotation.y = Math.PI / 2;
      const e2 = add(geos.ringEnd, mat.rings, -0.301, 0.12, 0);
      e2.rotation.y = -Math.PI / 2;
      break;
    }
    case 'stone':
      add(geos.stone, mat.stone, 0, 0.15, 0).scale.set(1.2, 0.9, 1);
      break;
    case 'ore': {
      add(geos.ore, mat.ore, 0, 0.14, 0);
      add(geos.ore, mat.gold, 0.08, 0.2, 0.05).scale.setScalar(0.35);
      break;
    }
    case 'crystal':
      add(geos.crystal, mat.crystal, 0, 0.25, 0).rotation.z = 0.2;
      break;
    case 'scrap': {
      const gear = gearMesh(0.16, 8, 0.05, mat.scrap);
      gear.position.y = 0.06;
      gear.rotation.x = 0.4;
      g.add(gear);
      break;
    }
    case 'planks':
      add(geos.plank, mat.wood, 0, 0.04, 0);
      add(geos.plank, mat.wood, 0, 0.1, 0.02, 0.15);
      break;
    case 'blocks':
      add(geos.block, mat.block, 0, 0.12, 0);
      break;
    case 'ingot':
      add(geos.ingot, mat.ingot, 0, 0.1, 0);
      break;
    case 'gears': {
      const a = gearMesh(0.17, 10, 0.06, mat.gold);
      a.position.y = 0.05;
      const b = gearMesh(0.11, 8, 0.06, mat.gold);
      b.position.set(0.2, 0.05, 0.08);
      g.add(a, b);
      break;
    }
    case 'rune':
      add(geos.rune, mat.rune, 0, 0.28, 0);
      break;
    case 'coal':
    case 'copper':
    case 'silver':
    case 'nugget':
    case 'quartz':
    case 'sulfur':
    case 'ruby':
    case 'sapphire':
    case 'topaz':
    case 'amethyst':
    case 'emerald': {
      // A chunk of rock with the find showing through (raw gems: a rough crystal of their colour).
      const tones: Record<string, [string, number, number]> = {
        coal: ['#2b2a2e', 0, 0.95],
        copper: ['#d9824a', 0.5, 0.45],
        silver: ['#d6dde6', 0.7, 0.35],
        nugget: ['#f2c94c', 0.8, 0.3],
        quartz: ['#e8f4ff', 0, 0.2],
        sulfur: ['#e8d84a', 0, 0.8],
      };
      const raw = item in GEM_COLORS;
      const tone = raw ? ([GEM_COLORS[item as GemColor].color, 0.1] as const) : tones[item];
      if (!tone) throw new Error(`Missing resource tone ${item}`);
      const [c, metal] = tone;
      // No shiny shading: metals and gems carry a painted glow of their own colour instead.
      const m = new THREE.MeshLambertMaterial({
        color: c,
        flatShading: true,
        emissive: c,
        emissiveIntensity: raw ? 0.35 : metal * 0.25,
      });
      if (item === 'quartz' || raw) {
        add(geos.crystal, m, 0, 0.22, 0).rotation.z = 0.25;
        add(geos.crystal, m, 0.09, 0.16, 0.04).scale.setScalar(0.6);
      } else {
        add(geos.stone, mat.stone, 0, 0.13, 0).scale.set(1, 0.8, 1);
        add(geos.ore, m, 0.05, 0.2, 0.03).scale.setScalar(item === 'coal' ? 0.9 : 0.55);
      }
      break;
    }
    case 'nickeliron': {
      // A lump of nickel-iron from Space: grey metal with a cold sheen.
      const m = new THREE.MeshLambertMaterial({
        color: '#9aa4b2',
        flatShading: true,
        emissive: '#3a4250',
        emissiveIntensity: 0.35,
      });
      add(geos.stone, m, 0, 0.14, 0).scale.set(1.1, 0.9, 1);
      add(geos.stone, m, 0.12, 0.08, 0.06).scale.setScalar(0.5);
      break;
    }
    case 'ice': {
      const m = new THREE.MeshLambertMaterial({
        color: '#d8f2ff',
        flatShading: true,
        emissive: '#8fd0ff',
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.92,
      });
      add(geos.crystal, m, 0, 0.18, 0).rotation.z = 0.5;
      add(geos.crystal, m, 0.08, 0.14, 0.05).scale.setScalar(0.7);
      add(geos.crystal, m, -0.07, 0.12, -0.03).scale.setScalar(0.55);
      break;
    }
    case 'rareearth': {
      // Dull rock shot with teal crystals.
      const glint = new THREE.MeshLambertMaterial({
        color: '#7fe0c0',
        flatShading: true,
        emissive: '#3fb894',
        emissiveIntensity: 0.5,
      });
      add(geos.stone, mat.stone, 0, 0.13, 0).scale.set(1, 0.8, 1);
      for (let i = 0; i < 3; i++)
        add(geos.crystal, glint, Math.cos(i * 2.1) * 0.08, 0.2, Math.sin(i * 2.1) * 0.08).scale.setScalar(
          0.45,
        );
      break;
    }
    case 'magnet': {
      // A horseshoe magnet: red, with steel poles.
      const red = new THREE.MeshLambertMaterial({ color: '#c63a2a', flatShading: true });
      const steel = new THREE.MeshLambertMaterial({ color: '#c8ced6', flatShading: true });
      const arc = add(new THREE.TorusGeometry(0.12, 0.05, 6, 12, Math.PI), red, 0, 0.26, 0);
      arc.rotation.z = 0;
      for (const x of [-0.12, 0.12]) {
        add(new THREE.BoxGeometry(0.1, 0.14, 0.1), red, x, 0.17, 0);
        add(new THREE.BoxGeometry(0.1, 0.06, 0.1), steel, x, 0.07, 0);
      }
      break;
    }
    case 'dynamite': {
      const red = new THREE.MeshLambertMaterial({ color: '#c73b2e' });
      for (let i = 0; i < 3; i++)
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.36, 8), red, (i - 1) * 0.095, 0.2, 0);
      const fuse = add(
        new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4),
        new THREE.MeshBasicMaterial({ color: '#2a2018' }),
        0,
        0.44,
        0,
      );
      fuse.rotation.z = 0.4;
      break;
    }
    case 'gold': {
      for (let i = 0; i < 5; i++) {
        const c = add(geos.coin, mat.gold, (i % 3) * 0.08 - 0.08, 0.02 + i * 0.032, (i % 2) * 0.06 - 0.03);
        c.rotation.z = (i % 2) * 0.1;
      }
      break;
    }
  }
  return g;
}
