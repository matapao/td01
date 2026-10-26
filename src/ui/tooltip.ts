import { el } from './dom.ts';

/** One tooltip that follows the mouse. Elements opt in with `tip(el, () => html)`. */
export class Tooltip {
  readonly root = el('div', 'tooltip panel hidden');
  private source: (() => string) | null = null;
  private x = 0;
  private y = 0;

  constructor(parent: HTMLElement) {
    parent.appendChild(this.root);
    window.addEventListener('pointermove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
      if (this.source) this.place();
    });
  }

  tip(target: HTMLElement, html: () => string): void {
    target.addEventListener('pointerenter', () => {
      this.source = html;
      this.refresh();
    });
    target.addEventListener('pointerleave', () => this.hide());
  }

  refresh(): void {
    if (!this.source) return;
    const html = this.source();
    if (!html) {
      this.root.classList.add('hidden');
      return;
    }
    this.root.innerHTML = html;
    this.root.classList.remove('hidden');
    this.place();
  }

  hide(): void {
    this.source = null;
    this.root.classList.add('hidden');
  }

  private place(): void {
    const r = this.root.getBoundingClientRect();
    let x = this.x + 16;
    let y = this.y + 18;
    if (x + r.width > window.innerWidth - 6) x = this.x - r.width - 12;
    if (y + r.height > window.innerHeight - 6) y = this.y - r.height - 12;
    this.root.style.left = `${Math.max(4, x)}px`;
    this.root.style.top = `${Math.max(4, y)}px`;
  }
}
