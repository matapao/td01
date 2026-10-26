import * as THREE from 'three';
import { DAMAGE_INFO, ENEMIES } from '../../game/content.ts';
import { PERSON } from '../characters.ts';
import { gh, type ViewCtx } from './context.ts';
import { EnemyView } from './enemy.ts';
import type { EntityEventState } from './event-state.ts';

export function hookEnemyEvents(
  ctx: ViewCtx,
  state: Pick<EntityEventState, 'enemies' | 'raisedFrom' | 'byCorpse' | 'dying'>,
): void {
  const { sim, fx } = ctx;
  const ev = sim.events;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, gh(ctx, x, z) + dy, z);
  ev.on('enemyLeaked', (e) => {
    const en = sim.getAs(e.id, 'enemy');
    if (!en) return;
    const p = at(en.x, en.z, 0.3);
    fx.burst(p.x, p.y, p.z, 18, {
      color: '#8a6f55',
      speed: 2.4,
      up: 2.6,
      size: 0.3,
      gravity: 9,
      tex: 'chunk',
      additive: false,
      life: 0.9,
    });
    fx.burst(p.x, p.y + 0.3, p.z, 16, {
      color: '#ff5a3a',
      color1: '#5a0a0a',
      speed: 1.8,
      up: 2.6,
      size: 0.4,
      gravity: -0.5,
      tex: 'smoke',
      life: 1.2,
    });
    fx.text(p.x, p.y + 1.1, p.z, `BROKE IN −${e.damage}`, 'status enrage', 1.4);
    ctx.shake(0.35, en.x, en.z);
  });
  ev.on('enemyHit', (e) => {
    const v = state.enemies.get(e.id);
    const info = DAMAGE_INFO[e.type];
    if (v)
      v.ch.hit(
        e.type === 'fire' ? '#ff9a3c' : e.type === 'frost' ? '#9fe8ff' : '#ffffff',
        e.crit || e.shatter ? 1.3 : 0.8,
      );
    const p = v ? v.ch.root.position : at(e.x, e.z);
    const h = v ? v.height : 1.5;
    const amt = Math.max(1, Math.round(e.amount));
    const weak = e.mult >= 1.2 ? ' weak' : e.mult <= 0.7 ? ' resist' : '';
    fx.text(
      p.x,
      p.y + h + 0.2,
      p.z,
      e.shatter ? `${amt} SHATTER!` : e.crit ? `${amt}!` : String(amt),
      `dmg dmg-${e.type}${e.crit ? ' crit' : ''}${weak}${e.shatter ? ' shatter' : ''}`,
      e.crit || e.shatter ? 1.1 : 0.75,
    );
    if (e.type === 'fire' && e.amount < 12) return;
    fx.burst(p.x, p.y + h * 0.55, p.z, e.crit ? 10 : 5, {
      color: info.color,
      speed: 1.8,
      up: 1.2,
      size: 0.09,
      gravity: 6,
      tex: e.type === 'pierce' || e.type === 'slash' ? 'spark' : e.type === 'arcane' ? 'star' : 'dot',
      stretch: 2,
      life: 0.35,
    });
    if (ENEMIES[sim.getAs(e.id, 'enemy')?.kind ?? 'minion'].armorClass === 'bone' && e.type === 'impact') {
      fx.burst(p.x, p.y + h * 0.5, p.z, 6, {
        color: '#efe6cc',
        speed: 2,
        up: 1.8,
        size: 0.08,
        gravity: 10,
        tex: 'chunk',
        additive: false,
        life: 0.7,
      });
    }
  });
  ev.on('status', (e) => {
    const v = state.enemies.get(e.id);
    const p = v ? v.ch.root.position : at(e.x, e.z);
    if (e.kind === 'freeze') {
      fx.burst(p.x, p.y + 0.8, p.z, 16, {
        color: '#bff3ff',
        speed: 3,
        up: 2,
        size: 0.25,
        gravity: 6,
        tex: 'star',
        life: 0.6,
      });
      fx.text(p.x, p.y + PERSON * 1.5, p.z, 'FROZEN', 'status frost', 0.9);
    } else if (e.kind === 'shatter') {
      fx.burst(p.x, p.y + 0.8, p.z, 26, {
        color: '#dff8ff',
        speed: 6,
        up: 4,
        size: 0.3,
        gravity: 14,
        tex: 'chunk',
        additive: false,
        life: 0.8,
      });
      fx.ring(p.x, p.y, p.z, 0.3, 2.4, '#bff3ff', 0.4);
      ctx.shake(0.25, p.x, p.z);
    }
  });
  ev.on('enemySpawned', (e) => {
    const en = sim.getAs(e.id, 'enemy');
    if (!en) return;
    state.enemies.set(e.id, new EnemyView(ctx, en, state.raisedFrom.has(e.id)));
  });
  ev.on('corpseRaised', (e) => {
    const dv = state.byCorpse.get(e.corpse);
    if (dv) {
      dv.dispose();
      // Keep the coordinator's array identity while removing this corpse's animation.
      for (let i = state.dying.length - 1; i >= 0; i--) if (state.dying[i] === dv) state.dying.splice(i, 1);
      state.byCorpse.delete(e.corpse);
    }
    const v = state.enemies.get(e.enemy);
    if (v) {
      v.ch.once('Skeletons_Death_Resurrect', v.anims.walk, 2.2);
      const p = v.ch.root.position;
      fx.burst(p.x, p.y + 0.5, p.z, 18, {
        color: '#7dff6a',
        color1: '#1f6a1a',
        speed: 1.5,
        up: 3,
        size: 0.35,
        gravity: -1,
        tex: 'rune',
        life: 1,
      });
    }
  });
  ev.on('enemyDied', (e) => {
    const v = state.enemies.get(e.id);
    if (!v) return;
    state.enemies.delete(e.id);
    v.die();
    v.corpse = e.corpse;
    if (e.corpse) state.byCorpse.set(e.corpse, v);
    state.dying.push(v);
    const p = v.ch.root.position;
    fx.burst(p.x, p.y + 0.6, p.z, 10, {
      color: '#efe6cc',
      speed: 3,
      up: 3.5,
      size: 0.2,
      gravity: 14,
      tex: 'chunk',
      additive: false,
      life: 0.9,
    });
    fx.burst(p.x, p.y + 0.8, p.z, 6, {
      color: v.ch.spec.glow ?? '#9fe8ff',
      speed: 1,
      up: 2.5,
      size: 0.4,
      gravity: -0.5,
      tex: 'dot',
      life: 0.9,
    });
    if (ENEMIES[e.kind].boss) {
      ctx.shake(0.9, p.x, p.z);
      fx.ring(p.x, p.y, p.z, 0.5, 7, '#ffd36a', 0.9);
      fx.burst(p.x, p.y + 1.5, p.z, 60, {
        color: '#ffe27a',
        speed: 8,
        up: 7,
        size: 0.4,
        gravity: 8,
        tex: 'star',
        life: 1.4,
      });
    }
  });
  ev.on('enemyAbility', (e) => {
    const p = at(e.x, e.z);
    if (e.ability === 'shield') {
      fx.ring(p.x, p.y, p.z, 0.4, 4.5, '#a77bff', 0.6);
      for (const id of e.targets) {
        const v = state.enemies.get(id);
        if (v)
          fx.burst(v.ch.root.position.x, v.ch.root.position.y + 1, v.ch.root.position.z, 8, {
            color: '#c9a8ff',
            speed: 1.5,
            up: 1,
            size: 0.25,
            gravity: 0,
            tex: 'rune',
            life: 0.7,
          });
      }
    } else if (e.ability === 'summon') {
      fx.ring(p.x, p.y, p.z, 0.5, 5, '#7dff6a', 0.8);
    } else if (e.ability === 'stomp') {
      // The Colossus brings its weapon down two-handed.
      state.enemies.get(e.id)?.slam();
      fx.ring(p.x, p.y, p.z, 0.5, 3.8, '#ffb347', 0.5);
      fx.burst(p.x, p.y + 0.2, p.z, 30, {
        color: '#8a6a4a',
        speed: 6,
        up: 2,
        size: 0.4,
        gravity: 10,
        tex: 'chunk',
        additive: false,
        life: 0.8,
      });
      ctx.shake(0.6, p.x, p.z);
    } else if (e.ability === 'enrage') {
      state.enemies.get(e.id)?.taunt();
      fx.text(p.x, p.y + 4.5, p.z, 'ENRAGED', 'status enrage', 1.4);
      fx.burst(p.x, p.y + 2, p.z, 30, {
        color: '#ff3b2f',
        speed: 4,
        up: 3,
        size: 0.4,
        gravity: 2,
        tex: 'dot',
        life: 1,
      });
    } else if (e.ability === 'dash') {
      fx.burst(p.x, p.y + 0.3, p.z, 8, {
        color: '#d8c8a8',
        speed: 2,
        up: 0.5,
        size: 0.5,
        gravity: 0,
        tex: 'smoke',
        additive: false,
        alpha: 0.5,
        life: 0.6,
      });
    }
  });
  ev.on('surfaced', (e) => {
    const p = at(e.x, e.z);
    fx.burst(p.x, p.y + 0.2, p.z, 22, {
      color: '#7a5a3a',
      speed: 3,
      up: 4,
      size: 0.35,
      gravity: 12,
      tex: 'chunk',
      additive: false,
      life: 0.9,
    });
    fx.ring(p.x, p.y, p.z, 0.3, 2.2, e.detected ? '#ffe9a8' : '#a07050', 0.5);
    if (e.detected) fx.text(p.x, p.y + 2.2, p.z, 'SPOTTED!', 'status perfect', 1.1);
  });
  ev.on('radarPulse', (e) => {
    const p = at(e.x, e.z);
    fx.ring(p.x, p.y + 0.2, p.z, 0.5, e.r, '#c18bff', 1.4, 0.35);
    for (const id of e.found) {
      const v = state.enemies.get(id);
      if (v) v.ch.hit('#c18bff', 0.5);
    }
  });
  ev.on('bolstered', (e) => {
    for (const id of e.targets) {
      const v = state.enemies.get(id);
      if (!v) continue;
      const q = v.ch.root.position;
      fx.burst(q.x, q.y + 1, q.z, 6, {
        color: '#ff8a5a',
        speed: 1,
        up: 2,
        size: 0.3,
        gravity: 0,
        tex: 'dot',
        life: 0.6,
      });
    }
  });
}
