/**
 * Third-person camera attached to the hero (WoW category): orbit + zoom around the hero's head,
 * terrain collision, smooth follow, screen shake. It never detaches from the hero.
 */
import * as THREE from 'three';
import { clamp, damp } from '../core/math.ts';

/** Horizontal field of view in degrees (MMO default). */
export const HFOV = 90;

export function verticalFov(aspect: number, hfov = HFOV): number {
  return (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

export class HeroCamera {
  private cam: THREE.PerspectiveCamera;

  /** Point the camera looks at (the hero's head). */
  readonly target = new THREE.Vector3();
  yaw = Math.PI;
  /** Elevation of the camera above the hero, radians. */
  pitch = 0.4;
  /** Distance from the hero's head (a person is half a unit tall; the world is mighty). */
  dist = 4.2;
  private goalDist = 4.2;
  readonly minDist = 0.7;
  readonly maxDist = 26;
  /** Height of the hero's head above their feet. */
  readonly headY = 0.46;
  private shakeAmp = 0;
  private shakeT = 0;
  private started = false;
  groundAt: (x: number, z: number) => number = () => 0;
  /** Solid rock at a point (the mine's walls and roof): the camera never ends up inside it. */
  solidAt: (x: number, y: number, z: number) => boolean = () => false;
  /** The roof over a point (down the mine; Infinity in the open): the camera stays under it. */
  ceilingAt: (x: number, z: number) => number = () => Infinity;
  /** Solid boxes (buildings, walls): the camera pulls in in front of them, like an MMO. */
  blockers: () => Iterable<THREE.Box3> = () => [];
  private ray = new THREE.Ray();
  private hit = new THREE.Vector3();
  private limit = Infinity;
  /** World position of the hero (feet). */
  follow: () => { x: number; y: number; z: number } = () => ({ x: 0, y: 0, z: 0 });
  /** Inside a building: looking down into the room like a diorama (its near walls cut away, nothing to bump into). */
  indoors = false;
  /** A tilt the camera is easing to (dropped as soon as the player tilts it). */
  private pitchGoal: number | null = null;
  /** How far above the hero's head the camera's pivot rises (up on the wall-walk: over the battlements), eased. */
  liftGoal = 0;
  private lift = 0;

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.0045;
    this.pitch = clamp(this.pitch + dy * 0.0035, this.indoors ? 0.3 : -0.22, 1.35);
    if (dy) this.pitchGoal = null;
  }

  /** Eases to a tilt and distance (going in or out of a building). */
  easeTo(pitch: number, dist: number): void {
    this.pitchGoal = pitch;
    this.zoomTo(dist);
  }

  /** The distance the camera is heading for (the player's zoom). */
  get goal(): number {
    return this.goalDist;
  }

  turn(rad: number): void {
    this.yaw += rad;
  }

  zoom(delta: number): void {
    this.goalDist = clamp(this.goalDist * Math.exp(delta * 0.0013), this.minDist, this.maxDist);
  }

  zoomTo(d: number, instant = false): void {
    this.goalDist = clamp(d, this.minDist, this.maxDist);
    if (instant) this.dist = this.goalDist;
  }

  /** Swings the camera back behind the hero. */
  snapBehind(facing: number): void {
    this.yaw = facing + Math.PI;
  }

  shake(amount: number): void {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount);
  }

  /** Unit vector the camera looks along, flattened onto the ground. */
  get forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  /** Facing angle (atan2(x, z)) that points where the camera looks. */
  get look(): number {
    return Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  /** How much ground the shadows must cover. */
  get viewSpan(): number {
    return 22 + this.dist * 1.2;
  }

  /** Centre for the shadow frustum: ahead of the camera, where the action is. */
  shadowCentre(out: THREE.Vector3): THREE.Vector3 {
    const f = this.forward;
    const ahead = 7 + this.dist * 0.5;
    return out.set(this.target.x + f.x * ahead, 0, this.target.z + f.z * ahead);
  }

  /** Debug/screenshot framing: a fixed lens position and aim (null: follow the hero). */
  photo: { from: THREE.Vector3; to: THREE.Vector3 } | null = null;

  update(dt: number): void {
    if (this.photo) {
      this.target.copy(this.photo.to);
      this.cam.position.copy(this.photo.from);
      this.cam.lookAt(this.photo.to);
      return;
    }
    const h = this.follow();
    const tx = h.x;
    const tz = h.z;
    this.lift = damp(this.lift, this.liftGoal, 5, dt);
    const ty = h.y + this.headY + this.lift;
    if (!this.started) {
      this.target.set(tx, ty, tz);
      this.started = true;
    }
    // Rigidly attached (no floaty lag); only bumps in the ground are smoothed.
    this.target.x = tx;
    this.target.z = tz;
    this.target.y = damp(this.target.y, ty, 18, dt);
    this.dist = damp(this.dist, this.goalDist, 14, dt);
    if (this.pitchGoal !== null) {
      this.pitch = damp(this.pitch, this.pitchGoal, 7, dt);
      if (Math.abs(this.pitch - this.pitchGoal) < 0.002) this.pitchGoal = null;
    }
    // Under rock the camera drops down behind the hero instead of rising into the roof (the way a
    // cave does it in an online RPG); what's left of the roof's reach pulls it in (see below).
    let pitch = this.pitch;
    const roof = this.ceilingAt(tx, tz);
    if (roof < Infinity) {
      const room = roof - 0.22 - this.target.y;
      pitch = Math.min(pitch, Math.max(0.05, Math.asin(clamp(room / Math.max(0.6, this.dist), -1, 1))));
    }
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    // Terrain collision: pull the camera in if a hill is in the way.
    let d = this.dist;
    for (let s = 0.25; s <= this.dist; s += 0.2) {
      const p = this.target.clone().addScaledVector(dir, s);
      if (p.y < this.groundAt(p.x, p.z) + 0.18 || this.solidAt(p.x, p.y, p.z)) {
        d = Math.max(this.minDist * 0.6, s - 0.2);
        break;
      }
    }
    // Buildings and walls: snap in when something blocks the view, ease back out after.
    this.ray.set(this.target, dir);
    let block = d;
    for (const b of this.indoors ? [] : this.blockers()) {
      if (b.containsPoint(this.target)) continue;
      if (this.ray.intersectBox(b, this.hit)) block = Math.min(block, this.hit.distanceTo(this.target) - 0.2);
    }
    block = Math.max(this.minDist * 0.5, block);
    this.limit = block < this.limit ? block : Math.min(block, this.limit + dt * 6);
    d = Math.min(d, this.limit);
    this.cam.position.copy(this.target).addScaledVector(dir, d);
    const floor = this.groundAt(this.cam.position.x, this.cam.position.z) + 0.14;
    if (this.cam.position.y < floor) this.cam.position.y = floor;
    this.cam.lookAt(this.target);
    if (this.shakeAmp > 0.001) {
      this.shakeT += dt * 38;
      const a = this.shakeAmp * this.shakeAmp * 0.35;
      this.cam.position.x += Math.sin(this.shakeT * 1.3) * a;
      this.cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * a * 0.6;
      this.cam.position.z += Math.cos(this.shakeT * 1.1) * a;
      this.shakeAmp = damp(this.shakeAmp, 0, 7, dt);
    }
  }
}
