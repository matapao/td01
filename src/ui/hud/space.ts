import type { ItemId } from '../../game/item-data.ts';
import { PHASE_NAMES } from '../hud-labels.ts';
import { PLANS } from '../../game/content.ts';
import type { Building } from '../../game/entity-types.ts';
import { el } from '../dom.ts';
import { PAYLOADS, inSpace, launchWindow, type PayloadId } from '../../game/space.ts';
import { flightTime, payloadBlocker, spaceOf } from '../../game/systems/space.ts';
import { planTooltip } from '../windows.ts';
import { fmtTime } from '../../core/math.ts';
import type { HudPanelContext } from './context.ts';
import { renderTowerWork } from './tower-work.ts';

export class HudSpace {
  private readonly context: HudPanelContext;
  private readonly spacePanel: HTMLElement;
  private spaceKey = '';

  constructor(context: HudPanelContext, panel: HTMLElement) {
    this.context = context;
    this.spacePanel = panel;
  }

  /** Launch window, payload assembly and flights under way. */

  portPanel(d: HTMLElement, b: Building): void {
    const c = this.context;
    const g = c.game;
    const h = c.hero();
    const w = launchWindow(g.sim.state.time);
    d.append(
      el(
        'div',
        `w-sub${w.open ? '' : ' warn'}`,
        w.open
          ? `The launch window is open — it closes in ${fmtTime(w.closesIn)}.`
          : `The window is shut — the planets line up again in ${fmtTime(w.opensIn)}.`,
      ),
    );
    const work = b.site ? g.sim.getAs(b.site, 'site') : undefined;
    if (b.ready) {
      const plan = PLANS[b.ready];
      d.append(el('h5', '', `On the pad: ${plan.name}`), el('div', 'w-sub', PAYLOADS[b.ready].does));
      const row = el('div', 'row');
      const go = el('button', `btn${w.open || g.sim.state.dev ? ' call' : ''}`, 'Launch');
      go.dataset['launch'] = '1';
      go.onclick = () => g.sim.apply({ t: 'launch', hero: h.id, building: b.id, board: false });
      row.append(go);
      if (b.ready === 'crew') {
        const ride = el('button', 'btn', 'Board and launch');
        ride.onclick = () => g.sim.apply({ t: 'launch', hero: h.id, building: b.id, board: true });
        row.append(ride);
      }
      d.append(row);
    } else if (work) renderTowerWork(c, d, work, `Stacking: ${PLANS[work.plan].name}`);
    else {
      d.append(el('h5', '', 'Stack a payload'));
      const pick = el('div', 'gem-line');
      for (const id of Object.keys(PAYLOADS) as PayloadId[]) {
        const knows = g.sim.knows(h, id);
        if (!knows && !g.sim.state.library.includes(id)) continue;
        const why = payloadBlocker(g.sim, id);
        const ok = knows && !why;
        const box = el(
          'div',
          `mopt${!knows ? ' unknown' : !ok ? ' blocked' : ''}`,
          `<img src="${c.icons.payload(id)}">`,
        );
        box.dataset['payload'] = id;
        if (ok)
          box.onclick = () => g.sim.apply({ t: 'stackPayload', hero: h.id, building: b.id, payload: id });
        c.tip.tip(
          box,
          () =>
            planTooltip(id, knows) +
            `<div class="tt-line tt-sub">${PAYLOADS[id].does} · ${!knows ? 'study its plan first (P)' : (why ?? 'click to stack it on the rocket')}</div>`,
        );
        pick.append(box);
      }
      if (!pick.children.length)
        d.append(
          el(
            'div',
            'w-sub',
            'No payload plans yet: invent them on the Road (O) — the payload stack, entry and landing, the rover, oxygen from the air, minerals home.',
          ),
        );
      else d.append(pick);
    }
    this.flightsList(d);
  }

  /** Flights under way: payload, direction and progress. */

  private flightsList(d: HTMLElement): void {
    const c = this.context;
    const fl = c.game.sim.state.space?.flights ?? [];
    if (!fl.length) return;
    d.append(el('h5', '', 'Flights'));
    for (const f of fl) {
      const k = Math.min(1, f.t / flightTime);
      d.append(
        el(
          'div',
          'flight-row',
          `<span>${PLANS[f.payload].name}${f.home ? ' — home' : ''}</span><span class="w-sub">${PHASE_NAMES[f.phase]}</span><div class="bar"><div class="fill" style="width:${(k * 100).toFixed(0)}%"></div></div>`,
        ),
      );
    }
  }

  /** Space base modules, depot and the journey home. */

  updateSpacePanel(): void {
    const c = this.context;
    const g = c.game;
    const h = c.hero();
    const show = !!h && inSpace(h.z) && !h.flight;
    this.spacePanel.classList.toggle('hidden', !show);
    if (!show) return;
    const s = spaceOf(g.sim);
    const key = JSON.stringify([
      s.modules.length,
      s.depot,
      s.flights.length,
      Math.round(h.x / 2),
      Math.round(h.z / 2),
    ]);
    if (key === this.spaceKey) return;
    this.spaceKey = key;
    const p = this.spacePanel;
    p.innerHTML = '';
    p.append(el('h4', '', '<span>The base</span>'));
    p.append(
      el('div', 'w-sub', s.modules.map((m) => PLANS[m.kind].name).join(' · ') || 'Nothing has landed yet.'),
    );
    const depot = Object.entries(s.depot)
      .filter(([, n]) => n)
      .map(([k, n]) => `<span class="part"><img src="${c.icons.item(k as ItemId)}">${n}</span>`)
      .join('');
    p.append(
      el(
        'div',
        'parts',
        depot || '<span class="w-sub">The depot is empty — the rover and the drill fill it.</span>',
      ),
    );
    const row = el('div', 'row');
    const send = el('button', 'btn tiny', 'Send the minerals home');
    send.onclick = () => g.sim.apply({ t: 'launchHome', hero: h.id, board: false });
    const ride = el('button', 'btn tiny', 'Ride home with them');
    ride.onclick = () => g.sim.apply({ t: 'launchHome', hero: h.id, board: true });
    row.append(send, ride);
    p.append(row);
    c.tip.tip(
      ride,
      () =>
        '<div class="tt-title">Home</div><div class="tt-line">Stand by the ascent vehicle to ride it up; the capsule comes down by the keep.</div>',
    );
  }
}
