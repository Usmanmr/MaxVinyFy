/**
 * Pure Hardware & Display Logic for the "2000s Sony Mini Hi-Fi Component System & Bravia LCD TV" Theme (`cd-hifi`).
 * Decouples 4-stage optical CD tray loading choreography (~1,600ms), 34%/32%/34% shelf proportions,
 * dynamic audio-reactive RGB speaker illumination, 3D rotating vertical CD tower rack physics,
 * dual-color VFD spectrum matrix math, and Sony Bravia XMB / OSD channel banner formatting from React DOM.
 */

export type CdTrayLoadingPhase =
  | 'closed-idle'
  | 'tray-opening'
  | 'disc-loading'
  | 'tray-closing'
  | 'laser-reading'
  | 'spinning-play';

export interface CdTrayLoadingTimeline {
  trayOpenEndMs: number;
  discLoadEndMs: number;
  trayCloseEndMs: number;
  laserReadEndMs: number;
}

/**
 * Multi-Stage Mechanical CD Loading & Disc Spin-Up Animation (~1,600ms):
 * - Stage 1 (0ms – 350ms): Motorized Drawer Ejection (translateZ + downward perspective tilt rotateX(18deg))
 * - Stage 2 (300ms – 750ms): Jewel Case Extraction & Disc Placement with subtle 2px damped drop bounce
 * - Stage 3 (720ms – 1,100ms): Tray Retraction closing flush with the silver faceplate
 * - Stage 4 (1,080ms – 1,600ms): Clamping arm lock, crimson laser diode flash & 0 RPM -> high-RPM spin-up
 */
export const CD_LOADING_TIMELINE_MS: CdTrayLoadingTimeline = {
  trayOpenEndMs: 350,
  discLoadEndMs: 750,
  trayCloseEndMs: 1100,
  laserReadEndMs: 1600,
};

/**
 * Exact Three-Column Proportions & Hardware Geometry (Reference: D41F7A83-9035-4A8B-A350-76ACDC996D5B.png)
 */
export const CD_HIFI_SYSTEM_PROPORTIONS = {
  leftSpeakerWidthPct: 34,
  centerReceiverWidthPct: 32,
  rightSpeakerWidthPct: 34,
  hornWaveguideHeightPct: 12,
  mainSpeakerScaleFactor: 0.7,
  centerDiscDiameterPct: 84,
  auxDriversCountPerSide: 3,
  wooferDiameterPct: 82,
  bassReflexPortDiameterPct: 22,
  masterVolumeKnobDiameterPct: 36,
  masterVolumeWellDiameterPct: 56,
} as const;

export const CD_JEWEL_CASE_SPEC = {
  spineWidthPx: 12,
  pullOutTranslateZPx: 28,
  pullOutTranslateXPx: 16,
  acrylicGlareGradient:
    'linear-gradient(125deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 38%, transparent 55%, rgba(255,255,255,0.18) 100%)',
} as const;

export type CdRgbLightingPreset = 'BEAT_SPECTRUM' | 'SOLID_NEON' | 'BREATHING_PULSE';

export const CD_RGB_NEON_COLORS = [
  '#00F0FF', // Neon Cyan
  '#FF007F', // Neon Magenta
  '#9D00FF', // Electric Violet
  '#00FF88', // Neon Emerald
] as const;

export interface CdSpeakerRgbGlowState {
  leftRingHex: string;
  rightRingHex: string;
  leftPortHex: string;
  rightPortHex: string;
  ringGlowOpacity: number;
  portGlowOpacity: number;
  leftConeScale: number;
  rightConeScale: number;
  leftDustCapOffsetPx: number;
  rightDustCapOffsetPx: number;
  bassEnergy01: number;
  presetLabel: string;
}

export function getNextCdRgbPreset(current: CdRgbLightingPreset): CdRgbLightingPreset {
  if (current === 'BEAT_SPECTRUM') return 'SOLID_NEON';
  if (current === 'SOLID_NEON') return 'BREATHING_PULSE';
  return 'BEAT_SPECTRUM';
}

export function formatCdRgbPresetLabel(preset: CdRgbLightingPreset): string {
  switch (preset) {
    case 'BEAT_SPECTRUM':
      return 'Beat-Sync Spectrum';
    case 'SOLID_NEON':
      return 'Solid Neon';
    case 'BREATHING_PULSE':
      return 'Breathing Pulse';
  }
}

/**
 * Computes real-time audio-reactive RGB LED illumination for the left/right main woofer bezels
 * and dual lower bass-reflex port tunnels, paired with physical cone excursion (scale 1.0 to 1.07).
 */
export function computeCdSpeakerRgbGlow(
  leftVu01: number,
  rightVu01: number,
  currentSec: number,
  preset: CdRgbLightingPreset,
  grooveBassBoost: boolean,
  isPlaying: boolean
): CdSpeakerRgbGlowState {
  const safeL = Number.isFinite(leftVu01) ? Math.max(0, Math.min(1, leftVu01)) : 0;
  const safeR = Number.isFinite(rightVu01) ? Math.max(0, Math.min(1, rightVu01)) : 0;
  const sec = Number.isFinite(currentSec) && currentSec >= 0 ? currentSec : 0;
  const boostFactor = grooveBassBoost ? 1.25 : 1.0;

  const bassEnergy01 = isPlaying
    ? Math.max(0.08, Math.min(1, ((safeL * 0.55 + safeR * 0.45) * boostFactor)))
    : 0.12;

  // Physical cone excursion: scale(1.0 to 1.07)
  const leftConeScale = isPlaying
    ? Number((1 + Math.min(0.07, safeL * 0.056 * boostFactor)).toFixed(4))
    : 1;
  const rightConeScale = isPlaying
    ? Number((1 + Math.min(0.07, safeR * 0.056 * boostFactor)).toFixed(4))
    : 1;

  const leftDustCapOffsetPx = isPlaying ? Number((safeL * 2.8 * boostFactor).toFixed(2)) : 0;
  const rightDustCapOffsetPx = isPlaying ? Number((safeR * 2.8 * boostFactor).toFixed(2)) : 0;

  let leftRingHex: string = CD_RGB_NEON_COLORS[0];
  let rightRingHex: string = CD_RGB_NEON_COLORS[1];
  let leftPortHex: string = CD_RGB_NEON_COLORS[2];
  let rightPortHex: string = CD_RGB_NEON_COLORS[3];
  let ringGlowOpacity = 0.35;
  let portGlowOpacity = 0.3;

  if (preset === 'BEAT_SPECTRUM') {
    const cycleIdx = Math.floor(sec * 2 + (bassEnergy01 > 0.62 ? 1 : 0)) % CD_RGB_NEON_COLORS.length;
    leftRingHex = CD_RGB_NEON_COLORS[cycleIdx];
    rightRingHex = CD_RGB_NEON_COLORS[(cycleIdx + 1) % CD_RGB_NEON_COLORS.length];
    leftPortHex = CD_RGB_NEON_COLORS[(cycleIdx + 2) % CD_RGB_NEON_COLORS.length];
    rightPortHex = CD_RGB_NEON_COLORS[(cycleIdx + 3) % CD_RGB_NEON_COLORS.length];
    ringGlowOpacity = isPlaying
      ? Number(Math.min(0.96, 0.34 + bassEnergy01 * 0.62).toFixed(3))
      : 0.28;
    portGlowOpacity = isPlaying
      ? Number(Math.min(0.92, 0.28 + bassEnergy01 * 0.64).toFixed(3))
      : 0.22;
  } else if (preset === 'SOLID_NEON') {
    leftRingHex = '#00F0FF';
    rightRingHex = '#00F0FF';
    leftPortHex = '#FF007F';
    rightPortHex = '#FF007F';
    ringGlowOpacity = isPlaying
      ? Number(Math.min(0.92, 0.52 + bassEnergy01 * 0.38).toFixed(3))
      : 0.42;
    portGlowOpacity = isPlaying
      ? Number(Math.min(0.88, 0.46 + bassEnergy01 * 0.38).toFixed(3))
      : 0.36;
  } else {
    // BREATHING_PULSE
    const breath01 = 0.5 + 0.5 * Math.sin(sec * 1.8);
    const colorIdx = Math.floor(sec * 0.5) % CD_RGB_NEON_COLORS.length;
    leftRingHex = CD_RGB_NEON_COLORS[colorIdx];
    rightRingHex = CD_RGB_NEON_COLORS[colorIdx];
    leftPortHex = CD_RGB_NEON_COLORS[(colorIdx + 2) % CD_RGB_NEON_COLORS.length];
    rightPortHex = CD_RGB_NEON_COLORS[(colorIdx + 2) % CD_RGB_NEON_COLORS.length];
    ringGlowOpacity = Number((0.26 + breath01 * 0.62).toFixed(3));
    portGlowOpacity = Number((0.22 + breath01 * 0.58).toFixed(3));
  }

  return {
    leftRingHex,
    rightRingHex,
    leftPortHex,
    rightPortHex,
    ringGlowOpacity,
    portGlowOpacity,
    leftConeScale,
    rightConeScale,
    leftDustCapOffsetPx,
    rightDustCapOffsetPx,
    bassEnergy01: Number(bassEnergy01.toFixed(3)),
    presetLabel: formatCdRgbPresetLabel(preset),
  };
}

export interface CdTrayStagePose {
  phase: CdTrayLoadingPhase;
  /** 0 = fully retracted inside deck, 1 = fully extended forward toward user */
  trayExtension01: number;
  /** Downward perspective tilt of the open motorized drawer (0deg to 18deg) */
  trayTiltDeg: number;
  /** 0 = disc inside jewel rack, 1 = disc glided into tray */
  discFlightProgress01: number;
  /** Subtle 2px damped drop bounce when disc settles onto tray guide pins */
  discDropBouncePx: number;
  /** 0 = disc hovering / loading, 1 = disc seated on spindle hub */
  discSeated01: number;
  /** 0 = clamper raised, 1 = magnetic spindle clamper locked down */
  magneticClamper01: number;
  /** 0 = laser off, 1 = 780nm red optical laser focus pulse active */
  laserFocusPulse01: number;
  /** Whether the OPEN/CLOSE button is mechanically depressed during ejection */
  openCloseBtnDepressed: boolean;
  /** Current disc spin period in seconds (0 = stationary) */
  discSpinDurationSec: number;
  /** VFD status text shown during loading sequence */
  vfdStatusLabel: string;
}

/**
 * Resolves the 4-stage mechanical CD tray loading pose (~1,600ms) for a given elapsed millisecond timestamp.
 */
export function getCdTrayStagePose(
  elapsedMs: number | null,
  isPlaying: boolean,
  isStandby: boolean,
  timeline: CdTrayLoadingTimeline = CD_LOADING_TIMELINE_MS
): CdTrayStagePose {
  if (isStandby) {
    return {
      phase: 'closed-idle',
      trayExtension01: 0,
      trayTiltDeg: 0,
      discFlightProgress01: 0,
      discDropBouncePx: 0,
      discSeated01: 1,
      magneticClamper01: 1,
      laserFocusPulse01: 0,
      openCloseBtnDepressed: false,
      discSpinDurationSec: 0,
      vfdStatusLabel: 'STANDBY',
    };
  }

  if (elapsedMs === null || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return {
      phase: isPlaying ? 'spinning-play' : 'closed-idle',
      trayExtension01: 0,
      trayTiltDeg: 0,
      discFlightProgress01: 1,
      discDropBouncePx: 0,
      discSeated01: 1,
      magneticClamper01: 1,
      laserFocusPulse01: isPlaying ? 0.35 : 0,
      openCloseBtnDepressed: false,
      discSpinDurationSec: isPlaying ? 0.42 : 0,
      vfdStatusLabel: isPlaying ? 'PLAYING' : 'TOC READY',
    };
  }

  // Stage 1 (0ms – 350ms): Motorized Drawer Ejection (slides forward + rotateX(18deg) tilt)
  if (elapsedMs <= timeline.trayOpenEndMs) {
    const progress = Math.max(0, Math.min(1, elapsedMs / timeline.trayOpenEndMs));
    return {
      phase: 'tray-opening',
      trayExtension01: Number(progress.toFixed(3)),
      trayTiltDeg: Number((progress * 18).toFixed(2)),
      discFlightProgress01: elapsedMs >= 300 ? Number(((elapsedMs - 300) / 450).toFixed(3)) : 0,
      discDropBouncePx: 0,
      discSeated01: 0,
      magneticClamper01: 0,
      laserFocusPulse01: 0,
      openCloseBtnDepressed: true,
      discSpinDurationSec: 0,
      vfdStatusLabel: 'OPEN',
    };
  }

  // Stage 2 (350ms – 750ms, overlapping from 300ms): Jewel Case Extraction & Disc Placement + 2px damped bounce
  if (elapsedMs <= timeline.discLoadEndMs) {
    const span = Math.max(1, timeline.discLoadEndMs - timeline.trayOpenEndMs);
    const progress = Math.max(0, Math.min(1, (elapsedMs - timeline.trayOpenEndMs) / span));
    const flightProgress = Math.max(0, Math.min(1, (elapsedMs - 300) / 450));
    // Subtle 2px damped drop bounce during the last 30% of Stage 2 as disc settles onto guide pins
    const bouncePhase = progress > 0.7 ? (progress - 0.7) / 0.3 : 0;
    const discDropBouncePx =
      bouncePhase > 0
        ? Number((Math.sin(bouncePhase * Math.PI * 2) * 2 * (1 - bouncePhase * 0.5)).toFixed(2))
        : 0;
    return {
      phase: 'disc-loading',
      trayExtension01: 1,
      trayTiltDeg: 18,
      discFlightProgress01: Number(flightProgress.toFixed(3)),
      discDropBouncePx,
      discSeated01: Number(progress.toFixed(3)),
      magneticClamper01: 0,
      laserFocusPulse01: 0,
      openCloseBtnDepressed: false,
      discSpinDurationSec: 0,
      vfdStatusLabel: 'DISC LOAD',
    };
  }

  // Stage 3 (720ms/750ms – 1,100ms): Tray Retraction closing flush with faceplate
  if (elapsedMs <= timeline.trayCloseEndMs) {
    const span = Math.max(1, timeline.trayCloseEndMs - timeline.discLoadEndMs);
    const progress = Math.max(0, Math.min(1, (elapsedMs - timeline.discLoadEndMs) / span));
    const ext = 1 - progress;
    return {
      phase: 'tray-closing',
      trayExtension01: Number(ext.toFixed(3)),
      trayTiltDeg: Number((ext * 18).toFixed(2)),
      discFlightProgress01: 1,
      discDropBouncePx: 0,
      discSeated01: 1,
      magneticClamper01: Number((progress * 0.65).toFixed(3)),
      laserFocusPulse01: elapsedMs >= 1080 ? 0.55 : 0,
      openCloseBtnDepressed: false,
      discSpinDurationSec: 0,
      vfdStatusLabel: 'CLOSING',
    };
  }

  // Stage 4 (1,080ms/1,100ms – 1,600ms): Clamping arm lock, crimson laser diode flash & spin-up acceleration
  if (elapsedMs <= timeline.laserReadEndMs) {
    const span = Math.max(1, timeline.laserReadEndMs - timeline.trayCloseEndMs);
    const progress = Math.max(0, Math.min(1, (elapsedMs - timeline.trayCloseEndMs) / span));
    const pulse = Number((0.45 + 0.55 * Math.sin(progress * Math.PI * 3)).toFixed(3));
    // Smooth spin-up from 1.25s period down to high-RPM 0.42s period
    const spinSec = Number((1.25 - progress * 0.83).toFixed(2));
    return {
      phase: 'laser-reading',
      trayExtension01: 0,
      trayTiltDeg: 0,
      discFlightProgress01: 1,
      discDropBouncePx: 0,
      discSeated01: 1,
      magneticClamper01: Number(Math.min(1, 0.65 + progress * 0.35).toFixed(3)),
      laserFocusPulse01: Math.max(0.25, pulse),
      openCloseBtnDepressed: false,
      discSpinDurationSec: spinSec,
      vfdStatusLabel: 'READING',
    };
  }

  return {
    phase: isPlaying ? 'spinning-play' : 'closed-idle',
    trayExtension01: 0,
    trayTiltDeg: 0,
    discFlightProgress01: 1,
    discDropBouncePx: 0,
    discSeated01: 1,
    magneticClamper01: 1,
    laserFocusPulse01: isPlaying ? 0.35 : 0,
    openCloseBtnDepressed: false,
    discSpinDurationSec: isPlaying ? 0.42 : 0,
    vfdStatusLabel: isPlaying ? '00:01' : 'TOC READY',
  };
}

/**
 * Interactive 3D Rotating Vertical CD Tower Rack Physics & Slot Snapping
 */
export interface CdTowerRackSlotPose {
  slotIndex: number;
  isSelected: boolean;
  isHovered: boolean;
  pullOutTranslateZPx: number;
  pullOutTranslateXPx: number;
  shelfRotateYDeg: number;
  elevationShadow: string;
}

export interface RotatingCdTowerRackState {
  normalizedRotationDeg: number;
  snappedRotationDeg: number;
  frontFacingFacetIndex: number;
  slots: CdTowerRackSlotPose[];
}

export function snapCdTowerRotationDeg(rotationDeg: number, snapStepDeg = 45): number {
  const safeDeg = Number.isFinite(rotationDeg) ? rotationDeg : 0;
  const safeStep = Number.isFinite(snapStepDeg) && snapStepDeg > 0 ? snapStepDeg : 45;
  return Math.round(safeDeg / safeStep) * safeStep;
}

export function computeRotatingCdTowerRackState(
  rotationDeg: number,
  slotCount: number,
  activeSlotIndex: number,
  hoveredSlotIndex: number | null
): RotatingCdTowerRackState {
  const safeRotation = Number.isFinite(rotationDeg) ? rotationDeg : 0;
  const normalizedRotationDeg = ((safeRotation % 360) + 360) % 360;
  const snappedRotationDeg = snapCdTowerRotationDeg(safeRotation, 45);
  const frontFacingFacetIndex = Math.round(normalizedRotationDeg / 45) % 8;
  const count = Math.max(0, Math.min(64, Math.floor(slotCount)));

  const slots: CdTowerRackSlotPose[] = Array.from({ length: count }, (_, idx) => {
    const isSelected = idx === activeSlotIndex;
    const isHovered = idx === hoveredSlotIndex;
    const pulledOut = isHovered || isSelected;
    // Slight helical / carousel facet angle damped by tower rotation for clear front readability
    const spiralOffsetDeg = Math.sin((safeRotation * Math.PI) / 180 + idx * 0.45) * 14;
    return {
      slotIndex: idx,
      isSelected,
      isHovered,
      pullOutTranslateZPx: isHovered
        ? CD_JEWEL_CASE_SPEC.pullOutTranslateZPx
        : isSelected
          ? 20
          : 0,
      pullOutTranslateXPx: isHovered
        ? CD_JEWEL_CASE_SPEC.pullOutTranslateXPx
        : isSelected
          ? 11
          : 0,
      shelfRotateYDeg: Number(spiralOffsetDeg.toFixed(2)),
      elevationShadow: pulledOut
        ? '0 14px 28px rgba(0, 0, 0, 0.88), 0 0 14px rgba(0, 240, 255, 0.32)'
        : '0 4px 10px rgba(0, 0, 0, 0.65)',
    };
  });

  return {
    normalizedRotationDeg: Number(normalizedRotationDeg.toFixed(2)),
    snappedRotationDeg,
    frontFacingFacetIndex,
    slots,
  };
}

export interface CdVfdSpectrumBar {
  bandIndex: number;
  freqLabel: string;
  /** Number of lit cyan segments (0..10) */
  litSegments: number;
  /** Peak-hold amber/red cap segment index (0..10) */
  peakSegment: number;
}

export const CD_VFD_BAND_LABELS: readonly string[] = [
  '63Hz',
  '125Hz',
  '250Hz',
  '500Hz',
  '1kHz',
  '2kHz',
  '4kHz',
  '8kHz',
  '12kHz',
  '16kHz',
  'L-PK',
] as const;

/**
 * Computes 11-band Vacuum Fluorescent Display (VFD) spectrum bars with peak-hold caps.
 */
export function computeCdVfdSpectrumBars(
  leftVu01: number,
  rightVu01: number,
  currentSec: number,
  grooveBassBoost: boolean,
  isPlaying: boolean
): CdVfdSpectrumBar[] {
  const safeL = Number.isFinite(leftVu01) ? Math.max(0, Math.min(1, leftVu01)) : 0;
  const safeR = Number.isFinite(rightVu01) ? Math.max(0, Math.min(1, rightVu01)) : 0;
  const sec = Number.isFinite(currentSec) ? Math.max(0, currentSec) : 0;

  return CD_VFD_BAND_LABELS.map((freqLabel, idx) => {
    if (!isPlaying) {
      return {
        bandIndex: idx,
        freqLabel,
        litSegments: 1,
        peakSegment: 1,
      };
    }

    const baseEnergy = idx < 5 ? safeL : safeR;
    const bassLift = grooveBassBoost && idx <= 2 ? 0.24 : 0;
    const harmonicWave =
      0.18 * Math.sin(sec * (3.1 + idx * 0.65) + idx * 0.9) +
      0.1 * Math.cos(sec * (1.9 + idx * 0.4));
    const raw01 = Math.max(0.12, Math.min(1, baseEnergy * 0.78 + bassLift + harmonicWave));
    const litSegments = Math.max(1, Math.min(10, Math.round(raw01 * 10)));
    const peakSegment = Math.min(10, litSegments + (raw01 > 0.45 ? 1 : 0));

    return {
      bandIndex: idx,
      freqLabel,
      litSegments,
      peakSegment,
    };
  });
}

export interface KevlarWooferExcursion {
  leftConeScale: number;
  rightConeScale: number;
  leftDustCapOffsetPx: number;
  rightDustCapOffsetPx: number;
  portAirflowOpacity: number;
}

/**
 * Computes real-time Kevlar cone excursion scale and bass-reflex port pulse for the left & right speakers.
 */
export function computeKevlarSpeakerExcursion(
  leftVu01: number,
  rightVu01: number,
  grooveBassBoost: boolean,
  isPlaying: boolean
): KevlarWooferExcursion {
  if (!isPlaying) {
    return {
      leftConeScale: 1,
      rightConeScale: 1,
      leftDustCapOffsetPx: 0,
      rightDustCapOffsetPx: 0,
      portAirflowOpacity: 0.12,
    };
  }

  const safeL = Number.isFinite(leftVu01) ? Math.max(0, Math.min(1, leftVu01)) : 0;
  const safeR = Number.isFinite(rightVu01) ? Math.max(0, Math.min(1, rightVu01)) : 0;
  const boostFactor = grooveBassBoost ? 1.25 : 1.0;

  const leftConeScale = Number((1 + Math.min(0.07, safeL * 0.056 * boostFactor)).toFixed(4));
  const rightConeScale = Number((1 + Math.min(0.07, safeR * 0.056 * boostFactor)).toFixed(4));
  const leftDustCapOffsetPx = Number((safeL * 2.8 * boostFactor).toFixed(2));
  const rightDustCapOffsetPx = Number((safeR * 2.8 * boostFactor).toFixed(2));
  const portAirflowOpacity = Number(
    Math.min(0.92, 0.18 + ((safeL + safeR) * 0.5 * 0.65 * boostFactor)).toFixed(2)
  );

  return {
    leftConeScale,
    rightConeScale,
    leftDustCapOffsetPx,
    rightDustCapOffsetPx,
    portAirflowOpacity,
  };
}

export type CdPresetEqMode = 'ROCK' | 'POP' | 'JAZZ' | 'FLAT';

export function getNextCdPresetEq(current: CdPresetEqMode): CdPresetEqMode {
  const order: CdPresetEqMode[] = ['ROCK', 'POP', 'JAZZ', 'FLAT'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

export type CdVfdDisplayMode = 'SPECTRUM' | 'TIME_REMAIN' | 'LYRICS_MATRIX';

export interface CdVfdFilamentState {
  /** Opacity multiplier for VFD vacuum tube segments (0.58 in Dimmer/Night mode, 1.0 in Normal, 0.72 during transient dip) */
  filamentOpacity: number;
  /** Subtle warm filament grid glow intensity */
  gridWarmthOpacity: number;
  /** Label for active VFD brightness state */
  dimLabel: 'BRIGHT' | 'DIMMER' | 'DIP';
}

/**
 * Computes Vacuum Fluorescent Display (VFD) filament brightness, night-mode dimmer attenuation,
 * and transient 140ms voltage dip when high-draw deck motors or relays engage.
 */
export function computeCdVfdFilamentState(
  nightMode: boolean,
  isTransientDipActive: boolean
): CdVfdFilamentState {
  if (isTransientDipActive) {
    return {
      filamentOpacity: nightMode ? 0.48 : 0.72,
      gridWarmthOpacity: 0.25,
      dimLabel: 'DIP',
    };
  }
  if (nightMode) {
    return {
      filamentOpacity: 0.62,
      gridWarmthOpacity: 0.14,
      dimLabel: 'DIMMER',
    };
  }
  return {
    filamentOpacity: 1,
    gridWarmthOpacity: 0.2,
    dimLabel: 'BRIGHT',
  };
}

export type BraviaOsdBannerKind =
  | 'CHANNEL'
  | 'VOLUME'
  | 'INPUT'
  | 'WIDE'
  | 'MUTING'
  | 'PIC_OFF'
  | 'NETFLIX'
  | 'DISPLAY';

export interface BraviaOsdBannerState {
  kind: BraviaOsdBannerKind;
  primaryText: string;
  secondaryText: string;
  badgeText: string;
  title: string;
  subtitle: string;
  badge: string;
}

/**
 * Formats authentic 2000s Sony Bravia green/amber OSD overlay strings triggered by the RM-YD028 remote.
 */
export function formatBraviaOsdBanner(
  kind: BraviaOsdBannerKind,
  options: {
    channelIndex?: number;
    channelNumber?: number;
    channelLabel?: string;
    volumePct?: number;
    isMuted?: boolean;
    inputLabel?: string;
    wideModeLabel?: string;
    displayModeLabel?: string;
    picOff?: boolean;
    trackTitle?: string;
  }
): BraviaOsdBannerState {
  const rawCh = options.channelNumber ?? (options.channelIndex ?? 0) + 1;
  const chNum = Math.max(1, rawCh).toString().padStart(2, '0');
  const vol = Math.max(0, Math.min(100, Math.round(options.volumePct ?? 80)));

  const buildState = (
    primaryText: string,
    secondaryText: string,
    badgeText: string
  ): BraviaOsdBannerState => ({
    kind,
    primaryText,
    secondaryText,
    badgeText,
    title: primaryText,
    subtitle: secondaryText,
    badge: badgeText,
  });

  switch (kind) {
    case 'CHANNEL':
      return buildState(
        `CH ${chNum} · HDMI 1`,
        (options.trackTitle || options.channelLabel || '1080p COMPONENT SYNC').slice(0, 36),
        '1080p'
      );
    case 'VOLUME':
      return buildState(`VOLUME ${vol}`, 'STEREO · OPTICAL PCM', `${vol}%`);
    case 'MUTING':
      return buildState(
        options.isMuted ? 'MUTING' : `VOLUME ${vol}`,
        options.isMuted ? 'AUDIO OUTPUT MUTED' : 'AUDIO RESTORED',
        options.isMuted ? 'MUTE' : `${vol}%`
      );
    case 'INPUT':
      return buildState(
        `INPUT: ${options.inputLabel || 'HDMI 1 (CD HI-FI)'}`,
        'BRAVIA ENGINE EX · 60Hz',
        'AV/HDMI'
      );
    case 'WIDE':
      return buildState(
        `WIDE MODE: ${options.wideModeLabel || 'FULL 16:9'}`,
        'ASPECT RATIO LOCKED',
        'WIDE'
      );
    case 'PIC_OFF':
      return buildState(
        options.picOff ? 'PICTURE OFF' : 'PICTURE ON',
        options.picOff ? 'AUDIO ONLY · BACKLIGHT MUTED' : 'BRAVIA ENGINE EX RESTORED',
        options.picOff ? 'ECO' : '1080p'
      );
    case 'NETFLIX':
      return buildState(
        'BRAVIA INTERNET VIDEO',
        (options.channelLabel || 'CINEMA 24P STREAM').slice(0, 36),
        '24p SYNC'
      );
    case 'DISPLAY':
      return buildState(
        `DISPLAY · ${options.displayModeLabel || '1080p PCM'}`,
        (options.channelLabel || 'OPTICAL DIGITAL SYNC').slice(0, 36),
        'INFO'
      );
  }
}

export function clampRemoteDragPosition(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number,
  remoteW = 186,
  remoteH = 496
): { x: number; y: number } {
  const maxX = Math.max(8, viewportW - remoteW - 8);
  const maxY = Math.max(8, viewportH - remoteH - 8);
  return {
    x: Math.max(8, Math.min(maxX, Math.round(x))),
    y: Math.max(8, Math.min(maxY, Math.round(y))),
  };
}

export const CD_FULL_WIDTH_EQ_BANDS: readonly string[] = [
  '63Hz',
  '160Hz',
  '400Hz',
  '1kHz',
  '2.5kHz',
  '6.3kHz',
  '16kHz',
] as const;

export function clampCdEqBandGainDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(-12, Math.min(12, Math.round(db * 2) / 2));
}

export function getCdEqPresetBandGainsDb(
  preset: CdPresetEqMode,
  grooveBassBoost = false
): number[] {
  const baseCurves: Record<CdPresetEqMode, number[]> = {
    ROCK: [6, 4.5, -1.5, -1, 2.5, 5, 6.5],
    POP: [-1, 2.5, 4.5, 5, 3, 1, -0.5],
    JAZZ: [4, 3, 1, 2, -1.5, 2.5, 4.5],
    FLAT: [0, 0, 0, 0, 0, 0, 0],
  };
  const curve = baseCurves[preset] || baseCurves.FLAT;
  return curve.map((gain, idx) => {
    const grooveLift = grooveBassBoost ? (idx === 0 ? 3.5 : idx === 1 ? 2.5 : idx === 6 ? 1.5 : 0) : 0;
    return clampCdEqBandGainDb(gain + grooveLift);
  });
}

