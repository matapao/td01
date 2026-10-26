/** Frame-rate WASD/drone steering and mouse gestures. Pose authority stays behind the command port. */
import { DRONE } from '../../game/content.ts';
import { heroSpeed, slide } from '../../game/systems/heroes.ts';
import { inRange } from '../../game/systems/drone.ts';
import type { InputContext, InputModes } from './context.ts';

const DRAG_PX = 7;
interface Press {
  x: number;
  y: number;
  t: number;
  moved: number;
}
export interface GestureActions {
  leftClick(px: number, py: number, shift: boolean): void;
  rightClick(px: number, py: number): void;
  key(e: KeyboardEvent, down: boolean): void;
}
export class MovementControls {
  private host: InputContext;
  private modes: InputModes;
  private dom: HTMLElement;
  private actions: GestureActions;

  private keys = new Set<string>();
  private press: Partial<Record<0 | 2, Press>> = {};
  private buttons = 0;
  private locked = false;
  private moving = false;
  private poseFacing = 0;
  private poseT = 0;
  private time = 0;
  private edgeHintAt = -99;
  rightHoldWalks = /Mac|iPhone|iPad/.test(navigator.platform);
  get looking(): boolean {
    return this.buttons !== 0;
  }
  get pointerLocked(): boolean {
    return this.locked;
  }
  get wide(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }
  clearMovement(): void {
    this.keys.clear();
    this.buttons = 0;
    this.moving = false;
  }
  constructor(host: InputContext, modes: InputModes, dom: HTMLElement, actions: GestureActions) {
    this.host = host;
    this.modes = modes;
    this.dom = dom;
    this.actions = actions;

    // Mouse (not pointer) events: with pointer events, pressing a second button while the first is
    // held arrives as a pointermove, and both-buttons-walk needs to see each press.
    this.dom.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', (e) => this.up(e));
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.dom.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.actions.key(e, true));
    window.addEventListener('keyup', (e) => this.actions.key(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
      this.press = {};
    });
    document.addEventListener(
      'pointerlockchange',
      () => (this.locked = document.pointerLockElement === this.dom),
    );
  }
  private down(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    this.buttons |= e.button === 0 ? 1 : 2;
    this.press[e.button] = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    this.host.ui.mouse.x = e.clientX;
    this.host.ui.mouse.y = e.clientY;
  }
  private move(e: MouseEvent): void {
    if (!this.locked) {
      this.host.ui.mouse.x = e.clientX;
      this.host.ui.mouse.y = e.clientY;
    }
    // A release we never saw (e.g. outside the window) shows up as a missing bit in e.buttons.
    for (const [bit, b] of [
      [1, 0],
      [2, 2],
    ] as const) {
      if (this.buttons & bit && !(e.buttons & bit)) {
        this.buttons &= ~bit;
        delete this.press[b];
      }
    }
    if (!this.buttons) {
      if (document.pointerLockElement === this.dom) document.exitPointerLock();
      return;
    }
    const dx = e.movementX;
    const dy = e.movementY;
    for (const b of [0, 2] as const) {
      const p = this.press[b];
      if (p) p.moved += Math.abs(dx) + Math.abs(dy);
    }
    const dragging = Object.values(this.press).some((p) => p && p.moved > DRAG_PX);
    if (!dragging) return;
    if (!this.locked && document.pointerLockElement !== this.dom) {
      // Hide the cursor while turning (like an MMO) — plain deltas still work if refused.
      try {
        const r = this.dom.requestPointerLock() as unknown as Promise<void> | undefined;
        r?.catch?.(() => {});
      } catch {
        /* pointer lock unavailable */
      }
    }
    this.host.game.cam.orbit(dx, dy);
  }
  private up(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    const p = this.press[e.button];
    delete this.press[e.button];
    this.buttons &= ~(e.button === 0 ? 1 : 2);
    if (!this.buttons && document.pointerLockElement === this.dom) document.exitPointerLock();
    if (!p || p.moved > DRAG_PX || performance.now() - p.t > 450) return;
    if ((e.target as HTMLElement | null) !== this.dom && !this.locked) return;
    if (e.button === 0) this.actions.leftClick(p.x, p.y, e.shiftKey);
    else this.actions.rightClick(p.x, p.y);
  }
  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey) this.host.game.cam.zoom(e.deltaY * 4);
    else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.host.game.cam.turn(-e.deltaX * 0.004);
    else this.host.game.cam.zoom(e.deltaY);
  }
  update(dt: number): void {
    this.time += dt;
    dt = Math.min(dt, 0.1);
    const k = this.keys;
    const cam = this.host.game.cam;
    const turn =
      (k.has('KeyQ') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyE') || k.has('ArrowRight') ? 1 : 0);
    if (turn) cam.turn(turn * 3.2 * dt);
    const right = this.press[2];
    const holdWalk = this.rightHoldWalks && !!right && performance.now() - right.t > 200;
    const both = (this.buttons & 3) === 3;
    let fwd =
      (k.has('KeyW') || k.has('ArrowUp') || both || holdWalk ? 1 : 0) -
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const h = this.host.hero;
    if (!h || h.dead || h.transit || this.modes.activityOpen || this.host.ui.window?.kind === 'menu')
      fwd = side = 0;
    if (!h || h.transit || this.modes.activityOpen) return;
    const look = cam.look;
    const f = cam.forward;
    let mx = f.x * fwd - f.z * side;
    let mz = f.z * fwd + f.x * side;
    const l = Math.hypot(mx, mz);
    this.poseT -= dt;
    // Flying the drone: WASD steers it (the hero stands with the controls), never out of range.
    if (h.droneOn) {
      if (l > 0.01 && !h.droneBack) {
        const p = inRange(
          h,
          (h.droneX ?? h.x) + (mx / l) * DRONE.speed * dt,
          (h.droneZ ?? h.z) + (mz / l) * DRONE.speed * dt,
        );
        if (p.edge && this.time - this.edgeHintAt > 2.5) {
          this.edgeHintAt = this.time;
          this.host.ui.hint(`The drone won't go further than ${DRONE.range} m from you`);
        }
        this.host.cmd({ t: 'droneMove', hero: h.id, x: p.x, z: p.z });
      }
      this.moving = false;
      return;
    }
    // In a mine wagon: it rolls you to the next stop (the camera still turns).
    if (h.ride) {
      this.moving = false;
      return;
    }
    if (l > 0.01) {
      mx /= l;
      mz /= l;
      const speed = heroSpeed(this.host.game.sim, h) * (fwd < 0 ? 0.62 : 1);
      const p = slide(this.host.game.sim, h.x, h.z, mx * speed * dt, mz * speed * dt);
      const gait = fwd > 0 ? 'fwd' : fwd < 0 ? 'back' : side > 0 ? 'right' : 'left';
      this.host.cmd({ t: 'pose', hero: h.id, x: p.x, z: p.z, facing: look, look, gait, moving: true });
      this.moving = true;
      this.poseFacing = look;
      return;
    }
    const turning = !!right && right.moved > DRAG_PX && !h.dead;
    const facing = turning ? look : h.facing;
    // Stopped, or turning on the spot with the right button: one pose now and then.
    if (this.moving || (turning && Math.abs(facing - this.poseFacing) > 0.02 && this.poseT <= 0)) {
      this.host.cmd({ t: 'pose', hero: h.id, x: h.x, z: h.z, facing, look, gait: 'idle', moving: false });
      this.moving = false;
      this.poseFacing = facing;
      this.poseT = 1 / 20;
    }
  }
}
