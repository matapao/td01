/**
 * The tower's geometry for the views. Every tower is KayKit's hexagonal stone tower with an archer
 * on its platform; its lower windows hold its gems (one window per colour), its upper ones are for
 * devices. Distances are in world units, in the tower's own frame (+z is its front).
 */
import * as THREE from 'three';
import { PLANS, TOWER_WINDOWS, type GemId, type GemPlan } from '../game/content.ts';

/** The base model's scale, and where its parts are (measured off the model). */
export const TOWER = {
  scale: 3.1,
  /** Outer wall, from the axis, at window height. */
  wall: TOWER_WINDOWS.r,
  /** The platform floor. */
  floor: 1.4 * 3.1,
};

type Window = { yaw: number; y: number };

/** The window gem `id` sits in: its colour's. */
export const gemWindow = (id: GemId): Window => TOWER_WINDOWS.gem[(PLANS[id] as GemPlan).color];

/** A frame on a window (in the tower's frame): origin at the window's centre on the wall, +z out of it. */
export function windowFrame(w: Window): THREE.Group {
  const g = new THREE.Group();
  g.position.set(Math.sin(w.yaw) * TOWER.wall, w.y, Math.cos(w.yaw) * TOWER.wall);
  g.rotation.y = w.yaw;
  return g;
}

/** Just outside a window (the tower's frame): where a gem being set hovers. */
export function socketMarker(w: Window): THREE.Vector3 {
  const f = windowFrame(w);
  return new THREE.Vector3(0, 0, 0.7).applyEuler(f.rotation).add(f.position);
}
