import * as THREE from 'three';
import { getCanGeometry } from '../can/canGeometry';
import { FLAVORS } from '../data';
/** The film's label source: just the albedo per flavor. */
export type LabelTextures = { get(index: number): { albedo: THREE.Texture } };
import { SCENE_COLOR } from '../can/palette';

/**
 * Faint floor reflection: every visible can is mirrored through the floor plane by a second,
 * unlit mesh that shares the can's geometry and label texture and fades out with depth below the
 * floor. Cheap (no extra render pass) and it follows tilt and lean exactly, because the mirror
 * matrix is applied to the can's world matrix.
 */
export class FloorReflections {
  private readonly mirrors: THREE.Group[] = [];
  private readonly shellMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly metalMaterial: THREE.MeshBasicMaterial;
  private readonly mirror = new THREE.Matrix4();
  private readonly uniforms = { uFloorY: { value: -3.6 }, uOpacity: { value: 0.25 } };
  private enabled = true;

  constructor(scene: THREE.Scene, cans: THREE.Group[], labels: LabelTextures) {
    const geometry = getCanGeometry();
    const fade = (material: THREE.MeshBasicMaterial) => {
      material.transparent = true;
      material.depthWrite = false;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uFloorY = this.uniforms.uFloorY;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vReflectY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReflectY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vReflectY;\nuniform float uFloorY;')
          .replace(
            '#include <opaque_fragment>',
            `float below = uFloorY - vReflectY;
             diffuseColor.a *= smoothstep(-0.02, 0.12, below) * (1.0 - smoothstep(0.0, 3.4, below));
             #include <opaque_fragment>`
          );
      };
      material.customProgramCacheKey = () => 'floor-reflection';
    };

    this.metalMaterial = new THREE.MeshBasicMaterial({ color: SCENE_COLOR.reflectionMetal, opacity: 0.25 });
    fade(this.metalMaterial);

    cans.forEach((_, i) => {
      const maps = labels.get(i % FLAVORS.length);
      const shellMaterial = new THREE.MeshBasicMaterial({ map: maps.albedo, color: SCENE_COLOR.reflectionShell, opacity: 0.25 });
      fade(shellMaterial);
      this.shellMaterials.push(shellMaterial);
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geometry.shell, shellMaterial));
      group.add(new THREE.Mesh(geometry.top, this.metalMaterial));
      group.add(new THREE.Mesh(geometry.bottom, this.metalMaterial));
      group.matrixAutoUpdate = false;
      group.visible = false;
      group.renderOrder = -5;
      group.children.forEach((child) => (child.renderOrder = -5));
      scene.add(group);
      this.mirrors.push(group);
    });
  }

  setAlbedo(flavorIndex: number, texture: THREE.Texture) {
    this.shellMaterials.forEach((material, i) => {
      if (i % FLAVORS.length !== flavorIndex) return;
      material.map = texture;
      material.needsUpdate = true;
    });
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.hideAll();
  }

  hideAll() {
    this.mirrors.forEach((mirror) => (mirror.visible = false));
  }

  update(cans: THREE.Group[], floorY: number, reflect: number, reducedMotion: boolean) {
    if (!this.enabled || reflect < 0.02) {
      this.hideAll();
      return;
    }
    this.uniforms.uFloorY.value = floorY;
    this.mirror.set(1, 0, 0, 0, 0, -1, 0, 2 * floorY, 0, 0, 1, 0, 0, 0, 0, 1);
    cans.forEach((can, i) => {
      const mirror = this.mirrors[i];
      mirror.visible = can.visible;
      if (!can.visible) return;
      mirror.matrix.multiplyMatrices(this.mirror, can.matrixWorld);
      mirror.matrixWorldNeedsUpdate = true;
      const focus = (can.userData.focus as number | undefined) ?? 1;
      this.shellMaterials[i].opacity = reflect * (reducedMotion ? 0.2 : 0.3) * (0.25 + 0.75 * focus);
    });
    this.metalMaterial.opacity = reflect * 0.22;
  }

  dispose() {
    this.shellMaterials.forEach((material) => material.dispose());
    this.metalMaterial.dispose();
    this.mirrors.forEach((mirror) => mirror.removeFromParent());
  }
}
