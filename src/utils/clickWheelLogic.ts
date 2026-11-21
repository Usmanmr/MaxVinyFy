import { extractValidYouTubeVideoId } from './youtubePlayer';

export type ClickWheelPaneId = 'music' | 'now-playing' | 'lyrics' | 'settings';

export const CLICK_WHEEL_PANE_ORDER: readonly ClickWheelPaneId[] = [
  'music',
  'now-playing',
  'lyrics',
  'settings',
] as const;

export const CLICK_WHEEL_TICK_DEGREES = 15;
export const CLICK_WHEEL_DOUBLE_PRESS_MS = 340;

export type ClickWheelTrackChangePhase = 'idle' | 'sliding';

/**
 * Snappy sub-1-second horizontal album-art slide choreography on track change (total 560ms < 1000ms).
 */
export const CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS = {
  slideDurationMs: 560,
} as const;

/**
 * Computes the shortest signed angular delta in degrees between two wheel angles (-180..+180),
 * handling wraparound smoothly without jumps.
 */
export function normalizeClickWheelAngleDeltaDeg(
  prevAngleDeg: number,
  nextAngleDeg: number
): number {
  if (!Number.isFinite(prevAngleDeg) || !Number.isFinite(nextAngleDeg)) {
    return 0;
  }
  let delta = nextAngleDeg - prevAngleDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/**
 * Accumulates continuous pointer angle delta along the Click Wheel ring and emits discrete integer steps
 * every `thresholdDeg` (default 15° clockwise = +1, counter-clockwise = -1), returning the leftover remainder.
 */
export function accumulateClickWheelTickSteps(
  accumulatedDeg: number,
  deltaDeg: number,
  thresholdDeg = CLICK_WHEEL_TICK_DEGREES
): { steps: number; remainderDeg: number } {
  const safeThreshold = Math.max(5, Math.abs(thresholdDeg || CLICK_WHEEL_TICK_DEGREES));
  const safeAccum = (Number.isFinite(accumulatedDeg) ? accumulatedDeg : 0) +
    (Number.isFinite(deltaDeg) ? deltaDeg : 0);

  if (Math.abs(safeAccum) < safeThreshold) {
    return { steps: 0, remainderDeg: safeAccum };
  }

  const steps = safeAccum > 0
    ? Math.floor(safeAccum / safeThreshold)
    : Math.ceil(safeAccum / safeThreshold);

  const remainderDeg = safeAccum - steps * safeThreshold;
  return { steps, remainderDeg };
}

/**
 * Applies wheel step ticks to move focus smoothly through a scrollable Music list without overflowing.
 */
export function computeClickWheelListIndexStep(
  currentIndex: number,
  stepDelta: number,
  totalItems: number
): number {
  if (!Number.isFinite(totalItems) || totalItems <= 0) return 0;
  const maxIndex = totalItems - 1;
  const safeCur = Number.isFinite(currentIndex)
    ? Math.max(0, Math.min(maxIndex, Math.round(currentIndex)))
    : 0;
  const safeDelta = Number.isFinite(stepDelta) ? Math.trunc(stepDelta) : 0;
  return Math.max(0, Math.min(maxIndex, safeCur + safeDelta));
}

/**
 * Maps discrete Click Wheel ticks while on the Now Playing pane into clamped timeline seek seconds.
 */
export function computeClickWheelSeekTargetSec(
  currentTimeSec: number,
  stepDelta: number,
  durationSec: number,
  secPerTick = 3
): number {
  const safeDur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (safeDur <= 0) return 0;
  const safeCur = Number.isFinite(currentTimeSec) ? Math.max(0, Math.min(safeDur, currentTimeSec)) : 0;
  const safeStep = Number.isFinite(stepDelta) ? Math.trunc(stepDelta) : 0;
  const safeRate = Number.isFinite(secPerTick) && secPerTick > 0 ? secPerTick : 3;
  return Math.max(0, Math.min(safeDur, safeCur + safeStep * safeRate));
}

/**
 * Formats classic elapsed ("01:24") and remaining ("-02:18") counters for Now Playing.
 */
export function formatRemainingTrackTime(
  elapsedSec: number,
  durationSec: number
): { elapsedLabel: string; remainingLabel: string } {
  const safeDur = Math.max(0, Math.floor(Number.isFinite(durationSec) ? durationSec : 0));
  const safeElapsed = Math.max(
    0,
    Math.min(safeDur, Math.floor(Number.isFinite(elapsedSec) ? elapsedSec : 0))
  );
  const remaining = Math.max(0, safeDur - safeElapsed);

  const fmt = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return {
    elapsedLabel: fmt(safeElapsed),
    remainingLabel: `-${fmt(remaining)}`,
  };
}

/**
 * Computes slide transition index offset percentage for the 250ms horizontal 4-pane screen.
 */
export function getClickWheelPaneOffsetPercent(paneId: ClickWheelPaneId): number {
  const idx = CLICK_WHEEL_PANE_ORDER.indexOf(paneId);
  return (idx >= 0 ? idx : 1) * 100;
}

/**
 * Resolves MENU button back navigation cleanly through pane history without dead ends.
 */
export function getNextClickWheelMenuBackPane(
  currentPane: ClickWheelPaneId,
  historyStack: readonly ClickWheelPaneId[]
): { nextPane: ClickWheelPaneId; nextHistory: ClickWheelPaneId[] } {
  const filteredHistory = historyStack.filter((p) => p !== currentPane);
  if (filteredHistory.length > 0) {
    const nextPane = filteredHistory[filteredHistory.length - 1];
    return {
      nextPane,
      nextHistory: filteredHistory.slice(0, -1),
    };
  }

  switch (currentPane) {
    case 'lyrics':
      return { nextPane: 'now-playing', nextHistory: [] };
    case 'now-playing':
      return { nextPane: 'music', nextHistory: [] };
    case 'settings':
      return { nextPane: 'music', nextHistory: [] };
    case 'music':
    default:
      return { nextPane: 'now-playing', nextHistory: [] };
  }
}

/**
 * Detects whether two presses of the Click Wheel center button fall within the double-press skip-stutter window.
 */
export function detectDoubleCenterPress(
  lastPressMs: number | null,
  nowMs: number,
  thresholdMs = CLICK_WHEEL_DOUBLE_PRESS_MS
): { isDoublePress: boolean; nextLastPressMs: number | null } {
  if (!Number.isFinite(nowMs)) {
    return { isDoublePress: false, nextLastPressMs: null };
  }
  if (lastPressMs !== null && Number.isFinite(lastPressMs)) {
    const elapsed = nowMs - lastPressMs;
    if (elapsed >= 0 && elapsed <= thresholdMs) {
      return { isDoublePress: true, nextLastPressMs: null };
    }
  }
  return { isDoublePress: false, nextLastPressMs: nowMs };
}

/**
 * Returns outgoing/incoming compositor transform coordinates for the sub-1s album-art horizontal slide.
 */
export function getClickWheelTrackChangePose(phase: ClickWheelTrackChangePhase): {
  outgoingTranslatePct: number;
  outgoingOpacity: number;
  incomingTranslatePct: number;
  incomingOpacity: number;
} {
  if (phase === 'sliding') {
    return {
      outgoingTranslatePct: -108,
      outgoingOpacity: 0,
      incomingTranslatePct: 0,
      incomingOpacity: 1,
    };
  }
  return {
    outgoingTranslatePct: 108,
    outgoingOpacity: 0,
    incomingTranslatePct: 0,
    incomingOpacity: 1,
  };
}

export type ClickWheelGenerationId = 'gen1' | 'gen2' | 'gen3' | 'nano';
export type ClickWheelGen3Finish = 'black' | 'white' | 'official-white';
export type NanoColorwayId =
  | 'silver'
  | 'graphite'
  | 'blue'
  | 'green'
  | 'orange'
  | 'pink'
  | 'red';
export type ClickWheelScreenMode = 'mono-lcd' | 'mono-blue' | 'color';
export type ClickWheelWheelMode = 'mechanical' | 'touch';
export type ClickWheelSoundProfile = 'plastic-clack' | 'electronic-tick' | 'soft-tick';

export interface NanoColorwaySpec {
  id: NanoColorwayId;
  label: string;
  swatchHex: string;
  chassisGradient: string;
  borderHex: string;
  isDarkChassis: boolean;
}

export const IPOD_NANO_7_COLORS: readonly NanoColorwaySpec[] = [
  {
    id: 'silver',
    label: 'Silver',
    swatchHex: '#D8DCE0',
    chassisGradient: 'linear-gradient(168deg, #F0F2F5 0%, #D8DCE0 52%, #BFC5CE 100%)',
    borderHex: '#C2C7D0',
    isDarkChassis: false,
  },
  {
    id: 'graphite',
    label: 'Graphite Black',
    swatchHex: '#2C2E33',
    chassisGradient: 'linear-gradient(172deg, #4B4F58 0%, #2C2E33 55%, #1B1D21 100%)',
    borderHex: '#565A64',
    isDarkChassis: true,
  },
  {
    id: 'blue',
    label: 'Electric Blue',
    swatchHex: '#1D9BF0',
    chassisGradient: 'linear-gradient(168deg, #45B1F8 0%, #1D9BF0 52%, #0F76C2 100%)',
    borderHex: '#1584D1',
    isDarkChassis: false,
  },
  {
    id: 'green',
    label: 'Vibrant Lime Green',
    swatchHex: '#7ED321',
    chassisGradient: 'linear-gradient(168deg, #9CE24B 0%, #7ED321 52%, #5DA612 100%)',
    borderHex: '#6BB818',
    isDarkChassis: false,
  },
  {
    id: 'orange',
    label: 'Vivid Orange',
    swatchHex: '#FF6B1A',
    chassisGradient: 'linear-gradient(168deg, #FF8E4D 0%, #FF6B1A 52%, #D94E07 100%)',
    borderHex: '#E0570D',
    isDarkChassis: false,
  },
  {
    id: 'pink',
    label: 'Hot Pink',
    swatchHex: '#E83E8C',
    chassisGradient: 'linear-gradient(168deg, #F26BA8 0%, #E83E8C 52%, #BD246A 100%)',
    borderHex: '#C92C74',
    isDarkChassis: false,
  },
  {
    id: 'red',
    label: 'Product Red',
    swatchHex: '#D92027',
    chassisGradient: 'linear-gradient(168deg, #EC4148 0%, #D92027 52%, #A61218 100%)',
    borderHex: '#B5161D',
    isDarkChassis: false,
  },
] as const;

export const CLICK_WHEEL_NANO_COLOR_STORAGE_KEY = 'maxyoutify_cw_nano_color_v1';

export interface ClickWheelGenerationSpec {
  id: ClickWheelGenerationId;
  shortLabel: string;
  dockButtonLabel: string;
  dockSubLabel: string;
  name: string;
  yearLabel: string;
  screenMode: ClickWheelScreenMode;
  wheelMode: ClickWheelWheelMode;
  soundProfile: ClickWheelSoundProfile;
  /** Height / width ratio of the physical handheld chassis */
  chassisWidthRatio: number;
  /** Relative horizontal width factor vs standard iPod Classic (1.0 = full width, Nano = 0.72) */
  widthScaleFactor: number;
  /** Outer pill corner radius range responsive to cqw */
  chassisCornerRadiusCss: string;
  /** Sharp rectangular LCD inner gasket corner radius */
  screenCornerRadiusCss: string;
  hasAcrylicOverlay: boolean;
  hasChromeBezel: boolean;
  supportsFinishToggle: boolean;
}

export const CLICK_WHEEL_GENERATION_ORDER: readonly ClickWheelGenerationId[] = [
  'gen1',
  'gen2',
  'gen3',
  'nano',
] as const;

export const CLICK_WHEEL_GENERATION_STORAGE_KEY = 'maxyoutify_cw_generation_v1';
export const CLICK_WHEEL_GEN3_FINISH_STORAGE_KEY = 'maxyoutify_cw_gen3_finish_v1';

export const CLICK_WHEEL_GENERATIONS: Record<ClickWheelGenerationId, ClickWheelGenerationSpec> = {
  gen1: {
    id: 'gen1',
    shortLabel: '1st Gen',
    dockButtonLabel: '1st Gen',
    dockSubLabel: 'Scroll Wheel',
    name: 'Scroll Wheel',
    yearLabel: '2001',
    screenMode: 'mono-lcd',
    wheelMode: 'mechanical',
    soundProfile: 'plastic-clack',
    chassisWidthRatio: 1.56,
    widthScaleFactor: 1,
    chassisCornerRadiusCss: 'clamp(14px, 5.4cqw, 22px)',
    screenCornerRadiusCss: '2px',
    hasAcrylicOverlay: true,
    hasChromeBezel: true,
    supportsFinishToggle: false,
  },
  gen2: {
    id: 'gen2',
    shortLabel: '4th Gen',
    dockButtonLabel: '4th Gen',
    dockSubLabel: 'Click Wheel',
    name: 'Click Wheel',
    yearLabel: '2004',
    screenMode: 'mono-blue',
    wheelMode: 'touch',
    soundProfile: 'electronic-tick',
    chassisWidthRatio: 1.61,
    widthScaleFactor: 0.98,
    chassisCornerRadiusCss: 'clamp(15px, 5.8cqw, 24px)',
    screenCornerRadiusCss: '2.5px',
    hasAcrylicOverlay: false,
    hasChromeBezel: true,
    supportsFinishToggle: false,
  },
  gen3: {
    id: 'gen3',
    shortLabel: 'Classic',
    dockButtonLabel: 'Classic',
    dockSubLabel: 'Split QVGA',
    name: 'iPod Classic',
    yearLabel: '2007',
    screenMode: 'color',
    wheelMode: 'touch',
    soundProfile: 'soft-tick',
    chassisWidthRatio: 1.64,
    widthScaleFactor: 1,
    chassisCornerRadiusCss: 'clamp(14px, 5.2cqw, 21px)',
    screenCornerRadiusCss: '2px',
    hasAcrylicOverlay: false,
    hasChromeBezel: true,
    supportsFinishToggle: true,
  },
  nano: {
    id: 'nano',
    shortLabel: 'Nano',
    dockButtonLabel: 'Nano',
    dockSubLabel: 'Compact',
    name: 'iPod Nano',
    yearLabel: '2008',
    screenMode: 'color',
    wheelMode: 'touch',
    soundProfile: 'soft-tick',
    chassisWidthRatio: 1.88,
    widthScaleFactor: 0.72,
    chassisCornerRadiusCss: 'clamp(11px, 4.4cqw, 16px)',
    screenCornerRadiusCss: '2px',
    hasAcrylicOverlay: false,
    hasChromeBezel: true,
    supportsFinishToggle: true,
  },
};

export function normalizeClickWheelGeneration(raw?: string | null): ClickWheelGenerationId {
  if (raw === 'gen1' || raw === 'gen2' || raw === 'gen3' || raw === 'nano') {
    return raw;
  }
  return 'gen3';
}

export function getClickWheelGenerationSpec(
  gen?: ClickWheelGenerationId | string | null
): ClickWheelGenerationSpec {
  return CLICK_WHEEL_GENERATIONS[normalizeClickWheelGeneration(gen)];
}

export function cycleClickWheelGeneration(
  current: ClickWheelGenerationId
): ClickWheelGenerationId {
  const idx = CLICK_WHEEL_GENERATION_ORDER.indexOf(current);
  const nextIdx = (idx >= 0 ? idx + 1 : 0) % CLICK_WHEEL_GENERATION_ORDER.length;
  return CLICK_WHEEL_GENERATION_ORDER[nextIdx];
}

export function loadSavedClickWheelGeneration(
  storage?: Pick<Storage, 'getItem'> | null
): ClickWheelGenerationId {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return 'gen3';
  try {
    return normalizeClickWheelGeneration(targetStorage.getItem(CLICK_WHEEL_GENERATION_STORAGE_KEY));
  } catch {
    return 'gen3';
  }
}

export function saveClickWheelGeneration(
  gen: ClickWheelGenerationId,
  storage?: Pick<Storage, 'setItem'> | null
): ClickWheelGenerationId {
  const normalized = normalizeClickWheelGeneration(gen);
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (targetStorage) {
    try {
      targetStorage.setItem(CLICK_WHEEL_GENERATION_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }
  return normalized;
}

export function loadSavedGen3Finish(
  storage?: Pick<Storage, 'getItem'> | null
): ClickWheelGen3Finish {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return 'black';
  try {
    const raw = targetStorage.getItem(CLICK_WHEEL_GEN3_FINISH_STORAGE_KEY);
    if (raw === 'official-white') return 'official-white';
    return raw === 'white' ? 'white' : 'black';
  } catch {
    return 'black';
  }
}

export function saveGen3Finish(
  finish: ClickWheelGen3Finish,
  storage?: Pick<Storage, 'setItem'> | null
): ClickWheelGen3Finish {
  const normalized: ClickWheelGen3Finish =
    finish === 'official-white'
      ? 'official-white'
      : finish === 'white'
        ? 'white'
        : 'black';
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (targetStorage) {
    try {
      targetStorage.setItem(CLICK_WHEEL_GEN3_FINISH_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }
  return normalized;
}

export function normalizeNanoColor(raw?: string | null): NanoColorwayId {
  const found = IPOD_NANO_7_COLORS.find((c) => c.id === raw);
  return found ? found.id : 'blue';
}

export function getNanoColorSpec(colorId?: NanoColorwayId | string | null): NanoColorwaySpec {
  const normalized = normalizeNanoColor(colorId);
  return IPOD_NANO_7_COLORS.find((c) => c.id === normalized) ?? IPOD_NANO_7_COLORS[2];
}

export function loadSavedNanoColor(storage?: Pick<Storage, 'getItem'> | null): NanoColorwayId {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return 'blue';
  try {
    return normalizeNanoColor(targetStorage.getItem(CLICK_WHEEL_NANO_COLOR_STORAGE_KEY));
  } catch {
    return 'blue';
  }
}

export function saveNanoColor(
  colorId: NanoColorwayId,
  storage?: Pick<Storage, 'setItem'> | null
): NanoColorwayId {
  const normalized = normalizeNanoColor(colorId);
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (targetStorage) {
    try {
      targetStorage.setItem(CLICK_WHEEL_NANO_COLOR_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }
  return normalized;
}

/**
 * Snaps a mechanical scroll wheel rotation angle cleanly onto the nearest 15-degree detent.
 */
export function computeMechanicalWheelDetentSnapDeg(
  angleDeg: number,
  detentDeg = CLICK_WHEEL_TICK_DEGREES
): number {
  if (!Number.isFinite(angleDeg)) return 0;
  const safeDetent = Math.max(1, Math.abs(detentDeg || CLICK_WHEEL_TICK_DEGREES));
  return Math.round(angleDeg / safeDetent) * safeDetent;
}

/**
 * Steps angular inertia velocity forward for Gen 1 mechanical scroll wheel release glide.
 */
export function stepMechanicalWheelInertia(
  velocityDegPerSec: number,
  dtSec: number
): { nextVelocityDegPerSec: number; deltaDeg: number; settled: boolean } {
  if (!Number.isFinite(velocityDegPerSec) || !Number.isFinite(dtSec) || dtSec <= 0) {
    return { nextVelocityDegPerSec: 0, deltaDeg: 0, settled: true };
  }
  const clampedDt = Math.min(0.05, Math.max(0.001, dtSec));
  const clampedVel = Math.max(-720, Math.min(720, velocityDegPerSec));
  const deltaDeg = clampedVel * clampedDt;
  const decay = Math.exp(-clampedDt * 7.5);
  const nextVelocityDegPerSec = clampedVel * decay;
  const settled = Math.abs(nextVelocityDegPerSec) < 16;
  return {
    nextVelocityDegPerSec: settled ? 0 : nextVelocityDegPerSec,
    deltaDeg,
    settled,
  };
}

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/**
 * Converts an RGBA buffer into crisp 1-bit Bayer 4x4 ordered-dithered bitmap pixels
 * (strictly two output colors: monochrome LCD foreground or background).
 */
export function ditherRgbPixelsTo1BitRgba(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number,
  fgRgba: readonly [number, number, number, number] = [24, 34, 21, 255],
  bgRgba: readonly [number, number, number, number] = [194, 210, 180, 255]
): Uint8ClampedArray {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const out = new Uint8ClampedArray(safeW * safeH * 4);
  for (let y = 0; y < safeH; y++) {
    const row = BAYER_4X4[y & 3];
    for (let x = 0; x < safeW; x++) {
      const idx = (y * safeW + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const threshold = (row[x & 3] + 0.5) / 16;
      const tone = luma >= threshold ? bgRgba : fgRgba;
      out[idx] = tone[0];
      out[idx + 1] = tone[1];
      out[idx + 2] = tone[2];
      out[idx + 3] = tone[3];
    }
  }
  return out;
}

/**
 * Computes dock icon hover magnification scale:
 * ~1.4x hovered item, ~1.15x immediate neighbors, 1.0x all others.
 */
export function computeMonitorDockIconScale(
  index: number,
  hoveredIndex: number | null
): number {
  if (hoveredIndex === null || !Number.isFinite(hoveredIndex) || hoveredIndex < 0) {
    return 1;
  }
  const dist = Math.abs(index - hoveredIndex);
  if (dist === 0) return 1.4;
  if (dist === 1) return 1.15;
  return 1;
}

export const CLICK_WHEEL_DOCK_HEIGHT_RATIO = 0.3;
export const CLICK_WHEEL_MOBILE_DOCK_HEIGHT_RATIO = 0.34;
export const IMAC_2011_CHIN_HEIGHT_RATIO = 0.14;

/**
 * Computes the bottom Hi-Fi speaker dock height:
 * - Desktop: occupies strictly 30% of the lower stage height
 * - Mobile portrait: slightly taller bottom-locked dock for ergonomics
 */
export function computeSpeakerDockStageHeight(
  stageHeightPx: number,
  isMobilePortrait = false
): number {
  const safeH = Number.isFinite(stageHeightPx) && stageHeightPx > 0 ? stageHeightPx : 680;
  const ratio = isMobilePortrait
    ? CLICK_WHEEL_MOBILE_DOCK_HEIGHT_RATIO
    : CLICK_WHEEL_DOCK_HEIGHT_RATIO;
  return Math.max(isMobilePortrait ? 210 : 120, Math.round(safeH * ratio));
}

/**
 * Computes the internal 30-pin white plastic dock adapter collar width inside the fixed Hi-Fi dock
 * so it wraps snugly around whichever generation (Classic, 1st Gen, 4th Gen, or slender Nano) is docked.
 */
export function computeDockAdapterCollarWidthPx(
  chassisWidthPx: number,
  dockScale = 1
): number {
  const safeW = Number.isFinite(chassisWidthPx) && chassisWidthPx > 0 ? chassisWidthPx : 196;
  const safeScale = Number.isFinite(dockScale) && dockScale > 0.2 ? dockScale : 1;
  return Math.round(safeW / safeScale + 14);
}

export interface ImacChinOverlapMetrics {
  imacTopPx: number;
  imacWidthPx: number;
  imacScreenHeightPx: number;
  imacChinHeightPx: number;
  imacTotalHeightPx: number;
  playerTopPx: number;
  chinOverlapPx: number;
}

/**
 * Calculates 2011 iMac placement & chin proportions (14% aluminum bottom chin) so the
 * docked iPod's top edge sits cleanly right near the bottom edge of the iMac display
 * (overlapping the aluminum chin cleanly) without vertical page overflow.
 */
export function computeImacChinOverlapLayout(
  stageWidthPx: number,
  stageHeightPx: number,
  dockHeightPx: number,
  chassisHeightPx: number,
  cradleLipOverlapPx: number,
  isMobilePortrait = false
): ImacChinOverlapMetrics {
  const safeW = Math.max(300, stageWidthPx || 1280);
  const safeH = Math.max(420, stageHeightPx || 820);
  const playerTopPx = Math.max(12, safeH - dockHeightPx + cradleLipOverlapPx - chassisHeightPx);

  const maxImacW = isMobilePortrait
    ? Math.min(safeW - 18, 372)
    : Math.min(safeW * 0.64, 780);
  const imacTopPx = isMobilePortrait ? 8 : 18;

  // Target bottom edge of the 16:9 glass display near the top edge of the docked iPod so the iPod overlaps the aluminum chin cleanly without hiding the OS X Dock icons
  const targetDisplayBottomPx = Math.max(imacTopPx + 145, playerTopPx + (isMobilePortrait ? 6 : 10));
  const rawScreenH = targetDisplayBottomPx - imacTopPx;
  const widthConstrainedScreenH = Math.round(maxImacW * (9 / 16));
  const imacScreenHeightPx = Math.max(140, Math.min(rawScreenH, widthConstrainedScreenH));
  const imacWidthPx = Math.round(
    Math.min(maxImacW, Math.max(isMobilePortrait ? 280 : 480, imacScreenHeightPx * (16 / 9)))
  );
  // 14% chin of total display chassis: chin = screenH * (0.14 / 0.86)
  const imacChinHeightPx = Math.round(
    (imacScreenHeightPx * IMAC_2011_CHIN_HEIGHT_RATIO) / (1 - IMAC_2011_CHIN_HEIGHT_RATIO)
  );
  const imacTotalHeightPx = imacScreenHeightPx + imacChinHeightPx;
  const imacBottomPx = imacTopPx + imacTotalHeightPx;
  const chinOverlapPx = Math.max(0, imacBottomPx - playerTopPx);

  return {
    imacTopPx,
    imacWidthPx,
    imacScreenHeightPx,
    imacChinHeightPx,
    imacTotalHeightPx,
    playerTopPx,
    chinOverlapPx,
  };
}

export type ClickWheelUnitSwapPhase = 'docked' | 'ejecting-up' | 'docking-down';

export interface ClickWheelUnitSwapPose {
  translateYPx: number;
  scale: number;
  rotateXDeg: number;
  opacity: number;
}

/**
 * Computes smooth tactile entry and exit transforms when switching between player
 * generations or tracks within the bottom speaker dock connector.
 */
export function getClickWheelUnitSwapPose(
  phase: ClickWheelUnitSwapPhase
): ClickWheelUnitSwapPose {
  switch (phase) {
    case 'ejecting-up':
      return {
        translateYPx: -36,
        scale: 0.95,
        rotateXDeg: 2,
        opacity: 0.2,
      };
    case 'docking-down':
      return {
        translateYPx: 4,
        scale: 1.01,
        rotateXDeg: 9,
        opacity: 1,
      };
    case 'docked':
    default:
      return {
        translateYPx: 0,
        scale: 1,
        rotateXDeg: 8,
        opacity: 1,
      };
  }
}

export const CLICK_WHEEL_DOCK_FIXED_WIDTH_PX = 800;

/**
 * Computes proportional CSS scale for the fixed 800px Hi-Fi Dock only when the viewport
 * container is narrower than 808px; desktop remains strictly unscaled at 1.0 (800px exact).
 */
export function computeFixedDockResponsiveScale(
  stageWidthPx: number,
  fixedDockWidthPx = CLICK_WHEEL_DOCK_FIXED_WIDTH_PX
): number {
  const safeW = Number.isFinite(stageWidthPx) && stageWidthPx > 0 ? stageWidthPx : fixedDockWidthPx + 32;
  if (safeW >= fixedDockWidthPx + 8) return 1;
  return Number(Math.max(0.32, Math.min(1, (safeW - 12) / fixedDockWidthPx)).toFixed(4));
}

export interface ClassicMenuEntrySpec {
  id: string;
  label: string;
  targetPane?: ClickWheelPaneId;
  opensSongsSubmenu?: boolean;
  triggersShuffle?: boolean;
}

export const CLASSIC_COLOR_SPLIT_MENU: readonly ClassicMenuEntrySpec[] = [
  { id: 'music', label: 'Music', opensSongsSubmenu: true },
  { id: 'videos', label: 'Videos', targetPane: 'now-playing' },
  { id: 'photos', label: 'Photos', targetPane: 'now-playing' },
  { id: 'podcasts', label: 'Podcasts', opensSongsSubmenu: true },
  { id: 'extras', label: 'Extras', targetPane: 'lyrics' },
  { id: 'settings', label: 'Settings', targetPane: 'settings' },
  { id: 'shuffle-songs', label: 'Shuffle Songs', triggersShuffle: true },
  { id: 'now-playing', label: 'Now Playing', targetPane: 'now-playing' },
] as const;

export const GEN1_SCROLL_ROOT_MENU: readonly ClassicMenuEntrySpec[] = [
  { id: 'playlists', label: 'Playlists', opensSongsSubmenu: true },
  { id: 'artists', label: 'Artists', opensSongsSubmenu: true },
  { id: 'songs', label: 'Songs', opensSongsSubmenu: true },
  { id: 'contacts', label: 'Contacts', targetPane: 'lyrics' },
  { id: 'settings', label: 'Settings', targetPane: 'settings' },
] as const;

export const GEN2_CLICK_ROOT_MENU: readonly ClassicMenuEntrySpec[] = [
  { id: 'music', label: 'Music', opensSongsSubmenu: true },
  { id: 'extras', label: 'Extras', targetPane: 'lyrics' },
  { id: 'settings', label: 'Settings', targetPane: 'settings' },
  { id: 'shuffle-songs', label: 'Shuffle Songs', triggersShuffle: true },
  { id: 'backlight', label: 'Backlight', targetPane: 'now-playing' },
] as const;

export const MONO_CLASSIC_ROOT_MENU = GEN1_SCROLL_ROOT_MENU;

export interface AmbientFloatingCardSlot<T> {
  slotIndex: number;
  side: 'left' | 'right';
  track: T | null;
  leftPct?: number;
  rightPct?: number;
  topPct: number;
  scale: number;
  rotateDeg: number;
  zIndex: number;
  depthFactor: number;
  depthBlurPx: number;
  floatDurationSec: number;
  floatDelaySec: number;
}

/**
 * Balanced 7-card side matrix (4 left, 3 right, strictly 0 top cards above the docked iPod)
 * so the 2011 iMac screen & aluminum chin remain crisp and completely unobstructed.
 */
const EXPANDED_AMBIENT_CARD_SLOT_GEOMETRY: ReadonlyArray<{
  side: 'left' | 'right';
  leftPct?: number;
  rightPct?: number;
  topPct: number;
  scale: number;
  rotateDeg: number;
  zIndex: number;
  depthFactor: number;
  depthBlurPx: number;
  floatDurationSec: number;
  floatDelaySec: number;
}> = [
  // 8 cards distributed across the open workspace & right-stage upper/flank perimeter
  { side: 'left', leftPct: 2.2, topPct: 8.5, scale: 1.02, rotateDeg: -4.2, zIndex: 28, depthFactor: 1.25, depthBlurPx: 0, floatDurationSec: 5.8, floatDelaySec: 0 },
  { side: 'left', leftPct: 14.5, topPct: 6.2, scale: 0.91, rotateDeg: 3.4, zIndex: 21, depthFactor: 0.75, depthBlurPx: 0.4, floatDurationSec: 6.7, floatDelaySec: -1.4 },
  { side: 'left', leftPct: 1.5, topPct: 26.0, scale: 0.96, rotateDeg: -2.8, zIndex: 26, depthFactor: 1.05, depthBlurPx: 0.2, floatDurationSec: 6.1, floatDelaySec: -2.6 },
  { side: 'left', leftPct: 1.8, topPct: 44.5, scale: 0.89, rotateDeg: 2.9, zIndex: 23, depthFactor: 0.85, depthBlurPx: 0.4, floatDurationSec: 7.1, floatDelaySec: -3.2 },
  { side: 'left', leftPct: 2.4, topPct: 63.0, scale: 0.94, rotateDeg: -3.5, zIndex: 24, depthFactor: 0.95, depthBlurPx: 0.3, floatDurationSec: 6.3, floatDelaySec: -1.8 },
  { side: 'left', leftPct: 1.4, topPct: 80.5, scale: 0.88, rotateDeg: 3.1, zIndex: 22, depthFactor: 0.78, depthBlurPx: 0.5, floatDurationSec: 6.9, floatDelaySec: -2.9 },
  { side: 'left', leftPct: 58.5, topPct: 10.0, scale: 0.93, rotateDeg: -2.6, zIndex: 25, depthFactor: 1.1, depthBlurPx: 0.2, floatDurationSec: 5.9, floatDelaySec: -0.7 },
  { side: 'left', leftPct: 57.8, topPct: 78.5, scale: 0.9, rotateDeg: 2.4, zIndex: 23, depthFactor: 0.88, depthBlurPx: 0.3, floatDurationSec: 6.5, floatDelaySec: -2.2 },
  // 6 cards distributed across the right stage perimeter surrounding the active iPod
  { side: 'right', rightPct: 24.5, topPct: 7.5, scale: 0.95, rotateDeg: -3.8, zIndex: 25, depthFactor: 1.02, depthBlurPx: 0.2, floatDurationSec: 6.2, floatDelaySec: -0.5 },
  { side: 'right', rightPct: 3.4, topPct: 8.2, scale: 0.94, rotateDeg: 4.1, zIndex: 24, depthFactor: 0.95, depthBlurPx: 0.3, floatDurationSec: 6.4, floatDelaySec: -0.9 },
  { side: 'right', rightPct: 1.8, topPct: 31.5, scale: 1.04, rotateDeg: -3.1, zIndex: 29, depthFactor: 1.32, depthBlurPx: 0, floatDurationSec: 5.5, floatDelaySec: -2.1 },
  { side: 'right', rightPct: 2.2, topPct: 55.5, scale: 0.91, rotateDeg: 2.6, zIndex: 22, depthFactor: 0.82, depthBlurPx: 0.4, floatDurationSec: 7.0, floatDelaySec: -3.4 },
  { side: 'right', rightPct: 23.8, topPct: 81.0, scale: 0.96, rotateDeg: -2.9, zIndex: 26, depthFactor: 1.08, depthBlurPx: 0.1, floatDurationSec: 6.0, floatDelaySec: -1.3 },
  { side: 'right', rightPct: 3.0, topPct: 80.5, scale: 0.92, rotateDeg: 3.3, zIndex: 24, depthFactor: 0.92, depthBlurPx: 0.3, floatDurationSec: 6.8, floatDelaySec: -2.7 },
];

export const FLOATING_PLAYLIST_CARD_TOTAL_COUNT = EXPANDED_AMBIENT_CARD_SLOT_GEOMETRY.length; // 14 cards (12–16 spec)

export const DOCK_RIGHT_UTILITY_BUTTON_IDS = ['lyrics', 'settings'] as const;
export const DOCK_UNIFORM_BUTTON_HEIGHT_PX = 36;
export const DOCK_COLORWAY_FINISH_OPTIONS: readonly ClickWheelGen3Finish[] = [
  'official-white',
  'white',
  'black',
] as const;
export const DOCK_SIDE_SLIT_HEIGHT_RATIO = 0.5;
export const IMAC_DOCK_APP_IDS = ['finder', 'launchpad', 'youtube', 'spotify', 'prefs'] as const;

/**
 * Deterministic-yet-varied pseudo-random index picker seeded by playlist ID/length so
 * all 14 floating vertical cards drawn from the playlist remain stable during track progress.
 */
function pickRandomFloatingTracks<T extends { id: string }>(
  tracks: readonly T[],
  activeTrackId?: string | null,
  seedOffset = 0,
  totalCount = FLOATING_PLAYLIST_CARD_TOTAL_COUNT
): Array<T | null> {
  if (tracks.length === 0) {
    return Array.from({ length: totalCount }, () => null);
  }
  const activeIdx = activeTrackId ? tracks.findIndex((t) => t.id === activeTrackId) : -1;
  const pool = [...tracks];

  // Deterministic Fisher-Yates keyed by playlist composition + seedOffset
  let seed = (tracks.length * 2654435761 + seedOffset * 97531) >>> 0;
  for (let i = 0; i < Math.min(tracks.length, 6); i++) {
    const idStr = tracks[i].id;
    for (let c = 0; c < idStr.length; c++) {
      seed = (seed * 33 + idStr.charCodeAt(c)) >>> 0;
    }
  }

  for (let i = pool.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  if (activeIdx >= 0) {
    const activeItem = tracks[activeIdx];
    const rest = pool.filter((t) => t.id !== activeItem.id);
    const ordered = [activeItem, ...rest];
    return Array.from({ length: totalCount }, (_, i) => ordered[i % ordered.length]);
  }

  return Array.from({ length: totalCount }, (_, i) => pool[i % pool.length]);
}

/**
 * Populates the workspace surrounding the iPod and iMac with 14 floating vertical song cards
 * (within the 12–16 cards requirement) in organic, randomized 2D/3D screen coordinates.
 */
export function buildAmbientFloatingCardSlots<T extends { id: string }>(
  tracks: readonly T[],
  activeTrackId?: string | null,
  seedOffset = 0
): Array<AmbientFloatingCardSlot<T>> {
  const chosen = pickRandomFloatingTracks(
    tracks,
    activeTrackId,
    seedOffset,
    EXPANDED_AMBIENT_CARD_SLOT_GEOMETRY.length
  );
  return EXPANDED_AMBIENT_CARD_SLOT_GEOMETRY.map((geom, slotIndex) => ({
    slotIndex,
    ...geom,
    track: chosen[slotIndex] ?? null,
  }));
}

export interface CardParallaxPose {
  translateXPx: number;
  translateYPx: number;
  translateZPx: number;
  rotateXDeg: number;
  rotateYDeg: number;
}

/**
 * Computes smooth 3D cursor-tracking parallax offsets and tilt angles for each song card
 * based on normalized stage pointer coordinates (cursorNormX, cursorNormY in [-1, 1])
 * and per-card Z-depth velocity factor.
 */
export function computeCardParallaxPose(
  cursorNormX: number,
  cursorNormY: number,
  depthFactor: number,
  maxTiltDeg = 9
): CardParallaxPose {
  const nx = Number.isFinite(cursorNormX) ? Math.max(-1, Math.min(1, cursorNormX)) : 0;
  const ny = Number.isFinite(cursorNormY) ? Math.max(-1, Math.min(1, cursorNormY)) : 0;
  const depth = Number.isFinite(depthFactor) ? Math.max(0.25, Math.min(2, depthFactor)) : 1;
  const safeTilt = Number.isFinite(maxTiltDeg) ? Math.max(0, Math.min(20, maxTiltDeg)) : 9;

  return {
    translateXPx: Number((nx * 18 * depth).toFixed(2)),
    translateYPx: Number((ny * 14 * depth).toFixed(2)),
    translateZPx: Number(((depth - 0.65) * 28).toFixed(1)),
    rotateXDeg: Number((-ny * safeTilt * Math.min(1.25, depth)).toFixed(2)),
    rotateYDeg: Number((nx * safeTilt * Math.min(1.25, depth)).toFixed(2)),
  };
}

export const APPLE_STUDIO_RADIAL_GRADIENT =
  'radial-gradient(circle at 50% 35%, #F7F8FA 0%, #E5E7EB 55%, #CFD3D9 100%)';

export const APPLE_AQUA_ACTIVE_BLUE_HEX = '#007AFF';

export type ClickWheelMusicMenuLevel = 'root' | 'music-hub' | 'playlists' | 'artists' | 'songs';
export type ClickWheelNowPlayingMode = 'default' | 'scrub' | 'volume' | 'rating';

export interface IpodMusicHubEntrySpec {
  id: 'playlists' | 'artists' | 'songs' | 'now-playing';
  label: string;
}

export const IPOD_MUSIC_HUB_MENU: readonly IpodMusicHubEntrySpec[] = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'artists', label: 'Artists' },
  { id: 'songs', label: 'Songs' },
  { id: 'now-playing', label: 'Now Playing' },
] as const;

export function cycleNowPlayingCenterMode(
  current: ClickWheelNowPlayingMode
): ClickWheelNowPlayingMode {
  switch (current) {
    case 'default':
      return 'scrub';
    case 'scrub':
      return 'volume';
    case 'volume':
      return 'rating';
    case 'rating':
    default:
      return 'default';
  }
}

export const IPOD_REAL_LIFE_ASPECT_RATIO = 0.608; // 61.8mm / 103.5mm true-to-life chassis ratio (W / H)
export const IPOD_NANO_ASPECT_RATIO = 0.43; // Slender 38.7mm / 90.7mm iPod Nano ratio (W / H)

export interface AsymmetricDesktopWorkspaceMetrics {
  leftStageWidthPx: number;
  leftStageWidthRatio: number;
  rightStageWidthPx: number;
  brandHeaderTopPx: number;
  brandHeaderHeightPx: number;
  chassisW: number;
  chassisH: number;
  chassisAspectRatio: number;
  screenW: number;
  imacTopPx: number;
  imacWidthPx: number;
  imacScreenHeightPx: number;
  imacChinHeightPx: number;
  imacTotalHeightPx: number;
  imacStandHeightPx: number;
  dockW: number;
  dockH: number;
  dockScale: number;
  adapterCollarWidthPx: number;
}

/**
 * Computes the Swapped Asymmetric Split-Stage Desktop & Landscape Workspace Layout:
 * - Left Stage (`62%–68%` of viewport width): Top 2011 Apple iMac + Taller Apple iPod Hi-Fi Speaker Dock directly below.
 * - Right Stage: Active iPod unit centered (`0.608 / 1` standard, `0.43 / 1` Nano), surrounded by opaque solid-white mini iPods.
 */
export function computeAsymmetricDesktopWorkspaceLayout(
  stageWidthPx: number,
  stageHeightPx: number,
  generation: ClickWheelGenerationId = 'gen3'
): AsymmetricDesktopWorkspaceMetrics {
  const safeW = Math.max(768, stageWidthPx || 1440);
  const safeH = Math.max(540, stageHeightPx || 900);

  const brandHeaderTopPx = 8;
  const brandHeaderHeightPx = 0;

  // Left stage occupies 65% of viewport width (strictly within 62%–68%)
  const leftStageWidthRatio = 0.65;
  const leftStageWidthPx = Math.round(safeW * leftStageWidthRatio);
  const rightStageWidthPx = Math.max(260, safeW - leftStageWidthPx);

  // Right stage iPod unit: locked real-life aspect ratio (0.608 / 1 standard, 0.43 / 1 Nano)
  const effectiveAspectWOverH =
    generation === 'nano' ? IPOD_NANO_ASPECT_RATIO : IPOD_REAL_LIFE_ASPECT_RATIO;
  const maxRightIpodH = Math.max(290, Math.min(436, Math.round(safeH * 0.52)));
  const maxRightIpodW = Math.max(150, Math.min(265, rightStageWidthPx - 64));
  const rawChassisH = Math.min(maxRightIpodH, Math.round(maxRightIpodW / effectiveAspectWOverH));
  const chassisH = Math.max(260, rawChassisH);
  const chassisW = Math.max(122, Math.round(chassisH * effectiveAspectWOverH));
  const chassisAspectRatio = Number((chassisW / chassisH).toFixed(3));
  const screenWidthFactor = generation === 'nano' ? 0.90 : 0.875;
  const screenW = Math.floor((chassisW * screenWidthFactor) / 2) * 2;

  // Left stage vertical budget: Enlarged Hi-Fi Dock height (+22–28%) + Top 2011 iMac fit 100% within safeH
  const dockH = Math.max(192, Math.min(252, Math.round(safeH * 0.27)));
  const dockW = CLICK_WHEEL_DOCK_FIXED_WIDTH_PX;
  const maxLeftDockW = leftStageWidthPx - 28;
  const dockScale = Number(Math.max(0.56, Math.min(1, maxLeftDockW / dockW)).toFixed(4));
  const adapterCollarWidthPx = computeDockAdapterCollarWidthPx(chassisW, 1);

  const imacTopPx = 20;
  const imacStandHeightPx = 44;
  const availImacTotalH = Math.max(230, safeH - imacTopPx - dockH - imacStandHeightPx - 22);
  const availImacScreenH = Math.round(availImacTotalH * (1 - IMAC_2011_CHIN_HEIGHT_RATIO));
  const maxImacWFromLeftStage = Math.min(leftStageWidthPx - 24, 920);
  const widthFromScreenH = Math.round(availImacScreenH * (16 / 9));

  const imacWidthPx = Math.max(430, Math.min(maxImacWFromLeftStage, widthFromScreenH));
  const imacScreenHeightPx = Math.round(imacWidthPx * (9 / 16));
  const imacChinHeightPx = Math.round(
    (imacScreenHeightPx * IMAC_2011_CHIN_HEIGHT_RATIO) / (1 - IMAC_2011_CHIN_HEIGHT_RATIO)
  );
  const imacTotalHeightPx = imacScreenHeightPx + imacChinHeightPx;

  return {
    leftStageWidthPx,
    leftStageWidthRatio,
    rightStageWidthPx,
    brandHeaderTopPx,
    brandHeaderHeightPx,
    chassisW,
    chassisH,
    chassisAspectRatio,
    screenW,
    imacTopPx,
    imacWidthPx,
    imacScreenHeightPx,
    imacChinHeightPx,
    imacTotalHeightPx,
    imacStandHeightPx,
    dockW,
    dockH,
    dockScale,
    adapterCollarWidthPx,
  };
}

export interface MobileZeroScrollStackedMetrics {
  topBarReservePx: number;
  imacWidthPx: number;
  imacScreenHeightPx: number;
  imacChinHeightPx: number;
  imacTotalHeightPx: number;
  imacStandHeightPx: number;
  leftRailWidthPx: number;
  ipodWidthPx: number;
  ipodHeightPx: number;
  ipodAspectRatio: number;
  ipodHorizontalMarginPx: number;
  ipodScreenWidthPx: number;
  dockOuterWidthPx: number;
  slimDockHeightPx: number;
  controlSliderHeightPx: number;
  playlistStripHeightPx: number;
  imacAndIpodCombinedHeightPx: number;
  fitsSimultaneouslyWithoutScroll: boolean;
}

/**
 * Computes Mobile Vertical Portrait (`max-width: 767px`) Overhauled Layout:
 * 1. Top: Enlarged 2011 Apple iMac (~94% of viewport width)
 * 2. Lower Stage Row (`flex-row`):
 *    - Left (`66px` rail): Compact stacked Gen buttons, Finish/Nano swatches, Lyrics/Settings & Vol
 *    - Right (`flex-1`): Centered iPod locked to real-life proportions (`0.608 / 1` standard, `0.43 / 1` Nano)
 */
export function computeMobileZeroScrollStackedLayout(
  stageWidthPx: number,
  stageHeightPx: number,
  hideBoxArt = false,
  generation: ClickWheelGenerationId = 'gen3'
): MobileZeroScrollStackedMetrics {
  const safeW = Math.max(320, Math.min(767, stageWidthPx || 390));
  const safeH = Math.max(640, stageHeightPx || 844);

  const topBarReservePx = 8;
  const slimDockHeightPx = 0;
  const controlSliderHeightPx = 68; // Compact switcher/control array + 24px bottom clearance below iPod
  const leftRailWidthPx = 0;
  const playlistStripHeightPx = hideBoxArt ? 0 : 0;
  const verticalGapsTotalPx = 20;

  // Enlarge 2011 iMac to fill ~94% of mobile viewport width cleanly
  const imacWidthPx = Math.round(safeW * 0.94);
  const imacScreenHeightPx = Math.round(imacWidthPx * (9 / 16));
  const imacChinHeightPx = Math.round(
    (imacScreenHeightPx * IMAC_2011_CHIN_HEIGHT_RATIO) / (1 - IMAC_2011_CHIN_HEIGHT_RATIO)
  );
  const imacTotalHeightPx = imacScreenHeightPx + imacChinHeightPx;
  const imacStandHeightPx = 12;

  const remainingForIpod = Math.max(
    236,
    safeH -
      topBarReservePx -
      imacTotalHeightPx -
      imacStandHeightPx -
      controlSliderHeightPx -
      verticalGapsTotalPx
  );

  const effectiveRatio =
    generation === 'nano' ? IPOD_NANO_ASPECT_RATIO : IPOD_REAL_LIFE_ASPECT_RATIO;
  const rightAvailW = Math.max(220, safeW - 24);
  const maxAllowedIpodW =
    generation === 'nano'
      ? Math.max(140, Math.min(rightAvailW - 12, 206))
      : Math.max(180, Math.min(rightAvailW - 12, 276));
  const heightConstrainedByWidth = Math.floor(maxAllowedIpodW / effectiveRatio);
  const ipodHeightPx = Math.max(236, Math.min(remainingForIpod, heightConstrainedByWidth, 450));
  const ipodWidthPx = Math.round(ipodHeightPx * effectiveRatio);
  const dockOuterWidthPx = ipodWidthPx;
  const ipodAspectRatio = Number((ipodWidthPx / ipodHeightPx).toFixed(3));
  const ipodHorizontalMarginPx = Math.max(12, Math.round((safeW - ipodWidthPx) / 2));
  const screenWidthFactor = generation === 'nano' ? 0.90 : 0.875;
  const ipodScreenWidthPx = Math.floor((ipodWidthPx * screenWidthFactor) / 2) * 2;

  const imacAndIpodCombinedHeightPx =
    topBarReservePx + imacTotalHeightPx + imacStandHeightPx + ipodHeightPx + controlSliderHeightPx + 10;

  return {
    topBarReservePx,
    imacWidthPx,
    imacScreenHeightPx,
    imacChinHeightPx,
    imacTotalHeightPx,
    imacStandHeightPx,
    leftRailWidthPx,
    ipodWidthPx,
    ipodHeightPx,
    ipodAspectRatio,
    ipodHorizontalMarginPx,
    ipodScreenWidthPx,
    dockOuterWidthPx,
    slimDockHeightPx,
    controlSliderHeightPx,
    playlistStripHeightPx,
    imacAndIpodCombinedHeightPx,
    fitsSimultaneouslyWithoutScroll: imacAndIpodCombinedHeightPx <= safeH,
  };
}

export type IpodScaleMode = 'actual' | 'fill';

export const IPOD_SCALE_MODE_STORAGE_KEY = 'maxyoutify_cw_scale_mode_v1';

/**
 * Real-life physical 6th Gen iPod Classic chassis: 61.8mm × 103.5mm (aspect ratio ~0.608 : 1).
 * Calibrated CSS pixel baseline at standard reference viewing distance.
 */
export const IPOD_ACTUAL_PHYSICAL_CHASSIS = {
  widthMm: 61.8,
  heightMm: 103.5,
  aspectRatio: IPOD_REAL_LIFE_ASPECT_RATIO,
  desktopActualHeightPx: 348,
  desktopActualWidthPx: 212,
  mobileActualHeightPx: 296,
  mobileActualWidthPx: 180,
} as const;

export function toggleIpodScaleMode(current: IpodScaleMode): IpodScaleMode {
  return current === 'actual' ? 'fill' : 'actual';
}

export interface IpodScaledDimensions {
  mode: IpodScaleMode;
  widthPx: number;
  heightPx: number;
  screenWidthPx: number;
  scaleFactor: number;
  aspectRatio: number;
}

/**
 * Computes permanent large showcase iPod scale across desktop & mobile vertical views,
 * strictly enforcing `0.608 / 1` for Classic/Gen1/Gen4 and slender `0.43 / 1` for Nano.
 */
export function computeIpodScaledDimensions(
  _mode: IpodScaleMode,
  stageWidthPx: number,
  stageHeightPx: number,
  isMobilePortrait = false,
  generation: ClickWheelGenerationId = 'gen3',
  hideBoxArt = false
): IpodScaledDimensions {
  const safeW = Math.max(320, stageWidthPx || (isMobilePortrait ? 390 : 1440));
  const safeH = Math.max(480, stageHeightPx || (isMobilePortrait ? 844 : 900));
  const aspectWOverH =
    generation === 'nano' ? IPOD_NANO_ASPECT_RATIO : IPOD_REAL_LIFE_ASPECT_RATIO;

  const actualMaxH = isMobilePortrait
    ? Math.min(IPOD_ACTUAL_PHYSICAL_CHASSIS.mobileActualHeightPx, Math.round(safeH * 0.36))
    : Math.min(IPOD_ACTUAL_PHYSICAL_CHASSIS.desktopActualHeightPx, Math.round(safeH * 0.44));
  const actualH = Math.max(248, actualMaxH);

  if (isMobilePortrait) {
    const mobileStacked = computeMobileZeroScrollStackedLayout(safeW, safeH, hideBoxArt, generation);
    const fillW = mobileStacked.ipodWidthPx;
    const fillH = mobileStacked.ipodHeightPx;
    const screenWidthPx = mobileStacked.ipodScreenWidthPx;
    return {
      mode: 'fill',
      widthPx: fillW,
      heightPx: fillH,
      screenWidthPx,
      scaleFactor: Number((fillH / actualH).toFixed(3)),
      aspectRatio: Number((fillW / fillH).toFixed(3)),
    };
  }

  const rightColumnW = Math.max(280, Math.round(safeW * 0.35) - 36);
  const desktopMaxH = Math.max(actualH + 56, Math.min(590, Math.round(safeH * (hideBoxArt ? 0.78 : 0.64))));
  const fillH = Math.min(desktopMaxH, Math.floor(rightColumnW / aspectWOverH));
  const fillW = Math.round(fillH * aspectWOverH);
  const screenWidthFactor = generation === 'nano' ? 0.90 : 0.875;
  const screenWidthPx = Math.floor((fillW * screenWidthFactor) / 2) * 2;

  return {
    mode: 'fill',
    widthPx: fillW,
    heightPx: fillH,
    screenWidthPx,
    scaleFactor: Number((fillH / actualH).toFixed(3)),
    aspectRatio: Number((fillW / fillH).toFixed(3)),
  };
}

/**
 * PART 3.5: 3D Orbiting Playlist Cards (Matched Corner Radius `border-radius: 9px`, Slow Elliptical Orbits, Zero Collision)
 */
export const VERTICAL_PLAYLIST_CARD_SPEC = {
  aspectRatioW: 0.608,
  aspectRatioH: 1,
  aspectRatioCss: '0.608 / 1',
  borderRadiusPx: 7,
  artworkBorderRadiusPx: 5,
  cardWidthPx: 34,
  cardHeightPx: 56,
  scalePct: 50,
  hasMiniClickWheel: false,
} as const;

export interface OrbitingCard3DPose {
  slotIndex: number;
  orbitPeriodSec: number;
  phaseRad: number;
  translateXPx: number;
  translateYPx: number;
  translateZPx: number;
  rotateXDeg: number;
  rotateYDeg: number;
  rotateZDeg: number;
  scale: number;
  blurPx: number;
  zIndex: number;
  isBehindIpod: boolean;
}

/**
 * Computes a serene, continuous 3D elliptical orbital trajectory (28s–55s per full revolution) around
 * the active iPod hardware unit with zero collision/bounce physics.
 * Dynamically drives z-index, perspective scale (0.78 at rear apogee to 1.04 at foreground perigee),
 * and atmospheric blur (0px in foreground to 2.5px at rear apogee).
 */
export function computeOrbitingVerticalCard3DPose(
  slotIndex: number,
  elapsedSec: number,
  totalCards = FLOATING_PLAYLIST_CARD_TOTAL_COUNT
): OrbitingCard3DPose {
  const idx = Math.max(0, Math.floor(Number.isFinite(slotIndex) ? slotIndex : 0));
  const count = Math.max(1, Math.floor(Number.isFinite(totalCards) ? totalCards : 14));
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;

  // Each card receives a distinct orbital period strictly within 28s to 55s
  const orbitPeriodSec = Number((28 + ((idx * 11) % 28)).toFixed(1)); // 28s .. 55s
  const initialPhaseRad = (idx / count) * Math.PI * 2 + (idx % 3) * 0.42;
  const angularVelocity = (Math.PI * 2) / orbitPeriodSec;
  const direction = idx % 2 === 0 ? 1 : -1;
  const theta = initialPhaseRad + t * angularVelocity * direction;

  // Elliptical radii (rx, ry, rz) & orbital inclination pitch
  const rx = 185 + (idx % 5) * 28;
  const rz = 160 + (idx % 4) * 25;
  const inclinationAmpY = 48 + (idx % 6) * 18;
  const verticalWaveDrift = Math.sin(t * 0.35 + idx * 1.1) * 14;

  const translateXPx = Number((Math.cos(theta) * rx).toFixed(2));
  const translateZPx = Number((Math.sin(theta) * rz).toFixed(2));
  const translateYPx = Number(
    (Math.sin(theta * 1.5 + idx * 0.7) * inclinationAmpY + verticalWaveDrift).toFixed(2)
  );

  // Normalized depth in [-1 (far behind iPod), +1 (closest foreground)]
  const depthNorm = Math.sin(theta);
  // Perspective scale: 0.78 at rear apogee (-1) up to 1.04 at foreground perigee (+1)
  const scale = Number((0.91 + depthNorm * 0.13).toFixed(3));
  // Subtle depth-of-field blur: 0px in foreground (+1) to 2.5px at rear apogee (-1)
  const blurPx = Number((Math.max(0, ((1 - depthNorm) * 0.5) * 2.5)).toFixed(2));

  // iPod chassis sits at z-index 30; cards behind iPod get z-index 15..27, foreground flank cards get 32..38
  const isBehindIpod = depthNorm < 0.15;
  const zIndex = isBehindIpod
    ? Math.max(15, Math.min(27, Math.round(21 + depthNorm * 6)))
    : Math.max(32, Math.min(38, Math.round(32 + depthNorm * 6)));

  const rotateYDeg = Number((-Math.cos(theta) * 14).toFixed(2));
  const rotateXDeg = Number((Math.sin(theta) * 6).toFixed(2));
  const rotateZDeg = Number((Math.sin(theta + idx) * 2.8).toFixed(2));

  return {
    slotIndex: idx,
    orbitPeriodSec,
    phaseRad: Number((theta % (Math.PI * 2)).toFixed(3)),
    translateXPx,
    translateYPx,
    translateZPx,
    rotateXDeg,
    rotateYDeg,
    rotateZDeg,
    scale,
    blurPx,
    zIndex,
    isBehindIpod,
  };
}

export interface FloatingVerticalCardBouncePose {
  slotIndex: number;
  translateXPx: number;
  translateYPx: number;
  rotateDeg: number;
  scale: number;
  reboundImpulse01: number;
}

/**
 * Computes an independent zero-gravity floating & soft elastic collision-bounce trajectory for each
 * of the 14 vertical playlist cards so every card moves with its own velocity vector, rotational drift,
 * and elastic repulsion off the iPod chassis, Hi-Fi dock, screen boundaries, and neighboring cards.
 */
export function computeFloatingVerticalCardBouncePose(
  slotIndex: number,
  elapsedSec: number,
  audioEnergy01 = 0
): FloatingVerticalCardBouncePose {
  const idx = Math.max(0, Math.floor(Number.isFinite(slotIndex) ? slotIndex : 0));
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  const energy = Number.isFinite(audioEnergy01) ? Math.max(0, Math.min(1, audioEnergy01)) : 0;

  // Unique irrational-ratio frequencies & phases per card slot so 14 cards never move in lockstep
  const freqX = 0.64 + (idx % 7) * 0.17 + Math.floor(idx / 7) * 0.11;
  const freqY = 0.88 + (idx % 5) * 0.21 + Math.floor(idx / 5) * 0.13;
  const phaseX = idx * 1.41;
  const phaseY = idx * 2.19;

  // Triangle-wave folded elastic boundary bounce + neighbor collision repulsion harmonic
  const rawSinX = Math.sin(t * freqX + phaseX);
  const rawCosY = Math.cos(t * freqY + phaseY);
  const elasticFoldX = Math.asin(Math.max(-0.98, Math.min(0.98, rawSinX))) * (2 / Math.PI);
  const elasticFoldY = Math.acos(Math.max(-0.98, Math.min(0.98, rawCosY))) * (2 / Math.PI) - 1;

  // Soft inter-card and chassis collision deflection pulse
  const collisionHarmonic = Math.sin(t * (freqX + freqY) * 0.85 + idx * 0.93);
  const reboundImpulse01 = Number(Math.max(0, Math.abs(collisionHarmonic) - 0.65).toFixed(3));

  const ampX = 7.5 + (idx % 4) * 2.2 + energy * 4.0;
  const ampY = 9.0 + (idx % 5) * 2.0 + energy * 5.2;

  const translateXPx = Number(
    ((elasticFoldX * 0.78 + 0.22 * collisionHarmonic) * ampX).toFixed(2)
  );
  const translateYPx = Number(
    ((elasticFoldY * 0.78 - 0.22 * collisionHarmonic) * ampY).toFixed(2)
  );
  const rotateDeg = Number(
    (
      Math.sin(t * (0.52 + (idx % 6) * 0.13) + phaseX) * (2.8 + energy * 1.8) +
      reboundImpulse01 * (idx % 2 === 0 ? 1.8 : -1.8)
    ).toFixed(2)
  );
  const scale = Number((1 + energy * 0.028 * Math.abs(Math.sin(t * 2.4 + idx))).toFixed(3));

  return {
    slotIndex: idx,
    translateXPx,
    translateYPx,
    rotateDeg,
    scale,
    reboundImpulse01,
  };
}

/**
 * 1.2 Naturally Hanging & Waving EarPods (No Wires Blocking the Front Speaker Grille):
 * - Anchors the classic white wired Apple EarPods from the top-side outer edges of the Hi-Fi dock
 *   (outside the center charcoal speaker grille `x: 230..570`) so the front grille is 100% unobstructed.
 * - The EarPod earpieces themselves hang downward naturally in open space at the bottom of their
 *   vertical stems and swing with continuous pendulum and spring-wave physics in rhythm with bass.
 */
export interface EarPodHangingCablePose {
  leftCordPath: string;
  rightCordPath: string;
  mergedStemPath: string;
  leftEarPodX: number;
  leftEarPodY: number;
  rightEarPodX: number;
  rightEarPodY: number;
  leftPendulumDeg: number;
  rightPendulumDeg: number;
  leftBudOffsetY: number;
  rightBudOffsetY: number;
  pendulumSwayPx: number;
  frontGrilleUnobstructed: boolean;
}

export function computeEarPodHangingCablePaths(
  elapsedSec: number,
  bassEnergy01 = 0,
  interactionImpulse01 = 0
): EarPodHangingCablePose {
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  const bass = Number.isFinite(bassEnergy01) ? Math.max(0, Math.min(1, bassEnergy01)) : 0;
  const impulse = Number.isFinite(interactionImpulse01)
    ? Math.max(0, Math.min(1, interactionImpulse01))
    : 0;

  // Pendulum swing amplitude & bass spring bounce
  const swingAmpPx = 4.5 + bass * 9.5 + impulse * 8.0;
  const leftSwayPx = Number((Math.sin(t * 2.45) * swingAmpPx).toFixed(2));
  const rightSwayPx = Number((Math.cos(t * 2.65 + 0.7) * swingAmpPx).toFixed(2));
  const bassBounceY = Number((bass * 5.2 * Math.abs(Math.sin(t * 5.4))).toFixed(2));

  // Anchored on the top-side edges outside the center charcoal speaker grille (grille is x: 235..565)
  // Left EarPod hangs down naturally in open space on the left flank (x ≈ 218, clear of grille and left pills)
  const leftAnchorX = 218;
  const leftAnchorY = 6;
  const leftEarPodX = Number((leftAnchorX + leftSwayPx).toFixed(1));
  const leftEarPodY = Number((108 + bassBounceY).toFixed(1));
  const leftCtrl1X = Number((leftAnchorX - leftSwayPx * 0.35).toFixed(1));
  const leftCtrl1Y = 40;
  const leftCtrl2X = Number((leftAnchorX + leftSwayPx * 1.15).toFixed(1));
  const leftCtrl2Y = 78;

  // Right EarPod hangs down naturally in open space on the right flank (x ≈ 582, clear of grille and right pills)
  const rightAnchorX = 582;
  const rightAnchorY = 6;
  const rightEarPodX = Number((rightAnchorX + rightSwayPx).toFixed(1));
  const rightEarPodY = Number((110 + bassBounceY * 0.92).toFixed(1));
  const rightCtrl1X = Number((rightAnchorX - rightSwayPx * 0.35).toFixed(1));
  const rightCtrl1Y = 42;
  const rightCtrl2X = Number((rightAnchorX + rightSwayPx * 1.15).toFixed(1));
  const rightCtrl2Y = 80;

  const leftCordPath = `M ${leftAnchorX} ${leftAnchorY} C ${leftCtrl1X} ${leftCtrl1Y}, ${leftCtrl2X} ${leftCtrl2Y}, ${leftEarPodX} ${leftEarPodY}`;
  const rightCordPath = `M ${rightAnchorX} ${rightAnchorY} C ${rightCtrl1X} ${rightCtrl1Y}, ${rightCtrl2X} ${rightCtrl2Y}, ${rightEarPodX} ${rightEarPodY}`;

  // Subtle top-edge feed wire tucked along the outer right rim (never crossing the front grille)
  const mergedStemPath = `M ${rightAnchorX} ${rightAnchorY} Q ${Number((rightAnchorX + 12).toFixed(1))} 2, ${Number((rightAnchorX + 26).toFixed(1))} 8`;

  const leftPendulumDeg = Number((-leftSwayPx * 1.45).toFixed(2));
  const rightPendulumDeg = Number((-rightSwayPx * 1.45).toFixed(2));

  return {
    leftCordPath,
    rightCordPath,
    mergedStemPath,
    leftEarPodX,
    leftEarPodY,
    rightEarPodX,
    rightEarPodY,
    leftPendulumDeg,
    rightPendulumDeg,
    leftBudOffsetY: bassBounceY,
    rightBudOffsetY: Number((bassBounceY * 0.92).toFixed(2)),
    pendulumSwayPx: leftSwayPx,
    frontGrilleUnobstructed: true,
  };
}

export const DEFAULT_IMAC_YOUTUBE_VIDEO_ID = 'jfKfPfyJRdk';

export function buildMutedImacYoutubeEmbedUrl(
  videoId: string,
  origin?: string,
  widgetReferrer?: string
): string {
  const cleanId = extractValidYouTubeVideoId(videoId) ?? DEFAULT_IMAC_YOUTUBE_VIDEO_ID;
  const encodedId = encodeURIComponent(cleanId);
  const resolvedOrigin =
    origin !== undefined
      ? origin
      : typeof window !== 'undefined'
        ? window.location.origin
        : '';
  const resolvedReferrer =
    widgetReferrer !== undefined
      ? widgetReferrer
      : typeof window !== 'undefined'
        ? window.location.href
        : '';
  const originParam = resolvedOrigin ? `&origin=${encodeURIComponent(resolvedOrigin)}` : '';
  const referrerParam = resolvedReferrer
    ? `&widget_referrer=${encodeURIComponent(resolvedReferrer)}`
    : '';
  return `https://www.youtube.com/embed/${encodedId}?autoplay=1&mute=1&enablejsapi=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&loop=1&playlist=${encodedId}${originParam}${referrerParam}`;
}

