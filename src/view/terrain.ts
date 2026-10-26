// Terrain grids are allocated to HF_W * HF_H, fog grids to GRID_W * GRID_H; loops/clamps bound every sample. Triangle indices are stored in triples.
import { geometryAttribute } from './geometry-attributes.ts';
/** Terrain mesh + painted splat shader, water, and the fog-of-war texture. */
import * as THREE from 'three';
import { smoothstep, clamp } from '../core/math.ts';
import {
  GRID_H,
  GRID_W,
  HF_H,
  HF_STEP,
  HF_W,
  MAP,
  hfX,
  hfZ,
  sampleHeights,
  type World,
} from '../game/map.ts';
import { GRADE_DECL, GRADE_GLSL, worldUniforms } from './assets.ts';
import { tintUniforms } from './lighting.ts';
import { dirtTexture, grassTexture, macroTexture, rockTexture, sandTexture } from './textures.ts';

export const gridUniforms = {
  uGridOn: { value: 0 },
  uGridCenter: { value: new THREE.Vector2() },
  uGridRadius: { value: 7 },
};

export class Terrain {
  private world: World;

  readonly mesh: THREE.Group;
  readonly water: THREE.Mesh;
  readonly fogTex: THREE.DataTexture;
  private fogData: Uint8Array;

  constructor(world: World) {
    this.world = world;

    this.fogData = new Uint8Array(GRID_W * 2 * GRID_H * 2);
    this.fogTex = new THREE.DataTexture(
      this.fogData,
      GRID_W * 2,
      GRID_H * 2,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.needsUpdate = true;
    worldUniforms.uFogTex.value = this.fogTex;
    worldUniforms.uFogNoise.value = macroTexture();
    worldUniforms.uFogMin.value.set(MAP.minX, MAP.minZ);
    worldUniforms.uFogSize.value.set(MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ);
    this.mesh = this.buildTerrain();
    // A dry map needs no water geometry, material or animated water shader.
    this.water =
      MAP.river.length || MAP.brook.length || MAP.lake.rx > 0
        ? this.buildWater()
        : new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    this.water.visible = !!(MAP.river.length || MAP.brook.length || MAP.lake.rx > 0);
  }

  private excavatedMaterial: THREE.Material | null = null;
  /** Share the world's painted textures and grading, so edited columns have no material seam. */
  excavationMaterial(): THREE.Material {
    if (this.excavatedMaterial) return this.excavatedMaterial;
    const original = (this.mesh.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    const material = original.clone();
    material.vertexColors = true;
    material.side = THREE.DoubleSide;
    material.onBeforeCompile = original.onBeforeCompile;
    material.customProgramCacheKey = () => original.customProgramCacheKey() + 'excavation';
    return (this.excavatedMaterial = material);
  }
  paintExcavation(geo: THREE.BufferGeometry): void {
    const pos = geometryAttribute(geo, 'position'),
      nor = geometryAttribute(geo, 'normal'),
      colors = geometryAttribute(geo, 'color');
    const splat = new Float32Array(pos.count * 4),
      blight = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i),
        base = sampleHeights(this.world.heights, x, z);
      const fresh = base - y > 0.045;
      let ny = nor.getY(i);
      if (!fresh) {
        const nx =
          sampleHeights(this.world.heights, x - 0.05, z) - sampleHeights(this.world.heights, x + 0.05, z);
        const nz =
          sampleHeights(this.world.heights, x, z - 0.05) - sampleHeights(this.world.heights, x, z + 0.05);
        const l = Math.hypot(nx, 0.1, nz);
        nor.setXYZ(i, nx / l, 0.1 / l, nz / l);
        ny = 0.1 / l;
        colors.setXYZ(i, 1, 1, 1);
      } else {
        colors.setXYZ(
          i,
          0.82 + colors.getX(i) * 0.18,
          0.82 + colors.getY(i) * 0.18,
          0.82 + colors.getZ(i) * 0.18,
        );
      }
      let rock = fresh ? 1 : Math.max(smoothstep(0.22, 0.42, 1 - ny), smoothstep(5.5, 9, y) * 0.85);
      const sand = fresh ? 0 : smoothstep(0.75, 0.2, y) * (1 - rock);
      const road = fresh ? 0 : sampleHeights(this.world.road, x, z) * (1 - rock * 0.8);
      const grass = Math.max(0, 1 - road - rock - sand),
        sum = grass + road + rock + sand || 1;
      splat.set([grass / sum, road / sum, rock / sum, sand / sum], i * 4);
      blight[i] = sampleHeights(this.world.blight, x, z);
    }
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('aBlight', new THREE.BufferAttribute(blight, 1));
  }

  private removedColumns = new Set<string>();
  /** Replace only edited surface columns with the continuous three-dimensional rock skin. */
  exciseColumn(x: number, z: number): void {
    const key = `${x},${z}`;
    if (this.removedColumns.has(key)) return;
    this.removedColumns.add(key);
    this.excavationDirty = true;
  }
  resetExcavation(): void {
    this.removedColumns.clear();
    this.excavationDirty = false;
    for (const obj of this.mesh.children) {
      const m = obj as THREE.Mesh;
      if (m.isMesh && m.geometry.userData['originalIndex'])
        m.geometry.setIndex(m.geometry.userData['originalIndex']);
    }
  }
  private excavationDirty = false;
  flushExcavation(): void {
    if (!this.excavationDirty) return;
    this.excavationDirty = false;
    for (const obj of this.mesh.children) {
      const m = obj as THREE.Mesh;
      if (!m.isMesh || !m.geometry.index) continue;
      const g = m.geometry,
        pos = geometryAttribute(g, 'position');
      const original = (g.userData['originalIndex'] ??= Array.from(g.index!.array)) as number[];
      const out: number[] = [];
      for (let i = 0; i + 2 < original.length; i += 3) {
        const a = original[i]!,
          b = original[i + 1]!,
          c = original[i + 2]!;
        const cx = Math.floor((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 6);
        const cz = Math.floor((pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 6);
        if (!this.removedColumns.has(`${cx},${cz}`)) out.push(a, b, c);
      }
      g.setIndex(out);
    }
  }

  private lastSum = -1;

  /** Uploads the explored grid as a 2× upsampled, blurred texture (only when it changed). */
  updateFog(explored: Uint8Array): void {
    if (explored.length !== GRID_W * GRID_H) throw new Error('Invalid explored grid dimensions');
    let sum = 0;
    for (let i = 0; i < explored.length; i++) sum += explored[i]! * ((i % 7) + 1);
    if (sum === this.lastSum) return;
    this.lastSum = sum;
    const W = GRID_W * 2;
    const H = GRID_H * 2;
    const a = new Float32Array(W * H);
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) a[z * W + x] = explored[(z >> 1) * GRID_W + (x >> 1)]!;
    const b = new Float32Array(W * H);
    const R = 2;
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 0; z < H; z++) {
        for (let x = 0; x < W; x++) {
          let s = 0;
          let n = 0;
          for (let k = -R; k <= R; k++) {
            const xx = pass ? x : Math.min(W - 1, Math.max(0, x + k));
            const zz = pass ? Math.min(H - 1, Math.max(0, z + k)) : z;
            s += (pass ? b : a)[zz * W + xx]!;
            n++;
          }
          if (pass) this.fogData[z * W + x] = Math.round((s / n) * 255);
          else b[z * W + x] = s / n;
        }
      }
    }
    this.fogTex.needsUpdate = true;
  }

  private buildTerrain(): THREE.Group {
    const w = this.world;
    const n = HF_W * HF_H;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const splat = new Float32Array(n * 4);
    const blight = new Float32Array(n);
    const H = w.heights;
    const at = (ix: number, iz: number) => H[clamp(iz, 0, HF_H - 1) * HF_W + clamp(ix, 0, HF_W - 1)]!;
    for (let iz = 0; iz < HF_H; iz++) {
      for (let ix = 0; ix < HF_W; ix++) {
        const k = iz * HF_W + ix;
        const h = H[k]!;
        pos[k * 3] = hfX(ix);
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = hfZ(iz);
        const nx = at(ix - 1, iz) - at(ix + 1, iz);
        const nz = at(ix, iz - 1) - at(ix, iz + 1);
        const ny = 2 * HF_STEP;
        const l = Math.hypot(nx, ny, nz);
        nor[k * 3] = nx / l;
        nor[k * 3 + 1] = ny / l;
        nor[k * 3 + 2] = nz / l;
        const steep = 1 - ny / l;
        const road = w.road[k]!;
        let rock = smoothstep(0.22, 0.42, steep);
        rock = Math.max(rock, smoothstep(5.5, 9, h) * 0.85);
        let sand = smoothstep(0.75, 0.2, h) * (1 - rock);
        if (h < -0.2) sand = Math.max(sand, 0.7);
        const roadW = road * (1 - rock * 0.8);
        let grass = Math.max(0, 1 - roadW - rock - sand);
        const sum = grass + roadW + rock + sand || 1;
        grass /= sum;
        splat[k * 4] = grass;
        splat[k * 4 + 1] = roadW / sum;
        splat[k * 4 + 2] = rock / sum;
        splat[k * 4 + 3] = sand / sum;
        blight[k] = w.blight[k]!;
      }
    }
    // The ground is cut into tiles that share one vertex buffer: tiles out of view aren't drawn.
    const attrs = {
      position: new THREE.BufferAttribute(pos, 3),
      normal: new THREE.BufferAttribute(nor, 3),
      aSplat: new THREE.BufferAttribute(splat, 4),
      aBlight: new THREE.BufferAttribute(blight, 1),
    };
    const TILE = 64;
    const tiles: THREE.BufferGeometry[] = [];
    for (let tz = 0; tz < HF_H - 1; tz += TILE) {
      for (let tx = 0; tx < HF_W - 1; tx += TILE) {
        const iz1 = Math.min(HF_H - 1, tz + TILE);
        const ix1 = Math.min(HF_W - 1, tx + TILE);
        const idx = new Uint32Array((iz1 - tz) * (ix1 - tx) * 6);
        let p = 0;
        let lo = Infinity;
        let hi = -Infinity;
        for (let iz = tz; iz < iz1; iz++) {
          for (let ix = tx; ix < ix1; ix++) {
            const a = iz * HF_W + ix;
            const b = a + 1;
            const c = a + HF_W;
            const d = c + 1;
            // Alternate the diagonal for a less regular look.
            if ((ix + iz) % 2) idx.set([a, c, b, b, c, d], p);
            else idx.set([a, c, d, a, d, b], p);
            p += 6;
            lo = Math.min(lo, H[a]!);
            hi = Math.max(hi, H[a]!);
          }
        }
        const geo = new THREE.BufferGeometry();
        for (const [k, v] of Object.entries(attrs)) geo.setAttribute(k, v);
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        const x0 = hfX(tx);
        const x1 = hfX(ix1);
        const z0 = hfZ(tz);
        const z1 = hfZ(iz1);
        geo.userData['boundsXZ'] = [x0, z0, x1, z1];
        geo.boundingSphere = new THREE.Sphere(
          new THREE.Vector3((x0 + x1) / 2, (lo + hi) / 2, (z0 + z1) / 2),
          Math.hypot(x1 - x0, z1 - z0, hi - lo) / 2 + 0.5,
        );
        tiles.push(geo);
      }
    }

    const tex = {
      tGrass: { value: grassTexture() },
      tDirt: { value: dirtTexture() },
      tRock: { value: rockTexture() },
      tSand: { value: sandTexture() },
      tMacro: { value: macroTexture() },
    };
    const mat = new THREE.MeshLambertMaterial();
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tex, worldUniforms, gridUniforms, tintUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute vec4 aSplat;
           attribute float aBlight;
           varying vec4 vSplat;
           varying float vBlight;
           varying vec3 vWorldT;
           varying vec3 vNormalT;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSplat = aSplat;
           vBlight = aBlight;
           vWorldT = (modelMatrix * vec4(position, 1.0)).xyz;
           vNormalT = normal;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D tGrass, tDirt, tRock, tSand, tMacro, uFogTex, uFogNoise;
           uniform vec2 uFogMin, uFogSize, uGridCenter;
           uniform float uFogOn, uGridOn, uGridRadius, uTime, uBlightBoost;
           uniform vec3 uTerrainTint, uGrassTint, uMist;
           varying vec4 vSplat;
           varying float vBlight;
           varying vec3 vWorldT;
           varying vec3 vNormalT;
           ${GRADE_DECL}`,
        )
        .replace(
          '#include <map_fragment>',
          `{
             vec2 uv = vWorldT.xz / 3.2;
             float macro = texture2D(tMacro, vWorldT.xz * 0.011).r;
             float macro2 = texture2D(tMacro, vWorldT.xz * 0.043 + 0.31).r;
             vec3 grass = texture2D(tGrass, uv).rgb;
             grass *= mix(vec3(0.78, 0.86, 0.7), vec3(1.12, 1.08, 0.86), macro) * uGrassTint;
             vec3 dirt = texture2D(tDirt, uv * 1.4).rgb * mix(0.85, 1.1, macro2);
             vec3 sand = texture2D(tSand, uv * 1.6).rgb;
             // One rock read, sheared up the slope (no triplanar: cheaper, and it reads as painted strata).
             vec3 rock = texture2D(tRock, uv + vec2(0.0, vWorldT.y * 0.18)).rgb;
             vec4 s = vSplat;
             // Break up blend edges with noise so transitions look painted, not smeared.
             float jitter = (macro2 - 0.5) * 0.35;
             s.y = smoothstep(0.25, 0.75, s.y + jitter);
             s.z = smoothstep(0.2, 0.7, s.z + jitter * 0.7);
             s.w = smoothstep(0.2, 0.7, s.w - jitter * 0.6);
             s.x = max(0.0, 1.0 - s.y - s.z - s.w);
             vec3 col = (grass * s.x + dirt * s.y + rock * s.z + sand * s.w) / max(0.001, s.x + s.y + s.z + s.w);
             float lum = dot(col, vec3(0.299, 0.587, 0.114));
             vec3 blighted = mix(vec3(lum), col, 0.3) * vec3(0.8, 0.7, 0.88);
             col = mix(col, blighted, clamp(vBlight * 0.85 + uBlightBoost * (0.25 + 0.5 * macro2), 0.0, 1.0));
             diffuseColor.rgb *= col * uTerrainTint;
           }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           if (uGridOn > 0.5) {
             vec2 g = abs(fract(vWorldT.xz) - 0.5);
             float line = smoothstep(0.47, 0.5, max(g.x, g.y));
             float fade = smoothstep(uGridRadius, uGridRadius * 0.35, distance(vWorldT.xz, uGridCenter));
             totalEmissiveRadiance += vec3(0.55, 0.75, 1.0) * line * fade * 0.35;
           }`,
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           ${GRADE_GLSL}
           if (uFogOn > 0.5) {
             float ex = texture2D(uFogTex, (vWorldT.xz - uFogMin) / uFogSize).r;
             ex += (texture2D(uFogNoise, vWorldT.xz * 0.05 + vec2(uTime * 0.01, uTime * 0.006)).r - 0.5) * 0.5;
             float vis = mix(1.0, smoothstep(0.2, 0.75, ex), uFogOn);
             float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
             vec3 fogged = uMist * (0.72 + 0.5 * lum);
             gl_FragColor.rgb = mix(fogged, gl_FragColor.rgb, vis);
           }`,
        );
    };
    mat.customProgramCacheKey = () => 'terrain';
    const ground = new THREE.Group();
    ground.name = 'terrain';
    for (const geo of tiles) ground.add(Object.assign(new THREE.Mesh(geo, mat), { name: 'terrain' }));
    return ground;
  }

  private buildWater(): THREE.Mesh {
    const w = this.world;
    const step = 1;
    const nx = Math.round((MAP.maxX - MAP.minX) / step) + 1;
    const nz = Math.round((MAP.maxZ - MAP.minZ) / step) + 1;
    const geo = new THREE.PlaneGeometry(MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((MAP.minX + MAP.maxX) / 2, MAP.waterLevel, (MAP.minZ + MAP.maxZ) / 2);
    const pos = geometryAttribute(geo, 'position') as THREE.BufferAttribute;
    const depth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const fx = clamp((x - MAP.minX) / HF_STEP, 0, HF_W - 1);
      const fz = clamp((z - MAP.minZ) / HF_STEP, 0, HF_H - 1);
      depth[i] = MAP.waterLevel - w.heights[Math.round(fz) * HF_W + Math.round(fx)]!;
    }
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));
    // Keep only the squares near water (the rest of the sheet lies under the ground anyway).
    const idx = geo.index!;
    const keep: number[] = [];
    for (let t = 0; t < idx.count; t += 6) {
      let wet = false;
      for (let k = 0; k < 6 && !wet; k++) wet = depth[idx.getX(t + k)]! > -0.8;
      if (wet) for (let k = 0; k < 6; k++) keep.push(idx.getX(t + k));
    }
    geo.setIndex(keep);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...worldUniforms, ...tintUniforms },
      vertexShader: /* glsl */ `
        attribute float aDepth;
        varying float vDepth;
        varying vec3 vWorld;
        varying float vView;
        void main() {
          vDepth = aDepth;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vView = distance(cameraPosition, wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uFogTex, uFogNoise;
        uniform vec2 uFogMin, uFogSize;
        uniform float uFogOn;
        uniform vec3 uMist;
        uniform vec3 uWaterShallow, uWaterDeep;
        varying float vDepth;
        varying vec3 vWorld;
        varying float vView;
        float wave(vec2 p, vec2 dir, float freq, float speed, float t) {
          return sin(dot(p, normalize(dir)) * freq + t * speed);
        }
        void main() {
          if (vDepth < -0.05) discard;
          float d = max(vDepth, 0.0);
          vec2 p = vWorld.xz;
          float t = uTime;
          vec2 q = p + vec2(0.0, t * 0.3);
          float detail = 1.0 - smoothstep(25.0, 55.0, vView);
          float ripple = wave(q, vec2(1.0, 0.3), 1.7, 1.4, t) * 0.5 + wave(q, vec2(-0.4, 1.0), 2.3, 1.9, t) * 0.35 + wave(q, vec2(0.8, -0.7), 3.1, 2.6, t) * 0.25 * detail;
          ripple *= 0.6 + 0.4 * detail;
          vec3 shallow = uWaterShallow;
          vec3 deep = uWaterDeep;
          vec3 col = mix(shallow, deep, smoothstep(0.0, 1.4, d));
          col += vec3(0.02, 0.03, 0.035) * ripple;
          float foamBand = smoothstep(0.16, 0.0, d);
          float foamNoise = 0.5 + 0.5 * sin(p.x * 3.1 + p.y * 2.3 + t * 2.0 + ripple * 2.0);
          col = mix(col, vec3(0.85, 0.95, 1.0), foamBand * foamNoise * 0.85);
          float glint = pow(max(0.0, ripple - 1.35), 2.0) * 1.2;
          col += vec3(1.0, 0.92, 0.75) * glint;
          float alpha = mix(0.55, 0.9, smoothstep(0.0, 0.9, d));
          float ex = texture2D(uFogTex, (vWorld.xz - uFogMin) / uFogSize).r;
          ex += (texture2D(uFogNoise, vWorld.xz * 0.05 + vec2(uTime * 0.01, uTime * 0.006)).r - 0.5) * 0.5;
          float vis = mix(1.0, smoothstep(0.2, 0.75, ex), uFogOn);
          col = mix(uMist * (0.7 + 0.4 * dot(col, vec3(0.3, 0.59, 0.11))), col, vis);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    mesh.name = 'water';
    return mesh;
  }
}
