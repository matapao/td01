import {
  ENEMIES,
  OVER_WALL,
  ARMOR_INFO,
  DAMAGE_INFO,
  DAMAGE_VS_ARMOR,
  type HeroClass,
  type DamageType,
} from '../game/content.ts';
import { crewBoost } from '../game/systems/combat.ts';
import { glyph, ARMOR_GLYPH, DAMAGE_GLYPH } from './glyphs.ts';

export function crewText(h: { cls?: HeroClass } | undefined): string {
  if (!h) return '';
  const b = crewBoost(h);
  const n = (v: number) => `${Math.round(v * 100)}%`;
  const cls = h.cls ?? 'tank';
  const extra =
    cls === 'tank'
      ? `, and the tower takes ${n(OVER_WALL.shield)} less damage`
      : cls === 'magic'
        ? `, ${n(b.damage - 1)} harder`
        : '';
  return `they shoot ${n(b.rate - 1)} faster and ${b.range} m further${extra}`;
}

export function enemyTip(kind: keyof typeof ENEMIES, lane = false): string {
  const d = ENEMIES[kind];
  const mults = (Object.keys(DAMAGE_INFO) as DamageType[]).map(
    (t) => [t, DAMAGE_VS_ARMOR[t][d.armorClass]] as const,
  );
  const weak = mults
    .filter(([, m]) => m >= 1.2)
    .map(([t]) => `<span class="tag weak">${glyph(DAMAGE_GLYPH[t])}${DAMAGE_INFO[t].name}</span>`)
    .join('');
  const resist = mults
    .filter(([, m]) => m <= 0.7)
    .map(([t]) => `<span class="tag resist">${glyph(DAMAGE_GLYPH[t])}${DAMAGE_INFO[t].name}</span>`)
    .join('');
  return `<div class="tt-title">${lane ? '☠ ' : ''}${d.name}</div><div class="tt-sub">${glyph(ARMOR_GLYPH[d.armorClass])} ${ARMOR_INFO[d.armorClass].name} armour${d.armor ? ` · grade ${Math.round(d.armor * 100)}%` : ''}${d.flying ? ' · flying' : ''}</div>
      <div class="tt-line">${d.blurb}</div>${lane ? '<div class="tt-line" style="color:#ff8a7a">Beyond any hero: one blow kills you. The towers deal with it.</div>' : ''}
      <div class="tt-line">${d.traits.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      ${weak ? `<div class="tt-line">Weak to: ${weak}</div>` : ''}${resist ? `<div class="tt-line">Resists: ${resist}</div>` : ''}`;
}
