import * as THREE from 'three';
const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
export const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export const mat4 = (
  x: number,
  y: number,
  z: number,
  yaw: number,
  sx: number,
  sy = sx,
  sz = sx,
): THREE.Matrix4 =>
  new THREE.Matrix4().compose(tmpV.set(x, y, z), tmpQ.setFromAxisAngle(Y, yaw), tmpS.set(sx, sy, sz));
