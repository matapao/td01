import * as THREE from 'three';
import { RNG } from '../core/rng.ts';

export function atlas(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S * 2;
  const g = c.getContext('2d')!;
  const cell = (i: number, draw: (cx: number, cy: number) => void) => {
    g.save();
    g.translate((i % 4) * S, Math.floor(i / 4) * S);
    draw(S / 2, S / 2);
    g.restore();
  };
  const radial = (cx: number, cy: number, r: number, stops: [number, string][]) => {
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  };
  cell(0, (cx, cy) =>
    radial(cx, cy, 60, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,255,255,0.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  cell(1, (cx, cy) => {
    const grd = g.createLinearGradient(cx, 8, cx, S - 8);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(cx, cy, 9, 58, 0, 0, Math.PI * 2);
    g.fill();
  });
  cell(2, (cx, cy) => {
    const rng = new RNG(3);
    for (let i = 0; i < 9; i++) {
      const x = cx + rng.range(-26, 26);
      const y = cy + rng.range(-26, 26);
      const r = rng.range(22, 36);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  cell(3, (cx, cy) => {
    radial(cx, cy, 40, [
      [0, 'rgba(255,255,255,0.9)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 12 : 56;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  cell(4, (cx, cy) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 9;
    g.shadowColor = 'white';
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(cx, cy, 48, 0, Math.PI * 2);
    g.stroke();
  });
  cell(5, (cx, cy) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.moveTo(cx - 30, cy - 18);
    g.lineTo(cx + 22, cy - 30);
    g.lineTo(cx + 34, cy + 12);
    g.lineTo(cx - 8, cy + 32);
    g.lineTo(cx - 36, cy + 8);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.moveTo(cx + 34, cy + 12);
    g.lineTo(cx - 8, cy + 32);
    g.lineTo(cx - 2, cy + 4);
    g.closePath();
    g.fill();
  });
  cell(6, (cx, cy) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.ellipse(cx, cy, 18, 44, 0.6, 0, Math.PI * 2);
    g.fill();
  });
  cell(7, (cx, cy) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 7;
    g.shadowColor = 'white';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(cx, cy, 40, 0, Math.PI * 2);
    g.moveTo(cx, cy - 40);
    g.lineTo(cx - 20, cy + 22);
    g.lineTo(cx + 26, cy - 8);
    g.lineTo(cx - 26, cy - 8);
    g.lineTo(cx + 20, cy + 22);
    g.closePath();
    g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
