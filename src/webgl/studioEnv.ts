import * as THREE from 'three';
import { SCENE_COLOR } from './palette';

/**
 * Studio environment for reflections, generated in code (no HDRI file): a black room with one
 * large overhead softbox, a tall neutral strip on the left (the key-side gloss streak), a faint strip
 * on the right, a grey floor and a small hard kicker behind. Prefiltered with PMREM.
 * The panels are what the can's satin black, clear coat and silver wordmark actually reflect.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, accent?: THREE.ColorRepresentation): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  room.background = new THREE.Color(SCENE_COLOR.black);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const addPanel = (
    width: number,
    height: number,
    colour: THREE.ColorRepresentation,
    radiance: number,
    position: [number, number, number],
    lookAt: [number, number, number] = [0, 0, 0]
  ) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    material.color.set(colour).multiplyScalar(radiance);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(...position);
    panel.lookAt(...lookAt);
    room.add(panel);
    geometries.push(geometry);
    materials.push(material);
  };

  addPanel(8, 2.4, SCENE_COLOR.studioKey, 3.6, [0, 7, 2.5]); // overhead softbox: metal-grey lids with a bright ring, never blown white
  // left strip: the key side. Broad and soft, set forward, so its reflection rolls across the can's curve as a wide
  // sheen; narrow and hot out at the side (2.2 wide, radiance 4) it drew a hard white line down the can's left edge,
  // read as an outline on the flat colour labels
  addPanel(4.5, 10, SCENE_COLOR.studioStripLeft, 1.6, [-6, 0.8, 5]);
  addPanel(1.0, 10, SCENE_COLOR.studioStripRight, 0.8, [6.5, 0.8, -1.5]); // right strip: a faint second edge on the shadow side
  addPanel(24, 24, SCENE_COLOR.studioFloorBounce, 0.2, [0, -6, 0]); // grey floor bounce
  addPanel(12, 7, SCENE_COLOR.studioFrontFill, 0.7, [-2, 2, 14]); // frontal fill: low, so the can's face reflects dark between the streaks (at 1.6 it washed the label flat)
  addPanel(1.6, 1.6, SCENE_COLOR.white, 5.0, [3.5, 3, -9]); // small hard kicker behind
  // a coloured gel on the shadow side: each flavor's can carries a thin streak of its own colour in the metal
  if (accent !== undefined) addPanel(1.2, 9, accent, 1.6, [7.5, 0.5, 1.5]);

  const texture = pmrem.fromScene(room, 0.035).texture;
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  pmrem.dispose();
  return texture;
}
