/** Load only the kind required by this milestone, preserving its exact setup. */
import { MILESTONES, type MilestoneId } from '../../game/road.ts';
import { loadMinigame } from './load.ts';
export const milestoneGame = (id: MilestoneId) => loadMinigame(MILESTONES[id].kind, id);
