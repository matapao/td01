// ends() creates three wire anchors on each building; i stays in [0, 3).
import * as THREE from 'three';
import type { Building, Id } from '../../game/types.ts';
import { gridOf } from '../../game/systems/power.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../assets.ts';
import { POLE_WIRES } from '../procmodels.ts';
import { gh, type ViewCtx } from './context.ts';
import type { BuildingView } from './building.ts';

export class PowerLines {
  private ctx: ViewCtx;
  private buildings: ReadonlyMap<Id, BuildingView>;

  readonly root = new THREE.Group();
  private powerKey = '';
  private wireMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#1e1b18' }), {});
  constructor(ctx: ViewCtx, buildings: ReadonlyMap<Id, BuildingView>) {
    this.ctx = ctx;
    this.buildings = buildings;
  }
  update(): void {
    const { links } = gridOf(this.ctx.sim.state.buildings);
    const key = links.map(([a, b]) => `${a.id}-${b.id}`).join(',');
    if (key === this.powerKey) return;
    this.powerKey = key;
    for (const c of this.root.children) (c as THREE.Mesh).geometry.dispose();
    this.root.clear();
    if (!links.length) return;
    // Each pole turns its crossarm square to the line it carries (lines in and out fold together).
    const dirs = new Map<Id, THREE.Vector2>();
    for (const [a, b] of links) {
      for (const [p, q] of [
        [a, b],
        [b, a],
      ] as const) {
        if (p.kind !== 'pole') continue;
        const d = new THREE.Vector2(q.x - p.x, q.z - p.z).normalize();
        const sum = dirs.get(p.id) ?? new THREE.Vector2();
        if (sum.dot(d) < 0) d.negate();
        dirs.set(p.id, sum.add(d));
      }
    }
    // (A pole the player turned keeps the way they set it.)
    for (const [id, d] of dirs)
      if (!this.ctx.sim.getAs(id, 'building')?.turned)
        this.buildings.get(id)?.faceAlong(Math.atan2(d.x, d.y));
    const ends = (b: Building, toward: Building): THREE.Vector3[] => {
      const v = this.buildings.get(b.id);
      const y0 = v ? v.root.position.y : gh(this.ctx, b.x, b.z);
      if (b.kind === 'pole') {
        const yaw = v?.armYaw ?? 0;
        return POLE_WIRES.x.map(
          (o) => new THREE.Vector3(b.x + Math.cos(yaw) * o, y0 + POLE_WIRES.y, b.z - Math.sin(yaw) * o),
        );
      }
      // The watermill: the wires leave from under its eaves, on the side facing the line.
      const box = v?.box();
      const y = box ? box.min.y + (box.max.y - box.min.y) * 0.62 : y0 + 3;
      const yaw = Math.atan2(toward.x - b.x, toward.z - b.z);
      const r = box ? Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.3 : 1.2;
      const cx = b.x + Math.sin(yaw) * r;
      const cz = b.z + Math.cos(yaw) * r;
      return [-0.35, 0, 0.35].map(
        (o) => new THREE.Vector3(cx + Math.cos(yaw) * o, y, cz - Math.sin(yaw) * o),
      );
    };
    const geos: THREE.BufferGeometry[] = [];
    for (const [a, b] of links) {
      const ea = ends(a, b);
      const eb = ends(b, a);
      // Pair the ends so the wires don't cross.
      if (ea[0]!.distanceToSquared(eb[0]!) > ea[0]!.distanceToSquared(eb[2]!)) eb.reverse();
      for (let i = 0; i < 3; i++) {
        const sag = 0.2 + ea[i]!.distanceTo(eb[i]!) * 0.03;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const p = new THREE.Vector3().lerpVectors(ea[i]!, eb[i]!, t);
          p.y -= 4 * sag * t * (1 - t);
          pts.push(p);
        }
        geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.016, 3, false));
      }
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (merged) this.root.add(new THREE.Mesh(merged, this.wireMat));
  }
}
