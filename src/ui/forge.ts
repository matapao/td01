/**
 * Weapons you can see and earn: the hero's class weapon at its tier — in the hero's tooltip, the Plan
 * Book, and the Blacksmith's anvil panel, where it is reforged one tier up (bars, then silver and
 * gold, then gems), worked at the anvil like any batch.
 */
import {
  ITEMS,
  WEAPONS,
  WEAPON_DAMAGE,
  maxWeaponTier,
  weaponTier,
  weaponOf,
  type ItemId,
  type Parts,
} from '../game/content.ts';
import { reforgeBlocker, reforgeCost, reforgeMissing } from '../game/systems/craft.ts';
import type { Building, Hero } from '../game/types.ts';
import type { Sim } from '../game/sim.ts';
import type { Icons } from './icons.ts';
import { el, esc } from './dom.ts';

/** "+24% damage" for a tier. */
export const tierBonus = (tier: number): string => `+${Math.round(WEAPON_DAMAGE * tier * 100)}% damage`;

/** One line about the hero's weapon (the hero's tooltip). */
export function weaponLine(h: Hero): string {
  const tier = weaponTier(h);
  const line = WEAPONS[h.cls];
  const top = maxWeaponTier(h.cls);
  const next =
    tier < top
      ? ` · reforge it at the Blacksmith's anvil for ${tierBonus(tier + 1)}`
      : ' · as fine as a smith can make it';
  return `${esc(weaponOf(h).name)} (${line.kind.toLowerCase()}, tier ${tier + 1} of ${top + 1})${tier ? ` · ${tierBonus(tier)}` : ''}${next}`;
}

function partsHtml(icons: Icons, cost: Parts, missing: Parts): string {
  return Object.entries(cost)
    .map(([k, n]) => {
      const item = k as ItemId;
      const short = missing[item] ?? 0;
      return `<span class="part ${short ? 'miss' : 'ok'}"><img src="${icons.item(item)}">${ITEMS[item].name} ${(n ?? 0) - short}/${n}</span>`;
    })
    .join('');
}

/**
 * The hero's weapon and the next tier: what it looks like, what it does, what it costs. `b`: the anvil
 * it would be reforged at (its tray counts toward the parts).
 */
export function weaponCard(icons: Icons, h: Hero, b: Building | null): HTMLElement {
  const tier = weaponTier(h);
  const line = WEAPONS[h.cls];
  const top = maxWeaponTier(h.cls);
  const card = el('div', 'forge');
  card.append(
    el(
      'div',
      'd-head',
      `<img src="${icons.weapon(h.cls, tier)}"><div><div class="d-title gold-text">${esc(weaponOf(h).name)}</div><div class="d-sub">${line.kind} · tier ${tier + 1} of ${top + 1}${tier ? ` · ${tierBonus(tier)}` : ''}</div></div>`,
    ),
  );
  const cost = reforgeCost(h);
  if (!cost) {
    card.append(el('div', 'w-sub', 'As fine as a smith can make it.'));
    return card;
  }
  // A non-null reforge cost means the current tier has a configured successor.
  const next = line.tiers[tier + 1]!;
  card.append(
    el(
      'div',
      'd-head',
      `<img src="${icons.weapon(h.cls, tier + 1)}"><div><div class="d-title">Next: ${esc(next.name)}</div><div class="d-sub">${tierBonus(tier + 1)} · reforged at the Blacksmith's anvil</div></div>`,
    ),
    el('div', 'parts', partsHtml(icons, cost, reforgeMissing(h, b, cost))),
  );
  return card;
}

/** The anvil's panel: your weapon, the next tier and its parts, and the button that puts it on the anvil. */
export function reforgePanel(d: HTMLElement, sim: Sim, icons: Icons, h: Hero, b: Building): void {
  d.append(el('h5', '', 'Reforge your weapon'));
  const forging = b.forgeFor ? sim.getAs(b.forgeFor, 'hero') : undefined;
  if (forging) {
    const mine = forging.id === h.id;
    d.append(
      el(
        'div',
        'w-sub',
        `${mine ? 'Your' : `${esc(forging.name)}'s`} ${esc(weaponOf(forging).name)} is on the anvil — work it (F) to be done sooner.`,
      ),
    );
  }
  d.append(weaponCard(icons, h, b));
  if (!reforgeCost(h)) return;
  const why = reforgeBlocker(sim, h, b);
  const go = el('button', `btn${why ? '' : ' call'}`, 'Reforge');
  go.title = why ?? 'Put it on the anvil: heat it in the forge, then hammer it out';
  if (why) go.setAttribute('disabled', '');
  else go.onclick = () => sim.apply({ t: 'reforge', hero: h.id, building: b.id });
  d.append(go);
  if (why) d.append(el('div', 'w-sub', esc(why)));
  else
    d.append(
      el('div', 'w-sub', 'Its parts come from your bag (and the anvil’s tray); a batch under way waits.'),
    );
}
