/**
 * One definition of device capability, shared by the app shell and the scene (no three.js import, so the shell can
 * ask before deciding to load the 3D chunk at all). Pure functions: unit-tested, safe to call anywhere.
 */
export type QualityTier = 'HIGH' | 'MEDIUM' | 'LOW';

/** Phones and tablets take the lighter render tier. */
export function isLowPowerDevice(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth < 1024 || /iPad|iPhone|iPod|Android/.test(navigator.userAgent);
}

export interface DeviceSignals {
  width: number;
  /** navigator.hardwareConcurrency (0 or undefined when unknown) */
  cores: number;
  /** navigator.deviceMemory in GB (Chromium only; undefined elsewhere) */
  memoryGb?: number;
  /** Network Information API: data saver on, or a 2g connection */
  dataSaver: boolean;
  reducedMotion: boolean;
}

/**
 * Starting render tier. The frame-rate governor in the scene can still step down from here, never up.
 *   HIGH    full materials, lens focus, floor reflections, highest practical textures
 *   MEDIUM  good materials and textures, no lens focus, lighter stage (phones, mid-range laptops, reduced motion)
 *   LOW     stable and cheap: no post-processing or reflections (data saver, 2 GB or less memory, 2 cores or fewer)
 * Unknown signals never push a device down: only a known weakness does.
 */
export function pickQuality({ width, cores, memoryGb, dataSaver, reducedMotion }: DeviceSignals): QualityTier {
  const known = cores > 0;
  if (dataSaver || (memoryGb !== undefined && memoryGb <= 2) || (known && cores <= 2)) return 'LOW';
  if (reducedMotion || width < 768 || (known && cores <= 4) || (memoryGb !== undefined && memoryGb <= 4)) return 'MEDIUM';
  return 'HIGH';
}

/** Reads the real signals (client only). */
export function readDeviceSignals(reducedMotion: boolean): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const connection = nav.connection;
  return {
    width: window.innerWidth,
    cores: nav.hardwareConcurrency || 0,
    memoryGb: nav.deviceMemory,
    dataSaver: Boolean(connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType ?? ''))),
    reducedMotion,
  };
}
