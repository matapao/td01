import { guidePreference } from './preferences.ts';
/**
 * The invisible tutorial: a short chain of objectives that follow the natural flow
 * (plan → gather → deliver → assemble → defend → learn → mine → socket → craft → scout), plus one-time hints.
 */
import type { Game } from '../view/game.ts';
import type { Hero } from '../game/types.ts';
import { OVER_WALL, CRAFTER_KIT } from '../game/content.ts';
import { outsideWalls } from '../game/map.ts';
const hasGem = (g: Game, gem: 'seer') => g.sim.state.buildings.some((b) => b.gems.includes(gem));

export interface Objective {
  id: string;
  title: string;
  sub: string;
  /** UI element to pulse while this objective is current. */
  pulse?: string;
  done: (g: Game, h: Hero) => boolean;
}

const OBJECTIVES: Objective[] = [
  {
    id: 'tools',
    title: 'Get the Crafter Kit',
    sub: 'Enter the shop beside the workshop, then press F at the counter. Buy one Crafter Kit: axe, pickaxe, shovel, hammer, scanner and reusable seed pouch (34 gold). A reusable mine torch costs 5 more gold; L toggles it.',
    done: (_g, h) => CRAFTER_KIT.tools.every((tool) => h.tools.includes(tool)),
  },
  {
    id: 'visitMine',
    title: 'Take the lift into the mine',
    sub: 'Walk to the mine entrance and press F. The lift takes you to the arrival bay. V scans the rock; the preparation bench explains starter charges.',
    done: (g, h) => !!h.visitedMine || g.sim.state.firstTowerAt >= 0,
  },
  {
    id: 'gather',
    title: 'Gather 4 wood and 4 stone',
    sub: 'Chop a village pine. In the mine, aim at an exposed face and right-click to chip out tiny blocks; hold Shift to clear a wider patch. You can aim higher on the wall. The three old workings lead to occupied pockets and richer seams.',
    done: (g, h) =>
      ((h.bag.wood ?? 0) >= 4 && (h.bag.stone ?? 0) >= 4) ||
      !!g.sim.state.towerCrates?.length ||
      g.sim.state.firstTowerAt >= 0,
  },
  {
    id: 'fabricate',
    title: 'Build at the workshop platform',
    sub: 'Return on the lift and enter the workshop. At its construction platform, press F. Load 4 wood and 4 stone, then hammer the tower sections together. The packed tower goes into storage.',
    done: (g) => !!g.sim.state.towerCrates?.some((c) => c.ready) || g.sim.state.firstTowerAt >= 0,
  },
  {
    id: 'coordinate',
    title: 'Choose where the tower will stand',
    sub: 'Climb the stairs beside the gate. Press F at the overview table on the landing. Select the stored tower, choose clear ground beside a road, and confirm shipment.',
    done: (g) => !!g.sim.state.towerCrates?.some((c) => c.shipment) || g.sim.state.firstTowerAt >= 0,
  },
  {
    id: 'deployed',
    title: 'Watch the shipment deploy',
    sub: 'The wagon follows the road to your reserved position. Its crew deploys the tower there. That completes your first gathering, construction and deployment cycle; the first attack waits until it is ready.',
    done: (g) => g.sim.state.firstTowerAt >= 0,
  },
  {
    id: 'wave1',
    title: 'Let the tower hold the North Road',
    sub: 'The first dead come from the North Crypt to the gate. They are far beyond any hero — one blow kills you — but they cannot reach the wall-walk. Stand up there by your tower: you crew it, and its archer shoots faster and further.',
    done: (g) => g.sim.state.waveCleared[0] === true,
  },
  {
    id: 'gate',
    title: 'Hold the gate',
    sub: "The gate stands shut: the dead that walk the roads stop at its doors and batter them — its strength is the bar over the gateway — under your towers' fire. When it breaks they pour in. Mend it at its winch inside (F) with wood, stone, planks or blocks and a hammer.",
    done: (g) => g.sim.state.wave >= 3 || g.sim.state.gate.repairBuf > 0,
  },
  {
    id: 'repairBreak',
    title: 'Prepare between waves',
    sub: 'When the road is clear, mount a stable horse with H, ride out to repair your towers, or gather supplies for another tower kit. Return before the next attack.',
    done: () => false,
  },
];

export class Guide {
  private game: Game;
  private hint: (text: string, kind?: string) => void;

  private hinted = new Set<string>();
  /** Objectives once met stay met (going back up a mine doesn't undo having been down). */
  private met = new Set<string>();
  constructor(game: Game, hint: (text: string, kind?: string) => void) {
    this.game = game;
    this.hint = hint;

    const ev = game.sim.events;
    const once = (key: string, text: string, kind = 'info') => {
      if (guidePreference() === 'off' || this.hinted.has(key)) return;
      this.hinted.add(key);
      this.hint(text, kind);
    };
    const mine = (e: { hero?: number }) => e.hero === undefined || e.hero === game.localHero;
    ev.on(
      'bagFull',
      (e) =>
        mine(e) &&
        once(
          'bag',
          'Your bag is full — deliver parts to a plan or a workshop, or store them at the storehouse by the market (F).',
        ),
    );
    ev.on('denied', (e) => {
      if (mine(e) && e.reason.startsWith('Workshops stand inside the walls'))
        once(
          'town',
          'Workshops stand in town, inside the walls — the work is done indoors. Beyond the wall only towers stand.',
        );
      if (mine(e) && e.reason.startsWith('The attack is underway'))
        once(
          'overwall',
          'During attacks, work towers from the wall-walk. Once the roads are clear, ride through the open gate, dismount with H and repair damaged towers with F, a hammer and supplies.',
        );
    });
    ev.on(
      'gateMoved',
      (e) =>
        e.broken &&
        once(
          'gatebroke',
          'The gate is broken! The dead pour in — mend it at its winch (wood, stone, planks or blocks, and a hammer): a third of the way mended, it swings shut again.',
          'bad',
        ),
    );
    ev.on('buildingHit', (e) => {
      const b = game.sim.getAs(e.building, 'building');
      if (b && b.hp < b.maxHp * 0.6)
        once(
          'repair',
          'A building is damaged — bring wood, stone, planks or blocks and press F at it to repair it. Ride out after a wave clears, dismount with H, then repair at the tower.',
          'bad',
        );
    });
    ev.on('enemyLeaked', () =>
      once(
        'leak',
        'Leaks cost keep lives. More towers, gems in their windows, or you on the wall-walk crewing a tower.',
        'bad',
      ),
    );
    ev.on('dropSpawned', (e) => {
      if (e.item === 'gold' && outsideWalls(e.x, e.z))
        once(
          'spoils',
          `The dead's spoils lie out on the field. Walk the wall-walk: what lies within ${OVER_WALL.haul} m comes up to you — look at the rest and press F to haul it up.`,
        );
    });
    ev.on('burrowed', () => {
      if (!hasGem(game, 'seer'))
        once(
          'dig',
          "Something is digging under the vale… a Seer's Emerald in a tower would force it up.",
          'bad',
        );
    });
    ev.on('routeChosen', () =>
      once('trail', 'The dead are taking the Hollow Trail around your towers!', 'bad'),
    );
    ev.on(
      'rideLift',
      (e) =>
        mine(e) &&
        e.down &&
        once(
          'mine',
          'Bring a Pitchwood Torch from the shop — L lights or extinguishes it. Face rock and press X or click Dig to excavate. F rides the lift. Right-click chips out tiny blocks; Shift clears a wider patch. V opens the scanner. Your cuts are permanent, and waves still come above.',
        ),
    );
    ev.on(
      'rideEnd',
      (e) =>
        mine(e) &&
        once(
          'wagon',
          'Out at the stop. Its wagon rides you back (F); the next one rides on deeper — richer rock, fiercer guards.',
        ),
    );
    ev.on('caveInCleared', () =>
      once('cavein', 'The cave-in is down: the line beyond is open for good.', 'good'),
    );
    ev.on('scrollFound', () =>
      once('scroll', 'A plan scroll went into your library — open the Plan Book (P) to study it.', 'good'),
    );
    ev.on('denied', (e) => {
      if (mine(e) && e.reason.startsWith('Learn'))
        once('learn', 'Plans must be learned before you can place them — Plan Book (P).');
    });
  }

  /** Current + recently finished objectives for the tracker. */
  current(): { obj: Objective; done: boolean }[] {
    if (guidePreference() === 'off') return [];
    const g = this.game;
    const h = g.sim.getAs(g.localHero, 'hero') ?? g.sim.state.heroes[0];
    if (!h) return [];
    const out: { obj: Objective; done: boolean }[] = [];
    for (const o of OBJECTIVES) {
      const done = this.met.has(o.id) || o.done(g, h);
      if (done) {
        this.met.add(o.id);
        continue;
      }
      out.push({ obj: o, done });
      break;
    }
    return out;
  }

  pulse(): string | null {
    const c = this.current()[0];
    return c?.obj.pulse ?? null;
  }
}
