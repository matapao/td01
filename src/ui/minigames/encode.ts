export type { EncodeMorse } from './encode-data.ts';
export type { EncodeBinary } from './encode-data.ts';
export type { EncodePixels } from './encode-data.ts';
export type { EncodeSymbols } from './encode-data.ts';
export type { EncodeWords } from './encode-data.ts';
export type { EncodeParams } from './encode-data.ts';
export { ENCODE_EXAMPLES } from './encode-data.ts';
import { ENCODE_EXAMPLES } from './encode-data.ts';
import type { EncodeParams } from './encode-data.ts';
/**
 * Encode (TECH_LINEAGE §4): turn meaning into a pattern — and back.
 *
 * - 'morse': tap a message on the telegraph key (hold Space or press the key). A short press is a dot,
 *   a long one a dash, a pause ends the letter; the paper tape shows every press and the far
 *   station's sounder clicks as you key. A wrong letter is sent again.
 * - 'binary': flip switches to make a number: each place is worth twice the one to its right.
 * - 'pixels': paint a tiny picture from its code, row by row.
 * - 'symbols': a signal tower's shutters: set them from the code book to send a word, or read what
 *   the next tower shows.
 *
 * Right is good; right with clean timing and no wasted moves is perfect. The playground runs the
 * demo; `?minigame=encode&demo=<name>` runs one of ENCODE_EXAMPLES instead.
 */
import type { MinigameDef } from './types.ts';
import { createMorse } from './encode-morse.ts';
import { createBinary } from './encode-binary.ts';
import { createPixels } from './encode-pixels.ts';
import { createSymbols } from './encode-symbols.ts';

/** The playground's set-up: `?demo=<name>` picks an example. */
function pickDemo(): EncodeParams {
  const name = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('demo');
  return name && Object.hasOwn(ENCODE_EXAMPLES, name)
    ? ENCODE_EXAMPLES[name as keyof typeof ENCODE_EXAMPLES]
    : ENCODE_EXAMPLES['telegraph'];
}

export const encode: MinigameDef<EncodeParams> = {
  kind: 'encode',
  name: 'Encode',
  demo: pickDemo(),
  create: (host, p) => {
    switch (p.mode) {
      case 'binary':
        return createBinary(host, p);
      case 'pixels':
        return createPixels(host, p);
      case 'symbols':
        return createSymbols(host, p);
      default:
        return createMorse(host, p);
    }
  },
};

// ---- Shared ---------------------------------------------------------------------------------------
