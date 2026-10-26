/** Tool eligibility and retargeting for an exhausted gathering node. */
import type { Sim } from '../../sim.ts';
import type { Hero, Id } from '../../entity-types.ts';
import type { NodeKind } from '../../content-types.ts';
import { NODE_TOOL, TOOLS } from '../../content/equipment.ts';
import { dist } from '../../../core/math.ts';
import { underground } from '../mining-rules.ts';

/** Chopping needs an axe, mining a pickaxe, digging a shovel. Says so when it's missing. */
export function hasToolFor(sim: Sim, h: Hero, kind: NodeKind): boolean {
  const tool = NODE_TOOL[kind];
  if (sim.state.dev || h.tools.includes(tool)) return true;
  sim.emit('denied', {
    hero: h.id,
    reason: `You need a ${TOOLS[tool].name.toLowerCase()} — buy the Crafter Kit at the counter inside the shop`,
  });
  return false;
}

export function nearestNode(sim: Sim, h: Hero, kind: string, x: number, z: number): Id | null {
  let best: Id | null = null;
  let bd = 4.5;
  for (const n of sim.state.nodes) {
    if (n.kind !== kind || n.amount <= 0) continue;
    const d = dist(n.x, n.z, x, z);
    // (Down the mine nothing is fogged: the next face of the same ore is as good as found.)
    if (d < bd && (sim.isExplored(n.x, n.z) || underground(n.x))) {
      bd = d;
      best = n.id;
    }
  }
  return best && dist(h.x, h.z, x, z) < 30 ? best : null;
}
