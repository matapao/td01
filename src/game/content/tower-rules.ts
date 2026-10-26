/** Pure tower naming, gem constraints and complete stat calculations. */
import type {
  GemId,
  Parts,
  GemPlan,
  GemLevel,
  DeviceId,
  TopLevel,
  TopId,
  DamageType,
  GemColor,
  Plan,
  BasePlan,
  BuildingKind,
  TowerStats,
} from '../content-types.ts';
import { sumAffixes } from '../loot.ts';
import type { Affix } from '../loot-types.ts';
import { isTower } from './structures.ts';
import { PLANS } from './plans.ts';
import { ARCHER, DEVICE, GEM_COLORS, GEM_LEVELS, MAX_GEM_LEVEL, TOWER_TOPS } from './tower-data.ts';

/** Raising gem `id` to level `lv` takes `lv` more raw gems of its colour, and its other parts again. */
export function upgradeParts(id: GemId, lv: number): Parts {
  const p = PLANS[id] as GemPlan;
  const out: Parts = { ...p.parts };
  out[p.color] = lv;
  return out;
}

/** Raw gems a gem of level `lv` holds altogether (1 + 2 + 3…): all of them come back when it's taken out. */
export const rawIn = (lv: number): number => (lv * (lv + 1)) / 2;

/** A set gem's full name: its grade and its plan's name ("Brilliant Swift Topaz"). */
export function gemName(b: { gems: readonly GemId[]; gemLv?: readonly number[] }, id: GemId): string {
  return `${GEM_LEVELS[gemLevel(b, id)].name} ${PLANS[id].name}`;
}

/** The level of gem `id` set in tower `b` (rough if it's not recorded). */
export function gemLevel(b: { gems: readonly GemId[]; gemLv?: readonly number[] }, id: GemId): GemLevel {
  const q = b.gemLv?.[b.gems.indexOf(id)];
  return q === 2 || q === 3 ? q : 1;
}

/** A tower's stats from everything built into it: its gems (and their levels), enchanted parts, its top. */
export function towerStats(b: {
  gems: readonly GemId[];
  affixes: readonly Affix[];
  gemLv?: readonly number[];
  top?: number;
}): TowerStats {
  return computeTowerStats(b.gems, b.affixes, b.gemLv ?? [], topOf(b));
}

/** A tower's top (the open platform unless it has been built up). */
export const topOf = (b: { top?: number }): TopLevel => (b.top === 2 || b.top === 3 ? b.top : 1);
/** Why device `id` can't go into a tower that holds `set` (null if it can). */
export function deviceBlocker(set: readonly DeviceId[], id: DeviceId): string | null {
  if (set.includes(id)) return 'Already in this tower';
  if (set.length >= DEVICE.slots) return 'Its four upper windows are full';
  return null;
}

/** The plan that builds a tower's next top (null at the gallery). */
export const nextTop = (b: { top?: number }): TopId | null =>
  topOf(b) === 1 ? 'turret' : topOf(b) === 2 ? 'gallery' : null;

/** The element gem set in a tower, if any (it colours the archer's bolts — and the archer). */
export function elementOf(gems: readonly GemId[]): DamageType | undefined {
  for (const g of gems) {
    const e = (PLANS[g] as GemPlan).element;
    if (e) return e;
  }
  return undefined;
}

/** Every variant of a colour, in plan order. */
export function gemsOf(color: GemColor): GemPlan[] {
  return (Object.values(PLANS) as Plan[]).filter((p): p is GemPlan => p.type === 'gem' && p.color === color);
}

const ELEMENT_TOWER: Partial<Record<DamageType, string>> = {
  fire: 'Fire Tower',
  impact: 'Blast Tower',
  frost: 'Frost Tower',
  lightning: 'Storm Tower',
  arcane: 'Arcane Tower',
};

/** A tower is called after its element (or its eye): a Frost Tower, a Watch Tower… plain, an Archer Tower. */
export function towerName(gems: readonly GemId[]): string {
  const e = elementOf(gems);
  if (e && ELEMENT_TOWER[e]) return ELEMENT_TOWER[e]!;
  if (gems.includes('seer')) return 'Watch Tower';
  if (gems.includes('scry')) return 'Scrying Tower';
  return 'Archer Tower';
}

export function basePlanFor(kind: BuildingKind): BasePlan {
  return (Object.values(PLANS) as Plan[]).find(
    (p): p is BasePlan => p.type === 'building' && p.building === kind,
  )!;
}

/** What a building is called: towers after their gems, everything else after its plan. */
export function buildingTitle(b: { kind: BuildingKind; gems: readonly GemId[] }): string {
  return isTower(b.kind) ? towerName(b.gems) : basePlanFor(b.kind).name;
}

export function computeTowerStats(
  gems: readonly GemId[],
  affixes: readonly Affix[] = [],
  gemLv: readonly number[] = [],
  top: TopLevel = 1,
): TowerStats {
  const s = { ...ARCHER };
  s.range += TOWER_TOPS[top].rangeAdd;
  const element = elementOf(gems);
  if (element) s.damageType = element;
  for (const id of gems) {
    const m = (PLANS[id] as GemPlan).mods;
    // A rough gem does less, a brilliant one more — of what it does well: a drawback (a blast ruby's
    // slower shots) is the same at every grade.
    const k = GEM_LEVELS[gemLevel({ gems, gemLv }, id)].k;
    if (m.rateMul) s.rate *= m.rateMul < 1 ? m.rateMul : 1 + (m.rateMul - 1) * k;
    if (m.rangeAdd) s.range += m.rangeAdd * k;
    if (m.damageMul) s.damage *= 1 + (m.damageMul - 1) * k;
    if (m.critAdd) s.crit += m.critAdd * k;
    // A twin's second archer keeps pace only once the gem is radiant (rough: every other shot).
    if (m.shootersAdd) s.shooters += m.shootersAdd * Math.min(1, k / GEM_LEVELS[MAX_GEM_LEVEL].k);
    if (m.splash) s.splash = Math.max(s.splash, m.splash * (0.75 + 0.25 * k));
    if (m.burn) s.burn += m.burn * k;
    if (m.chain) s.chain += Math.max(1, Math.round(m.chain * k));
    if (m.slow) s.slow = Math.max(s.slow, Math.min(0.6, m.slow * k));
  }
  // Enchanted parts built into it.
  const a = sumAffixes(affixes);
  if (a.haste) s.rate *= 1 + a.haste / 100;
  if (a.keen) s.crit += a.keen / 100;
  if (a.reach) s.range += a.reach;
  if (a.brutal) s.damage *= 1 + a.brutal / 100;
  if (a.frost) s.slow = Math.max(s.slow, Math.min(0.6, a.frost / 100));
  if (a.blaze) s.burn += a.blaze;
  if (a.storm) s.chain += a.storm;
  if (a.sunder) s.pierce = Math.min(0.8, a.sunder / 100);
  if (a.gilded) s.goldMul += a.gilded / 100;
  if (a.bounty) s.lootMul += a.bounty / 100;
  if (a.arcane) s.bonusMagic += a.arcane;
  return s;
}

/** Why a gem can't be set into a tower that holds `set` (null if it can). */
export function gemBlocker(set: readonly GemId[], id: GemId): string | null {
  const p = PLANS[id] as GemPlan;
  if (set.includes(id)) return 'Already set in this tower — upgrade it instead';
  const same = set.find((g) => (PLANS[g] as GemPlan).color === p.color);
  if (same) return `Its ${GEM_COLORS[p.color].name.toLowerCase()} window holds the ${PLANS[same].name}`;
  if (p.element) {
    const other = set.find((g) => (PLANS[g] as GemPlan).element);
    if (other) return `It already holds an element (${PLANS[other].name})`;
  }
  return null;
}
