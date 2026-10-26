/** Procedurally painted, tileable textures for the terrain (Canvas 2D). */
import * as THREE from 'three';
import { RNG } from '../core/rng.ts';
import { Noise2D } from '../core/noise.ts';

type Paint = (g: CanvasRenderingContext2D, size: number, rng: RNG) => void;

/** Draw something at (x, y) and at its wrapped copies so the texture tiles seamlessly. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const px = x + ox;
      const py = y + oy;
      if (px + r < 0 || py + r < 0 || px - r > size || py - r > size) continue;
      draw(px, py);
    }
  }
}

function make(size: number, seed: number, paint: Paint, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  paint(g, size, new RNG(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function blotches(
  g: CanvasRenderingContext2D,
  size: number,
  rng: RNG,
  n: number,
  color: () => string,
  rMin: number,
  rMax: number,
): void {
  for (let i = 0; i < n; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = rng.range(rMin, rMax);
    const col = color();
    wrapped(size, x, y, r, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, col);
      grd.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
  }
}

export function grassTexture(): THREE.CanvasTexture {
  // Painted turf (the grass is drawn, not grown): sunny and shady patches, tufts with dark roots
  // and bright tips, clover, and little clusters of flowers.
  return make(512, 11, (g, size, rng) => {
    g.fillStyle = hsl(98, 46, 40);
    g.fillRect(0, 0, size, size);
    blotches(
      g,
      size,
      rng,
      40,
      () => hsl(rng.range(76, 92), rng.range(45, 60), rng.range(44, 52), 0.35),
      40,
      120,
    );
    blotches(
      g,
      size,
      rng,
      34,
      () => hsl(rng.range(104, 128), rng.range(40, 55), rng.range(26, 33), 0.35),
      30,
      100,
    );
    // Fine blades all over.
    for (let i = 0; i < 3800; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const len = rng.range(4, 9);
      const lean = rng.range(-0.5, 0.25);
      const style = hsl(rng.range(82, 112), rng.range(40, 62), rng.range(32, 56), rng.range(0.4, 0.8));
      const lw = rng.range(1, 1.8);
      wrapped(size, x, y, len, (px, py) => {
        g.strokeStyle = style;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(px, py);
        g.quadraticCurveTo(px + lean * len * 0.5, py - len * 0.6, px + lean * len, py - len);
        g.stroke();
      });
    }
    // Tufts: a dark root shadow, a fan of blades, light tips.
    for (let i = 0; i < 150; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const n = rng.int(5, 9);
      const len = rng.range(9, 16);
      wrapped(size, x, y, len + 4, (px, py) => {
        g.fillStyle = hsl(110, 45, 18, 0.45);
        g.beginPath();
        g.ellipse(px, py + 1, len * 0.45, len * 0.18, 0, 0, Math.PI * 2);
        g.fill();
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 1.3 + rng.range(-0.1, 0.1);
          const l = len * rng.range(0.7, 1);
          const tx = px + Math.cos(a) * l;
          const ty = py + Math.sin(a) * l;
          g.strokeStyle = hsl(rng.range(90, 112), 55, rng.range(30, 40), 0.95);
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(px, py);
          g.quadraticCurveTo(px + Math.cos(a) * l * 0.4, py + Math.sin(a) * l * 0.7, tx, ty);
          g.stroke();
          g.fillStyle = hsl(rng.range(70, 90), 70, rng.range(58, 70), 0.9);
          g.fillRect(tx - 1, ty - 1, 2, 2);
        }
      });
    }
    // Clover: three round leaves.
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      wrapped(size, x, y, 6, (px, py) => {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.4;
          g.fillStyle = hsl(118, 50, rng.range(34, 42), 0.95);
          g.beginPath();
          g.arc(px + Math.cos(a) * 2.6, py + Math.sin(a) * 2.6, 2.4, 0, Math.PI * 2);
          g.fill();
        }
      });
    }
    // Flowers in little clusters.
    for (let i = 0; i < 40; i++) {
      const cx = rng.next() * size;
      const cy = rng.next() * size;
      const col = rng.pick([
        hsl(52, 92, 70),
        hsl(0, 0, 97),
        hsl(282, 60, 76),
        hsl(40, 95, 62),
        hsl(205, 70, 78),
      ]);
      for (let k = rng.int(3, 7); k > 0; k--) {
        const x = cx + rng.range(-9, 9);
        const y = cy + rng.range(-9, 9);
        const r = rng.range(1.4, 2.4);
        wrapped(size, x, y, 4, (px, py) => {
          g.fillStyle = col;
          g.beginPath();
          g.arc(px, py, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = hsl(45, 90, 55);
          g.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
        });
      }
    }
  });
}

export function dirtTexture(): THREE.CanvasTexture {
  return make(512, 23, (g, size, rng) => {
    g.fillStyle = hsl(30, 38, 44);
    g.fillRect(0, 0, size, size);
    blotches(
      g,
      size,
      rng,
      70,
      () => hsl(rng.range(24, 36), rng.range(25, 45), rng.range(34, 54), 0.4),
      20,
      70,
    );
    // Tracks / ruts.
    for (let i = 0; i < 40; i++) {
      const y = rng.next() * size;
      const x = rng.next() * size;
      const w = rng.range(30, 120);
      const lw = rng.range(2, 4);
      const c1 = rng.range(-6, 6);
      const c2 = rng.range(-3, 3);
      wrapped(size, x, y, w, (px, py) => {
        g.strokeStyle = hsl(28, 30, 32, 0.25);
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(px - w / 2, py);
        g.quadraticCurveTo(px, py + c1, px + w / 2, py + c2);
        g.stroke();
      });
    }
    // Pebbles with a lit top.
    for (let i = 0; i < 900; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const r = rng.range(1.5, 5);
      const l = rng.range(40, 72);
      wrapped(size, x, y, r + 1, (px, py) => {
        g.fillStyle = hsl(30, 12, l * 0.6, 0.8);
        g.beginPath();
        g.ellipse(px + 0.8, py + 1, r, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = hsl(32, 18, l, 0.95);
        g.beginPath();
        g.ellipse(px, py, r, r * 0.72, 0, 0, Math.PI * 2);
        g.fill();
      });
    }
  });
}

export function rockTexture(): THREE.CanvasTexture {
  return make(512, 37, (g, size, rng) => {
    g.fillStyle = hsl(220, 8, 50);
    g.fillRect(0, 0, size, size);
    // Facets: big soft polygons with lit/dark edges.
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      const r = rng.range(25, 70);
      const n = rng.int(5, 7);
      const pts: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
        pts.push([Math.cos(a) * r * rng.range(0.7, 1), Math.sin(a) * r * rng.range(0.7, 1)]);
      }
      const l = rng.range(42, 62);
      const hue = rng.range(210, 230);
      wrapped(size, x, y, r, (px, py) => {
        g.fillStyle = hsl(hue, 9, l, 0.55);
        g.beginPath();
        pts.forEach(([ax, ay], k) => (k ? g.lineTo(px + ax, py + ay) : g.moveTo(px + ax, py + ay)));
        g.closePath();
        g.fill();
        g.strokeStyle = hsl(220, 10, l + 14, 0.5);
        g.lineWidth = 2;
        g.stroke();
      });
    }
    // Cracks.
    for (let i = 0; i < 60; i++) {
      let x = rng.next() * size;
      let y = rng.next() * size;
      g.strokeStyle = hsl(220, 12, 26, 0.6);
      g.lineWidth = rng.range(1, 2.5);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += rng.range(-14, 14);
        y += rng.range(4, 16);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    blotches(g, size, rng, 30, () => hsl(rng.range(85, 110), 35, 34, 0.35), 8, 26);
  });
}

export function sandTexture(): THREE.CanvasTexture {
  return make(256, 41, (g, size, rng) => {
    g.fillStyle = hsl(42, 45, 66);
    g.fillRect(0, 0, size, size);
    blotches(g, size, rng, 30, () => hsl(rng.range(36, 46), 40, rng.range(56, 72), 0.4), 10, 40);
    for (let i = 0; i < 2600; i++) {
      const x = rng.next() * size;
      const y = rng.next() * size;
      g.fillStyle = hsl(rng.range(30, 45), rng.range(20, 50), rng.range(45, 80), 0.6);
      g.fillRect(x, y, 1.4, 1.4);
    }
  });
}

/** Grayscale macro variation (linear). */
export function macroTexture(): THREE.CanvasTexture {
  const noise = new Noise2D(5);
  return make(
    256,
    5,
    (g, size) => {
      const img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // Tileable: sample a torus.
          const a = (x / size) * Math.PI * 2;
          const b = (y / size) * Math.PI * 2;
          const v =
            noise.fbm(Math.cos(a) * 1.6 + 10, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, 4) * 0.5 +
            0.5 +
            0.15 * noise.noise(Math.sin(b) * 3, 7);
          const c = Math.max(0, Math.min(255, v * 255));
          const i = (y * size + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    },
    false,
  );
}

/** Soft round sprite for particles and glows. */
export function softDot(size = 64): THREE.CanvasTexture {
  const t = make(size, 1, (g) => {
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A stylized flame (white, tinted per layer): a soft teardrop with its tip at the top, base at the bottom. */
export function flameTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    // Half-width along the flame: a point at the tip (v = 0), widest low down, rounded at the base.
    const half =
      0.46 * Math.pow(v, 0.85) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, v - 0.62) / 0.38, 2)));
    for (let x = 0; x < W; x++) {
      const u = Math.abs((x + 0.5) / W - 0.5);
      const k = half > 0 ? Math.max(0, Math.min(1, (1 - u / half) * 2.2)) : 0;
      const a = k * (0.55 + 0.45 * Math.min(1, v * 1.6));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
