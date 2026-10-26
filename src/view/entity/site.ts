// Non-addon sites install four stage models; blueprintMaterial declares these uniforms; upper windows are nonempty and index is clamped.
import { buildingModel } from './building-model.ts';
import * as THREE from 'three';
import { ITEMS, PLANS, TOWER_WINDOWS, type GemId, type ItemId } from '../../game/content.ts';
import type { Site } from '../../game/types.ts';
import { siteComplete, siteMissing, siteSteps } from '../../game/systems/craft.ts';
import { blueprintMaterial } from '../overlays.ts';
import { itemMesh } from '../itemmodels.ts';
import { gearMesh } from '../procmodels.ts';
import { TOWER, gemWindow, socketMarker } from '../towerview.ts';
import { gh, type ViewCtx } from './context.ts';

const stageScale = 2.6;

export class SiteView {
  private ctx: ViewCtx;
  public readonly site: Site;

  readonly root = new THREE.Group();
  private holo: THREE.Object3D;
  private bp: THREE.ShaderMaterial;
  private stages: THREE.Object3D[] = [];
  private piles = new THREE.Group();
  private pileKey = '';
  private t = 0;
  private height: number;
  readonly isAddon: boolean;

  constructor(ctx: ViewCtx, site: Site) {
    this.ctx = ctx;
    this.site = site;

    this.isAddon = site.building !== 0;
    this.bp = blueprintMaterial(this.isAddon ? '#ffd36a' : '#6fd0ff');
    const plan = PLANS[site.plan];
    if (plan.type === 'building') {
      this.holo = buildingModel(ctx.assets, plan.building);
      this.holo.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = this.bp;
          m.castShadow = false;
        }
      });
      for (const name of [
        'building_stage_A',
        'building_stage_B',
        'building_stage_C',
        'building_scaffolding',
      ]) {
        const s = ctx.assets.model('medieval', name);
        s.scale.setScalar(name === 'building_scaffolding' ? 1.6 : stageScale);
        ctx.assets.patchTree(s);
        s.visible = false;
        this.root.add(s);
        this.stages.push(s);
      }
    } else {
      // A gem being set or cut finer: a small golden blueprint gear just outside its window. A new top:
      // a big one turning over the tower.
      const top = plan.type === 'top';
      this.holo = gearMesh(top ? 0.9 : 0.35, 12, top ? 0.16 : 0.1, this.bp as unknown as THREE.Material);
      this.holo.rotation.x = Math.PI / 2;
      if (top) this.holo.position.set(0, TOWER.floor + 1.6, 0);
      else if (plan.type === 'device') {
        // A device: outside the next free upper window.
        const b = ctx.sim.getAs(site.building, 'building');
        this.holo.position.copy(
          socketMarker(
            TOWER_WINDOWS.upper[Math.min(TOWER_WINDOWS.upper.length - 1, b?.devices?.length ?? 0)]!,
          ),
        );
      } else if (plan.type === 'payload') this.holo.position.set(0, 5, 0);
      else if (plan.type === 'gem') this.holo.position.copy(socketMarker(gemWindow(site.plan as GemId)));
      else this.holo.position.set(0, 3, 0);
    }
    this.root.add(this.holo, this.piles);
    this.root.position.set(site.x, gh(ctx, site.x, site.z) - 0.02, site.z);
    this.root.rotation.y = site.rot;
    ctx.scene.add(this.root);
    const box = new THREE.Box3().setFromObject(this.holo);
    this.height = Math.max(3, box.max.y - box.min.y);
    ctx.fx.ring(site.x, this.root.position.y, site.z, 0.5, 2.6, this.isAddon ? '#ffd36a' : '#6fd0ff', 0.6);
  }

  progress(): number {
    const s = this.site;
    const steps = siteSteps(s);
    if (!siteComplete(s)) return 0;
    const cur = steps[s.step];
    return Math.min(1, (s.step + (cur ? s.work / cur.work : 0)) / steps.length);
  }

  update(dt: number, s: Site, w: number, h: number): void {
    this.t += dt;
    this.bp.uniforms['uTime']!.value = this.t;
    // A blueprint can be turned until it is built.
    if (!this.isAddon) this.root.rotation.y = s.rot;
    const p = this.progress();
    if (!this.isAddon) {
      const ready = siteComplete(s);
      this.stages[0]!.visible = ready && p < 0.4;
      this.stages[1]!.visible = ready && p >= 0.4 && p < 0.75;
      this.stages[2]!.visible = ready && p >= 0.75;
      this.stages[3]!.visible = ready && p > 0.15;
      this.bp.uniforms['uBuilt']!.value = this.root.position.y + (ready ? p * this.height * 0.85 : -100);
    } else {
      this.holo.rotation.z += dt * 1.2;
    }
    this.bp.uniforms['uAlpha']!.value = 0.75 + 0.25 * Math.sin(this.t * 3);
    // Delivered parts piled around the footprint.
    const key = JSON.stringify(s.have) + s.sockets.length;
    if (key !== this.pileKey) {
      this.pileKey = key;
      this.piles.clear();
      let i = 0;
      const items: ItemId[] = [];
      for (const k in s.have) for (let j = 0; j < (s.have[k as ItemId] ?? 0); j++) items.push(k as ItemId);
      for (const inst of s.sockets) items.push(inst.base);
      for (const item of items) {
        const m = itemMesh(item, this.ctx.assets);
        const a = (i / Math.max(6, items.length)) * Math.PI * 2;
        const r = this.isAddon ? 2.2 : 1.9;
        m.position.set(Math.cos(a) * r, 0.02 + Math.floor(i / 12) * 0.15, Math.sin(a) * r);
        m.rotation.y = a;
        this.piles.add(m);
        i++;
      }
    }
    // Checklist chip.
    const plan = PLANS[s.plan];
    const missing = siteMissing(s);
    let html = `<div class="chip-title">${plan.name}</div>`;
    if (!siteComplete(s)) {
      html += '<div class="chip-row">';
      for (const k in s.need) {
        const item = k as ItemId;
        const need = s.need[item] ?? 0;
        const have = need - (missing[item] ?? 0);
        html += `<span class="chip ${have >= need ? 'ok' : ''}" style="--c:${ITEMS[item].color}"><i></i>${ITEMS[item].name} ${have}/${need}</span>`;
      }
      html += '</div>';
    } else {
      const step = siteSteps(s)[s.step];
      if (step)
        html += `<div class="chip-row"><span class="chip work">⚒ ${step.label} · ${s.step + 1}/${siteSteps(s).length}</span></div>`;
    }
    const pos = this.root.position.clone();
    pos.y += this.isAddon ? Math.max(5.6, this.holo.position.y + 1.4) : this.height + 1.2;
    this.ctx.labels.show(`site:${s.id}`, pos, html, 'site-label', w, h, true);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.bp.dispose();
  }
}

// ---- Drops ---------------------------------------------------------------------------------------
