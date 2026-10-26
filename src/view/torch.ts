/** A toy-like pitchwood torch: opaque facets, two flame shapes, one shadowless light. */
import * as THREE from 'three';

export class HandTorch {
  readonly root = new THREE.Group();
  readonly light = new THREE.PointLight('#ffc16b', 0, 7, 1.5);
  readonly tip = new THREE.Vector3();
  private flame = new THREE.Group();
  private time = 0;

  constructor(scene: THREE.Scene) {
    const wood = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 0.48, 5),
      new THREE.MeshLambertMaterial({ color: '#724426', flatShading: true }),
    );
    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.045, 0.11, 6),
      new THREE.MeshLambertMaterial({ color: '#c7a06a', flatShading: true }),
    );
    wrap.position.y = 0.22;
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.28, 5),
      new THREE.MeshBasicMaterial({ color: '#f47c28', toneMapped: false }),
    );
    const heart = new THREE.Mesh(
      new THREE.ConeGeometry(0.047, 0.18, 4),
      new THREE.MeshBasicMaterial({ color: '#ffe6a0', toneMapped: false }),
    );
    outer.position.y = 0.35;
    heart.position.set(0.012, 0.31, -0.06);
    this.flame.add(outer, heart);
    this.root.add(wood, wrap, this.flame);
    this.root.name = 'pitchwood-torch';
    this.root.scale.setScalar(0.55);
    this.root.visible = false;
    this.light.castShadow = false;
    scene.add(this.root, this.light);
  }

  update(dt: number, position: THREE.Vector3, facing: number, lit: boolean): void {
    this.root.visible = lit;
    this.light.intensity = lit ? 9 : 0;
    if (!lit) return;
    this.time += dt;
    // Held beside the shoulder, leaving the tool hand and the player's view clear.
    this.root.position.set(
      position.x + Math.cos(facing) * 0.16 + Math.sin(facing) * 0.09,
      position.y + 0.27,
      position.z - Math.sin(facing) * 0.16 + Math.cos(facing) * 0.09,
    );
    this.root.rotation.set(0, facing, -0.1);
    this.flame.scale.y = 1 + Math.sin(this.time * 5) * 0.05;
    this.tip.copy(this.root.position);
    this.tip.y += 0.19;
    this.light.position.copy(this.tip);
  }
}
