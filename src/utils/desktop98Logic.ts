export const DESKTOP_98_SPECTRUM_BAR_COUNT = 19;

export const DESKTOP_98_EQ_BAND_LABELS = [
  '60',
  '170',
  '310',
  '600',
  '1K',
  '3K',
  '6K',
  '12K',
  '14K',
  '16K',
] as const;

export type Desktop98TrackChangePhase = 'idle' | 'loading' | 'typing';

/**
 * Under 1.5s track-change choreography (< 1500ms total):
 * 1) Marquee flashes "LOADING...", spectrum collapses flat, LED time blinks 00:00 (0..360ms)
 * 2) New track's "ARTIST - TITLE *** " types itself into the marquee character-by-character (360..1100ms)
 */
export const DESKTOP_98_TRACK_CHANGE_TIMELINE_MS = {
  loadingFlashMs: 360,
  typingDurationMs: 740,
  totalMs: 1100,
} as const;

/**
 * Standard 7-segment display bitmask [a, b, c, d, e, f, g]:
 *   --a--
 *  |     |
 *  f     b
 *  |     |
 *   --g--
 *  |     |
 *  e     c
 *  |     |
 *   --d--
 */
export type SevenSegmentFlags = readonly [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];

export const SEVEN_SEGMENT_DIGIT_MAP: Record<string, SevenSegmentFlags> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '-': [false, false, false, false, false, false, true],
  ' ': [false, false, false, false, false, false, false],
};

/**
 * Returns the 4 character digits [M1, M2, S1, S2] for the 7-segment LED elapsed-time readout.
 * During the loading track-change phase, returns ['0', '0', '0', '0'].
 */
export function formatDesktop98LedDigits(
  elapsedSec: number,
  forceZero = false
): [string, string, string, string] {
  if (forceZero) {
    return ['0', '0', '0', '0'];
  }
  const safeSec = Math.max(0, Math.floor(Number.isFinite(elapsedSec) ? elapsedSec : 0));
  const mins = Math.min(99, Math.floor(safeSec / 60));
  const secs = safeSec % 60;
  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  return [mStr[0], mStr[1], sStr[0], sStr[1]];
}

/**
 * Formats the looping marquee string ("ARTIST - TITLE *** ") and handles the
 * "LOADING..." flash and character-by-character typing reveal on track changes.
 */
export function formatDesktop98MarqueeText(
  artist: string,
  title: string,
  phase: Desktop98TrackChangePhase = 'idle',
  typingProgress01 = 1
): string {
  if (phase === 'loading') {
    return 'LOADING...';
  }
  const cleanArtist = (artist || 'UNKNOWN ARTIST').trim().toUpperCase();
  const cleanTitle = (title || 'NO TRACK LOADED').trim().toUpperCase();
  const fullText = `${cleanArtist} - ${cleanTitle} *** `;

  if (phase === 'typing') {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(typingProgress01) ? typingProgress01 : 1));
    const charCount = Math.max(1, Math.ceil(fullText.length * clamped));
    return fullText.slice(0, charCount);
  }
  return fullText;
}

/**
 * Formats a playlist track row in the classic numbered green-on-black format:
 * "1. Artist - Title" and "3:11".
 */
export function formatDesktop98PlaylistEntry(
  indexZeroBased: number,
  artist: string,
  title: string,
  durationSec: number
): { numberedTitle: string; durationText: string } {
  const num = Math.max(1, Math.floor(indexZeroBased) + 1);
  const cleanArtist = (artist || 'Unknown Artist').trim();
  const cleanTitle = (title || 'Untitled').trim();
  const safeDur = Math.max(0, Math.floor(Number.isFinite(durationSec) ? durationSec : 0));
  const mins = Math.floor(safeDur / 60);
  const secs = safeDur % 60;
  return {
    numberedTitle: `${num}. ${cleanArtist} - ${cleanTitle}`,
    durationText: `${mins}:${String(secs).padStart(2, '0')}`,
  };
}

/**
 * Updates the 19-bar spectrum analyzer and falling peak-hold caps.
 * Collapses flat when paused or during the track-change loading flash.
 */
export function stepDesktop98SpectrumBars(
  prevBars: readonly number[],
  prevPeaks: readonly number[],
  isPlaying: boolean,
  isLoadingTrack: boolean,
  seedPhase: number
): { bars: number[]; peaks: number[] } {
  const count = DESKTOP_98_SPECTRUM_BAR_COUNT;
  const bars: number[] = new Array(count);
  const peaks: number[] = new Array(count);

  if (!isPlaying || isLoadingTrack) {
    for (let i = 0; i < count; i++) {
      bars[i] = 0.05;
      peaks[i] = 0.05;
    }
    return { bars, peaks };
  }

  for (let i = 0; i < count; i++) {
    const prevPeak = Number.isFinite(prevPeaks[i]) ? prevPeaks[i] : 0.1;
    // Multi-harmonic deterministic synth wave across the 19 frequency bands
    const bandWeight = 1 - Math.abs(i - 6.5) / 15.5;
    const w1 = Math.sin(seedPhase * 2.1 + i * 0.65) * 0.5 + 0.5;
    const w2 = Math.cos(seedPhase * 3.4 - i * 1.15) * 0.5 + 0.5;
    const w3 = Math.sin(seedPhase * 5.3 + i * 1.9) * 0.5 + 0.5;
    const rawLevel = (w1 * 0.45 + w2 * 0.35 + w3 * 0.2) * (0.48 + bandWeight * 0.52);
    const barLevel = Number(Math.max(0.08, Math.min(0.96, rawLevel)).toFixed(3));
    bars[i] = barLevel;

    // Peak cap rises immediately with bar or decays gradually above it
    const decayedPeak = Math.max(0.08, prevPeak - 0.035);
    peaks[i] = Number(Math.min(1, Math.max(barLevel + 0.03, decayedPeak)).toFixed(3));
  }

  return { bars, peaks };
}

/**
 * Floating Album Art Viewer mini-window in '98 Desktop Player has NO tilt physics:
 * windows do not tilt, so it always snaps/settles perfectly flat (0deg).
 */
export function calculateDesktop98HolderTiltDeg(): number {
  return 0;
}

/**
 * Deterministic decorative kbps / kHz digital stream readouts per track.
 */
export function getDesktop98BitrateAndSampleRate(trackId: string): {
  kbps: number;
  khz: number;
} {
  if (!trackId || trackId === 'standby-empty') {
    return { kbps: 128, khz: 44 };
  }
  let hash = 0;
  for (let i = 0; i < trackId.length; i++) {
    hash = (hash * 31 + trackId.charCodeAt(i)) >>> 0;
  }
  const rates = [128, 160, 192, 256, 320] as const;
  return {
    kbps: rates[hash % rates.length],
    khz: 44,
  };
}
