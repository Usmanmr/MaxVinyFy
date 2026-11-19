export const AURORA_PALETTE = {
  voidBg: '#06070C',
  glassBg: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',
  glassBlurPx: 24,
  cyan: '#4DE1FF',
  violet: '#9D7CFF',
  warmAlert: '#FFB24D',
  textPrimary: '#EAF2FF',
  textDim: '#8E9AB8',
  washLoopColors: ['#7C4DFF', '#00E5FF', '#FF4D9D'] as const,
  washOpacity: 0.06,
  washLoopSec: 30,
  ringCount: 9,
  maxParticles: 24,
  pausedDiscDimOpacity: 0.6,
  titleTrackingEm: 0.08,
  shimmerIntervalMs: 8000,
  wordMaterializeMs: 120,
  orbitPeriodSec: 2,
  playMorphMs: 200,
  parallaxMaxDeg: 6,
  idleShardSwayDeg: 2,
} as const;

export const AURORA_TRACK_CHANGE_TIMELINE_MS = {
  collapseMs: 420,
  splitMs: 780,
  totalMs: 1400,
} as const;

export const AURORA_TIME_SHEAR_MS = 440;

export interface AuroraDualAccents {
  primaryHex: string;
  secondaryHex: string;
  primaryGlowRgba: string;
  secondaryGlowRgba: string;
  primaryHue: number;
  secondaryHue: number;
}

export interface AuroraDiscRing {
  index: number;
  diameterPct: number;
  colorHex: string;
  glowRgba: string;
  opacity: number;
  spinDurationSec: number;
  directionSign: 1 | -1;
}

export interface AuroraParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  opacity: number;
  life01: number;
  accentSlot: 0 | 1;
}

export type AuroraTrackChangePhase = 'idle' | 'collapse' | 'split' | 'bloom';

export interface AuroraWordRevealToken {
  word: string;
  index: number;
  delayMs: number;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
  else if (max === gN) h = ((bN - rN) / d + 2) * 60;
  else h = ((rN - gN) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(100, s)) / 100;
  const normL = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;
  let rP = 0;
  let gP = 0;
  let bP = 0;
  if (normH < 60) [rP, gP, bP] = [c, x, 0];
  else if (normH < 120) [rP, gP, bP] = [x, c, 0];
  else if (normH < 180) [rP, gP, bP] = [0, c, x];
  else if (normH < 240) [rP, gP, bP] = [0, x, c];
  else if (normH < 300) [rP, gP, bP] = [x, 0, c];
  else [rP, gP, bP] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(rP)}${toHex(gP)}${toHex(bP)}`.toUpperCase();
}

export function auroraHexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '').replace('#', '').trim();
  const clampedAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }
  }
  return `rgba(77, 225, 255, ${clampedAlpha})`;
}

function circularHueDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(diff, 360 - diff);
}

/**
 * Extracts TWO distinct dominant luminescent accent colors from album cover RGB samples
 * (with cyan/violet holographic fallbacks when in standby or untinted covers).
 */
export function extractTwoAuroraAccentsFromRgbSamples(
  rgbSamples: Array<[number, number, number]>,
  fallbackSeed = 'aurora'
): AuroraDualAccents {
  const numBins = 18;
  const binWeights = new Array<number>(numBins).fill(0);
  const binHueSums = new Array<number>(numBins).fill(0);
  const binSatSums = new Array<number>(numBins).fill(0);

  for (const [r, g, b] of rgbSamples) {
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l < 10 || l > 90 || s < 16) continue;
    const weight = (s / 100) * (1 - Math.abs(l - 54) / 56);
    if (weight <= 0) continue;
    const binIdx = Math.floor((((h % 360) + 360) % 360) / 360 * numBins) % numBins;
    binWeights[binIdx] += weight;
    binHueSums[binIdx] += h * weight;
    binSatSums[binIdx] += s * weight;
  }

  let primaryBin = -1;
  let primaryMax = 0;
  for (let i = 0; i < numBins; i++) {
    if (binWeights[i] > primaryMax) {
      primaryMax = binWeights[i];
      primaryBin = i;
    }
  }

  if (primaryBin < 0 || primaryMax <= 0) {
    if (!fallbackSeed || fallbackSeed.startsWith('standby-empty')) {
      return {
        primaryHex: AURORA_PALETTE.cyan,
        secondaryHex: AURORA_PALETTE.violet,
        primaryGlowRgba: auroraHexToRgba(AURORA_PALETTE.cyan, 0.35),
        secondaryGlowRgba: auroraHexToRgba(AURORA_PALETTE.violet, 0.35),
        primaryHue: 190,
        secondaryHue: 256,
      };
    }
    let hash = 2166136261;
    for (let i = 0; i < fallbackSeed.length; i++) {
      hash ^= fallbackSeed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const h1 = (hash >>> 0) % 360;
    const h2 = (h1 + 78) % 360;
    const primaryHex = hslToHex(h1, 88, 66);
    const secondaryHex = hslToHex(h2, 86, 70);
    return {
      primaryHex,
      secondaryHex,
      primaryGlowRgba: auroraHexToRgba(primaryHex, 0.35),
      secondaryGlowRgba: auroraHexToRgba(secondaryHex, 0.35),
      primaryHue: h1,
      secondaryHue: h2,
    };
  }

  const primaryHue = Math.round(binHueSums[primaryBin] / binWeights[primaryBin]) % 360;
  const primarySat = Math.round(
    Math.max(78, Math.min(96, (binSatSums[primaryBin] / binWeights[primaryBin]) * 1.15))
  );

  // Find strongest secondary bin at least 28deg away in hue
  let secondaryBin = -1;
  let secondaryMax = 0;
  for (let i = 0; i < numBins; i++) {
    if (binWeights[i] <= 0) continue;
    const candidateHue = Math.round(binHueSums[i] / binWeights[i]) % 360;
    if (circularHueDistanceDeg(primaryHue, candidateHue) < 28) continue;
    if (binWeights[i] > secondaryMax) {
      secondaryMax = binWeights[i];
      secondaryBin = i;
    }
  }

  const secondaryHue =
    secondaryBin >= 0
      ? Math.round(binHueSums[secondaryBin] / binWeights[secondaryBin]) % 360
      : (primaryHue + 68) % 360;
  const secondarySat =
    secondaryBin >= 0
      ? Math.round(
          Math.max(76, Math.min(96, (binSatSums[secondaryBin] / binWeights[secondaryBin]) * 1.15))
        )
      : 88;

  const primaryHex = hslToHex(primaryHue, primarySat, 66);
  const secondaryHex = hslToHex(secondaryHue, secondarySat, 68);

  return {
    primaryHex,
    secondaryHex,
    primaryGlowRgba: auroraHexToRgba(primaryHex, 0.35),
    secondaryGlowRgba: auroraHexToRgba(secondaryHex, 0.35),
    primaryHue,
    secondaryHue,
  };
}

/**
 * Builds the 9 concentric holographic light rings (two colors alternating, inner rings brighter, inner faster).
 */
export function generateAuroraDiscRings(
  primaryHex: string,
  secondaryHex: string
): AuroraDiscRing[] {
  const count = AURORA_PALETTE.ringCount;
  return Array.from({ length: count }, (_, idx) => {
    const progress = idx / (count - 1); // 0 = innermost, 1 = outermost
    const diameterPct = Number((34 + progress * 60).toFixed(2));
    const colorHex = idx % 2 === 0 ? primaryHex : secondaryHex;
    const opacity = Number((0.92 - progress * 0.54).toFixed(3)); // inner rings noticeably brighter
    const spinDurationSec = Number((4.4 + progress * 14.6).toFixed(2)); // inner faster, outer slower
    const directionSign: 1 | -1 = idx % 2 === 0 ? 1 : -1;
    return {
      index: idx,
      diameterPct,
      colorHex,
      glowRgba: auroraHexToRgba(colorHex, Math.max(0.28, opacity * 0.55)),
      opacity,
      spinDurationSec,
      directionSign,
    };
  });
}

/**
 * Clamps mouse parallax tilt for the levitating holo-disc strictly to [-6, +6] degrees.
 */
export function computeAuroraParallaxTilt(
  normX: number,
  normY: number,
  maxDeg: number = AURORA_PALETTE.parallaxMaxDeg
): { rotateXDeg: number; rotateYDeg: number } {
  const safeMax = Math.max(0, Math.min(12, Number.isFinite(maxDeg) ? maxDeg : 6));
  const cx = Math.max(-1, Math.min(1, Number.isFinite(normX) ? normX : 0));
  const cy = Math.max(-1, Math.min(1, Number.isFinite(normY) ? normY : 0));
  return {
    rotateXDeg: Number((-cy * safeMax).toFixed(2)),
    rotateYDeg: Number((cx * safeMax).toFixed(2)),
  };
}

/**
 * Pre-allocates <= 24 transform-only drifting light particles emitted from the needle tip.
 */
export function generateAuroraParticles(count: number = AURORA_PALETTE.maxParticles): AuroraParticle[] {
  const clampedCount = Math.max(1, Math.min(AURORA_PALETTE.maxParticles, Math.floor(count)));
  return Array.from({ length: clampedCount }, (_, idx) => {
    const phase = idx / clampedCount;
    const angle = (idx * 2.39996) % (Math.PI * 2);
    const speed = 14 + (idx % 5) * 4.5;
    return {
      id: idx,
      x: Math.cos(angle) * phase * 22,
      y: Math.sin(angle) * phase * 22 - phase * 18,
      vx: Math.cos(angle) * speed * 0.45 - 6,
      vy: -Math.abs(Math.sin(angle) * speed * 0.6) - 8,
      scale: Number((0.55 + (1 - phase) * 0.7).toFixed(3)),
      opacity: Number((Math.sin(phase * Math.PI) * 0.85).toFixed(3)),
      life01: phase,
      accentSlot: (idx % 2 === 0 ? 0 : 1) as 0 | 1,
    };
  });
}

/**
 * Advances and recycles emitter particles when actively playing; preserves frozen state when paused/hidden.
 */
export function stepAuroraParticles(
  particles: AuroraParticle[],
  dtSec: number,
  isActive: boolean
): AuroraParticle[] {
  if (!isActive || !Number.isFinite(dtSec) || dtSec <= 0) {
    return particles;
  }
  const safeDt = Math.min(0.08, dtSec);
  return particles.map((p) => {
    let nextLife = p.life01 + safeDt * 0.72;
    if (nextLife >= 1) {
      nextLife = nextLife % 1;
      const spreadAngle = ((p.id * 47) % 100) / 100 * Math.PI * 0.9 - Math.PI * 0.95;
      const spd = 16 + (p.id % 4) * 5;
      return {
        ...p,
        x: Math.cos(spreadAngle) * 2,
        y: Math.sin(spreadAngle) * 2,
        vx: Math.cos(spreadAngle) * spd,
        vy: Math.sin(spreadAngle) * spd - 6,
        scale: 1.1,
        opacity: 0.9,
        life01: nextLife,
      };
    }
    const envelope = Math.sin(nextLife * Math.PI);
    return {
      ...p,
      x: Number((p.x + p.vx * safeDt).toFixed(2)),
      y: Number((p.y + p.vy * safeDt).toFixed(2)),
      scale: Number((0.45 + (1 - nextLife) * 0.75).toFixed(3)),
      opacity: Number((Math.max(0, envelope) * 0.88).toFixed(3)),
      life01: Number(nextLife.toFixed(4)),
    };
  });
}

/**
 * Magnetic tilt for the floating glass shard card while dragging toward cursor.
 */
export function calculateAuroraShardDragTilt(
  deltaX: number,
  deltaY: number,
  isDragging: boolean
): number {
  if (!isDragging) return AURORA_PALETTE.idleShardSwayDeg;
  const weighted = (Number.isFinite(deltaX) ? deltaX * 0.18 : 0) - (Number.isFinite(deltaY) ? deltaY * 0.05 : 0);
  return Number(Math.max(-9, Math.min(9, weighted)).toFixed(2));
}

/**
 * Maps elapsed time during <= 1.5s track change into collapse -> split -> bloom phases.
 */
export function getAuroraTrackChangePhase(elapsedMs: number): AuroraTrackChangePhase {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'idle';
  if (elapsedMs < AURORA_TRACK_CHANGE_TIMELINE_MS.collapseMs) return 'collapse';
  if (elapsedMs < AURORA_TRACK_CHANGE_TIMELINE_MS.splitMs) return 'split';
  if (elapsedMs < AURORA_TRACK_CHANGE_TIMELINE_MS.totalMs) return 'bloom';
  return 'idle';
}

/**
 * Splits a lyric line into word tokens staggered at 120ms/word for blur+opacity materialization.
 */
export function getAuroraWordRevealTokens(
  lineText: string,
  prefersReducedMotion = false
): AuroraWordRevealToken[] {
  const trimmed = (lineText || '').trim();
  if (!trimmed) return [];
  const words = trimmed.split(/\s+/);
  return words.map((word, index) => ({
    word,
    index,
    delayMs: prefersReducedMotion ? 0 : Math.min(index * AURORA_PALETTE.wordMaterializeMs, 960),
  }));
}

/**
 * Computes horizontal light-beam scrub bend displacement and orb position (0..100%).
 */
export function computeAuroraBeamBend(
  pointerRatio01: number,
  pointerDeltaY: number,
  isScrubbing: boolean
): { percent: number; bendDyPx: number } {
  const clampedRatio = Math.max(0, Math.min(1, Number.isFinite(pointerRatio01) ? pointerRatio01 : 0));
  const rawBend = isScrubbing ? Math.max(-8, Math.min(8, (Number.isFinite(pointerDeltaY) ? pointerDeltaY : 0) * 0.35)) : 0;
  return {
    percent: Number((clampedRatio * 100).toFixed(2)),
    bendDyPx: Number(rawBend.toFixed(2)),
  };
}

/**
 * Maps vertical light-column pointer drag ratio (0 = top, 1 = bottom) to discrete slider value.
 */
export function computeAuroraColumnDragValue(
  pointerRatio01: number,
  minVal: number,
  maxVal: number,
  step = 1
): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(pointerRatio01) ? pointerRatio01 : 0));
  const inverted = 1 - clamped; // top = max, bottom = min
  const raw = minVal + inverted * (maxVal - minVal);
  const stepped = Math.round(raw / step) * step;
  return Number(Math.max(minVal, Math.min(maxVal, stepped)).toFixed(2));
}

export type AuroraDancerPoseId =
  | 'idle-float'
  | 'beat-bop'
  | 'neon-wave'
  | 'spin-groove'
  | 'art-highfive';

export interface AuroraPixelDancerBeatState {
  pose: AuroraDancerPoseId;
  frameIndex: number;
  bounceYPx: number;
  artReachXPx: number;
  tiltDeg: number;
  glowAlpha: number;
}

/**
 * Computes real-time beat-synchronized dance frames and playful album-art interaction
 * coordinates for the holographic Pixel Neon Dancer on the Aurora stage.
 */
export function computePixelDancerBeatState(
  timeMs: number,
  bpm: number,
  audioLevel01: number,
  isPlaying: boolean,
  interactionBoost = false
): AuroraPixelDancerBeatState {
  if (!isPlaying) {
    return {
      pose: 'idle-float',
      frameIndex: 0,
      bounceYPx: 0,
      artReachXPx: 0,
      tiltDeg: 0,
      glowAlpha: 0.48,
    };
  }

  const safeTimeMs = Number.isFinite(timeMs) && timeMs >= 0 ? timeMs : 0;
  const safeBpm = Number.isFinite(bpm) ? Math.max(72, Math.min(180, bpm)) : 120;
  const safeEnergy = Number.isFinite(audioLevel01)
    ? Math.max(0.15, Math.min(1, audioLevel01))
    : 0.65;

  const beatDurationMs = 60000 / safeBpm;
  const beatCount = safeTimeMs / beatDurationMs;
  const subBeatIdx = Math.floor(beatCount * 2) % 8;
  const beatPhase = (beatCount % 1) * Math.PI * 2;

  const poses: readonly AuroraDancerPoseId[] = [
    'beat-bop',
    'neon-wave',
    'spin-groove',
    'art-highfive',
  ];
  const barIndex = Math.floor(beatCount / 4) % poses.length;
  const pose: AuroraDancerPoseId = interactionBoost ? 'art-highfive' : poses[barIndex];

  const bounceAmp = (interactionBoost ? 7.5 : 5.2) * (0.6 + safeEnergy * 0.5);
  const bounceYPx = Number((-Math.abs(Math.sin(beatPhase)) * bounceAmp).toFixed(2));
  const artReachXPx = Number(
    (
      pose === 'art-highfive'
        ? -8 - Math.abs(Math.cos(beatPhase * 0.5)) * 7
        : -Math.sin(beatPhase * 0.5) * 4.5
    ).toFixed(2)
  );
  const tiltDeg = Number((Math.sin(beatPhase * 0.5) * (interactionBoost ? 8 : 5)).toFixed(2));
  const glowAlpha = Number(Math.min(1, 0.58 + safeEnergy * 0.38).toFixed(2));

  return {
    pose,
    frameIndex: subBeatIdx,
    bounceYPx,
    artReachXPx,
    tiltDeg,
    glowAlpha,
  };
}

