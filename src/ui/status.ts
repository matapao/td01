/**
 * Status markers: small glyph tiles on a frame's name line for what is on that creature (or on you)
 * right now — stunned, frozen, burning, warded… — as MMO frames show buffs and debuffs. Hovering one
 * says what it is (markTip, through the frame's tooltip).
 */
import { DEVICE, ENEMIES, STATUS } from '../game/content.ts';
import type { Enemy, Hero } from '../game/types.ts';
import { STATUS_GLYPH, glyph, type StatusId } from './glyphs.ts';

interface Mark {
  id: StatusId;
  /** Stacks (chill). */
  n?: number | undefined;
  /** A number to name in the description (burn per second, ward left). */
  v?: number | undefined;
}

/** debuff: something done to it (red); buff: a help (green); trait: what it is (gold). */
const INFO: Record<StatusId, { name: string; tone: 'debuff' | 'buff' | 'trait'; text: (m: Mark) => string }> =
  {
    stun: { name: 'Stunned', tone: 'debuff', text: () => 'It can neither move nor strike.' },
    frozen: {
      name: 'Frozen',
      tone: 'debuff',
      text: () => 'Frozen solid where it stands. An Impact blow shatters it for extra damage.',
    },
    brittle: {
      name: 'Brittle',
      tone: 'debuff',
      text: () => `Fresh from the ice: the next Impact blow shatters it (×${STATUS.shatterBonus} damage).`,
    },
    chill: {
      name: 'Chilled',
      tone: 'debuff',
      text: (m) =>
        `Slowed by frost — ${m.n ?? 1} of ${STATUS.chillToFreeze} chills; at ${STATUS.chillToFreeze} it freezes.`,
    },
    slow: { name: 'Slowed', tone: 'debuff', text: () => 'It moves slower for a while.' },
    burn: {
      name: 'Burning',
      tone: 'debuff',
      text: (m) => `Takes ${Math.round(m.v ?? 0)} fire damage a second while it burns.`,
    },
    spotted: {
      name: 'In the searchlight',
      tone: 'debuff',
      text: () => `Caught in a beam: it takes ${Math.round(DEVICE.searchBonus * 100)}% more damage.`,
    },
    taunt: {
      name: 'Taunted',
      tone: 'debuff',
      text: () => 'It comes for the hero who taunted it, whatever else is near.',
    },
    shield: {
      name: 'Bone ward',
      tone: 'buff',
      text: (m) => `A ward of bone soaks up the next ${Math.ceil(m.v ?? 0)} damage.`,
    },
    enraged: {
      name: 'Enraged',
      tone: 'buff',
      text: () => 'Wounded and furious: it hits harder and moves faster.',
    },
    burrowed: {
      name: 'Burrowed',
      tone: 'trait',
      text: () => "Underground: nothing can hit it until it surfaces — unless a Seer's Emerald spots it.",
    },
    flying: {
      name: 'Flying',
      tone: 'trait',
      text: () => 'In the air: only towers that hit air can reach it.',
    },
    wall: { name: 'Shield Wall', tone: 'buff', text: () => 'Shield raised: you take 60% less damage.' },
  };

/** What is on one of the dead right now (most pressing first). */
export function enemyMarks(e: Enemy): Mark[] {
  const m: Mark[] = [];
  if (e.frozenT > 0) m.push({ id: 'frozen' });
  else if (e.stunT > 0) m.push({ id: 'stun' });
  if (e.brittleT > 0 && e.frozenT <= 0) m.push({ id: 'brittle' });
  if (e.chill > 0 && e.chillT > 0) m.push({ id: 'chill', n: e.chill });
  else if (e.slowT > 0 && e.slowMul < 0.999) m.push({ id: 'slow' });
  if (e.burnT > 0) m.push({ id: 'burn', v: e.burnDps });
  if ((e.spotT ?? 0) > 0) m.push({ id: 'spotted' });
  if (e.tauntT > 0) m.push({ id: 'taunt' });
  if (e.shield > 0) m.push({ id: 'shield', v: e.shield });
  if (e.enraged) m.push({ id: 'enraged' });
  if (e.burrowed) m.push({ id: 'burrowed' });
  if (e.flying || ENEMIES[e.kind].flying) m.push({ id: 'flying' });
  return m;
}

/** What is on your hero. */
export function heroMarks(h: Hero): Mark[] {
  return h.wallT > 0 ? [{ id: 'wall' }] : [];
}

/** At most this many show (the most pressing first), so the name beside them stays readable. */
const MAX_MARKS = 5;

/** The markers as HTML (stable while nothing changes, so setHtml leaves them be). */
export function marksHtml(marks: Mark[]): string {
  if (!marks.length) return '';
  return `<span class="marks">${marks
    .slice(0, MAX_MARKS)
    .map(
      (m) =>
        `<span class="mark ${INFO[m.id].tone}" data-st="${m.id}"${m.n ? ` data-n="${m.n}"` : ''}${m.v ? ` data-v="${Math.ceil(m.v)}"` : ''}>${glyph(STATUS_GLYPH[m.id])}${m.n && m.n > 1 ? `<i>${m.n}</i>` : ''}</span>`,
    )
    .join('')}</span>`;
}

/** The tooltip for the marker under the mouse in `root`, or '' (then the frame's own, if any). */
export function markTip(root: HTMLElement): string {
  const el = root.querySelector<HTMLElement>('.mark:hover');
  const id = el?.dataset['st'] as StatusId | undefined;
  if (!el || !id || !INFO[id]) return '';
  const m: Mark = {
    id,
    n: Number(el.dataset['n'] ?? 0) || undefined,
    v: Number(el.dataset['v'] ?? 0) || undefined,
  };
  const info = INFO[id];
  return `<div class="tt-title">${glyph(STATUS_GLYPH[id], `mark-tt ${info.tone}`)} ${info.name}</div><div class="tt-line">${info.text(m)}</div>`;
}
