import { cardArtSource } from '../card-art-source.ts';
/**
 * The art of the punched cards on the decide minigame's program board: Board Game Bits' blank
 * playing card, rendered once from its 3D model by the icon studio (ui/icons.ts, which provides the
 * renderer) the first time a board asks for it, then made the colour of card stock. Until it is
 * ready (or wherever there is no studio, as in the ?minigame playground) the board draws its cards
 * as before.
 */

/** The card, cropped to its edges, and the size of its rounded corners in pixels (for 9-slicing). */
export interface CardArt {
  img: HTMLCanvasElement;
  corner: number;
}

let sourceVersion = 0;
let state: 'idle' | 'busy' | 'ready' | 'failed' = 'idle';
let art: CardArt | null = null;

/** The card art, or null while it isn't ready (the first call starts the render). */
export function cardArt(): CardArt | null {
  const source = cardArtSource();
  if (source.version !== sourceVersion && state === 'failed') state = 'idle';
  sourceVersion = source.version;
  const make = source.render;
  if (state === 'idle' && make) {
    state = 'busy';
    make()
      .then((url) => (url ? prepare(url) : Promise.reject(new Error('no card model'))))
      .then((a) => {
        art = a;
        state = 'ready';
      })
      .catch((e) => {
        state = 'failed';
        console.warn('card art failed', e);
      });
  }
  return art;
}

/**
 * Crops the render to the card, makes it card-stock cream (keeping the render's light and shade) and
 * clips its top left corner like a punched card's.
 */
function prepare(url: string): Promise<CardArt> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('card art failed to decode'));
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const src = document.createElement('canvas');
      src.width = w;
      src.height = h;
      const g = src.getContext('2d')!;
      g.drawImage(img, 0, 0);
      // ImageData owns exactly width * height RGBA bytes; every stride below stays inside complete pixels.
      const px = g.getImageData(0, 0, w, h).data;
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (px[(y * w + x) * 4 + 3]! < 128) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
      if (x1 < x0 || y1 < y0) return reject(new Error('empty card render'));
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const o = out.getContext('2d')!;
      o.drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
      // Card stock: the render's light and shade, around the board's cream on average.
      const im = o.getImageData(0, 0, cw, ch);
      const d = im.data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3]! < 128) continue;
        sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        n++;
      }
      const mean = sum / Math.max(1, n);
      const CREAM = [0xe6, 0xd9, 0xb9] as const;
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / mean;
        for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.round(CREAM[k]! * l));
      }
      o.putImageData(im, 0, 0);
      // The corner pieces (kept unstretched): the rounded corners and the punched card's clipped one.
      let round = 2;
      for (let x = 0; x < cw / 2; x++) {
        if (px[(y0 * w + x0 + x) * 4 + 3]! >= 128) {
          round = Math.max(2, x + 1);
          break;
        }
      }
      const corner = Math.max(round, Math.round(cw * 0.05));
      o.globalCompositeOperation = 'destination-out';
      o.beginPath();
      o.moveTo(0, 0);
      o.lineTo(corner, 0);
      o.lineTo(0, corner);
      o.closePath();
      o.fill();
      o.globalCompositeOperation = 'source-over';
      resolve({ img: out, corner });
    };
    img.src = url;
  });
}
