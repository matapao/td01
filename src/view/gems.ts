// Every gem shape appends its nonempty crystal-tip list before glint creation/update.
/**
 * Socket gems: minerals grown out of the tower's lower windows, one window per colour. Every window
 * opening is a tall narrow arch (0.23 m wide, 0.64 m tall, set 0.065 m into the wall — measured off
 * KayKit's tower). A socketed window gets a seat of dark rock filling the opening, a thin gold rim
 * round it, and the gem: a cluster of hard crystal points in its colour, formed after its variant
 * (a three-point cluster for the elements, one long spike, a crown of points for the auras, two
 * slim shards for speed and reach, twin points, a cat's-eye cabochon, a rough geode for blast).
 *
 * It grows as it's upgraded: rough — a small, matte stone deep in the window; polished — the full
 * stone with a soft glow; radiant — too big for its window, standing out of the wall, glowing,
 * glinting, and alive with its colour: embers rise off a ruby, frost sparkles round a sapphire,
 * lightning crackles over a topaz, small stones circle an amethyst or an emerald.
 * Frame: origin at the opening's centre on the wall face, +z out of the wall, +y up (world units).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  GEM_COLORS,
  PLANS,
  type GemColor,
  type GemId,
  type GemPlan,
  type GemLevel,
} from '../game/content.ts';
import { patchMaterial } from './assets.ts';

/** The window opening (measured off the model, world units). */
export const OPENING = { w: 0.23, h: 0.64, depth: 0.065 };

type Form = 'cluster' | 'geode' | 'spike' | 'crown' | 'shards' | 'twin' | 'eye';

/** Each variant's form — the shape that tells it apart from the others of its colour. */
const FORM: Record<GemId, Form> = {
  ember: 'cluster',
  blast: 'geode',
  fury: 'spike',
  warheart: 'crown',
  frost: 'cluster',
  rime: 'crown',
  swift: 'shards',
  storm: 'cluster',
  sun: 'crown',
  arcane: 'cluster',
  twin: 'twin',
  scry: 'spike',
  seer: 'eye',
  far: 'shards',
};

/** One crystal point: a six-sided prism with a pyramid tip, base at the origin, pointing up +y. */
function point(len: number, r: number): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(r * 0.9, r, len * 0.68, 6, 1).translate(0, len * 0.34, 0);
  const tip = new THREE.ConeGeometry(r * 0.9, len * 0.32, 6, 1).translate(0, len * 0.68 + len * 0.16, 0);
  return mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
}

/** A point placed: from its base at `at`, leaning along `dir`, turned `spin` about itself. */
function placed(
  g: THREE.BufferGeometry,
  at: THREE.Vector3,
  dir: THREE.Vector3,
  spin = 0,
): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4()
    .makeRotationY(spin)
    .premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
    .setPosition(at);
  return g.clone().applyMatrix4(m);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * The crystal points of a form (merged into one geometry), and where its tips are (for glints).
 * `stub` < 1 makes them shorter and blunter (a rough gem).
 */
function formGeometry(form: Form, stub: number): { geo: THREE.BufferGeometry; tips: THREE.Vector3[] } {
  const parts: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  const add = (len: number, r: number, at: THREE.Vector3, dir: THREE.Vector3, spin = 0) => {
    const l = len * stub;
    parts.push(placed(point(l, r), at, dir, spin));
    tips.push(at.clone().add(dir.clone().normalize().multiplyScalar(l)));
  };
  switch (form) {
    case 'cluster':
      add(0.3, 0.055, V(0, -0.06, 0.02), V(0, 0.55, 1), 0.3);
      add(0.2, 0.04, V(-0.05, -0.1, 0.02), V(-0.55, 0.35, 1), 1.1);
      add(0.18, 0.038, V(0.05, -0.11, 0.02), V(0.6, 0.25, 1), 0.7);
      break;
    case 'spike':
      add(0.38, 0.06, V(0, -0.1, 0.02), V(0, 0.45, 1), 0.2);
      add(0.14, 0.032, V(0.045, -0.14, 0.03), V(0.5, 0.2, 1), 0.9);
      break;
    case 'crown':
      add(0.2, 0.045, V(0, -0.02, 0.03), V(0, 0.15, 1));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        add(
          0.13,
          0.03,
          V(Math.cos(a) * 0.065, Math.sin(a) * 0.085 - 0.02, 0.02),
          V(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 1),
          a,
        );
      }
      break;
    case 'shards':
      add(0.34, 0.032, V(-0.035, -0.13, 0.02), V(-0.12, 0.95, 0.75), 0.4);
      add(0.3, 0.03, V(0.04, -0.14, 0.02), V(0.15, 0.95, 0.8), 1.3);
      break;
    case 'twin':
      add(0.24, 0.048, V(-0.04, -0.08, 0.02), V(-0.12, 0.5, 1), 0.2);
      add(0.24, 0.048, V(0.04, -0.08, 0.02), V(0.12, 0.5, 1), 1.0);
      break;
    case 'geode': {
      // A rough round chunk, cracked open at the front.
      const g = new THREE.IcosahedronGeometry(0.12 * (0.85 + 0.15 * stub), 0)
        .scale(1, 1.15, 0.85)
        .translate(0, -0.03, 0.07);
      parts.push(g);
      tips.push(V(0.04, 0.06, 0.16), V(-0.05, -0.02, 0.16));
      break;
    }
    case 'eye': {
      // A cat's-eye cabochon: smooth and domed (tips: where the light catches it).
      const g = new THREE.SphereGeometry(0.095, 10, 7).scale(1, 1.35, 0.62).translate(0, 0, 0.07);
      parts.push(g.toNonIndexed());
      tips.push(V(0, 0.07, 0.13), V(0, -0.06, 0.13));
      break;
    }
  }
  const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  geo.computeVertexNormals();
  return { geo, tips };
}

const geoCache = new Map<string, { geo: THREE.BufferGeometry; tips: THREE.Vector3[] }>();
function form(id: GemId, q: GemLevel): { geo: THREE.BufferGeometry; tips: THREE.Vector3[] } {
  const key = `${FORM[id]}:${q === 1 ? 'r' : 'f'}`;
  let f = geoCache.get(key);
  if (!f) {
    f = formGeometry(FORM[id], q === 1 ? 0.78 : 1);
    geoCache.set(key, f);
  }
  return f;
}

const stoneMats = new Map<string, THREE.MeshLambertMaterial>();
/**
 * A gem's stone: rough ones dull and dark with no light of their own, polished ones their true
 * colour lit a little from within, brilliant ones bright and glowing (painted light, no shine).
 */
function stoneMat(color: GemColor, q: GemLevel): THREE.MeshLambertMaterial {
  const key = `${color}:${q}`;
  let m = stoneMats.get(key);
  if (!m) {
    const c = new THREE.Color(GEM_COLORS[color].color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const look =
      q === 1
        ? c.clone().setHSL(hsl.h, hsl.s * 0.45, hsl.l * 0.55)
        : q === 3
          ? c.clone().setHSL(hsl.h, Math.min(1, hsl.s * 1.1), Math.min(0.75, hsl.l * 1.15))
          : c;
    m = patchMaterial(
      new THREE.MeshLambertMaterial({
        color: look,
        emissive: look,
        emissiveIntensity: q === 1 ? 0 : q === 2 ? 0.28 : 0.65,
        flatShading: true,
      }),
    );
    stoneMats.set(key, m);
  }
  return m;
}

const mats = {
  rock: patchMaterial(new THREE.MeshLambertMaterial({ color: '#3d3833', flatShading: true })),
  gold: patchMaterial(
    new THREE.MeshLambertMaterial({
      color: '#c99a35',
      emissive: '#2a1c00',
      emissiveIntensity: 0.3,
      flatShading: true,
    }),
  ),
  band: new THREE.MeshBasicMaterial({
    color: '#fff3c4',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }),
};

/** An arch outline (a tall rectangle with a round top), `w` wide and `h` tall, centred. */
function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, -h / 2);
  s.lineTo(r, -h / 2);
  s.lineTo(r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  s.lineTo(-r, -h / 2);
  return s;
}

let seatGeo: THREE.BufferGeometry | null = null;
let rimGeo: THREE.BufferGeometry | null = null;
let rubbleGeo: THREE.BufferGeometry | null = null;
/** The seat: dark rock filling the opening (the matrix the gem grows from), and a thin gold rim. */
function seat(): THREE.Group {
  const g = new THREE.Group();
  seatGeo ??= new THREE.ExtrudeGeometry(archShape(OPENING.w, OPENING.h), {
    depth: 0.05,
    bevelEnabled: false,
    curveSegments: 8,
  });
  rimGeo ??= (() => {
    const outer = archShape(OPENING.w + 0.05, OPENING.h + 0.05);
    outer.holes.push(archShape(OPENING.w, OPENING.h));
    return new THREE.ExtrudeGeometry(outer, { depth: 0.03, bevelEnabled: false, curveSegments: 8 });
  })();
  // Rough lumps of the rock round the gem's foot.
  rubbleGeo ??= mergeGeometries(
    [0, 1, 2].map((i) =>
      new THREE.DodecahedronGeometry(0.05 + i * 0.008, 0).translate(
        (i - 1) * 0.06,
        -0.14 + (i % 2) * 0.02,
        0.02,
      ),
    ),
  )!;
  const plate = new THREE.Mesh(seatGeo, mats.rock);
  plate.position.z = -OPENING.depth;
  const rim = new THREE.Mesh(rimGeo, mats.gold);
  rim.position.z = -0.012;
  const rubble = new THREE.Mesh(rubbleGeo, mats.rock);
  g.add(plate, rim, rubble);
  return g;
}

/** A four-pointed glint for brilliant gems (drawn once). */
let starTex: THREE.Texture | null = null;
function star(): THREE.Texture {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 6 : 31;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

/** How big a gem stands at each level (rough ones sit small in the window, radiant ones overflow it). */
const SIZE: Record<GemLevel, number> = { 1: 0.62, 2: 1, 3: 1.55 };

/** The stone of gem `id` alone, as it looks at level `lv` (also what its HUD icon shows). */
export function gemStone(id: GemId, lv: GemLevel = 2): THREE.Group {
  const plan = PLANS[id] as GemPlan;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(form(id, lv).geo, stoneMat(plan.color, lv)));
  if (FORM[id] === 'eye' && lv > 1) {
    // The cat's-eye: a band of light across the dome.
    const band = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.2), mats.band);
    band.position.set(0, 0, 0.13);
    g.add(band);
  }
  return g;
}

export interface SocketGem {
  obj: THREE.Group;
  update: (t: number, night: number) => void;
}

/**
 * The world FX a radiant gem asks for (positions in world space): an ember rising off a ruby, a
 * frost sparkle drifting round a sapphire, a lightning arc from a topaz's point to its rim.
 */
export type GemFx = (kind: 'ember' | 'frost' | 'arc', at: THREE.Vector3, to?: THREE.Vector3) => void;

let pingGeo: THREE.BufferGeometry | null = null;

/** Gem `id` at level `lv` set in its window: seat, rim, stone, and as it grows, its light. */
export function socketGem(id: GemId, lv: GemLevel, glowTex: THREE.Texture, fx: GemFx): SocketGem {
  const plan = PLANS[id] as GemPlan;
  const color = GEM_COLORS[plan.color].color;
  const g = new THREE.Group();
  g.add(seat());
  const stone = gemStone(id, lv);
  const size = SIZE[lv];
  stone.scale.setScalar(size);
  // Rough: tucked into the window. Radiant: standing out of it.
  stone.position.set(0, lv === 3 ? 0.04 : 0.02, lv === 1 ? -0.035 : lv === 3 ? 0.05 : 0);
  g.add(stone);
  const glowSprite = (c: string, opacity: number) =>
    new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: c,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity,
      }),
    );
  let glow: THREE.Sprite | null = null;
  if (lv > 1) {
    glow = glowSprite(color, lv === 3 ? 0.85 : 0.4);
    glow.position.set(0, 0.05, lv === 3 ? 0.2 : 0.12);
    g.add(glow);
  }
  const tips = form(id, lv).tips.map((t) => t.clone().multiplyScalar(size).add(stone.position));
  // Radiant: glints on its points, and its colour's life.
  const glints: { s: THREE.Sprite; t: number; every: number }[] = [];
  const motes: THREE.Object3D[] = [];
  let ping: THREE.Mesh | null = null;
  if (lv === 3) {
    for (let i = 0; i < 2; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: star(),
          color: '#ffffff',
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      sp.position.copy(tips[i % tips.length]!);
      sp.scale.setScalar(0);
      g.add(sp);
      glints.push({ s: sp, t: i * 0.7, every: 1.1 + i * 0.45 });
    }
    if (plan.color === 'amethyst') {
      // Small stones of its colour, glowing, circling in and out of it.
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Group();
        m.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.028 + i * 0.006, 0), stoneMat(plan.color, 3)));
        const halo = glowSprite(color, 0.7);
        halo.scale.setScalar(0.14);
        m.add(halo);
        g.add(m);
        motes.push(m);
      }
    }
    if (plan.color === 'emerald') {
      // A ring of green light going out from it now and then, like a lookout's sweep.
      pingGeo ??= new THREE.RingGeometry(0.9, 1, 40);
      ping = new THREE.Mesh(
        pingGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ping.position.set(0, 0.04, 0.16);
      g.add(ping);
    }
  }
  const phase = (id.length * 1.7) % 6.28;
  const rim = (): THREE.Vector3 => {
    // A point on the window's edge: up either side or round the arch.
    const side = Math.random() < 0.5 ? -1 : 1;
    const y = (Math.random() - 0.35) * OPENING.h;
    return V(side * (OPENING.w / 2 + 0.02), Math.min(y, OPENING.h / 2 - OPENING.w / 2), 0.02);
  };
  let last = 0;
  return {
    obj: g,
    update: (t, night) => {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      if (glow)
        glow.scale.setScalar(
          (lv === 3 ? 1.0 : 0.45) *
            (0.7 + night * 0.5) *
            (1 + Math.sin(t * 2.2 + phase) * (lv === 3 ? 0.12 : 0.06)),
        );
      if (lv < 3) return;
      for (const gl of glints) {
        gl.t += dt;
        if (gl.t > gl.every) {
          gl.t -= gl.every;
          gl.s.position.copy(tips[Math.floor(Math.random() * tips.length)]!);
        }
        // A quick flash: up and gone in a quarter of a second.
        const f = gl.t < 0.25 ? Math.sin((gl.t / 0.25) * Math.PI) : 0;
        gl.s.scale.setScalar(f * 0.22);
        gl.s.material.rotation = t * 1.5;
      }
      motes.forEach((m, i) => {
        // Out round the stone and back in through it, on tilted orbits.
        const a = t * (1.1 + i * 0.25) + (i / 3) * Math.PI * 2;
        const r = 0.1 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.1));
        m.position.set(Math.cos(a) * r, 0.05 + Math.sin(a) * r * 0.8, 0.14 + Math.sin(a * 0.5 + i) * 0.1);
        m.rotation.y = t * 2;
      });
      if (ping) {
        const k = ((t + phase) % 2.4) / 2.4;
        ping.scale.setScalar(0.05 + k * 0.42);
        (ping.material as THREE.MeshBasicMaterial).opacity = k < 0.7 ? 0.75 * (1 - k / 0.7) : 0;
      }
      const tip = () => g.localToWorld(tips[Math.floor(Math.random() * tips.length)]!.clone());
      if (plan.color === 'ruby' && Math.random() < dt * 7) fx('ember', tip());
      else if (plan.color === 'sapphire' && Math.random() < dt * 6)
        fx(
          'frost',
          g.localToWorld(
            V((Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.4, 0.1 + Math.random() * 0.25),
          ),
        );
      else if (plan.color === 'topaz' && Math.random() < dt * 3.5) fx('arc', tip(), g.localToWorld(rim()));
    },
  };
}
