/** The later-era renderer stays out of village startup, including saved games that never visited it. */
import type { Sim } from '../game/sim.ts';
import type { Scene } from 'three';
import type { Fx } from './fx.ts';
import type { Assets } from './assets.ts';
import type { SpaceView } from './spaceview.ts';

export class LazySpaceView {
  private sim: Sim;
  private scene: Scene;
  private fx: Fx;
  private assets: () => Assets | undefined;
  private ui: HTMLElement;

  private view: SpaceView | null = null;
  private pending = false;
  private failed = false;
  private here = false;
  private target = { x: 0, z: 0 };
  constructor(sim: Sim, scene: Scene, fx: Fx, assets: () => Assets | undefined, ui: HTMLElement) {
    this.sim = sim;
    this.scene = scene;
    this.fx = fx;
    this.assets = assets;
    this.ui = ui;
  }
  update(dt: number, here: boolean, at: { x: number; z: number }): void {
    this.here = here;
    this.target.x = at.x;
    this.target.z = at.z;
    const assets = this.assets();
    if (here && assets && !this.view && !this.pending && !this.failed) {
      this.pending = true;
      void import('./spaceview.ts')
        .then(({ SpaceView }) => {
          this.view = new SpaceView(this.sim, this.scene, this.fx, assets);
          this.view.update(0, this.here, this.target);
          void assets.loadKit('space');
        })
        .catch(() => {
          this.failed = true;
          const retry = document.createElement('button');
          retry.className = 'btn pe';
          retry.textContent = 'Reload the Space view';
          retry.onclick = () => location.reload();
          this.ui.append(retry);
        })
        .finally(() => {
          this.pending = false;
        });
    }
    this.view?.update(dt, here, at);
  }
}
