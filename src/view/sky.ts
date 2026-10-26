/**
 * Sky dome (gradient, sun glow, drifting clouds) and distant mountain silhouettes. Coloured by the
 * lighting (lighting.ts). In Space the same dome is the dark of space: stars all round (some with a
 * four-point glint), the galaxy's band, soft violet and teal nebulae, a hard white sun, a ringed
 * giant and, small and blue, the home world.
 */
import * as THREE from 'three';
import { Noise2D } from '../core/noise.ts';
import { MAP, WORLD } from '../game/map.ts';

export const skyUniforms = {
  uSkyTop: { value: new THREE.Color('#4f6fa8') },
  uSkyHorizon: { value: new THREE.Color('#b9c8d8') },
  uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.4).normalize() },
  uSunCol: { value: new THREE.Color('#ffd9a8') },
  uFarTint: { value: new THREE.Color('#5d6f6a') },
  uTime: { value: 0 },
  /** 0 by day … 1 at night: stars and the moon come out. */
  uNight: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(-0.5, 0.45, 0.74).normalize() },
  /** 1 in Space: the dark sky instead of the vale's. */
  uSpace: { value: 0 },
};

/** Space's sky, painted per pixel (cheap hashes, few octaves; only the sky's own pixels pay — see renderOrder). */
const SPACE_SKY = /* glsl */ `
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
    float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
    return mix(a, b, u.z);
  }
  float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise3(p); p *= 2.13; a *= 0.5; } return s / 0.875; }
  // One layer of stars: at most one per cell of a grid wrapped round the sky; \`glint\` adds a four-point sparkle.
  vec3 starLayer(vec3 d, float scale, float keep, float size, float glint) {
    vec3 p = d * scale;
    vec3 c = floor(p);
    float r = hash13(c);
    if (r < keep) return vec3(0.0);
    vec3 s = normalize(c + vec3(hash13(c + 1.31), hash13(c + 7.77), hash13(c + 3.13))) * scale;
    vec3 o = p - s;
    float dd = length(o);
    vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.78), hash13(c + 5.5));
    float k = smoothstep(size, 0.0, dd);
    if (glint > 0.0) {
      vec3 n = normalize(s);
      vec3 tx = normalize(cross(n, abs(n.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
      vec3 ty = cross(n, tx);
      float ox = abs(dot(o, tx)), oy = abs(dot(o, ty));
      k += glint * (exp(-ox * 40.0) * exp(-oy * 4.0) + exp(-oy * 40.0) * exp(-ox * 4.0)) * smoothstep(size * 6.0, 0.0, dd);
    }
    return tint * k * (0.6 + 0.4 * hash13(c + 9.1));
  }
  // A ringed giant in teal and lavender bands, lit from the sun's side; its rings pass in front of it.
  vec3 giant(vec3 d, vec3 col, vec3 sd) {
    vec3 P = normalize(vec3(-0.3, 0.25, -0.92));
    float R = 0.16;
    vec3 A = normalize(vec3(0.28, 1.0, 0.12));
    float tca = dot(P, d);
    float d2 = 1.0 - tca * tca;
    float tHit = 1e9;
    if (tca > 0.0 && d2 < R * R) {
      tHit = tca - sqrt(R * R - d2);
      vec3 N = normalize(d * tHit - P);
      float bands = sin(dot(N, A) * 22.0 + fbm3(N * 4.0) * 2.5) * 0.5 + 0.5;
      vec3 base = mix(vec3(0.34, 0.6, 0.68), vec3(0.6, 0.54, 0.8), bands);
      base = mix(base, vec3(0.86, 0.9, 0.95), smoothstep(0.8, 0.98, bands) * 0.4);
      float lit = clamp(dot(N, sd) * 0.9 + 0.12, 0.05, 1.0);
      float rim = pow(1.0 - max(dot(N, -d), 0.0), 3.0);
      vec3 pc = base * lit + vec3(0.45, 0.75, 1.0) * rim * 0.35 * clamp(dot(N, sd) + 0.4, 0.0, 1.0);
      col = mix(col, pc, smoothstep(R * R, R * R * 0.985, d2));
    }
    float den = dot(d, A);
    if (abs(den) > 1e-4) {
      float tR = dot(P, A) / den;
      if (tR > 0.0 && tR < tHit) {
        float rr = length(d * tR - P) / R;
        if (rr > 1.35 && rr < 2.35) {
          float ring = (0.6 + 0.4 * sin(rr * 38.0)) * smoothstep(1.35, 1.45, rr) * smoothstep(2.35, 2.2, rr);
          ring *= 1.0 - 0.85 * (smoothstep(1.76, 1.8, rr) - smoothstep(1.86, 1.9, rr));
          vec3 rc = mix(vec3(0.8, 0.84, 0.94), vec3(0.55, 0.62, 0.8), smoothstep(1.4, 2.3, rr));
          col = mix(col, rc * 0.85, ring * 0.75);
        }
      }
    }
    return col;
  }
  // The home world, small and blue: seas, green land, white cloud, its thin air glowing at the edge.
  vec3 homeWorld(vec3 d, vec3 col, vec3 sd) {
    vec3 P = normalize(vec3(-0.85, 0.3, 0.1));
    float R = 0.045;
    float tca = dot(P, d);
    float d2 = 1.0 - tca * tca;
    if (tca <= 0.0 || d2 > R * R * 1.7) return col;
    col += vec3(0.25, 0.5, 1.0) * smoothstep(R * R * 1.7, R * R, d2) * 0.3;
    if (d2 < R * R) {
      vec3 N = normalize(d * (tca - sqrt(R * R - d2)) - P);
      float land = smoothstep(0.5, 0.56, fbm3(N * 3.0 + 11.0));
      vec3 c = mix(vec3(0.1, 0.32, 0.72), vec3(0.32, 0.62, 0.3), land);
      c = mix(c, vec3(0.96), smoothstep(0.55, 0.72, fbm3(N * 5.0 - 2.0)) * 0.85);
      float lit = clamp(dot(N, sd) * 0.95 + 0.1, 0.04, 1.0);
      float rim = pow(1.0 - max(dot(N, -d), 0.0), 2.5);
      c = c * lit + vec3(0.35, 0.6, 1.0) * rim * 0.6 * lit;
      col = mix(col, c, smoothstep(R * R, R * R * 0.96, d2));
    }
    return col;
  }
  vec3 spaceSky(vec3 d, vec3 sd) {
    vec3 col = mix(vec3(0.01, 0.012, 0.03), vec3(0.02, 0.018, 0.05), d.y * 0.5 + 0.5);
    // The galaxy's band across the sky, and soft nebulae (painted).
    float b = dot(d, normalize(vec3(0.3, 0.55, -0.78)));
    float band = exp(-b * b * 22.0);
    col += vec3(0.1, 0.11, 0.2) * band * (0.3 + fbm3(d * 3.2 + 2.0) * 0.9);
    col += vec3(0.24, 0.1, 0.36) * smoothstep(0.5, 0.85, fbm3(d * 1.9 + 5.3)) * (0.45 + band * 0.7);
    col += vec3(0.05, 0.26, 0.32) * smoothstep(0.55, 0.88, fbm3(d * 2.6 - 3.7)) * (0.35 + band * 0.6);
    // Stars everywhere: many faint, some bright with a glint; thicker along the band.
    col += starLayer(d, 95.0, 0.86 - band * 0.12, 0.14, 0.0) * 0.75;
    col += starLayer(d, 46.0, 0.93, 0.11, 0.0) * 1.1;
    col += starLayer(d, 17.0, 0.955, 0.06, 0.6) * 1.6;
    // The sun: a hard white disc and its glare.
    float sun = max(dot(d, sd), 0.0);
    col += vec3(1.0, 0.97, 0.9) * (smoothstep(0.99955, 0.99975, sun) * 4.0 + pow(sun, 800.0) * 1.4 + pow(sun, 60.0) * 0.22 + pow(sun, 8.0) * 0.06);
    col = giant(d, col, sd);
    return homeWorld(d, col, sd);
  }
`;

export function buildSky(): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(620, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSkyTop, uSkyHorizon, uSunDir, uSunCol, uMoonDir;
        uniform float uTime, uNight, uSpace;
        varying vec3 vDir;
        ${SPACE_SKY}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          if (uSpace > 0.5) {
            gl_FragColor = vec4(spaceSky(d, normalize(uSunDir)), 1.0);
            return;
          }
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uSkyHorizon, uSkyTop, pow(smoothstep(0.0, 0.85, h), 0.6));
          col = mix(col, uSkyHorizon * 0.8, smoothstep(0.02, -0.2, h));
          float sun = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunCol * (pow(sun, 900.0) * 6.0 + pow(sun, 18.0) * 0.35 + pow(sun, 3.0) * 0.08);
          // Night: a field of stars and a big pale moon with a halo (painted, not physical).
          if (uNight > 0.01) {
            vec2 sp = vec2(atan(d.z, d.x) * 95.0, d.y * 150.0);
            vec2 cell = floor(sp);
            float r = hash(cell);
            if (r > 0.972 && d.y > 0.0) {
              vec2 f = fract(sp) - 0.5 - (vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5) * 0.6;
              float tw = 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
              col += vec3(0.85, 0.9, 1.0) * smoothstep(0.17, 0.0, length(f)) * tw * smoothstep(0.0, 0.25, d.y) * uNight * 1.4;
            }
            vec3 md = normalize(uMoonDir);
            float m = max(dot(d, md), 0.0);
            vec3 mx = normalize(cross(md, vec3(0.0, 1.0, 0.0)));
            vec3 my = cross(mx, md);
            vec2 mp = vec2(dot(d, mx), dot(d, my)) * 30.0;
            float maria = smoothstep(0.45, 0.7, noise(mp * 1.3 + 3.0)) * 0.22 + smoothstep(0.5, 0.8, noise(mp * 3.1)) * 0.1;
            float disc = smoothstep(0.99915, 0.99935, m);
            col = mix(col, vec3(0.96, 0.97, 1.0) * (1.05 - maria), disc * uNight);
            col += vec3(0.6, 0.7, 1.0) * (pow(m, 160.0) * 0.55 + pow(m, 14.0) * 0.14) * uNight * (1.0 - disc);
          }
          // Clouds on a flattened dome (moonlit blue at night).
          if (d.y > 0.02) {
            vec2 cp = d.xz / (d.y + 0.25) * 1.4 + vec2(uTime * 0.006, uTime * 0.003);
            float c = smoothstep(0.52, 0.78, fbm(cp));
            vec3 cc = mix(uSkyHorizon * 1.08, vec3(1.0), 0.35 * (1.0 - uNight * 0.7)) + uSunCol * pow(sun, 6.0) * 0.4;
            col = mix(col, cc, c * smoothstep(0.02, 0.25, d.y) * (0.85 - uNight * 0.35));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  // Drawn after the opaque world, at the far plane: only the pixels where sky shows run its shader.
  dome.renderOrder = 1000;
  dome.frustumCulled = false;
  dome.name = 'sky';
  g.add(dome);
  g.add(buildFarRing());
  return g;
}

/** A ring of distant low mountains beyond the vale, fading into the horizon. */
function buildFarRing(): THREE.Mesh {
  const noise = new Noise2D(77);
  const segs = 128;
  const rows = 6;
  const cx = (MAP.minX + MAP.maxX) / 2;
  const cz = (MAP.minZ + MAP.maxZ) / 2;
  const pos: number[] = [];
  const far: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const radius = (78 + t * 210) * WORLD;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 2.2 + t * 3, Math.sin(a) * 2.2 + t * 2, 4) * 0.5 + 0.5;
      const ridge = Math.pow(n, 1.6) * (14 + t * 46) + (t > 0 && t < 1 ? 6 : 0);
      const y = r === 0 ? 2 : r === rows ? -5 : ridge;
      pos.push(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius * 0.9);
      far.push(t);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aFar', new THREE.Float32BufferAttribute(far, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      attribute float aFar;
      varying float vFar;
      varying float vLight;
      uniform vec3 uSunDir;
      void main() {
        vFar = aFar;
        vLight = 0.55 + 0.45 * max(dot(normalize(normal), normalize(uSunDir)), 0.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSkyHorizon, uFarTint;
      varying float vFar;
      varying float vLight;
      void main() {
        vec3 col = uFarTint * vLight;
        col = mix(col, uSkyHorizon, smoothstep(0.0, 0.95, vFar) * 0.85 + 0.12);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -5;
  mesh.name = 'far-ring';
  return mesh;
}
