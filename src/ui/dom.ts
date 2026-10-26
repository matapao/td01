/** Tiny DOM helpers. */
import { ABILITY_ORDER, type AbilityId } from '../game/content.ts';
import { abilityIcon, interactIcon } from './glyphs.ts';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Sets text only when it changed (avoids layout thrash). */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function setHtml(e: HTMLElement, html: string): void {
  if ((e as HTMLElement & { _h?: string })._h !== html) {
    (e as HTMLElement & { _h?: string })._h = html;
    e.innerHTML = html;
  }
}

export function pct(v: number): string {
  return `${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%`;
}

export const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const COIN_SVG =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e9b93a" stroke="#7a5410" stroke-width="2"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff1b0" stroke-width="1.5" opacity=".7"/><path d="M12 7v10M9.5 9.5h4a1.6 1.6 0 010 3.2h-3a1.6 1.6 0 000 3.2h4" stroke="#7a5410" stroke-width="1.6" fill="none"/></svg>';
export const HEART_SVG =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.8-8 11-8 11z" fill="#d8402e" stroke="#5a1208" stroke-width="1.6"/><path d="M7.5 8.5a2.4 2.4 0 012.6-1.4" stroke="#ffb0a0" stroke-width="1.4" fill="none"/></svg>';
export const SKULL_SVG =
  '<svg viewBox="0 0 24 24"><path d="M12 3a8 8 0 00-8 8c0 3 1.6 5 3.5 6v3h9v-3c1.9-1 3.5-3 3.5-6a8 8 0 00-8-8z" fill="#e8e0c8" stroke="#5a5040" stroke-width="1.4"/><circle cx="9" cy="11" r="2.2" fill="#2a2018"/><circle cx="15" cy="11" r="2.2" fill="#2a2018"/><path d="M10 20v-2M12 20v-2M14 20v-2" stroke="#5a5040" stroke-width="1.2"/></svg>';

/**
 * The skills' icons: game-icons.net glyphs in the HUD's gold, each on its own lit ground (see
 * glyphs.ts; the authors are in the credits).
 */
export const ABILITY_SVG = Object.fromEntries(ABILITY_ORDER.map((id) => [id, abilityIcon(id)])) as Record<
  AbilityId,
  string
>;

/** The F slot's icon (interact: gather, deliver, build), in the same style. */
export const INTERACT_SVG = interactIcon();

/** Hand-tool icons (inline SVG). */
export const TOOL_SVG = {
  torch:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><path d="M26 55l8-30" stroke="#94603a" stroke-width="8"/><path d="M26 33l14 3m-12-9l14 3" stroke="#dac299" stroke-width="4"/><path d="M35 32C12 24 35 13 33 4c18 13 21 24 2 28z" fill="#eb6b26"/><path d="M35 29c-9-4-1-11 2-16 7 8 8 13-2 16z" fill="#ffe49a"/></svg>',
  scanner:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><rect x="12" y="9" width="40" height="46" rx="6" fill="#807556"/><rect x="17" y="15" width="30" height="29" rx="3" fill="#263d31"/><circle cx="32" cy="29" r="10" fill="none" stroke="#b3c992" stroke-width="2"/><path d="M32 29l8-8" stroke="#d3e1a8" stroke-width="2"/><circle cx="28" cy="25" r="2" fill="#e3c36c"/><circle cx="32" cy="49" r="3" fill="#d3bc7e"/></svg>',
  seedPouch:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><path d="M22 12h20l-4 12c18 20 12 31-6 31S8 44 26 24z" fill="#aa8050" stroke="#604b2e" stroke-width="2"/><path d="M23 24h18" stroke="#e0c586" stroke-width="3"/><path d="M32 45V31m0 7c-10 0-10-8-10-8 8 0 10 4 10 8zm0-1c10 0 10-9 10-9-8 0-10 5-10 9z" fill="#76a56b" stroke="#34583a" stroke-width="2"/></svg>',

  axe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><path d="M18 52L44 14" stroke="#8a5a2e" stroke-width="6" stroke-linecap="round"/><path d="M38 10c10 2 16 10 14 20l-14-6z" fill="#cfd6dc" stroke="#5e666e" stroke-width="2"/></svg>',
  pickaxe:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><path d="M20 54L42 18" stroke="#8a5a2e" stroke-width="6" stroke-linecap="round"/><path d="M14 22c10-12 28-14 40-4c-12-2-26 0-40 4z" fill="#b8c0c8" stroke="#5e666e" stroke-width="2"/></svg>',
  hammer:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><path d="M24 54L40 24" stroke="#8a5a2e" stroke-width="6" stroke-linecap="round"/><rect x="26" y="10" width="26" height="14" rx="3" transform="rotate(28 39 17)" fill="#9aa4ae" stroke="#4e565e" stroke-width="2"/></svg>',
  shovel:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#2a2016"/><path d="M22 14L38 40" stroke="#8a5a2e" stroke-width="5" stroke-linecap="round"/><path d="M34 36l12 6-4 14c-6 2-12-2-14-8z" fill="#aeb6be" stroke="#4e565e" stroke-width="2"/><path d="M16 10h12" stroke="#8a5a2e" stroke-width="5" stroke-linecap="round"/></svg>',
};

export const toolIcon = (id: keyof typeof TOOL_SVG): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(TOOL_SVG[id])}`;
