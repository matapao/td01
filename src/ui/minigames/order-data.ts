/** How a part put in too early shows it: it falls off, burns up, or jams. */
export type OrderLook = 'fall' | 'burn' | 'jam';

/**
 * What a part looks like and where it goes. In an arch: the footings, the wooden centring, the lower
 * and upper stones, the keystone, the fill and road. In a stack: the shapes below, each in its `box`.
 */
export type OrderShape =
  | 'abutments'
  | 'centring'
  | 'lower'
  | 'upper'
  | 'keystone'
  | 'road'
  | 'block'
  | 'adapter'
  | 'panels'
  | 'legs'
  | 'module'
  | 'rover'
  | 'capsule'
  | 'crate'
  | 'shield'
  | 'chute'
  | 'engine'
  | 'fairing';

/** A part: its name and colour, what it's for, and what has to be in before it. */
export interface OrderPart {
  /** Its id, as `needs` and `order` name it. */
  id: string;
  /** Its name on the tray ('Keystone'). */
  name: string;
  /** Its colour ('#rrggbb'). */
  colour: string;
  /** What it's for, in a line: shown when the pointer is on it, and as the first-time hint. */
  hint?: string;
  /** The parts that must be in before it (default: the one before it in `order`). */
  needs?: string[];
  /** The why-line when it goes in too early ('The keystone fell through the gap…'). */
  early?: string;
  /** The why-line when something goes in while this part is still missing ('No heat shield: …'). */
  missing?: string;
  /** How a mistake with it shows (default: it falls; in plain slots, it jams). */
  look?: OrderLook;
  /** What it looks like (arch and stack pictures; default a plain block). */
  shape?: OrderShape;
  /** Stack only: its box [centre x, bottom, width, height], each 0–1 of the build, bottom up. */
  box?: [number, number, number, number];
}

export interface OrderParams {
  /** What's being built, over the picture ('A stone bridge over the river'). */
  what: string;
  /** The parts, in any order (the tray shuffles them); for a stack, listed back to front. */
  parts: OrderPart[];
  /** The right order (ids), for parts that don't say what they need. */
  order?: string[];
  /** The picture: an arch of stones (keystone last), a stack built on a stand, or plain numbered slots. */
  style: 'arch' | 'stack' | 'generic';
  /** The why-lines for a clean build and for one with a slip (name the principle). */
  whyPerfect: string;
  whyGood: string;
}

/** The demo set-ups: the arch by default; ?variant=lander | capsule | clock on the playground. */
export const ORDER_DEMOS: Record<'arch' | 'lander' | 'capsule' | 'clock', OrderParams> = {
  arch: {
    what: 'A stone bridge over the river',
    style: 'arch',
    parts: [
      {
        id: 'abutments',
        name: 'Footings',
        colour: '#857d70',
        shape: 'abutments',
        hint: 'stone footings on both banks: the arch pushes against them.',
      },
      {
        id: 'centring',
        name: 'Centring',
        colour: '#a8743c',
        shape: 'centring',
        needs: ['abutments'],
        hint: 'a wooden frame that holds the stones up until the arch holds itself.',
        early: 'With no footings to stand on, the frame slid into the river.',
      },
      {
        id: 'lower',
        name: 'Lower stones',
        colour: '#9a9284',
        shape: 'lower',
        needs: ['centring'],
        hint: 'the first stones, laid on the frame up from both feet.',
        early: 'No centring under them: the stones slid off into the river.',
      },
      {
        id: 'upper',
        name: 'Upper stones',
        colour: '#a59d8e',
        shape: 'upper',
        needs: ['lower'],
        hint: 'the next stones, resting on the ones below.',
        early: 'Nothing under them yet: the upper stones fell through.',
      },
      {
        id: 'keystone',
        name: 'Keystone',
        colour: '#cbbd94',
        shape: 'keystone',
        needs: ['upper'],
        hint: 'the top stone: it wedges in last and locks the arch.',
        early: 'Too soon: the keystone had nothing to wedge between — it fell.',
      },
      {
        id: 'road',
        name: 'Fill and road',
        colour: '#776f63',
        shape: 'road',
        needs: ['keystone'],
        hint: 'rubble over the arch, and the road on top.',
        early: 'The arch wasn’t locked yet: the weight of the road pushed it in.',
      },
    ],
    whyPerfect:
      'Keystone last: the arch turns the weight above it into a push along its stones — it stands on its own.',
    whyGood: 'It stands: an arch turns weight into a push along the stones, out into the banks.',
  },
  lander: {
    what: 'The payload stack, on its stand',
    style: 'stack',
    parts: [
      {
        id: 'payload',
        name: 'Habitat module',
        colour: '#e6e8ec',
        shape: 'module',
        box: [0.5, 0.5, 0.42, 0.18],
        hint: 'what it’s all for: a room to live in, out on the small grey world.',
      },
      {
        id: 'descent',
        name: 'Descent stage',
        colour: '#c9a64a',
        shape: 'legs',
        box: [0.5, 0.2, 0.62, 0.3],
        needs: ['payload'],
        hint: 'an engine and legs: it lands the payload, and stays under it.',
        early: 'The descent stage is built round what it carries — the payload has to be there first.',
      },
      {
        id: 'cruise',
        name: 'Cruise stage',
        colour: '#b9bec6',
        shape: 'panels',
        box: [0.5, 0.1, 0.62, 0.1],
        needs: ['descent'],
        hint: 'solar cells and thrusters: it flies the lander out, then drops off.',
        early: 'The cruise stage carries the lander — there was no lander yet to fix it to.',
      },
      {
        id: 'adapter',
        name: 'Adapter ring',
        colour: '#5a606a',
        shape: 'adapter',
        box: [0.5, 0.03, 0.34, 0.07],
        needs: ['cruise'],
        hint: 'bolts the whole stack onto the rocket.',
        early: 'The adapter fixes the stack to the rocket — the stack has to be built first.',
      },
      {
        id: 'fairing',
        name: 'Fairing',
        colour: '#e8ebf0',
        shape: 'fairing',
        box: [0.5, 0.03, 0.86, 0.95],
        needs: ['adapter'],
        hint: 'the nose that closes round it all for the ride up through the air.',
        early: 'The fairing closes last: anything left outside it would be torn off on the way up.',
      },
    ],
    whyPerfect:
      'Built from the payload out: each part carries the one inside it, and drops off when its job is done.',
    whyGood: 'It all fits: the payload inside, each stage round it, the fairing round the lot.',
  },
  capsule: {
    what: 'A capsule to bring the minerals home',
    style: 'stack',
    parts: [
      {
        id: 'cargo',
        name: 'Mineral cargo',
        colour: '#8d949c',
        shape: 'crate',
        box: [0.5, 0.15, 0.22, 0.14],
        needs: ['shell'],
        hint: 'what it’s all for: it rides inside the shell.',
        early: 'The cargo goes inside the shell — there was no shell yet, and it fell off the stand.',
      },
      {
        id: 'shell',
        name: 'Capsule shell',
        colour: '#dfe2e7',
        shape: 'capsule',
        box: [0.5, 0.1, 0.56, 0.38],
        hint: 'the shell the cargo rides home in.',
      },
      {
        id: 'shield',
        name: 'Heat shield',
        colour: '#4a3a30',
        shape: 'shield',
        box: [0.5, 0.02, 0.6, 0.08],
        needs: ['cargo'],
        look: 'burn',
        hint: 'a broad dish that takes the heat as the capsule falls into the air at home.',
        early: 'The heat shield seals the shell — the cargo has to be inside first.',
        missing: 'No heat shield: falling home through the air that fast, the capsule burnt up.',
      },
      {
        id: 'chute',
        name: 'Parachute',
        colour: '#c0563a',
        shape: 'chute',
        box: [0.5, 0.48, 0.14, 0.08],
        needs: ['shell'],
        hint: 'packed in a can on top: it opens once the air has slowed the capsule.',
        early: 'The parachute packs on top of the shell — there was no shell to hold it.',
        missing: 'No parachute: the capsule hit the ground far too fast.',
      },
      {
        id: 'engine',
        name: 'Return stage',
        colour: '#b9bec6',
        shape: 'engine',
        box: [0.5, 0.56, 0.36, 0.3],
        needs: ['shield', 'chute'],
        hint: 'its rocket pushes the capsule home, then it drops away before the air.',
      },
    ],
    whyPerfect: 'Cargo in, shield on, chute packed, then the stage that flies it home: it lands whole.',
    whyGood: 'It comes home whole: the shield takes the heat, the parachute the last of the speed.',
  },
  clock: {
    what: 'A clock’s gear train',
    style: 'generic',
    parts: [
      { id: 'frame', name: 'Frame', colour: '#7a5f3a', hint: 'two plates that hold every wheel in line.' },
      {
        id: 'great',
        name: 'Great wheel',
        colour: '#c9a24a',
        hint: 'turned by the falling weight: it drives the rest.',
        early: 'No frame to turn in: the great wheel just fell over.',
      },
      {
        id: 'centre',
        name: 'Centre wheel',
        colour: '#b8914a',
        hint: 'turns once an hour, carrying the minute hand.',
        early: 'Nothing to drive it yet: the centre wheel jammed.',
      },
      {
        id: 'third',
        name: 'Third wheel',
        colour: '#a8843f',
        hint: 'speeds the turning up toward the escapement.',
        early: 'With no wheel to mesh with, the third wheel jammed.',
      },
      {
        id: 'escape',
        name: 'Escape wheel',
        colour: '#d6b860',
        hint: 'lets the train turn one tooth per swing.',
        early: 'The escape wheel needs the train behind it — it jammed.',
      },
      {
        id: 'pendulum',
        name: 'Pendulum',
        colour: '#9aa0a7',
        hint: 'swings in steady time, letting the escape wheel tick.',
        early: 'Nothing to tick yet: the pendulum swung free.',
      },
    ],
    order: ['frame', 'great', 'centre', 'third', 'escape', 'pendulum'],
    whyPerfect: 'Each wheel drives the next, and the pendulum lets them tick in steady time.',
    whyGood: 'The train runs: each wheel drives the next, down to the ticking escape wheel.',
  },
};
