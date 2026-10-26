import * as THREE from 'three';
import { pathAt, type MineLayout } from '../../game/mines.ts';
import { patchMaterial } from '../assets.ts';
import { geometryAttribute } from '../geometry-attributes.ts';
import { mat4 } from './transforms.ts';
/** One painted atlas for platform/chamber signs, with merged boards and posts. */
export function buildSigns(group: THREE.Group, L: MineLayout): void {
  const signs: { text: string; sub: string; x: number; y: number; z: number; yaw: number; w: number }[] = [];
  for (const line of L.lines) {
    const p = pathAt(line, 3.3);
    // At the platform's far end, left of the track where the drift leaves, facing the lift (off to
    // the side, so it never stands between the lens and someone at the lift).
    signs.push({
      text: line.name.toUpperCase(),
      sub: line.mineral,
      x: p.x + p.tz * 1.05,
      y: 1.3,
      z: p.z - p.tx * 1.05,
      yaw: Math.atan2(-p.tx, -p.tz),
      w: 1.1,
    });
    const [gi, gii] = line.chambers;
    for (const ci of [gi, gii]) {
      const c = L.chambers[ci];
      if (!c) throw new Error(`Missing mine chamber ${ci}`);
      const d = ci === gi ? line.stopI : line.stopII;
      const q = pathAt(line, d);
      const side = -1;
      signs.push({
        text: c.name.replace(/^the /, '').toUpperCase(),
        sub: `Grade ${c.grade === 1 ? 'I' : 'II'} · ${line.mineral}`,
        x: q.x - q.tz * side * 1.45,
        y: 1.25,
        z: q.z + q.tx * side * 1.45,
        yaw: Math.atan2(q.tz * side, -q.tx * side),
        w: 1.0,
      });
    }
  }
  // One atlas for them all.
  const rowH = 64;
  const W = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.max(64, signs.length * rowH);
  const g = c.getContext('2d')!;
  signs.forEach((s, i) => {
    const y = i * rowH;
    g.fillStyle = '#5a3d22';
    g.fillRect(0, y, W, rowH);
    g.fillStyle = '#6e4b2a';
    for (let k = 0; k < 4; k++) g.fillRect(0, y + 4 + k * 15, W, 6);
    g.strokeStyle = '#2a1a0c';
    g.lineWidth = 6;
    g.strokeRect(3, y + 3, W - 6, rowH - 6);
    g.fillStyle = '#f2e2b8';
    g.font = 'bold 30px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.text, W / 2, y + rowH * 0.4);
    g.fillStyle = '#e0b870';
    g.font = 'italic 17px Georgia, serif';
    g.fillText(s.sub, W / 2, y + rowH * 0.8);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // (Cut away where they stand between the lens and you, like the timbers and everything else.)
  const mat = patchMaterial(
    new THREE.MeshLambertMaterial({ map: tex, emissive: '#3a2a18', emissiveIntensity: 0.6 }),
    { fog: false, rim: false },
  );
  const postMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#4a3220', flatShading: true }), {
    fog: false,
    rim: false,
  });
  const boards: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  signs.forEach((s, i) => {
    // Painted on both faces, so it reads the right way round from either side.
    for (const back of [0, Math.PI]) {
      const board = new THREE.PlaneGeometry(s.w, s.w * (rowH / W) * 3.2);
      const uv = geometryAttribute(board, 'uv');
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / signs.length);
      const off = back ? -0.012 : 0.012;
      board.applyMatrix4(
        mat4(s.x + Math.sin(s.yaw) * off, s.y, s.z + Math.cos(s.yaw) * off, s.yaw + back, 1),
      );
      boards.push(board);
    }
    // Its posts.
    for (const side of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.05, s.y + 0.15, 0.05);
      post.translate(
        s.x + Math.cos(s.yaw) * side * s.w * 0.45,
        (s.y + 0.15) / 2,
        s.z - Math.sin(s.yaw) * side * s.w * 0.45,
      );
      posts.push(post);
    }
  });
  const merged = mergeAll(boards);
  if (merged) group.add(new THREE.Mesh(merged, mat));
  const poles = mergeAll(posts);
  if (poles) group.add(new THREE.Mesh(poles, postMat));
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  let n = 0;
  for (const g of geos) n += g.index ? g.index.count : geometryAttribute(g, 'position').count;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = geometryAttribute(g, 'position');
    const u = geometryAttribute(g, 'uv');
    const nn = geometryAttribute(g, 'normal');
    for (let i = 0; i < p.count; i++, o++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
      uv.set([u.getX(i), u.getY(i)], o * 2);
      nor.set([nn.getX(i), nn.getY(i), nn.getZ(i)], o * 3);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
