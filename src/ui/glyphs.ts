/**
 * Glyphs from game-icons.net (CC BY 3.0 — Lorc, Delapouite, Carl Olsen, Sbed, Skoll; Zeromancer's are
 * CC0), credited in the Menu (Esc → Credits) and docs/CREDITS.md. Only the icons named here ship:
 * scripts/icons/build-glyphs.mjs copies their path data into glyph-data.ts.
 *
 * They are recoloured by CSS: in HTML a glyph is `<svg class="gi"><use href="#…"></svg>`, filled with
 * currentColor (or the HUD's gold, `.gi.gold`), its shapes in one hidden sprite added to the page
 * once; on a canvas it is a Path2D (drawGlyph).
 */
import type { AbilityId, ArmorClass, DamageType, WaveAffix } from '../game/content.ts';
import type { AgeId, BranchId, MinigameKind } from '../game/road.ts';
import { ICON_AUTHORS, ICON_PATHS, type IconId } from './glyph-data.ts';

export type { IconId };

/** The skills on the action bar (and the class cards). */
export const ABILITY_GLYPH: Record<AbilityId, IconId> = {
  slam: 'delapouite/shield-bash',
  cry: 'lorc/shouting',
  wall: 'lorc/shield-echoes',
  mend: 'delapouite/healing',
  rally: 'lorc/rally-the-troops',
  repulse: 'lorc/quake-stomp',
  drone: 'delapouite/delivery-drone',
  fireball: 'lorc/fire-ray',
  nova: 'lorc/frozen-orb',
  meteor: 'lorc/meteor-impact',
};

/** The F slot beside them. */
export const INTERACT_GLYPH: IconId = 'lorc/grab';

export const DAMAGE_GLYPH: Record<DamageType, IconId> = {
  pierce: 'lorc/arrowhead',
  impact: 'lorc/hammer-drop',
  slash: 'delapouite/axe-sword',
  fire: 'carl-olsen/flame',
  frost: 'lorc/snowflake-2',
  lightning: 'sbed/electric',
  arcane: 'lorc/magic-swirl',
};

export const ARMOR_GLYPH: Record<ArmorClass, IconId> = {
  bone: 'lorc/crossed-bones',
  plate: 'delapouite/chest-armor',
  spectral: 'lorc/ghost',
  warded: 'lorc/magic-shield',
  colossal: 'delapouite/rock-golem',
  flesh: 'delapouite/shambling-zombie',
};

/** What can be on a creature (or on you) right now: the status markers under the frames. */
export type StatusId =
  | 'stun'
  | 'frozen'
  | 'brittle'
  | 'chill'
  | 'slow'
  | 'burn'
  | 'shield'
  | 'enraged'
  | 'taunt'
  | 'spotted'
  | 'burrowed'
  | 'flying'
  | 'wall';

export const STATUS_GLYPH: Record<StatusId, IconId> = {
  stun: 'skoll/knockout',
  frozen: 'lorc/frozen-block',
  brittle: 'lorc/cracked-glass',
  chill: 'lorc/snowflake-2',
  slow: 'lorc/snail',
  burn: 'lorc/burning-dot',
  shield: 'lorc/skull-shield',
  enraged: 'delapouite/enrage',
  taunt: 'delapouite/human-target',
  spotted: 'delapouite/eye-target',
  burrowed: 'delapouite/dig-hole',
  flying: 'lorc/bat-wing',
  wall: 'lorc/shield-echoes',
};

export const AFFIX_GLYPH: Record<WaveAffix, IconId> = {
  swift: 'lorc/sprint',
  bolstering: 'lorc/muscle-up',
  shielded: 'lorc/skull-shield',
  frenzied: 'lorc/sharped-teeth-skull',
  regenerating: 'zeromancer/heart-plus',
};

/** The Road of Invention: its ages, branches and the kinds of minigame. */
export const AGE_GLYPH: Record<AgeId, IconId> = {
  fire: 'lorc/campfire',
  metal: 'lorc/anvil',
  machine: 'delapouite/windmill',
  steam: 'delapouite/steam-locomotive',
  electric: 'lorc/light-bulb',
  signal: 'delapouite/radio-tower',
  electronic: 'lorc/processor',
  automated: 'lorc/mechanical-arm',
  space: 'lorc/rocket',
};

export const BRANCH_GLYPH: Record<BranchId, IconId> = {
  energy: 'lorc/power-lightning',
  materials: 'lorc/metal-bar',
  making: 'lorc/gear-hammer',
  moving: 'lorc/cartwheel',
  messages: 'lorc/envelope',
  thinking: 'lorc/brain',
  automation: 'lorc/cog',
  space: 'lorc/ringed-planet',
};

export const KIND_GLYPH: Record<MinigameKind, IconId> = {
  band: 'delapouite/speedometer',
  ratio: 'lorc/scales',
  sizes: 'lorc/gears',
  path: 'delapouite/path-distance',
  beat: 'delapouite/metronome',
  steady: 'lorc/pointing',
  separate: 'delapouite/funnel',
  order: 'delapouite/stack',
  decide: 'delapouite/choice',
  sweet: 'delapouite/round-knob',
  observe: 'lorc/magnifying-glass',
  encode: 'delapouite/encrypted-channel',
};

/** Minimap markers. */
export const MAP_GLYPH = {
  crypt: 'lorc/tombstone',
  shop: 'delapouite/shop',
  mine: 'delapouite/mine-wagon',
  camp: 'delapouite/camping-tent',
  chest: 'delapouite/chest',
  tower: 'lorc/white-tower',
  keep: 'delapouite/castle',
} as const satisfies Record<string, IconId>;

/** The icon tiles' grounds (a lit centre fading to the dark): the gold glyph sits on them. */
const GROUNDS: Record<AbilityId | 'interact', [string, string]> = {
  interact: ['#3c5a30', '#0e170b'],
  slam: ['#41588a', '#0c1220'],
  cry: ['#7c3620', '#1c0b06'],
  wall: ['#2f5280', '#0a1220'],
  mend: ['#2e7c4a', '#0a1e12'],
  rally: ['#8a5e1e', '#1e1306'],
  repulse: ['#6c4c28', '#1a1008'],
  drone: ['#2c5c70', '#08161c'],
  fireball: ['#9c3814', '#200a04'],
  nova: ['#2e6c90', '#081620'],
  meteor: ['#7c3012', '#1a0804'],
};

const symbolId = (id: IconId) => `gi-${id.replace('/', '--')}`;

let sprite: SVGSVGElement | null = null;

/** Adds the hidden sprite (every glyph's shape, the gold, the skills' backgrounds) to the page, once. */
export function ensureGlyphSprite(): void {
  if (sprite || typeof document === 'undefined') return;
  const host = document.body ?? document.documentElement;
  const NS = 'http://www.w3.org/2000/svg';
  sprite = document.createElementNS(NS, 'svg');
  sprite.setAttribute('aria-hidden', 'true');
  sprite.id = 'gi-sprite';
  // Not display:none — gradients inside a hidden <svg> don't paint in every browser.
  sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const bgs = (Object.keys(GROUNDS) as (keyof typeof GROUNDS)[])
    .map(
      (a) =>
        `<radialGradient id="gi-bg-${a}" cx="50%" cy="38%" r="72%"><stop offset="0" stop-color="${GROUNDS[a][0]}"/><stop offset="1" stop-color="${GROUNDS[a][1]}"/></radialGradient>`,
    )
    .join('');
  const symbols = (Object.keys(ICON_PATHS) as IconId[])
    .map((id) => `<symbol id="${symbolId(id)}" viewBox="0 0 512 512"><path d="${ICON_PATHS[id]}"/></symbol>`)
    .join('');
  sprite.innerHTML = `<defs><linearGradient id="gi-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c8"/><stop offset=".55" stop-color="#e9c46a"/><stop offset="1" stop-color="#a57b2a"/></linearGradient>${bgs}</defs>${symbols}`;
  host.prepend(sprite);
}

/** A glyph for HTML: an inline <svg> 1em square, filled with currentColor (add 'gold' for the HUD's gold). */
export function glyph(id: IconId, cls = ''): string {
  ensureGlyphSprite();
  return `<svg class="gi${cls ? ` ${cls}` : ''}" viewBox="0 0 512 512" aria-hidden="true"><use href="#${symbolId(id)}"/></svg>`;
}

/**
 * A 64 × 64 icon tile (it scales to its box): the gold glyph, shadowed, on `ground` (a fill — a
 * colour or one of the sprite's grounds, `url(#gi-bg-…)`).
 */
export function glyphTile(id: IconId, ground: string): string {
  ensureGlyphSprite();
  const s = symbolId(id);
  return `<svg class="icon-tile" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="${ground}"/><rect x="1" y="1" width="62" height="62" fill="none" stroke="rgba(255,230,170,0.14)" stroke-width="2"/><use href="#${s}" x="8" y="8" width="48" height="48" fill="#000" opacity="0.55" transform="translate(1.4 1.8)"/><use href="#${s}" x="8" y="8" width="48" height="48" class="gi-fg"/></svg>`;
}

/** A skill's icon: its glyph on its own lit ground. */
export const abilityIcon = (id: AbilityId): string => glyphTile(ABILITY_GLYPH[id], `url(#gi-bg-${id})`);

/** The F slot's icon (interact: gather, deliver, build). */
export const interactIcon = (): string => glyphTile(INTERACT_GLYPH, 'url(#gi-bg-interact)');

const paths = new Map<IconId, Path2D>();

/** A glyph's shape for a canvas (its 512 × 512 design square). */
export function glyphPath(id: IconId): Path2D {
  let p = paths.get(id);
  if (!p) {
    p = new Path2D(ICON_PATHS[id]);
    paths.set(id, p);
  }
  return p;
}

const stamps = new Map<string, HTMLCanvasElement>();

/**
 * Draws a glyph `size` px square centred on (x, y): filled with `fill`, with a `halo` (px) of `outline`
 * round it so it reads on any ground. Each look is painted once, at `res`× (the canvas's own scale),
 * into a small stamp that is then just copied — the minimap draws dozens every frame.
 */
export function drawGlyph(
  g: CanvasRenderingContext2D,
  id: IconId,
  x: number,
  y: number,
  size: number,
  fill: string,
  outline = 'rgba(0,0,0,0.85)',
  halo = 1.4,
  res = 2,
): void {
  const pad = Math.ceil(halo) + 1;
  const box = size + pad * 2;
  const key = `${id}|${size}|${fill}|${outline}|${halo}|${res}`;
  let s = stamps.get(key);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(box * res);
    const c = s.getContext('2d')!;
    const k = size / 512;
    c.scale(res, res);
    c.translate(pad, pad);
    c.scale(k, k);
    const p = glyphPath(id);
    if (halo > 0) {
      c.lineJoin = 'round';
      c.lineWidth = (halo * 2) / k;
      c.strokeStyle = outline;
      c.stroke(p);
    }
    c.fillStyle = fill;
    c.fill(p);
    stamps.set(key, s);
  }
  g.drawImage(s, x - box / 2, y - box / 2, s.width / res, s.height / res);
}

/** Every glyph the game shows, by author (for the credits): name, link, licence and the icons. */
export function glyphCredits(): { author: string; url?: string; licence: string; icons: string[] }[] {
  const used = new Set<IconId>([
    ...Object.values(ABILITY_GLYPH),
    INTERACT_GLYPH,
    ...Object.values(DAMAGE_GLYPH),
    ...Object.values(ARMOR_GLYPH),
    ...Object.values(STATUS_GLYPH),
    ...Object.values(AFFIX_GLYPH),
    ...Object.values(AGE_GLYPH),
    ...Object.values(BRANCH_GLYPH),
    ...Object.values(KIND_GLYPH),
    ...Object.values(MAP_GLYPH),
  ]);
  const by = new Map<string, string[]>();
  for (const id of [...used].sort()) {
    const [who, name] = id.split('/');
    if (!who || !name) throw new Error(`Invalid icon attribution: ${id}`);
    by.set(who, [...(by.get(who) ?? []), name]);
  }
  return [...by].map(([who, icons]) => ({
    author: ICON_AUTHORS[who]?.name ?? who,
    ...(ICON_AUTHORS[who]?.url !== undefined ? { url: ICON_AUTHORS[who].url } : {}),
    licence: ICON_AUTHORS[who]?.licence ?? 'CC BY 3.0',
    icons,
  }));
}
