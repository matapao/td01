/** Ready KayKit horses, with no extra skeletons or per-frame allocations. */
import * as THREE from 'three';
import type { Game } from './game.ts';
import { horseOf } from '../game/maintenance.ts';
import { groundHeight } from '../game/map.ts';
import { indoors } from '../game/interiors.ts';
import { underground } from '../game/systems/mining.ts';
export class Mounts {
  private game: Game;

  private horses = new Map<number, THREE.Object3D>();
  private clock = 0;
  constructor(game: Game) {
    this.game = game;

    game.onFrame((dt) => this.update(dt));
    void game.assets.loadKit('town');
  }
  private update(dt: number): void {
    this.clock += dt;
    const g = this.game;
    for (const h of g.sim.state.heroes) {
      const horse = horseOf(h);
      let model = this.horses.get(h.id);
      if (!model && g.assets.has('town', 'horse_A')) {
        model = g.assets.model('town', h.player % 2 ? 'horse_C' : 'horse_A');
        const box = new THREE.Box3().setFromObject(model),
          height = box.max.y - box.min.y;
        model.scale.setScalar(0.6 / height);
        g.assets.patchTree(model, { fog: false });
        g.stage.scene.add(model);
        this.horses.set(h.id, model);
      }
      if (!model) continue;
      const riding = horse.riding && !h.dead && !indoors(h.x) && !underground(h.x);
      const x = riding ? h.px + (h.x - h.px) * g.alpha : horse.x,
        z = riding ? h.pz + (h.z - h.pz) * g.alpha : horse.z;
      model.position.set(
        x,
        groundHeight(g.sim.world, x, z) +
          (riding && h.anim === 'run' ? Math.abs(Math.sin(this.clock * 13)) * 0.018 : 0),
        z,
      );
      model.rotation.y = riding ? h.facing : Math.PI / 2;
      model.visible = x > 1500 === g.under && !g.indoors;
    }
    for (const [id, model] of this.horses)
      if (!g.sim.getAs(id, 'hero')) {
        g.stage.scene.remove(model);
        this.horses.delete(id);
      }
  }
}
