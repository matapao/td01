/** Building status and target controls; gameplay changes go through simulation commands. */
import type { Sim } from '../game/sim.ts';
import type { Building } from '../game/entity-types.ts';
import { POWER, STATIONS, isTower, HERO, classOf, OVER_WALL, NIGHT, DAMAGE_INFO } from '../game/content.ts';
import { darkness, sightRange } from '../game/systems/power.ts';
import { crewOf } from '../game/systems/combat.ts';
import { affixText } from '../game/loot.ts';
import { crewText } from './enemy-cards.ts';
import { el, esc } from './dom.ts';
import { glyph, DAMAGE_GLYPH } from './glyphs.ts';

export function buildingStatus(d: HTMLElement, sim: Sim, b: Building): void {
  const power =
    b.kind === 'hydro'
      ? `⚡ Generating — feeds poles within ${POWER.link + 3} m and buildings within ${POWER.reach + 3} m`
      : b.kind === 'pole'
        ? b.powered
          ? `⚡ Live — carries power ${POWER.link} m to the next pole, ${POWER.reach} m to buildings`
          : `No power — needs the watermill or a live pole within ${POWER.link} m`
        : b.kind === 'lamp'
          ? b.powered
            ? '⚡ On the grid — lights up at dusk'
            : `No power — needs a live pole within ${POWER.reach} m`
          : b.kind in STATIONS && b.powered
            ? `⚡ On the grid — works ${POWER.stationBoost}× faster`
            : '';
  if (power) d.append(el('div', `d-power${b.powered ? ' on' : ''}`, power));
  if (isTower(b.kind)) {
    const up = crewOf(sim, b);
    const who = up ? (up.name === HERO.name ? classOf(up).name : up.name) : '';
    const crew = !!b.stats && b.stats.range > 0;
    d.append(
      el(
        'div',
        `d-power${up ? ' on' : ''}`,
        up
          ? `⚑ ${esc(who)} crews it from the wall${crew ? ` — ${crewText(up)}` : ''}`
          : `Stand on the wall-walk within ${OVER_WALL.crew} m of it to crew it: the archer shoots faster and further`,
      ),
    );
  }
  const shoots = !!b.stats && b.stats.range > 0;
  if (shoots) {
    const dark = darkness(sim) > 0.05;
    d.append(
      el(
        'div',
        `d-power${b.lit ? ' on' : ''}`,
        b.lit
          ? '🔥 Lit — sees as far by night as by day'
          : `Unlit — at night it sees up to ${Math.round(NIGHT.rangeLoss * 100)}% less far${dark ? ` (now ${sightRange(sim, b).toFixed(1)})` : ''}. The wall's torches light the towers within ${NIGHT.town} m of it; a brazier up on the wall-walk lights them ${NIGHT.beacon} m out (or a Sun Topaz in a window).`,
      ),
    );
  }
  if (b.stats) {
    const st = b.stats;
    const dmg = DAMAGE_INFO[st.damageType];
    if (shoots) {
      const sight = sightRange(sim, b);
      const stats = el('div', 'stats');
      stats.innerHTML = `<span>Damage</span><b style="color:${dmg.color}">${glyph(DAMAGE_GLYPH[st.damageType])} ${Math.round(st.damage)} ${dmg.name}${st.bonusMagic ? ` +${Math.round(st.bonusMagic)} arcane` : ''}</b><span>Speed</span><b>${st.rate.toFixed(2)}/s${st.shooters > 1 ? ` · ${Math.ceil(st.shooters)} archers${st.shooters % 1 ? ` (the last at ${Math.round((st.shooters % 1) * 100)}%)` : ''}` : ''}</b><span>Range</span><b>${sight < st.range - 0.05 ? `${sight.toFixed(1)} <span class="w-sub">(${st.range.toFixed(1)} by day)</span>` : st.range.toFixed(1)}</b><span>Hits</span><b>${st.hitsGround ? 'Ground' : ''}${st.hitsGround && st.hitsAir ? ' + ' : ''}${st.hitsAir ? 'Air' : ''}</b>${st.splash ? `<span>Splash</span><b>${st.splash.toFixed(1)}</b>` : ''}${st.chain ? `<span>Chain</span><b>${st.chain}</b>` : ''}${st.slow ? `<span>Chill</span><b>${Math.round(st.slow * 100)}%</b>` : ''}${st.burn ? `<span>Burn</span><b>${st.burn}/s</b>` : ''}${st.crit ? `<span>Crit</span><b>${Math.round(st.crit * 100)}%</b>` : ''}`;
      d.append(stats);
      const modes = el('div', 'target-row', '<span class="w-sub">Target</span>');
      for (const m of ['first', 'last', 'strong', 'close'] as const) {
        const btn = el(
          'button',
          `btn tiny${b.mode === m ? ' call' : ''}`,
          m.charAt(0).toUpperCase() + m.slice(1),
        );
        btn.onclick = () => sim.apply({ t: 'mode', building: b.id, mode: m });
        modes.append(btn);
      }
      d.append(modes);
    }
    if (b.relics.length) {
      d.append(el('h5', '', 'Enchanted parts inside'));
      d.append(
        el(
          'div',
          '',
          `<div class="w-sub">${esc(b.relics.join(' · '))}</div>${b.affixes.map((a) => `<div class="aff" style="color:#8fc8ff">${affixText(a)}</div>`).join('')}`,
        ),
      );
    }
  }
}
