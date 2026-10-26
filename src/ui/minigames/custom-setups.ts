import type { BandParams } from './band.ts';
import type { OrderParams } from './order.ts';
/** Feedback control: hold the furnace in its band by hand — exactly what a thermostat will do from now on. */
export const feedback = (kiln: BandParams): BandParams => ({
  ...kiln,
  label: 'Furnace heat',
  high: {
    fails: 'end',
    word: 'too hot',
    why: 'Too hot: the charge burnt. A thermostat would have switched the fire down as the needle passed the mark.',
  },
  low: {
    fails: 'never',
    word: 'too cool',
    why: 'Too cool: it never got to working heat. Feedback means acting on what the gauge says, every moment.',
  },
  words: {
    hold: 'Hold to stoke, let go to ease off: watch the heat and answer it',
    perfect:
      'Steady as a governor: sense, compare, correct, over and over. Now a thermostat does it for the workshops on its own.',
    good: 'Held — a sensor and a switch will hold it steadier still, and never get tired.',
  },
});

/** Robots: senses, a brain and muscles, built in the order that makes it work. */
export const ROBOTS: OrderParams = {
  what: 'a gathering drone',
  style: 'generic',
  parts: [
    { id: 'frame', name: 'Frame & wheels', colour: '#8d939f', hint: 'Everything else mounts on it.' },
    {
      id: 'battery',
      name: 'Battery',
      colour: '#d9b04a',
      hint: 'Power for the motors and the brain.',
      needs: ['frame'],
      missing: 'No battery: nothing to run on.',
    },
    {
      id: 'motors',
      name: 'Motors',
      colour: '#c46a3a',
      hint: 'The muscles: they move it.',
      needs: ['battery'],
      early: 'The motors have nothing to turn on yet: fit the battery first.',
    },
    {
      id: 'sensors',
      name: 'Sensors',
      colour: '#7fd0ff',
      hint: 'The senses: what is there, how far, which way.',
      needs: ['frame'],
    },
    {
      id: 'brain',
      name: 'Controller',
      colour: '#62c08a',
      hint: 'The brain: it decides from what the senses say and drives the muscles.',
      needs: ['sensors', 'motors'],
      early: 'A brain with no senses or muscles can only sit and think.',
    },
  ],
  whyPerfect:
    'Senses, a brain and muscles in one loop: it sees, decides and acts on its own, again and again.',
  whyGood: 'It works — after a part went in out of turn.',
};
