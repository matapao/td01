import type { ItemId } from '../../game/item-data.ts';
import type {
  GemId,
  GemLevel,
  GemPlan,
  Parts,
  DevicePlan,
  DeviceId,
  PlanId,
} from '../../game/content-types.ts';
import { LEVEL_LOOK } from '../hud-labels.ts';
import {
  ITEMS,
  PLANS,
  GEM_LEVELS,
  MAX_GEM_LEVEL,
  SOCKETS,
  TOWER_TOPS,
  DEVICE,
  topOf,
  nextTop,
  deviceBlocker,
  COLOR_ORDER,
  GEM_COLORS,
  gemBlocker,
  gemName,
  gemLevel,
  gemsOf,
  rawIn,
  upgradeParts,
} from '../../game/content.ts';
import type { Building } from '../../game/entity-types.ts';
import { el } from '../dom.ts';
import { planTooltip } from '../windows.ts';
import type { HudPanelContext } from './context.ts';
import { renderTowerWork } from './tower-work.ts';

/** Powered upper windows and the known devices available to fit next. */

/** Powered upper windows and the known devices available to fit next. */
export function renderTowerDevices(context: HudPanelContext, d: HTMLElement, b: Building): void {
  const c = context;
  const g = c.game;
  const h = c.hero();
  const set = b.devices ?? [];
  const work = b.site ? g.sim.getAs(b.site, 'site') : undefined;
  const pending = work && PLANS[work.plan].type === 'device' ? work : undefined;
  const known = (Object.keys(PLANS) as PlanId[]).filter(
    (p) => PLANS[p].type === 'device' && (g.sim.knows(h, p) || g.sim.state.library.includes(p)),
  );
  if (!set.length && !pending && !known.length) return;
  d.append(el('h5', '', `Devices (${set.length}/${DEVICE.slots})`));
  const grid = g.sim.state.grid;
  const watts = set.reduce((n, id) => n + (id === 'solar' ? 0 : (PLANS[id] as DevicePlan).watts), 0);
  const power = !set.length
    ? 'Devices run on power: a pole within reach, or a solar roof by day.'
    : b.devicesOn
      ? `Running — ${watts} W${grid ? ` · the grid: ${grid.demand}/${grid.supply} W asked` : ''}.`
      : !b.powered && !set.includes('solar')
        ? 'No power: run a pole within 7 m of it (or set a solar roof).'
        : grid && grid.demand > grid.supply
          ? `Browned out: the grid makes ${grid.supply} W but ${grid.demand} W are asked — more generators, or fewer devices.`
          : 'Dark: the solar roof makes too little now.';
  d.append(el('div', `w-sub${b.devicesOn || !set.length ? '' : ' warn'}`, power));
  const row = el('div', 'slot-row devices');
  for (let i = 0; i < DEVICE.slots; i++) {
    const id = set[i];
    const box = el(
      'div',
      `mslot${id ? ' full' : ''}${!id && pending && i === set.length ? ' building' : ''}`,
      id
        ? `<img src="${c.icons.device(id)}">`
        : !id && pending && i === set.length
          ? `<img src="${c.icons.device(pending.plan as DeviceId)}">`
          : '',
    );
    if (id) {
      box.dataset['device'] = id;
      const x = el('button', 'addon-x', '×');
      x.title = `Take the ${PLANS[id].name} out`;
      x.onclick = (ev) => {
        ev.stopPropagation();
        if (confirm(`Take the ${PLANS[id].name} out? Half its parts come back.`))
          g.sim.apply({ t: 'removeDevice', hero: h.id, building: b.id, device: id });
      };
      box.append(x);
      c.tip.tip(
        box,
        () =>
          planTooltip(id, true) +
          `<div class="tt-line tt-sub">Upper window · ${b.devicesOn ? 'running' : 'dark — no power'} · × takes it out</div>`,
      );
    } else
      c.tip.tip(
        box,
        () =>
          '<div class="tt-title">Upper window</div><div class="tt-line">Empty: a powered device goes here — invent them on the Road (O), learn their plans, then set them in from this panel.</div>',
      );
    row.append(box);
  }
  d.append(row);
  if (pending) renderTowerWork(c, d, pending, `Fitting: ${PLANS[pending.plan].name}`);
  const free = known.filter((p) => !set.includes(p as DeviceId) && p !== pending?.plan);
  if (!free.length || set.length >= DEVICE.slots) return;
  const pick = el('div', 'gem-line');
  for (const p of free) {
    const knows = g.sim.knows(h, p);
    const why = deviceBlocker(set, p as DeviceId);
    const ok = knows && !why && !b.site;
    const box = el(
      'div',
      `mopt${!knows ? ' unknown' : !ok ? ' blocked' : ''}`,
      `<img src="${c.icons.device(p as DeviceId)}">`,
    );
    box.dataset['device'] = p;
    if (ok)
      box.onclick = () => g.sim.apply({ t: 'placeDevice', hero: h.id, plan: p as DeviceId, building: b.id });
    c.tip.tip(
      box,
      () =>
        planTooltip(p, knows) +
        `<div class="tt-line tt-sub">${!knows ? 'Study its plan first (Plan Book, P)' : (why ?? (b.site ? 'Finish the work on this tower first' : 'Click to fit it in'))}</div>`,
    );
    pick.append(box);
  }
  d.append(pick);
}

/** The current archer platform and the next roof upgrade or its assembly work. */

/** The current archer platform and the next roof upgrade or its assembly work. */
export function renderTowerTop(context: HudPanelContext, d: HTMLElement, b: Building): void {
  const c = context;
  const g = c.game;
  const h = c.hero();
  const top = topOf(b);
  const t = TOWER_TOPS[top];
  d.append(el('h5', '', `Top: ${t.name}`));
  d.append(el('div', 'w-sub', t.blurb));
  if (b.harried)
    d.append(
      el('div', 'w-sub warn', 'A wraith is diving at the archer — he has ducked and is not shooting.'),
    );
  const work = b.site ? g.sim.getAs(b.site, 'site') : undefined;
  if (work && PLANS[work.plan].type === 'top') {
    renderTowerWork(c, d, work, `Building: ${PLANS[work.plan].name}`);
    return;
  }
  const next = nextTop(b);
  if (!next) return;
  const plan = PLANS[next];
  const knows = g.sim.knows(h, next);
  const ok = knows && !b.site;
  const up = el('button', `btn tiny${ok ? ' call' : ''}`, `▲ ${plan.name}`);
  up.dataset['top'] = next;
  if (ok) up.onclick = () => g.sim.apply({ t: 'upgradeTop', hero: h.id, building: b.id });
  else up.setAttribute('disabled', '');
  c.tip.tip(
    up,
    () =>
      planTooltip(next, knows) +
      `<div class="tt-line tt-sub">${!knows ? "Learn the plan first (the Builders' Guild has it)" : b.site ? 'Finish the work on this tower first' : 'Place it on this tower: bring its parts, then build it (F at the tower, from the wall-walk)'}</div>`,
  );
  const row = el('div', 'row');
  row.append(up);
  d.append(row);
}

/** Gem windows, cuts, removal and the known gems available for empty colours. */

/** Gem windows, cuts, removal and the known gems available for empty colours. */
export function renderGemSockets(context: HudPanelContext, d: HTMLElement, b: Building): void {
  const c = context;
  const g = c.game;
  const h = c.hero();
  const work = b.site ? g.sim.getAs(b.site, 'site') : undefined;
  // (A top being built shows with the top, above.)
  const pending = work && PLANS[work.plan].type === 'gem' ? work : undefined;
  const setting = pending ? (pending.plan as GemId) : null;
  const upgrading = !!setting && b.gems.includes(setting);
  const levelText = (lv: GemLevel) =>
    `${GEM_LEVELS[lv].name} — ${LEVEL_LOOK[lv]}, works at ${Math.round(GEM_LEVELS[lv].k * 100)}%`;
  const partsText = (p: Parts) =>
    Object.entries(p)
      .map(([k, n]) => `${n} ${ITEMS[k as ItemId].name}`)
      .join(', ');
  d.append(el('h5', '', `Gem windows (${b.gems.length}/${SOCKETS})`));
  const row = el('div', 'slot-row sockets');
  for (const color of COLOR_ORDER) {
    const colorName = ITEMS[color].name;
    const id = b.gems.find((x) => (PLANS[x] as GemPlan).color === color);
    const next = setting && (PLANS[setting] as GemPlan).color === color ? setting : null;
    const lv = id ? gemLevel(b, id) : 1;
    const showLv = (next && pending?.lv ? pending.lv : lv) as GemLevel;
    const gid = id ?? next;
    const win = el('div', 'gem-win');
    win.style.setProperty('--gem', GEM_COLORS[color].color);
    const box = el(
      'div',
      `mslot${id ? ` full q${lv}` : ' empty'}${next ? ' building' : ''}`,
      gid
        ? `<img src="${c.icons.gem(gid, showLv)}">${id ? `<i class="pips">${'•'.repeat(lv)}</i>` : ''}`
        : `<img class="raw" src="${c.icons.item(color)}">`,
    );
    box.dataset['color'] = color;
    if (id) {
      box.dataset['gem'] = id;
      if (!next) {
        const x = el('button', 'addon-x', '×');
        x.title = `Take the ${PLANS[id].name} out`;
        x.onclick = (ev) => {
          ev.stopPropagation();
          if (
            confirm(
              `Take the ${gemName(b, id)} out of this tower? All ${rawIn(lv)} ${colorName.toLowerCase()} come back, and half its other parts.`,
            )
          )
            g.sim.apply({ t: 'removeGem', hero: h.id, building: b.id, gem: id });
        };
        box.append(x);
      }
      c.tip.tip(
        box,
        () =>
          planTooltip(id, true).replace(
            `<div class="tt-title">${PLANS[id].name}</div>`,
            `<div class="tt-title">${gemName(b, id)}</div>`,
          ) +
          `<div class="tt-line tt-sub">${colorName} window · ${levelText(lv)}${lv < MAX_GEM_LEVEL ? ` · ▲ cuts it ${GEM_LEVELS[(lv + 1) as GemLevel].name.toLowerCase()}` : ''} · × takes it out</div>`,
      );
    } else if (next)
      c.tip.tip(
        box,
        () =>
          planTooltip(next, true) +
          '<div class="tt-line tt-sub">Being set — bring its parts and melt it in (F at the tower, from the wall-walk). It goes in rough.</div>',
      );
    else
      c.tip.tip(
        box,
        () =>
          `<div class="tt-title">${colorName} window</div><div class="tt-line">Empty. Shape a raw ${colorName.toLowerCase()} into one of its gems — ${gemsOf(
            color,
          )
            .map((p) => p.name)
            .join(
              ', ',
            )} — and melt it in here. It goes in rough: small and matte. Cut it finer twice — polished, then radiant — and it grows until it stands out of the window.</div>`,
      );
    win.append(box);
    // Cut it a level finer.
    if (id && lv < MAX_GEM_LEVEL && !next) {
      const to = (lv + 1) as GemLevel;
      const knows = g.sim.knows(h, id);
      const ok = knows && !b.site;
      const up = el('button', `gem-up${ok ? '' : ' off'}`, '▲');
      up.dataset['gem'] = id;
      if (ok) up.onclick = () => g.sim.apply({ t: 'upgradeGem', hero: h.id, building: b.id, gem: id });
      c.tip.tip(
        up,
        () =>
          `<div class="tt-title">Cut it ${GEM_LEVELS[to].name.toLowerCase()}</div><div class="tt-line">${levelText(to)}.</div><div class="tt-line tt-sub">Needs ${partsText(upgradeParts(id, to))}${!knows ? ' · learn its plan first' : b.site ? ' · finish the work on this tower first' : ''}</div>`,
      );
      win.append(up);
    } else win.append(el('span', 'gem-lv', id && !next ? GEM_LEVELS[lv].name : next ? '…' : ''));
    row.append(win);
  }
  d.append(row);
  // The gem being set or cut: its parts, porters for the rest, or call it off.
  if (pending && setting)
    renderTowerWork(
      c,
      d,
      pending,
      upgrading
        ? `Cutting: ${PLANS[setting].name} → ${GEM_LEVELS[(pending.lv ?? 2) as GemLevel].name}`
        : `Setting: ${PLANS[setting].name}`,
    );
  // What could go into the empty windows, colour by colour: the ones you know (and could set now) bright.
  const open = COLOR_ORDER.filter(
    (c) =>
      !b.gems.some((x) => (PLANS[x] as GemPlan).color === c) &&
      !(setting && (PLANS[setting] as GemPlan).color === c),
  );
  if (!open.length) return;
  d.append(el('h5', '', b.site ? 'Set in next (one at a time)' : 'Set a gem'));
  const pick = el('div', 'gem-opts');
  for (const color of open) {
    const line = el('div', 'gem-line');
    line.style.setProperty('--gem', GEM_COLORS[color].color);
    line.append(el('span', 'gem-color', `<img src="${c.icons.item(color)}"><b>${h.bag[color] ?? 0}</b>`));
    for (const p of gemsOf(color)) {
      const knows = g.sim.knows(h, p.id);
      const why = gemBlocker(b.gems, p.id);
      const ok = knows && !why && !b.site;
      const box = el(
        'div',
        `mopt${!knows ? ' unknown' : !ok ? ' blocked' : ''}`,
        `<img src="${c.icons.gem(p.id, 1)}">`,
      );
      box.dataset['gem'] = p.id;
      if (ok) box.onclick = () => c.input.startGem(p.id);
      c.tip.tip(
        box,
        () =>
          planTooltip(p.id, knows) +
          `<div class="tt-line tt-sub">${!knows ? 'Learn the plan first (Plan Book, P)' : (why ?? (b.site ? 'Finish the work on this tower first' : 'Click to set it in (it goes in rough)'))}</div>`,
      );
      line.append(box);
    }
    pick.append(line);
  }
  d.append(pick);
}
