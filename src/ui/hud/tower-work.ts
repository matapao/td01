import type { ItemId } from '../../game/item-data.ts';
import { ITEMS } from '../../game/content.ts';
import type { Site } from '../../game/entity-types.ts';
import { buyoutCost, siteComplete, siteMissing, siteSteps } from '../../game/systems/craft.ts';
import { el } from '../dom.ts';
import type { HudPanelContext } from './context.ts';

/** The work under way on a tower: its parts, porters for the rest, or cancellation. */

/** The work under way on a tower: its parts, porters for the rest, or cancellation. */
export function renderTowerWork(context: HudPanelContext, d: HTMLElement, site: Site, title: string): void {
  const c = context;
  const g = c.game;
  const h = c.hero();
  const missing = siteMissing(site);
  const parts = el('div', 'parts');
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
  const steps = siteSteps(site);
  const state = siteComplete(site)
    ? `ready — ${steps[site.step]?.label ?? 'build it'} (F at the tower, from the wall-walk)`
    : 'bring its parts (F at the tower, from the wall-walk)';
  d.append(el('h5', '', title), el('div', 'w-sub', state), parts);
  const act = el('div', 'row');
  const cost = buyoutCost(site);
  if (cost > 0) {
    const buy = el('button', `btn tiny${g.sim.canPay(cost) ? ' call' : ''}`, `Buy the rest — ${cost}g`);
    if (g.sim.canPay(cost)) buy.onclick = () => g.sim.apply({ t: 'buyout', hero: h.id, site: site.id });
    else buy.setAttribute('disabled', '');
    act.append(buy);
  }
  const cancel = el('button', 'btn tiny', 'Cancel');
  cancel.onclick = () => g.sim.apply({ t: 'cancelSite', site: site.id });
  act.append(cancel);
  d.append(act);
}
