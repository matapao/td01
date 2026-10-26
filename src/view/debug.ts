/** Debug / screenshot helpers exposed as window.__debug (dev only). */
import type { Game } from './game.ts';
import {
  DAY,
  PLANS,
  sizeOf,
  type BuildingKind,
  type EnemyKind,
  type GemId,
  type ItemId,
  type Parts,
  type PlanId,
} from '../game/content.ts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toLambert } from './assets.ts';
import {
  MAP,
  WALL,
  cellOf,
  groundHeight,
  lanePos,
  outsideWalls,
  w,
  wallDist,
  wallSpot,
  waterDepth,
} from '../game/map.ts';
import { forceCompleteSite, placementBlocker } from '../game/systems/craft.ts';
import { spawnEnemy } from '../game/systems/enemies.ts';
import { bodyFree } from '../game/systems/heroes.ts';
import { frontDoor, roomDoor } from '../game/systems/rooms.ts';
import { INTERIORS, interiorOrigin } from '../game/interiors.ts';
import { MINERALS, digBlocker, digCenter, mineLayout } from '../game/mines.ts';
import { minePath, underground } from '../game/systems/mining.ts';

export function installDebug(game: Game) {
  const sim = game.sim;
  // Your own hero (in a LAN game the first hero may be someone else's).
  const hero = () => {
    const h = sim.getAs(game.localHero, 'hero') ?? sim.state.heroes[0];
    if (!h) throw new Error('No debug hero is available');
    return h;
  };
  const api = {
    sim,
    game,
    MAP,
    /** The wall across the pass (its line, walk and gate) and how far a point is from it (tests place by it). */
    WALL,
    wallDist,
    /** The point on the wall-walk nearest (x, z): where a hero works on something out on the field. */
    wallSpot,
    /** Design-space coordinate → world (the vale is stretched by WORLD). */
    w,
    /**
     * A building's way in and out (world): its door outside and which way it faces, the room's
     * doorway, the stair (its foot and head) and a spot on the loft, and which walls are cut away now.
     */
    rooms(id: number) {
      const b = sim.getAs(id, 'building');
      const def = b && INTERIORS[b.kind];
      if (!b || !def || b.interior === undefined) return null;
      const o = interiorOrigin(b.kind, b.interior);
      const st = def.ramps[0];
      const lf = def.levels[0];
      const mid = (a: number, c: number) => (a + c) / 2;
      return {
        door: frontDoor(b),
        front: { x: Math.sin(b.rot), z: Math.cos(b.rot) },
        exit: roomDoor(b),
        stairFoot: st && { x: o.x + mid(st.x0, st.x1), z: o.z + st.z1 + 0.25 },
        stairHead: st && { x: o.x + mid(st.x0, st.x1), z: o.z + st.z0 - 0.35 },
        loft: lf && { x: o.x, z: o.z + lf.z1 - 0.42, y: lf.y },
        cut: game.views.buildings.get(id)?.room?.cut ?? null,
      };
    },
    /** Instantly builds a plan near (x, z). Returns the building id. */
    build(plan: PlanId, x: number, z: number): number {
      const h = hero();
      if (!h.known.includes(plan)) h.known.push(plan);
      const c = cellOf(x, z);
      const p = PLANS[plan];
      const kind = p.type === 'building' ? p.building : undefined;
      const size = sizeOf(kind ?? 'tower');
      for (let r = 0; r < 12; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            // (The wall's rule too: a tower beyond it, anything else in town.)
            if (placementBlocker(sim, c.cx + dx, c.cz + dz, size, kind)) continue;
            const built = sim.state.buildings.length;
            sim.apply({ t: 'place', hero: h.id, plan, cx: c.cx + dx, cz: c.cz + dz });
            // (In dev mode it stands at once.)
            if (sim.state.buildings.length > built)
              return sim.state.buildings[sim.state.buildings.length - 1]!.id;
            const site = sim.state.sites[sim.state.sites.length - 1];
            if (!site || !sim.alive(site.id)) return 0;
            forceCompleteSite(sim, site);
            return sim.state.buildings.at(-1)?.id ?? 0;
          }
        }
      }
      return 0;
    },
    /** Builds a tower near (x, z) with `gems` set in its windows ('swift', or 'swift:3' for a brilliant one). Returns its id. */
    tower(x: number, z: number, ...gems: string[]): number {
      const id = api.build('tower', x, z);
      for (const g of gems) {
        const [gid, q] = g.split(':');
        api.gem(id, gid as GemId, q ? Number(q) : 2);
      }
      return id;
    },
    /** Places a plan as a site without completing it. */
    plan(plan: PlanId, x: number, z: number): number {
      const h = hero();
      if (!h.known.includes(plan)) h.known.push(plan);
      const c = cellOf(x, z);
      sim.apply({ t: 'place', hero: h.id, plan, cx: c.cx, cz: c.cz });
      return sim.state.sites[sim.state.sites.length - 1]?.id ?? 0;
    },
    /** Finishes a placed plan (site id) at once. */
    finish(site: number): void {
      const st = sim.getAs(site, 'site');
      if (st) forceCompleteSite(sim, st);
    },
    /** Sets the clock to a time of day (0 midnight … 0.5 noon), holding the waves back. */
    timeOfDay(t: number): void {
      const s = sim.state;
      const now = (((s.time / DAY.length + DAY.start) % 1) + 1) % 1;
      s.time += ((((t - now) % 1) + 1) % 1) * DAY.length;
      s.nextWaveAt = Math.max(s.nextWaveAt, s.time + 600);
    },
    /** Sets a gem into a tower's window at once, at grade `q` (1 rough, 2 polished, 3 brilliant). */
    gem(building: number, id: GemId, q = 2): void {
      const h = hero();
      if (!h.known.includes(id)) h.known.push(id);
      sim.apply({ t: 'placeGem', hero: h.id, plan: id, building });
      const site = sim.state.sites.find((s) => s.building === building && sim.alive(s.id));
      if (site) forceCompleteSite(sim, site, q);
    },
    give(parts: Parts): void {
      const h = hero();
      for (const k in parts) h.bag[k as ItemId] = (h.bag[k as ItemId] ?? 0) + (parts[k as ItemId] ?? 0);
    },
    learnAll(): void {
      const h = hero();
      for (const id of Object.keys(PLANS) as PlanId[]) if (!h.known.includes(id)) h.known.push(id);
    },
    ff(seconds: number): void {
      const n = Math.round(seconds * 20);
      for (let i = 0; i < n; i++) sim.step();
    },
    wave(): void {
      sim.callWave();
    },
    /** A walker of `kind` on road `lane`, `d` m along it (already up). Returns its id. */
    spawn(kind: EnemyKind, lane: number, d: number, burrowed = false): number {
      const e = spawnEnemy(sim, kind, lane, Math.max(0, sim.state.wave - 1), { d, lat: 0 });
      e.spawnT = 0;
      e.burrowed = burrowed;
      return e.id;
    },
    /** A point `d` m along road `lane` (from its crypt), `lat` m to its side. */
    road(d: number, lat = 0, lane = 0): { x: number; z: number } {
      const l = sim.world.lanes[lane];
      if (!l) throw new Error(`No road lane ${lane}`);
      return lanePos(l, d < 0 ? l.length + d : d, lat);
    },
    /** Teleports the hero; the camera rides along. */
    heroTo(x: number, z: number): void {
      const h = hero();
      h.x = h.px = x;
      h.z = h.pz = z;
      // (A path walked from where it was would lead off through walls.)
      h.path = [];
      h.pathGoal = null;
    },
    /** Turns the hero and camera toward (x, z); optional zoom distance and pitch. */
    look(x: number, z: number, d?: number, pitch?: number): void {
      const h = hero();
      const dx = x - h.x;
      const dz = z - h.z;
      if (Math.hypot(dx, dz) > 0.01) {
        game.cam.yaw = Math.atan2(-dx, -dz);
        h.facing = h.look = Math.atan2(dx, dz);
      }
      if (d) game.cam.zoomTo(d, true);
      if (pitch !== undefined) game.cam.pitch = pitch;
    },
    /** Frames (x, z) from the keep side: the hero stands a few metres west of it, looking east (out on the field: from the wall-walk — heroes never go out there). */
    cam(x: number, z: number, d = 14): void {
      const at = { x: x - Math.min(10, 3 + d * 0.2), z };
      const p = outsideWalls(at.x, at.z) ? wallSpot(x, z) : at;
      api.heroTo(p.x, p.z);
      api.look(x, z, d);
    },
    /** Frames a shot: the lens at (fx, fy, fz) looking at (tx, ty, tz); y is above the ground. No args: follow the hero again. */
    photo(fx?: number, fy?: number, fz?: number, tx?: number, ty?: number, tz?: number): void {
      if (fx === undefined) {
        game.cam.photo = null;
        return;
      }
      const g = (x: number, z: number) => groundHeight(sim.world, x, z);
      game.cam.photo = {
        from: new THREE.Vector3(fx, g(fx, fz!) + fy!, fz),
        to: new THREE.Vector3(tx, g(tx!, tz!) + ty!, tz),
      };
    },
    reveal(): void {
      sim.state.explored.fill(1);
    },
    /** The mine's plan (lines, stops, wagons, chambers, the rock's zones, cave-ins, lairs): see game/mines.ts. */
    mine() {
      return mineLayout();
    },
    /**
     * A piece of `mineral` (its name, e.g. 'Copper vein') showing in a chamber's wall (index into the
     * plan's chambers) nearest the hero, where to stand to hack at it, and its middle; null if none.
     */
    minePiece(chamber: number, mineral: string) {
      const L = mineLayout();
      const m = sim.state.mines[0];
      if (!m) return null;
      const h = hero();
      const zone = L.zones.findIndex((z) => z.chamber === chamber);
      let best: { cell: number; x: number; z: number; sx: number; sz: number } | null = null;
      let bd = Infinity;
      for (let k = 0; k < L.dig.zone.length; k++) {
        if (L.dig.zone[k] !== zone || MINERALS[L.dig.mineral[k] as 0].name !== mineral || digBlocker(m, k))
          continue;
        const c = digCenter(k);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
          const sx = c.x + Math.sin(a) * 0.95;
          const sz = c.z + Math.cos(a) * 0.95;
          if (!bodyFree(sim, sx, sz)) continue;
          const d = Math.hypot(sx - h.x, sz - h.z);
          if (d < bd) {
            bd = d;
            best = { cell: k, x: c.x, z: c.z, sx, sz };
          }
        }
      }
      return best;
    },
    /**
     * Blend tests for new asset packs: loads a GLB kit (one top-level node per model) and places
     * copies with the game's own matte materials and grading. `y` defaults to the ground.
     */
    async placeKit(
      url: string,
      items: { name: string; x: number; z: number; rot?: number; scale?: number; y?: number }[],
    ): Promise<string[]> {
      const g = await new GLTFLoader().loadAsync(url);
      const models = new Map(g.scene.children.map((c) => [c.name, c]));
      const placed: string[] = [];
      for (const it of items) {
        const src = models.get(it.name);
        if (!src) continue;
        const o = src.clone(true);
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh)
            mesh.material = game.assets.patched(toLambert(mesh.material as THREE.Material), {});
        });
        o.position.set(it.x, it.y ?? groundHeight(sim.world, it.x, it.z), it.z);
        o.rotation.y = it.rot ?? 0;
        o.scale.setScalar(it.scale ?? 1);
        game.stage.scene.add(o);
        placed.push(it.name);
      }
      return placed;
    },
  };
  (window as unknown as { __debug: typeof api }).__debug = api;
  // With a plan's kind, the wall's rule too (a tower only beyond it, a workshop only in town).
  (
    window as unknown as {
      __debugPlacement: (cx: number, cz: number, size?: number, kind?: BuildingKind) => string | null;
    }
  ).__debugPlacement = (cx, cz, size = sizeOf('tower'), kind) => placementBlocker(sim, cx, cz, size, kind);
  (window as unknown as { __waterDepth: (x: number, z: number) => number }).__waterDepth = (x, z) =>
    waterDepth(sim.world, x, z);
  (window as unknown as { __bodyFree: (x: number, z: number) => boolean }).__bodyFree = (x, z) =>
    bodyFree(sim, x, z);
  // Waypoints [x0, z0, x1, z1, …] from (x0, z0) to (x1, z1) on the game's own path grid (tests steer along them).
  (
    window as unknown as { __path: (x0: number, z0: number, x1: number, z1: number) => number[] | null }
  ).__path = (x0, z0, x1, z1) =>
    underground(x0) ? minePath(sim, x0, z0, x1, z1) : sim.pf.find(x0, z0, x1, z1);
  return api;
}

export type DebugAPI = ReturnType<typeof installDebug>;
