export interface YouTubeGrabFrame {
  id: string;
  label: string;
  timestampSec: number;
  timestampLabel: string;
  imageUrl: string;
  caption: string;
}

export interface SyncedLyricLine {
  index: number;
  startTimeSec: number;
  endTimeSec: number;
  text: string;
}

export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  bpm: number;
  year: number;
  artworkUrl: string;
  spotifyUri?: string;
  previewAudioUrl?: string;
  youtubeVideoId: string;
  synthPreset: 'midnight-synth' | 'velvet-soul' | 'pacific-yacht' | 'cyber-electro' | 'classic-funk';
  tvFrames: YouTubeGrabFrame[];
}

export interface PlaylistPack {
  id: string;
  name: string;
  subtitle: string;
  source: 'spotify-curated' | 'spotify-live';
  spotifyPlaylistId?: string;
  tracks: TrackItem[];
}

/**
 * Formats seconds into MM:SS with tabular zero-padding.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const clamped = Math.floor(seconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Clamps a requested seek position in seconds to valid track bounds [0, durationSec].
 */
export function clampSeekTime(targetSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(targetSec)) return 0;
  return Math.max(0, Math.min(durationSec, targetSec));
}

/**
 * Computes the next track index in the queue given current index, total count, and repeat mode.
 */
export function getNextTrackIndex(
  currentIndex: number,
  totalTracks: number,
  repeatOne = false
): number {
  if (totalTracks <= 0) return 0;
  if (repeatOne) return Math.max(0, Math.min(totalTracks - 1, currentIndex));
  return (currentIndex + 1) % totalTracks;
}

/**
 * Computes a shuffled next track index distinct from currentIndex when totalTracks > 1.
 */
export function getShuffledNextTrackIndex(
  currentIndex: number,
  totalTracks: number,
  randomFraction = Math.random()
): number {
  if (totalTracks <= 1) return 0;
  const clampedRand = Math.max(0, Math.min(0.999999, randomFraction));
  const offset = 1 + Math.floor(clampedRand * (totalTracks - 1));
  return (currentIndex + offset) % totalTracks;
}

/**
 * Computes the exact tonearm angle and vinyl groove landing radius as a function of song duration and current playback time.
 * At 0:00 (0%), the stylus lands on the outer vinyl groove (6 deg, 46% radius).
 * At durationSec (100%), the stylus reaches the innermost groove right outside the center label (25 deg, 21% radius).
 */
export function calculateTonearmTracking(
  currentTimeSec: number,
  durationSec: number
): { progressRatio: number; tonearmAngleDeg: number; grooveRadiusPercent: number } {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 180;
  const clampedSec = clampSeekTime(currentTimeSec, safeDuration);
  const progressRatio = clampedSec / safeDuration;
  const tonearmAngleDeg = Number((6 + progressRatio * 19).toFixed(2));
  const grooveRadiusPercent = Number((46 - progressRatio * 25).toFixed(2));
  return { progressRatio, tonearmAngleDeg, grooveRadiusPercent };
}

/**
 * Converts a vertical range input value (where top = -12 and bottom = +12 in browser vertical-lr mode)
 * so moving the slider UP increases pitch (+12 at top) and moving DOWN decreases pitch (-12 at bottom).
 */
export function verticalSliderToPitch(rawSliderValue: number): number {
  const clamped = Math.max(-12, Math.min(12, Math.round(rawSliderValue)));
  const inverted = -clamped;
  return inverted === 0 ? 0 : inverted;
}

/**
 * Computes the thumb top percentage [8%, 92%] for the vertical pitch slider
 * so positive pitch (+12%) is at the top (8%) and negative pitch (-12%) is at the bottom (92%).
 */
export function calculatePitchThumbTopPercent(pitchPercent: number): number {
  const clamped = Math.max(-12, Math.min(12, pitchPercent));
  return Number((50 - (clamped / 12) * 42).toFixed(2));
}

/**
 * Parses standard LRC timestamped lyrics ("[mm:ss.xx] Verse line") into SyncedLyricLine items.
 */
export function parseLrcLyrics(lrcText: string, durationSec: number): SyncedLyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const rawEntries: Array<{ timeSec: number; text: string }> = [];
  const lines = lrcText.split(/\r?\n/);
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (!match) continue;
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const msStr = match[3] || '0';
    const fraction = parseInt(msStr.padEnd(3, '0'), 10) / 1000;
    const text = match[4].trim();
    if (!text) continue;
    rawEntries.push({
      timeSec: Number((mins * 60 + secs + fraction).toFixed(2)),
      text,
    });
  }

  rawEntries.sort((a, b) => a.timeSec - b.timeSec);
  const safeDuration = Math.max(30, durationSec || 180);

  return rawEntries.map((entry, idx) => {
    const nextEntry = rawEntries[idx + 1];
    return {
      index: idx,
      startTimeSec: entry.timeSec,
      endTimeSec: nextEntry ? nextEntry.timeSec : safeDuration,
      text: entry.text,
    };
  });
}

/**
 * Returns time-synced lyric verses for a track, using parsed LRC lines when available
 * or generating rhythm-matched verses synchronized across the track's duration.
 */
export function buildSyncedLyricsForTrack(
  track: { title: string; artist: string; durationSec: number },
  rawLrc?: string | null
): SyncedLyricLine[] {
  if (rawLrc) {
    const parsed = parseLrcLyrics(rawLrc, track.durationSec);
    if (parsed.length >= 3) {
      return parsed;
    }
  }

  const cleanTitle = track.title.replace(/\s*\(From.*?\)/i, '').trim() || track.title;
  const primaryArtist = track.artist.split(',')[0].trim() || track.artist;
  const safeDuration = Math.max(60, track.durationSec || 180);

  const verseTemplates = [
    `♪ Needle drops on "${cleanTitle}" — ${primaryArtist}`,
    `City lights reflecting down the midnight boulevard`,
    `Turn the analog dial up, feel the bassline hit hard`,
    `${cleanTitle} echoing through the night drive`,
    `Every rhythm locked in time, keeping the groove alive`,
    `Spinning on the platter while the neon skyline glows`,
    `${primaryArtist} riding where the warm vinyl flows`,
    `Chorus rising higher — "${cleanTitle}" on repeat`,
    `Hands on the wheel, moving to the vintage beat`,
    `Bridge drops in smooth under the amber dashboard light`,
    `One more chorus spinning through the open highway night`,
    `♪ Fade out on the inner groove — "${cleanTitle}"`,
  ];

  const count = verseTemplates.length;
  const segmentSec = safeDuration / count;

  return verseTemplates.map((text, idx) => ({
    index: idx,
    startTimeSec: Number((idx * segmentSec).toFixed(2)),
    endTimeSec: Number(((idx + 1) * segmentSec).toFixed(2)),
    text,
  }));
}

/**
 * Finds the active lyric line index being sung at currentTimeSec.
 */
export function getActiveLyricIndex(lines: SyncedLyricLine[], currentTimeSec: number): number {
  if (!lines || lines.length === 0) return 0;
  const safeTime = Math.max(0, currentTimeSec);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (safeTime >= lines[i].startTimeSec) {
      return i;
    }
  }
  return 0;
}

/**
 * Computes the previous track index in the queue.
 * If current playback is past 3 seconds, restarts the current track unless forcePreviousTrack is true.
 */
export function getPreviousAction(
  currentIndex: number,
  totalTracks: number,
  currentTimeSec: number,
  forcePreviousTrack = false
): { action: 'restart' | 'previous'; targetIndex: number } {
  if (totalTracks <= 0) {
    return { action: 'restart', targetIndex: 0 };
  }
  if (!forcePreviousTrack && currentTimeSec > 3) {
    return { action: 'restart', targetIndex: currentIndex };
  }
  const prevIndex = (currentIndex - 1 + totalTracks) % totalTracks;
  return { action: 'previous', targetIndex: prevIndex };
}

/**
 * Returns the ordered "Up Next" queue slice starting after the active track index,
 * wrapping around the playlist so the driver always sees upcoming songs.
 */
export function getUpNextQueue(
  tracks: TrackItem[],
  currentIndex: number
): Array<{ track: TrackItem; originalIndex: number }> {
  if (!tracks.length) return [];
  const result: Array<{ track: TrackItem; originalIndex: number }> = [];
  for (let offset = 1; offset < tracks.length; offset++) {
    const idx = (currentIndex + offset) % tracks.length;
    result.push({ track: tracks[idx], originalIndex: idx });
  }
  return result;
}

/**
 * Calculates effective playback rate from turntable RPM setting (33.3 vs 45) and pitch slider (-12% to +12%).
 */
export function calculatePlaybackRate(rpm: 33 | 45, pitchPercent: number): number {
  const baseFactor = rpm === 45 ? 45 / 33.333 : 1;
  const clampedPitch = Math.max(-20, Math.min(20, pitchPercent));
  const pitchFactor = 1 + clampedPitch / 100;
  return Number((baseFactor * pitchFactor).toFixed(3));
}

/**
 * Picks the appropriate YouTube screen grab frame based on current song progress or manual channel override.
 */
export function selectActiveTvFrame(
  track: TrackItem,
  currentTimeSec: number,
  manualFrameIndex: number | null
): { frame: YouTubeGrabFrame; frameIndex: number } {
  const frames = track.tvFrames;
  if (!frames || frames.length === 0) {
    const fallback: YouTubeGrabFrame = {
      id: 'default',
      label: 'CH 03 · Broadcast Signal',
      timestampSec: 0,
      timestampLabel: '00:00',
      imageUrl: track.artworkUrl,
      caption: `${track.title} — ${track.artist}`,
    };
    return { frame: fallback, frameIndex: 0 };
  }

  if (manualFrameIndex !== null && manualFrameIndex >= 0 && manualFrameIndex < frames.length) {
    return { frame: frames[manualFrameIndex], frameIndex: manualFrameIndex };
  }

  // Strictly synchronize screen grabs with currentTimeSec / track.durationSec
  const progressRatio =
    track.durationSec > 0 ? Math.min(0.999, Math.max(0, currentTimeSec / track.durationSec)) : 0;
  const autoIndex = Math.min(frames.length - 1, Math.floor(progressRatio * frames.length));
  return { frame: frames[autoIndex], frameIndex: autoIndex };
}

/**
 * Extracts Spotify entity type and ID from a Spotify URL or URI.
 */
export function parseSpotifyInput(input: string): { type: 'playlist' | 'track' | 'invalid'; id: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: 'invalid', id: '' };

  const uriMatch = trimmed.match(/^spotify:(playlist|track):([a-zA-Z0-9]+)$/);
  if (uriMatch) {
    return { type: uriMatch[1] as 'playlist' | 'track', id: uriMatch[2] };
  }

  const urlMatch = trimmed.match(/open\.spotify\.com\/(playlist|track)\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    return { type: urlMatch[1] as 'playlist' | 'track', id: urlMatch[2] };
  }

  return { type: 'invalid', id: '' };
}

export interface VuChannelPhysicsState {
  level: number;
  velocity: number;
  peakHold: number;
  peakVelocity: number;
}

/**
 * Advances a single VU meter channel using underdamped spring-mass-damper + ballistic gravity decay
 * so the meter bounces naturally when track beats hit or drop instead of snapping to the target value.
 */
export function stepVuMeterPhysics(
  state: VuChannelPhysicsState,
  targetLevel: number,
  dtSec: number
): VuChannelPhysicsState {
  const dt = Math.max(0.004, Math.min(0.05, Number.isFinite(dtSec) ? dtSec : 0.016));
  const clampedTarget = Math.max(0.04, Math.min(1, Number.isFinite(targetLevel) ? targetLevel : 0.08));

  const displacement = clampedTarget - state.level;
  const isAttack = displacement > 0;

  // Underdamped spring constants: fast attack on beat hits, elastic bounce & ballistic decay on beat drops
  const springStiffness = isAttack ? 165 : 68;
  const damping = isAttack ? 11.5 : 7.2;

  // Add a subtle downward recoil impulse when a beat drops sharply so the needle visibly bounces
  const beatDropImpulse = displacement < -0.14 && Math.abs(state.velocity) < 0.4 ? -0.35 : 0;

  const acceleration = displacement * springStiffness - state.velocity * damping;
  let nextVelocity = state.velocity + acceleration * dt + beatDropImpulse;
  let nextLevel = state.level + nextVelocity * dt;

  // Elastic floor/ceiling reflection so the meter bounces slightly at the extremes
  if (nextLevel < 0.03) {
    nextLevel = 0.03;
    nextVelocity = -nextVelocity * 0.35;
  } else if (nextLevel > 1) {
    nextLevel = 1;
    nextVelocity = -nextVelocity * 0.3;
  }

  // Ballistic peak-hold indicator with gravity decay
  let nextPeakHold = state.peakHold;
  let nextPeakVelocity = state.peakVelocity;
  if (nextLevel >= nextPeakHold) {
    nextPeakHold = nextLevel;
    nextPeakVelocity = 0;
  } else {
    nextPeakVelocity = state.peakVelocity + 0.85 * dt;
    nextPeakHold = Math.max(nextLevel, state.peakHold - nextPeakVelocity * dt);
  }

  return {
    level: Number(nextLevel.toFixed(4)),
    velocity: Number(nextVelocity.toFixed(4)),
    peakHold: Number(nextPeakHold.toFixed(4)),
    peakVelocity: Number(nextPeakVelocity.toFixed(4)),
  };
}

export interface DominantThemePalette {
  hue: number;
  primaryHex: string;
  lightHex: string;
  darkHex: string;
  glowRgba: string;
  softBgRgba: string;
  borderRgba: string;
  vuStartHex: string;
  vuMidHex: string;
  vuPeakHex: string;
  tvCabinetGradient: string;
  tvCabinetBorderHex: string;
  tvFootGradient: string;
}

function hslToHex(h: number, s: number, l: number): { hex: string; r: number; g: number; b: number } {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(100, s)) / 100;
  const normL = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (normH < 60) {
    rPrime = c;
    gPrime = x;
  } else if (normH < 120) {
    rPrime = x;
    gPrime = c;
  } else if (normH < 180) {
    gPrime = c;
    bPrime = x;
  } else if (normH < 240) {
    gPrime = x;
    bPrime = c;
  } else if (normH < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, r, g, b };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rN) {
    h = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
  } else if (max === gN) {
    h = ((bN - rN) / d + 2) * 60;
  } else {
    h = ((rN - gN) / d + 4) * 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

/**
 * Computes a complete cohesive UI, VU meter, and outer TV cabinet color palette
 * from RGB pixel samples of the active track's album cover (with a deterministic fallback seed).
 */
export function computeDominantAccentFromRgbSamples(
  rgbSamples: Array<[number, number, number]>,
  fallbackSeed = 'vinyldrive'
): DominantThemePalette {
  const numBins = 12;
  const binWeights = new Array<number>(numBins).fill(0);
  const binHueSums = new Array<number>(numBins).fill(0);
  const binSatSums = new Array<number>(numBins).fill(0);

  for (const [r, g, b] of rgbSamples) {
    const { h, s, l } = rgbToHsl(r, g, b);
    // Ignore near-black shadows, near-white speculars, and desaturated grays
    if (l < 12 || l > 88 || s < 18) continue;
    const weight = (s / 100) * (1 - Math.abs(l - 52) / 55);
    if (weight <= 0) continue;
    const binIdx = Math.floor(((h % 360) / 360) * numBins) % numBins;
    binWeights[binIdx] += weight;
    binHueSums[binIdx] += h * weight;
    binSatSums[binIdx] += s * weight;
  }

  let winningBin = -1;
  let maxWeight = 0;
  for (let i = 0; i < numBins; i++) {
    if (binWeights[i] > maxWeight) {
      maxWeight = binWeights[i];
      winningBin = i;
    }
  }

  let dominantHue = 36;
  let dominantSat = 86;

  if (winningBin >= 0 && maxWeight > 0) {
    dominantHue = Math.round(binHueSums[winningBin] / binWeights[winningBin]);
    const avgSat = binSatSums[winningBin] / binWeights[winningBin];
    dominantSat = Math.round(Math.max(74, Math.min(94, avgSat * 1.15)));
  } else {
    // Deterministic fallback hue from seed string
    let hash = 2166136261;
    for (let i = 0; i < fallbackSeed.length; i++) {
      hash ^= fallbackSeed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const paletteHues = [196, 348, 28, 158, 272, 42, 16, 212];
    dominantHue = paletteHues[Math.abs(hash) % paletteHues.length];
    dominantSat = 85;
  }

  const primary = hslToHex(dominantHue, dominantSat, 55);
  const light = hslToHex(dominantHue, Math.min(96, dominantSat + 8), 72);
  const dark = hslToHex(dominantHue, Math.max(55, dominantSat - 15), 24);

  // VU Meter 3-stop vibrant gradient derived from dominant album art hue
  const vuStart = hslToHex((dominantHue - 14 + 360) % 360, dominantSat, 46);
  const vuMid = hslToHex(dominantHue, Math.min(96, dominantSat + 6), 58);
  const vuPeak = hslToHex((dominantHue + 22) % 360, 96, 74);

  // Outer TV cabinet lacquered wood/chassis colors tinted with the dominant album art hue
  const tvTop = hslToHex(dominantHue, Math.max(46, Math.min(72, dominantSat - 16)), 25);
  const tvMid = hslToHex(dominantHue, Math.max(44, Math.min(68, dominantSat - 18)), 17);
  const tvBottom = hslToHex(dominantHue, Math.max(40, Math.min(64, dominantSat - 20)), 11);
  const tvBorder = hslToHex(dominantHue, Math.max(52, Math.min(78, dominantSat - 10)), 38);

  return {
    hue: dominantHue,
    primaryHex: primary.hex,
    lightHex: light.hex,
    darkHex: dark.hex,
    glowRgba: `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.34)`,
    softBgRgba: `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.22)`,
    borderRgba: `rgba(${light.r}, ${light.g}, ${light.b}, 0.58)`,
    vuStartHex: vuStart.hex,
    vuMidHex: vuMid.hex,
    vuPeakHex: vuPeak.hex,
    tvCabinetGradient: `linear-gradient(160deg, ${tvTop.hex} 0%, ${tvMid.hex} 48%, ${tvBottom.hex} 100%)`,
    tvCabinetBorderHex: tvBorder.hex,
    tvFootGradient: `linear-gradient(180deg, ${tvTop.hex} 0%, ${tvBottom.hex} 100%)`,
  };
}

export interface TvVisualChannelTheme {
  index: number;
  id: string;
  code: string;
  name: string;
  dialAngleDeg: number;
  filterCss: string;
  tintOverlayRgba: string;
  videoSource: 'primary' | 'secondary' | 'lyric';
  frameOffset: number;
}

export const TV_VISUAL_CHANNELS: TvVisualChannelTheme[] = [
  {
    index: 0,
    id: 'ch-official',
    code: 'CH 01',
    name: 'Official MV',
    dialAngleDeg: -72,
    filterCss: 'contrast(1.05) saturate(1.12)',
    tintOverlayRgba: 'rgba(0, 0, 0, 0)',
    videoSource: 'primary',
    frameOffset: 0,
  },
  {
    index: 1,
    id: 'ch-live',
    code: 'CH 02',
    name: 'Live Broadcast',
    dialAngleDeg: -36,
    filterCss: 'contrast(1.18) saturate(1.3) hue-rotate(-10deg)',
    tintOverlayRgba: 'rgba(245, 158, 11, 0.1)',
    videoSource: 'secondary',
    frameOffset: 1,
  },
  {
    index: 2,
    id: 'ch-vhs',
    code: 'CH 03',
    name: '80s VHS Tape',
    dialAngleDeg: 0,
    filterCss: 'sepia(0.45) contrast(1.24) saturate(1.4) brightness(0.95)',
    tintOverlayRgba: 'rgba(217, 119, 6, 0.14)',
    videoSource: 'primary',
    frameOffset: 2,
  },
  {
    index: 3,
    id: 'ch-neon',
    code: 'CH 04',
    name: 'Neon Synth',
    dialAngleDeg: 36,
    filterCss: 'contrast(1.28) saturate(1.7) hue-rotate(32deg)',
    tintOverlayRgba: 'rgba(14, 165, 233, 0.15)',
    videoSource: 'lyric',
    frameOffset: 3,
  },
  {
    index: 4,
    id: 'ch-noir',
    code: 'CH 05',
    name: 'Studio Noir B&W',
    dialAngleDeg: 72,
    filterCss: 'grayscale(0.95) contrast(1.36) brightness(1.04)',
    tintOverlayRgba: 'rgba(255, 255, 255, 0.04)',
    videoSource: 'secondary',
    frameOffset: 4,
  },
];

/**
 * Returns the YouTube visual theme channel configuration for a given dial index.
 */
export function getTvChannelTheme(channelIndex: number): TvVisualChannelTheme {
  const total = TV_VISUAL_CHANNELS.length;
  const safeIdx = ((Math.floor(channelIndex) % total) + total) % total;
  return TV_VISUAL_CHANNELS[safeIdx];
}

/**
 * Steps the side-mounted TV channel dial to the next YouTube visual theme channel.
 */
export function getNextTvChannelIndex(currentChannelIndex: number): number {
  const total = TV_VISUAL_CHANNELS.length;
  return (((Math.floor(currentChannelIndex) + 1) % total) + total) % total;
}


