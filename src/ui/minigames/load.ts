/** Bind the matching parameters to their factory before erasing their generic type. */
import { MILESTONES, type AgeId, type MilestoneId } from '../../game/road.ts';
import type { MinigameKind, MinigameDef, MinigameHost, Minigame } from './types.ts';
export interface PreparedMinigame {
  kind: MinigameKind;
  name: string;
  age?: AgeId;
  create(host: MinigameHost): Minigame;
}
function prepare<P>(
  def: MinigameDef<P>,
  id?: MilestoneId,
  setups: Partial<Record<MilestoneId, P>> = {},
): PreparedMinigame {
  const params = id ? (setups[id] ?? def.demo) : def.demo;
  const setupId = (Object.keys(setups) as MilestoneId[]).find((k) => setups[k] === params);
  return {
    kind: def.kind,
    name: def.name,
    ...(setupId ? { age: MILESTONES[setupId].age } : {}),
    create: (host) => def.create(host, params),
  };
}
/** Each branch is a separate asynchronous entry. Loading one kind never imports another. */
export async function loadMinigame(kind: MinigameKind, id?: MilestoneId): Promise<PreparedMinigame> {
  switch (kind) {
    case 'band': {
      const { band, BAND_EXAMPLES } = await import('./band.ts');
      const { feedback } = id === 'feedback' ? await import('./custom-setups.ts') : { feedback: undefined };
      return prepare(band, id, {
        glass: BAND_EXAMPLES.glass,
        steam: BAND_EXAMPLES.steam,
        entry: BAND_EXAMPLES.landing,
        isru: BAND_EXAMPLES.oxygen,
        ...(feedback ? { feedback: feedback(BAND_EXAMPLES.kiln) } : {}),
      });
    }
    case 'ratio': {
      const { ratio, RATIO_DEMOS } = await import('./ratio.ts');
      return prepare(ratio, id, { bronze: RATIO_DEMOS['bronze'], steel: RATIO_DEMOS['steel'] });
    }
    case 'sizes': {
      const { sizes, SIZES_DEMOS } = await import('./sizes.ts');
      return prepare(sizes, id, {
        gears: SIZES_DEMOS['gears'],
        battery: SIZES_DEMOS['cells'],
        rocketry: SIZES_DEMOS['rocket'],
      });
    }
    case 'path': {
      const { path, PATH_EXAMPLES } = await import('./path.ts');
      return prepare(path, id, {
        rails: PATH_EXAMPLES['rails'],
        grid: PATH_EXAMPLES['towers'],
        rover: PATH_EXAMPLES['rover'],
      });
    }
    case 'beat': {
      const { beat } = await import('./beat.ts');
      return prepare(beat, id);
    }
    case 'steady': {
      const { steady } = await import('./steady.ts');
      return prepare(steady, id);
    }
    case 'separate': {
      const { separate, SEPARATE_EXAMPLES } = await import('./separate.ts');
      return prepare(separate, id, { silicon: SEPARATE_EXAMPLES['zone'] });
    }
    case 'order': {
      const { order, ORDER_DEMOS } = await import('./order.ts');
      const { ROBOTS } = id === 'robots' ? await import('./custom-setups.ts') : { ROBOTS: undefined };
      return prepare(order, id, {
        arch: ORDER_DEMOS['arch'],
        payload: ORDER_DEMOS['lander'],
        homeward: ORDER_DEMOS['capsule'],
        ...(ROBOTS ? { robots: ROBOTS } : {}),
      });
    }
    case 'decide': {
      const { decide, DECIDE_EXAMPLES } = await import('./decide.ts');
      return prepare(decide, id, { relay: DECIDE_EXAMPLES['lamps'], computer: DECIDE_EXAMPLES['cutter'] });
    }
    case 'sweet': {
      const { sweet, SWEET_DEMOS } = await import('./sweet.ts');
      return prepare(sweet, id, {
        searchlight: SWEET_DEMOS['focus'],
        radio: SWEET_DEMOS['radio'],
        solar: SWEET_DEMOS['solar'],
      });
    }
    case 'observe': {
      const { observe, OBSERVE_EXAMPLES } = await import('./observe.ts');
      return prepare(observe, id, { radar: OBSERVE_EXAMPLES['radar'] });
    }
    case 'encode': {
      const { encode, ENCODE_EXAMPLES } = await import('./encode.ts');
      return prepare(encode, id, { telegraph: ENCODE_EXAMPLES['telegraph'] });
    }
  }
}
