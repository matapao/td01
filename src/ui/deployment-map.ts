/** Read-only map rendering; deployment validation and confirmation stay in the game/UI layers. */
import type { Game } from '../view/game.ts';
import { ARCHER } from '../game/content.ts';
import { MAP, WALL, groundHeight, cellCenter } from '../game/map.ts';
import { deploymentBlocker, shipmentPosition } from '../game/towerwork.ts';
export class DeploymentMap {
  private game: Game;

  private terrain: HTMLCanvasElement | null = null;
  constructor(game: Game) {
    this.game = game;
  }
  draw(c: HTMLCanvasElement, preview: { cx: number; cz: number } | null): void {
    const ctx = c.getContext('2d')!,
      g = this.game;
    const px = (x: number) => ((x - MAP.minX) / (MAP.maxX - MAP.minX)) * c.width,
      pz = (z: number) => ((z - MAP.minZ) / (MAP.maxZ - MAP.minZ)) * c.height;
    if (this.terrain) ctx.drawImage(this.terrain, 0, 0);
    else {
      ctx.fillStyle = '#27372d';
      ctx.fillRect(0, 0, c.width, c.height);
      for (let z = MAP.minZ; z < MAP.maxZ; z += 2)
        for (let x = MAP.minX; x < MAP.maxX; x += 2) {
          const y = groundHeight(g.sim.world, x, z);
          ctx.fillStyle = y > 5 ? '#59605c' : '#466345';
          ctx.fillRect(px(x), pz(z), 12, 10);
        }
      ctx.strokeStyle = '#b08a56';
      ctx.lineWidth = 5;
      for (const lane of g.sim.world.lanes) {
        ctx.beginPath();
        // Lane x/z buffers are allocated together; i is bounded by their sample count.
        for (let i = 0; i < lane.xs.length; i++)
          i ? ctx.lineTo(px(lane.xs[i]!), pz(lane.zs[i]!)) : ctx.moveTo(px(lane.xs[i]!), pz(lane.zs[i]!));
        ctx.stroke();
      }
      ctx.strokeStyle = '#ccd0bd';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px(WALL.x), pz(-WALL.reach));
      ctx.lineTo(px(WALL.x), pz(WALL.reach));
      ctx.stroke();
      this.terrain = document.createElement('canvas');
      this.terrain.width = c.width;
      this.terrain.height = c.height;
      this.terrain.getContext('2d')!.drawImage(c, 0, 0);
    }
    const dot = (x: number, z: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px(x), pz(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const b of g.sim.state.buildings) dot(b.x, b.z, b.kind === 'tower' ? '#7db4ef' : '#d4c3a1', 5);
    for (const crate of g.sim.state.towerCrates ?? [])
      if (crate.shipment) {
        const p = shipmentPosition(crate);
        dot(p.x, p.z, '#efb65b', 5);
      }
    if (preview) {
      const p = cellCenter(preview.cx, preview.cz);
      ctx.strokeStyle = '#a7d1c5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        px(p.x),
        pz(p.z),
        (ARCHER.range / (MAP.maxX - MAP.minX)) * c.width,
        (ARCHER.range / (MAP.maxZ - MAP.minZ)) * c.height,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.strokeStyle = deploymentBlocker(g.sim, preview.cx, preview.cz) ? '#ef7b66' : '#c0ed9c';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        px(p.x - 1.5),
        pz(p.z - 1.5),
        (3 / (MAP.maxX - MAP.minX)) * c.width,
        (3 / (MAP.maxZ - MAP.minZ)) * c.height,
      );
    }
    ctx.fillStyle = '#f0dfae';
    ctx.font = '16px Georgia';
    ctx.fillText('Village', px(MAP.heroStart.x) - 20, pz(-5));
    ctx.fillText('Wave approaches →', c.width - 220, 30);
  }
}
