/**
 * A stylized fire, the WoW / D3 way: layered additive flame sprites (orange edge, yellow body, white
 * core) that flicker and sway, and a halo that swells at night. Braziers and mine torches use it.
 */
import * as THREE from 'three';
import { flameTexture } from './textures.ts';

/** Layers, outer to core: width, height, colour, opacity. */
const FLAME_LAYERS: [number, number, string, number][] = [
  [0.55, 0.85, '#ff4a12', 0.8],
  [0.4, 0.66, '#ff9422', 0.9],
  [0.22, 0.4, '#fff0b0', 1],
];
let flameTex: THREE.Texture | null = null;

/** A fire `size` times the brazier's: flame sprites and a halo (the last child). */
export function makeFlame(glowTex: THREE.Texture, size = 1): THREE.Group {
  flameTex ??= flameTexture();
  const g = new THREE.Group();
  for (const [w, h, color, opacity] of FLAME_LAYERS) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flameTex,
        color,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    sp.center.set(0.5, 0.03);
    sp.scale.set(w * size, h * size, 1);
    g.add(sp);
  }
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: '#ff7a24',
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  halo.position.y = 0.28 * size;
  g.add(halo);
  g.userData['size'] = size;
  return g;
}

/** Animate a fire made by makeFlame (t: seconds, night: 0 day … 1 night, phase: so fires differ). */
export function flickerFlame(g: THREE.Group, t: number, night: number, phase = 0): void {
  const size = (g.userData['size'] as number) ?? 1;
  const tt = t + phase;
  FLAME_LAYERS.forEach(([w, h], i) => {
    const sp = g.children[i] as THREE.Sprite;
    const f = 0.84 + 0.14 * Math.sin(tt * (9 + i * 4) + i * 1.9) + 0.06 * Math.sin(tt * (23 + i * 5));
    sp.scale.set(w * size * (1 + 0.07 * Math.sin(tt * 13 + i)), h * size * f, 1);
    sp.material.rotation = Math.sin(tt * 5 + i * 2.1) * 0.08;
  });
  (g.children[FLAME_LAYERS.length] as THREE.Sprite).scale.setScalar(
    size * (1.2 + 0.08 * Math.sin(tt * 8)) * (1 + night * 1.1),
  );
}
