// Particle buffers share max capacity; live slots stay below n <= max. Reverse removal loops retain valid indices.
import { atlas } from './particle-atlas.ts';
/** Particles, floating text, ground rings/decals and beams. Everything pooled. */
import * as THREE from 'three';
import { RNG } from '../core/rng.ts';

// ---- Particle atlas ---------------------------------------------------------------------------

export const TEX = { dot: 0, spark: 1, smoke: 2, star: 3, ring: 4, chunk: 5, leaf: 6, rune: 7 } as const;
export type TexName = keyof typeof TEX;

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life?: number;
  size?: number;
  size1?: number;
  color?: THREE.ColorRepresentation;
  color1?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  tex?: TexName;
  /** Stretch along velocity (sparks). */
  stretch?: number;
}

class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private max: number;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private tex: Float32Array;
  private stretch: Float32Array;
  private aPos: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private aMisc: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(max: number, additive: boolean, map: THREE.Texture) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max * 2);
    this.c0 = new Float32Array(max * 4);
    this.c1 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.tex = new Float32Array(max);
    this.stretch = new Float32Array(max);
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
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iVel', this.aVel);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { map: { value: map } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iCol;
        attribute vec4 iMisc; // size, rotation, tex, stretch
        attribute vec3 iVel;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec2 p = position.xy;
          float c = cos(iMisc.y), s = sin(iMisc.y);
          vec3 offs;
          if (iMisc.w > 0.0) {
            vec3 v = iVel;
            vec3 vs = vec3(dot(v, right), dot(v, up), 0.0);
            float l = length(vs.xy);
            vec2 dir = l > 1e-4 ? vs.xy / l : vec2(0.0, 1.0);
            vec2 nrm = vec2(-dir.y, dir.x);
            vec2 q = nrm * p.x * iMisc.x + dir * p.y * iMisc.x * (1.0 + l * iMisc.w);
            offs = right * q.x + up * q.y;
          } else {
            vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) * iMisc.x;
            offs = right * q.x + up * q.y;
          }
          vec4 mv = viewMatrix * vec4(iPos + offs, 1.0);
          gl_Position = projectionMatrix * mv;
          float t = iMisc.z;
          // 4×2 atlas, row 0 at the top of the canvas (flipY texture).
          vUv = vec2((mod(t, 4.0) + uv.x) / 4.0, (1.0 - floor(t / 4.0) + uv.y) / 2.0);
          vCol = iCol;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vec4 t = texture2D(map, vUv);
          gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
          if (gl_FragColor.a < 0.004) discard;
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
  }

  emit(e: Emit): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos.set([e.x, e.y, e.z], i * 3);
    this.vel.set([e.vx ?? 0, e.vy ?? 0, e.vz ?? 0], i * 3);
    this.life[i] = 0;
    this.maxLife[i] = e.life ?? 0.8;
    this.size[i * 2] = e.size ?? 0.5;
    this.size[i * 2 + 1] = e.size1 ?? e.size ?? 0.5;
    const a = new THREE.Color(e.color ?? '#ffffff');
    const b = new THREE.Color(e.color1 ?? e.color ?? '#ffffff');
    this.c0.set([a.r, a.g, a.b, e.alpha ?? 1], i * 4);
    this.c1.set([b.r, b.g, b.b, 0], i * 4);
    this.grav[i] = e.gravity ?? 0;
    this.drag[i] = e.drag ?? 0;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = e.spin ?? 0;
    this.tex[i] = TEX[e.tex ?? 'dot'];
    this.stretch[i] = e.stretch ?? 0;
  }

  update(dt: number): void {
    let j = 0;
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const M = this.aMisc.array as Float32Array;
    const V = this.aVel.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i]! + dt;
      if (life >= this.maxLife[i]!) continue;
      // Compact: move particle i into slot j.
      if (i !== j) {
        this.pos.copyWithin(j * 3, i * 3, i * 3 + 3);
        this.vel.copyWithin(j * 3, i * 3, i * 3 + 3);
        this.size.copyWithin(j * 2, i * 2, i * 2 + 2);
        this.c0.copyWithin(j * 4, i * 4, i * 4 + 4);
        this.c1.copyWithin(j * 4, i * 4, i * 4 + 4);
        this.maxLife[j] = this.maxLife[i]!;
        this.grav[j] = this.grav[i]!;
        this.drag[j] = this.drag[i]!;
        this.rot[j] = this.rot[i]!;
        this.spin[j] = this.spin[i]!;
        this.tex[j] = this.tex[i]!;
        this.stretch[j] = this.stretch[i]!;
      }
      this.life[j] = life;
      const k = 1 - this.drag[j]! * dt;
      this.vel[j * 3]! *= k;
      this.vel[j * 3 + 1] = this.vel[j * 3 + 1]! * k - this.grav[j]! * dt;
      this.vel[j * 3 + 2]! *= k;
      this.pos[j * 3]! += this.vel[j * 3]! * dt;
      this.pos[j * 3 + 1]! += this.vel[j * 3 + 1]! * dt;
      this.pos[j * 3 + 2]! += this.vel[j * 3 + 2]! * dt;
      this.rot[j]! += this.spin[j]! * dt;
      const t = life / this.maxLife[j]!;
      P[j * 3] = this.pos[j * 3]!;
      P[j * 3 + 1] = this.pos[j * 3 + 1]!;
      P[j * 3 + 2] = this.pos[j * 3 + 2]!;
      V[j * 3] = this.vel[j * 3]!;
      V[j * 3 + 1] = this.vel[j * 3 + 1]!;
      V[j * 3 + 2] = this.vel[j * 3 + 2]!;
      const fadeIn = Math.min(1, t * 8);
      for (let c = 0; c < 3; c++)
        C[j * 4 + c] = this.c0[j * 4 + c]! + (this.c1[j * 4 + c]! - this.c0[j * 4 + c]!) * t;
      C[j * 4 + 3] = this.c0[j * 4 + 3]! * (1 - t * t) * fadeIn;
      M[j * 4] = this.size[j * 2]! + (this.size[j * 2 + 1]! - this.size[j * 2]!) * t;
      M[j * 4 + 1] = this.rot[j]!;
      M[j * 4 + 2] = this.tex[j]!;
      M[j * 4 + 3] = this.stretch[j]! * 0.08;
      j++;
    }
    this.n = j;
    this.geo.instanceCount = j;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aMisc.needsUpdate = true;
    this.aVel.needsUpdate = true;
  }
}

// ---- Floating text ----------------------------------------------------------------------------

interface FloatText {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  vy: number;
  life: number;
  max: number;
}

// ---- Rings / decals / beams --------------------------------------------------------------------

interface RingFx {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  r0: number;
  r1: number;
  alpha: number;
}

interface BeamFx {
  line: THREE.Mesh;
  life: number;
  max: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  width: number;
  jitter: number;
}

export class Fx {
  private camera: THREE.Camera;

  readonly group = new THREE.Group();
  private add: ParticleLayer;
  private alpha: ParticleLayer;
  private texts: FloatText[] = [];
  private rings: RingFx[] = [];
  private beams: BeamFx[] = [];
  private decals: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  private ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  private decalTex: THREE.Texture;
  private textLayer: HTMLDivElement;
  readonly rng = new RNG(99);

  constructor(camera: THREE.Camera, uiRoot: HTMLElement) {
    this.camera = camera;

    const map = atlas();
    this.add = new ParticleLayer(4000, true, map);
    this.alpha = new ParticleLayer(2500, false, map);
    this.group.add(this.add.mesh, this.alpha.mesh);
    this.textLayer = document.createElement('div');
    this.textLayer.className = 'fx-text-layer';
    uiRoot.appendChild(this.textLayer);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(20,14,10,0.9)');
    grd.addColorStop(0.6, 'rgba(30,20,12,0.55)');
    grd.addColorStop(1, 'rgba(30,20,12,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    this.decalTex = new THREE.CanvasTexture(c);
  }

  /** Additive (glowy) particle. */
  glow(e: Emit): void {
    this.add.emit(e);
  }

  /** Alpha-blended (smoke, dust, chunks) particle. */
  puff(e: Emit): void {
    this.alpha.emit(e);
  }

  burst(
    x: number,
    y: number,
    z: number,
    n: number,
    o: Partial<Emit> & { speed?: number; up?: number; additive?: boolean } = {},
  ): void {
    const sp = o.speed ?? 3;
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = sp * this.rng.range(0.4, 1);
      const e: Emit = {
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vz: Math.sin(a) * s,
        vy: (o.up ?? sp * 0.8) * this.rng.range(0.5, 1.2),
        life: (o.life ?? 0.7) * this.rng.range(0.7, 1.2),
        size: (o.size ?? 0.3) * this.rng.range(0.7, 1.3),
        gravity: o.gravity ?? 9,
        drag: o.drag ?? 1,
        spin: o.spin ?? this.rng.range(-6, 6),
        tex: o.tex ?? 'dot',
      };
      // Keep the pooled emission path free of temporary option-spread objects.
      if (o.size1 !== undefined) e.size1 = o.size1;
      if (o.color !== undefined) e.color = o.color;
      if (o.color1 !== undefined) e.color1 = o.color1;
      if (o.stretch !== undefined) e.stretch = o.stretch;
      if (o.alpha !== undefined) e.alpha = o.alpha;
      if (o.additive === false) this.alpha.emit(e);
      else this.add.emit(e);
    }
  }

  text(x: number, y: number, z: number, str: string, cls: string, life = 0.9): void {
    if (this.texts.length > 80) {
      const old = this.texts.shift()!;
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = `fx-text ${cls}`;
    el.textContent = str;
    this.textLayer.appendChild(el);
    this.texts.push({
      el,
      pos: new THREE.Vector3(x + this.rng.range(-0.3, 0.3), y, z),
      vy: 1.6,
      life: 0,
      max: life,
    });
  }

  ring(
    x: number,
    y: number,
    z: number,
    r0: number,
    r1: number,
    color: THREE.ColorRepresentation,
    life = 0.5,
    alpha = 0.9,
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: alpha,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, y + 0.08, z);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.rings.push({ mesh, life: 0, max: life, r0, r1, alpha });
  }

  scorch(x: number, y: number, z: number, r: number, life = 6): void {
    const mat = new THREE.MeshBasicMaterial({
      map: this.decalTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), mat);
    mesh.position.set(x, y + 0.04, z);
    mesh.rotation.y = this.rng.range(0, 6);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.decals.push({ mesh, life: 0, max: life });
  }

  /** A crackling arc from a to b (`jitter`: how far its kinks stray). */
  beam(
    a: THREE.Vector3,
    b: THREE.Vector3,
    color: THREE.ColorRepresentation,
    width = 0.25,
    life = 0.22,
    jitter = 0.35,
  ): void {
    const segs = 10;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segs + 1) * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < segs; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const line = new THREE.Mesh(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 7;
    this.group.add(line);
    this.beams.push({ line, life: 0, max: life, a: a.clone(), b: b.clone(), width, jitter });
  }

  update(dt: number, viewW: number, viewH: number): void {
    this.add.update(dt);
    this.alpha.update(dt);
    // Floating text.
    const v = new THREE.Vector3();
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life += dt;
      if (t.life >= t.max) {
        t.el.remove();
        this.texts.splice(i, 1);
        continue;
      }
      t.vy = Math.max(0.3, t.vy - dt * 3);
      t.pos.y += t.vy * dt;
      v.copy(t.pos).project(this.camera);
      if (v.z > 1) {
        t.el.style.opacity = '0';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * viewW;
      const y = (-v.y * 0.5 + 0.5) * viewH;
      const k = t.life / t.max;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : k < 0.25 ? 1.3 - ((k - 0.12) / 0.13) * 0.3 : 1;
      t.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${pop.toFixed(3)})`;
      t.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life += dt;
      const k = r.life / r.max;
      if (k >= 1) {
        r.mesh.removeFromParent();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.alpha * (1 - k);
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]!;
      d.life += dt;
      const k = d.life / d.max;
      if (k >= 1) {
        d.mesh.removeFromParent();
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.decals.splice(i, 1);
        continue;
      }
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    }
    const camPos = (this.camera as THREE.PerspectiveCamera).position;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i]!;
      bm.life += dt;
      if (bm.life >= bm.max) {
        bm.line.removeFromParent();
        bm.line.geometry.dispose();
        (bm.line.material as THREE.Material).dispose();
        this.beams.splice(i, 1);
        continue;
      }
      const pos = bm.line.geometry.attributes['position'] as THREE.BufferAttribute;
      const segs = pos.count / 2 - 1;
      const dir = new THREE.Vector3().subVectors(bm.b, bm.a);
      const side = new THREE.Vector3()
        .crossVectors(dir, new THREE.Vector3().subVectors(camPos, bm.a))
        .normalize();
      const w = bm.width * (1 - bm.life / bm.max);
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const p = new THREE.Vector3().lerpVectors(bm.a, bm.b, t);
        if (s > 0 && s < segs)
          p.add(
            new THREE.Vector3(
              this.rng.range(-bm.jitter, bm.jitter),
              this.rng.range(-bm.jitter, bm.jitter),
              this.rng.range(-bm.jitter, bm.jitter),
            ),
          );
        pos.setXYZ(s * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
        pos.setXYZ(s * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      }
      pos.needsUpdate = true;
    }
  }
}
