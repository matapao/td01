/**
 * The faces, for code that draws text itself (canvases can't read CSS variables): the same stacks as
 * src/ui/fonts.css. The UI pair is Cinzel (titles) and Alegreya (body); the Road of Invention's boards
 * wear their age: the early ages stay in the UI pair, Steam is a Victorian serif, Electric and Signal a
 * typewriter, Electronic and Automated a terminal, Space a clean sci-fi face.
 */
import type { AgeId } from '../game/road.ts';

export const FACES = {
  serif: "'Alegreya', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  title: "'Cinzel', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  steam: "'Old Standard TT', 'Palatino Linotype', Palatino, Georgia, serif",
  type: "'Courier Prime', 'Courier New', Courier, monospace",
  term: "'VT323', 'Courier New', Courier, monospace",
  space: "'Exo 2', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
} as const;

export type FaceId = keyof typeof FACES;

/**
 * The words drawn on a board in each face. The typewriter's are set in Cutive — a typewriter face too,
 * but proportional: Courier's fixed pitch runs a third wider than the serif the boards were laid out in.
 */
export const BOARD_FACES: Record<FaceId, string> = {
  ...FACES,
  type: "'Cutive', 'Courier Prime', 'Courier New', Courier, monospace",
};

// The HUD's pair is fetched at once, alongside the models, so the HUD never shows in a stand-in face.
if (typeof document !== 'undefined' && document.fonts)
  for (const f of [FACES.serif, FACES.title]) document.fonts.load(`12px ${f}`).catch(() => {});

/** The face of each age's boards. */
export const AGE_FACE: Record<AgeId, Exclude<FaceId, 'title'>> = {
  fire: 'serif',
  metal: 'serif',
  machine: 'serif',
  steam: 'steam',
  electric: 'type',
  signal: 'type',
  electronic: 'term',
  automated: 'term',
  space: 'space',
};

/**
 * Resolves once `faces` (regular, bold and italic; the panel's and the board's) are loaded — or after
 * `ms` at the latest: a board that measures its words once, as it sets up, must not measure them in a
 * stand-in face. The files are local (and small), so this is a frame or two; it never blocks for long.
 */
export function facesReady(faces: FaceId[], ms = 900): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const stacks = [...new Set(faces.flatMap((f) => [FACES[f], BOARD_FACES[f]]))];
  const loads = stacks.flatMap((s) =>
    ['', 'bold ', 'italic '].map((v) => document.fonts.load(`${v}12px ${s}`).catch(() => [])),
  );
  return Promise.race([Promise.all(loads).then(() => {}), new Promise<void>((r) => setTimeout(r, ms))]);
}
