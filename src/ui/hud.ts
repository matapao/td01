import { gerund, bestRun } from './hud-labels.ts';
import type { Game } from '../view/game.ts';
import type { Input } from '../view/input.ts';
import type { UiState } from './state.ts';
import type { Icons } from './icons.ts';
import {
  dayPart,
  todNow,
  ABILITIES,
  DRONE,
  classOf,
  weaponTier,
  type HeroClass,
  HERO,
  ITEMS,
  NODES,
  PLANS,
} from '../game/content.ts';
import { MAP } from '../game/map.ts';
import { WAVES } from '../game/waves.ts';
import { planCost, workAction } from '../game/systems/craft.ts';
import { ABILITY_SVG, el, esc, pct, setHtml, setText } from './dom.ts';
import { AGE_GLYPH, glyph } from './glyphs.ts';
import { heroMarks, marksHtml } from './status.ts';
import { valeAge, AGES } from '../game/road.ts';
import { roadOf } from '../game/systems/road.ts';
import { Inventions } from './inventions.ts';
import { Tooltip } from './tooltip.ts';
import { Minimap } from './minimap.ts';
import { ActionPanel } from './actions.ts';
import { Guide } from './guide.ts';
import { Windows } from './windows.ts';
import { forgetGame } from './persist.ts';
import { fmtTime } from '../core/math.ts';

import './hud.css';
import { HudLayout } from './hud/layout.ts';
import { HudInventory } from './hud/inventory.ts';
import { HudSelection } from './hud/selection.ts';
import { HudSpace } from './hud/space.ts';
import { hookHudEvents } from './hud/events.ts';
import type { HudPanelContext } from './hud/context.ts';

export class Hud {
  private game: Game;
  private ui: UiState;
  private input: Input;
  private icons: Icons;

  readonly root = el('div', 'hud');
  readonly tip: Tooltip;
  readonly minimap: Minimap;
  readonly actions: ActionPanel;
  readonly guide: Guide;
  readonly windows: Windows;
  private readonly layout: HudLayout;
  private readonly inventory: HudInventory;
  private readonly selection: HudSelection;
  private readonly space: HudSpace;
  private inventions: Inventions;
  private shownClass: HeroClass | null = null;
  private lastGold = 0;
  private lastLives = 0;
  private lastGateHp = -1;
  private lastPart = '';
  private dusks = 0;
  private flash = 0;
  private flashColor: [number, number, number] = [1, 0.2, 0.15];
  private pulseKey = '';

  constructor(game: Game, ui: UiState, input: Input, icons: Icons, parent: HTMLElement) {
    this.game = game;
    this.ui = ui;
    this.input = input;
    this.icons = icons;

    parent.appendChild(this.root);
    this.tip = new Tooltip(this.root);
    this.minimap = new Minimap(game);

    this.actions = new ActionPanel(this.root, (q) =>
      game.sim.apply({ t: 'beat', hero: ui.heroId, quality: q }),
    );
    this.guide = new Guide(game, (text, kind) => this.note(text, kind ?? 'info', true));
    this.windows = new Windows(game, ui, icons, this.tip, () => {});
    this.inventions = new Inventions(
      game,
      ui,
      this.root,
      () => this.windows.close(),
      (text, kind) => this.note(text, kind),
    );
    const context: HudPanelContext = { game, ui, input, icons, tip: this.tip, hero: () => this.hero };
    this.layout = new HudLayout({
      ...context,
      root: this.root,
      minimap: this.minimap,
      windows: this.windows,
      inventions: this.inventions,
      toggle: (window) => this.toggle(window),
    });
    this.inventory = new HudInventory(context, this.layout);
    this.space = new HudSpace(context, this.layout.spacePanel);
    this.selection = new HudSelection(context, this.layout, this.guide, this.space);
    hookHudEvents({
      game,
      ui,
      hero: context.hero,
      note: (text, kind, sticky) => this.note(text, kind, sticky),
      toast: (big, small) => this.toast(big, small),
      flash: (color, strength) => this.flashScreen(color, strength),
      endScreen: (won) => this.endScreen(won),
    });
    input.onBeatKey = (down) => this.actions.key(down);
    input.onOpenBook = () => this.toggle({ kind: 'book' });
    input.onOpenBuy = () => this.toggle({ kind: 'buy' });
    input.onToggleBag = () => this.layout.bagPanel.classList.toggle('hidden');
    input.onToggleMap = () => this.minimap.root.classList.toggle('big');
    input.onOpenClass = () => this.toggle({ kind: 'class' });
    this.windows.startBuy = (pid) => input.startPlacing(pid, true);
    // Esc: close a window → stop fighting → clear the target → the menu (the MMO order).
    input.onEscape = () => {
      const h = game.sim.getAs(ui.heroId, 'hero');
      if (ui.window) this.windows.close();
      else if (h && !h.dead && h.task.k === 'attack') input.stopFighting();
      else if (ui.selected) input.select(null);
      else this.toggle({ kind: 'menu' });
    };
    input.onSelect = () => this.selection.invalidate();
    this.lastGold = game.sim.state.gold;
    this.lastLives = game.sim.state.lives;
  }

  private get hero() {
    return this.game.sim.getAs(this.ui.heroId, 'hero')!;
  }

  toggle(w: NonNullable<UiState['window']>): void {
    if (this.ui.window && this.ui.window.kind === w.kind) this.windows.close();
    else this.ui.window = w;
  }

  note(text: string, kind = 'info', sticky = false): void {
    const d = el('div', kind, esc(text));
    this.layout.log.append(d);
    while (this.layout.log.children.length > 7) this.layout.log.firstElementChild!.remove();
    setTimeout(() => (d.style.opacity = '0'), sticky ? 14000 : 7000);
    setTimeout(() => d.remove(), sticky ? 15000 : 8000);
  }

  toast(big: string, small: string): void {
    const t = el(
      'div',
      'toast panel',
      `<div class="t-big gold-text">${esc(big)}</div><div class="t-small">${esc(small)}</div>`,
    );
    this.layout.toasts.append(t);
    while (this.layout.toasts.children.length > 3) this.layout.toasts.firstElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }

  private flashScreen(color: [number, number, number], strength: number): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, strength);
  }

  private endScreen(won: boolean): void {
    const s = this.game.sim.state;
    const w = el('div', 'window panel pe endscreen');
    // A win is graded by the lives it cost — a flawless one (not one of the dead through) is the
    // challenge for the best; the best result at each Sigil is kept on this machine.
    const lost = s.maxLives - s.lives;
    const grade = !won
      ? null
      : lost === 0
        ? ['Flawless', 'flawless', 'Not one of the dead got through.']
        : lost <= 3
          ? ['Steadfast', 'steadfast', 'Only a handful got through.']
          : lost <= 10
            ? ['Held', 'held', 'The keep held.']
            : ['Survived', 'survived', 'It was close.'];
    const best = won ? bestRun(s.sigil, lost) : bestRun(s.sigil);
    const sigil = s.sigil ? ` · Sigil ${s.sigil}` : '';
    w.innerHTML = `<div class="w-body"><div class="big gold-text">${won ? 'Victory' : 'Hollowmere has fallen'}</div>
      ${grade ? `<div class="grade ${grade[1]}">${grade[0]}${sigil}</div>` : ''}
      <div class="w-sub">${won ? `The crypts fall silent. ${grade![2]}` : `The dead broke through on wave ${s.wave}.`}</div>
      <div class="stats" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin:12px auto;max-width:320px;text-align:left">
      <span>Lives kept</span><b>${s.lives}/${s.maxLives}</b><span>Best here${sigil ? ` (Sigil ${s.sigil})` : ''}</span><b>${best === null ? '—' : best === 0 ? 'Flawless' : `${best} lost`}</b>
      <span>Waves</span><b>${s.wave}/${WAVES.length}</b><span>Dead destroyed</span><b>${s.stats.kills}</b><span>Leaked</span><b>${s.stats.leaks}</b>
      <span>Gathered</span><b>${s.stats.gathered}</b><span>Crafted</span><b>${s.stats.crafted}</b><span>Built</span><b>${s.stats.built}</b><span>Perfect strikes</span><b>${s.stats.perfects}</b><span>Time</span><b>${fmtTime(s.time)}</b></div></div>`;
    const again = el('button', 'btn', 'Play again');
    again.onclick = () => this.onPlayAgain();
    (w.firstElementChild as HTMLElement).append(again);
    this.root.append(w);
    this.endEl = w;
  }

  private endEl: HTMLElement | null = null;
  /** Play again: a fresh game (a LAN game asks the host to start one for everyone). */
  onPlayAgain: () => void = () => {
    forgetGame(true);
    location.reload();
  };

  // ---- Per frame ---------------------------------------------------------------------------------

  update(dt: number): void {
    this.space.updateSpacePanel();
    const g = this.game;
    const s = g.sim.state;
    const h = this.hero;
    // A LAN snapshot can briefly lack your hero (a load, a rejoin): skip the frame.
    if (!h) return;
    // A new game (LAN) takes the end screen away.
    if (this.endEl && s.phase !== 'won' && s.phase !== 'lost') {
      this.endEl.remove();
      this.endEl = null;
    }
    // Resources.
    this.layout.devBadge.classList.toggle('hidden', !s.dev);
    const age = valeAge(roadOf(this.game.sim));
    setHtml(this.layout.ageBadge, `${glyph(AGE_GLYPH[age])} ${AGES.find((x) => x.id === age)!.name} Age`);
    this.layout.devClock.classList.toggle('hidden', !s.dev);
    if (s.dev) {
      const tod = todNow(s);
      const min = Math.round(tod * 1440) % 1440;
      setText(
        this.layout.clockText,
        `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`,
      );
      if (!this.layout.clockDrag) this.layout.clockRange.value = String(min);
      setText(this.layout.clockHold, s.dayHold != null ? '▶' : '⏸');
      this.layout.clockHold.title = s.dayHold != null ? 'Let the day run on' : 'Hold the time of day';
    }
    // Dev mode: gold and the keep's lives are unlimited.
    setText(this.layout.goldEl, s.dev ? '∞' : String(Math.floor(s.gold)));
    setText(this.layout.livesEl, s.dev ? '∞' : String(s.lives));
    if (s.gold > this.lastGold) this.bump(this.layout.goldBox, 'bump');
    if (s.lives < this.lastLives) this.bump(this.layout.livesBox, 'hurt');
    this.lastGold = s.gold;
    this.lastLives = s.lives;
    const gate = s.gate;
    if (gate.hp !== this.lastGateHp) {
      const f = gate.hp / gate.maxHp;
      this.layout.gateFill.style.width = pct(f);
      this.layout.gateFill.style.background = f > 0.5 ? '#6fcf4f' : f > 0.25 ? '#f0b02e' : '#e8452e';
      setText(this.layout.gateText, gate.hp <= 0 ? 'broken' : `${Math.round(f * 100)}%`);
      this.layout.gateBox.classList.toggle('broken', gate.hp <= 0);
      if (gate.hp < this.lastGateHp - gate.maxHp * 0.04) this.bump(this.layout.gateBox, 'hurt');
      this.lastGateHp = gate.hp;
    }
    setText(this.layout.waveN, `Wave ${s.wave}/${WAVES.length}`);
    const left = s.nextWaveAt >= 0 ? s.nextWaveAt - s.time : -1;
    const part = dayPart(todNow(s));
    if (part !== this.lastPart) {
      if (this.lastPart && part === 'Dusk')
        this.note(
          this.dusks++
            ? 'Dusk — night is coming'
            : 'Dusk — night is coming. In the dark, unlit towers see a fifth less far: the torches on the wall light the towers near it; set a Brazier up on the wall-walk to light them 16 m out, or a Sun Topaz in a window.',
          'info',
          !this.dusks,
        );
      if (this.lastPart && part === 'Dawn') this.note('Dawn breaks', 'info');
      this.lastPart = part;
    }
    // A wave held back (until you call it) shows no countdown. The dead still on the roads count
    // as the wave going on, however long their walk (the next one can set out meanwhile).
    const when = left > 99 * 60 ? 'call it when ready (N)' : `in ${fmtTime(left)}`;
    let onRoads = 0;
    for (const e of s.enemies) if (!e.camp && e.hp > 0) onRoads++;
    const status =
      s.dev && s.wavesOff
        ? 'Waves off · dev mode'
        : s.phase === 'won'
          ? 'Victory!'
          : onRoads > 0
            ? `${onRoads} dead on the roads${left >= 0 ? ` · next ${when}` : ''}`
            : left >= 0
              ? `${s.wave === 0 ? 'First wave' : 'Next'} ${when}`
              : s.wave === 0 && s.firstTowerAt < 0
                ? 'Prepare and deploy your first tower'
                : s.wave >= WAVES.length
                  ? 'Final wave'
                  : 'Wave in progress';
    setText(this.layout.waveT, `${part === 'Night' ? '☾' : part === 'Day' ? '☀' : '◐'} ${part} · ${status}`);
    this.layout.callBtn.disabled = !!(s.dev && s.wavesOff) || left < 0 || s.wave >= WAVES.length;
    setText(
      this.layout.callBtn,
      s.wave === 0 ? 'Begin' : `Call${left > 1 ? ` +${Math.min(50, Math.ceil(left))}g` : ''}`,
    );
    // Screen flash.
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const gu = g.stage.grade.uniforms.uFlash.value;
    gu.set(this.flashColor[0], this.flashColor[1], this.flashColor[2], this.flash);
    // Hero frame.
    setText(this.layout.heroLvl, String(h.level));
    this.layout.heroHp.style.width = pct(h.hp / h.maxHp);
    this.layout.heroHp.classList.toggle('low', h.hp < h.maxHp * 0.35);
    setText(
      this.layout.heroHpText,
      h.dead ? `Respawning in ${Math.ceil(h.respawnT)}` : `${Math.ceil(h.hp)} / ${h.maxHp}`,
    );
    const lvls = HERO.xpLevels;
    const xp0 = lvls[h.level - 1] ?? 0;
    const xp1 = lvls[h.level] ?? xp0 + 1;
    this.layout.heroXp.style.width = pct(h.level >= lvls.length ? 1 : (h.xp - xp0) / (xp1 - xp0));
    setText(this.layout.heroSub, this.taskText());
    setHtml(this.layout.heroMarks, marksHtml(heroMarks(h)));
    // Your class: name, portrait and the three skills.
    const cls = classOf(h);
    // The portrait: your class, holding your weapon at its tier (drawn again when either changes, or as the models arrive).
    const portrait = this.icons.hero(cls.id, weaponTier(h));
    if (this.layout.heroPortrait.getAttribute('src') !== portrait) this.layout.heroPortrait.src = portrait;
    if (this.shownClass !== cls.id) {
      this.shownClass = cls.id;
      setText(
        this.layout.heroName,
        h.name === HERO.name ? `${cls.name} · ${cls.role}` : `${h.name} · ${cls.name}`,
      );
      this.layout.skillSlots.forEach((slot, i) => {
        const id = cls.abilities[i];
        slot.classList.toggle('hidden', !id);
        if (!id) return;
        slot.innerHTML = `${ABILITY_SVG[id]}<div class="key">${i + 1}</div><div class="cd" style="--p:0%"></div>`;
        (slot.firstElementChild as SVGElement).setAttribute('width', '100%');
        (slot.firstElementChild as SVGElement).setAttribute('height', '100%');
        slot.dataset['cd'] = '0';
      });
    }
    // Skills recharging.
    for (const [i, id] of cls.abilities.entries()) {
      const slot = this.layout.skillSlots[i];
      if (!slot) continue;
      const cd = h.cds[id] ?? 0;
      // A drone that was shot down is out longer than its usual recharge.
      const total = cd > ABILITIES[id].cooldown ? Math.max(cd, DRONE.downCooldown) : ABILITIES[id].cooldown;
      const ov = slot.querySelector('.cd') as HTMLElement;
      ov.style.setProperty('--p', `${(cd / total) * 100}%`);
      setText(ov, cd > 0 ? String(Math.ceil(cd)) : '');
      if (cd <= 0 && slot.dataset['cd'] === '1') {
        slot.classList.remove('ready');
        void slot.offsetWidth;
        slot.classList.add('ready');
      }
      slot.dataset['cd'] = cd > 0 ? '1' : '0';
      slot.classList.toggle('active', this.ui.targeting === id || (id === 'drone' && !!h.droneOn));
    }
    // Flying the drone: its battery, hull and how far it is from you.
    this.layout.droneBox.classList.toggle('hidden', !h.droneOn);
    if (h.droneOn) {
      const far = Math.hypot((h.droneX ?? h.x) - h.x, (h.droneZ ?? h.z) - h.z);
      const batt = (h.droneT ?? 0) / DRONE.battery;
      const hull = (h.droneHp ?? 0) / DRONE.hp;
      setHtml(
        this.layout.droneBox,
        `<b>Drone</b>${h.droneBack ? ' · <span class="warn">coming home</span>' : ''}
        <span class="dbar"><i style="width:${pct(batt)};background:${batt < 0.25 ? '#ff6a5a' : '#7fe8ff'}"></i></span> battery ${Math.ceil(h.droneT ?? 0)} s
        <span class="dbar"><i style="width:${pct(hull)};background:${hull < 0.35 ? '#ff6a5a' : '#9dffb0'}"></i></span> hull
        · <span class="${far > DRONE.range - 3 ? 'warn' : ''}">${Math.round(far)} / ${DRONE.range} m</span>
        <span class="w-sub">· WASD fly · 4 or Esc: home</span>`,
      );
    }
    this.layout.interactSlot?.classList.toggle('active', !!this.input.prompt);
    if (this.layout.torchSlot) {
      this.layout.torchSlot.disabled = !h.torchOwned || h.dead;
      this.layout.torchSlot.classList.toggle('active', !!h.torchOwned && h.torchLit !== false);
      this.layout.torchSlot.classList.toggle('locked', !h.torchOwned);
    }
    this.inventory.updatePlanBar();
    this.inventory.updateBag();
    this.selection.updateTarget();
    this.selection.updateBoss();
    this.selection.updateTracker();
    this.selection.updateDetails();
    // Hands-on action panel.
    const wa = workAction(g.sim, h);
    if (wa && !h.dead) this.actions.show(wa.action, wa.label, wa.progress);
    else this.actions.hide();
    this.actions.update(dt);
    // Placement banner + cursor hint.
    const placing = this.ui.placing
      ? PLANS[this.ui.placing].name
      : this.ui.placingGem
        ? PLANS[this.ui.placingGem].name
        : this.ui.targeting
          ? ABILITIES[this.ui.targeting].name
          : '';
    this.layout.placing.classList.toggle('hidden', !placing);
    const bought =
      this.ui.placing && this.ui.placingBuy
        ? ` — bought outright, ${planCost(this.ui.placing)}g on placement`
        : '';
    if (placing)
      setHtml(
        this.layout.placing,
        this.ui.targeting
          ? `Target: <b>${placing}</b> — left-click an enemy · right-click to cancel`
          : `Placing plan: <b>${placing}</b>${bought} — R turns it (Shift+R back) · left-click to place (Shift: keep placing) · right-click or Esc to cancel`,
      );
    const hint = this.ui.cursorHintT > 0 || (this.ui.placing && this.ui.cursorHint) ? this.ui.cursorHint : '';
    this.layout.cursorHint.classList.toggle('hidden', !hint);
    if (hint) {
      setText(this.layout.cursorHint, hint);
      this.layout.cursorHint.style.left = `${this.ui.mouse.x + 18}px`;
      this.layout.cursorHint.style.top = `${this.ui.mouse.y + 20}px`;
    }
    if (!this.ui.placing && this.ui.cursorHintT <= 0) this.ui.cursorHint = '';
    this.minimap.update(dt);
    if (!this.game.under)
      setText(this.minimap.label, s.intel >= 2 ? 'Radar active' : s.intel >= 1 ? 'Watched' : MAP.name);
    this.windows.update();
    this.applyPulse();
  }

  private bump(e: HTMLElement, cls: string): void {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
  }

  private taskText(): string {
    const h = this.hero;
    const g = this.game;
    if (h.dead) return 'Fallen — returning to the gate';
    const t = h.task;
    switch (t.k) {
      case 'gather': {
        const n = g.sim.getAs(t.node, 'node');
        return n
          ? `${gerund(NODES[n.kind].verb)} ${ITEMS[NODES[n.kind].item].name.toLowerCase()} (${h.bag[NODES[n.kind].item] ?? 0} carried)`
          : 'Gathering';
      }
      case 'work': {
        const wa = workAction(g.sim, h);
        return wa ? `${wa.label}…` : 'Working';
      }
      case 'study':
        return `Studying ${PLANS[t.plan].name} · ${Math.ceil(t.total - t.t)}s`;
      case 'attack':
        return 'Fighting';
      case 'move':
        return 'Moving';
      case 'interact':
        return 'On the way';
      default:
        return `Carrying ${g.sim.bagSlots(h)}/${HERO.bag} slots`;
    }
  }

  /** Highlight the current guidance control after lazily rebuilt panels update. */
  private applyPulse(): void {
    const key = this.guide.pulse() ?? '';
    if (key === this.pulseKey) return;
    this.pulseKey = key;
    for (const e of this.root.querySelectorAll('.hint-pulse')) e.classList.remove('hint-pulse');
    if (!key) return;
    if (key === 'book') this.layout.bookBtn.classList.add('hint-pulse');
    else this.root.querySelector(`[data-pulse="${key}"]`)?.classList.add('hint-pulse');
    // The plan bar re-renders lazily; re-apply next frame if needed.
    if (!this.root.querySelector('.hint-pulse')) this.pulseKey = '';
  }
}
