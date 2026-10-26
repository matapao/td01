import type { UiState } from '../state.ts';
import { todNow, BAG_STACK, ABILITIES, classOf, weaponTier, DISCIPLINES, HERO } from '../../game/content.ts';
import { toolIcon, COIN_SVG, HEART_SVG, INTERACT_SVG, el, esc, setText } from '../dom.ts';
import { markTip } from '../status.ts';
import type { Inventions } from '../inventions.ts';
import type { Minimap } from '../minimap.ts';
import type { Windows } from '../windows.ts';
import { weaponLine } from '../forge.ts';
import type { HudPanelContext } from './context.ts';

interface HudLayoutContext extends HudPanelContext {
  readonly root: HTMLElement;
  readonly minimap: Minimap;
  readonly windows: Windows;
  readonly inventions: Inventions;
  readonly toggle: (window: NonNullable<UiState['window']>) => void;
}

/** DOM ownership and initial bindings, kept in their original construction order. */
export class HudLayout {
  readonly goldEl = el('span');
  readonly goldBox = el('div', 'res');
  readonly livesEl = el('span');
  readonly livesBox = el('div', 'res');
  readonly gateBox = el('div', 'res gate-res');
  readonly gateFill = el('i');
  readonly gateText = el('span');
  readonly waveN = el('span', 'wave-n gold-text');
  readonly waveT = el('span', 'wave-t');
  readonly callBtn = el('button', 'btn call pe', 'Call wave');
  readonly speedBtn = el('button', 'btn tiny pe', '1×');
  readonly devBadge = el('button', 'dev-badge btn tiny pe hidden', 'DEV');
  readonly ageBadge = el('button', 'age-badge btn tiny pe', '');
  readonly spacePanel = el('div', 'space-panel panel pe hidden');
  readonly devClock = el('div', 'dev-clock pe hidden');
  readonly clockRange = el('input');
  readonly clockText = el('span', 'dev-clock-t');
  readonly clockHold = el('button', 'btn tiny');
  readonly heroPortrait = el('img');
  readonly heroLvl = el('div', 'lvl');
  readonly heroHp = el('div', 'fill hp');
  readonly heroHpText = el('span');
  readonly heroXp = el('div', 'fill xp');
  readonly heroSub = el('div', 'sub');
  readonly target = el('div', 'uframe panel target hidden pe');
  readonly bossFrame = el('div', 'bossframe panel hidden');
  readonly tracker = el('div', 'tracker panel pe');
  readonly intelBox = el('div');
  readonly objBox = el('div');
  readonly skillSlots: HTMLElement[] = [];
  readonly droneBox = el('div', 'drone-box panel hidden');
  readonly heroName = el('div', 'name gold-text');
  readonly heroMarks = el('div', 'hero-marks');
  readonly planBar = el('div', 'row');
  readonly bookBtn = el('div', 'slot pe');
  interactSlot: HTMLElement | null = null;
  torchSlot: HTMLButtonElement | null = null;
  readonly bag = el('div', 'bag-grid');
  readonly toolRow = el('div', 'tool-row');
  readonly bagPanel = el('div', 'bagpanel panel pe');
  readonly buyBtn = el('div', 'slot pe');
  readonly bagHead = el('div', 'bag-head');
  readonly details = el('div', 'details panel hidden pe');
  readonly log = el('div', 'eventlog');
  readonly toasts = el('div', 'toasts');
  readonly cursorHint = el('div', 'cursor-hint hidden');
  readonly placing = el('div', 'placing-banner panel hidden');
  clockDrag = false;
  private readonly context: HudLayoutContext;

  constructor(context: HudLayoutContext) {
    this.context = context;
    this.build();
  }

  private build(): void {
    const c = this.context;
    const r = c.root;
    // Top bar.
    const top = el('div', 'topbar panel pe');
    this.goldBox.innerHTML = COIN_SVG;
    this.goldBox.append(this.goldEl);
    this.livesBox.innerHTML = HEART_SVG;
    this.livesBox.append(this.livesEl);
    c.tip.tip(
      this.goldBox,
      () =>
        '<div class="tt-title">Gold</div><div class="tt-line">Pick up coins dropped by the dead and found in chests. Spend it in shops.</div>',
    );
    this.gateBox.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V10a8 8 0 0 1 16 0v11h-6v-6.5a2 2 0 0 0-4 0V21z" fill="#b39c78" stroke="#2e2216" stroke-width="1.3"/></svg>';
    const gbar = el('span', 'gbar');
    gbar.append(this.gateFill);
    this.gateBox.append(gbar, this.gateText);
    c.tip.tip(this.gateBox, () => {
      const g = c.game.sim.state.gate;
      return `<div class="tt-title">The gate — ${Math.ceil(g.hp)}/${g.maxHp}</div><div class="tt-line">It stands shut: the dead that walk the roads stop at its doors and batter them, under your towers' fire. When it breaks they pour in. Mend it at its winch inside the gate (F) with wood, stone, planks or blocks and a hammer — quickly between the waves, slowly while the dead are ramming it. A third of the way mended, a broken gate swings shut again.</div>`;
    });
    c.tip.tip(
      this.livesBox,
      () =>
        '<div class="tt-title">Keep lives</div><div class="tt-line">Every one of the dead that breaks in through the gate costs lives. The gate stands shut and holds the walkers at its doors until they batter it down (its bar hangs over the gateway) — mend it at its winch. At zero lives, Hollowmere falls.</div>',
    );
    const wave = el('div', 'wavebox');
    wave.append(this.waveN, this.waveT, this.callBtn);
    this.callBtn.onclick = () => c.game.sim.callWave();
    c.tip.tip(
      this.callBtn,
      () =>
        '<div class="tt-title">Call the next wave early (N)</div><div class="tt-line">Earn bonus gold for every second you skip.</div>',
    );
    this.speedBtn.onclick = () => {
      c.game.speed = c.game.speed === 1 ? 2 : c.game.speed === 2 ? 0.5 : 1;
      setText(this.speedBtn, `${c.game.speed}×`);
    };
    const menuBtn = el('button', 'btn tiny pe', '☰');
    menuBtn.onclick = () => c.toggle({ kind: 'menu' });
    this.devBadge.onclick = () => c.game.sim.apply({ t: 'devMode', on: false });
    this.ageBadge.onclick = () => c.toggle({ kind: 'road' });
    c.tip.tip(
      this.ageBadge,
      () =>
        '<div class="tt-title">The Road of Invention (O)</div><div class="tt-line">The vale retells humanity\'s road, age by age: invent each step by hand at its workshop. Its ideas go in the Field Notes.</div>',
    );
    c.input.onOpenRoad = () => c.toggle({ kind: 'road' });
    c.windows.onInvent = (id) => c.inventions.start(id);
    c.tip.tip(
      this.devBadge,
      () =>
        '<div class="tt-title">Dev mode</div><div class="tt-line">Everything is free and at once: any plan builds as soon as you place it, gems go straight in, no tools needed; unlimited gold, health and keep lives. Click (or press `) to turn it off.</div>',
    );
    const r0 = this.clockRange;
    r0.type = 'range';
    r0.min = '0';
    r0.max = '1440';
    r0.step = '10';
    const held = () => c.game.sim.state.dayHold != null;
    const setTime = (hold: boolean) => c.game.sim.apply({ t: 'setTime', tod: Number(r0.value) / 1440, hold });
    r0.addEventListener('pointerdown', () => (this.clockDrag = true));
    r0.addEventListener('input', () => setTime(held()));
    r0.addEventListener('change', () => {
      this.clockDrag = false;
      r0.blur();
    });
    this.clockHold.onclick = () => {
      r0.value = String(Math.round(todNow(c.game.sim.state) * 1440));
      setTime(!held());
    };
    this.devClock.append(this.clockText, r0, this.clockHold);
    c.tip.tip(
      this.devClock,
      () =>
        '<div class="tt-title">Time of day (dev mode)</div><div class="tt-line">Drag to set the clock — night, dawn, noon. ⏸ holds it there; ▶ lets the day run on from it.</div>',
    );
    top.append(
      this.goldBox,
      this.livesBox,
      this.gateBox,
      wave,
      this.ageBadge,
      this.speedBtn,
      menuBtn,
      this.devBadge,
      this.devClock,
    );
    r.append(top);

    // Frames.
    const frames = el('div', 'frames');
    const hf = el('div', 'uframe panel pe');
    const portrait = el('div', 'portrait');
    portrait.append(this.heroPortrait, this.heroLvl);
    portrait.onclick = () => c.game.cam.snapBehind(c.hero().facing);
    const info = el('div', 'info');
    const hpBar = el('div', 'bar');
    hpBar.append(this.heroHp, this.heroHpText);
    const xpBar = el('div', 'bar xp');
    xpBar.append(this.heroXp);
    // The name line carries your status markers (Shield Wall…); hovering one names it.
    const nameRow = el('div', 'name-row');
    nameRow.append(this.heroName, this.heroMarks);
    info.append(nameRow, hpBar, xpBar, this.heroSub);
    hf.append(portrait, info);
    hf.addEventListener('pointerover', () => c.tip.refresh());
    this.target.addEventListener('pointerover', () => c.tip.refresh());
    c.tip.tip(this.target, () => markTip(this.target));
    c.tip.tip(hf, () => {
      const h = c.hero();
      const mark = markTip(hf);
      if (mark) return mark;
      return `<div class="tt-title">${classOf(h).name} (${classOf(h).role}) · level ${h.level}</div><div class="tt-line">${classOf(h).blurb} Change class with C.</div><div class="tt-line">WASD to walk, F to gather / deliver / build, 1–3 to fight. Carries ${HERO.bag} stacks of up to ${BAG_STACK}.</div>
      <div class="tt-line">${Object.entries(h.mastery)
        .map(([d, n]) => `${DISCIPLINES[d as 'carpentry'].name} ${n}`)
        .join(' · ')}</div>
      <div class="tt-line"><img class="tt-weapon" src="${c.icons.weapon(h.cls, weaponTier(h))}" width="28" height="28" style="vertical-align:middle;margin-right:4px">${weaponLine(h)}</div>`;
    });
    frames.append(hf, this.target);
    r.append(frames, this.bossFrame);

    // Right column: minimap + tracker.
    const right = el('div', 'rightcol');
    right.append(c.minimap.root, this.tracker);
    this.tracker.append(this.intelBox, this.objBox);
    r.append(right);

    // Action bar.
    const bottom = el('div', 'bottombar');
    const ab = el('div', 'actionbar panel pe');
    // 1–4: your class's skills (the slots are redrawn when the class changes; a class with three hides the fourth).
    for (let i = 0; i < 4; i++) {
      const s = el('div', 'slot');
      s.onclick = () => {
        const id = classOf(c.hero()).abilities[i];
        if (id) c.input.cast(id);
      };
      c.tip.tip(s, () => {
        const id = classOf(c.hero()).abilities[i];
        if (!id) return '';
        const a = ABILITIES[id];
        return `<div class="tt-title">${a.name} (${i + 1})</div><div class="tt-sub">Cooldown ${a.cooldown}s</div><div class="tt-line">${a.blurb}</div>`;
      });
      this.skillSlots.push(s);
      ab.append(s);
    }
    const interact = el('div', 'slot interact', `${INTERACT_SVG}<div class="key">F</div>`);
    interact.onclick = () => c.input.interact();
    c.tip.tip(
      interact,
      () =>
        `<div class="tt-title">Interact (F)</div><div class="tt-line">${c.input.prompt ? esc(c.input.prompt.text) : 'Walk up to a tree, rock, plan, station, chest or shop.'}</div><div class="tt-line tt-sub">While crafting, F (or a click) hits the beat.</div>`,
    );
    this.interactSlot = interact;
    const dig = el(
      'button',
      'slot utility',
      `<img src="${toolIcon('pickaxe')}" alt=""><div class="key">X</div>`,
    );
    dig.type = 'button';
    dig.setAttribute('aria-label', 'Dig ahead (X)');
    dig.title = 'Dig ahead (X) · Shift: wider patch';
    dig.onclick = () => c.input.useTool();
    c.tip.tip(
      dig,
      () =>
        '<div class="tt-title">Dig ahead (X)</div><div class="tt-line">Face nearby rock and use your tool. In the mine, chip out clusters of tiny blocks; Shift clears a wider patch. Right-click a rock face to aim precisely.</div><div class="tt-sub">F operates the lift and other nearby objects. V opens the scanner.</div>',
    );
    const torch = el(
      'button',
      'slot utility',
      `<img src="${toolIcon('torch')}" alt=""><div class="key">L</div>`,
    );
    torch.type = 'button';
    torch.setAttribute('aria-label', 'Toggle mine torch (L)');
    torch.onclick = () => c.game.sim.apply({ t: 'toggleTorch', hero: c.ui.heroId });
    c.tip.tip(
      torch,
      () =>
        `<div class="tt-title">Mine torch (L)</div><div class="tt-line">${c.hero().torchOwned ? 'Light or extinguish your torch. It lights nearby rock while you explore the mine.' : 'Buy a Pitchwood Torch at the shop counter for 5 gold.'}</div>`,
    );
    this.torchSlot = torch;
    ab.append(interact, dig, torch, el('div', 'sep'), this.planBar, el('div', 'sep'));
    this.bookBtn.innerHTML = `<img src="${c.icons.item('rune')}"><div class="key">P</div>`;
    this.bookBtn.onclick = () => c.toggle({ kind: 'book' });
    c.tip.tip(
      this.bookBtn,
      () =>
        '<div class="tt-title">Plan Book (P)</div><div class="tt-line">Study scrolls to learn plans. Every building starts as a plan.</div>',
    );
    this.buyBtn.innerHTML = `<img src="${c.icons.item('gold')}"><div class="key">G</div>`;
    this.buyBtn.onclick = () => c.toggle({ kind: 'buy' });
    c.tip.tip(
      this.buyBtn,
      () =>
        '<div class="tt-title">Buy a plan outright (G)</div><div class="tt-line">Shows the plans your gold can pay for in full — porters bring every part as you place it.</div>',
    );
    ab.append(this.bookBtn, this.buyBtn);
    bottom.append(ab);
    r.append(bottom);

    // Bag.
    const bagPanel = this.bagPanel;
    bagPanel.append(this.bagHead, this.toolRow, this.bag);
    r.append(bagPanel);

    r.append(
      this.details,
      this.log,
      this.toasts,
      this.placing,
      this.cursorHint,
      this.droneBox,
      this.spacePanel,
      c.windows.root,
    );
  }
}
