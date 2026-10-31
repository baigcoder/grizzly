/**
 * Product thumbnails rendered from the site's own 3D can (lid, tab, seam, domed base, label and metal), so the shop,
 * bag and "Try another flavor" cards show the same real can as the 3D stage instead of a flat label crop.
 *
 *   1. npm run dev, then node scripts/thumb-receiver.mjs (saves what this page sends)
 *   2. open http://localhost:5173/scripts/thumb-studio.html
 *   3. node scripts/build-thumbs.mjs (PNG sources → public/products/thumbs/*.webp)
 *
 * Dev tool only: not part of the site build.
 */
import * as THREE from 'three';
import { createCanMesh, setCanFocus, CAN } from '../src/webgl/canModel';
import { createStudioEnvironment } from '../src/webgl/studioEnv';
import { SCENE_COLOR } from '../src/webgl/palette';
import { LABEL } from '../src/data/brand';
import { FLAVORS } from '../src/data/flavors';

// Output: the old thumbnails' 187 × 491 frame at 3x, so cards and the bag keep their layout.
const WIDTH = 561;
const HEIGHT = 1473;
const RECEIVER = 'http://127.0.0.1:8788';
const TEXTURES = '/textures/grizzly';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.environment = createStudioEnvironment(renderer);

// the stage's product lighting: a cool overhead key, a chrome back edge, a soft front fill and a lift for the base
const key = new THREE.DirectionalLight(SCENE_COLOR.key, 1.5);
key.position.set(-4.2, 6.5, 4.2);
const rim = new THREE.DirectionalLight(SCENE_COLOR.rim, 2.2);
rim.position.set(3.2, 3.5, -5);
const fill = new THREE.DirectionalLight(SCENE_COLOR.softFill, 0.45);
fill.position.set(2.6, -0.6, 4);
const baseFill = new THREE.DirectionalLight(SCENE_COLOR.baseFill, 0.6);
baseFill.position.set(0.5, -6, 3);
scene.add(key, rim, fill, baseFill, new THREE.HemisphereLight(SCENE_COLOR.skyFill, SCENE_COLOR.groundFill, 0.25));

// A long lens from a little above: the can reads straight on with a sliver of its lid, as on a product shot.
const totalHeight = CAN.shellHeight + CAN.topHeight + CAN.bottomHeight;
const camera = new THREE.PerspectiveCamera(9, WIDTH / HEIGHT, 1, 200);
const centreY = (CAN.topHeight - CAN.bottomHeight) / 2;
const elevation = THREE.MathUtils.degToRad(6);
// the can's height (plus a small margin) fills the frame
const distance = (totalHeight * 1.06) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
camera.position.set(0, centreY + distance * Math.sin(elevation), distance * Math.cos(elevation));
camera.lookAt(0, centreY, 0);

const loader = new THREE.TextureLoader();
const load = (url: string, srgb: boolean) =>
  loader.loadAsync(url).then((texture) => {
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  });

const status = document.getElementById('status')!;
const out = document.getElementById('out')!;

// ?slugs=a,b renders only those; a slug outside the range (a limited-edition concept) loads its maps from
// assets/label-flat/maps (scripts/build-flat-labels.mjs --install), which the dev server serves but the site does not ship
const slugs = new URLSearchParams(location.search).get('slugs')?.split(',') ?? FLAVORS.map((flavor) => flavor.id);
for (const slug of slugs) {
  const base = FLAVORS.some((flavor) => flavor.id === slug) ? TEXTURES : '/assets/label-flat/maps';
  const [albedo, surface, normal] = await Promise.all([
    load(`${base}/${slug}.webp`, true),
    load(`${base}/${slug}-surface.png`, false),
    load(`${base}/${slug}-normal.png`, false),
  ]);
  const can = createCanMesh(albedo, surface, false, normal);
  setCanFocus(can, 1);
  // Small and flat on a card, the studio strips read as two white bars down the label (a glass tube, not a can):
  // keep the varnish streak but soften it, so the artwork reads through.
  const shell = can.getObjectByName('Shell') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  shell.material.envMapIntensity = 0.42;
  shell.material.clearcoat = 0.45;
  shell.material.clearcoatRoughness = 0.22;
  // the label's front panel to the camera (u = 0.5 faces it at rotation 0)
  can.rotation.y = (0.5 - LABEL.frontCenterU) * Math.PI * 2;
  scene.add(can);
  renderer.render(scene, camera);
  const blob = await new Promise<Blob>((resolve) => renderer.domElement.toBlob((b) => resolve(b!), 'image/png'));
  scene.remove(can);
  [albedo, surface, normal].forEach((texture) => texture.dispose());

  const img = document.createElement('img');
  img.src = URL.createObjectURL(blob);
  img.alt = slug;
  out.append(img);
  try {
    await fetch(`${RECEIVER}/${slug}.png`, { method: 'POST', body: blob });
  } catch {
    status.textContent = `Rendered, but the receiver at ${RECEIVER} is not running`;
  }
}
if (status.textContent === 'Rendering…') status.textContent = `Done: ${slugs.length} cans sent to ${RECEIVER}`;
document.documentElement.dataset.done = 'true';
