/** LAN ingress rules. This server is for a trusted LAN, not an authenticated public service. */
import { CLASSES } from '../src/game/content.ts';
import { parseCommand } from '../src/game/commands.ts';
import type { ClientMsg } from '../src/net/protocol.ts';

export const LAN_LIMITS = {
  messageBytes: 16_384,
  bufferedBytes: 2 * 1024 * 1024,
  sockets: 64,
  players: 16,
  messagesPerSecond: 90,
  burst: 150,
} as const;

export function allowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // Native clients have no browser Origin header.
  if (!host) return false;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && url.host === host && url.origin === origin;
  } catch {
    return false;
  }
}

export function parseClientMessage(data: string): ClientMsg | null {
  if (Buffer.byteLength(data) > LAN_LIMITS.messageBytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = (...allowed: string[]) => Object.keys(v).every((k) => k === 'type' || allowed.includes(k));
  switch (v['type']) {
    case 'join':
      return keys('name', 'token', 'cls') &&
        typeof v['name'] === 'string' &&
        v['name'].length <= 64 &&
        typeof v['token'] === 'string' &&
        v['token'].length <= 64 &&
        (v['cls'] === undefined || (typeof v['cls'] === 'string' && Object.hasOwn(CLASSES, v['cls'])))
        ? (v as unknown as ClientMsg)
        : null;
    case 'cmd': {
      if (!keys('cmd')) return null;
      const cmd = parseCommand(v['cmd']);
      return cmd ? { type: 'cmd', cmd } : null;
    }
    case 'speed':
      return keys('speed') &&
        typeof v['speed'] === 'number' &&
        Number.isFinite(v['speed']) &&
        v['speed'] >= 1 &&
        v['speed'] <= 3
        ? { type: 'speed', speed: v['speed'] }
        : null;
    case 'pause':
      return keys('on') && typeof v['on'] === 'boolean' ? { type: 'pause', on: v['on'] } : null;
    case 'load':
      return keys('code') && typeof v['code'] === 'string' && v['code'].length <= 16
        ? { type: 'load', code: v['code'] }
        : null;
    case 'ping':
      return keys('t') && typeof v['t'] === 'number' && Number.isFinite(v['t']) && v['t'] >= 0
        ? { type: 'ping', t: v['t'] }
        : null;
    case 'wave':
    case 'save':
    case 'newGame':
    case 'listSaves':
    case 'update':
      return keys() ? (v as unknown as ClientMsg) : null;
    default:
      return null;
  }
}

/** A small per-connection token bucket: poses remain smooth and message floods stay bounded. */
export class MessageBudget {
  private tokens: number = LAN_LIMITS.burst;
  private at: number;
  constructor(now = performance.now()) {
    this.at = now;
  }
  take(now = performance.now()): boolean {
    this.tokens = Math.min(
      LAN_LIMITS.burst,
      this.tokens + (Math.max(0, now - this.at) / 1000) * LAN_LIMITS.messagesPerSecond,
    );
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
