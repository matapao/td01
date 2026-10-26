import * as THREE from 'three';
import { patchMaterial } from './assets.ts';

export const lam = (color: string, emissive = '#000000', e = 0) =>
  patchMaterial(new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: e, flatShading: true }));

export const glowSprite = (tex: THREE.Texture, color: string, size: number, opacity = 1) => {
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
    }),
  );
  sp.scale.setScalar(size);
  return sp;
};

export const crystalMat = () => lam('#7fe0c0', '#2fb894', 1.1);

/** A deposit's look: nickel-iron boulders with silver veins, ice crystals on frost, or the rare-earth vein's glowing teal crystals. */
export function depositModel(kind: string, glow: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    s: number | THREE.Vector3,
    rot?: THREE.Euler,
  ) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (typeof s === 'number') mesh.scale.setScalar(s);
    else mesh.scale.copy(s);
    mesh.rotation.copy(rot ?? new THREE.Euler(x * 3, z * 5, y * 7));
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (kind === 'metalrock') {
    const rock = lam('#5d626e');
    const vein = lam('#c8d4e6', '#40506a', 0.45);
    add(new THREE.DodecahedronGeometry(0.62, 0), rock, 0, 0.35, 0, 1);
    add(new THREE.DodecahedronGeometry(0.42, 0), lam('#6b7180'), 0.55, 0.22, 0.2, 1);
    add(new THREE.DodecahedronGeometry(0.3, 0), lam('#4f535e'), -0.45, 0.15, 0.3, 1);
    for (const [x, y, z] of [
      [0.18, 0.72, 0.1],
      [-0.25, 0.55, -0.22],
      [0.62, 0.48, 0.05],
      [0.1, 0.4, 0.52],
    ] as const) {
      add(new THREE.OctahedronGeometry(0.16, 0), vein, x, y, z, new THREE.Vector3(1, 1.6, 0.8));
    }
  } else if (kind === 'icefield') {
    const frost = new THREE.Mesh(new THREE.CircleGeometry(1.3, 14).rotateX(-Math.PI / 2), lam('#d4e8f4'));
    frost.position.y = 0.04;
    g.add(frost);
    const ice = patchMaterial(
      new THREE.MeshLambertMaterial({
        color: '#e2f4ff',
        emissive: '#5fb0e0',
        emissiveIntensity: 0.3,
        flatShading: true,
        transparent: true,
        opacity: 0.92,
      }),
    );
    const ice2 = patchMaterial(
      new THREE.MeshLambertMaterial({
        color: '#a9dcf5',
        emissive: '#3f8fc0',
        emissiveIntensity: 0.3,
        flatShading: true,
      }),
    );
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7;
      add(
        new THREE.OctahedronGeometry(0.34, 0),
        i % 2 ? ice : ice2,
        Math.cos(a) * 0.45,
        0.3,
        Math.sin(a) * 0.45,
        new THREE.Vector3(1, 1.7 - i * 0.15, 1),
        new THREE.Euler(Math.cos(a) * 0.4, a, Math.sin(a) * 0.4),
      );
    }
  } else {
    add(
      new THREE.SphereGeometry(0.75, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      lam('#3e4250'),
      0,
      0,
      0,
      1,
      new THREE.Euler(),
    );
    const glint = crystalMat();
    for (let i = 0; i < 6; i++) {
      const a = i * 1.15;
      const tilt = new THREE.Euler(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      add(
        new THREE.OctahedronGeometry(0.15, 0),
        glint,
        Math.cos(a) * 0.35,
        0.42 + (i % 2) * 0.12,
        Math.sin(a) * 0.35,
        new THREE.Vector3(1, 2.4, 1),
        tilt,
      );
    }
    const sp = glowSprite(glow, '#5ff0d0', 2.2, 0.55);
    sp.position.y = 0.6;
    g.add(sp);
  }
  return g;
}
