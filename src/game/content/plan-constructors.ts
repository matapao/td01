/** Typed constructors used only while authoring the plan catalogue. */
import type {
  ActionKind,
  Step,
  BasePlanId,
  BuildingKind,
  Discipline,
  Parts,
  BasePlan,
  PayloadPlan,
  DeviceId,
  DevicePlan,
  TopId,
  TopPlan,
  GemId,
  GemColor,
  GemMods,
  DamageType,
  GemPlan,
} from '../content-types.ts';
import type { PayloadId } from '../space-types.ts';
import { GEM_COLORS, TOWER_TOPS } from './tower-data.ts';

export function workStep(action: ActionKind, label: string, work: number): Step {
  return { action, label, work };
}

export function building(
  id: BasePlanId,
  b: BuildingKind,
  discipline: Discipline,
  name: string,
  parts: Parts,
  steps: Step[],
  learnTime: number,
  learnGold: number,
  blurb: string,
): BasePlan {
  return {
    id,
    type: 'building',
    building: b,
    discipline,
    name,
    parts,
    steps,
    learnTime,
    learnGold,
    blurb,
  };
}

export function payload(
  id: PayloadId,
  name: string,
  parts: Parts,
  steps: Step[],
  learnTime: number,
  learnGold: number,
  blurb: string,
): PayloadPlan {
  return {
    id,
    type: 'payload',
    discipline: 'smithing',
    name,
    parts,
    steps,
    learnTime,
    learnGold,
    blurb,
  };
}

export function device(
  id: DeviceId,
  discipline: Discipline,
  name: string,
  watts: number,
  parts: Parts,
  steps: Step[],
  learnTime: number,
  learnGold: number,
  blurb: string,
): DevicePlan {
  return {
    id,
    type: 'device',
    discipline,
    name,
    watts,
    parts,
    steps,
    learnTime,
    learnGold,
    blurb,
  };
}

export function top(
  id: TopId,
  level: 2 | 3,
  name: string,
  parts: Parts,
  steps: Step[],
  learnTime: number,
  learnGold: number,
): TopPlan {
  return {
    id,
    type: 'top',
    level,
    discipline: 'carpentry',
    name,
    parts,
    steps,
    learnTime,
    learnGold,
    blurb: TOWER_TOPS[level].blurb,
  };
}

/** A gem variant: one raw gem of its colour plus `parts`, melted (and worked) into shape in the socket. */
export function gem(
  id: GemId,
  color: GemColor,
  discipline: Discipline,
  name: string,
  parts: Parts,
  steps: Step[],
  mods: GemMods,
  blurb: string,
  o: { element?: DamageType; learn?: [number, number] } = {},
): GemPlan {
  return {
    id,
    type: 'gem',
    color,
    discipline,
    name,
    parts: { [color]: 1, ...parts } as Parts,
    mods,
    blurb,
    ...(o.element !== undefined ? { element: o.element } : {}),
    steps: [workStep('smelt', `Melt the ${GEM_COLORS[color].name.toLowerCase()} into shape`, 110), ...steps],
    learnTime: o.learn?.[0] ?? 8,
    learnGold: o.learn?.[1] ?? 50,
  };
}
