import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { FLAVORS } from '../../data/flavors';

/**
 * The flavor intro's letter grid, as in the reference ("D   O   U   B   L   E" across the frame at a quarter of its
 * height, "L   I   T   C   H   I" at three quarters): the flavor name in small spaced capitals behind the can, so
 * the can stands in front of them. (The DOM version in StageBackdrop sits behind the opaque canvas and never showed.)
 *
 * Trigger: the flavor intro section (scroll position ≈ 1) and the focused flavor. Scroll-driven fade in and out.
 * WebGL: one textured plane filling the frame behind the can, redrawn only when the flavor or the frame's shape
 * changes (one reused canvas). DOM: the real flavor name is the section heading. Optional; fallback: none needed.
 */
const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    gl_FragColor = vec4(tex.rgb, tex.a * uOpacity);
    #include <colorspace_fragment>
  }
`;

const DEPTH = -6; // world units behind the can

export class FlavorLetters implements SceneMoment {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture | null = null;
  private drawnKey = '';
  private fontReady = false;
  private disposed = false;

  constructor(host: SceneManager) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uOpacity: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = -400;
    host.scene.add(this.mesh);
    void document.fonts
      .load("400 32px 'Geist Mono'")
      .catch(() => undefined)
      .then(() => {
        this.fontReady = true;
      });
  }

  private draw(index: number, aspect: number) {
    const flavor = FLAVORS[index % FLAVORS.length];
    const rows = [flavor.line1, flavor.line2].filter(Boolean).map((line) => line.replace(/\s+/g, '').split(''));
    const width = 2048;
    const height = Math.round(width / aspect);
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `400 ${Math.round(height * 0.024)}px 'Geist Mono', ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // spread each row between the frame insets, space-between, like the reference
    const left = width * 0.07;
    const right = width * 0.93;
    rows.forEach((letters, row) => {
      const y = height * (rows.length === 1 ? 0.25 : row === 0 ? 0.25 : 0.75);
      letters.forEach((letter, i) => {
        const x = letters.length === 1 ? width / 2 : left + ((right - left) * i) / (letters.length - 1);
        ctx.fillText(letter, x, y);
      });
    });
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.material.uniforms.map.value = this.texture;
    } else {
      this.texture.needsUpdate = true;
    }
  }

  update(_seconds: number, scene: SceneManager) {
    if (!this.fontReady || this.disposed) return;
    // visible around the flavor intro (section 1), gone by the hero and the first benefit
    // wide frames only: on narrower ones the copy sits low and the second row ran through the description
    const wide = scene.camera.aspect >= 1.4 ? 1 : 0;
    const weight = wide * Math.max(0, 1 - Math.abs(scene.sectionPosition - 1) * 2.2);
    this.mesh.visible = weight > 0.01;
    if (!this.mesh.visible) return;
    const aspect = scene.camera.aspect;
    const index = scene.carousel.getIndex() % FLAVORS.length;
    const key = `${index}:${aspect.toFixed(2)}`;
    if (key !== this.drawnKey) {
      this.drawnKey = key;
      this.draw(index, aspect);
    }
    const distance = scene.camera.position.z - DEPTH;
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2)) * distance;
    this.mesh.scale.set(viewHeight * aspect, viewHeight, 1);
    this.mesh.position.set(scene.camera.position.x, scene.camera.position.y, DEPTH);
    this.mesh.quaternion.copy(scene.camera.quaternion);
    this.material.uniforms.uOpacity.value = weight * 0.85;
  }

  dispose() {
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}
