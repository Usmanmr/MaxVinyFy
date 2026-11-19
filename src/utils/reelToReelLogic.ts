/**
 * Pure domain logic & compositor geometry helpers for the "Reel-to-Reel" theme.
 * Decoupled from React/DOM so every rule can be verified via node:test.
 */

export type ReelTrackChangePhase =
  | 'idle'
  | 'braking-wobble'
  | 'rewinding-tape'
  | 'swapping-reels'
  | 'resuming-play';

export const REEL_TRACK_CHANGE_TIMELINE_MS = {
  brakeWobbleEndMs: 340,
  rewindTapeEndMs: 1140,
  swapReelsEndMs: 1580,
  resumePlayEndMs: 1820,
} as const;

export interface ReelTapeRadii {
  progressRatio: number;
  /** Diameter % relative to the outer aluminum reel flange (36% = near hub, 86% = full spool). */
  supplyOuterPct: number;
  /** Diameter % relative to the outer aluminum reel flange (36% = empty core, 86% = full spool). */
  takeupOuterPct: number;
}

/**
 * Computes physically proportional wound-tape diameters for left supply reel (shrinking)
 * and right take-up reel (growing) using area conservation.
 */
export function calculateReelTapeRadii(progressRatio: number): ReelTapeRadii {
  const p = Number.isFinite(progressRatio) ? Math.max(0, Math.min(1, progressRatio)) : 0;
  const minPct = 38;
  const maxPct = 86;
  const minArea = minPct * minPct;
  const maxArea = maxPct * maxPct;

  const supplyArea = maxArea - p * (maxArea - minArea);
  const takeupArea = minArea + p * (maxArea - minArea);

  return {
    progressRatio: Number(p.toFixed(4)),
    supplyOuterPct: Number(Math.sqrt(supplyArea).toFixed(2)),
    takeupOuterPct: Number(Math.sqrt(takeupArea).toFixed(2)),
  };
}

export interface ReelRotationSpeeds {
  supplyDurationSec: number;
  takeupDurationSec: number;
  guideRollerDurationSec: number;
  timingFunction: string;
}

/**
 * Computes compositor rotation durations:
 * - Left supply reel spins slowly.
 * - Right take-up reel spins ~20% faster than supply (duration = supplyDuration / 1.2).
 * - Chrome guide rollers spin fast.
 */
export function calculateReelRotationSpeeds(
  rpm: 33 | 45,
  pitchPercent: number,
  lowPowerMode = false
): ReelRotationSpeeds {
  const clampedPitch = Number.isFinite(pitchPercent)
    ? Math.max(-12, Math.min(12, pitchPercent))
    : 0;
  const rpmMultiplier = rpm === 45 ? 1.35 : 1.0;
  const rateMultiplier = Math.max(0.5, rpmMultiplier * (1 + clampedPitch / 100));

  const supplyDurationSec = Number((4.2 / rateMultiplier).toFixed(3));
  const takeupDurationSec = Number((supplyDurationSec / 1.2).toFixed(3));
  const guideRollerDurationSec = Number((supplyDurationSec / 5.4).toFixed(3));

  let timingFunction = 'linear';
  if (lowPowerMode) {
    const steps = Math.max(8, Math.round(supplyDurationSec * 12));
    timingFunction = `steps(${steps}, end)`;
  }

  return {
    supplyDurationSec,
    takeupDurationSec,
    guideRollerDurationSec,
    timingFunction,
  };
}

export interface ReelTrackChangeStagePose {
  phase: ReelTrackChangePhase;
  supplyTransform: string;
  takeupTransform: string;
  tapePathOpacity: number;
  tapeRewindShimmer: boolean;
  rollerSpinMode: 'normal' | 'reverse-fast' | 'paused';
  showFreshReelProportions: boolean;
}

/**
 * Maps each sub-phase of the <2s reel-to-reel track change sequence to compositor transforms.
 */
export function getReelTrackChangeStagePose(
  phase: ReelTrackChangePhase
): ReelTrackChangeStagePose {
  switch (phase) {
    case 'braking-wobble':
      return {
        phase,
        supplyTransform: 'rotate(-5deg) scale(1)',
        takeupTransform: 'rotate(4deg) scale(1)',
        tapePathOpacity: 1,
        tapeRewindShimmer: false,
        rollerSpinMode: 'paused',
        showFreshReelProportions: false,
      };
    case 'rewinding-tape':
      return {
        phase,
        supplyTransform: 'rotate(2deg) scale(1)',
        takeupTransform: 'rotate(-2deg) scale(1)',
        tapePathOpacity: 0.92,
        tapeRewindShimmer: true,
        rollerSpinMode: 'reverse-fast',
        showFreshReelProportions: false,
      };
    case 'swapping-reels':
      return {
        phase,
        supplyTransform: 'scale(0.985)',
        takeupTransform: 'scale(0.985)',
        tapePathOpacity: 1,
        tapeRewindShimmer: false,
        rollerSpinMode: 'paused',
        showFreshReelProportions: true,
      };
    case 'resuming-play':
      return {
        phase,
        supplyTransform: 'rotate(0deg) scale(1)',
        takeupTransform: 'rotate(0deg) scale(1)',
        tapePathOpacity: 1,
        tapeRewindShimmer: false,
        rollerSpinMode: 'normal',
        showFreshReelProportions: true,
      };
    case 'idle':
    default:
      return {
        phase: 'idle',
        supplyTransform: 'rotate(0deg) scale(1)',
        takeupTransform: 'rotate(0deg) scale(1)',
        tapePathOpacity: 1,
        tapeRewindShimmer: false,
        rollerSpinMode: 'normal',
        showFreshReelProportions: true,
      };
  }
}

/**
 * Maps analog VU meter physics level [0.03..1.0] to needle angle in degrees:
 * - When idle (paused / standby / hidden / reduced motion), returns 0deg (centered).
 * - When active, sweeps smoothly across [-38deg .. +38deg] around center 0.
 */
export function vuLevelToNeedleAngleDeg(level: number, isActive = true): number {
  if (!isActive || !Number.isFinite(level)) {
    return 0;
  }
  const clamped = Math.max(0.03, Math.min(1, level));
  // Center 0 deg sits around 0.48 nominal signal; beats swing smoothly between -38 and +38 deg
  const normalized = (clamped - 0.03) / 0.97;
  return Number((-38 + normalized * 76).toFixed(2));
}

/**
 * Maps normalized rotary knob position [0..1] to physical pointer angle [-135deg .. +135deg].
 */
export function rotaryValueToAngleDeg(normalized: number): number {
  const safe = Number.isFinite(normalized) ? Math.max(0, Math.min(1, normalized)) : 0.5;
  return Number((-135 + safe * 270).toFixed(1));
}

/**
 * Maps pitch percent [-12..+12] to normalized rotary knob ratio [0..1] and vice versa.
 */
export function pitchPercentToNormalized(pitchPercent: number): number {
  const clamped = Number.isFinite(pitchPercent)
    ? Math.max(-12, Math.min(12, pitchPercent))
    : 0;
  return Number(((clamped + 12) / 24).toFixed(4));
}

export function normalizedToPitchPercent(normalized: number): number {
  const safe = Number.isFinite(normalized) ? Math.max(0, Math.min(1, normalized)) : 0.5;
  const rounded = Math.round(safe * 24 - 12);
  return rounded === 0 ? 0 : Math.max(-12, Math.min(12, rounded));
}

/**
 * Computes next rotary value [0..1] from EITHER vertical pointer delta (drag up increases)
 * OR circular arc drag angle around knob center, whichever feels natural to the user.
 */
export function computeRotaryDragValue(params: {
  startValue01: number;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  centerX: number;
  centerY: number;
  mode?: 'auto' | 'vertical' | 'arc';
}): number {
  const base01 = Number.isFinite(params.startValue01)
    ? Math.max(0, Math.min(1, params.startValue01))
    : 0.5;
  const dxFromCenter = params.clientX - params.centerX;
  const dyFromCenter = params.clientY - params.centerY;
  const radiusFromCenter = Math.hypot(dxFromCenter, dyFromCenter);

  const deltaX = params.clientX - params.startClientX;
  const deltaY = params.clientY - params.startClientY;

  const useArc =
    params.mode === 'arc' ||
    (params.mode !== 'vertical' && radiusFromCenter > 26 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15);

  if (useArc) {
    // 0 deg straight UP (top), -135 deg bottom-left (0), +135 deg bottom-right (1)
    const rawRad = Math.atan2(dxFromCenter, -dyFromCenter);
    const deg = (rawRad * 180) / Math.PI;
    const clampedDeg = Math.max(-135, Math.min(135, deg));
    return Number(((clampedDeg + 135) / 270).toFixed(3));
  }

  // Vertical drag: 110px upward sweep traverses 0..1 cleanly
  const next = base01 + -deltaY / 110;
  return Number(Math.max(0, Math.min(1, next)).toFixed(3));
}
