/** Build-plan genes, authored families and seeded evolutionary variations. */
import {
  SOCKETS,
  PLANS,
  gemBlocker,
  type GemId,
  type GemPlan,
  type HeroClass,
  type DeviceId,
} from '../../src/game/content.ts';
import type { Strategy, Act } from './contracts.ts';
import { spotOrder } from './spots.ts';
// ---- Build plans from a few genes ------------------------------------------------------------------

export interface Genes {
  family: string;
  cls: HeroClass;
  style: string;
  towers: number;
  first: number;
  /** Gem lists by role; tower t plays role roleOf[t % roleOf.length]. */
  roles: GemId[][];
  roleOf: number[];
  /** Gems a tower gets from its list, and the level they are raised to. */
  gemsPer: number;
  maxLv: number;
  /** Upgrades start once this many rough gems are in. */
  upAfter: number;
  /** A new tower after every `every` gem steps (0: towers only at the start). */
  every: number;
  /** Breadth (every tower its first gem, then its second…) or depth (one tower at a time). */
  depth: boolean;
  /** Towers (the first n) that get a turret (2) or a gallery (3), and when (share of the plan). */
  topN: number;
  topLv: number;
  topAt: number;
  devices: DeviceId[];
  devN: number;
  post: 'none' | 'crew' | 'keeper';
  postFrom: number;
  mend: boolean;
  light: boolean;
  chests: number;
  /** A watch gem (Seer's Emerald) on the first tower against burrowers, after this many steps of the plan (−1: none). */
  detect?: number;
}

export function build(g: Genes): Strategy {
  const order = spotOrder(g.style);
  const acts: Act[] = [];
  let built = 0;
  const addTower = () => {
    if (built >= g.towers) return;
    acts.push(['T']);
    built++;
  };
  for (let i = 0; i < Math.min(g.first, g.towers); i++) addTower();
  const roleOf = (t: number) => {
    const role = g.roleOf[t % g.roleOf.length];
    return role === undefined ? [] : (g.roles[role % g.roles.length] ?? []);
  };
  // Rough gems: breadth-first or depth-first over the towers.
  const plan: { t: number; gem: GemId }[] = [];
  const per = Math.min(SOCKETS, g.gemsPer);
  if (g.depth) {
    for (let t = 0; t < g.towers; t++)
      for (let j = 0; j < per; j++) {
        const gem = roleOf(t)[j];
        if (gem) plan.push({ t, gem });
      }
  } else {
    for (let j = 0; j < per; j++)
      for (let t = 0; t < g.towers; t++) {
        const gem = roleOf(t)[j];
        if (gem) plan.push({ t, gem });
      }
  }
  const ups: { t: number; gem: GemId }[] = [];
  for (let lv = 2; lv <= g.maxLv; lv++) for (const p of plan) ups.push(p);
  let steps = 0;
  let pi = 0;
  let ui = 0;
  const topIdx = Math.round(g.topAt * (plan.length + ups.length + g.towers));
  let topsDone = false;
  const emitTops = () => {
    if (topsDone) return;
    topsDone = true;
    for (let lv = 2; lv <= g.topLv; lv++) for (let t = 0; t < g.topN; t++) acts.push(['P', t]);
  };
  const emitDevices = () => {
    for (const d of g.devices) for (let t = 0; t < g.devN; t++) acts.push(['D', t, d]);
  };
  let devDone = false;
  while (pi < plan.length || ui < ups.length || built < g.towers) {
    if (acts.length >= topIdx) emitTops();
    if (!devDone && g.devices.length && pi >= plan.length && ui >= ups.length / 2) {
      emitDevices();
      devDone = true;
    }
    // Gems wait for their tower: build it first.
    const next =
      pi < plan.length && (ui >= ups.length || g.upAfter > pi) ? plan[pi] : ui < ups.length ? ups[ui] : null;
    if (!next) {
      addTower();
      continue;
    }
    if (next.t >= built) {
      addTower();
      continue;
    }
    if (next === plan[pi]) {
      acts.push(['G', next.t, next.gem]);
      pi++;
    } else {
      acts.push(['U', next.t, next.gem]);
      ui++;
    }
    steps++;
    if (g.every > 0 && steps % g.every === 0) addTower();
  }
  emitTops();
  if (!devDone && g.devices.length) emitDevices();
  if ((g.detect ?? -1) >= 0) {
    // On the first tower whose emerald window the plan leaves free (else the first: its emerald gives way).
    const emerald = (t: number) =>
      acts.some((a) => a[0] === 'G' && a[1] === t && (PLANS[a[2]] as GemPlan).color === 'emerald');
    let t = 0;
    while (t < built && emerald(t)) t++;
    if (t >= built) {
      t = 0;
      for (let i = acts.length - 1; i >= 0; i--) {
        // Reverse traversal removes only this current dense action slot.
        const a = acts[i]!;
        if ((a[0] === 'G' || a[0] === 'U') && a[1] === 0 && (PLANS[a[2]] as GemPlan).color === 'emerald')
          acts.splice(i, 1);
      }
    }
    const at = acts.findIndex(
      (a, i) => a[0] === 'T' && acts.slice(0, i + 1).filter((b) => b[0] === 'T').length === t + 1,
    );
    acts.splice(Math.max(at + 1, Math.min(acts.length, g.detect!)), 0, ['G', t, 'seer']);
  }
  const spotsOut = order.slice(0, Math.max(g.towers, 1));
  return {
    name: `${g.family}:${g.cls}/${g.style}/${g.towers}t/${g.gemsPer}g→${g.maxLv}/${g.post}`,
    family: g.family,
    cls: g.cls,
    spots: spotsOut,
    acts,
    post: g.post,
    postFrom: g.postFrom,
    mend: g.mend,
    light: g.light,
    chests: g.chests ?? -1,
  };
}

// ---- Families: the routes players take ----------------------------------------------------------------

const DPS_ROLE: GemId[] = ['fury', 'swift', 'twin', 'far', 'frost'];
const ROLES: Record<string, GemId[][]> = {
  // Plain archers, no gems.
  spam: [[]],
  // One gem family everywhere (its colour's window first, then the usual filler).
  ember: [['ember', 'swift', 'twin', 'far', 'rime']],
  blast: [['blast', 'swift', 'twin', 'far', 'rime']],
  fury: [['fury', 'swift', 'twin', 'far', 'rime']],
  warheart: [['warheart', 'swift', 'twin', 'far', 'frost']],
  frost: [['frost', 'fury', 'swift', 'twin', 'far']],
  rime: [['rime', 'fury', 'swift', 'twin', 'far']],
  swift: [['swift', 'fury', 'twin', 'far', 'rime']],
  storm: [['storm', 'fury', 'twin', 'far', 'rime']],
  sun: [['sun', 'fury', 'twin', 'far', 'rime']],
  arcane: [['arcane', 'fury', 'swift', 'far', 'rime']],
  twin: [['twin', 'fury', 'swift', 'far', 'rime']],
  far: [['far', 'fury', 'swift', 'twin', 'rime']],
  seer: [['seer', 'fury', 'swift', 'twin', 'rime']],
  scry: [['scry', 'fury', 'swift', 'far', 'rime']],
  // Mixes: damage dealers, splash and control, storm against plate, fire and arcane against spirits.
  mixed: [DPS_ROLE, ['blast', 'storm', 'rime', 'arcane', 'far'], ['ember', 'swift', 'twin', 'far', 'frost']],
  elements: [
    ['storm', 'fury', 'twin', 'far', 'rime'],
    ['ember', 'swift', 'arcane', 'far', 'frost'],
    ['blast', 'swift', 'twin', 'far', 'frost'],
  ],
  control: [
    ['frost', 'blast', 'swift', 'twin', 'far'],
    ['rime', 'storm', 'fury', 'twin', 'far'],
  ],
  support: [['warheart', 'sun', 'rime', 'twin', 'far'], DPS_ROLE],
  free: [DPS_ROLE],
};

export const FAMILIES = [
  'spam',
  'ember',
  'blast',
  'fury',
  'warheart',
  'frost',
  'rime',
  'swift',
  'storm',
  'sun',
  'arcane',
  'twin',
  'far',
  'seer',
  'scry',
  'mixed',
  'elements',
  'control',
  'support',
  'free',
];
/** Families whose roles the search may rework freely (the rest keep their own gem first). */
export const OPEN_FAMILIES = ['mixed', 'elements', 'control', 'support', 'free'];

/** Where a family's search starts: a few shapes (towers wide or tall, upgraded or rough). */
export function starts(fam: string): Genes[] {
  return [
    baseGenes(fam),
    baseGenes(fam, { towers: 20, gemsPer: 3, maxLv: 1, every: 2 }),
    baseGenes(fam, { towers: 8, gemsPer: 5, maxLv: 3, upAfter: 10, style: 'gate' }),
    baseGenes(fam, { towers: 26, gemsPer: 2, maxLv: 2, style: 'mix', post: 'keeper', postFrom: 6 }),
    baseGenes(fam, { towers: 12, gemsPer: 3, maxLv: 2, every: 1, depth: true, post: 'none' }),
  ];
}

/**
 * A player who builds sensibly but doesn't optimise: keeps building as the economy allows — towers
 * mostly by the gate where the dead stop (some out along the roads), an element on most of them and a
 * gem or two more picked by name, the odd upgrade and roof, some upkeep (some run to the battered gate
 * in the late waves to mend it) — rarely the chest run, and slower hands (ECONS.average).
 */
export function averageGenes(r: () => number): Genes {
  const elements: GemId[] = ['ember', 'blast', 'storm', 'frost', 'arcane'];
  const others: GemId[] = ['fury', 'swift', 'twin', 'far', 'rime', 'sun', 'seer', 'warheart', 'scry'];
  const role = () => fixRole([sampleGene(r, elements), ...[...others].sort(() => r() - 0.5).slice(0, 3)]);
  const st = r();
  return baseGenes('average', {
    cls: sampleGene(r, CLASSES_),
    style: st < 0.4 ? 'gate' : st < 0.8 ? 'mix' : 'lane',
    towers: 12 + rnd(r, 13),
    first: 2 + rnd(r, 3),
    roles: [role(), role()],
    roleOf: [0, 1],
    gemsPer: 1 + rnd(r, 3),
    maxLv: 1 + rnd(r, 2),
    upAfter: 6 + rnd(r, 10),
    every: 1 + rnd(r, 3),
    depth: r() < 0.5,
    topN: rnd(r, 5),
    topLv: 2,
    topAt: 0.3 + r() * 0.5,
    // Some run to the gate to mend it when they see it battered (from the late waves on).
    post: r() < 0.4 ? 'keeper' : 'none',
    postFrom: 7 + rnd(r, 5),
    mend: r() < 0.8,
    light: r() < 0.6,
    chests: r() < 0.4 ? rnd(r, 4) : -1,
    // Most set a Seer's Emerald once burrowers have got under the wall (or the wave's intel says they burrow).
    detect: r() < 0.7 ? 10 + rnd(r, 20) : -1,
  });
}

/** A lazy player: a few towers now and then, one gem each picked by name, little upkeep, slow hands (ECONS.poor). */
export function poorGenes(r: () => number): Genes {
  const naive: GemId[] = ['swift', 'fury', 'far', 'frost', 'ember', 'storm'];
  return baseGenes('poor', {
    cls: 'tank',
    style: sampleGene(r, ['gate', 'mix', 'lane']),
    towers: 5 + rnd(r, 8),
    first: 2 + rnd(r, 3),
    roles: [[sampleGene(r, naive)]],
    roleOf: [0],
    gemsPer: 1,
    maxLv: 1,
    upAfter: 99,
    every: 2,
    depth: false,
    topN: 0,
    topLv: 1,
    topAt: 1,
    post: 'none',
    postFrom: 12,
    mend: r() < 0.5,
    light: false,
    chests: -1,
    detect: r() < 0.3 ? 20 + rnd(r, 20) : -1,
  });
}

/** A family's starting genes (the search moves them). */
export function baseGenes(family: string, over: Partial<Genes> = {}): Genes {
  const only = family === 'spam' || family.startsWith('only-');
  const g: Genes = {
    family,
    cls: 'tank',
    style: 'gate',
    towers: only ? 40 : 14,
    first: 3,
    roles: ROLES[family] ?? ROLES['mixed']!,
    roleOf: [0, 1, 2],
    gemsPer: only ? 0 : 4,
    maxLv: 2,
    upAfter: 20,
    every: 3,
    depth: false,
    topN: 6,
    topLv: 2,
    topAt: 0.4,
    devices: [],
    devN: 0,
    post: 'crew',
    postFrom: 8,
    mend: true,
    light: true,
    chests: 1,
    detect: 8,
    ...over,
  };
  if (family === 'spam') {
    g.gemsPer = 0;
    g.every = 0;
    g.first = g.towers;
    g.detect = -1;
  }
  return g;
}

// ---- Variation (the search) -------------------------------------------------------------------------

export const ALL_GEMS: GemId[] = [
  'ember',
  'blast',
  'fury',
  'warheart',
  'frost',
  'rime',
  'swift',
  'storm',
  'sun',
  'arcane',
  'twin',
  'scry',
  'seer',
  'far',
];
const STYLES = ['gate', 'mix', 'lane', 'deep', 'north', 'south'];
const CLASSES_: HeroClass[] = ['tank', 'support', 'magic'];
export const DEVICES: DeviceId[] = ['searchlight', 'relay', 'targeter'];

export function rnd(r: () => number, n: number): number {
  return Math.floor(r() * n);
}

/** One sampled gene; reject an invalid empty population before consuming its RNG draw. */
export function sampleGene<T>(r: () => number, values: readonly T[]): T {
  if (!values.length) throw new Error('Cannot sample an empty gene collection');
  return values[rnd(r, values.length)]!;
}

/** A role list that respects one gem per colour and one element per tower. */
function fixRole(role: GemId[]): GemId[] {
  const out: GemId[] = [];
  for (const g of role) if (!out.includes(g) && !gemBlocker(out, g)) out.push(g);
  return out;
}

export function mutate(g0: Genes, r: () => number, lockFamily: boolean): Genes {
  const g: Genes = JSON.parse(JSON.stringify(g0));
  const n = 1 + rnd(r, 3);
  for (let i = 0; i < n; i++) {
    switch (rnd(r, 16)) {
      case 0:
        g.towers = Math.max(1, Math.min(60, g.towers + (rnd(r, 2) ? 1 : -1) * (1 + rnd(r, 6))));
        break;
      case 1:
        g.first = Math.max(1, Math.min(g.towers, g.first + (rnd(r, 2) ? 1 : -1) * (1 + rnd(r, 3))));
        break;
      case 2:
        if (g.family !== 'spam') g.gemsPer = Math.max(1, Math.min(5, g.gemsPer + (rnd(r, 2) ? 1 : -1)));
        break;
      case 3:
        g.maxLv = 1 + rnd(r, 3);
        break;
      case 4:
        g.upAfter = Math.max(0, g.upAfter + (rnd(r, 2) ? 1 : -1) * (1 + rnd(r, 10)));
        break;
      case 5:
        g.every = rnd(r, 7);
        break;
      case 6:
        g.depth = !g.depth;
        break;
      case 7:
        g.topN = Math.max(0, Math.min(g.towers, g.topN + (rnd(r, 2) ? 1 : -1) * (1 + rnd(r, 4))));
        g.topLv = g.topN ? 2 + rnd(r, 2) : 1;
        break;
      case 8:
        g.topAt = Math.max(0, Math.min(1, g.topAt + (r() - 0.5) * 0.5));
        break;
      case 9:
        g.style = sampleGene(r, STYLES);
        break;
      case 10:
        g.cls = sampleGene(r, CLASSES_);
        break;
      case 11:
        g.post = sampleGene(r, ['none', 'crew', 'keeper'] as const);
        g.postFrom = 1 + rnd(r, 12);
        break;
      case 12:
        g.mend = r() < 0.85;
        g.light = r() < 0.85;
        g.chests = r() < 0.8 ? rnd(r, 6) : -1;
        g.detect = r() < 0.85 ? rnd(r, 30) : -1;
        break;
      case 13: {
        // Rework one role: swap two gems, or change one (lockFamily keeps the family's own gem first).
        if (g.family === 'spam') break;
        const ri = rnd(r, g.roles.length);
        const selected = g.roles[ri];
        if (!selected) throw new Error('A mutated family needs a role');
        const role = [...selected];
        const j = rnd(r, Math.max(1, role.length));
        if (r() < 0.5 && role.length > 1) {
          const k = rnd(r, role.length);
          if (!(lockFamily && (j === 0 || k === 0))) [role[j], role[k]] = [role[k]!, role[j]!];
        } else if (!(lockFamily && j === 0)) role[j] = sampleGene(r, ALL_GEMS);
        g.roles[ri] = fixRole(role);
        break;
      }
      case 14: {
        if (g.family === 'spam' || lockFamily) break;
        // Role layout across the towers.
        const len = 1 + rnd(r, 4);
        g.roleOf = Array.from({ length: len }, () => rnd(r, g.roles.length));
        if (r() < 0.3 && g.roles.length < 4)
          g.roles.push(fixRole([...ALL_GEMS].sort(() => r() - 0.5).slice(0, 5)));
        break;
      }
      case 15: {
        if (r() < 0.5) {
          g.devices = [];
          g.devN = 0;
        } else {
          g.devices = DEVICES.filter(() => r() < 0.4);
          g.devN = g.devices.length ? 1 + rnd(r, 6) : 0;
        }
        break;
      }
    }
  }
  if (g.family === 'spam') {
    g.gemsPer = 0;
    g.first = g.towers;
    g.detect = -1;
  }
  g.first = Math.max(1, Math.min(g.towers, g.first));
  return g;
}

export function cross(a: Genes, b: Genes, r: () => number): Genes {
  const out: Genes = JSON.parse(JSON.stringify(a));
  for (const k of Object.keys(out) as (keyof Genes)[]) {
    if (k === 'family') continue;
    if (r() < 0.5 && b[k] !== undefined)
      (out as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(b[k]));
  }
  return out;
}
