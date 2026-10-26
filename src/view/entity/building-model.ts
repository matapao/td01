import * as THREE from 'three';
import { TOWER_TOPS, isTower, type TopLevel, type BuildingKind } from '../../game/content.ts';
import { type Assets, type KitName } from '../assets.ts';
import { brazier, electricLamp, powerPole } from '../procmodels.ts';
import { TOWER } from '../towerview.ts';
import { portModel } from '../rockets.ts';

interface ModelDef {
  kit: KitName;
  model: string;
  scale: number;
  tint?: string;
  /** Until its kit has streamed in, this stands in for it (the town's kit comes after the world). */
  until?: { kit: KitName; model: string; scale: number };
}

const BUILDING_MODELS: Record<BuildingKind, ModelDef> = {
  shop: { kit: 'medieval', model: 'building_market_blue', scale: 2.4 },
  // The one tower: a bare shell; its modules are added by BuildingView (see towerview).
  tower: { kit: 'medieval', model: 'building_tower_base_blue', scale: TOWER.scale },
  sawmill: { kit: 'medieval', model: 'building_lumbermill_blue', scale: 2.4 },
  // The mason's workshop and the forge house: walk-in workshops in town (see interiors.ts).
  stonecutter: {
    kit: 'town',
    model: 'building_workshop_blue',
    scale: 1.8,
    until: { kit: 'medieval', model: 'building_stage_C', scale: 2.6 },
  },
  forge: {
    kit: 'town',
    model: 'building_blacksmith_red',
    scale: 2.4,
    until: { kit: 'medieval', model: 'building_mine_blue', scale: 1.85 },
  },
  anvil: { kit: 'medieval', model: 'building_blacksmith_blue', scale: 2.4 },
  arcanist: { kit: 'medieval', model: 'building_church_green', scale: 2.4 },
  hydro: { kit: 'medieval', model: 'building_watermill_blue', scale: 3.2 },
  // Poles and lamps are built in code (see procmodels); these entries are placeholders.
  pole: { kit: 'medieval', model: 'proc', scale: 1 },
  lamp: { kit: 'medieval', model: 'proc', scale: 1 },
  brazier: { kit: 'medieval', model: 'proc', scale: 1 },
  port: { kit: 'medieval', model: 'proc', scale: 1 },
};

export function buildingModel(assets: Assets, kind: BuildingKind, top: TopLevel = 1): THREE.Object3D {
  if (kind === 'pole') return powerPole();
  if (kind === 'port') return portModel();
  if (kind === 'lamp') {
    const l = electricLamp();
    l.root.userData['head'] = l.head;
    return l.root;
  }
  if (kind === 'brazier') {
    const f = brazier();
    f.root.userData['flame'] = f.flame;
    return f.root;
  }
  const want = BUILDING_MODELS[kind];
  const d = want.until && !assets.has(want.kit, want.model) ? { ...want, ...want.until } : want;
  const g = new THREE.Group();
  g.userData['stand'] = d !== want;
  // A tower wears its top: the open platform, the roofed turret or the gallery under its roof.
  const m = assets.model(d.kit, isTower(kind) ? TOWER_TOPS[top].model : d.model);
  m.scale.setScalar(d.scale);
  if (d.tint) {
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = (mesh.material as THREE.MeshLambertMaterial).clone();
        mat.color.multiply(new THREE.Color(d.tint));
        mesh.material = mat;
      }
    });
  }
  assets.patchTree(m);
  g.add(m);
  if (kind === 'stonecutter' && d.model === 'building_stage_C') {
    const stone = assets.model('medieval', 'resource_stone');
    stone.scale.setScalar(3.4);
    stone.position.set(-0.9, 0, 0.8);
    const crate = assets.model('medieval', 'crate_open');
    crate.scale.setScalar(3.2);
    crate.position.set(0.9, 0, 0.9);
    assets.patchTree(stone);
    assets.patchTree(crate);
    g.add(stone, crate);
  }
  return g;
}
