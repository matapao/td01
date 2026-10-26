// Ring and blueprint constructors declare the uniforms updated by these views.
import { geometryAttribute } from './geometry-attributes.ts';
/** Health/progress bars (one draw call), terrain-draped rings, blueprint hologram material. */
import * as THREE from 'three';
import { groundHeight, type World } from '../game/map.ts';

/** Bar kinds (their colours below); the gate's runs green → amber → red with its strength. */
export const BAR = { enemy: 0, ally: 1, hero: 2, site: 3, station: 4, boss: 5, gate: 6 } as const;

export class Bars {
  readonly mesh: THREE.Mesh;
  private max = 600;
  private n = 0;
  private aPos: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor() {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
        3,
      ),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(
      THREE.DynamicDrawUsage,
    );
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iData', this.aData);
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 iPos;   // xyz, width
        attribute vec4 iData;  // fill, shield, kind, alpha
        varying vec2 vUv;
        varying vec4 vData;
        varying float vW;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float w = iPos.w;
          vec3 p = iPos.xyz + right * position.x * w + up * position.y * clamp(w * 0.13, 0.045, 0.16);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          vUv = uv;
          vData = iData;
          vW = w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec4 vData;
        varying float vW;
        vec3 kindColor(float k) {
          if (k < 0.5) return vec3(0.92, 0.22, 0.16);
          if (k < 1.5) return vec3(0.38, 0.86, 0.3);
          if (k < 2.5) return vec3(1.0, 0.8, 0.25);
          if (k < 3.5) return vec3(0.35, 0.72, 1.0);
          if (k < 4.5) return vec3(1.0, 0.6, 0.2);
          if (k < 5.5) return vec3(0.75, 0.2, 1.0);
          float f = vData.x;
          return f > 0.5 ? mix(vec3(1.0, 0.72, 0.18), vec3(0.4, 0.86, 0.3), (f - 0.5) * 2.0) : mix(vec3(0.95, 0.2, 0.14), vec3(1.0, 0.72, 0.18), f * 2.0);
        }
        void main() {
          float bx = 0.045 / max(vW, 0.3);
          vec2 uv = vUv;
          bool border = uv.x < bx || uv.x > 1.0 - bx || uv.y < 0.2 || uv.y > 0.8;
          vec3 col = vec3(0.06, 0.05, 0.04);
          if (!border) {
            float x = (uv.x - bx) / (1.0 - 2.0 * bx);
            vec3 k = kindColor(vData.z);
            if (x < vData.x) col = k * (0.75 + 0.45 * smoothstep(0.2, 0.8, uv.y));
            else if (x < vData.x + vData.y) col = vec3(0.75, 0.8, 1.0);
            else col = vec3(0.16, 0.13, 0.11);
            // segment ticks
            if (fract(x * vW * 2.0) < 0.06 && x < vData.x) col *= 0.7;
          }
          gl_FragColor = vec4(col, vData.w);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  begin(): void {
    this.n = 0;
  }

  push(
    x: number,
    y: number,
    z: number,
    width: number,
    fill: number,
    kind: number,
    shield = 0,
    alpha = 1,
  ): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    (this.aPos.array as Float32Array).set([x, y, z, width], i * 4);
    (this.aData.array as Float32Array).set(
      [Math.max(0, Math.min(1, fill)), Math.max(0, Math.min(1 - fill, shield)), kind, alpha],
      i * 4,
    );
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
  }
}

/** A circle that follows the terrain. */
export class DrapedRing {
  private world: World;
  private width: number;

  readonly mesh: THREE.Mesh;
  private segs = 96;
  private lastKey = '';

  constructor(world: World, color: THREE.ColorRepresentation, width = 0.12, opacity = 0.75, dashed = false) {
    this.world = world;
    this.width = width;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.segs + 1) * 2 * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((this.segs + 1) * 2 * 2), 2));
    const idx: number[] = [];
    for (let i = 0; i < this.segs; i++)
      idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uTime: { value: 0 },
        uDash: { value: dashed ? 1 : 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uDash; varying vec2 vUv;
        void main(){
          float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
          float dash = uDash > 0.5 ? step(0.45, fract(vUv.x * 48.0 - uTime * 0.6)) : 1.0;
          gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.0, 0.6, edge) * dash);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  set(x: number, z: number, r: number, color?: THREE.ColorRepresentation): void {
    const mat = this.mesh.material as THREE.ShaderMaterial;
    if (color !== undefined) mat.uniforms['uColor']!.value.set(color);
    this.mesh.visible = true;
    const key = `${x.toFixed(2)},${z.toFixed(2)},${r.toFixed(2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const pos = geometryAttribute(this.mesh.geometry, 'position') as THREE.BufferAttribute;
    const uv = geometryAttribute(this.mesh.geometry, 'uv') as THREE.BufferAttribute;
    for (let i = 0; i <= this.segs; i++) {
      const a = (i / this.segs) * Math.PI * 2;
      for (let s = 0; s < 2; s++) {
        const rr = r + (s ? this.width : -this.width);
        const px = x + Math.cos(a) * rr;
        const pz = z + Math.sin(a) * rr;
        pos.setXYZ(i * 2 + s, px, groundHeight(this.world, px, pz) + 0.09, pz);
        uv.setXY(i * 2 + s, i / this.segs, s);
      }
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
  }

  tick(t: number): void {
    (this.mesh.material as THREE.ShaderMaterial).uniforms['uTime']!.value = t;
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

/** Holographic "plan" material: fresnel glow + scanlines rising upward. */
export function blueprintMaterial(color: THREE.ColorRepresentation = '#6fd0ff'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uBuilt: { value: -100 },
      uAlpha: { value: 1 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uBuilt;
      uniform float uAlpha;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.55 + 0.45 * step(0.5, fract(vW.y * 6.0 - uTime * 1.5));
        float a = (0.05 + fres * 0.5) * scan;
        // Everything below the "built" line is hidden (the real model shows there).
        if (vW.y < uBuilt) discard;
        float edge = smoothstep(0.35, 0.0, abs(vW.y - uBuilt));
        vec3 col = uColor * (0.35 + fres * 0.6) + vec3(1.0, 0.95, 0.8) * edge * 1.2;
        gl_FragColor = vec4(col, min(1.0, a + edge) * uAlpha);
      }`,
  });
}
