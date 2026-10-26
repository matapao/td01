import * as THREE from 'three';
import { ITEMS } from '../../game/content.ts';
import { PERSON } from '../characters.ts';
import { gh, type ViewCtx } from './context.ts';
import type { EntityEventState } from './event-state.ts';

export function hookLootEvents(
  ctx: ViewCtx,
  state: Pick<
    EntityEventState,
    'spawnPorter' | 'pendingDrops' | 'drops' | 'heroes' | 'collecting' | 'keeper'
  >,
): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  ev.on('boughtOut', (e) => {
    const p = at(e.x, e.z, 0.2);
    fx.burst(p.x, p.y + 1.2, p.z, 24, {
      color: '#ffd36a',
      speed: 2.2,
      up: 2.5,
      size: 0.09,
      gravity: 7,
      tex: 'star',
      life: 1.1,
    });
    fx.burst(p.x, p.y, p.z, 14, {
      color: '#c9b9a0',
      speed: 2,
      up: 0.4,
      size: 0.35,
      size1: 0.9,
      gravity: 0,
      tex: 'smoke',
      additive: false,
      alpha: 0.5,
      life: 1.0,
      drag: 2,
    });
    fx.text(p.x, p.y + 2.2, p.z, `Parts delivered −${e.cost}g`, 'gold-gain', 1.4);
    state.spawnPorter(e.x, e.z);
  });
  ev.on('dropSpawned', (e) => state.pendingDrops.set(e.id, { fromX: e.fromX, fromZ: e.fromZ }));
  ev.on('pickedUp', (e) => {
    const v = state.drops.get(e.drop);
    const h = state.heroes.get(e.hero);
    if (e.item !== 'gold') h?.gesture(sim.getAs(e.hero, 'hero'), 'PickUp');
    if (v && h) {
      v.collect(h.pos);
      state.drops.delete(e.drop);
      state.collecting.push(v);
    }
    if (e.item === 'gold' && h)
      fx.text(h.pos.x, h.pos.y + PERSON * 1.7, h.pos.z, `+${e.amount}`, 'gold-gain', 0.8);
    if (e.inst && h) fx.text(h.pos.x, h.pos.y + 2.6, h.pos.z, e.inst.name, `loot r${e.inst.rarity}`, 1.6);
  });
  ev.on('delivered', (e) => {
    const h = state.heroes.get(e.hero);
    const tgt = sim.get(e.target);
    if (!h || !tgt || (tgt.type !== 'site' && tgt.type !== 'building')) return;
    h.gesture(sim.getAs(e.hero, 'hero'), 'Interact');
    for (let i = 0; i < Math.min(5, e.count); i++) {
      setTimeout(() => {
        const p = at(tgt.e.x, tgt.e.z, 1);
        fx.glow({
          x: h.pos.x,
          y: h.pos.y + 1.2,
          z: h.pos.z,
          vx: (p.x - h.pos.x) * 2.2,
          vy: 4,
          vz: (p.z - h.pos.z) * 2.2,
          gravity: 8,
          life: 0.45,
          size: 0.35,
          color: ITEMS[e.item].color,
          tex: 'star',
        });
      }, i * 70);
    }
  });
  ev.on('collected', (e) => state.heroes.get(e.hero)?.gesture(sim.getAs(e.hero, 'hero'), 'PickUp'));
  ev.on('deposited', (e) => state.heroes.get(e.hero)?.gesture(sim.getAs(e.hero, 'hero'), 'Interact'));
  ev.on('shopOpen', (e) => state.keeper(e.store)?.ch.once('Waving', 'Idle_A', 1.2));
  ev.on('bought', (e) => state.keeper(e.store)?.ch.once('Interact', 'Idle_A', 1.4));
  ev.on('sold', (e) => state.keeper(e.store)?.ch.once('Interact', 'Idle_A', 1.4));
  ev.on('chestOpened', (e) => {
    state.heroes.get(e.hero)?.gesture(sim.getAs(e.hero, 'hero'), 'Interact');
    const p = at(e.x, e.z);
    fx.burst(p.x, p.y + 1, p.z, 40, {
      color: '#ffe27a',
      speed: 3,
      up: 5,
      size: 0.3,
      gravity: 6,
      tex: 'star',
      life: 1.2,
    });
    fx.ring(p.x, p.y, p.z, 0.4, 3, '#ffd36a', 0.6);
  });
}
