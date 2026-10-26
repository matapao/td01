import * as THREE from 'three';
import { GRADE_DECL, GRADE_GLSL, worldUniforms } from './assets.ts';

// ---- The rock -----------------------------------------------------------------------------------

/** Rock: the vertex colours (rock and painted light), facets, a painted grain, no moving lights. */
export const rockUniforms = {
  uGrain: { value: null as THREE.Texture | null },
};

export function grainTexture(): THREE.CanvasTexture {
  // Blasted rock up close: mottled grain, cracks, chips — and the half-barrels of drill holes, the
  // grooves a blast round leaves in the walls (in rows, broken every round).
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(90 + rnd() * 80);
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.3})`;
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 1 + rnd() * 5;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
  }
  // Cracks.
  g.strokeStyle = 'rgba(30,26,22,0.55)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rnd() - 0.5) * 40;
      y += (rnd() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Drill grooves: rows of short horizontal half-barrels (dark core, light lip).
  for (let row = 0; row < 4; row++) {
    const y = 24 + row * 64 + (rnd() - 0.5) * 6;
    for (let k = 0; k < 3; k++) {
      const x0 = k * 86 + rnd() * 14;
      const len = 52 + rnd() * 18;
      g.fillStyle = 'rgba(20,18,16,0.65)';
      g.fillRect(x0, y - 2, len, 4);
      g.fillStyle = 'rgba(210,200,185,0.35)';
      g.fillRect(x0, y + 2, len, 2);
    }
  }
  // The green channel: gravel for the floors (pebbles and grit, no grooves).
  const rock = g.getImageData(0, 0, S, S);
  const c2 = document.createElement('canvas');
  c2.width = c2.height = S;
  const g2 = c2.getContext('2d')!;
  g2.fillStyle = '#808080';
  g2.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const v = Math.floor(70 + rnd() * 110);
    g2.fillStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.4})`;
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 0.8 + rnd() * (rnd() < 0.1 ? 6 : 2.6);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        g2.beginPath();
        g2.ellipse(x + ox, y + oy, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
        g2.fill();
      }
  }
  const gravel = g2.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) rock.data[i * 4 + 1] = gravel.data[i * 4]!; // Both images have S * S RGBA pixels.
  g.putImageData(rock, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 1;
  return t;
}

export function rockMaterial(): THREE.MeshLambertMaterial {
  rockUniforms.uGrain.value ??= grainTexture();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, rockUniforms, worldUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vMineWorld;\nattribute vec3 aLit;\nvarying vec3 vLit;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvMineWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLit = aLit;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vMineWorld;
         varying vec3 vLit;
         uniform sampler2D uGrain;
         ${GRADE_DECL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           // One texture lookup, projected onto the dominant face: painted chips and grain.
           vec3 fn = abs(normalize(cross(dFdx(vMineWorld), dFdy(vMineWorld))));
           vec2 uv = fn.y > max(fn.x, fn.z) ? vMineWorld.xz * 0.6
             : fn.x > fn.z ? vMineWorld.zy * vec2(0.55, 0.9) : vMineWorld.xy * vec2(0.55, 0.9);
           vec4 grain = texture2D(uGrain, uv);
           float g = fn.y > max(fn.x, fn.z) ? grain.g : grain.r;
           diffuseColor.rgb *= 0.55 + 0.9 * g;
         }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         {
           // The rock's light is painted (the lanterns' pools are in its colours): the scene's lights
           // only give it facets — a soft fill, more on what faces up, and a gentle key.
           vec3 nw = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
           float key = max(dot(nw, normalize(vec3(0.42, 0.62, 0.3))), 0.0);
           float fill = 0.72 + 0.16 * nw.y;
           reflectedLight.indirectDiffuse = diffuseColor.rgb * vLit * (fill + 0.45 * key);
           reflectedLight.directDiffuse = vec3(0.0);
           // Mineral stains and facets supply the contrast; no moving light or animated glints.
         }`,
      )
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${GRADE_GLSL}`);
  };
  mat.customProgramCacheKey = () => 'minerock';
  return mat;
}
