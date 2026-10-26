/**
 * Tower devices in the upper windows (see content DEVICE): small machines that stand out of their
 * window — a brass searchlight that throws a beam by night, a radar dish that turns, a targeting box
 * with its lens and a blinking lamp, a relay coil whose lamp flickers with traffic, a solar panel
 * over the window like an awning. Without power they sit dark and still.
 * Frame: origin at the opening's centre on the wall face, +z out of the wall, +y up (world units).
 */
import * as THREE from 'three';
import type { DeviceId } from '../game/content.ts';
import { patchMaterial } from './assets.ts';

const lam = (color: string, emissive = '#000000', e = 0) =>
  patchMaterial(new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: e, flatShading: true }));

const M = {
  brass: lam('#c9993a', '#3a2600', 0.25),
  darkBrass: lam('#7a5a24'),
  iron: lam('#4a4a52'),
  dark: lam('#2a2a30'),
  wood: lam('#6b4a2b'),
  white: lam('#d9d4c8'),
  copper: lam('#c46a3a', '#3a1400', 0.2),
  panel: lam('#1d2f5a', '#0a1430', 0.3),
  frame: lam('#9aa0a8'),
};

export interface DeviceView {
  obj: THREE.Group;
  /** Every frame: `on` with power, `night` 0…1, `aim` the yaw (in the window's frame) the tower aims at. */
  update: (t: number, on: boolean, night: number, aim: number) => void;
}

const lit = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });

/** A device's model, sized for a tower window (about 0.25 m across). */
export function deviceModel(id: DeviceId, glowTex: THREE.Texture): DeviceView {
  const g = new THREE.Group();
  g.name = `device:${id}`;
  switch (id) {
    case 'searchlight': {
      // A brass drum on a yoke, its glass front to the road; by night a long soft beam.
      const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 4, 12, Math.PI), M.darkBrass);
      yoke.rotation.z = Math.PI;
      yoke.position.set(0, 0.0, 0.12);
      const head = new THREE.Group();
      head.position.set(0, 0, 0.12);
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.085, 0.16, 12).rotateX(Math.PI / 2),
        M.brass,
      );
      const glassMat = new THREE.MeshLambertMaterial({
        color: '#fff4c8',
        emissive: '#ffe08a',
        emissiveIntensity: 0,
      });
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), glassMat);
      glass.position.z = 0.081;
      const beamMat = new THREE.MeshBasicMaterial({
        color: '#fff1c0',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 7, 16, 1, true).translate(0, -3.5, 0).rotateX(-Math.PI / 2),
        beamMat,
      );
      beam.position.z = 0.09;
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: '#ffe8a8',
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0,
        }),
      );
      halo.position.z = 0.12;
      halo.scale.setScalar(0.5);
      head.add(drum, glass, beam, halo);
      g.add(yoke, head);
      return {
        obj: g,
        update: (t, on, night, aim) => {
          // It swings to where the archer aims (within what the window allows).
          head.rotation.y = THREE.MathUtils.clamp(Math.atan2(Math.sin(aim), Math.cos(aim)), -0.9, 0.9);
          head.rotation.x = 0.18;
          const k = on ? night : 0;
          glassMat.emissiveIntensity = 0.2 + k * 2.2;
          beamMat.opacity = k * (0.16 + Math.sin(t * 2.3) * 0.01);
          (halo.material as THREE.SpriteMaterial).opacity = k * 0.8;
        },
      };
    }
    case 'radar': {
      // A dish on a short arm out of the window, turning steadily.
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), M.iron);
      arm.position.set(0, -0.02, 0.08);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 6), M.iron);
      mast.position.set(0, 0.06, 0.16);
      const spin = new THREE.Group();
      spin.position.set(0, 0.15, 0.16);
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3.2).rotateX(-Math.PI / 2),
        M.white,
      );
      dish.material.side = THREE.DoubleSide;
      dish.position.z = -0.05;
      const feed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.09, 4).rotateX(Math.PI / 2),
        M.dark,
      );
      feed.position.z = 0.0;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), lit('#ff5a4a'));
      tip.position.z = 0.045;
      spin.add(dish, feed, tip);
      g.add(arm, mast, spin);
      return {
        obj: g,
        update: (t, on) => {
          if (on) spin.rotation.y = t * 1.6;
          (tip.material as THREE.MeshBasicMaterial).opacity = on && Math.sin(t * 6) > 0 ? 1 : 0.15;
        },
      };
    }
    case 'targeter': {
      // A riveted box with a round lens and a lamp that blinks as it works out the shot.
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.12), M.iron);
      box.position.set(0, -0.05, 0.07);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 0.04, 12).rotateX(Math.PI / 2),
        M.brass,
      );
      lens.position.set(-0.03, -0.04, 0.14);
      const eyeMat = new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.3 });
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), eyeMat);
      eye.position.set(-0.03, -0.04, 0.161);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), lit('#ff4a3a'));
      led.position.set(0.05, -0.01, 0.13);
      g.add(box, lens, eye, led);
      return {
        obj: g,
        update: (t, on) => {
          eyeMat.opacity = on ? 0.6 + Math.sin(t * 3) * 0.25 : 0.15;
          (led.material as THREE.MeshBasicMaterial).opacity = on && (t * 2.5) % 1 < 0.3 ? 1 : 0.15;
        },
      };
    }
    case 'relay': {
      // A copper coil on a little board, an insulator and a lamp that flickers with traffic.
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), M.wood);
      board.position.set(0, -0.1, 0.07);
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), M.copper);
      coil.position.set(-0.04, -0.05, 0.07);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.02), M.iron);
      arm.position.set(0.02, -0.01, 0.07);
      const lampMat = lit('#ffd36a');
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), lampMat);
      lamp.position.set(0.05, -0.05, 0.11);
      const ins = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.02, 0.05, 6),
        lam('#7fd4b8', '#2a6b58', 0.25),
      );
      ins.position.set(0.05, 0.03, 0.03);
      g.add(board, coil, arm, lamp, ins);
      return {
        obj: g,
        update: (t, on) => {
          const click = on && Math.sin(t * 9) * Math.sin(t * 3.7) > 0.3;
          arm.rotation.z = click ? -0.25 : 0;
          lampMat.opacity = click ? 1 : on ? 0.4 : 0.1;
        },
      };
    }
    case 'solar': {
      // A panel of cells over the window like an awning, tilted to the sky.
      const tilt = new THREE.Group();
      tilt.position.set(0, 0.26, 0.04);
      tilt.rotation.x = 0.75;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.24), M.frame);
      const cells = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.014, 0.22), M.panel.clone());
      cells.position.y = 0.003;
      tilt.add(frame, cells);
      for (const x of [-0.08, 0, 0.08]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.22), M.frame);
        line.position.set(x, 0.004, 0);
        tilt.add(line);
      }
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.18), M.iron);
      strut.position.set(0, 0.17, 0.11);
      strut.rotation.x = -0.6;
      g.add(tilt, strut);
      return {
        obj: g,
        update: (_t, on) => {
          (cells.material as THREE.MeshLambertMaterial).emissiveIntensity = on ? 0.45 : 0.15;
        },
      };
    }
  }
}
