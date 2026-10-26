/** F/right-click route to actions; the dedicated tool action never invokes nearby doors or lifts. */
import { atFabricator, atOversight } from '../../game/towerwork.ts';
import * as THREE from 'three';
import { earth, surfaceTool } from '../../game/excavation.ts';
import type { Sel } from '../../ui/state.ts';
import { groundHeight } from '../../game/map.ts';
import { digCenter, mineLayout } from '../../game/mines.ts';
import type { InputContext, InputModes, Prompt } from './context.ts';
import { selectionPosition } from './picking.ts';

export class InteractionActions {
  private host: InputContext;
  private modes: InputModes;
  private wide: () => boolean;
  private dom: HTMLElement;

  constructor(host: InputContext, modes: InputModes, wide: () => boolean, dom: HTMLElement) {
    this.host = host;
    this.modes = modes;
    this.wide = wide;
    this.dom = dom;
  }
  useTerrain(px: number, py: number): boolean {
    const h = this.host.hero;
    if (!h || this.host.game.indoors) return false;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((px / this.dom.clientWidth) * 2 - 1, 1 - (py / this.dom.clientHeight) * 2),
      this.host.game.stage.camera,
    );
    const hit = this.host.game.mines.pickRock(ray);
    if (!hit) return false;
    if (this.modes.blastArmed) {
      this.host.cmd({ t: 'blast', hero: h.id, x: hit.x, y: hit.y, z: hit.z });
      this.modes.blastArmed = false;
      return true;
    }
    const tool = surfaceTool(earth(this.host.game.sim), hit.x, hit.y, hit.z);
    this.host.cmd({
      t: 'excavate',
      hero: h.id,
      x: hit.x,
      y: hit.y,
      z: hit.z,
      tool,
      wide: this.wide(),
    });
    return true;
  }
  act(sel: Sel): void {
    const g = this.host.game;
    const h = this.host.hero;
    if (!h || h.dead || h.transit) return;
    if (sel.kind === 'poi') {
      const p = g.sim.getAs(sel.id, 'poi');
      if (p?.kind === 'fabricator' && atFabricator(g.sim, h)) {
        this.host.onWorkshop();
        return;
      }
      if (p?.kind === 'oversight' && atOversight(h)) {
        this.host.onOverview();
        return;
      }
    }
    if (
      sel.kind === 'building' &&
      g.sim.getAs(sel.id, 'building')?.kind === 'anvil' &&
      atFabricator(g.sim, h)
    ) {
      this.host.onWorkshop();
      return;
    }
    if (sel.kind === 'wagon') {
      this.host.cmd({ t: 'ride', hero: h.id, wagon: sel.id });
      return;
    }
    if (sel.kind === 'cell' && sel.id < 0) {
      if (sel.id === -2) {
        const f = earth(g.sim);
        const n = g.sim.state.nodes.find(
          (n) => n.kind === 'tree' && n.amount <= 0 && Math.hypot(n.x - h.x, n.z - h.z) < 2,
        );
        const b = f.state.beds.find((b) => !b.planted && Math.hypot(b.x - h.x, b.z - h.z) < 2);
        if (n || b) this.host.cmd({ t: 'plant', hero: h.id, x: (n ?? b)!.x, z: (n ?? b)!.z });
        return;
      }
      const f = earth(g.sim),
        hit = f.ray(
          { x: h.x, y: groundHeight(g.sim.world, h.x, h.z) + 0.45, z: h.z },
          { x: Math.sin(h.facing), y: 0, z: Math.cos(h.facing) },
          2.7,
        );
      if (hit) this.host.cmd({ t: 'excavate', hero: h.id, x: hit.x, y: hit.y, z: hit.z, tool: 'pickaxe' });
      return;
    }
    if (sel.kind === 'cell') {
      const c = digCenter(sel.id);
      this.host.cmd({ t: 'dig', hero: h.id, x: c.x, z: c.z });
      return;
    }
    if (sel.kind === 'cavein') {
      // Dynamite at your feet, facing the rubble (3 seconds — then it blows).
      const c = mineLayout().caveins[sel.id];
      if (!c) return;
      if ((h.bag.dynamite ?? 0) <= 0 && !g.sim.state.dev) {
        this.host.ui.hint('Dynamite opens it — the Dwarven Trading Post sells it');
        return;
      }
      const facing = Math.atan2(c.x - h.x, c.z - h.z);
      this.host.cmd({
        t: 'pose',
        hero: h.id,
        x: h.x,
        z: h.z,
        facing,
        look: h.look,
        gait: 'idle',
        moving: false,
      });
      this.host.cmd({ t: 'blast', hero: h.id });
      this.host.ui.hint('The fuse is lit — stand back!');
      return;
    }
    if (sel.kind === 'leave') {
      this.host.cmd({ t: 'leave', hero: h.id });
      return;
    }
    if (sel.kind === 'enemy') {
      this.host.cmd({ t: 'attack', hero: h.id, target: sel.id });
      this.host.select(sel);
      const e = g.sim.getAs(sel.id, 'enemy');
      if (e) g.fx.ring(e.x, groundHeight(g.sim.world, e.x, e.z), e.z, 0.2, 1.2, '#ff5a4a', 0.4);
      return;
    }
    this.host.cmd({ t: 'interact', hero: h.id, target: sel.id });
    const p = selectionPosition(this.host.game, sel);
    if (p) g.fx.ring(p.x, p.y, p.z, 0.2, 1.3, '#ffd36a', 0.4);
  }
  useTool(): void {
    const h = this.host.hero;
    if (!h || h.dead || h.ride || h.droneOn || this.host.game.indoors) return;
    if (this.host.ui.placing || this.host.ui.placingGem || this.host.ui.targeting) {
      this.host.ui.hint('Finish or cancel placement before digging');
      return;
    }
    const field = earth(this.host.game.sim);
    const hit = field.ray(
      { x: h.x, y: groundHeight(this.host.game.sim.world, h.x, h.z) + 0.45, z: h.z },
      { x: Math.sin(h.facing), y: 0, z: Math.cos(h.facing) },
      2.7,
    );
    if (!hit) {
      this.host.ui.hint('Face nearby rock and press X to dig — right-click for precise aiming');
      return;
    }
    this.host.cmd({
      t: 'excavate',
      hero: h.id,
      x: hit.x,
      y: hit.y,
      z: hit.z,
      tool: surfaceTool(field, hit.x, hit.y, hit.z),
      wide: this.wide(),
    });
  }
  interact(prompt: Prompt | null): void {
    if (prompt) {
      this.act(prompt.sel);
      return;
    }
    const s = this.host.ui.selected;
    if (s && s.kind !== 'hero' && s.kind !== 'unit') this.act(s);
    else this.host.ui.hint('Nothing to interact with here');
  }
}
