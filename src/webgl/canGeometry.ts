import * as THREE from 'three';

/**
 * Grizzly 250 ml slim can, modelled from profile curves (no external model file).
 *
 * Label shell: radius 0.795, height 3.88, UV u = around (u 0.5 faces +Z), v = up (1 at the top),
 * the same layout the label textures were built for (see scripts/build-labels.mjs).
 * Ends: a tapered neck, double-seam chime, countersunk lid with a stay-on tab at the top,
 * and a domed base with a foot ring at the bottom. Total height ≈ 4.5 world units.
 */
import { CAN, END_STRETCH } from './canDimensions';
export { CAN };

const RADIAL_SEGMENTS = 128;
const SHELL_HALF = CAN.shellHeight / 2;

/**
 * (radius, y) pairs relative to the shell edge, ordered so lathe normals face outward. Top, as on a real slim can:
 * the shoulder necks in over two small die ridges, rolls over into the rounded double-seam rim, drops down the
 * chuck wall into the countersink groove and rises to the lid panel, which carries one raised expansion bead.
 * The lid panel stays at LID_Y (the tab rests on it).
 */
const TOP_PROFILE: Array<[number, number]> = [
  // shoulder and necking (two soft die ridges)
  [0.795, 0.0], [0.794, 0.02], [0.787, 0.044], [0.774, 0.068], [0.762, 0.084], [0.757, 0.093], [0.752, 0.106],
  [0.74, 0.124], [0.727, 0.14], [0.721, 0.15], [0.716, 0.162], [0.704, 0.18], [0.695, 0.196], [0.691, 0.212],
  // double seam: the rolled rim, its outer face a little proud of the neck
  [0.692, 0.226], [0.699, 0.239], [0.704, 0.254], [0.704, 0.269], [0.699, 0.281], [0.689, 0.288], [0.676, 0.29],
  [0.664, 0.287], [0.656, 0.278],
  // chuck wall down into the countersink groove
  [0.652, 0.26], [0.647, 0.238], [0.641, 0.214], [0.634, 0.197], [0.626, 0.189], [0.617, 0.191], [0.611, 0.199],
  // lid panel with its expansion bead, very slightly domed toward the centre
  [0.602, 0.205], [0.58, 0.206], [0.535, 0.206], [0.512, 0.209], [0.498, 0.214], [0.484, 0.209], [0.462, 0.206],
  [0.32, 0.207], [0.16, 0.209], [0.0, 0.21],
];
/**
 * Bottom, centre outward: the domed base (recessed up into the can), the reinforcing dome wall, a narrow rounded
 * stand ring the can rests on, then the heel sweeping out and up to the body.
 */
const BOTTOM_PROFILE: Array<[number, number]> = [
  [0.0, -0.072], [0.16, -0.077], [0.3, -0.09], [0.4, -0.106], [0.462, -0.124],
  [0.5, -0.146], [0.52, -0.172], [0.534, -0.2], [0.545, -0.225],
  [0.556, -0.239], [0.571, -0.245], [0.588, -0.244], [0.601, -0.237],
  [0.613, -0.222], [0.63, -0.2], [0.656, -0.171], [0.69, -0.135], [0.729, -0.095], [0.764, -0.055], [0.785, -0.022],
  [0.795, 0.0],
];

function latheFromProfile(profile: Array<[number, number]>, offsetY: number, stretch: number): THREE.LatheGeometry {
  // the profile's heights are stretched (END_STRETCH) so the shoulder and the base taper read at a real can's scale
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y * stretch + offsetY)));
  // the control points are dense where the profile turns sharply, so a few samples between each keep it crisp
  const points = curve.getPoints(profile.length * 3);
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
    top: latheFromProfile(TOP_PROFILE, SHELL_HALF, END_STRETCH.top),
    bottom: latheFromProfile(BOTTOM_PROFILE, -SHELL_HALF, END_STRETCH.bottom),
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
export const LID_Y = SHELL_HALF + 0.205 * END_STRETCH.top;
/** Rivet position on the lid panel: the tab pivots about this point. */
export const TAB_PIVOT = new THREE.Vector3(0, LID_Y + 0.012, 0.02);
