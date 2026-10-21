import * as THREE from 'three';
import type { SceneManager } from '../sceneManager';
import type { SceneMoment } from './types';
import { BRAND } from '../../data/brand';

/**
 * The tagline as giant type behind the can ("Fuel your wild side"). It is drawn into a texture and
 * placed on a plane behind the cans, so the can really stands in front of the letters.
 *
 * Scroll-driven: the mask reveals as the argument section arrives (left to right, feathered) and
 * the letters drift slowly sideways while it passes. State: none. WebGL: one textured plane.
 * The real text stays in the DOM (an accessible heading in ArgumentSection); this is only the
 * visual. Fallback: StageBackdrop's CSS version when WebGL is unavailable.
 */
const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uReveal;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 tex = texture2D(map, vUv);
    float edge = uReveal * 1.3 - 0.3;
    float mask = smoothstep(edge, edge + 0.3, 1.0 - vUv.x) ;
    // reveal from the left: pixels left of the moving edge are visible
    float shown = 1.0 - smoothstep(edge - 0.001, edge + 0.3, vUv.x);
    gl_FragColor = vec4(tex.rgb, tex.a * shown * uOpacity);
    #include <colorspace_fragment>
  }
`;

export class GhostText implements SceneMoment {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private texture: THREE.CanvasTexture | null = null;
  private aspect = 2.4;
  private disposed = false;

  constructor(host: SceneManager) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, uReveal: { value: 0 }, uOpacity: { value: 0.3 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = -400;
    host.scene.add(this.mesh);
    void this.draw();
  }

  private async draw() {
    try {
      await document.fonts.load("italic 900 120px 'Libre Franklin'");
    } catch {
      // the fallback face still draws legible letters
    }
    if (this.disposed) return;
    const words = BRAND.tagline.split(' ');
    const half = Math.ceil(words.length / 2);
    const lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')].map((line) => line.toUpperCase());
    const width = 2048;
    const lineHeight = 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = lineHeight * lines.length + 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = "italic 900 330px 'Libre Franklin', 'Arial Black', sans-serif";
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    // As in the reference: soft, solid, translucent letters (no outline), lighter at the top, with a gentle glow
    // around them, so the can stands in front of a luminous wall of type.
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 48;
    lines.forEach((line, i) => {
      const measured = ctx.measureText(line).width;
      const x = i === 0 ? 40 : Math.min(width - measured - 40, 40 + 220);
      const baseline = 300 + i * lineHeight;
      const fill = ctx.createLinearGradient(0, baseline - 260, 0, baseline + 10);
      fill.addColorStop(0, 'rgba(245,247,255,0.62)');
      fill.addColorStop(1, 'rgba(225,232,250,0.38)');
      ctx.fillStyle = fill;
      ctx.fillText(line, x, baseline);
    });
    this.aspect = canvas.width / canvas.height;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material.uniforms.map.value = this.texture;
  }

  update(_seconds: number, scene: SceneManager) {
    const p = scene.sectionPosition;
    // visible while the argument section (position 6) is on screen
    const reveal = THREE.MathUtils.smoothstep(p, 5.35, 5.95);
    // gone before the line-up drops in (it showed through the arriving row)
    const leave = 1 - THREE.MathUtils.smoothstep(p, 6.15, 6.5);
    // soft solid letters (the reference's translucent wall of type); a little stronger on phones, where the can covers more
    const opacity = (scene.camera.aspect < 0.8 ? 0.75 : 0.6) * leave;
    this.mesh.visible = !!this.texture && reveal > 0.001 && opacity > 0.002;
    if (!this.mesh.visible) return;
    const z = -4.5;
    const distance = scene.camera.position.z - z;
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2)) * distance;
    const viewWidth = viewHeight * scene.camera.aspect;
    // Portrait phones: use nearly the whole width so the line stays readable instead of a thin band.
    const widthFactor = scene.camera.aspect < 0.8 ? 0.94 : 0.84;
    const width = Math.min(viewWidth * widthFactor, viewHeight * 1.5 * this.aspect * 0.5);
    this.mesh.scale.set(width, width / this.aspect, 1);
    // slow drift: the letters slide against the can as the section passes
    // (in proportion to the view width: a fixed 1.6 units pushed the type off a narrow phone screen)
    const drift = (p - 6) * 0.12 * viewWidth;
    this.mesh.position.set(scene.camera.position.x + drift, scene.camera.position.y + 0.2, z);
    this.material.uniforms.uReveal.value = reveal;
    this.material.uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}
