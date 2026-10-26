import { DeploymentMap } from './deployment-map.ts';
/** The first tower cycle: optional guidance, physical preparation, construction and deployment. */
import { TowerWorkshopView } from '../view/towerwork.ts';
import { guidePreference, setGuidePreference } from './preferences.ts';
import type { Game } from '../view/game.ts';
import type { Input } from '../view/input.ts';
import type { UiState } from './state.ts';
import { MAP, cellOf } from '../game/map.ts';
import { atFabricator, atOversight, deploymentBlocker, towerMaterials } from '../game/towerwork.ts';
import { blastSkill, PREP_BAY } from '../game/blasting.ts';
import { el } from './dom.ts';

type Mode = 'welcome' | 'workshop' | 'overview' | 'blasting' | null;
export class FirstLoop {
  private game: Game;
  private input: Input;
  private ui: UiState;

  private root = el('div');
  private panel: HTMLElement | null = null;
  private mode: Mode = null;
  private key = '';
  private welcomed = false;
  private guideButton = el('button', 'btn tiny');
  private prepButton = el('button', 'btn tiny');
  private craftButton = el('button', 'btn tiny');
  private deploymentMap: DeploymentMap;
  private mapTick = -1;
  private hadTower = false;
  private preview: { cx: number; cz: number } | null = null;
  private crate = 0;
  private map: HTMLCanvasElement | null = null;
  private scene: TowerWorkshopView;
  private warning = el('div', 'panel');
  constructor(game: Game, input: Input, ui: UiState) {
    this.game = game;
    this.input = input;
    this.ui = ui;

    this.root.style.cssText = 'position:absolute;inset:0;z-index:70;pointer-events:none';
    game.ui.append(this.root);
    for (const [button, text, left, bottom, run] of [
      [this.guideButton, 'Walkthrough', 16, 176, () => this.open('welcome')],
      [this.prepButton, 'Prepare charges', 16, 205, () => this.open('blasting')],
      [this.craftButton, 'Tower platform', 16, 234, () => this.open('workshop')],
    ] as const) {
      button.textContent = text;
      button.style.cssText = `position:absolute;left:${left}px;bottom:${bottom}px;pointer-events:auto`;
      button.onclick = run;
      this.root.append(button);
    }
    this.warning.style.cssText =
      'position:absolute;left:50%;bottom:145px;transform:translateX(-50%);padding:9px 15px;color:#ffbd7d;display:none';
    this.root.append(this.warning);
    input.onWorkshop = () => this.open('workshop');
    input.onOverview = () => this.open('overview');
    input.onCloseActivity = () => this.close();
    input.onBlastAim = () => this.armCharge();
    this.scene = new TowerWorkshopView(game);
    this.deploymentMap = new DeploymentMap(game);
    this.hadTower = game.sim.state.firstTowerAt >= 0;
    game.onFrame(() => this.update());
  }
  private get hero() {
    return this.game.sim.getAs(this.game.localHero, 'hero') ?? this.game.sim.state.heroes[0];
  }
  close(): void {
    this.mode = null;
    this.panel?.remove();
    this.panel = null;
    this.map = null;
    this.key = '';
    this.input.setActivity(false);
  }
  private open(mode: Mode): void {
    const h = this.hero;
    if (!h || h.dead || h.transit) return;
    if (mode === 'workshop' && !atFabricator(this.game.sim, h)) {
      this.ui.hint('Go to the tower platform inside the workshop');
      return;
    }
    if (mode === 'overview' && !atOversight(h)) {
      this.ui.hint('Use the overview table at the top of the gate stairs');
      return;
    }
    if (mode === 'blasting' && Math.hypot(h.x - PREP_BAY.x, h.z - PREP_BAY.z) > 2.4) {
      this.ui.hint('The preparation bench is in the mine arrival bay');
      return;
    }
    this.mode = mode;
    this.key = '';
    this.input.setActivity(true);
    this.render();
    this.key = this.stateKey();
  }
  private button(parent: HTMLElement, text: string, run: () => void, disabled = false): HTMLButtonElement {
    const b = el('button', 'btn') as HTMLButtonElement;
    b.textContent = text;
    b.disabled = disabled;
    b.onclick = run;
    b.style.margin = '6px 6px 0 0';
    parent.append(b);
    return b;
  }
  private armCharge(): void {
    if (!this.hero) return;
    if (this.hero.x < 1500) {
      this.ui.hint('Use charges in the mine');
      return;
    }
    if (blastSkill(this.hero).level < 1) {
      this.open('blasting');
      return;
    }
    if (!(this.hero.bag.dynamite ?? 0)) {
      this.ui.hint('Prepare charges at the arrival bench: 1 coal + 1 sulfur makes 2');
      return;
    }
    this.close();
    this.input.blastArmed = true;
    this.ui.hint(
      'Right-click an exposed rock face to place a charge. Aim higher to clear the roof. Esc cancels without spending it.',
    );
  }
  private stateKey(): string {
    const h = this.hero,
      s = this.game.sim.state;
    if (!h) return '';
    return JSON.stringify([
      this.mode,
      h.bag,
      h.blastSkill,
      (s.towerCrates ?? []).map((c) => [c.id, c.work, c.ready, c.shipment?.site]),
      (h.fabricatingUntil ?? 0) > s.time,
      this.preview,
      this.crate,
    ]);
  }
  private render(): void {
    this.panel?.remove();
    this.map = null;
    if (!this.mode) return;
    const h = this.hero;
    if (!h) {
      this.close();
      return;
    }
    const g = this.game,
      crates = g.sim.state.towerCrates ?? [],
      skill = blastSkill(h),
      need = towerMaterials();
    const panel = el('div', 'panel pe');
    panel.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${this.mode === 'overview' ? 'min(1120px,94vw)' : 'min(500px,90vw)'};max-height:90vh;overflow:auto;padding:20px;pointer-events:auto`;
    if (this.mode === 'workshop') {
      panel.style.left = '16px';
      panel.style.top = '120px';
      panel.style.transform = 'none';
      panel.style.width = 'min(330px,32vw)';
    }
    this.panel = panel;
    this.root.append(panel);
    if (this.mode === 'welcome') {
      panel.append(
        el('h2', '', 'Your first tower'),
        el(
          'p',
          '',
          'Gather in the village and mine, construct a tower kit at the workshop, then coordinate its shipment from the overview table. The first attack waits until the tower is deployed.',
        ),
      );
      panel.append(el('p', '', 'Would you like a guided walkthrough? You can change this at any time.'));
      this.button(panel, 'Guide me', () => {
        setGuidePreference('on');
        this.close();
      });
      this.button(panel, 'I know the basics', () => {
        setGuidePreference('off');
        this.close();
      });
      return;
    }
    this.button(panel, 'Close · Esc', () => this.close());
    if (this.mode === 'workshop') {
      panel.append(
        el('h2', '', 'Tower construction platform'),
        el(
          'p',
          '',
          'Build and pack the tower sections here. A stored tower is shipped to the position you choose from the overview table.',
        ),
      );
      const job = crates.find((c) => !c.ready);
      if (job) {
        panel.append(el('p', '', `Assembly: ${job.work}%`));
        this.button(
          panel,
          'Hammer the next section',
          () => g.sim.apply({ t: 'hammerTower', hero: h.id, crate: job.id }),
          !!((h.fabricatingUntil ?? 0) > g.sim.state.time),
        );
      } else {
        panel.append(
          el(
            'p',
            '',
            `Materials carried: ${h.bag.wood ?? 0}/${need.wood} wood · ${h.bag.stone ?? 0}/${need.stone} stone`,
          ),
        );
        this.button(
          panel,
          'Load materials and start tower',
          () => g.sim.apply({ t: 'queueTower', hero: h.id }),
          (h.bag.wood ?? 0) < (need.wood ?? 0) || (h.bag.stone ?? 0) < (need.stone ?? 0),
        );
      }
      panel.append(
        el(
          'p',
          '',
          `Ready in storage: ${crates.filter((c) => c.ready && !c.shipment).length} · Shipping: ${crates.filter((c) => c.shipment).length}`,
        ),
      );
      if (crates.some((c) => c.ready && !c.shipment))
        panel.append(
          el(
            'p',
            '',
            'Next: leave the workshop, climb the stairs beside the gate and press F at the overview table.',
          ),
        );
      return;
    }
    if (this.mode === 'blasting') {
      const headings = [
        'Inspect the game fuse',
        'Pack the starter charges',
        'Plan your retreat',
        'Blasting ready',
      ] as const;
      const notes = [
        'Check the fictional fuse indicator. Two starter game charges are supplied here; none are sold by the shop.',
        'Pack the two starter game items into your bag. Later, 1 coal and 1 sulfur makes two more.',
        'Choose a nearby exposed face, place the charge, then move outside its marked radius before the countdown ends. Charges can hurt you.',
        'T arms placement. Right-click the rock, including a reachable high face. The charge is spent only when placement succeeds.',
      ] as const;
      const stage = Math.min(3, skill.stage),
        heading = headings[stage],
        note = notes[stage];
      if (heading === undefined || note === undefined) return;
      panel.append(el('h2', '', heading), el('p', '', note));
      if (skill.stage < 3) {
        const label = ['Inspect indicator', 'Pack 2 starter charges', 'Understood — enable placement'][
          skill.stage
        ];
        if (label !== undefined)
          this.button(panel, label, () =>
            g.sim.apply({ t: 'prepareBlast', hero: h.id, step: skill.stage + 1 }),
          );
      } else {
        panel.append(
          el(
            'p',
            '',
            `Blasting skill ${skill.level}/3 · ${skill.xp} completed blasts · ${h.bag.dynamite ?? 0} charges`,
          ),
        );
        this.button(panel, 'Aim a charge · T', () => this.armCharge(), !(h.bag.dynamite ?? 0));
        this.button(
          panel,
          'Prepare 2 charges · 1 coal + 1 sulfur',
          () => g.sim.apply({ t: 'makeCharges', hero: h.id }),
          (h.bag.coal ?? 0) < 1 || (h.bag.sulfur ?? 0) < 1,
        );
      }
      return;
    }
    panel.append(
      el('h2', '', 'Overview · tower deployment'),
      el(
        'p',
        '',
        'Choose a stored tower, click clear ground beside a road, then confirm shipment. The ring previews archer range. Orange markers are deliveries; blue markers are deployed towers.',
      ),
    );
    const ready = crates.filter((c) => c.ready && !c.shipment);
    if (!ready.some((c) => c.id === this.crate)) this.crate = ready[0]?.id ?? 0;
    for (const [index, c] of ready.entries())
      this.button(panel, `${c.id === this.crate ? 'Selected · ' : ''}Tower kit ${index + 1}`, () => {
        this.crate = c.id;
        this.key = '';
      });
    if (!ready.length)
      panel.append(el('p', '', 'No tower kit is ready. Build one at the workshop platform first.'));
    const map = document.createElement('canvas');
    map.width = 960;
    map.height = 560;
    map.style.cssText =
      'display:block;width:100%;height:48vh;max-height:440px;background:#27372d;border:1px solid #aa8c4a;margin-top:12px;cursor:crosshair';
    this.map = map;
    panel.append(map);
    map.onclick = (e) => {
      const r = map.getBoundingClientRect(),
        x = MAP.minX + ((e.clientX - r.left) / r.width) * (MAP.maxX - MAP.minX),
        z = MAP.minZ + ((e.clientY - r.top) / r.height) * (MAP.maxZ - MAP.minZ);
      this.preview = cellOf(x, z);
      this.key = '';
    };
    const why = this.preview
      ? deploymentBlocker(g.sim, this.preview.cx, this.preview.cz)
      : 'Click a destination on the map';
    panel.append(el('p', '', why ?? 'Destination clear — ready to ship'));
    this.button(
      panel,
      'Confirm shipment',
      () => {
        if (this.preview && this.crate) {
          g.sim.apply({ t: 'shipTower', hero: h.id, crate: this.crate, ...this.preview });
          this.preview = null;
          this.key = '';
        }
      },
      !this.crate || !!why,
    );
    this.drawMap();
  }
  private drawMap(): void {
    if (this.map) this.deploymentMap.draw(this.map, this.preview);
  }
  private update(): void {
    const g = this.game,
      h = this.hero,
      s = g.sim.state;
    if (!h) {
      this.close();
      this.scene.update();
      return;
    }
    if (
      this.mode &&
      this.mode !== 'welcome' &&
      (h.dead ||
        h.transit ||
        (this.mode === 'workshop' && !atFabricator(g.sim, h)) ||
        (this.mode === 'overview' && !atOversight(h)) ||
        (this.mode === 'blasting' && Math.hypot(h.x - PREP_BAY.x, h.z - PREP_BAY.z) > 2.4))
    )
      this.close();
    if (!this.hadTower && s.firstTowerAt >= 0) {
      this.hadTower = true;
      this.ui.hint(
        'First tower cycle complete — gathered, built, shipped and deployed. The first attack is preparing.',
      );
    }
    if (!this.welcomed && !this.ui.window) {
      this.welcomed = true;
      if (guidePreference() === null) this.open('welcome');
    }
    this.prepButton.hidden = !g.under || !!h.transit || Math.hypot(h.x - PREP_BAY.x, h.z - PREP_BAY.z) > 2.4;
    this.craftButton.hidden = !atFabricator(g.sim, h) || !!h.transit;
    if (this.mode) {
      const key = this.stateKey();
      if (key !== this.key) {
        this.render();
        this.key = this.stateKey();
      }
    }
    if (this.map && this.mapTick !== Math.floor(s.time * 3)) {
      this.mapTick = Math.floor(s.time * 3);
      this.drawMap();
    }
    this.scene.update();
    const bomb = s.bombs.find((b) => b.hero === h.id);
    this.warning.style.display = bomb ? 'block' : 'none';
    if (bomb) this.warning.textContent = `${Math.ceil(bomb.t)} · Charge lit — stand back`;
  }
}
