/** World-anchored DOM labels (loot names, site checklists, nameplates). Call show() every frame. */
import * as THREE from 'three';

interface Label {
  el: HTMLDivElement;
  html: string;
  cls: string;
  used: boolean;
}

export class Labels {
  private camera: THREE.Camera;

  private layer: HTMLDivElement;
  private labels = new Map<string, Label>();
  private v = new THREE.Vector3();
  onClick: ((key: string) => void) | null = null;

  constructor(camera: THREE.Camera, root: HTMLElement) {
    this.camera = camera;

    this.layer = document.createElement('div');
    this.layer.className = 'label-layer';
    root.appendChild(this.layer);
  }

  begin(): void {
    for (const l of this.labels.values()) l.used = false;
  }

  show(
    key: string,
    pos: THREE.Vector3,
    html: string,
    cls: string,
    w: number,
    h: number,
    clickable = false,
  ): void {
    let l = this.labels.get(key);
    if (!l) {
      const el = document.createElement('div');
      el.className = `wlabel ${cls}`;
      if (clickable) {
        el.style.pointerEvents = 'auto';
        el.addEventListener('pointerdown', (e) => {
          if (e.button === 0) {
            e.stopPropagation();
            this.onClick?.(key);
          }
        });
      }
      this.layer.appendChild(el);
      l = { el, html: '', cls, used: true };
      this.labels.set(key, l);
    }
    l.used = true;
    if (l.html !== html) {
      l.el.innerHTML = html;
      l.html = html;
    }
    if (l.cls !== cls) {
      l.el.className = `wlabel ${cls}`;
      l.cls = cls;
    }
    this.v.copy(pos).project(this.camera);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) {
      l.el.style.display = 'none';
      return;
    }
    l.el.style.display = '';
    const x = (this.v.x * 0.5 + 0.5) * w;
    const y = (-this.v.y * 0.5 + 0.5) * h;
    l.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  end(): void {
    for (const [k, l] of this.labels) {
      if (!l.used) {
        l.el.remove();
        this.labels.delete(k);
      }
    }
  }
}
