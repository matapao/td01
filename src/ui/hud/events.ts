import type { ItemId } from '../../game/item-data.ts';
import type { BasePlanId } from '../../game/content-types.ts';
import { crewText } from '../enemy-cards.ts';
import type { Game } from '../../view/game.ts';
import type { UiState } from '../state.ts';
import { ENEMIES, ITEMS, PLANS, TOWER_TOPS, STORES, buildingTitle, gemName } from '../../game/content.ts';
import { CRYPTS } from '../../game/map.ts';
import { WAVES } from '../../game/waves.ts';
import { MILESTONES, type MilestoneId } from '../../game/road.ts';
import { PAYLOADS } from '../../game/space.ts';
import type { Hero } from '../../game/entity-types.ts';

interface HudEventContext {
  readonly game: Game;
  readonly ui: UiState;
  readonly hero: () => Hero;
  readonly note: (text: string, kind?: string, sticky?: boolean) => void;
  readonly toast: (big: string, small: string) => void;
  readonly flash: (color: [number, number, number], strength: number) => void;
  readonly endScreen: (won: boolean) => void;
}

export function hookHudEvents(context: HudEventContext): void {
  const c = context;
  const ev = c.game.sim.events;
  const s = c.game.sim.state;
  ev.on('waveStarted', (e) => {
    const w = WAVES[e.wave - 1];
    if (!w) return;
    c.toast(
      `Wave ${e.wave}`,
      `${w.title}${e.early && e.bonus > 0 ? ` · +${e.bonus} gold for calling early` : ''}`,
    );
    c.note(`Wave ${e.wave}: ${w.title}`, 'bad');
    c.flash([1, 0.35, 0.2], 0.35);
  });
  ev.on('waveCleared', (e) => {
    const scrolls = e.loot.scrolls?.map((p) => PLANS[p].name).join(', ');
    // Cleared only if none broke in; otherwise the wave is just over.
    const title =
      e.leaked > 0
        ? `Wave ${e.wave} over — ${e.leaked} ${e.leaked === 1 ? 'life' : 'lives'} lost`
        : `Wave ${e.wave} cleared`;
    c.toast(title, `+${e.bonus} gold${scrolls ? ` · new scrolls: ${scrolls}` : ''}`);
    c.note(`${title} (+${e.bonus} gold)`, e.leaked > 0 ? 'bad' : 'good');
    if (e.wave < WAVES.length)
      c.note(
        'Repair break: the gate is open. H mounts your horse; dismount and use F at damaged towers with a hammer and supplies.',
        'info',
        true,
      );
  });
  ev.on('laneOpened', (e) => {
    const lane = c.game.sim.world.lanes[e.lane];
    if (!lane || lane.def.opensAtWave <= 1) return;
    c.toast(
      lane.def.trail ? 'A new route!' : `The ${CRYPTS[lane.def.crypt]} opens!`,
      lane.def.trail
        ? `The dead can now take the ${lane.def.name}.`
        : `They will come down the ${lane.def.name} too.`,
    );
  });
  ev.on('livesLost', () => c.flash([1, 0.15, 0.1], 0.55));
  const mine = (e: { hero?: number }) => e.hero === undefined || e.hero === c.ui.heroId;
  ev.on('pickedUp', (e) => {
    if (e.inst && mine(e)) c.note(`Found ${e.inst.name}`, `loot${e.inst.rarity}`);
  });
  ev.on('crateOpened', (e) => mine(e) && c.note(`The crate held ${e.inst.name}!`, `loot${e.inst.rarity}`));
  ev.on('chestOpened', (e) => {
    const chest = c.game.sim.getAs(e.chest, 'chest');
    c.note(`Opened ${chest?.name ?? 'a chest'}`, 'gold');
  });
  ev.on('scrollFound', (e) => c.note(`Plan scroll: ${PLANS[e.plan].name} → library`, 'good'));
  ev.on('powerOn', () =>
    c.note(
      'Electricity! The watermill turns its dynamo. New plans in your library: Power Pole and Electric Lamp — carry the power home.',
      'good',
      true,
    ),
  );
  ev.on('learned', (e) => {
    if (!mine(e)) return;
    c.toast('Plan learned', PLANS[e.plan].name);
    c.note(`Learned ${PLANS[e.plan].name}`, 'good');
  });
  ev.on('storeDiscovered', (e) => {
    c.toast('Discovered', STORES[e.store].name);
    c.note(`Discovered ${STORES[e.store].name}`, 'info');
  });
  ev.on(
    'bought',
    (e) =>
      mine(e) &&
      c.note(
        `Bought ${e.inst?.name ?? (e.torch ? 'Pitchwood Torch — L toggles the flame' : e.kit ? 'Crafter Kit' : e.scroll ? `${PLANS[e.scroll].name} scroll` : `${e.count} ${ITEMS[e.item!].name}`)} (−${e.cost}g)`,
        'gold',
      ),
  );
  ev.on(
    'rideLift',
    (e) =>
      mine(e) &&
      c.note(
        e.down
          ? `You ride the lift down into ${c.game.sim.state.mines[e.mine]?.name ?? 'the mine'}`
          : 'Back up into the daylight',
        'info',
      ),
  );
  ev.on('crewed', (e) => {
    if (!mine(e)) return;
    const b = c.game.sim.getAs(e.building, 'building');
    c.note(`You crew the ${b ? buildingTitle(b) : 'tower'} from the wall — ${crewText(c.hero())}`, 'info');
  });
  ev.on('boughtOut', (e) => mine(e) && c.note(`Porters brought the rest of the parts (−${e.cost}g)`, 'gold'));
  // The gate under the dead's blows: word as each quarter of its strength goes, and when it breaks.
  let gateQuarter = 4;
  ev.on('gateHit', (e) => {
    const q = Math.ceil((e.hp / c.game.sim.state.gate.maxHp) * 4);
    if (q < gateQuarter && q > 0)
      c.note(`The gate is buckling under the dead — ${q * 25}% of its strength left`, 'bad');
    gateQuarter = q;
  });
  ev.on('gateRepaired', (e) => (gateQuarter = Math.ceil((e.hp / c.game.sim.state.gate.maxHp) * 4)));
  ev.on('gateMoved', (e) => {
    if (e.broken) c.note('The gate is broken — the dead pour in! Mend it at its winch.', 'bad');
    else if (e.shut && mine(e)) c.note('The gate swings shut again', 'good');
  });
  ev.on(
    'sold',
    (e) =>
      mine(e) && c.note(`Sold ${e.inst?.name ?? `${e.count} ${ITEMS[e.item!].name}`} (+${e.gain}g)`, 'gold'),
  );
  ev.on('buildingDestroyed', (e) => c.note(`A ${e.kind} was destroyed!`, 'bad'));
  ev.on('buildingDone', (e) =>
    c.note(
      `${PLANS[Object.keys(PLANS).find((k) => PLANS[k as BasePlanId].type === 'building' && (PLANS[k as BasePlanId] as { building: string }).building === e.kind) as BasePlanId]?.name ?? e.kind} finished`,
      'good',
    ),
  );
  ev.on('invented', (e) => {
    if (e.hero !== c.ui.heroId) return;
    const ms = MILESTONES[e.milestone as MilestoneId];
    if (!ms) return;
    if (e.quality > 0) {
      c.toast(`Invented: ${ms.name}`, ms.principle);
      c.note(
        `${ms.name} invented${e.quality === 2 ? ' — perfectly' : ''}. Field Notes: ${ms.principle}`,
        'good',
      );
    }
  });
  ev.on('launched', (e) =>
    c.note(
      `Lift-off: ${PLANS[e.payload].name}${e.home ? ' — the minerals are on their way home' : ''}`,
      'good',
    ),
  );
  ev.on('flightPhase', (e) => {
    const name = e.home ? 'The capsule' : PLANS[e.payload].name;
    if (e.phase === 'cruise')
      c.note(`${name}: in cruise — ${e.home ? 'on its way home' : 'out through the dark'}`, 'info');
    else if (e.phase === 'braking')
      c.toast(
        `${name}: braking burn`,
        'No air out there to slow it: it turns and burns its rockets against its speed.',
      );
    else if (e.phase === 'descent')
      c.note(`${name}: powered descent — down on its rockets, legs out`, 'info');
    else if (e.phase === 'entry')
      c.toast(`${name}: entry`, "Behind its heat shield, it burns into the vale's air.");
    else if (e.phase === 'parachute') c.note(`${name}: parachute out`, 'info');
  });
  ev.on('landed', (e) => {
    const what = PLANS[e.payload].name;
    if (e.home)
      c.toast(
        'Home',
        `The capsule came down by the keep — ${
          Object.entries(e.cargo)
            .map(([k, n]) => `${n} ${ITEMS[k as ItemId].name}`)
            .join(', ') || 'with its crew'
        }.`,
      );
    else c.toast(`${what} landed`, PAYLOADS[e.payload].does);
  });
  ev.on('topBuilt', (e) =>
    c.note(
      `${TOWER_TOPS[e.top as 1 | 2 | 3]?.name ?? 'A new top'} built on the tower — ${e.top >= 2 ? 'the archer is out of reach of flyers' : ''}${e.top === 3 ? ', and sees further' : ''}`,
      'good',
    ),
  );
  ev.on('gemSet', (e) => {
    const b = c.game.sim.getAs(e.building, 'building');
    c.note(`${b ? gemName(b, e.gem) : PLANS[e.gem].name} set into the tower`, 'good');
  });
  ev.on('devMode', (e) =>
    c.note(
      e.on
        ? 'Dev mode on — everything free and at once, unlimited health and gold (` to turn it off)'
        : 'Dev mode off',
      'info',
    ),
  );
  ev.on('campCleared', (e) => c.note(`Cleared ${e.name}`, 'good'));
  ev.on('heroDied', (e) => {
    if (e.hero !== c.ui.heroId || !e.by) return;
    const killer = c.game.sim.getAs(e.by, 'enemy');
    if (killer && !killer.camp)
      c.note(
        `Crushed by a ${ENEMIES[killer.kind].name}. The dead on the roads are beyond any hero: leave them to the towers.`,
        'bad',
      );
  });
  ev.on('denied', (e) => {
    if (e.hero === c.ui.heroId || e.hero === 0) c.ui.hint(e.reason);
  });
  ev.on('shopOpen', (e) => {
    if (e.hero === c.ui.heroId) c.ui.window = { kind: 'shop', store: e.store };
  });
  ev.on('storageOpen', (e) => {
    if (e.hero === c.ui.heroId) c.ui.window = { kind: 'storage' };
  });
  ev.on('heroLevel', (e) => mine(e) && c.note(`Level ${e.level}!`, 'good'));
  ev.on('gameOver', (e) => c.endScreen(e.won));
  void s;
}
