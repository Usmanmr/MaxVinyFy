export const STREAMLINE_PALETTE = {
  background: '#0F1115',
  card: '#161A20',
  rowHover: '#1D232B',
  textPrimary: '#FFFFFF',
  textSecondary: '#A7AFBC',
  textTertiary: '#5E6673',
  accentTeal: '#19C6A3',
  cardRadiusPx: 16,
  heroArtRadiusPx: 20,
  playlistRowHeightPx: 48,
  playButtonSizePx: 48,
  seekBarHeightPx: 3,
} as const;

export const STREAMLINE_TRACK_CHANGE_TIMELINE_MS = {
  crossfadeMs: 600,
  titleSlideMs: 420,
  totalMs: 750,
} as const;

export const STREAMLINE_LYRIC_TRANSITION_MS = 200;

export const STREAMLINE_CHANNEL_COUNT = 5;

export interface StreamlineKaraokeWindow {
  visibleIndices: number[];
  activeIndex: number;
}

/**
 * Computes the 3-line karaoke visible window [prev, current, next] around the active lyric index.
 * At the start of a track, shows up to [0, 1, 2]; at the end, shows up to [len-3, len-2, len-1].
 */
export function getStreamlineKaraokeWindow(
  totalLines: number,
  activeIndex: number
): StreamlineKaraokeWindow {
  const safeTotal = Math.max(0, Math.floor(totalLines));
  if (safeTotal === 0) {
    return { visibleIndices: [], activeIndex: 0 };
  }
  const clampedActive = Math.max(0, Math.min(safeTotal - 1, Math.floor(activeIndex)));
  if (safeTotal <= 3) {
    return {
      visibleIndices: Array.from({ length: safeTotal }, (_, i) => i),
      activeIndex: clampedActive,
    };
  }
  let start = clampedActive - 1;
  if (start < 0) start = 0;
  if (start + 2 >= safeTotal) start = safeTotal - 3;
  return {
    visibleIndices: [start, start + 1, start + 2],
    activeIndex: clampedActive,
  };
}

/**
 * Computes CSS translateY offset for the smooth 200ms karaoke 3-line stack so the current line sits cleanly centered.
 */
export function calculateStreamlineKaraokeTranslateY(
  viewportHeightPx: number,
  activeRowTopPx: number,
  activeRowHeightPx: number
): number {
  const vh = Number.isFinite(viewportHeightPx) ? Math.max(0, viewportHeightPx) : 0;
  const top = Number.isFinite(activeRowTopPx) ? Math.max(0, activeRowTopPx) : 0;
  const rh = Number.isFinite(activeRowHeightPx) ? Math.max(0, activeRowHeightPx) : 0;
  return Math.round(vh / 2 - (top + rh / 2));
}

/**
 * Converts a hex color like "#19C6A3" to an RGBA CSS string safely.
 */
export function hexToRgbaString(hex: string, alpha: number): string {
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
  return `rgba(25, 198, 163, ${clampedAlpha})`;
}

/**
 * Builds a blurred dominant-color ambient gradient from the current album art palette,
 * blended subtly over the #0F1115 content-first dark canvas.
 */
export function buildStreamlineAmbientGradient(
  primaryHex: string,
  lightHex?: string,
  darkHex?: string
): string {
  const primaryGlow = hexToRgbaString(primaryHex || '#19C6A3', 0.34);
  const secondaryGlow = hexToRgbaString(lightHex || primaryHex || '#275E6B', 0.22);
  const deepTint = hexToRgbaString(darkHex || primaryHex || '#161A20', 0.26);

  return [
    `radial-gradient(ellipse 68% 58% at 64% 34%, ${primaryGlow} 0%, transparent 72%)`,
    `radial-gradient(ellipse 52% 48% at 22% 72%, ${secondaryGlow} 0%, transparent 70%)`,
    `radial-gradient(ellipse 90% 80% at 50% 50%, ${deepTint} 0%, #0F1115 86%)`,
  ].join(', ');
}

/**
 * Floating glass-morphism album art card settles completely flat (0deg) on release.
 */
export function calculateStreamlineHolderSettleTiltDeg(): number {
  return 0;
}

/**
 * Computes seek bar hover preview state (clamped percent 0..100 and target second).
 */
export function computeSeekHoverPreview(
  pointerRatio01: number,
  durationSec: number
): { percent: number; targetSec: number } {
  const clampedRatio = Math.max(
    0,
    Math.min(1, Number.isFinite(pointerRatio01) ? pointerRatio01 : 0)
  );
  const safeDuration = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  return {
    percent: Number((clampedRatio * 100).toFixed(2)),
    targetSec: Math.round(clampedRatio * safeDuration),
  };
}

/**
 * Returns the rate curve steps for the Streamline DJ-brake scratch button effect.
 */
export function computeDjBrakeCurve(baseRate = 1.0): number[] {
  const safeBase = Math.max(0.5, Math.min(2.0, Number.isFinite(baseRate) ? baseRate : 1.0));
  return [
    Number((safeBase * 0.68).toFixed(3)),
    Number((safeBase * 0.42).toFixed(3)),
    Number((safeBase * 0.74).toFixed(3)),
    safeBase,
  ];
}
