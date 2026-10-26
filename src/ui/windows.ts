/** Modal-ish windows: shops, storehouse, plan book, menu (visuals), end screen. */
import { shopCatalogue } from '../game/shop.ts';
import { AGES, valeAge, type MilestoneId } from '../game/road.ts';
import { roadOf } from '../game/systems/road.ts';
import type { Game } from '../view/game.ts';
import type { Icons } from './icons.ts';
import type { Tooltip } from './tooltip.ts';
import type { UiState, UiWindow } from './state.ts';
import {
  type BasePlanId,
  BUILD_ORDER,
  CRAFTER_KIT,
  crafterKitPrice,
  TORCH,
  ABILITIES,
  CLASSES,
  CLASS_ORDER,
  CRATE_PRICE,
  DISCIPLINES,
  GEM_COLORS,
  ITEMS,
  ITEM_ORDER,
  PLANS,
  STORES,
  enchantedPrice,
  storePrice,
  type Discipline,
  type ItemId,
  type GemPlan,
  type PlanId,
} from '../game/content.ts';
import { RARITY, affixText, type ItemInstance } from '../game/loot.ts';
import { planCost, scrollPrice, studyTime } from '../game/systems/craft.ts';
import { WAVES } from '../game/waves.ts';
import { ABILITY_SVG, toolIcon, el, esc } from './dom.ts';
import { creditsHtml } from './credits.ts';
import { forgetGame } from './persist.ts';
import { weaponCard } from './forge.ts';

export function gearTooltip(g: ItemInstance): string {
  return `<div class="tt-title" style="color:${RARITY[g.rarity].color}">${esc(g.name)}</div>
    <div class="tt-sub">${RARITY[g.rarity].name} ${ITEMS[g.base].name} · item level ${g.ilvl}</div>
    ${g.affixes.map((a) => `<div class="tt-line aff">${affixText(a)}</div>`).join('')}
    <div class="tt-line tt-sub">Fills a ${ITEMS[g.base].name} slot in any plan — the building keeps the enchant.</div>`;
}

/** What a gem plan works with, in words. */
export function gemWhere(p: GemPlan): string {
  const c = GEM_COLORS[p.color];
  return `<span style="color:${c.color}">${c.name}</span> · ${c.family} — melted into a tower's window socket${p.element ? ` · element (one per tower)` : ''}`;
}

export function planTooltip(id: PlanId, known: boolean): string {
  const p = PLANS[id];
  const parts = Object.entries(p.parts)
    .map(([k, n]) => `${n} ${ITEMS[k as ItemId].name}`)
    .join(', ');
  const steps = p.steps.map((s) => s.label).join(' → ');
  return `<div class="tt-title">${p.name}</div>
    <div class="tt-sub" style="color:${DISCIPLINES[p.discipline].color}">${DISCIPLINES[p.discipline].name} plan${known ? '' : ' · not learned'}</div>
    <div class="tt-line">${p.blurb}</div>${
      p.type === 'gem'
        ? `
    <div class="tt-line tt-sub">${gemWhere(p)}</div>`
        : ''
    }
    <div class="tt-line"><b>Parts:</b> ${parts}${p.type === 'gem' ? ` <span class="tt-sub">(raw gems come from the mines)</span>` : ''}</div>
    <div class="tt-line"><b>${p.type === 'gem' ? 'Shaping' : 'Assembly'}:</b> ${steps}</div>`;
}

const SOURCES: Partial<Record<PlanId, string>> = {
  blast: 'rumoured at the Lumber Camp (south-west)',
  arcane: 'rumoured at the Forgotten Shrine (north)',
  arcanist: 'rumoured at the Forgotten Shrine (north)',
  stonecutter: 'rumoured in the Watchtower Ruins (north-west)',
  far: 'rumoured in the Hollow Meadow (south)',
  storm: 'rumoured in the Hollow Cave (north-west)',
};

export class Windows {
  private game: Game;
  private ui: UiState;
  private icons: Icons;
  private tip: Tooltip;
  private onClose: () => void;

  readonly root = el('div', 'windows');
  private win: HTMLElement | null = null;
  private key = '';

  constructor(game: Game, ui: UiState, icons: Icons, tip: Tooltip, onClose: () => void) {
    this.game = game;
    this.ui = ui;
    this.icons = icons;
    this.tip = tip;
    this.onClose = onClose;
  }

  private get hero() {
    return this.game.sim.getAs(this.ui.heroId, 'hero')!;
  }

  private cmd = (c: Parameters<Game['sim']['apply']>[0]) => this.game.sim.apply(c);

  close(): void {
    this.win?.remove();
    this.win = null;
    this.key = '';
    this.ui.window = null;
    this.tip.hide();
    this.onClose();
  }

  /** Re-renders the open window when the relevant state changed. */
  update(): void {
    const w = this.ui.window;
    if (!w) {
      if (this.win) this.close();
      return;
    }
    const key = this.stateKey(w);
    if (key === this.key && this.win) return;
    this.key = key;
    this.win?.remove();
    this.win = this.render(w);
    this.root.appendChild(this.win);
  }

  private stateKey(w: NonNullable<UiWindow>): string {
    const s = this.game.sim.state;
    const h = this.hero;
    return JSON.stringify([
      w,
      s.gold,
      h.bag,
      h.gear.length,
      h.tools,
      h.torchOwned,
      h.torchLit,
      s.dev,
      s.wavesOff,
      h.weaponTier,
      h.cls,
      s.storage,
      s.storageGear.length,
      s.library,
      h.known,
      h.task.k,
      s.stock,
      s.phase,
      s.road,
      w.kind === 'road' ? Math.round(h.x) * 1000 + Math.round(h.z) : 0,
    ]);
  }

  private frame(title: string, sub: string): { win: HTMLElement; body: HTMLElement } {
    const win = el('div', 'window panel pe');
    const head = el('div', 'w-head');
    const t = el('div');
    t.append(el('div', 'w-title gold-text', esc(title)), el('div', 'w-sub', esc(sub)));
    const x = el('div', 'close', '✕');
    x.onclick = () => this.close();
    head.append(t, x);
    const body = el('div', 'w-body');
    win.append(head, body);
    win.addEventListener('pointerdown', (e) => e.stopPropagation());
    return { win, body };
  }

  private card(
    img: string,
    name: string,
    meta: string,
    price: string,
    onClick: (() => void) | null,
    tip?: () => string,
    extra = '',
  ): HTMLElement {
    const c = el(
      'div',
      `card${onClick ? '' : ' disabled'}`,
      `<img src="${img}"><div><div class="c-name"${extra}>${name}</div><div class="c-meta">${meta}</div></div><div class="price">${price}</div>`,
    );
    if (onClick) c.onclick = onClick;
    if (tip) this.tip.tip(c, tip);
    return c;
  }

  private render(w: NonNullable<UiWindow>): HTMLElement {
    switch (w.kind) {
      case 'shop':
        return this.shop(w.store);
      case 'storage':
        return this.storage();
      case 'book':
        return this.book();
      case 'road':
        return this.road();
      case 'buy':
        return this.buyPlans();
      case 'menu':
        return this.menu();
      case 'class':
        return this.classes();
    }
  }

  /** Pick a class: Tank, Support or Magic (C; not with the dead close by). */
  private classes(): HTMLElement {
    const h = this.hero;
    const { win, body } = this.frame(
      'Choose your class',
      'Tank, Support or Magic — the roles you know. You can change later with C, when no dead are close.',
    );
    const row = el('div', 'class-cards');
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      const card = el('div', `class-card pe${(h.cls ?? 'tank') === id ? ' picked' : ''}`);
      card.dataset['cls'] = id;
      card.innerHTML = `<img src="${this.icons.hero(id)}"><div class="cc-role">${c.role}</div><div class="cc-name gold-text">${c.name}</div>
        <div class="cc-blurb">${esc(c.blurb)}</div>
        <div class="cc-stats">${c.hp} health · ${Math.round(c.armor * 100)}% armour · ${c.ranged ? 'ranged bolts' : 'melee'}</div>
        <div class="cc-skills">${c.abilities.map((a, i) => `<div class="cc-skill">${ABILITY_SVG[a]}<span><b>${i + 1} · ${ABILITIES[a].name}</b> ${esc(ABILITIES[a].blurb)}</span></div>`).join('')}</div>`;
      card.onclick = () => {
        this.cmd({ t: 'chooseClass', hero: h.id, cls: id });
        this.close();
      };
      row.append(card);
    }
    body.append(row);
    return win;
  }

  private shop(id: keyof typeof STORES): HTMLElement {
    const s = this.game.sim.state;
    const st = shopCatalogue(id, s.road);
    const h = this.hero;
    const { win, body } = this.frame(st.name, `${st.keeper} — ${st.blurb}`);
    if (id === 'market') {
      const age = AGES.find((a) => a.id === st.age)!;
      body.append(
        el(
          'div',
          'w-sub',
          `${age.name} stock — durable utilities only. Gather materials in the world. Research comes later.`,
        ),
      );
      if (st.next) {
        const names = [
          ...st.next.goods.map((item) => ITEMS[item].name),
          ...st.next.scrolls.map((plan) => PLANS[plan].name),
        ];
        body.append(
          el('div', 'w-sub', `Next: ${st.next.name} — ${names.join(', ')}. Reach that era to unlock.`),
        );
      }
    }
    if (st.crafterKit) {
      const torchCards = el('div', 'cards');
      torchCards.append(
        this.card(
          toolIcon('torch'),
          TORCH.name,
          TORCH.use,
          h.torchOwned ? '✓ Owned' : `${TORCH.price}g`,
          !h.torchOwned && this.game.sim.canPay(TORCH.price)
            ? () => this.cmd({ t: 'buyTorch', hero: h.id, store: id })
            : null,
          () =>
            `<div class="tt-title">${TORCH.name}</div><div class="tt-line">${TORCH.use}</div><div class="tt-sub">Warm light on nearby rock. No bag space.</div>`,
        ),
      );
      body.append(el('h3', '', 'Mine light'), torchCards);
      body.append(el('h3', '', 'Crafter Kit'));
      const cards = el('div', 'cards');
      const owned = CRAFTER_KIT.tools.every((tool) => h.tools.includes(tool));
      const price = crafterKitPrice(h.tools);
      const credit = !owned && h.tools.length ? ' You only pay for tools you are missing.' : '';
      cards.append(
        this.card(
          toolIcon('hammer'),
          CRAFTER_KIT.name,
          owned ? 'You own the complete kit' : CRAFTER_KIT.contents + credit,
          owned ? '✓ Owned' : `${price}g`,
          !owned && this.game.sim.canPay(price)
            ? () => this.cmd({ t: 'buyCrafterKit', hero: h.id, store: id })
            : null,
          () =>
            `<div class="tt-title">${CRAFTER_KIT.name}</div><div class="tt-line">${CRAFTER_KIT.contents}</div><div class="tt-line">One purchase equips every tool, the scanner and the reusable seed pouch. Tools do not take bag space.${credit}</div>`,
        ),
      );
      body.append(cards);
    }
    if (st.goods.length) {
      body.append(el('h3', '', 'Goods'));
      const cards = el('div', 'cards');
      for (const item of st.goods) {
        const price = storePrice(id, item);
        cards.append(
          this.card(
            this.icons.item(item),
            ITEMS[item].name,
            `${ITEMS[item].source}${st.discount?.[item] ? ' · specialist price' : ''}`,
            `${price}g`,
            this.game.sim.canPay(price)
              ? () => this.cmd({ t: 'buy', hero: h.id, store: id, item, count: 1 })
              : null,
            () =>
              `<div class="tt-title">${ITEMS[item].name}</div><div class="tt-line">Click: buy 1 for ${price} gold.</div>`,
          ),
        );
      }
      body.append(cards);
    }
    if (st.enchanted) {
      body.append(el('h3', '', 'Enchanted parts'));
      const cards = el('div', 'cards');
      for (const g of s.stock[id] ?? []) {
        const price = enchantedPrice(g.base, g.rarity, g.ilvl);
        cards.append(
          this.card(
            this.icons.item(g.base),
            g.name,
            `${RARITY[g.rarity].name} ${ITEMS[g.base].name}`,
            `${price}g`,
            this.game.sim.canPay(price)
              ? () => this.cmd({ t: 'buyGear', hero: h.id, store: id, uid: g.uid })
              : null,
            () => gearTooltip(g),
            ` style="color:${RARITY[g.rarity].color}"`,
          ),
        );
      }
      if (!(s.stock[id] ?? []).length)
        body.append(el('div', 'w-sub', 'Sold out — new stock arrives with the next wave.'));
      body.append(cards);
    }
    if (st.crates) {
      body.append(el('h3', '', 'Mystery crates'));
      body.append(
        this.card(
          this.icons.item('scrap'),
          'Mystery Crate',
          'A random enchanted part. Could be junk. Could be legendary.',
          `${CRATE_PRICE}g`,
          this.game.sim.canPay(CRATE_PRICE) ? () => this.cmd({ t: 'buyCrate', hero: h.id, store: id }) : null,
        ),
      );
    }
    if (st.scrolls.length) {
      body.append(el('h3', '', 'Plan scrolls'));
      const cards = el('div', 'cards');
      for (const pid of st.scrolls) {
        const p = PLANS[pid];
        const owned = s.library.includes(pid) || h.known.includes(pid);
        const price = scrollPrice(h, pid);
        cards.append(
          this.card(
            this.icons.plan(pid),
            p.name,
            owned
              ? 'In your library'
              : p.type === 'gem'
                ? `${GEM_COLORS[p.color].name} gem`
                : DISCIPLINES[p.discipline].name,
            owned ? '✓' : `${price}g`,
            !owned && this.game.sim.canPay(price)
              ? () => this.cmd({ t: 'buy', hero: h.id, store: id, scroll: pid })
              : null,
            () => planTooltip(pid, h.known.includes(pid)),
          ),
        );
      }
      body.append(cards);
    }
    // Selling from the bag.
    const sellable =
      id === 'market' ? [] : ITEM_ORDER.filter((i) => (h.bag[i] ?? 0) > 0 && st.goods.includes(i));
    if (sellable.length || (id !== 'market' && h.gear.length)) {
      body.append(el('h3', '', 'Sell from your bag'));
      const cards = el('div', 'cards');
      for (const item of sellable) {
        const gain = Math.floor(storePrice(id, item) / 2);
        cards.append(
          this.card(
            this.icons.item(item),
            `${ITEMS[item].name} ×${h.bag[item]}`,
            'Click: sell one',
            `+${gain}g`,
            () => this.cmd({ t: 'sell', hero: h.id, store: id, item, count: 1 }),
          ),
        );
      }
      for (const g of h.gear) {
        const gain = Math.floor(enchantedPrice(g.base, g.rarity, g.ilvl) / 3);
        cards.append(
          this.card(
            this.icons.item(g.base),
            g.name,
            'Click: sell',
            `+${gain}g`,
            () => this.cmd({ t: 'sellGear', hero: h.id, store: id, uid: g.uid }),
            () => gearTooltip(g),
            ` style="color:${RARITY[g.rarity].color}"`,
          ),
        );
      }
      body.append(cards);
    }
    return win;
  }

  private storage(): HTMLElement {
    const s = this.game.sim.state;
    const h = this.hero;
    const { win, body } = this.frame(
      'Keep Storehouse',
      'Everything you carry is stored on arrival. Take what you need.',
    );
    const cards = el('div', 'cards');
    for (const item of ITEM_ORDER) {
      const n = s.storage[item] ?? 0;
      if (!n) continue;
      const c = this.card(
        this.icons.item(item),
        `${ITEMS[item].name} ×${n}`,
        'Click: take 1 · Shift: take all',
        '',
        () => {},
      );
      c.onclick = (e) => this.cmd({ t: 'withdraw', hero: h.id, item, count: e.shiftKey ? n : 1 });
      cards.append(c);
    }
    for (const g of s.storageGear) {
      cards.append(
        this.card(
          this.icons.item(g.base),
          g.name,
          'Click: take',
          '',
          () => this.cmd({ t: 'withdrawGear', hero: h.id, uid: g.uid }),
          () => gearTooltip(g),
          ` style="color:${RARITY[g.rarity].color}"`,
        ),
      );
    }
    if (!cards.children.length)
      body.append(el('div', 'w-sub', 'Empty. Gather, craft or loot — then store it here.'));
    body.append(cards);
    if (h.gear.length) {
      body.append(el('h3', '', 'Store enchanted parts'));
      const g2 = el('div', 'cards');
      for (const g of h.gear)
        g2.append(
          this.card(
            this.icons.item(g.base),
            g.name,
            'Click: store',
            '',
            () => this.cmd({ t: 'depositGear', hero: h.id, uid: g.uid }),
            () => gearTooltip(g),
            ` style="color:${RARITY[g.rarity].color}"`,
          ),
        );
      body.append(g2);
    }
    return win;
  }

  /** Set by the HUD: start placing a plan whose parts are paid for on placement. */
  startBuy: (plan: BasePlanId) => void = () => {};

  /** Buy-plan mode: every known building plan, priced as a full set of parts; affordable ones lit. */
  private buyPlans(): HTMLElement {
    const s = this.game.sim.state;
    const h = this.hero;
    const { win, body } = this.frame(
      'Buy a plan outright',
      'Pay for every part up front: porters bring them to the plan as you lay it down. You still assemble it.',
    );
    const known = (s.dev ? BUILD_ORDER : h.known.filter((p) => PLANS[p].type === 'building')) as BasePlanId[];
    const cards = el('div', 'cards');
    for (const pid of [...known].sort((a, b) => planCost(a) - planCost(b))) {
      const cost = planCost(pid);
      const ok = this.game.sim.canPay(cost);
      cards.append(
        this.card(
          this.icons.plan(pid),
          PLANS[pid].name,
          ok ? 'Ready to place' : `${cost - s.gold}g short`,
          `${cost}g`,
          ok
            ? () => {
                this.close();
                this.startBuy(pid);
              }
            : null,
          () =>
            planTooltip(pid, true) +
            `<div class="tt-line tt-sub">${ok ? 'Click, then click the ground near you.' : 'Gather or craft the parts instead — or come back richer.'}</div>`,
        ),
      );
    }
    body.append(cards);
    if (!known.length)
      body.append(el('div', 'w-sub', 'You know no building plans yet — study scrolls in the Plan Book (P).'));
    return win;
  }

  private book(): HTMLElement {
    const s = this.game.sim.state;
    const h = this.hero;
    const { win, body } = this.frame(
      'Plan Book',
      'Every building starts as a plan. Learn plans to place them — learning takes time.',
    );
    const m = el('div', 'mastery');
    for (const d of Object.keys(DISCIPLINES) as Discipline[]) {
      m.append(
        el('div', '', `<b style="color:${DISCIPLINES[d].color}">${h.mastery[d]}</b>${DISCIPLINES[d].name}`),
      );
    }
    body.append(el('h3', '', 'Mastery (faster work, cheaper learning in that craft)'), m);
    // Your weapon, and what the next tier at the Blacksmith's anvil takes.
    body.append(
      el('h3', '', "Your weapon — reforged at the Blacksmith's anvil"),
      weaponCard(this.icons, h, null),
    );
    const unlearned = s.library.filter((p) => !h.known.includes(p));
    body.append(el('h3', '', 'Library — scrolls to study'));
    const lib = el('div', 'cards');
    for (const pid of unlearned) {
      const p = PLANS[pid];
      const t = Math.ceil(studyTime(h, pid));
      const studying = h.task.k === 'study' && h.task.plan === pid;
      lib.append(
        this.card(
          this.icons.plan(pid),
          p.name,
          studying ? 'Studying…' : `${DISCIPLINES[p.discipline].name} · ${t}s to learn`,
          studying ? '…' : 'Study',
          studying
            ? null
            : () => {
                this.cmd({ t: 'study', hero: h.id, plan: pid });
                this.close();
              },
          () => planTooltip(pid, false),
        ),
      );
    }
    if (!unlearned.length)
      body.append(el('div', 'w-sub', 'No unread scrolls. Clear waves, open chests or buy scrolls in shops.'));
    body.append(lib);
    // Dev mode: every plan, to place at once.
    body.append(el('h3', '', s.dev ? 'Every plan (dev mode)' : 'Known plans'));
    const known = el('div', 'cards');
    for (const pid of s.dev ? (Object.keys(PLANS) as PlanId[]) : h.known) {
      const p = PLANS[pid];
      known.append(
        this.card(
          this.icons.plan(pid),
          p.name,
          p.type === 'gem' ? `${GEM_COLORS[p.color].name} gem` : 'Building',
          '',
          () => {
            this.close();
            this.game.input?.startPlacing(pid);
          },
          () => planTooltip(pid, true),
        ),
      );
    }
    body.append(known);
    const rumours = (Object.keys(SOURCES) as PlanId[]).filter(
      (p) => !s.library.includes(p) && !h.known.includes(p),
    );
    if (rumours.length) {
      body.append(el('h3', '', 'Rumours'));
      body.append(
        el('div', 'w-sub', rumours.map((p) => `<div>• ${PLANS[p].name} — ${SOURCES[p]}</div>`).join('')),
      );
    }
    return win;
  }

  /** Set by the HUD: try a milestone (run its minigame at the workshop). */
  onInvent: (id: MilestoneId) => void = () => {};

  /**
   * The Road of Invention: every age and its milestones — invented (and how well), open (and where
   * to invent them), or waiting on what comes first — and the Field Notes of what has been learned.
   */
  private road(): HTMLElement {
    const age = AGES.find((a) => a.id === valeAge(roadOf(this.game.sim)))!;
    const { win, body } = this.frame(
      'The Road of Invention',
      `The vale's age: ${age.name}. Each step is invented by hand at its workshop — one idea at a time.`,
    );
    win.classList.add('road-window');
    const load = () => {
      body.replaceChildren(el('div', 'w-sub', 'Opening the Field Notes…'));
      void import('./road-window.ts')
        .then(({ renderRoad }) => {
          if (!body.isConnected) return;
          body.replaceChildren();
          renderRoad(body, {
            game: this.game,
            hero: this.hero,
            tip: this.tip,
            close: () => this.close(),
            onInvent: (id) => this.onInvent(id),
            cmd: this.cmd,
          });
        })
        .catch(() => {
          if (!body.isConnected) return;
          const retry = el('button', 'btn', 'Reload game');
          retry.onclick = () => location.reload();
          body.replaceChildren(el('div', 'w-sub', 'The Field Notes could not load.'), retry);
        });
    };
    load();
    return win;
  }

  private menu(): HTMLElement {
    const { win, body } = this.frame('Menu', `Wave ${this.game.sim.state.wave}/${WAVES.length}`);
    const row = el('div', 'row');
    const resume = el('button', 'btn pe', 'Resume');
    resume.onclick = () => this.close();
    const restart = el('button', 'btn pe', 'New game');
    restart.onclick = () => {
      if (!confirm('Start a new game? This one is lost.')) return;
      forgetGame(true);
      location.reload();
    };
    row.append(resume, restart);
    body.append(row);
    // Dev mode: build and try anything without gathering for it.
    const dev = el(
      'label',
      'w-sub dev-toggle',
      `<input type="checkbox" ${this.game.sim.state.dev ? 'checked' : ''}> <b>Dev mode</b> — any plan builds as soon as you place it, gems go straight in; no parts or tools; unlimited gold, health and keep lives (key \`)`,
    );
    (dev.querySelector('input') as HTMLInputElement).onchange = (e) => {
      this.cmd({ t: 'devMode', on: (e.target as HTMLInputElement).checked });
      this.key = '';
    };
    body.append(dev);
    if (this.game.sim.state.dev) {
      const waves = el(
        'label',
        'w-sub dev-toggle',
        `<input type="checkbox" ${this.game.sim.state.wavesOff ? '' : 'checked'}> <b>Waves enabled</b> — turn off to freeze wave timers and reinforcements. Existing enemies remain.`,
      );
      (waves.querySelector('input') as HTMLInputElement).onchange = (e) => {
        this.cmd({ t: 'devWaves', on: (e.target as HTMLInputElement).checked });
      };
      body.append(waves);
    }
    const walk = el(
      'label',
      'w-sub',
      `<input type="checkbox" ${this.game.input?.rightHoldWalks ? 'checked' : ''}> Holding the right button / two fingers walks forward (trackpad)`,
    );
    (walk.querySelector('input') as HTMLInputElement).onchange = (e) => {
      if (this.game.input) this.game.input.rightHoldWalks = (e.target as HTMLInputElement).checked;
    };
    body.append(walk);
    body.append(
      el(
        'div',
        'w-sub',
        'Controls: WASD move (A/D strafe) · Q/E turn · Space jump · left-drag look around · right-drag steer · both buttons (or two fingers held) walk · wheel / pinch zoom · F interact / lift · X dig ahead (Shift: larger bite) · L mine torch · V scanner · right-click attack / talk / aim at rock · Tab target · 1–4 skills · 5–9, 0, -, = plans · C class · P plan book · G buy a plan · B bags · M map · N call wave · Alt loot names · Esc close / stop fighting / clear target / menu',
      ),
    );
    // Credits: who made the models, icons, fonts and sounds (it stays open while the menu redraws).
    const credits = el('details', 'credits', creditsHtml());
    credits.open = this.creditsOpen;
    credits.addEventListener('toggle', () => (this.creditsOpen = credits.open));
    body.append(credits);
    return win;
  }

  private creditsOpen = false;
}
