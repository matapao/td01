/** Later-era Road and Field Notes UI, requested only when its window opens. */
import { basePlanFor, ITEMS, type BuildingKind, type ItemId } from '../game/content.ts';
import { AGES, BRANCHES, MILESTONES, MILESTONE_ORDER, roadBlocker, type MilestoneId } from '../game/road.ts';
import { atWorkshop, inventBlocker, roadOf } from '../game/systems/road.ts';
import type { Game } from '../view/game.ts';
import type { Hero, Command } from '../game/types.ts';
import type { Tooltip } from './tooltip.ts';
import { MINIGAME_NAMES } from './minigames/catalogue.ts';
import { AGE_GLYPH, BRANCH_GLYPH, KIND_GLYPH, glyph } from './glyphs.ts';
import { el, esc } from './dom.ts';
export interface RoadWindowContext {
  game: Game;
  hero: Hero;
  tip: Tooltip;
  close(): void;
  onInvent(id: MilestoneId): void;
  cmd(command: Command): void;
}
export function renderRoad(body: HTMLElement, ctx: RoadWindowContext): void {
  const sim = ctx.game.sim,
    h = ctx.hero,
    road = roadOf(sim);
  for (const a of AGES) {
    const ids = MILESTONE_ORDER.filter((k) => MILESTONES[k].age === a.id);
    if (!ids.length) continue;
    body.append(
      el('h3', '', `${glyph(AGE_GLYPH[a.id])}${a.name} <span class="w-sub">— ${esc(a.blurb)}</span>`),
    );
    const row = el('div', 'cards road-row');
    for (const id of ids) {
      const ms = MILESTONES[id];
      const done = road.done.includes(id);
      const closed = roadBlocker(road, id);
      const why = done ? null : inventBlocker(sim, h, id);
      const where = ms.at === 'keep' ? 'by the keep' : `at a ${basePlanFor(ms.at).name}`;
      const meta = done
        ? `Invented — ${road.best[id] === 2 ? 'perfectly' : 'well'}`
        : closed && closed !== 'Already invented'
          ? closed
          : `${MINIGAME_NAMES[ms.kind]} · ${where}`;
      // Open, but you're not at its workshop: the card takes you there.
      const far = !done && !closed && !!why && !atWorkshop(sim, h, id) && ms.at !== 'keep';
      const shop = far ? nearestOf(sim, h, ms.at as BuildingKind) : undefined;
      // Its kind of minigame (the glyph on the left), badged with its branch.
      const c = el(
        'div',
        `card road-card${done ? ' done' : why && !shop ? ' disabled' : ''}`,
        `<span class="rk-wrap">${glyph(KIND_GLYPH[ms.kind], 'rk')}<span class="rb">${glyph(BRANCH_GLYPH[ms.branch])}</span></span><div><div class="c-name">${done ? '✓ ' : ''}${esc(ms.name)}</div><div class="c-meta">${esc(meta)}</div></div><div class="price">${done ? (road.best[id] === 2 ? '★★' : '★') : shop ? 'Go there' : why ? '' : 'Invent'}</div>`,
      );
      if (!done && !why)
        c.onclick = () => {
          ctx.close();
          ctx.onInvent(id);
        };
      else if (shop)
        c.onclick = () => {
          ctx.close();
          ctx.cmd({ t: 'move', hero: h.id, x: shop.x, z: shop.z });
        };
      ctx.tip.tip(c, () => {
        const cost = Object.entries(ms.cost)
          .map(([k, n]) => `${n} ${ITEMS[k as ItemId].name}`)
          .join(', ');
        return `<div class="tt-title">${esc(ms.name)}</div><div class="tt-sub">${glyph(BRANCH_GLYPH[ms.branch])} ${BRANCHES[ms.branch]} · ${glyph(KIND_GLYPH[ms.kind])} ${MINIGAME_NAMES[ms.kind]}</div><div class="tt-line"><i>${esc(ms.principle)}</i></div>${done ? `<div class="tt-line">${esc(ms.why)}</div><div class="tt-line tt-sub">${esc(ms.real)}</div>` : `<div class="tt-line">Invented ${where}${cost ? `; the try uses ${cost}` : ''}.</div>${why ? `<div class="tt-line tt-sub">${esc(why)}</div>` : ''}`}`;
      });
      row.append(c);
    }
    body.append(row);
  }
  // The Field Notes: what each invention taught, why, and where it is used for real.
  body.append(el('h3', '', 'Field Notes'));
  if (!road.done.length)
    body.append(
      el(
        'div',
        'w-sub',
        'Nothing invented yet. Every milestone you invent writes its idea here — what, why, and where it is used for real.',
      ),
    );
  for (const id of road.done) {
    const ms = MILESTONES[id];
    body.append(
      el(
        'div',
        'field-note',
        `<div class="fn-head">${glyph(BRANCH_GLYPH[ms.branch])}<b>${esc(ms.name)}</b> <span class="w-sub">${AGES.find((a) => a.id === ms.age)!.name} · ${BRANCHES[ms.branch]}</span></div><div class="fn-principle">${esc(ms.principle)}</div><div>${esc(ms.why)}</div><div class="w-sub">For real: ${esc(ms.real)}</div><div class="w-sub fn-chronicle">${esc(ms.chronicle)}</div>`,
      ),
    );
  }
}
/** The nearest standing building of a kind to the hero (to walk to), if there is one. */
function nearestOf(
  sim: Game['sim'],
  h: { x: number; z: number },
  kind: BuildingKind,
): { x: number; z: number } | undefined {
  let best: { x: number; z: number } | undefined;
  let bd = Infinity;
  for (const b of sim.state.buildings) {
    if (b.kind !== kind || b.hp <= 0) continue;
    const d = Math.hypot(b.x - h.x, b.z - h.z);
    if (d < bd) {
      bd = d;
      best = { x: b.x, z: b.z };
    }
  }
  return best;
}
