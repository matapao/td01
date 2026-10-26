/** Workshop props, shipments and the blast ring. No DOM panels or gameplay mutations. */
import * as THREE from 'three';
import type { Game } from './game.ts';
import { groundHeight } from '../game/map.ts';
import { oversightSpot, shipmentPosition } from '../game/towerwork.ts';
import { toWorld } from '../game/interiors.ts';
import { blastRadius } from '../game/blasting.ts';
export class TowerWorkshopView {
  private game: Game;

  private shipments = new Map<number, THREE.Object3D>();
  private platform = new THREE.Group();
  private table = new THREE.Group();
  private pieces: THREE.Mesh[] = [];
  private danger = new THREE.Mesh(
    new THREE.RingGeometry(1.86, 1.91, 48),
    new THREE.MeshBasicMaterial({
      color: '#ed9a59',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  constructor(game: Game) {
    this.game = game;

    this.danger.rotation.x = -Math.PI / 2;
    this.danger.visible = false;
    game.stage.scene.add(this.platform, this.table, this.danger);
    this.makePlatform();
    this.makeTable();
  }
  private makePlatform(): void {
    const workshop = this.game.sim.state.buildings.find((b) => b.kind === 'anvil');
    if (!workshop || workshop.interior === undefined) return;
    const p = toWorld('anvil', workshop.interior, 0.84, -0.21);
    this.platform.position.set(p.x, 0, p.z);
    const wood = new THREE.MeshLambertMaterial({ color: '#8d6a3d' }),
      stone = new THREE.MeshLambertMaterial({ color: '#b5b0a1' });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.0), wood);
    deck.position.y = 0.05;
    this.platform.add(deck);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(i < 3 ? 0.32 : 0.95, i < 3 ? 0.22 : 0.07, i < 3 ? 0.32 : 0.1),
        i < 3 ? stone : wood,
      );
      m.position.set(i < 3 ? (i - 1) * 0.36 : 0, 0.22 + (i > 2 ? (i - 2) * 0.12 : 0), i > 2 ? 0.15 : -0.1);
      this.platform.add(m);
      this.pieces.push(m);
    }
  }
  private makeTable(): void {
    const p = oversightSpot();
    this.table.position.set(p.x, groundHeight(this.game.sim.world, p.x, p.z), p.z);
    const wood = new THREE.MeshLambertMaterial({ color: '#865d35' }),
      paper = new THREE.MeshBasicMaterial({ color: '#d2c091' });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.32), wood);
    top.position.y = 0.36;
    this.table.add(top);
    for (const x of [-0.15, 0.15])
      for (const z of [-0.11, 0.11]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.035), wood);
        leg.position.set(x, 0.17, z);
        this.table.add(leg);
      }
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.005, 0.25), paper);
    sheet.position.y = 0.388;
    this.table.add(sheet);
  }
  update(): void {
    const g = this.game,
      s = g.sim.state,
      h = g.sim.getAs(g.localHero, 'hero');
    if (!h) {
      this.platform.visible = this.table.visible = this.danger.visible = false;
      return;
    }
    const crates = s.towerCrates ?? [];
    const job = crates.find((c) => !c.ready);
    this.platform.visible = g.indoors;
    this.table.visible = !g.indoors && !g.under;
    this.pieces.forEach((m, i) => (m.visible = !!job && job.work > i * 19));
    const seen = new Set<number>();
    for (const c of crates)
      if (c.shipment) {
        seen.add(c.id);
        let model = this.shipments.get(c.id);
        if (!model && g.assets.has('town', 'wagon')) {
          model = g.assets.model('town', 'wagon');
          model.scale.setScalar(0.5);
          g.assets.patchTree(model, { fog: false });
          g.stage.scene.add(model);
          this.shipments.set(c.id, model);
        }
        if (model) {
          const p = shipmentPosition(c);
          model.position.set(p.x, groundHeight(g.sim.world, p.x, p.z), p.z);
          model.rotation.y = p.yaw;
          model.visible = !g.under && !g.indoors;
        }
      }
    for (const [id, m] of this.shipments)
      if (!seen.has(id)) {
        g.stage.scene.remove(m);
        this.shipments.delete(id);
      }
    const bomb = s.bombs.find((b) => b.hero === h.id);
    this.danger.visible = !!bomb && g.under;
    if (bomb) {
      this.danger.scale.setScalar(blastRadius(bomb.level ?? 1) / 1.9);
      this.danger.position.set(bomb.x, groundHeight(g.sim.world, bomb.x, bomb.z) + 0.025, bomb.z);
    }
  }
}
