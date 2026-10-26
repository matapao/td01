// Footprint slots are allocated for the selected plan before drawing; blueprintMaterial owns uColor/uTime uniforms.
/** Owns placement modes, preview geometry and footprint feedback; building rules stay authoritative. */
import { atFabricator } from '../../game/towerwork.ts';
import * as THREE from 'three';
import {
  ARCHER,
  BUILDING_SIZE,
  BUILD_ORDER,
  PLANS,
  isTower,
  gemBlocker,
  sizeOf,
  type BasePlanId,
  type BuildingKind,
  type GemId,
  type PlanId,
} from '../../game/content.ts';
import { cellOf, cellCenter, groundHeight, onWall } from '../../game/map.ts';
import { buildZone, faceRoad, placementBlocker, turnFor } from '../../game/systems/craft.ts';
import { blueprintMaterial, DrapedRing } from '../overlays.ts';
import { gridUniforms } from '../terrain.ts';
import { dist } from '../../core/math.ts';
import type { InputContext } from './context.ts';
import { buildingModel } from '../entity/building-model.ts';

const PLACE_RANGE = 30;
const planSize = (plan: BasePlanId) => sizeOf((PLANS[plan] as { building: BuildingKind }).building);
export class PlacementControls {
  private host: InputContext;
  private rangeRing: DrapedRing;

  private ghost: THREE.Object3D | null = null;
  private ghostPlan: BasePlanId | null = null;
  private ghostMat = blueprintMaterial('#7dffb0');
  private footprint: THREE.Mesh[] = [];
  constructor(host: InputContext, rangeRing: DrapedRing) {
    this.host = host;
    this.rangeRing = rangeRing;

    const game = host.game;
    const quad = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
    const most = Math.max(...Object.values(BUILDING_SIZE));
    for (let i = 0; i < most * most; i++) {
      const m = new THREE.Mesh(
        quad,
        new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.4, depthWrite: false }),
      );
      m.renderOrder = 4;
      m.visible = false;
      game.stage.scene.add(m);
      this.footprint.push(m);
    }
  }
  knownPlans(): BasePlanId[] {
    if (this.host.game.sim.state.dev) return BUILD_ORDER;
    return this.host.hero.known.filter((id) => PLANS[id].type === 'building') as BasePlanId[];
  }
  startPlacing(plan: PlanId, buy = false): void {
    if (plan === 'tower' && !this.host.game.sim.state.dev) {
      this.host.ui.hint(
        'Build the tower kit at the workshop platform, then deploy from the overview table upstairs',
      );
      if (atFabricator(this.host.game.sim, this.host.hero)) this.host.onWorkshop();
      return;
    }
    const h = this.host.hero;
    if (!this.host.game.sim.knows(h, plan)) {
      this.host.ui.hint(`Learn the ${PLANS[plan].name} plan first`);
      return;
    }
    const p = PLANS[plan];
    if (p.type === 'gem') {
      this.startGem(p.id);
      return;
    }
    if (p.type === 'upgrade') {
      // An upgrade goes into a standing building of its kind: the one selected (or the nearest).
      const s = this.host.ui.selected;
      const sel = s?.kind === 'building' ? this.host.game.sim.getAs(s.id, 'building') : undefined;
      const b =
        sel?.kind === p.target ? sel : this.host.game.sim.state.buildings.find((x) => x.kind === p.target);
      if (b) this.host.cmd({ t: 'upgradeBuilding', hero: this.host.ui.heroId, building: b.id, plan: p.id });
      else this.host.ui.hint(`The ${p.name} goes into a building you don't have yet`);
      return;
    }
    if (p.type === 'payload') {
      // A payload is stacked at the Port: the one selected (or the nearest).
      const s = this.host.ui.selected;
      const b =
        s?.kind === 'building'
          ? this.host.game.sim.getAs(s.id, 'building')
          : this.host.game.sim.state.buildings.find((x) => x.kind === 'port');
      if (b && b.kind === 'port')
        this.host.cmd({ t: 'stackPayload', hero: this.host.ui.heroId, payload: p.id, building: b.id });
      else this.host.ui.hint(`Build the Port first: payloads are stacked on its rocket`);
      return;
    }
    if (p.type === 'device') {
      // A device goes into a tower's upper window: the tower selected.
      const s = this.host.ui.selected;
      const b = s?.kind === 'building' ? this.host.game.sim.getAs(s.id, 'building') : undefined;
      if (b && isTower(b.kind))
        this.host.cmd({ t: 'placeDevice', hero: this.host.ui.heroId, plan: p.id, building: b.id });
      else this.host.ui.hint(`Select a tower to set the ${p.name.toLowerCase()} into an upper window`);
      return;
    }
    if (p.type === 'top') {
      // A top goes onto a tower: the one selected.
      const s = this.host.ui.selected;
      const b = s?.kind === 'building' ? this.host.game.sim.getAs(s.id, 'building') : undefined;
      if (b && isTower(b.kind)) this.host.cmd({ t: 'upgradeTop', hero: this.host.ui.heroId, building: b.id });
      else this.host.ui.hint(`Select a tower to build its ${p.name.toLowerCase()} onto it`);
      return;
    }
    this.host.cancelModes();
    this.host.ui.placing = p.id;
    this.host.ui.placingBuy = buy;
    this.host.ui.placingRot = null;
    // A tower laid out from the wall-walk: the lens tilts down over the field below (it rises too: see Game).
    if (isTower(p.building) && h && onWall(h.x, h.z))
      this.host.game.cam.easeTo(
        Math.max(this.host.game.cam.pitch, 0.62),
        Math.max(this.host.game.cam.goal, 6.5),
      );
  }
  turnPlan(dir: number): void {
    const g = this.host.game;
    if (this.host.ui.placing) {
      const size = planSize(this.host.ui.placing);
      const step = size > 1 ? Math.PI / 2 : Math.PI / 12;
      const c = this.cursorCell();
      const center = c ? cellCenter(c.cx, c.cz) : (this.host.hero ?? { x: 0, z: 0 });
      const now = this.host.ui.placingRot ?? faceRoad(g.sim, center.x, center.z, size > 1);
      this.host.ui.placingRot = turnFor(now + dir * step, size);
      return;
    }
    const s = this.host.ui.selected;
    const site = s?.kind === 'site' ? g.sim.getAs(s.id, 'site') : undefined;
    const plan = site && PLANS[site.plan];
    if (!site || !plan || plan.type !== 'building') return;
    const size = planSize(plan.id);
    this.host.cmd({
      t: 'turnSite',
      site: site.id,
      rot: site.rot + dir * (size > 1 ? Math.PI / 2 : Math.PI / 12),
    });
  }
  startGem(id: GemId): void {
    this.host.cancelModes();
    this.host.ui.placingGem = id;
    const s = this.host.ui.selected;
    const b = s?.kind === 'building' ? this.host.game.sim.getAs(s.id, 'building') : undefined;
    if (b && isTower(b.kind)) this.placeGemOn(b.id);
    else this.host.ui.hint(`Click a tower to set the ${PLANS[id].name} into one of its windows`);
  }
  placeGemOn(buildingId: number): void {
    const id = this.host.ui.placingGem;
    const b = this.host.game.sim.getAs(buildingId, 'building');
    if (!id || !b) return;
    if (!isTower(b.kind)) {
      this.host.ui.hint('Gems go into tower windows');
      return;
    }
    const why = b.site ? 'A gem is already being set into it' : gemBlocker(b.gems, id);
    if (why) {
      this.host.ui.hint(why);
      return;
    }
    this.host.cmd({ t: 'placeGem', hero: this.host.ui.heroId, plan: id, building: b.id });
    this.host.ui.placingGem = null;
  }
  private cursorCell(
    px = this.host.ui.mouse.x,
    py = this.host.ui.mouse.y,
  ): { cx: number; cz: number } | null {
    const gp = this.host.game.groundAtScreen(px, py);
    return gp ? cellOf(gp.x, gp.z) : null;
  }
  private get placingKind(): BuildingKind | undefined {
    return this.host.ui.placing
      ? (PLANS[this.host.ui.placing] as { building: BuildingKind }).building
      : undefined;
  }
  private heroBlocker(cx: number, cz: number): string | null {
    const c = cellCenter(cx, cz);
    const h = this.host.hero;
    const kind = this.placingKind;
    // A tower is laid out over the wall, from up on the wall-walk (the sim keeps it within reach of the wall).
    if (kind && buildZone(kind) === 'out')
      return onWall(h.x, h.z)
        ? null
        : 'Up onto the wall-walk first (the stairs by the gate): towers are laid out over the wall';
    return dist(c.x, c.z, h.x, h.z) > PLACE_RANGE ? 'Too far from you' : null;
  }
  private placeBlocker(cx: number, cz: number): string | null {
    // (By the wall's rule too: workshops in town, towers beyond the wall — the ghost says so.)
    return (
      this.heroBlocker(cx, cz) ??
      placementBlocker(
        this.host.game.sim,
        cx,
        cz,
        this.host.ui.placing ? planSize(this.host.ui.placing) : 1,
        this.placingKind,
      )
    );
  }
  tryPlace(px: number, py: number, keep: boolean): void {
    const plan = this.host.ui.placing;
    const c = this.cursorCell(px, py);
    if (!plan || !c) return;
    const why = this.placeBlocker(c.cx, c.cz);
    if (why) {
      this.host.ui.hint(why);
      return;
    }
    this.host.cmd({
      t: 'place',
      hero: this.host.ui.heroId,
      plan,
      cx: c.cx,
      cz: c.cz,
      ...(this.host.ui.placingBuy ? { buy: true } : {}),
      ...(this.host.ui.placingRot != null ? { rot: this.host.ui.placingRot } : {}),
    });
    if (!keep) this.host.cancelModes();
  }
  update(time: number): void {
    const g = this.host.game;
    const plan = this.host.ui.placing;
    if (plan !== this.ghostPlan) {
      if (this.ghost) this.ghost.removeFromParent();
      this.ghost = null;
      this.ghostPlan = plan;
      if (plan) {
        const p = PLANS[plan];
        if (p.type === 'building') {
          this.ghost = buildingModel(g.assets, p.building);
          this.ghost.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.material = this.ghostMat;
              m.castShadow = false;
            }
          });
          g.stage.scene.add(this.ghost);
        }
      }
    }
    gridUniforms.uGridOn.value = plan ? 1 : 0;
    if (!plan || !this.ghost) {
      for (const f of this.footprint) f.visible = false;
      return;
    }
    const c = this.cursorCell();
    if (!c) return;
    const center = cellCenter(c.cx, c.cz);
    const why = this.placeBlocker(c.cx, c.cz);
    const heroWhy = this.heroBlocker(c.cx, c.cz);
    const ok = !why;
    this.ghost.position.set(center.x, groundHeight(g.sim.world, center.x, center.z), center.z);
    // It faces the road by itself (in quarter turns, filling its cells) — or the way R turned it.
    this.ghost.rotation.y =
      this.host.ui.placingRot ?? faceRoad(g.sim, center.x, center.z, planSize(plan) > 1);
    this.ghostMat.uniforms['uColor']!.value.set(ok ? '#7dffb0' : '#ff6a5a');
    this.ghostMat.uniforms['uTime']!.value = time;
    gridUniforms.uGridCenter.value.set(center.x, center.z);
    // One tile per footprint cell: red where that cell itself is blocked (or on the wrong side of the wall).
    const p0 = PLANS[plan];
    const half = (planSize(plan) - 1) / 2;
    let i = 0;
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const f = this.footprint[i++]!;
        const cc = cellCenter(c.cx + dx, c.cz + dz);
        f.position.set(cc.x, groundHeight(g.sim.world, cc.x, cc.z) + 0.06, cc.z);
        f.visible = true;
        const cellOk = !placementBlocker(
          g.sim,
          c.cx + dx,
          c.cz + dz,
          1,
          (p0 as { building: BuildingKind }).building,
        );
        (f.material as THREE.MeshBasicMaterial).color.set(cellOk && !heroWhy ? '#7dffb0' : '#ff6a5a');
      }
    }
    for (; i < this.footprint.length; i++) this.footprint[i]!.visible = false;
    const p = PLANS[plan];
    // A tower: the ring its archer will cover.
    if (p.type === 'building' && isTower(p.building))
      this.rangeRing.set(center.x, center.z, ARCHER.range, ok ? '#ffe9a8' : '#ff6a5a');
    if (why && this.host.ui.cursorHintT <= 0.01) this.host.ui.cursorHint = why;
  }
}
