import { PLAN_KEYS } from '../../view/input.ts';
import {
  TOOLS,
  TOOL_ORDER,
  BAG_STACK,
  DISCIPLINES,
  HERO,
  ITEMS,
  ITEM_ORDER,
  PLANS,
} from '../../game/content.ts';
import { toolIcon, el, setHtml } from '../dom.ts';
import { gearTooltip, planTooltip } from '../windows.ts';
import type { HudPanelContext } from './context.ts';
import type { HudLayout } from './layout.ts';

type InventoryElements = Pick<HudLayout, 'planBar' | 'bagHead' | 'toolRow' | 'bag'>;

export class HudInventory {
  private readonly context: HudPanelContext;
  private readonly elements: InventoryElements;
  private planKey = '';
  private bagKey = '';

  constructor(context: HudPanelContext, elements: InventoryElements) {
    this.context = context;
    this.elements = elements;
  }

  updatePlanBar(): void {
    const c = this.context;
    const known = c.input.knownPlans();
    const key = known.join(',') + '|' + c.ui.placing + '|' + !!c.game.sim.state.dev;
    if (key === this.planKey) return;
    this.planKey = key;
    this.elements.planBar.innerHTML = '';
    known.slice(0, PLAN_KEYS.length).forEach((pid, i) => {
      const p = PLANS[pid];
      const s = el(
        'div',
        `slot${c.ui.placing === pid ? ' active' : ''}`,
        `<img src="${c.icons.plan(pid)}"><div class="key">${PLAN_KEYS[i]}</div><div class="disc" style="--d:${DISCIPLINES[p.discipline].color}"></div>`,
      );
      s.dataset['pulse'] = `plan:${pid}`;
      s.onclick = () => c.input.startPlacing(pid);
      c.tip.tip(
        s,
        () =>
          planTooltip(pid, true) +
          `<div class="tt-line tt-sub">Click or press ${PLAN_KEYS[i]}, then click the ground near you to lay the plan down. Placing is free — realising it takes parts and work.</div>`,
      );
      this.elements.planBar.append(s);
    });
  }

  updateBag(): void {
    const c = this.context;
    const h = c.hero();
    const key = JSON.stringify(h.bag) + h.gear.map((g) => g.uid).join(',') + '|' + h.tools.join(',');
    if (key === this.bagKey) return;
    this.bagKey = key;
    setHtml(
      this.elements.bagHead,
      `<span class="smallcaps gold-text">Bag</span><span class="w-sub">${c.game.sim.bagSlots(h)}/${HERO.bag} slots</span>`,
    );
    // Tools: owned ones bright; the rest say where to get them.
    this.elements.toolRow.innerHTML = '';
    for (const tool of TOOL_ORDER) {
      const owned = h.tools.includes(tool);
      const t = el('div', `slot tool${owned ? '' : ' missing'}`, `<img src="${toolIcon(tool)}">`);
      c.tip.tip(
        t,
        () =>
          `<div class="tt-title">${TOOLS[tool].name}${owned ? '' : ' — not owned'}</div><div class="tt-line">${TOOLS[tool].use}</div>${owned ? '' : '<div class="tt-line tt-sub">Buy the complete Crafter Kit at the shop counter.</div>'}`,
      );
      this.elements.toolRow.append(t);
    }
    this.elements.bag.innerHTML = '';
    let slots = 0;
    for (const item of ITEM_ORDER) {
      const n = h.bag[item] ?? 0;
      // One slot per stack of up to BAG_STACK.
      for (let left = n; left > 0; left -= BAG_STACK) {
        const s = el(
          'div',
          'slot',
          `<img src="${c.icons.item(item)}"><div class="cnt">${Math.min(BAG_STACK, left)}</div>`,
        );
        c.tip.tip(
          s,
          () =>
            `<div class="tt-title">${ITEMS[item].name} ×${h.bag[item] ?? 0}</div><div class="tt-sub">${ITEMS[item].source}</div><div class="tt-line">${item === 'dynamite' ? 'Right-click to light one at your feet — 3 seconds, then it blows. Run!' : `Walk to a plan (a tower's: from the wall-walk), a workshop or the storehouse by the market and press F to hand it over. Stacks up to ${BAG_STACK}. Shift-click: drop one.`}</div>`,
        );
        s.onclick = (e) => {
          if (e.shiftKey) c.game.sim.apply({ t: 'dropItem', hero: h.id, item, count: 1 });
        };
        // Right-click uses an item (the usual bag convention): dynamite gets lit.
        s.oncontextmenu = (e) => {
          e.preventDefault();
          if (item === 'dynamite') c.game.sim.apply({ t: 'blast', hero: h.id });
        };
        this.elements.bag.append(s);
        slots++;
      }
    }
    for (const g of h.gear) {
      const s = el('div', `slot r${g.rarity}`, `<img src="${c.icons.item(g.base)}">`);
      c.tip.tip(
        s,
        () =>
          gearTooltip(g) +
          '<div class="tt-line tt-sub">Click with a plan selected nearby to set it in. Shift-click: drop.</div>',
      );
      s.onclick = (e) => {
        if (e.shiftKey) {
          c.game.sim.apply({ t: 'dropGear', hero: h.id, uid: g.uid });
          return;
        }
        const sel = c.ui.selected;
        if (sel?.kind === 'site') c.game.sim.apply({ t: 'socket', hero: h.id, site: sel.id, uid: g.uid });
        else c.ui.hint('Select a placed plan (blueprint) first');
      };
      this.elements.bag.append(s);
      slots++;
    }
    for (; slots < HERO.bag; slots++) this.elements.bag.append(el('div', 'slot empty'));
  }
}
