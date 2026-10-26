/** Retained Ashdeep rendering: tiles, scenery and riders have separate resource owners. */
import * as THREE from 'three';
import type { Sim } from '../game/sim.ts';
import { mineLayout, type MineLayout, type Wagon } from '../game/mines.ts';
import { underground } from '../game/systems/mining.ts';
import type { Hero } from '../game/entity-types.ts';
import type { Assets } from './assets.ts';
import { loadNature } from './nature.ts';
import { MineGlows } from './mine/glows.ts';
import { MineRock } from './mine/rock.ts';
import { MineLift } from './mine/lift.ts';
import { MineRubble } from './mine/rubble.ts';
import { MineDressing } from './mine/dressing.ts';
import { MineTrack } from './mine/track.ts';
import { planLamps } from './mine/lamps.ts';
import { buildSigns } from './mine/signs.ts';
import { buildTalus } from './mine/talus.ts';

export class MineView {
  private sim: Sim;
  readonly group = new THREE.Group();
  private L: MineLayout;
  private rock: MineRock;
  private glows: MineGlows;
  private lift: MineLift;
  private rubble: MineRubble;
  private dressing: MineDressing;
  private track: MineTrack;
  private assets: Assets | null = null;
  private time = 0;
  private startAt = performance.now();
  private on = false;

  constructor(sim: Sim) {
    this.sim = sim;
    this.L = mineLayout();
    const lamps = planLamps(this.L);
    this.rock = new MineRock(this.L, this.group, lamps, () => this.glows.markDirty());
    this.glows = new MineGlows(512);
    this.group.visible = false;
    this.group.name = 'mine';
    this.group.add(this.glows.mesh);
    this.lift = new MineLift(this.group, this.L);
    buildSigns(this.group, this.L);
    this.rubble = new MineRubble(this.L, this.group, sim.state.mines[0]);
    buildTalus(this.L, this.group, lamps, this.rock.trackBeds());
    for (const l of lamps) {
      this.glows.flame(l.x, l.y - 0.05, l.z, 0.16, 0.22, new THREE.Color('#ffe2a0'), 1.2);
      this.glows.flame(l.x, l.y - 0.05, l.z, 1.3, 1.3, new THREE.Color('#ff9a40'), 0.38);
    }
    this.dressing = new MineDressing(this.L, this.group, lamps, (...args) => this.glows.flame(...args));
    this.track = new MineTrack(this.L, this.group, lamps);
  }

  /** Stream models without blocking the procedural rock or changing kit request order. */
  attach(assets: Assets): void {
    this.assets = assets;
    // attach establishes the asset owner before either kit promise can resolve.
    void assets.loadKit('bits').then(() => this.track.build(this.assets!));
    void assets.loadKit('mine').then(() => this.dressing.buildTimbers(this.assets!));
    this.dressing.buildLanterns(assets);
    this.dressing.buildStation(assets);
    void loadNature().then((kit) => kit && this.rubble.buildNatureRubble(kit, this.sim.state.mines[0]));
  }

  pickRock(ray: THREE.Raycaster): { x: number; y: number; z: number; nx: number; nz: number } | null {
    return this.on ? this.rock.pickRock(ray) : null;
  }

  rideSpot(h: Hero, alpha: number, out: THREE.Vector3): THREE.Vector3 | null {
    if (!h.ride) return null;
    // Standing in the tub, its rim at the waist.
    out.set(h.px + (h.x - h.px) * alpha, 0.3, h.pz + (h.z - h.pz) * alpha);
    return out;
  }

  /** Lantern warmth is painted into the surface; no dynamic floor light pools. */
  get torchSpots(): THREE.Vector3[] {
    return [];
  }

  update(dt: number, viewerX: number, alpha = 1, eye?: THREE.Vector3, target?: THREE.Vector3): void {
    this.time += dt;
    // MineGlows creates this uniform with its shader material.
    this.glows.mat.uniforms['uTime']!.value = this.time;
    const here = underground(viewerX);
    this.group.visible = here;
    this.on = here;
    const mine = this.sim.state.mines[0];
    this.rock.sync(mine);
    // Build nearby tiles first and keep the same per-frame/time budgets.
    if (here) this.rock.buildTiles(4, mine, target);
    else if (performance.now() - this.startAt > 2500) this.rock.buildTiles(1, mine);
    if (!here) return;
    this.glows.refresh();
    this.rubble.syncCaves(mine);
    this.track.updateRiders(this.sim.state.heroes, alpha);
    if (eye && target) this.lift.fade(dt, eye, target);
  }

  get shown(): boolean {
    return this.on;
  }

  /** Layout wagon lookup for prompts. */
  wagon(id: number): Wagon | undefined {
    return this.L.wagons[id];
  }
}
