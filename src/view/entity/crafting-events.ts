import * as THREE from 'three';
import { WEAPONS, weaponTier, ITEMS, PLANS, type ItemId } from '../../game/content.ts';
import { PERSON } from '../characters.ts';
import { indoors } from '../../game/interiors.ts';
import { benchOf } from '../../game/systems/rooms.ts';
import { gh, type ViewCtx } from './context.ts';
import { SiteView } from './site.ts';
import type { EntityEventState } from './event-state.ts';
import { beatFx } from './work-effects.ts';

export function hookCraftingEvents(
  ctx: ViewCtx,
  state: Pick<EntityEventState, 'heroes' | 'sites' | 'buildings'>,
): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  ev.on('gatherHit', (e) => {
    // A stroke lands: the full spray of chips (a hit on the backswing between two strokes, a few).
    const k = (state.heroes.get(e.hero)?.strike(false) ?? true) ? 1 : 0.35;
    // Chips at the hero's chest height, sized for a half-unit person; leaves from the canopy.
    const p = at(e.x, e.z, PERSON * 0.6);
    const c =
      e.kind === 'tree'
        ? '#8a5a33'
        : e.kind === 'ore'
          ? '#d07a45'
          : e.kind === 'crystal'
            ? '#b583ff'
            : '#a3acb7';
    fx.burst(p.x, p.y, p.z, Math.round(9 * k), {
      color: c,
      speed: 1.6,
      up: 1.8,
      size: 0.07,
      gravity: 9,
      tex: 'chunk',
      additive: false,
      life: 0.55,
    });
    if (e.kind === 'tree')
      fx.burst(p.x, p.y + 2.4, p.z, Math.round(7 * k), {
        color: '#5aa83a',
        speed: 1.2,
        up: 0.3,
        size: 0.13,
        gravity: 0.8,
        tex: 'leaf',
        additive: false,
        life: 1.8,
        drag: 2,
      });
    else
      fx.burst(p.x, p.y, p.z, Math.round(5 * k), {
        color: e.kind === 'crystal' ? '#e3ccff' : '#ffe9a8',
        speed: 1.8,
        up: 1.2,
        size: 0.06,
        gravity: 6,
        tex: 'spark',
        stretch: 2,
        life: 0.3,
      });
  });
  ev.on('workBeat', (e) => {
    state.heroes.get(e.hero)?.strike(true);
    const tgt = sim.get(e.target);
    if (!tgt || (tgt.type !== 'site' && tgt.type !== 'building')) return;
    // Indoors the work is done at the bench (the anvil), not out at the building.
    const h = sim.getAs(e.hero, 'hero');
    const bench = tgt.type === 'building' && h && indoors(h.x) ? benchOf(tgt.e) : null;
    const p = bench
      ? new THREE.Vector3(bench.x + Math.sin(bench.face) * 0.55, 0.28, bench.z + Math.cos(bench.face) * 0.55)
      : at(tgt.e.x, tgt.e.z, 1.2);
    beatFx(ctx, e.action, p, e.quality);
  });
  ev.on('stepDone', (e) => {
    const tgt = sim.get(e.target);
    if (!tgt || (tgt.type !== 'site' && tgt.type !== 'building')) return;
    const p = at(tgt.e.x, tgt.e.z);
    fx.ring(p.x, p.y, p.z, 0.4, 2.8, '#ffe9a8', 0.5, 0.7);
  });
  ev.on('crafted', (e) => {
    const b = sim.getAs(e.station, 'building');
    if (!b) return;
    const p = at(b.x, b.z, 1.5);
    const k = Object.keys(e.output)[0] as ItemId;
    fx.text(
      p.x,
      p.y + 2,
      p.z,
      `+${e.output[k]} ${ITEMS[k].name}${e.bonus ? ' (bonus!)' : ''}`,
      `gain${e.perfect ? ' perfect' : ''}`,
      1.2,
    );
    fx.burst(p.x, p.y, p.z, 12, {
      color: ITEMS[k].color,
      speed: 2,
      up: 3,
      size: 0.25,
      gravity: 6,
      tex: 'star',
      life: 0.7,
    });
  });
  ev.on('sitePlaced', (e) => {
    const s = sim.getAs(e.site, 'site');
    if (s) state.sites.set(s.id, new SiteView(ctx, s));
  });
  ev.on('buildingDone', (e) => {
    const p = at(e.x, e.z);
    fx.ring(p.x, p.y, p.z, 0.6, 4.2, '#ffe9a8', 0.6);
    fx.burst(p.x, p.y + 0.3, p.z, 24, {
      color: '#c9b9a0',
      speed: 4,
      up: 1,
      size: 0.8,
      size1: 2,
      gravity: 0,
      tex: 'smoke',
      additive: false,
      alpha: 0.5,
      life: 1.2,
      drag: 2.5,
    });
    fx.burst(p.x, p.y + 3, p.z, 30, {
      color: '#ffe27a',
      speed: 3,
      up: 5,
      size: 0.3,
      gravity: 5,
      tex: 'star',
      life: 1.1,
    });
    ctx.shake(0.25, p.x, p.z);
  });
  ev.on('gemSet', (e) => {
    const b = sim.getAs(e.building, 'building');
    const v = state.buildings.get(e.building);
    if (!b) return;
    const p = at(b.x, b.z);
    // The burst comes from the window it went into.
    const q = v?.gemPos(e.gem) ?? new THREE.Vector3(p.x, p.y + 4, p.z);
    fx.ring(p.x, p.y, p.z, 0.6, 3.6, '#ffd36a', 0.7);
    fx.burst(q.x, q.y, q.z, 30, {
      color: '#ffd36a',
      speed: 3,
      up: 4,
      size: 0.3,
      gravity: 4,
      tex: 'star',
      life: 1.1,
    });
    fx.text(p.x, p.y + 7, p.z, PLANS[e.gem].name, 'gain perfect', 1.6);
  });
  ev.on('gemsRemoved', (e) => {
    const p = at(e.x, e.z);
    fx.burst(p.x, p.y + 2.5, p.z, 18, {
      color: '#8a7f70',
      speed: 2,
      up: 1.5,
      size: 0.6,
      gravity: 1,
      tex: 'smoke',
      additive: false,
      alpha: 0.5,
      life: 1,
    });
    fx.text(p.x, p.y + 6, p.z, `${e.gems.map((m) => PLANS[m].name).join(', ')} taken out`, 'gain', 1.6);
  });
  ev.on('buildingHit', (e) => {
    const v = state.buildings.get(e.building);
    if (!v) return;
    v.hit();
    const p = v.root.position;
    fx.burst(p.x, p.y + 1.5, p.z, 8, {
      color: '#a08a6a',
      speed: 3,
      up: 2,
      size: 0.2,
      gravity: 12,
      tex: 'chunk',
      additive: false,
      life: 0.6,
    });
    fx.text(p.x, p.y + 5, p.z, String(Math.round(e.amount)), 'dmg hero-hurt', 0.7);
  });
  ev.on('buildingDestroyed', (e) => {
    const p = at(e.x, e.z);
    fx.burst(p.x, p.y + 2, p.z, 50, {
      color: '#9a8a74',
      speed: 6,
      up: 6,
      size: 0.4,
      gravity: 12,
      tex: 'chunk',
      additive: false,
      life: 1.2,
    });
    fx.burst(p.x, p.y + 1, p.z, 24, {
      color: '#6a625a',
      speed: 3,
      up: 2,
      size: 1.4,
      size1: 3.5,
      gravity: -0.3,
      tex: 'smoke',
      additive: false,
      alpha: 0.6,
      life: 2.4,
      drag: 1.2,
    });
    fx.ring(p.x, p.y, p.z, 0.5, 5, '#ffb347', 0.6);
    fx.text(p.x, p.y + 4, p.z, 'DESTROYED', 'status enrage', 1.6);
    ctx.shake(0.6, p.x, p.z);
  });
  ev.on('repaired', (e) => {
    const v = state.buildings.get(e.building);
    if (v && Math.random() < 0.35) {
      const p = v.root.position;
      fx.burst(p.x, p.y + 2, p.z, 4, {
        color: '#9fe08a',
        speed: 1.2,
        up: 2,
        size: 0.25,
        gravity: 0,
        tex: 'star',
        life: 0.7,
      });
    }
  });
  ev.on('reforgeStarted', (e) => {
    const h = sim.getAs(e.hero, 'hero');
    const b = sim.getAs(e.station, 'building');
    const bench = b && h && indoors(h.x) ? benchOf(b) : null;
    const p = bench
      ? new THREE.Vector3(bench.x + Math.sin(bench.face) * 0.55, 0.28, bench.z + Math.cos(bench.face) * 0.55)
      : b
        ? at(b.x, b.z, 1.2)
        : null;
    if (p)
      fx.burst(p.x, p.y, p.z, 14, {
        color: '#ffb347',
        color1: '#ff3d00',
        speed: 2,
        up: 2.5,
        size: 0.2,
        gravity: 2,
        tex: 'dot',
        life: 0.6,
      });
  });
  ev.on('reforged', (e) => {
    const v = state.heroes.get(e.hero);
    const h = sim.getAs(e.hero, 'hero');
    if (!v || !h) return;
    const p = v.pos;
    fx.burst(p.x, p.y + PERSON * 0.9, p.z, 26, {
      color: '#ffe27a',
      speed: 2.2,
      up: 3,
      size: 0.18,
      gravity: 4,
      tex: 'star',
      life: 1,
    });
    fx.ring(p.x, p.y + 0.02, p.z, 0.2, 1.6, '#ffd36a', 0.6, 0.8);
    const tier = WEAPONS[h.cls].tiers[weaponTier(h)];
    if (!tier) throw new Error(`Missing crafted weapon tier ${h.cls}:${weaponTier(h)}`);
    fx.text(p.x, p.y + PERSON * 1.9, p.z, tier.name, 'status level', 1.5);
    v.oneShot('Cheering', 1.3);
  });
}
