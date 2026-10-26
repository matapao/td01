import type { ItemId } from '../../game/item-data.ts';
import type { StationKind } from '../../game/content-types.ts';
import { sightRange } from '../../game/systems/power.ts';
import { crewOf } from '../../game/systems/combat.ts';
import { buildingStatus } from '../building-status.ts';
import { enemyTip } from '../enemy-cards.ts';
import {
  AFFIXES_WAVE,
  ARMOR_INFO,
  ENEMIES,
  ITEMS,
  NODES,
  PLANS,
  SOCKETS,
  STATIONS,
  STORES,
  buildingTitle,
  isTower,
} from '../../game/content.ts';
import { RARITY, affixText } from '../../game/loot.ts';
import { CRYPTS } from '../../game/map.ts';
import { waveIntel } from '../../game/waves.ts';
import { buyoutCost, siteComplete, siteMissing, siteSteps, stationSteps } from '../../game/systems/craft.ts';
import { insideOf } from '../../game/systems/rooms.ts';
import { el, esc, pct, setHtml } from '../dom.ts';
import { AFFIX_GLYPH, ARMOR_GLYPH, glyph } from '../glyphs.ts';
import { enemyMarks, marksHtml } from '../status.ts';
import type { Guide } from '../guide.ts';
import { reforgePanel } from '../forge.ts';
import type { HudPanelContext } from './context.ts';
import type { HudLayout } from './layout.ts';
import type { HudSpace } from './space.ts';
import { renderTowerTop, renderGemSockets, renderTowerDevices } from './tower-attachments.ts';

type SelectionElements = Pick<HudLayout, 'target' | 'bossFrame' | 'intelBox' | 'objBox' | 'details'>;

export class HudSelection {
  private readonly context: HudPanelContext;
  private readonly elements: SelectionElements;
  private readonly guide: Guide;
  private readonly space: HudSpace;
  private detailsKey = '';

  constructor(context: HudPanelContext, elements: SelectionElements, guide: Guide, space: HudSpace) {
    this.context = context;
    this.elements = elements;
    this.guide = guide;
    this.space = space;
  }

  invalidate(): void {
    this.detailsKey = '';
  }

  updateTarget(): void {
    const c = this.context;
    const sel = c.ui.selected;
    const t = this.elements.target;
    if (!sel || sel.kind === 'hero') {
      t.classList.add('hidden');
      return;
    }
    const ent = c.game.sim.get(sel.id);
    if (!ent) {
      t.classList.add('hidden');
      return;
    }
    t.classList.remove('hidden');
    let img = '';
    let name = '';
    let frac = 1;
    let sub = '';
    // An enemy's line shows its armour's glyph; its statuses ride on the name line.
    let subHtml = '';
    let marks = '';
    let cls = 'hp';
    switch (ent.type) {
      case 'enemy': {
        const d = ENEMIES[ent.e.kind];
        img = c.icons.enemy(ent.e.kind);
        // The dead on the roads wear a skull, as foes far above you do: one blow of theirs kills a hero.
        name = ent.e.camp ? d.name : `☠ ${d.name}`;
        frac = ent.e.hp / ent.e.maxHp;
        subHtml = `${ent.e.camp ? '' : 'Beyond any hero · '}${glyph(ARMOR_GLYPH[d.armorClass])} ${ARMOR_INFO[d.armorClass].name}`;
        marks = marksHtml(enemyMarks(ent.e));
        cls = d.boss ? 'boss' : 'enemy';
        break;
      }
      case 'building': {
        img = c.icons.building(ent.e.kind);
        name = buildingTitle(ent.e);
        frac = ent.e.hp / ent.e.maxHp;
        sub = ent.e.gems.length
          ? ent.e.gems.map((a) => PLANS[a].name).join(' · ')
          : isTower(ent.e.kind)
            ? `${SOCKETS} empty sockets`
            : '';
        break;
      }
      case 'site': {
        img = c.icons.plan(ent.e.plan);
        name = `Plan: ${PLANS[ent.e.plan].name}`;
        frac = siteComplete(ent.e)
          ? (ent.e.step + ent.e.work / (siteSteps(ent.e)[ent.e.step]?.work ?? 1)) / siteSteps(ent.e).length
          : 0;
        sub = siteComplete(ent.e) ? 'Ready to assemble' : 'Waiting for parts';
        cls = 'build';
        break;
      }
      case 'node': {
        img = c.icons.item(NODES[ent.e.kind].item);
        name =
          ent.e.kind === 'tree'
            ? 'Tree'
            : ent.e.kind === 'rock'
              ? 'Rock'
              : ent.e.kind === 'ore'
                ? 'Ore vein'
                : 'Crystal cluster';
        frac = ent.e.amount / ent.e.max;
        sub = `${ent.e.amount} ${ITEMS[NODES[ent.e.kind].item].name} left · right-click to ${NODES[ent.e.kind].verb.toLowerCase()}`;
        cls = 'work';
        break;
      }
      case 'chest':
        img = c.icons.item('gold');
        name = ent.e.name;
        sub = ent.e.opened ? 'Opened' : 'Right-click to open';
        break;
      case 'drop':
        img = c.icons.item(ent.e.item);
        name = ent.e.inst
          ? ent.e.inst.name
          : ent.e.item === 'gold'
            ? `${ent.e.amount} gold`
            : ITEMS[ent.e.item].name;
        sub = 'Right-click to pick up';
        break;
      case 'poi':
        img = c.icons.item(ent.e.kind === 'keep' ? 'blocks' : 'gold');
        name = ent.e.kind === 'keep' ? 'The Keep' : STORES[ent.e.store!].name;
        sub =
          ent.e.kind === 'keep' ? 'Storehouse · right-click to store your bag' : STORES[ent.e.store!].blurb;
        break;
      case 'unit':
        img = c.icons.unit(ent.e.kind);
        name = ent.e.kind === 'captain' ? 'Knight Captain' : 'Footman';
        frac = ent.e.hp / ent.e.maxHp;
        break;
    }
    setHtml(
      t,
      `<div class="portrait"><img src="${img}"></div><div class="info"><div class="name"><span class="nm">${esc(name)}</span>${marks}</div><div class="bar"><div class="fill ${cls}" style="width:${pct(frac)}"></div></div><div class="sub">${subHtml || esc(sub)}</div></div>`,
    );
  }

  updateBoss(): void {
    const c = this.context;
    const boss = c.game.sim.state.enemies.find((e) => ENEMIES[e.kind].boss && e.spawnT <= 0);
    this.elements.bossFrame.classList.toggle('hidden', !boss);
    if (!boss) return;
    setHtml(
      this.elements.bossFrame,
      `<div class="smallcaps gold-text" style="font-size:16px">${ENEMIES[boss.kind].name}${boss.enraged ? ' — ENRAGED' : ''}</div><div class="bar"><div class="fill boss" style="width:${pct(boss.hp / boss.maxHp)}"></div><span>${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}</span></div>`,
    );
  }

  updateTracker(): void {
    const c = this.context;
    const s = c.game.sim.state;
    const intel = waveIntel(s.wave, s.intel);
    let html = '';
    if (intel) {
      const where = intel.crypts
        ? intel.crypts.map((c) => CRYPTS[c]).join(' + ')
        : '<span style="opacity:.7">route unknown — set a Seer\'s Emerald in a tower</span>';
      html += `<h4><span>Next: wave ${intel.index + 1}</span><span style="color:#ccc">${esc(intel.title)}</span></h4>`;
      html += `<div class="intel-kinds">${intel.kinds
        .map((k) => {
          const d = ENEMIES[k.kind];
          return `<span class="intel-kind" data-kind="${k.kind}"><img src="${c.icons.enemy(k.kind)}">${d.name}${k.count ? ` ×${k.count}` : ''}</span>`;
        })
        .join('')}</div>`;
      if (intel.affixes.length)
        html += `<div style="margin-top:4px">${intel.affixes.map((a) => `<span class="tag affix" style="--c:${AFFIXES_WAVE[a].color}" title="${esc(AFFIXES_WAVE[a].blurb)}">${glyph(AFFIX_GLYPH[a])}${AFFIXES_WAVE[a].name}</span>`).join('')}</div>`;
      html += `<div class="w-sub" style="margin-top:3px;font-size:11px">From: ${where}${intel.duration ? ` · over ~${intel.duration}s` : ''}</div>`;
    }
    setHtml(this.elements.intelBox, html);
    // Hover details for enemies in the intel strip.
    for (const k of this.elements.intelBox.querySelectorAll<HTMLElement>('.intel-kind')) {
      if (k.dataset['tipped']) continue;
      k.dataset['tipped'] = '1';
      c.tip.tip(k, () => enemyTip(k.dataset['kind'] as keyof typeof ENEMIES, true));
    }
    const objs = this.guide.current();
    setHtml(
      this.elements.objBox,
      objs.length
        ? `<h4><span>Objective</span></h4>${objs.map((o) => `<div class="objective"><div class="o-title">◆ ${esc(o.obj.title)}</div><div class="o-sub">${esc(o.obj.sub)}</div></div>`).join('')}`
        : '',
    );
  }

  /** Rebuild selected enemy, blueprint or building controls when their relevant state changes. */

  updateDetails(): void {
    const c = this.context;
    const sel = c.ui.selected;
    const g = c.game;
    const ent = sel ? g.sim.get(sel.id) : undefined;
    const d = this.elements.details;
    if (!ent || (ent.type !== 'building' && ent.type !== 'site' && ent.type !== 'enemy')) {
      d.classList.add('hidden');
      return;
    }
    // Rebuild only when something relevant changed.
    const h = c.hero();
    const crewed = ent.type === 'building' ? (crewOf(g.sim, ent.e)?.id ?? 0) : 0;
    // A gem being set into a tower: its parts and steps (and gold, for porters) show in the panel.
    const ms = ent.type === 'building' && ent.e.site ? g.sim.getAs(ent.e.site, 'site') : undefined;
    const msKey = ms ? [ms.have, ms.sockets.length, ms.step, g.sim.state.gold] : 0;
    const key = JSON.stringify([
      sel,
      !!g.sim.state.dev,
      ent.type === 'building'
        ? [
            ent.e.gems,
            ent.e.gemLv,
            ent.e.devices,
            ent.e.devicesOn,
            ent.e.top,
            ent.e.harried,
            g.sim.state.grid,
            ent.e.input,
            ent.e.output,
            ent.e.busy,
            ent.e.step,
            Math.round(ent.e.hp),
            ent.e.mode,
            ent.e.site,
            msKey,
            ent.e.powered,
            ent.e.lit,
            Math.round(sightRange(g.sim, ent.e) * 2),
            crewed,
          ]
        : ent.type === 'site'
          ? [ent.e.have, ent.e.sockets.length, ent.e.step, c.game.sim.state.gold]
          : [Math.round(ent.e.hp / 5)],
      h.known.length,
      h.gear.length,
      JSON.stringify(h.bag),
    ]);
    if (key === this.detailsKey) return;
    this.detailsKey = key;
    d.classList.remove('hidden');
    d.innerHTML = '';
    if (ent.type === 'enemy') {
      const def = ENEMIES[ent.e.kind];
      d.append(
        el(
          'div',
          'd-head',
          `<img src="${c.icons.enemy(ent.e.kind)}"><div><div class="d-title gold-text">${ent.e.camp ? '' : '☠ '}${def.name}</div><div class="d-sub">${Math.ceil(ent.e.hp)} / ${Math.ceil(ent.e.maxHp)} hp${ent.e.shield > 0 ? ` · shield ${Math.ceil(ent.e.shield)}` : ''}</div></div>`,
        ),
      );
      d.append(
        el(
          'div',
          `tt-line ${ent.e.camp ? '' : 'lane-dead'}`,
          ent.e.camp
            ? 'A camp creature: a fair fight for a hero.'
            : 'One of the dead on the road: far beyond any hero. One blow of theirs kills you, and yours barely scratch them. Leave them to the towers.',
        ),
      );
      d.append(el('div', '', enemyTip(ent.e.kind).replace('tt-title', 'tt-title" style="display:none')));
      return;
    }
    if (ent.type === 'site') {
      const site = ent.e;
      const plan = PLANS[site.plan];
      d.append(
        el(
          'div',
          'd-head',
          `<img src="${c.icons.plan(site.plan)}"><div><div class="d-title gold-text">Plan: ${plan.name}</div><div class="d-sub">${plan.blurb}</div></div>`,
        ),
      );
      d.append(el('h5', '', 'Parts'));
      const parts = el('div', 'parts');
      const missing = siteMissing(site);
      for (const k in site.need) {
        const item = k as ItemId;
        const need = site.need[item] ?? 0;
        const have = need - (missing[item] ?? 0);
        parts.append(
          el(
            'span',
            `part ${have >= need ? 'ok' : 'miss'}`,
            `<img src="${c.icons.item(item)}">${ITEMS[item].name} ${have}/${need}`,
          ),
        );
      }
      d.append(parts);
      if (site.sockets.length) {
        d.append(el('h5', '', 'Enchanted parts set in'));
        d.append(
          el(
            'div',
            '',
            site.sockets
              .map(
                (s) =>
                  `<div style="color:${RARITY[s.rarity].color}">${esc(s.name)} <span class="w-sub">${s.affixes.map(affixText).join(', ')}</span></div>`,
              )
              .join(''),
          ),
        );
      }
      d.append(el('h5', '', 'Assembly'));
      d.append(
        el(
          'div',
          'steps',
          siteSteps(site)
            .map(
              (st, i) =>
                `<div class="${i < site.step ? 'done' : i === site.step && siteComplete(site) ? 'cur' : ''}">${i < site.step ? '✓' : '•'} ${st.label}</div>`,
            )
            .join(''),
        ),
      );
      const row = el('div', 'row');
      const go = el('button', 'btn', siteComplete(site) ? 'Assemble' : 'Deliver parts');
      go.onclick = () => g.sim.apply({ t: 'interact', hero: h.id, target: site.id });
      const cancel = el('button', 'btn', 'Cancel plan');
      cancel.onclick = () => g.sim.apply({ t: 'cancelSite', site: site.id });
      row.append(go);
      const cost = buyoutCost(site);
      if (cost > 0) {
        // Buy out the missing pieces: porters bring them, for a little over market price.
        const buy = el('button', `btn${g.sim.state.gold >= cost ? ' call' : ''}`, `Buy the rest — ${cost}g`);
        if (g.sim.state.gold >= cost)
          buy.onclick = () => g.sim.apply({ t: 'buyout', hero: h.id, site: site.id });
        else buy.setAttribute('disabled', '');
        row.append(buy);
      }
      row.append(cancel);
      d.append(row);
      // Until it is built, a blueprint can be turned (R).
      if (plan.type === 'building') {
        const turn = el('div', 'row');
        for (const [label, dir] of [
          ['⟲ Turn', -1],
          ['Turn ⟳', 1],
        ] as const) {
          const b = el('button', 'btn tiny', label);
          b.title = 'Turn the plan before it is built (R, Shift+R)';
          b.onclick = () => c.input.turnPlan(dir);
          turn.append(b);
        }
        d.append(turn);
      }
      const fits = h.gear.filter((gi) => (site.need[gi.base] ?? 0) > 0);
      if (fits.length)
        d.append(
          el(
            'div',
            'w-sub',
            `You carry ${fits.length} enchanted part(s) that fit — click them in your bag to set them in.`,
          ),
        );
      return;
    }
    const b = ent.e;
    d.append(
      el(
        'div',
        'd-head',
        `<img src="${c.icons.building(b.kind)}"><div><div class="d-title gold-text">${buildingTitle(b)}</div><div class="d-sub">${Math.ceil(b.hp)} / ${b.maxHp} hp${b.hp < b.maxHp ? ' · right-click with wood/stone to repair' : ''}</div></div>`,
      ),
    );
    buildingStatus(d, g.sim, b);
    if (isTower(b.kind)) {
      renderTowerTop(c, d, b);
      renderGemSockets(c, d, b);
      renderTowerDevices(c, d, b);
    }
    if (b.kind === 'port') this.space.portPanel(d, b);
    if (b.kind in STATIONS) {
      const def = STATIONS[b.kind as StationKind];
      d.append(el('h5', '', 'Recipes'));
      d.append(
        el(
          'div',
          '',
          def.recipes
            .map(
              (r) =>
                `<div>${Object.entries(r.input)
                  .map(([k, n]) => `${n} ${ITEMS[k as ItemId].name}`)
                  .join(' + ')} → ${Object.entries(r.output)
                  .map(([k, n]) => `${n} ${ITEMS[k as ItemId].name}`)
                  .join(' + ')}</div>`,
            )
            .join(''),
        ),
      );
      const tray = (p: Partial<Record<ItemId, number>>) =>
        Object.entries(p)
          .filter(([, n]) => n)
          .map(([k, n]) => `<span class="part"><img src="${c.icons.item(k as ItemId)}">${n}</span>`)
          .join('') || '<span class="w-sub">empty</span>';
      d.append(
        el('h5', '', 'Input tray'),
        el('div', 'parts', tray(b.input)),
        el('h5', '', 'Output tray'),
        el('div', 'parts', tray(b.output)),
      );
      if (b.busy)
        d.append(
          el(
            'div',
            'w-sub',
            `Working: ${stationSteps(b)[b.step]?.label} — right-click to lend a hand (faster with perfect strikes).`,
          ),
        );
      // A building you walk into: its work is done inside, at the bench.
      const inside = b.interior !== undefined && insideOf(g.sim, h, b);
      if (b.interior !== undefined && !inside)
        d.append(el('div', 'w-sub', `Its work is done inside: walk in at the door (F) and work the bench.`));
      const go = el('button', 'btn', b.interior !== undefined && !inside ? 'Go in' : 'Load / collect / work');
      go.onclick = () => g.sim.apply({ t: 'interact', hero: h.id, target: b.id });
      d.append(go);
      // The Blacksmith's anvil: weapons are reforged here, a tier at a time.
      if (b.kind === 'anvil') reforgePanel(d, g.sim, c.icons, h, b);
    }
    if (b.kind === 'shop') return;
    const row = el('div', 'row');
    const demo = el('button', 'btn tiny', 'Demolish (salvage half)');
    demo.onclick = () => {
      if (confirm('Demolish this building? You get half the parts back.'))
        g.sim.apply({ t: 'demolish', building: b.id });
    };
    row.append(demo);
    d.append(row);
  }
}
