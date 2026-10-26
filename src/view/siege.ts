import { geometryAttribute } from './geometry-attributes.ts';
/** A painted low-poly ram: one merged mesh for frame, iron nose and four wheels. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
let geometry: THREE.BufferGeometry | undefined;
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export function siegeRam(): THREE.Mesh {
  if (!geometry) {
    const parts: THREE.BufferGeometry[] = [];
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, color: string) => {
      if (geo.index) geo = geo.toNonIndexed();
      geo.translate(x, y, z);
      const rgb = new THREE.Color(color),
        a = new Float32Array(geometryAttribute(geo, 'position').count * 3);
      for (let i = 0; i < a.length; i += 3) a.set([rgb.r, rgb.g, rgb.b], i);
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      geo.deleteAttribute('uv');
      parts.push(geo);
    };
    for (const x of [-0.22, 0.22]) {
      add(new THREE.BoxGeometry(0.055, 0.06, 0.9), x, 0.18, 0.67, '#795437');
      for (const z of [0.32, 1.02]) {
        add(
          new THREE.CylinderGeometry(0.13, 0.13, 0.055, 10).rotateZ(Math.PI / 2),
          x * 1.22,
          0.14,
          z,
          '#40464c',
        );
        add(
          new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8).rotateZ(Math.PI / 2),
          x * 1.22,
          0.14,
          z,
          '#ac8651',
        );
        add(new THREE.BoxGeometry(0.04, 0.38, 0.04), x, 0.36, z, '#9e7648');
      }
    }
    add(new THREE.CylinderGeometry(0.09, 0.1, 1.1, 8).rotateX(Math.PI / 2), 0, 0.4, 0.76, '#a57c49');
    add(new THREE.CylinderGeometry(0.115, 0.1, 0.16, 8).rotateX(Math.PI / 2), 0, 0.4, 1.3, '#727c86');
    for (const z of [0.35, 0.98]) add(new THREE.BoxGeometry(0.52, 0.05, 0.06), 0, 0.55, z, '#61442d');
    geometry = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'wheeled battering ram';
  return mesh;
}
