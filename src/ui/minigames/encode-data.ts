// ---- Parameters ---------------------------------------------------------------------------------

export interface EncodeMorse {
  /** The message to send (letters, digits; spaces are skipped). */
  message: string;
  /** A dot's length in seconds (default 0.16); a dash is three dots, a pause of three ends a letter. */
  unit?: number;
  /** How far a press may stray from a clean dot or dash, as a share (default 0.5). */
  tolerance?: number;
  /** Letters that may be sent again and still be good (default 2). */
  slips?: number;
}

export interface EncodeBinary {
  /** Switches (4–8). */
  bits: number;
  /** The numbers to make, in turn ("13 arrows"). */
  targets: { value: number; label?: string }[];
}

export interface EncodePixels {
  /** The picture, row by row: '.' is dark, any other character a colour from `colours`. */
  picture: string[];
  /** The colours by character (default: '#' warm white). */
  colours?: Record<string, string>;
  /** How each row's code is written: '0'/'1' bits, run lengths (dark first), or the letters. */
  code?: 'bits' | 'runs' | 'letters';
  /** What the picture shows, said when it's done ("a lantern"). */
  name?: string;
}

export interface EncodeSymbols {
  /** The code book: what each shutter pattern means ('1' open, '0' shut, row by row). */
  book: { meaning: string; pattern: string }[];
  /** The messages in turn: send one (set the shutters) or read one (pick its meaning). */
  say: { meaning: string; read?: boolean }[];
  /** The shutter frame (default 2 columns × 3 rows). */
  cols?: number;
  rows?: number;
}

export interface EncodeWords {
  /** What to do, and for what (the line at the top). */
  goal: string;
  /** The principle, added to the why when it works. */
  principle?: string;
  /** The first-time hint. */
  hint?: string;
}

export interface EncodeParams {
  mode: 'morse' | 'binary' | 'pixels' | 'symbols';
  morse?: EncodeMorse;
  binary?: EncodeBinary;
  pixels?: EncodePixels;
  symbols?: EncodeSymbols;
  /** Seconds before the line closes (default 40). */
  time?: number;
  words: EncodeWords;
}

// ---- Examples -----------------------------------------------------------------------------------

/** Ready set-ups, one or two per mode. */
export const ENCODE_EXAMPLES: Record<
  'telegraph' | 'sos' | 'binary' | 'pixels' | 'bits' | 'towers',
  EncodeParams
> = {
  /** The telegraph: tell the keep the dead are coming. */
  telegraph: {
    mode: 'morse',
    morse: { message: 'DEAD' },
    words: {
      goal: 'Telegraph the keep: DEAD — the dead are on the road',
      principle: 'On/off pulses on a wire carry a message at once.',
      hint: 'Short press: dot. Long press: dash. Pause: next letter. (Space works too)',
    },
  },
  sos: {
    mode: 'morse',
    morse: { message: 'SOS', unit: 0.14 },
    words: {
      goal: 'Send SOS down the line to the far lookout',
      principle: 'An agreed code of short and long pulses carries the letters.',
    },
  },
  /** Binary: the counting house orders arrows. */
  binary: {
    mode: 'binary',
    binary: {
      bits: 5,
      targets: [
        { value: 13, label: '13 arrows' },
        { value: 6, label: '6 bolts' },
        { value: 22, label: '22 stones' },
      ],
    },
    words: {
      goal: 'Set the order board for the armoury, in on and off',
      principle: 'A switch’s place says what it is worth: each is twice the one to its right.',
      hint: 'Light the biggest place that fits, then the next — Enter sends',
    },
  },
  /** Pixels: a lantern on a tiny screen. */
  pixels: {
    mode: 'pixels',
    pixels: {
      picture: ['..##..', '.#..#.', '.####.', '.#YY#.', '.#YY#.', '.####.'],
      colours: { '#': '#d9c7a0', Y: '#ffd34d' },
      code: 'letters',
      name: 'a lantern',
    },
    words: {
      goal: 'Paint the picture from its code, row by row',
      principle: 'A screen is a grid of tiny lights, each set by a code.',
      hint: 'Each row of code is one row of squares: · dark, # pale, Y yellow',
    },
  },
  /** Pixels in bits: a skull for the warning board. */
  bits: {
    mode: 'pixels',
    pixels: {
      picture: ['.####.', '#.##.#', '######', '.#..#.', '.####.'],
      code: 'bits',
      name: 'a skull — the dead',
    },
    words: {
      goal: 'Show the warning on the board: paint the 1s',
      principle: 'On and off, row by row, can make any picture.',
    },
  },
  /** Signal towers: shutter codes from tower to tower. */
  towers: {
    mode: 'symbols',
    symbols: {
      book: [
        { meaning: 'The dead', pattern: '100001' },
        { meaning: 'North road', pattern: '110000' },
        { meaning: 'South road', pattern: '000011' },
        { meaning: 'Send archers', pattern: '011110' },
        { meaning: 'All clear', pattern: '000000' },
        { meaning: 'Fire', pattern: '101101' },
      ],
      say: [{ meaning: 'The dead' }, { meaning: 'North road' }, { meaning: 'Send archers', read: true }],
    },
    words: {
      goal: 'Signal the next tower: the dead, north road — then read its answer',
      principle: 'A pattern everyone agreed on carries a message from tower to tower.',
      hint: 'Click shutters open to match the code book, then Send',
    },
  },
};
