/** Runtime contract for untrusted commands. Adding a Command requires adding its schema here. */
import { ABILITIES, CLASSES, ITEMS, PLANS, STORES } from './content.ts';
import { MILESTONES } from './road.ts';
import { GRID_H, GRID_W } from './map.ts';
import type { Command } from './types.ts';

type Rule = { test(value: unknown): boolean; optional?: boolean };
type Schema = Record<string, Rule>;
const number = (min: number, max: number, integer = false): Rule => ({
  test: (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)),
});
const id = number(1, 0x7fffffff, true),
  coordinate = number(-1_000_000, 1_000_000),
  angle = number(-10_000, 10_000);
const boolean: Rule = { test: (v) => typeof v === 'boolean' };
const member = (object: object): Rule => ({ test: (v) => typeof v === 'string' && Object.hasOwn(object, v) });
const choice = (...values: unknown[]): Rule => ({ test: (v) => values.includes(v) });
const optional = (rule: Rule): Rule => ({ ...rule, optional: true });
const plan = member(PLANS),
  store = member(STORES),
  item = member(ITEMS);
const planKind = (kind: string): Rule => ({
  test: (v) => plan.test(v) && PLANS[v as keyof typeof PLANS].type === kind,
});
const hero = (fields: Schema = {}): Schema => ({ hero: id, ...fields });
const quality = choice(0, 1, 2),
  count = number(1, 10_000, true),
  cx = number(0, GRID_W - 1, true),
  cz = number(0, GRID_H - 1, true);

export const COMMAND_SCHEMAS = {
  move: hero({ x: coordinate, z: coordinate }),
  queueTower: hero(),
  hammerTower: hero({ crate: id }),
  shipTower: hero({ crate: id, cx, cz }),
  mount: hero(),
  steer: hero({ mx: number(-1, 1), mz: number(-1, 1), look: angle }),
  pose: hero({
    x: coordinate,
    z: coordinate,
    facing: angle,
    look: angle,
    gait: choice('idle', 'fwd', 'back', 'left', 'right'),
    moving: boolean,
  }),
  buyout: hero({ site: id }),
  ride: hero({ wagon: id }),
  dig: hero({ x: coordinate, z: coordinate }),
  blast: hero({ x: optional(coordinate), y: optional(coordinate), z: optional(coordinate) }),
  prepareBlast: hero({ step: choice(1, 2, 3) }),
  makeCharges: hero(),
  attack: hero({ target: id }),
  interact: hero({ target: id }),
  stop: hero({ peace: optional(boolean) }),
  excavate: hero({
    x: coordinate,
    y: coordinate,
    z: coordinate,
    tool: choice('pickaxe', 'shovel'),
    wide: optional(boolean),
  }),
  plant: hero({ x: coordinate, z: coordinate }),
  cast: hero({
    ability: member(ABILITIES),
    target: optional(id),
    x: optional(coordinate),
    z: optional(coordinate),
  }),
  chooseClass: hero({ cls: member(CLASSES) }),
  droneMove: hero({ x: coordinate, z: coordinate }),
  beat: hero({ quality }),
  place: hero({ plan: planKind('building'), cx, cz, rot: optional(angle), buy: optional(boolean) }),
  invent: hero({ milestone: member(MILESTONES), quality }),
  upgradeBuilding: hero({ building: id, plan: planKind('upgrade') }),
  stackPayload: hero({ building: id, payload: planKind('payload') }),
  launch: hero({ building: id, board: boolean }),
  launchHome: hero({ board: boolean }),
  placeDevice: hero({ building: id, plan: planKind('device') }),
  removeDevice: hero({ building: id, device: planKind('device') }),
  upgradeTop: hero({ building: id }),
  turnSite: { site: id, rot: angle },
  placeGem: hero({ building: id, plan: planKind('gem') }),
  removeGem: hero({ building: id, gem: planKind('gem') }),
  upgradeGem: hero({ building: id, gem: planKind('gem') }),
  cancelSite: { site: id },
  demolish: { building: id },
  mode: { building: id, mode: choice('first', 'last', 'strong', 'close') },
  rally: { building: id, x: coordinate, z: coordinate },
  study: hero({ plan }),
  buy: hero({ store, item: optional(item), scroll: optional(plan), count: optional(count) }),
  buyCrafterKit: hero({ store }),
  buyTorch: hero({ store }),
  toggleTorch: hero(),
  sell: hero({ store, item, count }),
  deposit: hero(),
  withdraw: hero({ item, count }),
  dropItem: hero({ item, count }),
  socket: hero({ site: id, uid: id }),
  buyGear: hero({ store, uid: id }),
  buyCrate: hero({ store }),
  sellGear: hero({ store, uid: id }),
  dropGear: hero({ uid: id }),
  depositGear: hero({ uid: id }),
  withdrawGear: hero({ uid: id }),
  callWave: {},
  devMode: { on: boolean },
  devWaves: { on: boolean },
  setTime: { tod: number(0, 1), hold: boolean },
  leave: hero(),
  reforge: hero({ building: id }),
  gate: hero({ shut: boolean }),
} satisfies Record<Command['t'], Schema>;

/** Reject rather than coerce; prototypes, extra keys, missing fields and partial points are invalid. */
export function parseCommand(value: unknown): Command | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  // Validate the same own fields we return; inherited fields are never decoded.
  const v: Record<string, unknown> = { ...value };
  if (typeof v['t'] !== 'string' || !Object.hasOwn(COMMAND_SCHEMAS, v['t'])) return null;
  const schema: Schema = COMMAND_SCHEMAS[v['t'] as Command['t']];
  for (const key of Object.keys(v)) if (key !== 't' && !Object.hasOwn(schema, key)) return null;
  for (const [key, rule] of Object.entries(schema)) {
    if (v[key] === undefined && rule.optional) delete v[key];
    else if (!rule.test(v[key])) return null;
  }
  if (v['t'] === 'blast' && [v['x'], v['y'], v['z']].filter((p) => p !== undefined).length % 3 !== 0)
    return null;
  if (v['t'] === 'cast' && (v['x'] === undefined) !== (v['z'] === undefined)) return null;
  if (v['t'] === 'buy' && (v['item'] === undefined) === (v['scroll'] === undefined)) return null;
  return v as Command;
}
