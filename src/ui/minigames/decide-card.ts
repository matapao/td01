import type { Box } from './decide-drawing.ts';
import { rrect } from './kit.ts';
import type { CardArt } from './cardart.ts';
export function drawCardArt(
  g: CanvasRenderingContext2D,
  art: CardArt,
  b: Box,
  lift: number,
  ring: string | null,
): void {
  const { img, corner: c } = art;
  const iw = img.width;
  const ih = img.height;
  const d = Math.min(5, b.w / 3, b.h / 3);
  // Four slice boundaries define three rows/columns; loops stay in 0..2 and read the next edge.
  const sx = [0, c, iw - c, iw];
  const sy = [0, c, ih - c, ih];
  const dx = [b.x, b.x + d, b.x + b.w - d, b.x + b.w];
  const dy = [b.y, b.y + d, b.y + b.h - d, b.y + b.h];
  const nine = () => {
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++)
        g.drawImage(
          img,
          sx[i]!,
          sy[j]!,
          sx[i + 1]! - sx[i]!,
          sy[j + 1]! - sy[j]!,
          dx[i]!,
          dy[j]!,
          dx[i + 1]! - dx[i]!,
          dy[j + 1]! - dy[j]!,
        );
  };
  nine();
  if (lift > 0) {
    const a = g.globalAlpha;
    const op = g.globalCompositeOperation;
    g.globalAlpha = a * lift;
    g.globalCompositeOperation = 'lighter';
    nine();
    g.globalAlpha = a;
    g.globalCompositeOperation = op;
  }
  if (ring) {
    g.strokeStyle = ring;
    g.lineWidth = 2;
    rrect(g, b.x, b.y, b.w, b.h, d);
    g.stroke();
  }
}

/** What happens when a program runs: a trace of poses, and how it ended. */
