/**
 * LAN game UI (the fps game's menu, in BrowserDefense's look): a join card with your name and the
 * address others use, then a slim bar with who's playing, ping, Pause / Save / Load, and the
 * "New version ready · Update (U)" banner when the host's code changes.
 */
import { CLASSES, CLASS_ORDER, type HeroClass } from '../game/content.ts';
import type { LanClient } from '../net/client.ts';
import type { Mirror } from '../net/mirror.ts';
import { el, esc, setHtml } from './dom.ts';

export class LanPanel {
  private client: LanClient;
  private mirror: Mirror;
  private addresses: string[];
  private note: (text: string, kind?: string) => void;

  private card = el('div', 'lan-join panel pe');
  private bar = el('div', 'lan-bar panel pe');
  private banner = el('div', 'lan-update pe hidden');
  private pausedBox = el('div', 'lan-paused panel pe hidden');
  private ping = 0;

  constructor(
    client: LanClient,
    mirror: Mirror,
    root: HTMLElement,
    addresses: string[],
    note: (text: string, kind?: string) => void,
  ) {
    this.client = client;
    this.mirror = mirror;
    this.addresses = addresses;
    this.note = note;

    root.append(this.card, this.bar, this.banner, this.pausedBox);
    this.bar.classList.add('hidden');
    this.renderCard();
    mirror.onChange = () => this.render();
    mirror.onFeed = (text) => this.note(text, 'info');
    mirror.onError = (text) => this.note(text, 'bad');
    mirror.onSaved = (code, by) => {
      this.note(`${by ?? 'Someone'} saved the game: ${code}`, 'good');
      this.lastCode = code;
      this.render();
    };
    client.handlers.pong = (m) => {
      this.ping = performance.now() - m.t;
      this.render();
    };
    client.handlers.update = (m) => {
      client.updateReady = m.ready;
      this.render();
    };
    client.handlers.updating = (m) => {
      client.updating = true;
      setHtml(this.banner, `${m.by ? `${esc(m.by)} is updating` : 'Updating'} the game…`);
      this.banner.classList.remove('hidden');
    };
    client.handlers.saves = (m) => this.showSaves(m.list);
    client.onClose = () => {
      setHtml(
        this.banner,
        client.updating ? 'Updating the game…' : 'Lost the connection to the server. Reconnecting…',
      );
      this.banner.classList.remove('hidden');
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyU' && !(e.target instanceof HTMLInputElement)) client.requestUpdate();
    });
  }

  private lastCode = '';
  /** Shows a tooltip on an element (set by the HUD when it exists). */
  tipFor?: (el: HTMLElement, text: string) => void;

  private renderCard(): void {
    const name = this.client.savedName || 'Hero';
    this.card.innerHTML = `
      <div class="w-title gold-text">BrowserDefense · LAN game</div>
      <div class="w-sub">Everyone on this network plays in the same vale.</div>
      <label class="lan-name">Your name <input maxlength="16" value="${esc(name)}"></label>
      <div class="lan-classes">${CLASS_ORDER.map((c) => `<button class="btn lan-class" data-cls="${c}"><b>${CLASSES[c].role}</b><span>${CLASSES[c].name}</span></button>`).join('')}</div>
      <button class="btn call">Join the game</button>
      <div class="w-sub lan-status">Connecting…</div>
      ${this.addresses.length ? `<div class="w-sub">Others join at <b>${this.addresses.map(esc).join('</b> or <b>')}</b></div>` : ''}`;
    const input = this.card.querySelector('input') as HTMLInputElement;
    // Your class: Tank, Support or Magic (the last one you played is picked).
    let cls: HeroClass =
      this.client.savedClass && this.client.savedClass in CLASSES ? this.client.savedClass : 'tank';
    const pickCls = () =>
      this.card
        .querySelectorAll<HTMLButtonElement>('.lan-class')
        .forEach((b) => b.classList.toggle('picked', b.dataset['cls'] === cls));
    this.card.querySelectorAll<HTMLButtonElement>('.lan-class').forEach((b) => {
      b.onclick = () => {
        cls = b.dataset['cls'] as HeroClass;
        pickCls();
      };
      this.tipFor?.(b, CLASSES[b.dataset['cls'] as HeroClass].blurb);
    });
    pickCls();
    const join = () => {
      this.client.join(input.value.trim() || 'Hero', cls);
      this.card.classList.add('hidden');
      this.bar.classList.remove('hidden');
    };
    (this.card.querySelector('button.call') as HTMLButtonElement).onclick = join;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') join();
    };
    if (this.client.resumeFrom !== null) join();
  }

  private render(): void {
    const m = this.mirror;
    const status = this.card.querySelector('.lan-status');
    if (status) status.textContent = `Connected · ${m.players.filter((p) => p.online).length} playing`;
    const who = m.players
      .map((p) => `<span class="lan-p${p.online ? '' : ' off'}" style="--c:${p.color}">${esc(p.name)}</span>`)
      .join('');
    setHtml(
      this.bar,
      `<div class="lan-who">${who || '<span class="w-sub">Nobody yet</span>'}</div>
       <div class="lan-tools">
         <span class="w-sub">${Math.round(this.ping)} ms</span>
         <button class="btn tiny" data-a="pause">${m.paused ? 'Resume' : 'Pause'}</button>
         <button class="btn tiny" data-a="save">Save</button>
         <button class="btn tiny" data-a="load">Load…</button>
         <button class="btn tiny" data-a="new">New game</button>
         ${this.lastCode ? `<span class="w-sub">Saved as <b>${this.lastCode}</b></span>` : ''}
       </div>`,
    );
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>('button')) {
      b.onclick = () => {
        const a = b.dataset['a'];
        if (a === 'pause') this.client.send({ type: 'pause', on: !m.paused });
        else if (a === 'save') this.client.send({ type: 'save' });
        else if (a === 'load') this.client.send({ type: 'listSaves' });
        else if (
          a === 'new' &&
          confirm('Start a new game for everyone? This one is lost unless you save it first.')
        )
          this.client.send({ type: 'newGame' });
      };
    }
    this.banner.classList.toggle('hidden', !this.client.updateReady && !this.client.updating);
    if (this.client.updateReady && !this.client.updating) {
      setHtml(this.banner, 'New version ready · <button class="btn tiny call">Update <kbd>U</kbd></button>');
      (this.banner.querySelector('button') as HTMLButtonElement).onclick = () => this.client.requestUpdate();
    }
    this.pausedBox.classList.toggle('hidden', !m.paused || !m.joined);
    if (m.paused) {
      setHtml(
        this.pausedBox,
        '<div class="w-title gold-text">Paused</div><div class="w-sub">The whole team is paused.</div><button class="btn call">Resume</button>',
      );
      (this.pausedBox.querySelector('button') as HTMLButtonElement).onclick = () =>
        this.client.send({ type: 'pause', on: false });
    }
  }

  /** Load a saved game: pick a recent one or type its code. */
  private showSaves(list: { code: string; at: string; wave: number }[]): void {
    const box = el('div', 'lan-saves panel pe');
    box.innerHTML = `<div class="w-title gold-text">Load a saved game</div>
      ${list.map((s) => `<button class="btn" data-code="${s.code}"><b>${s.code}</b> · wave ${s.wave} · ${new Date(s.at).toLocaleString()}</button>`).join('') || '<div class="w-sub">No saves yet.</div>'}
      <label class="lan-name">Code <input maxlength="6"></label>
      <div class="row"><button class="btn call" data-a="go">Load</button><button class="btn" data-a="x">Cancel</button></div>`;
    const input = box.querySelector('input') as HTMLInputElement;
    input.onkeydown = (e) => e.stopPropagation();
    const go = (code: string) => {
      this.client.send({ type: 'load', code: code.toUpperCase() });
      box.remove();
    };
    for (const b of box.querySelectorAll<HTMLButtonElement>('button')) {
      b.onclick = () =>
        b.dataset['code'] ? go(b.dataset['code']) : b.dataset['a'] === 'go' ? go(input.value) : box.remove();
    }
    this.bar.parentElement!.append(box);
  }
}
