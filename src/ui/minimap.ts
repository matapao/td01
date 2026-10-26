import { TUNNELS, tunnelWorld } from '../game/mine-routes.ts';
import * as THREE from 'three';
import type { Game } from '../view/game.ts';
import { DRONE, ENEMIES, isTower, sizeOf } from '../game/content.ts';
import { MAP_GLYPH, drawGlyph } from './glyphs.ts';
import { gridOf } from '../game/systems/power.ts';
import { GATE, GRID_H, GRID_W, HF_STEP, HF_W, MAP, WALL } from '../game/map.ts';
import { el } from './dom.ts';
import { roomHalf } from '../game/interiors.ts';
import { roomAt } from '../game/systems/rooms.ts';

const SIZE = 210;
const W = MAP.maxX - MAP.minX;
const H = MAP.maxZ - MAP.minZ;
const SCALE = (SIZE - 6) / W;
const OX = (SIZE - W * SCALE) / 2;
const OY = (SIZE - H * SCALE) / 2;

export class Minimap {
  private game: Game;

  readonly root = el('div', 'minimap-wrap pe');
  readonly label = el('div', 'mm-label');
  private canvas = el('canvas');
  private g: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private fog = el('canvas');
  private fogT = 0;
  private pings: { x: number; z: number; t: number; r: number; color: string }[] = [];
  private blips = new Map<number, number>();

  constructor(game: Game) {
    this.game = game;

    this.canvas.width = this.canvas.height = SIZE * 2;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(2, 2);
    this.root.append(this.canvas, this.label);
    this.base = this.paintBase();
    this.fog.width = GRID_W;
    this.fog.height = GRID_H;
    this.canvas.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    const ev = game.sim.events;
    ev.on('radarPulse', (e) => {
      this.pings.push({ x: e.x, z: e.z, t: 0, r: e.r, color: '#c18bff' });
      for (const id of e.found) this.blips.set(id, 3.5);
    });
    ev.on('waveStarted', () => {
      for (const l of game.sim.world.lanes) {
        const x = l.xs[0],
          z = l.zs[0];
        if (x !== undefined && z !== undefined) this.pings.push({ x, z, t: 0, r: 10, color: '#ff5a4a' });
      }
    });
    ev.on('storeDiscovered', (e) => this.pings.push({ x: e.x, z: e.z, t: 0, r: 8, color: '#ffd36a' }));
  }

  private paintBase(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = SIZE * 2;
    c.height = SIZE * 2;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    const world = this.game.sim.world;
    const step = 1;
    for (let z = MAP.minZ; z < MAP.maxZ; z += step) {
      for (let x = MAP.minX; x < MAP.maxX; x += step) {
        const ix = Math.round((x - MAP.minX) / HF_STEP);
        const iz = Math.round((z - MAP.minZ) / HF_STEP);
        const k = iz * HF_W + ix;
        // k is within the shared HF_W × HF_H terrain buffers.
        const h = world.heights[k]!;
        let col: [number, number, number];
        if (h < 0.05) col = [52, 104, 128];
        else if (world.road[k]! > 0.4) col = [168, 128, 82];
        else if (h > 5) col = [120, 118, 112];
        else col = [86 + h * 6, 128 + h * 4, 62];
        const b = world.blight[k]!;
        col = [
          col[0] * (1 - b * 0.3) + 90 * b * 0.3,
          col[1] * (1 - b * 0.4) + 70 * b * 0.4,
          col[2] * (1 - b * 0.2) + 100 * b * 0.2,
        ];
        g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
        g.fillRect(
          OX + (x - MAP.minX) * SCALE,
          OY + (z - MAP.minZ) * SCALE,
          SCALE * step + 0.6,
          SCALE * step + 0.6,
        );
      }
    }
    // The wall across the pass (its gate is drawn with the markers: shut or open).
    g.strokeStyle = '#2e3138';
    g.lineWidth = Math.max(2, WALL.half * 2 * SCALE);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(OX + (WALL.x - MAP.minX) * SCALE, OY + (side * WALL.gateHalf - MAP.minZ) * SCALE);
      g.lineTo(OX + (WALL.x - MAP.minX) * SCALE, OY + (side * (WALL.walkEnd + 4) - MAP.minZ) * SCALE);
      g.stroke();
    }
    return c;
  }

  private toMap(x: number, z: number): [number, number] {
    return [OX + (x - MAP.minX) * SCALE, OY + (z - MAP.minZ) * SCALE];
  }

  /** Inside a building: a plan of its room — walls, door, furniture, the bench, and you. */
  private drawRoom(): void {
    const g = this.g;
    const me = this.game.sim.getAs(this.game.localHero, 'hero');
    g.fillStyle = '#0b0a0d';
    g.fillRect(0, 0, SIZE, SIZE);
    const r = me ? roomAt(this.game.sim, me.x, me.z) : null;
    if (!r || !me) return;
    const { hx, hz } = roomHalf(r.def);
    const sc = (SIZE - 40) / (Math.max(hx, hz) * 2);
    const at = (x: number, z: number): [number, number] => [SIZE / 2 + x * sc, SIZE / 2 + z * sc];
    const rect = (q: { x0: number; z0: number; x1: number; z1: number }) => {
      const [x0, y0] = at(q.x0, q.z0);
      g.fillRect(x0, y0, (q.x1 - q.x0) * sc, (q.z1 - q.z0) * sc);
    };
    const [x0, y0] = at(-hx, -hz);
    g.fillStyle = '#3a332c';
    g.fillRect(x0, y0, hx * 2 * sc, hz * 2 * sc);
    // The loft (lighter: a storey up) and its stair.
    g.fillStyle = '#4c4236';
    for (const l of r.def.levels) rect(l);
    g.fillStyle = '#5a4e40';
    for (const q of r.def.ramps) rect(q);
    g.strokeStyle = '#8a7a62';
    g.lineWidth = 3;
    g.strokeRect(x0, y0, hx * 2 * sc, hz * 2 * sc);
    // The door: a gap in the front wall.
    const [dx, dy] = at(r.def.door.x, hz);
    g.fillStyle = '#ffd36a';
    g.fillRect(dx - 7, dy - 2, 14, 4);
    g.fillStyle = '#6a5c4c';
    for (const q of r.def.solids) rect(q);
    if (r.def.hearth) {
      g.fillStyle = '#c0531e';
      rect(r.def.hearth);
    }
    const [bx, by] = at(r.def.bench.x, r.def.bench.z);
    g.fillStyle = '#7dd0ff';
    g.beginPath();
    g.arc(bx, by, 3.2, 0, Math.PI * 2);
    g.fill();
    const [px, py] = at(r.lx, r.lz);
    g.fillStyle = '#7dffb0';
    g.strokeStyle = '#000';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(px, py, 3.4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    this.label.textContent = r.def.name;
  }

  /** Only the lift and excavated passages appear; unmined ore is found with the scanner. */
  private drawMine(): void {
    const g = this.g,
      me = this.game.sim.getAs(this.game.localHero, 'hero');
    if (!me) return;
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#24221f';
    g.fillRect(0, 0, SIZE, SIZE);
    const scale = 9,
      at = (x: number, z: number): [number, number] => [
        SIZE / 2 + (x - me.x) * scale,
        SIZE / 2 + (z - me.z) * scale,
      ];
    const draw = (x: number, z: number, r: number, color: string) => {
      const [px, py] = at(x, z);
      g.fillStyle = color;
      g.beginPath();
      g.arc(px, py, r * scale, 0, Math.PI * 2);
      g.fill();
    };
    for (const route of TUNNELS)
      for (const path of [route.points, route.branch]) {
        g.strokeStyle = '#aa9981';
        g.lineWidth = route.radius * scale * 1.6;
        g.lineCap = 'round';
        g.beginPath();
        path.forEach((p, i) => {
          const w = tunnelWorld(p),
            [x, z] = at(w.x, w.z);
          i ? g.lineTo(x, z) : g.moveTo(x, z);
        });
        g.stroke();
      }
    const m = this.game.sim.state.mines[0];
    if (!m) return;
    draw(m.lift.x, m.lift.z, 1, '#aa9981');
    for (const c of this.game.sim.state.earth?.cuts ?? [])
      if (c.x > 1500 && Math.hypot(c.x - me.x, c.z - me.z) < 15) draw(c.x, c.z, c.r, '#aa9981');
    draw(m.lift.x, m.lift.z, 0.15, '#e5c978');
    draw(me.x, me.z, 0.2, '#8fd6ad');
    this.label.textContent = 'Ashdeep · V: mineral scanner';
  }

  update(dt: number): void {
    const g = this.g;
    const s = this.game.sim.state;
    if (this.game.indoors) {
      this.drawRoom();
      return;
    }
    if (this.game.under) {
      this.drawMine();
      return;
    }
    g.clearRect(0, 0, SIZE, SIZE);
    g.drawImage(this.base, 0, 0, SIZE, SIZE);
    // Fog.
    this.fogT -= dt;
    if (this.fogT <= 0) {
      this.fogT = 0.5;
      const fg = this.fog.getContext('2d')!;
      const img = fg.createImageData(GRID_W, GRID_H);
      for (let i = 0; i < s.explored.length; i++) {
        img.data[i * 4 + 3] = s.explored[i] ? 0 : 215;
        img.data[i * 4] = 8;
        img.data[i * 4 + 1] = 10;
        img.data[i * 4 + 2] = 16;
      }
      fg.putImageData(img, 0, 0);
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog, OX, OY, W * SCALE, H * SCALE);
    // Routes (open ones bright, closed dashed).
    this.game.sim.world.lanes.forEach((lane, i) => {
      g.strokeStyle = s.lanesOpen[i] ? 'rgba(255,120,90,0.55)' : 'rgba(255,200,150,0.25)';
      g.lineWidth = lane.def.trail ? 1.2 : 2;
      g.setLineDash(s.lanesOpen[i] ? [] : [3, 3]);
      // Only the stretches someone has seen: where a road leads is part of exploring.
      g.beginPath();
      let pen = false;
      // Lane coordinates are paired buffers allocated with the same sample count.
      for (let k = 0; k < lane.xs.length; k += 4) {
        const x = lane.xs[k]!,
          z = lane.zs[k]!;
        const [px, py] = this.toMap(x, z);
        if (!this.game.sim.isExplored(x, z)) {
          pen = false;
          continue;
        }
        if (pen) g.lineTo(px, py);
        else g.moveTo(px, py);
        pen = true;
      }
      g.stroke();
    });
    g.setLineDash([]);
    // Keep, stores, chests, camps.
    const dot = (x: number, z: number, r: number, color: string, stroke = '#000') => {
      const [px, py] = this.toMap(x, z);
      g.fillStyle = color;
      g.strokeStyle = stroke;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    // Markers (game-icons glyphs, haloed so they read on any ground): the keep, the crypts and mine
    // heads you have found, discovered shops, chests not yet opened, live camps.
    const mark = (
      id: (typeof MAP_GLYPH)[keyof typeof MAP_GLYPH],
      x: number,
      z: number,
      size: number,
      color: string,
    ) => {
      const [px, py] = this.toMap(x, z);
      drawGlyph(g, id, px, py, size, color, 'rgba(8,6,4,0.9)', 1.3);
    };
    mark(MAP_GLYPH.keep, MAP.workshops.x, MAP.workshops.z, 12, '#8fb8ff');
    // The gate: a bar across the road, red while it is shut, a gap while it stands open.
    {
      const [gx, gy] = this.toMap(GATE.x, GATE.z);
      const shut = s.gate.shut && s.gate.hp > 0;
      g.strokeStyle = shut ? '#ff6a5a' : s.gate.hp <= 0 ? '#ffb347' : 'rgba(150,230,140,0.9)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(gx, gy - WALL.gateHalf * SCALE * (shut ? 1 : 0.35));
      g.lineTo(gx, gy + WALL.gateHalf * SCALE * (shut ? 1 : 0.35));
      g.stroke();
    }
    const crypts = new Set<number>();
    for (const lane of this.game.sim.world.lanes) {
      if (lane.def.trail || crypts.has(lane.def.crypt)) continue;
      crypts.add(lane.def.crypt);
      const x = lane.xs[0],
        z = lane.zs[0];
      if (x !== undefined && z !== undefined && this.game.sim.isExplored(x, z))
        mark(MAP_GLYPH.crypt, x, z, 11, '#d9a0ff');
    }
    for (const m of s.mines)
      if (this.game.sim.isExplored(m.head.x, m.head.z))
        mark(MAP_GLYPH.mine, m.head.x, m.head.z, 10, '#e0c9a0');
    for (const id of s.discovered) {
      const p = MAP.stores[id as keyof typeof MAP.stores];
      if (p) mark(MAP_GLYPH.shop, p.x, p.z, 10, '#ffd36a');
    }
    for (const c of s.chests) {
      if (c.opened) continue;
      mark(MAP_GLYPH.chest, c.x, c.z, 8.5, c.golden ? '#ffcf4a' : '#fff1c1');
    }
    for (const c of s.camps) {
      if (c.alive <= 0 || !this.game.sim.isExplored(c.x, c.z)) continue;
      mark(MAP_GLYPH.camp, c.x, c.z, 9, '#e08a5a');
    }
    // Power lines along the live grid.
    const { links } = gridOf(s.buildings);
    if (links.length) {
      g.strokeStyle = 'rgba(255, 215, 106, 0.85)';
      g.lineWidth = 1;
      g.beginPath();
      for (const [a, b] of links) {
        const [ax, ay] = this.toMap(a.x, a.z);
        const [bx, by] = this.toMap(b.x, b.z);
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
      }
      g.stroke();
    }
    // Buildings & sites (towers a tower glyph; poles and lamps are small and yellow).
    for (const b of s.buildings) {
      const [px, py] = this.toMap(b.x, b.z);
      if (isTower(b.kind)) {
        drawGlyph(
          g,
          MAP_GLYPH.tower,
          px,
          py,
          8.5,
          b.hp < b.maxHp * 0.5 ? '#ff8a7a' : '#7fbaff',
          'rgba(8,6,4,0.9)',
          1.2,
        );
        continue;
      }
      const r = sizeOf(b.kind) < 3 ? 1.3 : 2;
      g.fillStyle =
        b.kind === 'pole' || b.kind === 'lamp' || b.kind === 'hydro'
          ? '#ffd76a'
          : b.stats
            ? '#6fb0ff'
            : '#9fd49a';
      g.fillRect(px - r, py - r, r * 2, r * 2);
      if (b.hp < b.maxHp * 0.5) {
        g.strokeStyle = '#ff6a5a';
        g.strokeRect(px - 3, py - 3, 6, 6);
      }
    }
    for (const site of s.sites) {
      const [px, py] = this.toMap(site.x, site.z);
      g.strokeStyle = '#8fe0ff';
      g.strokeRect(px - 2.2, py - 2.2, 4.4, 4.4);
    }
    // Enemies (burrowed only when a radar pulse marked them).
    for (const [id, t] of this.blips) {
      const nt = t - dt;
      if (nt <= 0) this.blips.delete(id);
      else this.blips.set(id, nt);
    }
    // What the drones in the air see (burrowers included).
    const drones = s.heroes.filter((h) => h.droneOn && !h.dead);
    const seen = (e: { x: number; z: number }) =>
      drones.some((h) => Math.hypot(e.x - (h.droneX ?? h.x), e.z - (h.droneZ ?? h.z)) <= DRONE.sight);
    for (const e of s.enemies) {
      // Every one of the dead shows — camps (darker), burrowers (brown, ringed when a drone or a
      // radar has them), bosses (bigger).
      if (e.hp <= 0 || !this.game.sim.getAs(e.id, 'enemy')) continue;
      const boss = ENEMIES[e.kind].boss;
      dot(
        e.x,
        e.z,
        boss ? 3.6 : e.burrowed ? 2 : 1.7,
        e.burrowed ? '#c08a4a' : e.camp ? '#c06a40' : '#ff4a3a',
      );
      if (e.burrowed && (this.blips.has(e.id) || (drones.length > 0 && seen(e)))) {
        const [px, py] = this.toMap(e.x, e.z);
        g.strokeStyle = '#ffd36a';
        g.beginPath();
        g.arc(px, py, 3.6, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Drones: a small cyan cross, and the circle they see.
    for (const h of drones) {
      const [px, py] = this.toMap(h.droneX ?? h.x, h.droneZ ?? h.z);
      g.strokeStyle = '#7fe8ff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px - 3, py - 3);
      g.lineTo(px + 3, py + 3);
      g.moveTo(px + 3, py - 3);
      g.lineTo(px - 3, py + 3);
      g.stroke();
      const [ex] = this.toMap((h.droneX ?? h.x) + DRONE.sight, h.droneZ ?? h.z);
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(px, py, Math.abs(ex - px), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = 1;
    }
    // Heroes.
    for (const h of s.heroes) {
      if (h.dead) continue;
      const [px, py] = this.toMap(h.x, h.z);
      g.save();
      g.translate(px, py);
      g.rotate(-h.facing + Math.PI);
      g.fillStyle = '#ffd36a';
      g.strokeStyle = '#000';
      g.beginPath();
      g.moveTo(0, -4.5);
      g.lineTo(3.4, 3.4);
      g.lineTo(-3.4, 3.4);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    // Pings.
    for (let i = this.pings.length - 1; i >= 0; i--) {
      // Reverse traversal removes only the current item from this dense array.
      const p = this.pings[i]!;
      p.t += dt;
      if (p.t > 1.4) {
        this.pings.splice(i, 1);
        continue;
      }
      const [px, py] = this.toMap(p.x, p.z);
      g.strokeStyle = p.color;
      g.globalAlpha = 1 - p.t / 1.4;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px, py, (p.r * SCALE * p.t) / 1.4 + 2, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    // Camera frustum.
    const cam = this.game.stage.camera;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const;
    const pts: [number, number][] = [];
    const rc = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
    for (const [cx, cy] of corners) {
      rc.setFromCamera(new THREE.Vector2(cx, cy), cam);
      const hit = new THREE.Vector3();
      if (rc.ray.intersectPlane(plane, hit)) pts.push(this.toMap(hit.x, hit.z));
    }
    if (pts.length === 4) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.stroke();
    }
  }
}
