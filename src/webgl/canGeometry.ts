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
 * (radius, y) pairs relative to the shell edge, ordered so lathe normals face outward. Drawn at true size from the
 * reference can: each end is only ~2.5% of the can's height (a hair-thin rim, the body running almost straight up to
 * it), the rim's outer width ~94% of the body. Top: a short shoulder, the rolled double-seam rim, the chuck wall down
 * into the countersink groove, then the lid panel with one raised expansion bead. The panel stays at LID_Y (the tab
 * rests on it).
 */
const TOP_PROFILE: Array<[number, number]> = [
  // short shoulder into the rim
  [0.795, 0.0], [0.793, 0.012], [0.788, 0.026], [0.778, 0.04], [0.766, 0.052], [0.757, 0.062],
  // the rolled rim, its outer face just proud of the shoulder
  [0.754, 0.07], [0.755, 0.078], [0.751, 0.086], [0.743, 0.092], [0.733, 0.094], [0.723, 0.091], [0.716, 0.084],
  // chuck wall down into the countersink groove
  [0.71, 0.074], [0.705, 0.064], [0.7, 0.054], [0.692, 0.047], [0.682, 0.045], [0.674, 0.048], [0.668, 0.054],
  // lid panel with its expansion bead, very slightly domed toward the centre
  [0.658, 0.058], [0.62, 0.059], [0.55, 0.06], [0.52, 0.062], [0.505, 0.066], [0.49, 0.062], [0.46, 0.06],
  [0.3, 0.061], [0.15, 0.063], [0.0, 0.064],
];
/**
 * Bottom, centre outward: the domed base (recessed up into the can), the reinforcing dome wall, a narrow rounded
 * stand ring the can rests on, then a short heel sweeping out and up to the body.
 */
const BOTTOM_PROFILE: Array<[number, number]> = [
  [0.0, -0.03], [0.16, -0.033], [0.3, -0.04], [0.4, -0.048], [0.46, -0.056],
  [0.5, -0.066], [0.52, -0.078], [0.53, -0.09], [0.54, -0.1],
  [0.552, -0.106], [0.568, -0.109], [0.585, -0.108], [0.6, -0.104],
  [0.612, -0.098], [0.63, -0.088], [0.66, -0.074], [0.7, -0.058], [0.74, -0.04], [0.77, -0.024], [0.787, -0.01],
  [0.795, 0.0],
];

/** A soft dark pocket at (r0, y0) in the authored profile: 1 at its centre, 0 beyond `width`. */
const pocket = (r: number, y: number, r0: number, y0: number, width: number) =>
  Math.exp(-(((r - r0) ** 2 + (y - y0) ** 2) / (width * width)));

/** Baked ambient occlusion for the lid: dark in the countersink groove and under the rolled rim, and at the seam. */
const topOcclusion = (r: number, y: number) =>
  1 - 0.5 * pocket(r, y, 0.682, 0.046, 0.022) - 0.3 * pocket(r, y, 0.745, 0.068, 0.014) - 0.38 * Math.max(0, 1 - y / 0.014);

/** The same for the base: the crease between dome and stand ring, a slightly dim dome, and the seam. */
const bottomOcclusion = (r: number, y: number) =>
  1 - 0.5 * pocket(r, y, 0.538, -0.096, 0.022) - 0.12 * Math.max(0, 1 - r / 0.45) - 0.38 * Math.max(0, 1 + y / 0.014);

/**
 * Lathes a profile into a surface of revolution, with baked occlusion in the vertex colours. Real can ends are
 * darkest in their creases: without it the lid and base read as smooth, evenly lit, painted shapes.
 */
function latheFromProfile(
  profile: Array<[number, number]>,
  offsetY: number,
  stretch: number,
  occlusion: (r: number, y: number) => number
): THREE.LatheGeometry {
  // (END_STRETCH is 1 at true size; it stays a knob for the profile heights)
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y * stretch + offsetY)));
  // the control points are dense where the profile turns sharply, so a few samples between each keep it crisp
  const points = curve.getPoints(profile.length * 3);
  const geometry = new THREE.LatheGeometry(points, RADIAL_SEGMENTS);
  // lathe vertices run round the can (outer) and along the profile (inner)
  const colours = new Float32Array(geometry.attributes.position.count * 3);
  for (let k = 0; k < geometry.attributes.position.count; k += 1) {
    const point = points[k % points.length];
    const ao = Math.max(0.3, occlusion(point.x, (point.y - offsetY) / stretch));
    colours.set([ao, ao, ao], k * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
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
    top: latheFromProfile(TOP_PROFILE, SHELL_HALF, END_STRETCH.top, topOcclusion),
    bottom: latheFromProfile(BOTTOM_PROFILE, -SHELL_HALF, END_STRETCH.bottom, bottomOcclusion),
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
export const LID_Y = SHELL_HALF + 0.062 * END_STRETCH.top;
/** Rivet position on the lid panel: the tab pivots about this point. */
export const TAB_PIVOT = new THREE.Vector3(0, LID_Y + 0.012, 0.02);
