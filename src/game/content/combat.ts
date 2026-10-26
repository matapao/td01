/** Damage, armour and status-effect tuning. */
import type { DamageType, ArmorClass } from '../content-types.ts';

export const PHYSICAL: ReadonlySet<DamageType> = new Set(['pierce', 'impact', 'slash']);

export const DAMAGE_INFO: Record<DamageType, { name: string; color: string; blurb: string }> = {
  pierce: { name: 'Pierce', color: '#e8d9b0', blurb: 'Bolts and arrows. Slips through bone.' },
  impact: {
    name: 'Impact',
    color: '#d8a35c',
    blurb: 'Boulders and blunt force. Shatters bone and frozen foes.',
  },
  slash: { name: 'Slash', color: '#f0f0f0', blurb: 'Swords and axes.' },
  fire: { name: 'Fire', color: '#ff8a3a', blurb: 'Burns over time. Spirits fear it.' },
  frost: {
    name: 'Frost',
    color: '#8fe3ff',
    blurb: 'Chills (slow). Three chills freeze; frozen foes shatter on impact.',
  },
  lightning: { name: 'Lightning', color: '#ffe96a', blurb: 'Arcs between enemies. Plate conducts it.' },
  arcane: { name: 'Arcane', color: '#c18bff', blurb: 'Ignores armour grade. Unravels spirits.' },
};

export const ARMOR_INFO: Record<ArmorClass, { name: string; blurb: string }> = {
  bone: { name: 'Bone', blurb: 'Weak to Impact, resists Pierce.' },
  plate: { name: 'Plate', blurb: 'Resists Pierce and Slash, weak to Lightning.' },
  spectral: { name: 'Spectral', blurb: 'Shrugs off weapons, weak to Fire and Arcane.' },
  warded: { name: 'Warded', blurb: 'Resists magic, weak to weapons.' },
  colossal: { name: 'Colossal', blurb: 'Resists most things and shrugs off crowd control.' },
  flesh: { name: 'Flesh', blurb: 'No special resistances; burns well.' },
};

/** Damage multiplier: attack type (rows) vs armour class (columns). */
export const DAMAGE_VS_ARMOR: Record<DamageType, Record<ArmorClass, number>> = {
  pierce: { bone: 0.85, plate: 0.7, spectral: 0.65, warded: 1.4, colossal: 0.8, flesh: 1.1 },
  impact: { bone: 1.25, plate: 1.15, spectral: 0.35, warded: 1.0, colossal: 0.8, flesh: 1.0 },
  slash: { bone: 0.9, plate: 0.6, spectral: 0.7, warded: 1.15, colossal: 0.8, flesh: 1.2 },
  fire: { bone: 1.0, plate: 0.9, spectral: 1.3, warded: 0.75, colossal: 0.9, flesh: 1.25 },
  frost: { bone: 0.9, plate: 1.0, spectral: 0.85, warded: 0.75, colossal: 0.6, flesh: 1.0 },
  lightning: { bone: 0.9, plate: 1.15, spectral: 1.1, warded: 0.7, colossal: 0.8, flesh: 1.0 },
  arcane: { bone: 1.0, plate: 1.0, spectral: 1.5, warded: 0.6, colossal: 1.0, flesh: 1.0 },
};

/** Lightning arcs from its target to the nearest of the dead within `reach` m, `falloff` as hard each jump. */
export const CHAIN = { reach: 3, falloff: 0.45 };

export const STATUS = {
  /** Chill stacks to freeze. */
  chillToFreeze: 3,
  chillTime: 3,
  /** How long a freeze holds at a chill of `freezeChill` (a polished frost sapphire's); longer or shorter with the chill. */
  freezeTime: 1.1,
  freezeChill: 0.35,
  brittleTime: 2.5,
  shatterBonus: 1.6,
  burnTime: 3,
};
