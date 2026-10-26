export type { PayloadId, PayloadDef, Cargo } from './space-types.ts';
import type { PayloadId, PayloadDef } from './space-types.ts';
/**
 * Space: where the road leads last — out past the sky, where it is always dark and the stars are
 * everywhere. The base stands on a small rocky body drifting among others: grey dust and boulders,
 * craters, no air at all. Its deposits hold what Earth lacks — nickel-iron, water ice in the
 * shadowed crater, rare earths.
 *
 * Everything goes the way real missions go, simplified: stacked on a rocket at the Port in the vale,
 * launched while the window is open, a long cruise, then — with no air to slow it — a braking burn
 * and a powered descent on its rockets to land on its legs. What lands becomes part of the base. The
 * base mines; the ice, split, gives oxygen and hydrogen — breath for a crew and fuel for the way
 * home; an ascent vehicle lifts the minerals off, and the capsule that brings them home burns into
 * the vale's air behind its heat shield and comes down under a parachute by the keep. The freedom we
 * take: it all works, and we run it ourselves — the hero rides along once there is a habitat.
 *
 * Plain data and geometry, shared by the simulation and the view.
 */
import type { NodeKind } from './content.ts';

/** Space lies far south of the vale: a round body `half` m across from its middle (walkable), past `region` in z. */
export const SPACE = { x: 0, z: -5000, half: 90, region: -3000 };
export const inSpace = (z: number): boolean => z < SPACE.region;

/** Seconds of game time for each part of a flight (the real months, compressed); `edl`: the last of it, down to the ground. */
export const FLIGHT = { ascent: 14, cruise: 45, edl: 8 };

/** The launch window: the planets line up every `every` s; it stays open for `open` s. */
export const WINDOW = { every: 300, open: 120, first: 60 };

/** Is the window open at game time `t`? And when does it next open (s)? */
export function launchWindow(t: number): { open: boolean; opensIn: number; closesIn: number } {
  const k = t - WINDOW.first;
  if (k < 0) return { open: false, opensIn: -k, closesIn: 0 };
  const into = k % WINDOW.every;
  return into < WINDOW.open
    ? { open: true, opensIn: 0, closesIn: WINDOW.open - into }
    : { open: false, opensIn: WINDOW.every - into, closesIn: 0 };
}

/** Each payload: where it stands at the base, and what it does there. All land on their legs under braking rockets. */
export const PAYLOADS: Record<PayloadId, PayloadDef> = {
  lander: {
    id: 'lander',
    slot: { x: 0, z: 0 },
    half: 1.4,
    does: 'The first lander: a radio, solar panels and a beacon — it marks the site for everything after.',
  },
  solarfarm: {
    id: 'solarfarm',
    slot: { x: -9, z: 3 },
    half: 3.2,
    does: 'Solar panels that unfold on the ground: power for the base.',
  },
  habitat: {
    id: 'habitat',
    slot: { x: 7, z: -4 },
    half: 2.4,
    does: 'A pressurised home: crews can land here and stay.',
  },
  crew: {
    id: 'crew',
    slot: { x: 12, z: 4 },
    half: 2.0,
    does: 'A crewed capsule: the hero rides it to the habitat.',
  },
  rover: {
    id: 'rover',
    slot: { x: -4, z: -8 },
    half: 1.2,
    does: 'A rover: it drives to the deposits on its own and brings back what it digs.',
  },
  drill: {
    id: 'drill',
    slot: { x: -12, z: -9 },
    half: 2.0,
    does: 'A drill rig on the rare-earth vein: it brings up rare earths.',
  },
  oxygen: {
    id: 'oxygen',
    slot: { x: 3, z: 10 },
    half: 1.6,
    does: 'Splits water ice into oxygen and hydrogen — breath for a crew, fuel for the way home.',
  },
  ascent: {
    id: 'ascent',
    slot: { x: 14, z: -12 },
    half: 1.4,
    does: 'The ascent vehicle: fuelled from the ice, it lifts the minerals off for the ship that brings them home.',
  },
};

/** What the base makes, every `every` s, into its depot (while its module stands — and the solar farm feeds them). */
export const BASE_WORK = {
  rover: { every: 18, item: 'nickeliron' as const },
  drill: { every: 26, item: 'rareearth' as const },
  roverIce: { every: 30, item: 'ice' as const },
};

/** The deposits around the base: nickel-iron outcrops, ice in the shadowed crater, the rare-earth vein. */
export const SPACE_NODES: { kind: NodeKind; x: number; z: number; amount: number }[] = (() => {
  const out: { kind: NodeKind; x: number; z: number; amount: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 16 + rnd() * 34;
    out.push({ kind: 'metalrock', x: SPACE.x + Math.cos(a) * r, z: SPACE.z + Math.sin(a) * r, amount: 6 });
  }
  for (let i = 0; i < 6; i++)
    out.push({ kind: 'icefield', x: SPACE.x + 30 + rnd() * 10, z: SPACE.z - 26 + rnd() * 10, amount: 5 });
  for (let i = 0; i < 4; i++)
    out.push({ kind: 'raremound', x: SPACE.x - 22 + rnd() * 6, z: SPACE.z - 14 + rnd() * 6, amount: 4 });
  return out;
})();

/** Craters (centre, radius, depth) — the ground dips in them. */
const CRATERS: [number, number, number, number][] = [
  [SPACE.x + 34, SPACE.z - 22, 12, 2.2],
  [SPACE.x - 40, SPACE.z + 30, 9, 1.4],
  [SPACE.x + 50, SPACE.z + 40, 16, 2.6],
  [SPACE.x - 55, SPACE.z - 45, 11, 1.8],
];

/** The ground's height in Space: low dunes, and craters with raised rims; flat where the base stands. */
export function spaceHeight(x: number, z: number): number {
  const dx = x - SPACE.x;
  const dz = z - SPACE.z;
  let h = Math.sin(dx * 0.07) * Math.cos(dz * 0.05) * 0.6 + Math.sin((dx + dz) * 0.031) * 0.9;
  for (const [cx, cz, r, d] of CRATERS) {
    const q = Math.hypot(x - cx, z - cz) / r;
    if (q < 1) h -= d * (1 - q * q);
    else if (q < 1.35) h += d * 0.35 * Math.sin(((q - 1) / 0.35) * Math.PI);
  }
  // The landing site is levelled.
  const flat = Math.min(1, Math.max(0, (Math.hypot(dx, dz) - 18) / 10));
  return h * flat;
}

/** Can one stand at (x, z) in Space? On the body (short of its cliffs) and not in a module. */
export function spaceOpen(
  x: number,
  z: number,
  modules: readonly { kind: PayloadId; x: number; z: number }[],
  pad = 0.1,
): boolean {
  if (Math.hypot(x - SPACE.x, z - SPACE.z) > SPACE.half) return false;
  for (const m of modules) {
    const h = PAYLOADS[m.kind].half + pad;
    if (Math.abs(x - m.x) < h && Math.abs(z - m.z) < h) return false;
  }
  return true;
}

/** Where a payload stands at the base (world). */
export const slotOf = (id: PayloadId): { x: number; z: number } => ({
  x: SPACE.x + PAYLOADS[id].slot.x,
  z: SPACE.z + PAYLOADS[id].slot.z,
});

/** Where cargo and crews come home: a capsule's landing ground near the keep (offset from it, m). */
export const HOMECOMING = { dx: -14, dz: 10 };
