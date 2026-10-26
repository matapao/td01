/** Public input API and keyboard dispatch; controls/ owns gestures, queries and command actions. */
import { horseOf } from '../game/maintenance.ts';
import * as THREE from 'three';
import { Scanner } from './scanner.ts';
import type { Game } from './game.ts';
import type { Sel, UiState } from '../ui/state.ts';
import {
  ENEMIES,
  classOf,
  PLANS,
  type AbilityId,
  type BasePlanId,
  type BuildingKind,
  type GemId,
  type PlanId,
} from '../game/content.ts';
import { groundHeight } from '../game/map.ts';
import { sightRange } from '../game/systems/power.ts';
import { DrapedRing } from './overlays.ts';
import type { Command } from '../game/types.ts';
import { dist } from '../core/math.ts';
import { MovementControls } from './controls/movement.ts';
import { PlacementControls } from './controls/placement.ts';
import { InteractionActions } from './controls/interactions.ts';
import { CombatControls } from './controls/combat.ts';
import { pick, selectionPosition } from './controls/picking.ts';
import { findPrompt } from './controls/prompts.ts';
import { buildingR } from './controls/context.ts';

/** Ability on each number key (W and friends are for walking). */
/** 1–4: your class's skills (see CLASSES); plans sit on 5 … =. */
export const SKILL_KEYS = ['1', '2', '3', '4'];
/** The rest of the bar holds known plans, in learning order. */
export const PLAN_KEYS = ['5', '6', '7', '8', '9', '0', '-', '='];
const BAR_CODES: Record<string, string> = { Minus: '-', Equal: '=' };
for (let i = 0; i <= 9; i++) BAR_CODES[`Digit${i}`] = String(i);

export class Input {
  public readonly game: Game;
  public readonly ui: UiState;

  private dom: HTMLElement;
  private rangeRing: DrapedRing;
  private selRing: DrapedRing;
  /** A thin ring under what the cursor is over (cheap: no outline pass). */
  private hoverRing: DrapedRing;
  private rallyRing: DrapedRing;
  private time = 0;
  /** A mouse button held (the player turning the camera about). */
  get looking(): boolean {
    return this.movement.looking;
  }
  /** The plan being laid down, if any. */
  get placingPlan(): BasePlanId | null {
    return this.ui.placing;
  }
  private rockCursor = new THREE.Mesh(
    new THREE.RingGeometry(0.018, 0.035, 20),
    new THREE.MeshBasicMaterial({ color: '#e9d39a', side: THREE.DoubleSide, depthWrite: false }),
  );
  private scanner: Scanner;
  private mountButton = document.createElement('button');
  /** On a trackpad, a two-finger press-and-hold (right button) walks forward. */
  get rightHoldWalks(): boolean {
    return this.movement.rightHoldWalks;
  }
  set rightHoldWalks(value: boolean) {
    this.movement.rightHoldWalks = value;
  }
  /** Current F-prompt target. */
  prompt: { sel: Sel; text: string } | null = null;
  setActivity(open: boolean): void {
    this.activityOpen = open;
    this.movement.clearMovement();
    if (open) this.cmd({ t: 'stop', hero: this.ui.heroId });
  }
  activityOpen = false;
  blastArmed = false;
  onWorkshop: () => void = () => {};
  onOverview: () => void = () => {};
  onBlastAim: () => void = () => {};
  onCloseActivity: () => void = () => {};
  onSelect: (sel: Sel | null) => void = () => {};
  onOpenBook: () => void = () => {};
  onOpenRoad: () => void = () => {};
  onOpenBuy: () => void = () => {};
  onToggleBag: () => void = () => {};
  onToggleMap: () => void = () => {};
  onOpenClass: () => void = () => {};
  onEscape: () => void = () => {};
  onBeatKey: (down: boolean) => boolean = () => false;

  private movement: MovementControls;
  private placement: PlacementControls;
  private actions: InteractionActions;
  private combat: CombatControls;
  constructor(game: Game, ui: UiState) {
    this.game = game;
    this.ui = ui;

    this.dom = game.stage.renderer.domElement;
    this.scanner = new Scanner(game, (text) => ui.hint(text));
    this.mountButton.className = 'btn tiny';
    this.mountButton.style.cssText =
      'position:absolute;left:16px;bottom:148px;z-index:40;pointer-events:auto';
    this.mountButton.onclick = () => {
      const h = this.hero;
      if (h) this.cmd({ t: 'mount', hero: h.id });
    };
    game.ui.append(this.mountButton);
    game.stage.scene.add(this.rockCursor);
    this.rockCursor.visible = false;
    const world = game.sim.world;
    this.rangeRing = new DrapedRing(world, '#ffe9a8', 0.1, 0.7, true);
    this.selRing = new DrapedRing(world, '#7dffb0', 0.08, 0.9);
    this.hoverRing = new DrapedRing(world, '#ffe9a8', 0.05, 0.7);
    this.rallyRing = new DrapedRing(world, '#6fd0ff', 0.07, 0.9, true);
    game.stage.scene.add(this.rangeRing.mesh, this.selRing.mesh, this.hoverRing.mesh, this.rallyRing.mesh);
    this.placement = new PlacementControls(this, this.rangeRing);
    this.combat = new CombatControls(this);
    this.actions = new InteractionActions(this, this, () => this.movement.wide, this.dom);
    this.movement = new MovementControls(this, this, this.dom, {
      leftClick: (x, y, shift) => this.leftClick(x, y, shift),
      rightClick: (x, y) => this.rightClick(x, y),
      key: (e, down) => this.key(e, down),
    });
  }
  get hero() {
    return this.game.sim.getAs(this.ui.heroId, 'hero')!;
  }
  get selected(): Sel | null {
    return this.ui.selected;
  }
  cmd(c: Command): void {
    this.game.sim.apply(c);
  }
  private leftClick(px: number, py: number, shift: boolean): void {
    if (this.ui.placing) {
      this.placement.tryPlace(px, py, shift);
      return;
    }
    const sel = this.pick(px, py);
    if (this.ui.targeting) {
      if (sel?.kind === 'enemy')
        this.cmd({ t: 'cast', hero: this.ui.heroId, ability: this.ui.targeting, target: sel.id });
      else this.ui.hint('Pick an enemy');
      this.ui.targeting = null;
      return;
    }
    if (this.ui.placingGem) {
      if (sel?.kind === 'building') this.placement.placeGemOn(sel.id);
      else this.ui.hint('Click one of your towers');
      return;
    }
    // Rock is worked with the dedicated tool action or a precise right-click.
    this.select(sel?.kind === 'cell' ? null : sel);
  }
  private rightClick(px: number, py: number): void {
    if (this.ui.placing || this.ui.placingGem || this.ui.targeting) {
      this.cancelModes();
      return;
    }
    if (this.blastArmed && this.actions.useTerrain(px, py)) return;
    const sel = this.pick(px, py);
    if (!sel && this.actions.useTerrain(px, py)) return;
    if (sel?.kind === 'node') {
      const n = this.game.sim.getAs(sel.id, 'node');
      if (n?.kind === 'tree' && n.amount <= 0) {
        this.cmd({ t: 'plant', hero: this.ui.heroId, x: n.x, z: n.z });
        return;
      }
    }
    const s = this.ui.selected;
    // A tower with footmen selected + right-click on the ground → rally point.
    if (s?.kind === 'building' && (!sel || sel.kind === 'node' || sel.kind === 'drop')) {
      const b = this.game.sim.getAs(s.id, 'building');
      const gp = this.game.groundAtScreen(px, py);
      if (b?.stats?.rally && gp) {
        this.cmd({ t: 'rally', building: b.id, x: gp.x, z: gp.z });
        this.game.fx.ring(gp.x, gp.y, gp.z, 0.2, 1.4, '#6fd0ff', 0.4);
        return;
      }
    }
    if (!sel || sel.kind === 'hero' || sel.kind === 'unit') return;
    this.actions.act(sel);
  }
  select(sel: Sel | null): void {
    this.ui.selected = sel;
    this.onSelect(sel);
  }
  cancelModes(): void {
    this.ui.placing = null;
    this.ui.placingBuy = false;
    this.ui.placingGem = null;
    this.ui.targeting = null;
  }
  private key(e: KeyboardEvent, down: boolean): void {
    // Typing in a text box is not playing. A ticked checkbox or a slider gives the keys back to the
    // game (and lets go of the focus, so Space doesn't tick it again or Esc stick in it).
    const t = e.target;
    if (t instanceof HTMLTextAreaElement) return;
    if (t instanceof HTMLInputElement) {
      if (!['checkbox', 'radio', 'range', 'button'].includes(t.type)) return;
      t.blur();
    }
    if (this.activityOpen) {
      if (down && e.code === 'Escape') this.onCloseActivity();
      return;
    }
    if (e.key === 'Alt') {
      this.ui.alt = down;
      this.game.views.alt = down;
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyF') {
      e.preventDefault();
      if (this.onBeatKey(down)) return;
      if (down && !e.repeat) this.interact();
      return;
    }
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    this.movement.setKey(e.code, down);
    if (!down || e.repeat) return;
    const bar = BAR_CODES[e.code];
    if (bar) {
      const skill = SKILL_KEYS.indexOf(bar);
      const h = this.hero;
      const id = h && skill >= 0 ? classOf(h).abilities[skill] : undefined;
      if (id) this.cast(id);
      const slot = PLAN_KEYS.indexOf(bar);
      if (slot >= 0) {
        const plan = this.knownPlans()[slot];
        if (plan) this.startPlacing(plan);
        else this.ui.hint('No plan on that key yet — learn more in the Plan Book (P)');
      }
      return;
    }
    switch (e.code) {
      case 'KeyT':
        this.onBlastAim();
        return;
      case 'KeyX':
        this.useTool();
        return;
      case 'KeyL':
        this.cmd({ t: 'toggleTorch', hero: this.ui.heroId });
        return;
      case 'KeyH':
        if (this.hero) this.cmd({ t: 'mount', hero: this.hero.id });
        return;
      case 'KeyV':
        this.scanner.toggle();
        return;
      case 'Space':
        this.game.views.heroJump(this.ui.heroId);
        break;
      case 'Tab':
        this.combat.nextTarget();
        break;
      // The usual MMO keys: B bags, P the book of plans (spellbook), M the map, G buy a plan.
      case 'KeyB':
        this.onToggleBag();
        break;
      case 'KeyP':
        this.onOpenBook();
        break;
      // O: the Road of Invention (and the Field Notes).
      case 'KeyO':
        this.onOpenRoad();
        break;
      case 'KeyM':
        this.onToggleMap();
        break;
      case 'KeyG':
        this.onOpenBuy();
        break;
      // R turns what you are placing — or a blueprint you have selected, until it is built (Shift: back).
      case 'KeyR':
        this.turnPlan(e.shiftKey ? -1 : 1);
        break;
      case 'KeyC':
        this.onOpenClass();
        break;
      case 'KeyN':
        this.game.sim.callWave();
        break;
      // Dev mode: build anything, free and at once.
      case 'Backquote':
        this.cmd({ t: 'devMode', on: !this.game.sim.state.dev });
        break;
      case 'Escape':
        if (this.blastArmed) {
          this.blastArmed = false;
          this.ui.hint('Charge placement cancelled');
          return;
        }
        if (this.scanner.visible) {
          this.scanner.toggle();
          return;
        }
        if (this.ui.placing || this.ui.placingGem || this.ui.targeting) this.cancelModes();
        else if (this.hero?.droneOn && !this.hero.droneBack && !this.ui.window) this.cast('drone');
        else this.onEscape();
        break;
    }
  }
  update(dt: number): void {
    this.time += dt;
    const g = this.game;
    const ui = this.ui;
    ui.cursorHintT = Math.max(0, ui.cursorHintT - dt);
    this.movement.update(dt);
    const rider = this.hero;
    if (rider) {
      const horse = horseOf(rider);
      this.mountButton.hidden =
        g.indoors ||
        g.under ||
        rider.dead ||
        (!horse.riding && dist(rider.x, rider.z, horse.x, horse.z) > 2.2);
      this.mountButton.textContent = horse.riding ? 'H · Dismount' : 'H · Mount horse';
    }

    // F prompt.
    this.prompt = findPrompt(this.game, this.hero);
    if (this.prompt) {
      const p = this.selPos(this.prompt.sel);
      if (p) {
        const k = this.prompt.sel.kind;
        p.y +=
          k === 'node'
            ? 0.9
            : k === 'building' || k === 'site'
              ? 1.6
              : k === 'poi'
                ? 1.6
                : k === 'wagon'
                  ? 0.65
                  : k === 'cavein'
                    ? 0.9
                    : k === 'cell'
                      ? 0.75
                      : 0.6;
        g.labels.show(
          'prompt',
          p,
          `<span class="pkey">F</span> ${this.prompt.text}`,
          'prompt-label',
          this.dom.clientWidth,
          this.dom.clientHeight,
        );
      }
    }
    // Hover (only when the cursor is free).
    const hover =
      ui.placing || this.movement.pointerLocked || this.movement.looking
        ? null
        : this.pick(ui.mouse.x, ui.mouse.y);
    ui.hover = hover;
    this.rockCursor.visible = false;
    if (!hover && !ui.placing && !ui.window && !this.movement.looking && !this.game.indoors) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          (ui.mouse.x / this.dom.clientWidth) * 2 - 1,
          1 - (ui.mouse.y / this.dom.clientHeight) * 2,
        ),
        g.stage.camera,
      );
      const hit = g.mines.pickRock(ray),
        h = this.hero;
      if (
        hit &&
        h &&
        Math.hypot(hit.x - h.x, hit.y - groundHeight(g.sim.world, h.x, h.z) - 0.4, hit.z - h.z) < 3
      ) {
        const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
        this.rockCursor.position.set(hit.x, hit.y, hit.z).addScaledVector(n, 0.012);
        this.rockCursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        this.rockCursor.visible = true;
        this.rockCursor.scale.setScalar(this.movement.wide ? 2.3 : 1);
      }
    }

    const sel = ui.selected;
    // Hovered things get a thin ring (red for the dead).
    this.hoverRing.hide();
    if (hover?.kind === 'cell') {
      // A piece of the mine's rock: a small ring where you'd hack at it.
      const hp = this.selPos(hover);
      if (hp) this.hoverRing.set(hp.x, hp.z, 0.3, '#ffe9a8');
    } else if (hover && (hover.kind !== sel?.kind || hover.id !== sel?.id)) {
      const hp = hover.kind === 'enemy' ? g.views.enemyObject(hover.id)?.position : this.selPos(hover);
      const ent = g.sim.get(hover.id);
      if (hp && ent) {
        const r =
          ent.type === 'building'
            ? buildingR(ent.e.kind) + 0.2
            : ent.type === 'enemy'
              ? ENEMIES[ent.e.kind].radius + 0.1
              : ent.type === 'site'
                ? buildingR('tower') + 0.2
                : 0.6;
        this.hoverRing.set(hp.x, hp.z, r, hover.kind === 'enemy' ? '#ff6a5a' : '#ffe9a8');
      }
    }
    this.dom.style.cursor =
      ui.placing || ui.placingGem || ui.targeting
        ? 'crosshair'
        : hover?.kind === 'enemy'
          ? 'crosshair'
          : hover
            ? 'pointer'
            : 'default';
    // Selection ring / range / rally.
    this.selRing.hide();
    this.rangeRing.hide();
    this.rallyRing.hide();
    if (sel) {
      const ent = g.sim.get(sel.id);
      const p = this.selPos(sel);
      if (!ent || (ent.type === 'enemy' && ent.e.hp <= 0)) {
        this.select(null);
      } else if (p) {
        const kind =
          ent.type === 'building'
            ? ent.e.kind
            : ent.type === 'site' && PLANS[ent.e.plan].type === 'building'
              ? (PLANS[ent.e.plan] as { building: BuildingKind }).building
              : 'tower';
        const r =
          sel.kind === 'building' || sel.kind === 'site'
            ? buildingR(kind) + 0.3
            : sel.kind === 'enemy'
              ? ENEMIES[(ent.e as { kind: 'minion' }).kind].radius + 0.12
              : 0.35;
        if (ent.type === 'enemy') {
          const v = g.views.enemyObject(sel.id);
          if (v) this.selRing.set(v.position.x, v.position.z, r, '#ff6a5a');
        } else this.selRing.set(p.x, p.z, r, '#7dffb0');
        if (ent.type === 'building' && ent.e.stats) {
          // At night an unlit tower sees less far: the ring shows what it sees now.
          // A guard room without a shooting top: the ring shows how far its footmen can be rallied.
          const r = ent.e.stats.range > 0 ? sightRange(g.sim, ent.e) : ent.e.stats.rally;
          if (r > 0) this.rangeRing.set(ent.e.x, ent.e.z, r);
          if (ent.e.stats.rally) this.rallyRing.set(ent.e.rallyX, ent.e.rallyZ, 1.6);
        }
      }
    }
    this.rangeRing.tick(this.time);
    this.rallyRing.tick(this.time);
    this.placement.update(this.time);
  }
  pick(px: number, py: number): Sel | null {
    return pick(this.game, this.dom, px, py);
  }
  selPos(sel: Sel): THREE.Vector3 | null {
    return selectionPosition(this.game, sel);
  }
  knownPlans(): BasePlanId[] {
    return this.placement.knownPlans();
  }
  startPlacing(plan: PlanId, buy = false): void {
    this.placement.startPlacing(plan, buy);
  }
  turnPlan(dir: number): void {
    this.placement.turnPlan(dir);
  }
  startGem(id: GemId): void {
    this.placement.startGem(id);
  }
  stopFighting(): void {
    this.combat.stopFighting();
  }
  cast(id: AbilityId): void {
    this.combat.cast(id);
  }
  useTool(): void {
    this.actions.useTool();
  }
  interact(): void {
    this.actions.interact(this.prompt);
  }
}
