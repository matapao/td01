/**
 * The mine's kit (public/assets/kits/mine.glb): the few models of kits/props2.glb the Ashdeep shows —
 * the Dungeon 1.1 timber sets, the lairs' camp gear (the raiders' fire, drum and banner, the lost
 * shift's pickaxes) and the tunnel raiders' axes — so going down the mine fetches a small file
 * instead of all of props2. (The rock, its ore and crystals are drawn, not modelled.) Add a model's
 * name here when the mine shows a new one.
 * Every model stays a top-level node named after its file, as in the other kits.
 *
 *   node scripts/assets/build-mine-kit.mjs        (after build-assets.mjs has made kits/props2.glb)
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune } from '@gltf-transform/functions';

const KEEP = [
  // Timbers (Dungeon 1.1): a post with its knee braces, and the cap across.
  'scaffold_pillar_wall',
  'scaffold_beam_wall',
  // The lairs: the raiders' camp fire, drum and banner, the lost shift's pickaxes, the raiders' axes.
  'Campfire_Base',
  'Campfire_Logs',
  'Orc_Wardrum',
  'Orc_Banner',
  'dungeon_pickaxe',
  'OrcRaider_Axe',
];

const src = path.resolve('public/assets/kits/props2.glb');
const out = path.resolve('public/assets/kits/mine.glb');
if (!fs.existsSync(src)) {
  console.error(`missing ${src} — run scripts/assets/build-assets.mjs first`);
  process.exit(1);
}
const io = new NodeIO();
const doc = await io.read(src);
const scene = doc.getRoot().listScenes()[0];
if (!scene) throw new Error('props2.glb has no scene');
const keep = new Set(KEEP);
/** @type {Set<string>} */
const found = new Set();
for (const n of scene.listChildren()) {
  if (keep.has(n.getName())) {
    found.add(n.getName());
    continue;
  }
  /** @type {import('@gltf-transform/core').Node[]} */
  const all = [];
  n.traverse((c) => all.push(c));
  for (const c of all.reverse()) c.dispose();
}
const missing = KEEP.filter((k) => !found.has(k));
if (missing.length) {
  console.error(`props2.glb lacks: ${missing.join(', ')}`);
  process.exit(1);
}
await doc.transform(prune(), dedup());
await io.write(out, doc);
console.log(`kits/mine.glb: ${found.size} models, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
