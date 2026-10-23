import * as THREE from 'three';

/**
 * Grizzly 250 ml slim can, modelled from profile curves (no external model file).
 *
 * Label shell: radius 0.795, height 3.88, UV u = around (u 0.5 faces +Z), v = up (1 at the top),
 * the same layout the label textures were built for (see scripts/build-labels.mjs).
 * Ends: a tapered neck, double-seam chime, countersunk lid with a stay-on tab at the top,
 * and a domed base with a foot ring at the bottom. Total height ≈ 4.5 world units.
 */
import { CAN } from './canDimensions';
export { CAN };

const RADIAL_SEGMENTS = 128;
const SHELL_HALF = CAN.shellHeight / 2;

/** (radius, y) pairs relative to the shell edge, ordered so lathe normals face outward. */
const TOP_PROFILE: Array<[number, number]> = [
  [0.795, 0.0], [0.791, 0.03], [0.772, 0.08], [0.738, 0.135], [0.704, 0.185], [0.69, 0.215], [0.69, 0.245],
  [0.7, 0.265], [0.694, 0.282], [0.676, 0.29], [0.654, 0.283], [0.642, 0.262], [0.628, 0.218], [0.61, 0.2],
  [0.56, 0.198], [0.32, 0.204], [0.0, 0.214],
];
const BOTTOM_PROFILE: Array<[number, number]> = [
  [0.0, -0.082], [0.3, -0.11], [0.47, -0.15], [0.56, -0.18], [0.606, -0.214], [0.631, -0.24], [0.655, -0.245],
  [0.676, -0.235], [0.69, -0.215], [0.69, -0.19], [0.726, -0.15], [0.766, -0.09], [0.791, -0.03], [0.795, 0.0],
];

function latheFromProfile(profile: Array<[number, number]>, offsetY: number): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y + offsetY)));
  const points = curve.getPoints(profile.length * 5);
  return new THREE.LatheGeometry(points, RADIAL_SEGMENTS);
}

/** Stay-on tab: a rounded lever with a finger hole, extruded 0.02 thick, lying along +Z. */
function createTabGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const w = 0.17;
  const front = 0.38;
  const back = -0.14;
  shape.moveTo(-w * 0.55, back);
  shape.quadraticCurveTo(-w, back, -w, back + 0.1);
  shape.lineTo(-w, front - 0.2);
  shape.quadraticCurveTo(-w, front, 0, front);
  shape.quadraticCurveTo(w, front, w, front - 0.2);
  shape.lineTo(w, back + 0.1);
  shape.quadraticCurveTo(w, back, w * 0.55, back);
  shape.lineTo(-w * 0.55, back);
  const hole = new THREE.Path();
  hole.absellipse(0, front - 0.17, 0.095, 0.11, 0, Math.PI * 2, false, 0);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 18 });
  // Extrude builds in XY: lay it flat on the lid (XZ plane), thickness along +Y.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Bean-shaped drinking opening, revealed when the tab is pulled. */
function createOpeningGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 0.17, 0.27, 0, Math.PI * 2, false, 0);
  const geometry = new THREE.ShapeGeometry(shape, 28);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export interface CanGeometryParts {
  shell: THREE.BufferGeometry;
  top: THREE.BufferGeometry;
  bottom: THREE.BufferGeometry;
  tab: THREE.BufferGeometry;
  opening: THREE.BufferGeometry;
}

let cachedParts: CanGeometryParts | null = null;

/** One geometry set shared by every can instance. Disposed with disposeCanGeometry(). */
export function getCanGeometry(): CanGeometryParts {
  if (cachedParts) return cachedParts;
  // thetaStart = -π puts u = 0.5 at +Z, facing the camera at rotation 0.
  const shell = new THREE.CylinderGeometry(CAN.radius, CAN.radius, CAN.shellHeight, RADIAL_SEGMENTS, 1, true, -Math.PI, Math.PI * 2);
  cachedParts = {
    shell,
    top: latheFromProfile(TOP_PROFILE, SHELL_HALF),
    bottom: latheFromProfile(BOTTOM_PROFILE, -SHELL_HALF),
    tab: createTabGeometry(),
    opening: createOpeningGeometry(),
  };
  return cachedParts;
}

export function disposeCanGeometry() {
  if (!cachedParts) return;
  Object.values(cachedParts).forEach((geometry) => geometry.dispose());
  cachedParts = null;
}

/** World Y of the lid panel (where the tab sits) relative to the can origin. */
export const LID_Y = SHELL_HALF + 0.205;
/** Rivet position on the lid panel: the tab pivots about this point. */
export const TAB_PIVOT = new THREE.Vector3(0, LID_Y + 0.012, 0.02);
