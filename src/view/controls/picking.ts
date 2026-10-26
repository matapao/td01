import * as THREE from 'three';
import type { Game } from '../game.ts';
import type { Sel } from '../../ui/state.ts';
import { ENEMIES } from '../../game/content.ts';
import { groundHeight } from '../../game/map.ts';
import { roomDoor } from '../../game/systems/rooms.ts';
import { digCenter, mineLayout } from '../../game/mines.ts';
import { underground } from '../../game/systems/mining.ts';

function project(
  game: Game,
  dom: HTMLElement,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const v = new THREE.Vector3(x, y, z).project(game.stage.camera);
  return { x: (v.x * 0.5 + 0.5) * dom.clientWidth, y: (-v.y * 0.5 + 0.5) * dom.clientHeight, z: v.z };
}
export function pick(game: Game, dom: HTMLElement, px: number, py: number): Sel | null {
  const g = game;
  const s = g.sim.state;
  let best: Sel | null = null;
  let bd = Infinity;
  const cam = g.stage.camera.position;
  const tmp = new THREE.Vector3();
  const consider = (sel: Sel, x: number, y: number, z: number, r: number) => {
    const p = project(game, dom, x, y, z);
    if (p.z > 1) return;
    const scale = Math.max(0.35, Math.min(3, 14 / Math.max(1, cam.distanceTo(tmp.set(x, y, z)))));
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < r * scale && d < bd) {
      bd = d;
      best = sel;
    }
  };
  for (const e of s.enemies) {
    if (e.spawnT > 0.6 || e.burrowed) continue;
    const v = g.views.enemyObject(e.id);
    const p = v ? v.position : new THREE.Vector3(e.x, 0, e.z);
    const sc = ENEMIES[e.kind].scale;
    consider({ kind: 'enemy', id: e.id }, p.x, p.y + 0.25 * sc, p.z, 44 * sc);
  }
  for (const u of s.units)
    if (!u.dead)
      consider({ kind: 'unit', id: u.id }, u.x, groundHeight(g.sim.world, u.x, u.z) + 0.25, u.z, 30);
  for (const d of s.drops)
    consider({ kind: 'drop', id: d.id }, d.x, groundHeight(g.sim.world, d.x, d.z) + 0.2, d.z, 34);
  if (best) return best;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(
    new THREE.Vector2((px / dom.clientWidth) * 2 - 1, -(py / dom.clientHeight) * 2 + 1),
    g.stage.camera,
  );
  const targets: { sel: Sel; obj: THREE.Object3D }[] = [];
  for (const [id, v] of g.views.buildings) targets.push({ sel: { kind: 'building', id }, obj: v.root });
  for (const [id, v] of g.views.sites) targets.push({ sel: { kind: 'site', id }, obj: v.root });
  for (const poi of s.pois) {
    const obj = poi.kind === 'keep' ? g.scenery.keep : poi.store ? g.scenery.stores.get(poi.store) : null;
    if (obj && (poi.kind === 'keep' || s.discovered.includes(poi.store!)))
      targets.push({ sel: { kind: 'poi', id: poi.id }, obj });
  }
  let hit: { sel: Sel; d: number } | null = null;
  for (const t of targets) {
    const hits = rc.intersectObject(t.obj, true);
    const first = hits[0];
    if (first && (!hit || first.distance < hit.d)) hit = { sel: t.sel, d: first.distance };
  }
  if (hit) return hit.sel;
  for (const c of s.chests)
    consider({ kind: 'chest', id: c.id }, c.x, groundHeight(g.sim.world, c.x, c.z) + 0.5, c.z, 60);
  if (best) return best;
  for (const n of s.nodes) {
    // (Down the mine there's no fog: every face shows.)
    if (n.amount <= 0 || (!g.sim.isExplored(n.x, n.z) && !underground(n.x))) continue;
    const h = n.kind === 'tree' ? 1.2 : 0.4;
    consider(
      { kind: 'node', id: n.id },
      n.x,
      groundHeight(g.sim.world, n.x, n.z) + h,
      n.z,
      n.kind === 'tree' ? 70 : 50,
    );
  }
  return best;
}
export function selectionPosition(game: Game, sel: Sel): THREE.Vector3 | null {
  if (sel.kind === 'leave') {
    const b = game.sim.getAs(sel.id, 'building');
    const d = b ? roomDoor(b) : null;
    return d ? new THREE.Vector3(d.x, 0, d.z) : null;
  }
  if (sel.kind === 'wagon') {
    const w = mineLayout().wagons[sel.id];
    return w ? new THREE.Vector3(w.x, 0.2, w.z) : null;
  }
  if (sel.kind === 'cavein') {
    const c = mineLayout().caveins[sel.id];
    return c ? new THREE.Vector3(c.x, 0.4, c.z) : null;
  }
  if (sel.kind === 'cell' && sel.id < 0) return null;
  if (sel.kind === 'cell') {
    const c = digCenter(sel.id);
    return new THREE.Vector3(c.x, 0.25, c.z);
  }
  const ent = game.sim.get(sel.id);
  if (!ent || !('x' in ent.e)) return null;
  const e = ent.e as { x: number; z: number };
  return new THREE.Vector3(e.x, groundHeight(game.sim.world, e.x, e.z), e.z);
}
