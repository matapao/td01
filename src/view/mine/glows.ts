import * as THREE from 'three';
import { geometryAttribute } from '../geometry-attributes.ts';
import { softDot } from '../textures.ts';
/** Fixed flame marks in one capped camera-facing batch; tiles only request a refresh. */
export class MineGlows {
  private cap: number;

  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private size: Float32Array;
  private color: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  readonly mat: THREE.ShaderMaterial;
  count = 0;
  private fixed: { x: number; y: number; z: number; w: number; h: number; color: THREE.Color; k: number }[] =
    [];
  private dirty = true;

  constructor(cap: number) {
    this.cap = cap;

    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', geometryAttribute(base, 'position'));
    geo.setAttribute('uv', geometryAttribute(base, 'uv'));
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap * 2);
    this.color = new Float32Array(cap * 4);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(this.size, 2));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.color, 4));
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softDot(64) }, uTime: { value: 0 } },
      vertexShader: `
        attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iColor;
        uniform float uTime;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vUv = uv;
          vCol = iColor;
          float f = 1.0 + 0.08 * sin(uTime * 9.0 + iColor.a * 40.0) + 0.05 * sin(uTime * 23.0 + iColor.a * 17.0);
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iSize * f;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          float a = texture2D(uMap, vUv).a;
          gl_FragColor = vec4(vCol.rgb * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  add(x: number, y: number, z: number, w: number, h: number, color: THREE.Color, k: number): void {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.pos.set([x, y, z], i * 3);
    this.size.set([w, h], i * 2);
    this.color.set([color.r * k, color.g * k, color.b * k, (i * 0.618) % 1], i * 4);
    this.geo.instanceCount = this.count;
    for (const n of ['iPos', 'iSize', 'iColor'])
      (this.geo.attributes[n] as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.geo.instanceCount = 0;
  }

  markDirty(): void {
    this.dirty = true;
  }
  refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.clear();
    for (const g of this.fixed) this.add(g.x, g.y, g.z, g.w, g.h, g.color, g.k);
    // (A gem's halo: a glimmer in the dark to be found, not a lamp.)
    // Mineral colours carry the detail; omit translucent halos over every exposed gem.
  }
  flame(x: number, y: number, z: number, w: number, h: number, color: THREE.Color, k: number): void {
    // Keep only tiny flame marks; broad additive halos obscure the painted surfaces.
    if (w > 0.3 || h > 0.4) return;
    this.fixed.push({ x, y, z, w, h, color, k: Math.min(k, 0.6) });
    this.dirty = true;
  }
}
