import * as THREE from 'three';
import { classOf } from '../../game/content.ts';
import { PERSON } from '../characters.ts';
import { gh, type ViewCtx } from './context.ts';
import type { EntityEventState } from './event-state.ts';
import { CREW_COLOR } from './crew-colors.ts';

export function hookHeroEvents(
  ctx: ViewCtx,
  state: Pick<EntityEventState, 'heroes' | 'buildings' | 'enemies'>,
): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  ev.on('heroAttack', (e) => {
    const h = sim.getAs(e.hero, 'hero');
    state.heroes.get(e.hero)?.onSwing(h && classOf(h).ranged ? 'cast' : 'attack');
  });
  ev.on('crewed', (e) => {
    const h = sim.getAs(e.hero, 'hero');
    const top = state.buildings.get(e.building)?.standSpot();
    if (!top || !h) return;
    const cls = h.cls ?? 'tank';
    fx.ring(top.x, top.y + 0.05, top.z, 0.2, 1.5, CREW_COLOR[cls], 0.7);
    fx.burst(top.x, top.y + 0.4, top.z, 14, {
      color: CREW_COLOR[cls],
      speed: 1.4,
      up: 2,
      size: 0.18,
      gravity: 1,
      tex: 'star',
      life: 0.9,
    });
    fx.text(
      top.x,
      top.y + PERSON * 2,
      top.z,
      cls === 'tank' ? 'Crew: shields up' : cls === 'support' ? 'Crew: driven on' : 'Crew: enchanted bolts',
      'status level',
      1.4,
    );
  });
  ev.on('heroHit', (e) => {
    const v = state.heroes.get(e.hero);
    v?.ch.hit('#ff5a4a', 0.9);
    if (v)
      fx.text(
        v.pos.x,
        v.pos.y + PERSON * 1.6,
        v.pos.z,
        e.lethal ? 'CRUSHED' : String(Math.round(e.amount)),
        'dmg hero-hurt',
        e.lethal ? 1.2 : 0.7,
      );
  });
  ev.on('heroLevel', (e) => {
    const v = state.heroes.get(e.hero);
    if (!v) return;
    const p = v.pos;
    fx.ring(p.x, p.y, p.z, 0.3, 3, '#ffd36a', 0.8);
    fx.burst(p.x, p.y + 1, p.z, 40, {
      color: '#ffe27a',
      speed: 2,
      up: 6,
      size: 0.3,
      gravity: 3,
      tex: 'star',
      life: 1.4,
    });
    fx.text(p.x, p.y + PERSON * 2, p.z, `LEVEL ${e.level}`, 'status level', 1.6);
    v.oneShot('Cheering', 1.2);
  });
  ev.on('heroDied', (e) => {
    const v = state.heroes.get(e.hero);
    if (v) fx.text(v.pos.x, v.pos.y + PERSON * 1.7, v.pos.z, 'Fallen…', 'status dead', 1.6);
  });
  ev.on('heroRespawned', (e) => {
    const v = state.heroes.get(e.hero);
    if (!v) return;
    v.ch.once('Spawn_Ground', '', 1.2);
    const h = sim.getAs(e.hero, 'hero')!;
    fx.ring(h.x, gh(ctx, h.x, h.z), h.z, 0.3, 2.5, '#ffd36a', 0.7);
  });
  ev.on('heroCast', (e) => {
    const v = state.heroes.get(e.hero);
    if (!v) return;
    const p = v.pos;
    if (e.ability === 'repulse') {
      v.oneShot('Melee_1H_Attack_Jump_Chop', 1.8);
      setTimeout(() => {
        fx.ring(p.x, p.y, p.z, 0.4, 5, '#ffe9c0', 0.45, 0.9);
        fx.ring(p.x, p.y, p.z, 0.2, 3.5, '#ffb347', 0.35, 0.8);
        fx.burst(p.x, p.y + 0.2, p.z, 36, {
          color: '#9a7a5a',
          speed: 7,
          up: 2,
          size: 0.35,
          gravity: 10,
          tex: 'chunk',
          additive: false,
          life: 0.8,
        });
        fx.burst(p.x, p.y + 0.3, p.z, 14, {
          color: '#c9b9a0',
          speed: 4,
          up: 0.6,
          size: 0.9,
          size1: 2.2,
          gravity: 0,
          tex: 'smoke',
          additive: false,
          alpha: 0.5,
          life: 1.1,
          drag: 2,
        });
        ctx.shake(0.5, p.x, p.z);
      }, 260);
    } else if (e.ability === 'slam') {
      // Shield Bash: the shield driven into it — a crack of steel, the target reels (stun stars).
      v.oneShot('Melee_Block_Attack', 1.7);
      const t = at(e.x, e.z, PERSON * 0.7);
      fx.burst(t.x, t.y, t.z, 14, {
        color: '#ffffff',
        speed: 4,
        up: 2,
        size: 0.18,
        gravity: 6,
        tex: 'spark',
        stretch: 3,
        life: 0.3,
      });
      fx.burst(t.x, t.y + 0.25, t.z, 6, {
        color: '#ffe066',
        speed: 1,
        up: 0.6,
        size: 0.18,
        gravity: 0,
        tex: 'star',
        life: 1.2,
      });
      ctx.shake(0.18, e.x, e.z);
    } else if (e.ability === 'cry') {
      // Battle Cry: a red shout rolls out; the camp's dead nearby turn on him, jeering back.
      v.oneShot('Cheering', 1.4);
      for (const [id, ev] of state.enemies) {
        const en = sim.getAs(id, 'enemy');
        if (en?.camp && !en.flying && Math.hypot(en.x - p.x, en.z - p.z) < 6.5) ev.taunt();
      }
      fx.ring(p.x, p.y, p.z, 0.5, 6, '#ff5a3a', 0.7, 0.85);
      fx.burst(p.x, p.y + 0.6, p.z, 18, {
        color: '#ff7a4a',
        speed: 3,
        up: 1.5,
        size: 0.25,
        gravity: 0,
        tex: 'spark',
        stretch: 2,
        life: 0.5,
      });
    } else if (e.ability === 'wall') {
      v.oneShot('Melee_Block', 1.2);
      fx.ring(p.x, p.y, p.z, 0.2, 1.4, '#7fc8ff', 0.5, 0.9);
    } else if (e.ability === 'mend') {
      // Mend: green light wells up around the warchief.
      v.oneShot('Ranged_Magic_Raise', 1.3);
      fx.ring(p.x, p.y, p.z, 0.4, 7, '#7dff9a', 0.9, 0.8);
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 6.5;
        fx.glow({
          x: p.x + Math.cos(a) * r,
          y: p.y + 0.1,
          z: p.z + Math.sin(a) * r,
          vy: 1.2 + Math.random(),
          life: 1,
          size: 0.18,
          size1: 0.05,
          color: '#b6ffc4',
          tex: 'star',
        });
      }
    } else if (e.ability === 'rally') {
      // Rally: a horn call; the towers around blaze gold.
      v.oneShot('Cheering', 1.4);
      fx.ring(p.x, p.y, p.z, 0.5, 10, '#ffd36a', 0.8, 0.8);
      for (const b of state.buildings.values()) {
        if (b.b.stats && Math.hypot(b.b.x - p.x, b.b.z - p.z) < 10) {
          const m = b.muzzle();
          fx.burst(m.x, m.y, m.z, 16, {
            color: '#ffd36a',
            speed: 2,
            up: 3,
            size: 0.3,
            gravity: 1,
            tex: 'star',
            life: 1,
          });
        }
      }
    } else if (e.ability === 'fireball') {
      v.oneShot('Ranged_Magic_Shoot', 1.7);
      fx.burst(p.x, p.y + PERSON, p.z, 10, {
        color: '#ffb347',
        color1: '#ff3d00',
        speed: 2,
        up: 1,
        size: 0.25,
        gravity: 0,
        tex: 'dot',
        life: 0.4,
      });
    } else if (e.ability === 'nova') {
      // Frost Nova: a ring of ice bursts out; shards and cold mist.
      v.oneShot('Ranged_Magic_Raise', 1.6);
      fx.ring(p.x, p.y, p.z, 0.3, 5, '#bff3ff', 0.6, 0.95);
      fx.ring(p.x, p.y, p.z, 0.2, 3.5, '#7fd8ff', 0.5, 0.8);
      fx.burst(p.x, p.y + 0.2, p.z, 32, {
        color: '#dff8ff',
        speed: 6,
        up: 1,
        size: 0.16,
        gravity: 4,
        tex: 'spark',
        stretch: 2.5,
        life: 0.5,
      });
      fx.burst(p.x, p.y + 0.3, p.z, 12, {
        color: '#bfe9ff',
        speed: 3,
        up: 0.5,
        size: 0.8,
        size1: 1.8,
        gravity: 0,
        tex: 'smoke',
        additive: false,
        alpha: 0.4,
        life: 1.2,
        drag: 2,
      });
    } else if (e.ability === 'meteor') {
      // Meteor: a red sigil marks where it will fall.
      v.oneShot('Ranged_Magic_Summon', 1.4);
      const t = at(e.x, e.z, 0.05);
      fx.ring(t.x, t.y, t.z, 3, 0.4, '#ff5a3a', 0.9, 0.9);
      fx.ring(t.x, t.y, t.z, 0.4, 3, '#ffb347', 0.9, 0.6);
    }
  });
  ev.on('healed', (e) => {
    const p = at(e.x, e.z, PERSON * 1.2);
    fx.text(p.x, p.y, p.z, `+${Math.round(e.amount)}`, 'heal', 1);
    fx.burst(p.x, p.y - 0.3, p.z, 6, {
      color: '#9dffb0',
      speed: 0.8,
      up: 1.4,
      size: 0.14,
      gravity: 0,
      tex: 'star',
      life: 0.8,
    });
  });
}
