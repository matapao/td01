/**
 * The browser side of a LAN game, the same way the fps game does it: one WebSocket to /ws, a token
 * per browser tab (sessionStorage) so a reload or an update brings your hero back, and when the
 * connection drops the page waits for the server and reloads itself to rejoin.
 */
import { CLASSES, type HeroClass } from '../game/content.ts';
import type { ClientMsg, ServerMsg } from './protocol.ts';

type Handlers = { [K in ServerMsg['type']]?: (m: Extract<ServerMsg, { type: K }>) => void };

export class LanClient {
  readonly socket: WebSocket;
  /** Identifies this browser tab, so after a reload or an update you get your hero back. */
  readonly token: string;
  /** Set when this tab reloaded itself to rejoin (the version it ran before). */
  readonly resumeFrom: string | null;
  version: string | null = null;
  updateReady = false;
  updating = false;
  joinSent = false;
  handlers: Handlers = {};
  onClose: () => void = () => {};
  private url: string;
  private ping: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.socket = new WebSocket(this.url);
    this.token = load('token', true) || randomToken();
    save('token', this.token, true);
    this.resumeFrom = load('resume', true);
    this.socket.addEventListener('message', (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      if (msg.type === 'hello') this.version = msg.version;
      if (msg.type === 'update') this.updateReady = msg.ready;
      if (msg.type === 'updating') this.updating = true;
      if (Object.hasOwn(this.handlers, msg.type))
        (this.handlers[msg.type] as ((m: ServerMsg) => void) | undefined)?.(msg);
    });
    this.socket.addEventListener('open', () => {
      for (const data of this.queue.splice(0)) this.socket.send(data);
      this.ping = setInterval(() => this.send({ type: 'ping', t: performance.now() }), 2000);
    });
    this.socket.addEventListener('close', () => {
      clearInterval(this.ping);
      this.onClose();
      this.reconnect();
    });
  }

  private queue: string[] = [];

  /** Sends now, or as soon as the connection opens (a quick click on Join mustn't get lost). */
  send(msg: ClientMsg): void {
    const data = JSON.stringify(msg);
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data);
    else if (this.socket.readyState === WebSocket.CONNECTING) this.queue.push(data);
  }

  join(name: string, cls?: HeroClass): void {
    if (this.joinSent) return;
    this.joinSent = true;
    save('name', name);
    if (cls) save('class', cls);
    this.send({ type: 'join', name, token: this.token, ...(cls !== undefined ? { cls } : {}) });
  }

  /** The class picked last time (for the join card). */
  get savedClass(): HeroClass | null {
    const value = load('class');
    return value && Object.hasOwn(CLASSES, value) ? (value as HeroClass) : null;
  }

  get savedName(): string {
    return load('name') || '';
  }

  requestUpdate(): void {
    if (this.updateReady && !this.updating) this.send({ type: 'update' });
  }

  /** Once the server is back (new code, or restarted), reload so this page runs the same version, and rejoin. */
  private reconnect(): void {
    const probe = new WebSocket(this.url);
    probe.addEventListener('open', () => {
      if (this.joinSent) save('resume', this.version ?? '', true);
      location.reload();
    });
    probe.addEventListener('error', () => setTimeout(() => this.reconnect(), 1000));
  }

  /** Called after a resumed page joined: forget the note. */
  resumed(): void {
    save('resume', null, true);
  }
}

// Settings live in localStorage; the tab's token and resume note in sessionStorage, which
// survives a reload but not closing the tab.
function load(key: string, session = false): string | null {
  try {
    return (session ? sessionStorage : localStorage).getItem(`browserdefense:${key}`);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null, session = false): void {
  try {
    const storage = session ? sessionStorage : localStorage;
    if (value === null) storage.removeItem(`browserdefense:${key}`);
    else storage.setItem(`browserdefense:${key}`, value);
  } catch {
    // Storage can be blocked; the setting just won't be remembered.
  }
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
}

/** Asks the page's server whether this is a LAN game (only the LAN server answers /lan.json). */
export async function detectLan(): Promise<{ addresses: string[]; version: string } | null> {
  try {
    const r = await fetch('/lan.json', { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const info = (await r.json()) as { lan?: boolean; addresses: string[]; version: string };
    return info.lan &&
      Array.isArray(info.addresses) &&
      info.addresses.every((a) => typeof a === 'string') &&
      typeof info.version === 'string'
      ? info
      : null;
  } catch {
    return null;
  }
}
