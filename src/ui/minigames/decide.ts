export type { DecideCell } from './decide-data.ts';
export type { DecideIcon } from './decide-data.ts';
export type { DecideInput } from './decide-data.ts';
export type { DecideOutput } from './decide-data.ts';
export type { DecidePart } from './decide-data.ts';
export type { DecideLogic } from './decide-data.ts';
export type { DecideOp } from './decide-data.ts';
export type { DecideProgram } from './decide-data.ts';
export type { DecideWords } from './decide-data.ts';
export type { DecideParams } from './decide-data.ts';
export { DECIDE_EXAMPLES } from './decide-data.ts';
import { DECIDE_EXAMPLES } from './decide-data.ts';
import type { DecideParams } from './decide-data.ts';
/**
 * Decide (TECH_LINEAGE §4): set up logic or a program, then test it and watch it act.
 *
 * - 'logic' (relays): place switches on a ladder so a lamp, a gate or a bell acts on its own. Switches
 *   in a chain mean AND, side by side OR, and a relay that opens means NOT. Flip the conditions to see
 *   the current find its way; "Test it" runs every case through the truth table. Right in every case
 *   is good; right with the fewest switches is perfect.
 * - 'program' (punched cards): put instruction cards in order — MOVE, TURN, IF ROCK, DRILL, REPEAT —
 *   and run them: the rover (or cart, or cutter) follows the cards exactly. Reaching every target is
 *   good; doing it with the fewest cards is perfect.
 *
 * The playground runs the demo; `?minigame=decide&demo=<name>` runs one of DECIDE_EXAMPLES instead.
 */
import type { MinigameDef } from './types.ts';
import { createLogic } from './decide-logic.ts';
import { createProgram } from './decide-program.ts';

/** The playground's set-up: `?demo=<name>` picks an example. */
function pickDemo(): DecideParams {
  const name = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demo');
  return name && Object.hasOwn(DECIDE_EXAMPLES, name)
    ? DECIDE_EXAMPLES[name as keyof typeof DECIDE_EXAMPLES]
    : DECIDE_EXAMPLES['lamps'];
}

export const decide: MinigameDef<DecideParams> = {
  kind: 'decide',
  name: 'Decide',
  demo: pickDemo(),
  create: (host, p) => (p.mode === 'program' ? createProgram(host, p) : createLogic(host, p)),
};

// ---- Shared drawing -----------------------------------------------------------------------------
