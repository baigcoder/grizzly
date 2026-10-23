/**
 * The 3D scene's colours, in one place. WebGL lights and materials take numbers, not CSS variables, so this is the
 * scene's counterpart of the primitive layer in src/styles/primitives.css: components and scene code reference these
 * names and never write a colour literal. Flavor accents come from the data file (grizzly.json), not from here.
 */
export const SCENE_COLOR = {
  black: 0x000000,
  white: 0xffffff,
  /** Renderer clear colour: the deep night behind everything. */
  night: 0x02040a,

  // Studio and night lighting
  skyFill: 0xcfe0ff,
  groundFill: 0x07090e,
  key: 0xf2f7ff,
  rim: 0xdfe6ff,
  softFill: 0xe8eef8,
  baseFill: 0xdfe4ec,

  // Studio environment panels (reflections in the metal)
  studioKey: 0xf3f3f1,
  studioStripLeft: 0xf6f6f4,
  studioStripRight: 0xe8e8e6,
  studioFloorBounce: 0x343434,
  studioFrontFill: 0xeeeeec,

  // Aluminium
  lid: 0xd9dbe0,
  base: 0xb4b8c1,
  baseRim: 0xc9ccd2,
  /** The dark void inside the opened can. */
  canOpening: 0x020203,

  // Floor reflections and air
  reflectionMetal: 0x4c5563,
  reflectionShell: 0x9aa4b6,
} as const;

/** Procedural fruit-slice textures drawn on a 2D canvas (CSS colour strings). */
export const FRUIT_COLOR = {
  kiwi: { rind: '#5a3b1d', flesh: '#7fbf3a', core: '#e6f2c4', seed: '#1b130c' },
  melon: { rind: '#1f6b2d', pith: '#e9f3d4', flesh: '#e8403a', seed: '#1a0f0c' },
  mango: { skin: '#e1672a', flesh: '#ffc233', core: '#ffe9a8' },
  peach: { skin: '#d9743f', flesh: '#ffc59a', stone: '#8a3b22' },
} as const;

/** Tints of the 3D fruit pieces floating around each flavor (white = the texture's own colours). */
export const FRUIT_PIECE_COLOR = {
  berryBlue: 0x2a4fd0,
  ice: 0xcfeaff,
  mango: 0xf5a623,
  melonRind: 0x2f7a3b,
  strawberry: 0xd02a48,
  peach: 0xf3a074,
  blackoutBerry: 0x4a2a78,
  texture: 0xffffff,
} as const;

