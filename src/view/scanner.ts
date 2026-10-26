import type { Game } from './game.ts';
import { scannerReadings } from '../game/excavation.ts';
import { MINERALS } from '../game/mines.ts';
import { groundHeight } from '../game/map.ts';
/** A small utility screen. Deposits are sampled only on a deliberate pulse. */
export class Scanner {
  private game: Game;
  private hint: (text: string) => void;

  private panel = document.createElement('div');
  private screen = document.createElement('canvas');
  private list = document.createElement('div');
  private data: ReturnType<typeof scannerReadings> = [];
  private origin = { x: 0, y: 0, z: 0 };
  private open = false;
  constructor(game: Game, hint: (text: string) => void) {
    this.game = game;
    this.hint = hint;

    this.panel.style.cssText =
      'position:absolute;left:16px;bottom:150px;width:240px;padding:12px;background:#282b29;border:3px solid #a58c59;border-radius:12px;color:#ede1bf;font:12px Georgia;z-index:80;pointer-events:auto;display:none';
    const title = document.createElement('div');
    title.textContent = 'MINERAL SCANNER · V';
    title.style.cssText = 'font-weight:bold;letter-spacing:1px;margin-bottom:8px';
    this.screen.width = this.screen.height = 180;
    this.screen.style.cssText =
      'display:block;margin:auto;border-radius:50%;background:#17261f;border:2px solid #747958';
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;margin:8px 0';
    for (const [label, action] of [
      ['Pulse', () => this.pulse()],
      ['Close', () => this.toggle()],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = 'btn tiny';
      b.onclick = action;
      buttons.append(b);
    }
    this.panel.append(title, this.screen, buttons, this.list);
    this.panel.addEventListener('mousedown', (e) => e.stopPropagation());
    game.ui.append(this.panel);
    const button = document.createElement('button');
    button.textContent = 'V · Scanner';
    button.className = 'btn tiny';
    button.style.cssText = 'position:absolute;left:16px;bottom:120px;z-index:40;pointer-events:auto';
    button.onclick = () => this.toggle();
    game.ui.append(button);
    game.onFrame(() => {
      if (this.open) this.draw();
    });
  }
  get visible(): boolean {
    return this.open;
  }
  toggle(): void {
    const h = this.game.sim.getAs(this.game.localHero, 'hero');
    if (!h?.tools.includes('scanner')) {
      this.hint('The Crafter Kit at the shop includes the mineral scanner');
      return;
    }
    this.open = !this.open;
    this.panel.style.display = this.open ? 'block' : 'none';
    if (this.open) this.pulse();
  }
  private pulse(): void {
    const h = this.game.sim.getAs(this.game.localHero, 'hero');
    if (!h) return;
    this.origin = { x: h.x, y: groundHeight(this.game.sim.world, h.x, h.z) + 0.5, z: h.z };
    this.data = scannerReadings(this.game.sim, h);
    this.list.replaceChildren();
    const note = document.createElement('div');
    note.textContent = '12 m pulse · approximate deposits, not guaranteed yields';
    note.style.marginBottom = '6px';
    this.list.append(note);
    if (!this.data.length) {
      const p = document.createElement('div');
      p.textContent = 'No strong returns. Try another face or go deeper.';
      this.list.append(p);
    }
    for (const p of this.data.slice(0, 5)) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:4px 0;border-top:1px solid #6a6349';
      const height = p.y - this.origin.y;
      row.textContent = `${p.name} · ${p.distance.toFixed(1)} m · ~${p.low}–${p.high} pieces${Math.abs(height) > 1 ? ` · ${height > 0 ? 'above' : 'below'}` : ''}`;
      this.list.append(row);
    }
  }
  private draw(): void {
    const g = this.screen.getContext('2d')!;
    g.clearRect(0, 0, 180, 180);
    g.fillStyle = '#17261f';
    g.fillRect(0, 0, 180, 180);
    g.strokeStyle = '#516951';
    g.lineWidth = 1;
    for (const r of [25, 50, 75]) {
      g.beginPath();
      g.arc(90, 90, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(15, 90);
    g.lineTo(165, 90);
    g.moveTo(90, 15);
    g.lineTo(90, 165);
    g.stroke();
    const t = performance.now() * 0.0018;
    g.strokeStyle = '#b5c985';
    g.beginPath();
    g.moveTo(90, 90);
    g.lineTo(90 + Math.sin(t) * 75, 90 - Math.cos(t) * 75);
    g.stroke();
    for (const p of this.data) {
      g.fillStyle = MINERALS[p.mineral].ore;
      g.beginPath();
      g.arc(90 + (p.x - this.origin.x) * 6, 90 + (p.z - this.origin.z) * 6, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f3e1a3';
    g.beginPath();
    g.arc(90, 90, 3, 0, Math.PI * 2);
    g.fill();
  }
}
