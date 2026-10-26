// chips contains CAP initialized slots; both update and ring-cursor indices stay in [0, CAP).
/** A bounded pool of multi-sized chips with impulses, rotation, gravity, contact and friction. */
import * as THREE from 'three';
import type { Game } from './game.ts';
import { earth } from '../game/excavation.ts';
import { MINERALS, type MineralId } from '../game/mines.ts';
const CAP = 128;
interface Chip {
  p: THREE.Vector3;
  v: THREE.Vector3;
  rotation: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
  life: number;
  sleeping: boolean;
}
export class RockDebris {
  private game: Game;

  private mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ vertexColors: false, flatShading: true }),
    CAP,
  );
  private chips: Chip[] = [];
  private cursor = 0;
  private matrix = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private old = new THREE.Vector3();
  private contactNormal = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private live = false;
  constructor(game: Game) {
    this.game = game;

    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    game.stage.scene.add(this.mesh);
    for (let i = 0; i < CAP; i++)
      this.chips.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        rotation: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        size: 0,
        life: 0,
        sleeping: false,
      });
    game.sim.events.on('earthHit', (e) => {
      const n = e.nx === undefined ? earth(game.sim).normal(e.x, e.y, e.z) : { x: e.nx, y: e.ny!, z: e.nz! };
      const normal = this.contactNormal.set(n.x, n.y, n.z);
      this.live = true;
      for (let i = 0; i < (e.r > 0.3 ? 16 : e.r > 0.15 ? 8 : 6); i++) {
        const at = this.cursor++ % CAP,
          c = this.chips[at]!;
        c.size = (0.009 + Math.random() * 0.019) * (e.r > 0.3 ? 2 : 1);
        c.life = 1.2 + Math.random() * 0.8;
        c.sleeping = false;
        c.p.set(e.x, e.y, e.z).addScaledVector(normal, 0.025);
        c.v.copy(normal).multiplyScalar(0.3 + Math.random() * 0.65);
        c.v.y += 0.2 + Math.random() * 0.5;
        c.v.x += (Math.random() - 0.5) * 0.5;
        c.v.z += (Math.random() - 0.5) * 0.5;
        c.spin.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
        this.mesh.setColorAt(
          at,
          new THREE.Color(MINERALS[e.mineral as MineralId]?.stain ?? '#938570').multiplyScalar(
            0.8 + Math.random() * 0.4,
          ),
        );
      }
      this.mesh.instanceColor!.needsUpdate = true;
    });
    game.onFrame((dt) => this.update(Math.min(dt, 0.05)));
  }
  private update(dt: number): void {
    if (!this.live) {
      this.mesh.visible = false;
      return;
    }
    const f = earth(this.game.sim);
    let live = 0;
    for (let i = 0; i < CAP; i++) {
      const c = this.chips[i]!;
      c.life -= dt;
      if (c.life > 0) {
        live++;
        if (!c.sleeping)
          for (let s = 0; s < 2; s++) {
            const t = dt / 2;
            c.v.y -= 3.2 * t;
            this.old.copy(c.p);
            c.p.addScaledVector(c.v, t);
            if (f.density(c.p.x, c.p.y - c.size, c.p.z) > 0) {
              const n = f.normal(c.p.x, c.p.y - c.size, c.p.z),
                N = this.contactNormal.set(n.x, n.y, n.z);
              c.p.copy(this.old).addScaledVector(N, 0.003);
              const speed = c.v.dot(N);
              if (speed < 0) c.v.addScaledVector(N, -speed * 1.32);
              c.v.multiplyScalar(0.74);
              c.spin.multiplyScalar(0.72);
              if (c.v.lengthSq() < 0.006) {
                c.sleeping = true;
                c.spin.setScalar(0);
                break;
              }
            }
          }
        c.rotation.addScaledVector(c.spin, dt);
      }
      const scale = c.life > 0 ? c.size * Math.min(1, c.life * 3) : 0;
      this.quat.setFromEuler(this.euler.set(c.rotation.x, c.rotation.y, c.rotation.z));
      this.matrix.compose(c.p, this.quat, this.scale.set(scale * 1.4, scale * 0.45, scale));
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.live = live > 0;
    this.mesh.visible = this.live;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
