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

export interface TrackImageCandidate {
  url: string;
  width?: number;
  height?: number;
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
  images?: TrackImageCandidate[];
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
 * Finds the exact index of a track by its unique Spotify track ID inside the original unfiltered tracks array.
 * Returns -1 when not found.
 */
export function findTrackIndexById(tracks: TrackItem[], trackId: string): number {
  if (!Array.isArray(tracks) || tracks.length === 0 || !trackId) return -1;
  return tracks.findIndex((t) => t.id === trackId);
}

/**
 * Resolves a clicked/requested track strictly by its unique track ID against the ORIGINAL unfiltered tracks array,
 * preventing off-by-one or index-mismatch bugs from visual sorting, shuffle mapping, or filtered views.
 */
export function resolveTrackById(
  tracks: TrackItem[],
  trackId: string
): { track: TrackItem | null; index: number } {
  const index = findTrackIndexById(tracks, trackId);
  if (index < 0) {
    return { track: null, index: -1 };
  }
  return { track: tracks[index], index };
}

/**
 * Ensures every track in a playlist array has a strictly unique ID, even when multiple tracks
 * share identical song titles, artists, or duplicate Spotify URIs.
 */
export function ensureUniqueTrackIds(tracks: TrackItem[]): TrackItem[] {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const counts = new Map<string, number>();
  return tracks.map((track, idx) => {
    const baseId = (track.id || `track-${idx}`).trim() || `track-${idx}`;
    const seenCount = counts.get(baseId) ?? 0;
    counts.set(baseId, seenCount + 1);
    if (seenCount === 0) {
      return track.id === baseId ? track : { ...track, id: baseId };
    }
    return {
      ...track,
      id: `${baseId}__${seenCount + 1}`,
    };
  });
}

/**
 * Resolves the next track ID from the original unfiltered tracks array using ID-based lookup.
 */
export function getNextTrackId(
  tracks: TrackItem[],
  currentTrackId: string,
  repeatOne = false,
  shuffleEnabled = false,
  randomFraction = Math.random()
): string {
  if (!Array.isArray(tracks) || tracks.length === 0) return '';
  const currentIndex = findTrackIndexById(tracks, currentTrackId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  if (repeatOne) {
    return tracks[safeIndex].id;
  }
  const nextIndex = shuffleEnabled
    ? getShuffledNextTrackIndex(safeIndex, tracks.length, randomFraction)
    : getNextTrackIndex(safeIndex, tracks.length, false);
  return tracks[nextIndex]?.id || tracks[0].id;
}

/**
 * Computes previous track action and target track ID against the original unfiltered tracks array.
 */
export function getPreviousTrackIdAction(
  tracks: TrackItem[],
  currentTrackId: string,
  currentTimeSec: number,
  forcePreviousTrack = false
): { action: 'restart' | 'previous'; targetTrackId: string } {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { action: 'restart', targetTrackId: '' };
  }
  const currentIndex = findTrackIndexById(tracks, currentTrackId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  if (!forcePreviousTrack && currentTimeSec > 3) {
    return { action: 'restart', targetTrackId: tracks[safeIndex].id };
  }
  const prevIndex = (safeIndex - 1 + tracks.length) % tracks.length;
  return { action: 'previous', targetTrackId: tracks[prevIndex].id };
}

/**
 * Returns the ordered "Up Next" queue starting after currentTrackId in the original unfiltered tracks array.
 */
export function getUpNextQueueById(
  tracks: TrackItem[],
  currentTrackId: string
): Array<{ track: TrackItem; originalIndex: number }> {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const currentIndex = findTrackIndexById(tracks, currentTrackId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const result: Array<{ track: TrackItem; originalIndex: number }> = [];
  for (let offset = 1; offset < tracks.length; offset++) {
    const idx = (safeIndex + offset) % tracks.length;
    result.push({ track: tracks[idx], originalIndex: idx });
  }
  return result;
}

export const EMPTY_STANDBY_TRACK: TrackItem = {
  id: 'standby-empty',
  title: 'No Song Loaded',
  artist: 'Click Connect Spotify to Load Your Playlists',
  album: 'MaxYoutify · Standby',
  durationSec: 0,
  bpm: 110,
  year: 2025,
  artworkUrl: '',
  youtubeVideoId: '',
  synthPreset: 'midnight-synth',
  tvFrames: [],
};

export const EMPTY_STANDBY_PLAYLIST: PlaylistPack = {
  id: 'standby-playlist',
  name: 'No Playlist Loaded',
  subtitle: 'Connect Spotify to load your playlists',
  source: 'spotify-live',
  tracks: [],
};

export const TONEARM_REST_ANGLE_DEG = -8;

export type TonearmMotionPhase =
  | 'rest'
  | 'lifting-to-play'
  | 'swinging-to-groove'
  | 'dropping-to-groove'
  | 'playing'
  | 'lifting-to-rest'
  | 'returning-to-rest'
  | 'dragging';

/**
 * Returns pre-blurred shadow offset, opacity, and lift scale for each tonearm cueing phase.
 * Shadow moves further away and fades slightly when lifted, then settles back when dropped.
 */
export function getTonearmShadowPose(phase: TonearmMotionPhase): {
  offsetXpx: number;
  offsetYpx: number;
  opacity: number;
  armScale: number;
} {
  switch (phase) {
    case 'lifting-to-play':
    case 'swinging-to-groove':
    case 'lifting-to-rest':
    case 'returning-to-rest':
    case 'dragging':
      return { offsetXpx: 10, offsetYpx: 13, opacity: 0.44, armScale: 1.016 };
    case 'dropping-to-groove':
    case 'playing':
    case 'rest':
    default:
      return { offsetXpx: 3, offsetYpx: 5, opacity: 0.78, armScale: 1 };
  }
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
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { progressRatio: 0, tonearmAngleDeg: 6, grooveRadiusPercent: 46 };
  }
  const clampedSec = clampSeekTime(currentTimeSec, durationSec);
  const progressRatio = clampedSec / durationSec;
  const tonearmAngleDeg = Number((6 + progressRatio * 19).toFixed(2));
  const grooveRadiusPercent = Number((46 - progressRatio * 25).toFixed(2));
  return { progressRatio, tonearmAngleDeg, grooveRadiusPercent };
}

/**
 * Inverse of calculateTonearmTracking: converts a user-dragged tonearm angle [6 deg..25 deg]
 * above the vinyl record into the exact target playback timestamp in seconds.
 */
export function calculateSeekTimeFromTonearmAngle(
  angleDeg: number,
  durationSec: number,
  minAngleDeg = 6,
  maxAngleDeg = 25
): {
  targetTimeSec: number;
  tonearmAngleDeg: number;
  progressRatio: number;
  grooveRadiusPercent: number;
} {
  const lo = Math.min(minAngleDeg, maxAngleDeg);
  const hi = Math.max(minAngleDeg, maxAngleDeg);
  const span = Math.max(1, hi - lo);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { targetTimeSec: 0, tonearmAngleDeg: lo, progressRatio: 0, grooveRadiusPercent: 46 };
  }
  const safeAngle = Number.isFinite(angleDeg) ? Math.max(lo, Math.min(hi, angleDeg)) : lo;
  const progressRatio = (safeAngle - lo) / span;
  const targetTimeSec = Number((progressRatio * durationSec).toFixed(2));
  const grooveRadiusPercent = Number((46 - progressRatio * 25).toFixed(2));
  return {
    targetTimeSec,
    tonearmAngleDeg: Number(safeAngle.toFixed(2)),
    progressRatio: Number(progressRatio.toFixed(4)),
    grooveRadiusPercent,
  };
}

export const TONEARM_ASSET_METRICS = {
  width: 848,
  height: 1264,
  aspectRatio: 848 / 1264,
  pivotXPct: 0.5,
  pivotYPct: 0.235,
  tipXPct: 0.469,
  tipYPct: 0.9264,
  // Distance from (0.50*W, 0.235*H) to (0.469*W, 0.9264*H) normalized by H
  armLengthOverHeight: Math.hypot((0.469 - 0.5) * (848 / 1264), 0.9264 - 0.235),
  // Intrinsic leftward tilt of unrotated headshell stylus in degrees
  intrinsicTipTiltDeg:
    (Math.atan2((0.5 - 0.469) * (848 / 1264), 0.9264 - 0.235) * 180) / Math.PI,
} as const;

export interface ResponsiveTonearmGeometry {
  pivotX: number;
  pivotY: number;
  armWidthPx: number;
  armHeightPx: number;
  armLengthPx: number;
  armLeftPx: number;
  armTopPx: number;
  outerAngleDeg: number;
  innerAngleDeg: number;
  restAngleDeg: number;
}

/**
 * Computes exact stylus tip (x, y) screen coordinates inside the turntable plinth bed
 * for a given pivot position, arm length, and CSS rotation angle.
 */
export function calculateTonearmStylusCoordinates(params: {
  pivotX: number;
  pivotY: number;
  armLengthPx: number;
  cssAngleDeg: number;
}): { x: number; y: number } {
  const effectiveRad =
    ((params.cssAngleDeg + TONEARM_ASSET_METRICS.intrinsicTipTiltDeg) * Math.PI) / 180;
  return {
    x: Number((params.pivotX - params.armLengthPx * Math.sin(effectiveRad)).toFixed(2)),
    y: Number((params.pivotY + params.armLengthPx * Math.cos(effectiveRad)).toFixed(2)),
  };
}

/**
 * Dynamically calculates responsive tonearm pivot, aspect-locked arm size, and outer/inner groove angles
 * from the measured turntable bed and vinyl record diameter so the stylus tip ALWAYS lands accurately
 * on the vinyl's playable groove band [0.40*R .. 0.92*R] across every desktop, tablet, car, and mobile viewport.
 */
export function calculateResponsiveTonearmGeometry(params: {
  bedWidth: number;
  bedHeight: number;
  vinylCenterX: number;
  vinylCenterY: number;
  vinylDiameterPx: number;
  rightReservedPx?: number;
}): ResponsiveTonearmGeometry {
  const bedW = Math.max(200, Number.isFinite(params.bedWidth) ? params.bedWidth : 520);
  const bedH = Math.max(100, Number.isFinite(params.bedHeight) ? params.bedHeight : 280);
  const diameter = Math.max(60, Number.isFinite(params.vinylDiameterPx) ? params.vinylDiameterPx : 200);
  const R = diameter / 2;
  const vinylX = Number.isFinite(params.vinylCenterX) ? params.vinylCenterX : bedW * 0.52;
  const vinylY = Number.isFinite(params.vinylCenterY) ? params.vinylCenterY : bedH * 0.5;
  const rightReserved =
    Number.isFinite(params.rightReservedPx) && (params.rightReservedPx as number) > 0
      ? Math.min(bedW * 0.36, params.rightReservedPx as number)
      : 0;
  const effectiveBedRight = bedW - rightReserved;

  // Anchor pivot cleanly at the upper-right of the platter, clear of right-side vertical sliders and vinyl perimeter
  const nudgedPivotX = vinylX + R * 0.90;
  const maxAllowedPivotX = effectiveBedRight - Math.max(14, Math.min(24, R * 0.14));
  const pivotX = Math.max(vinylX + R * 0.55, Math.min(maxAllowedPivotX, nudgedPivotX));

  // Small upward nudge: keep tonearm anchored at top-right, clear of rotating vinyl & #console-title-plate
  let pivotY = Math.max(10, Math.min(vinylY - R * 0.84, bedH * 0.10));

  // Target outer lead-in groove on upper-right quadrant of vinyl (~0.72*R) so resting arm sits higher above vinyl equator
  const outerTargetX = vinylX + R * 0.72;
  const outerTargetY = vinylY + R * 0.08;

  let dxOuter = pivotX - outerTargetX;
  let dyOuter = outerTargetY - pivotY;
  let armLengthPx = Math.hypot(dxOuter, dyOuter);
  let armHeightPx = armLengthPx / TONEARM_ASSET_METRICS.armLengthOverHeight;

  // Ensure counterweight top edge (TONEARM_ASSET_METRICS.pivotYPct * armHeightPx above pivotY)
  // stays cleanly inside top of turntable bed with a visible wooden gap (>= 4px)
  const minPivotYForCounterweight = TONEARM_ASSET_METRICS.pivotYPct * armHeightPx + 4;
  if (pivotY < minPivotYForCounterweight && minPivotYForCounterweight < bedH * 0.36) {
    pivotY = minPivotYForCounterweight;
    dxOuter = pivotX - outerTargetX;
    dyOuter = outerTargetY - pivotY;
    armLengthPx = Math.hypot(dxOuter, dyOuter);
    armHeightPx = armLengthPx / TONEARM_ASSET_METRICS.armLengthOverHeight;
  }

  const armWidthPx = armHeightPx * TONEARM_ASSET_METRICS.aspectRatio;
  const alphaOuterDeg = (Math.atan2(dxOuter, dyOuter) * 180) / Math.PI;
  const outerAngleDeg = Number((alphaOuterDeg - TONEARM_ASSET_METRICS.intrinsicTipTiltDeg).toFixed(2));

  // Sweep clockwise toward inner groove (~0.48*R, cleanly outside the 0.34*R center label)
  let bestInnerAngle = outerAngleDeg + 14;
  let bestDistDiff = Infinity;
  const desiredInnerRadius = R * 0.48;
  for (let deg = outerAngleDeg + 5; deg <= outerAngleDeg + 34; deg += 0.25) {
    const pt = calculateTonearmStylusCoordinates({
      pivotX,
      pivotY,
      armLengthPx,
      cssAngleDeg: deg,
    });
    const rFromCenter = Math.hypot(pt.x - vinylX, pt.y - vinylY);
    if (rFromCenter >= R * 0.39) {
      const diff = Math.abs(rFromCenter - desiredInnerRadius);
      if (diff < bestDistDiff) {
        bestDistDiff = diff;
        bestInnerAngle = deg;
      }
    }
  }

  const innerAngleDeg = Number(Math.max(outerAngleDeg + 6, bestInnerAngle).toFixed(2));
  // Ensure resting stylus/headshell sits cleanly clear of the rotating vinyl across all viewports
  const desiredClearanceRadius = R + Math.min(18, Math.max(14, R * 0.08));
  const maxRestX = effectiveBedRight - 3;
  const startSweepDeg = Math.min(-6, outerAngleDeg - 12);
  let restAngleDeg = Number(Math.max(-18, Math.min(-6, outerAngleDeg - 16)).toFixed(2));
  let bestClearanceAngle = restAngleDeg;
  let bestClearanceDist = -1;
  for (let deg = startSweepDeg; deg >= -34; deg -= 0.5) {
    const restPt = calculateTonearmStylusCoordinates({
      pivotX,
      pivotY,
      armLengthPx,
      cssAngleDeg: deg,
    });
    if (restPt.x > maxRestX) continue;
    const rFromVinyl = Math.hypot(restPt.x - vinylX, restPt.y - vinylY);
    if (rFromVinyl > bestClearanceDist) {
      bestClearanceDist = rFromVinyl;
      bestClearanceAngle = Number(deg.toFixed(2));
    }
    if (rFromVinyl >= desiredClearanceRadius) {
      restAngleDeg = Number(deg.toFixed(2));
      break;
    }
  }
  if (bestClearanceDist > 0) {
    const chosenPt = calculateTonearmStylusCoordinates({
      pivotX,
      pivotY,
      armLengthPx,
      cssAngleDeg: restAngleDeg,
    });
    if (Math.hypot(chosenPt.x - vinylX, chosenPt.y - vinylY) < desiredClearanceRadius) {
      restAngleDeg = bestClearanceAngle;
    }
  }

  return {
    pivotX: Number(pivotX.toFixed(2)),
    pivotY: Number(pivotY.toFixed(2)),
    armWidthPx: Number(armWidthPx.toFixed(2)),
    armHeightPx: Number(armHeightPx.toFixed(2)),
    armLengthPx: Number(armLengthPx.toFixed(2)),
    armLeftPx: Number((pivotX - armWidthPx * TONEARM_ASSET_METRICS.pivotXPct).toFixed(2)),
    armTopPx: Number((pivotY - armHeightPx * TONEARM_ASSET_METRICS.pivotYPct).toFixed(2)),
    outerAngleDeg,
    innerAngleDeg,
    restAngleDeg,
  };
}

export const TONEARM_ASSEMBLY_OFFSET_X_PX = 0;
export const TONEARM_ASSEMBLY_OFFSET_Y_PX = 0;

/**
 * Applies a hardware calibration offset to the tonearm assembly pivot and bounding box
 * while keeping the counterweight clamped cleanly inside the top of the turntable bed.
 */
export function applyTonearmAssemblyOffset(
  geom: ResponsiveTonearmGeometry,
  offsetX = TONEARM_ASSEMBLY_OFFSET_X_PX,
  offsetY = TONEARM_ASSEMBLY_OFFSET_Y_PX
): ResponsiveTonearmGeometry {
  const nextArmTop = Math.max(2, geom.armTopPx + offsetY);
  const appliedDeltaY = nextArmTop - geom.armTopPx;
  return {
    ...geom,
    pivotX: Number((geom.pivotX + offsetX).toFixed(2)),
    pivotY: Number((geom.pivotY + appliedDeltaY).toFixed(2)),
    armLeftPx: Number((geom.armLeftPx + offsetX).toFixed(2)),
    armTopPx: Number(nextArmTop.toFixed(2)),
  };
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
  fallbackSeed = 'maxyoutify'
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

export const TV_CHANNEL_CHANGE_MS = 300;
export const TV_CLICK_DEBOUNCE_MS = 220;

/**
 * Screen aperture bounds (%) calibrated to tv-cabinet.webp's inner bezel opening
 * (measured transparent cutout: left 9.56%, top 13.45%, width 69.3%, height 66.03%),
 * slightly overscanned behind the z-30 cabinet bezel so video fills 100% edge-to-edge with zero side gap.
 */
export const TV_CABINET_SCREEN_APERTURE = {
  left: '8.8%',
  top: '12.5%',
  width: '70.8%',
  height: '68.0%',
  borderRadius: '6% / 9%',
} as const;

/**
 * Returns the YouTube visual theme channel configuration for a given dial index,
 * supporting dynamically fetched multi-video channels (5, 6, 7, 8+).
 */
export function getTvChannelTheme(
  channelIndex: number,
  totalChannels = TV_VISUAL_CHANNELS.length
): TvVisualChannelTheme {
  const safeTotal = Math.max(
    TV_VISUAL_CHANNELS.length,
    Number.isFinite(totalChannels) ? Math.floor(totalChannels) : TV_VISUAL_CHANNELS.length
  );
  const safeIdx = ((Math.floor(channelIndex) % safeTotal) + safeTotal) % safeTotal;
  const base = TV_VISUAL_CHANNELS[safeIdx % TV_VISUAL_CHANNELS.length];
  const dialAngleDeg =
    safeTotal <= 1 ? 0 : Math.round(-72 + (safeIdx / (safeTotal - 1)) * 144);
  return {
    ...base,
    index: safeIdx,
    code: `CH ${String(safeIdx + 1).padStart(2, '0')}`,
    dialAngleDeg,
    frameOffset: safeIdx,
  };
}

/**
 * Steps the side-mounted TV channel dial to the next YouTube video channel (5+ channels).
 */
export function getNextTvChannelIndex(
  currentChannelIndex: number,
  totalChannels = TV_VISUAL_CHANNELS.length
): number {
  const total = Math.max(
    TV_VISUAL_CHANNELS.length,
    Number.isFinite(totalChannels) ? Math.floor(totalChannels) : TV_VISUAL_CHANNELS.length
  );
  return (((Math.floor(currentChannelIndex) + 1) % total) + total) % total;
}

/**
 * Maps normalized audio volume [0, 1] to rotary knob angle [-135 deg, +135 deg].
 */
export function getTvVolumeKnobAngle(volume: number): number {
  const clamped = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
  return Math.round(-135 + clamped * 270);
}

/**
 * Steps rotary TV volume knob through ergonomic hardware detents (0 -> 0.25 -> 0.5 -> 0.75 -> 1 -> 0).
 */
export function getNextSteppedVolume(currentVolume: number): number {
  const detents = [0, 0.25, 0.5, 0.75, 1];
  const safe = Number.isFinite(currentVolume) ? Math.max(0, Math.min(1, currentVolume)) : 0.8;
  const next = detents.find((d) => d > safe + 0.05);
  return next !== undefined ? next : 0;
}

/**
 * Builds a clean, chrome-free YouTube nocookie embed URL with zero player controls or hover overlays.
 */
export function buildCleanYouTubeEmbedUrl(
  videoId: string,
  isPlaying: boolean,
  startSec: number,
  origin?: string,
  muted = true
): string {
  const safeId = encodeURIComponent((videoId || '').trim());
  const safeStart = Math.max(0, Math.floor(Number.isFinite(startSec) ? startSec : 0));
  const autoplay = isPlaying ? 1 : 0;
  const muteParam = muted ? 1 : 0;
  const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
  return `https://www.youtube-nocookie.com/embed/${safeId}?enablejsapi=1&autoplay=${autoplay}&start=${safeStart}&mute=${muteParam}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1&disablekb=1${originParam}`;
}

/**
 * Auto-enables Low Power Mode when navigator.hardwareConcurrency <= 4.
 */
export function shouldEnableLowPowerByHardware(hardwareConcurrency?: number | null): boolean {
  return typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0 && hardwareConcurrency <= 4;
}

/**
 * Returns true only when active playback animation loops should run (never when paused or hidden).
 */
export function shouldRunActiveAnimationLoops(
  isPlaying: boolean,
  isDocumentHidden: boolean,
  prefersReducedMotion = false,
  lowPowerMode = false
): boolean {
  return isPlaying && !isDocumentHidden && !prefersReducedMotion && !lowPowerMode;
}

/**
 * Quantizes playback time into 5-second buckets so CRT TV frames change at most once every 5 seconds.
 */
export function quantizeTvFrameTime(currentTimeSec: number, bucketSec = 5): number {
  if (!Number.isFinite(currentTimeSec) || currentTimeSec < 0) return 0;
  const step = Math.max(4, Math.floor(bucketSec));
  return Math.floor(currentTimeSec / step) * step;
}

/**
 * Returns CSS animation-timing-function for vinyl spin: smooth linear normally, or 12fps stepped in Low Power Mode.
 */
export function calculateVinylSpinTiming(spinDurationSec: number, lowPowerMode: boolean): string {
  if (!lowPowerMode) return 'linear';
  const safeDuration = Number.isFinite(spinDurationSec) && spinDurationSec > 0 ? spinDurationSec : 1.8;
  const stepsCount = Math.max(1, Math.round(safeDuration * 12));
  return `steps(${stepsCount}, end)`;
}

export type ViewportLayoutMode = 'mobile-landscape' | 'mobile-portrait' | 'desktop-tablet';

/**
 * Classifies screen dimensions into mobile-landscape (orientation: landscape & height <= 500),
 * mobile-portrait (width <= 767 & portrait), or desktop-tablet (tablets, car screens, desktop).
 */
export function classifyViewportLayout(width: number, height: number): ViewportLayoutMode {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'desktop-tablet';
  }
  if (width > height && height <= 500) {
    return 'mobile-landscape';
  }
  if (height >= width && width <= 767) {
    return 'mobile-portrait';
  }
  return 'desktop-tablet';
}

/**
 * Triggers tactile navigator.vibrate() haptic feedback during vinyl scratching unless Low Power Mode is active.
 */
export function triggerScratchHaptic(
  lowPowerMode: boolean,
  intensity: 'light' | 'classic' | 'backspin',
  vibrateFn?: ((pattern: number | number[]) => boolean) | null
): boolean {
  if (lowPowerMode) return false;
  const fn =
    vibrateFn !== undefined
      ? vibrateFn
      : typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
      ? navigator.vibrate.bind(navigator)
      : null;
  if (!fn) return false;

  const pattern: number | number[] =
    intensity === 'backspin' ? [18, 16, 26] : intensity === 'classic' ? 22 : 10;
  try {
    fn(pattern);
    return true;
  } catch {
    return false;
  }
}

export type LyricsDisplayLanguageMode = 'romanized' | 'english_meaning';

/**
 * Builds the canonical LRCLIB /api/get URL with track_name, artist_name, album_name, and duration.
 */
export function buildLrclibGetUrl(params: {
  trackName: string;
  artistName: string;
  albumName: string;
  durationSec: number;
}): string {
  const searchParams = new URLSearchParams({
    track_name: (params.trackName || '').trim(),
    artist_name: (params.artistName || '').trim(),
    album_name: (params.albumName || '').trim(),
    duration: String(Math.max(1, Math.round(params.durationSec || 180))),
  });
  return `https://lrclib.net/api/get?${searchParams.toString()}`;
}

/**
 * Parses plain unsynced lyrics into non-empty trimmed lines in their original order.
 */
export function parsePlainLyrics(plainText?: string | null): string[] {
  if (!plainText || typeof plainText !== 'string') return [];
  return plainText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Detects whether a string contains any non-Latin script characters
 * (e.g., Gurmukhi, Devanagari, Arabic/Urdu, Cyrillic, CJK, Tamil, etc.).
 * Punctuation, numbers, symbols, and accented Latin letters return false.
 */
export function containsNonLatinScript(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return /(?=[\p{L}])[^\p{Script=Latin}]/u.test(text);
}

/**
 * Detects whether any line in a lyrics array contains non-Latin script characters.
 */
export function lyricsContainNonLatinScript(lines: string[]): boolean {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  return lines.some((line) => containsNonLatinScript(line));
}

/**
 * Aligns and validates line-by-line converted lyrics returned by Gemini so that:
 * - The output has the EXACT same number of lines as originalLines
 * - Every line stays in the EXACT same index order (preserving original timestamps)
 * - No line contains embedded newlines (no split or merged lines)
 * Returns null if the conversion payload is empty or invalid.
 */
export function alignConvertedLyricLines(
  originalLines: string[],
  rawResult: unknown
): string[] | null {
  if (!Array.isArray(originalLines) || originalLines.length === 0) return null;

  let candidateArray: unknown[] | null = null;
  if (Array.isArray(rawResult)) {
    candidateArray = rawResult;
  } else if (
    rawResult &&
    typeof rawResult === 'object' &&
    Array.isArray((rawResult as { lines?: unknown[] }).lines)
  ) {
    candidateArray = (rawResult as { lines: unknown[] }).lines;
  }

  if (!candidateArray || candidateArray.length === 0) {
    return null;
  }

  // Support both string[] and Array<{ index: number; text: string }>
  const indexedMap = new Map<number, string>();
  let nonEmptyCount = 0;

  candidateArray.forEach((entry, positionalIdx) => {
    if (typeof entry === 'string') {
      const cleaned = entry.replace(/\s*\r?\n\s*/g, ' ').trim();
      if (cleaned) {
        indexedMap.set(positionalIdx, cleaned);
        nonEmptyCount++;
      }
    } else if (entry && typeof entry === 'object') {
      const obj = entry as { index?: unknown; text?: unknown; line?: unknown };
      const idx =
        typeof obj.index === 'number' && Number.isInteger(obj.index)
          ? obj.index
          : positionalIdx;
      const rawText = typeof obj.text === 'string' ? obj.text : typeof obj.line === 'string' ? obj.line : '';
      const cleaned = rawText.replace(/\s*\r?\n\s*/g, ' ').trim();
      if (cleaned) {
        indexedMap.set(idx, cleaned);
        nonEmptyCount++;
      }
    }
  });

  if (nonEmptyCount === 0) {
    return null;
  }

  // If plain string array was returned with a mismatched line count and no explicit indices, reject
  const allStrings = candidateArray.every((item) => typeof item === 'string');
  if (allStrings && candidateArray.length !== originalLines.length) {
    return null;
  }

  return originalLines.map((orig, idx) => indexedMap.get(idx) || orig);
}

/**
 * Calculates the delay in milliseconds for the single setTimeout scheduled for the next lyric line's timestamp.
 * Returns null when there is no subsequent line.
 */
export function calculateNextLyricTimeoutMs(
  lines: SyncedLyricLine[],
  activeIndex: number,
  currentTimeSec: number,
  playbackRate = 1
): number | null {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const nextIdx = Math.max(0, activeIndex) + 1;
  if (nextIdx >= lines.length) return null;

  const nextLine = lines[nextIdx];
  const safeCurrent = Number.isFinite(currentTimeSec) ? Math.max(0, currentTimeSec) : 0;
  const safeRate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? Math.max(0.5, playbackRate) : 1;
  const deltaSec = nextLine.startTimeSec - safeCurrent;

  if (deltaSec <= 0) return 16;
  return Math.max(16, Math.round((deltaSec / safeRate) * 1000));
}

/**
 * Computes the vertical translateY offset (in px) so the active lyric line is vertically centred
 * inside the lyrics viewport without using scrollTop animations.
 */
export function calculateCenteredLyricTranslateY(
  viewportHeightPx: number,
  activeLineOffsetTopPx: number,
  activeLineHeightPx: number
): number {
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) return 0;
  const safeTop = Number.isFinite(activeLineOffsetTopPx) ? activeLineOffsetTopPx : 0;
  const safeHeight = Number.isFinite(activeLineHeightPx) ? activeLineHeightPx : 0;
  return Math.round(viewportHeightPx / 2 - (safeTop + safeHeight / 2));
}

/**
 * Steps the record-sleeve lyric font size scale between 0 (compact) and 3 (extra-large).
 */
export function stepLyricFontSize(currentStep: number, delta: -1 | 1): number {
  const safe = Number.isFinite(currentStep) ? Math.round(currentStep) : 1;
  return Math.max(0, Math.min(3, safe + delta));
}

/**
 * Returns Tailwind typography classes for active, surrounding synced, and plain unsynced lyrics
 * at the given user font size step [0..3].
 */
export function getLyricFontSizeClasses(step: number): {
  activeClass: string;
  neighborClass: string;
  distantClass: string;
  plainClass: string;
} {
  const clamped = Math.max(0, Math.min(3, Math.round(step)));
  switch (clamped) {
    case 0:
      return {
        activeClass: 'text-[12px] sm:text-[13px] leading-snug',
        neighborClass: 'text-[10.5px] sm:text-[11px] leading-snug',
        distantClass: 'text-[10px] sm:text-[10.5px] leading-snug',
        plainClass: 'text-[11px] sm:text-[12px] leading-relaxed',
      };
    case 2:
      return {
        activeClass: 'text-[15px] sm:text-[17px] leading-snug',
        neighborClass: 'text-[12.5px] sm:text-[13.5px] leading-snug',
        distantClass: 'text-[11.5px] sm:text-[12.5px] leading-snug',
        plainClass: 'text-[13.5px] sm:text-[15px] leading-relaxed',
      };
    case 3:
      return {
        activeClass: 'text-[17px] sm:text-[19px] leading-snug',
        neighborClass: 'text-[14px] sm:text-[15px] leading-snug',
        distantClass: 'text-[12.5px] sm:text-[13.5px] leading-snug',
        plainClass: 'text-[15px] sm:text-[16.5px] leading-relaxed',
      };
    case 1:
    default:
      return {
        activeClass: 'text-[13.5px] sm:text-[15px] leading-snug',
        neighborClass: 'text-[11.5px] sm:text-[12.5px] leading-snug',
        distantClass: 'text-[11px] sm:text-[11.5px] leading-snug',
        plainClass: 'text-[12px] sm:text-[13.5px] leading-relaxed',
      };
  }
}

export const CROSSFADE_DETENT_SECONDS = [1, 2, 3, 4, 5] as const;

/**
 * Cycles the front-face X-FADE rotary knob through detented positions 1..5 seconds.
 */
export function stepCrossfadeSeconds(currentSec: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(Number.isFinite(currentSec) ? currentSec : 3)));
  return clamped >= 5 ? 1 : clamped + 1;
}

/**
 * Maps crossfade duration [1..5] seconds to a physical rotary knob angle [-110 deg .. +110 deg].
 */
export function getCrossfadeKnobAngle(seconds: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(Number.isFinite(seconds) ? seconds : 3)));
  return (clamped - 3) * 55;
}

/**
 * Determines whether automatic Web Audio gain-ramp crossfade should start for the current track.
 * Automatically disabled in Low Power Mode or during manual track skips.
 */
export function shouldTriggerTrackCrossfade(params: {
  currentTimeSec: number;
  durationSec: number;
  crossfadeSec: number;
  lowPowerMode: boolean;
  isManualSkip?: boolean;
  alreadyCrossfading?: boolean;
}): boolean {
  if (params.lowPowerMode || params.isManualSkip || params.alreadyCrossfading) {
    return false;
  }
  const safeDuration = Number.isFinite(params.durationSec) ? params.durationSec : 0;
  const safeFade = Math.max(1, Math.min(5, Math.round(params.crossfadeSec || 3)));
  if (safeDuration <= safeFade + 2) {
    return false;
  }
  const remaining = safeDuration - params.currentTimeSec;
  return remaining <= safeFade && remaining > 0.15;
}

/**
 * Maps top-surface rotary knob states to physical rotation angles in degrees.
 */
export function getSpeedKnobAngle(rpm: 33 | 45): number {
  return rpm === 45 ? 45 : -45;
}

export function getPitchKnobAngle(pitchPercent: number): number {
  const clamped = Math.max(-12, Math.min(12, Number.isFinite(pitchPercent) ? pitchPercent : 0));
  return Math.round((clamped / 12) * 130);
}

export function stepPitchKnobDetent(currentPitch: number): number {
  const detents = [-12, -8, -4, 0, 4, 8, 12];
  const safe = Number.isFinite(currentPitch) ? currentPitch : 0;
  const next = detents.find((d) => d > safe + 1);
  return next !== undefined ? next : detents[0];
}

export function getEffectsKnobAngle(modeIndex: number): number {
  const safe = ((Math.floor(modeIndex) % 4) + 4) % 4;
  return -90 + safe * 60;
}

export function getBinaryKnobAngle(enabled: boolean): number {
  return enabled ? 45 : -45;
}

/**
 * Triggers a short 12ms tactile haptic pulse on hardware button/knob presses unless Low Power Mode is active.
 */
export function triggerButtonHaptic(
  lowPowerMode: boolean,
  vibrateFn?: ((pattern: number | number[]) => boolean) | null
): boolean {
  if (lowPowerMode) return false;
  const fn =
    vibrateFn !== undefined
      ? vibrateFn
      : typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
      ? navigator.vibrate.bind(navigator)
      : null;
  if (!fn) return false;
  try {
    fn(12);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns an ordered, deduplicated list of candidate album artwork URLs for a resolved TrackItem.
 * When `track.images` is present, sorts images from largest area (width * height) to smallest
 * so the highest-resolution image is tried first and `onError` falls back to the next largest image,
 * followed by `track.artworkUrl` and any YouTube HQ thumbnail fallback.
 */
export function getOrderedTrackArtworkUrls(track: TrackItem | null | undefined): string[] {
  if (!track || track.id === 'standby-empty') return [];

  const result: string[] = [];
  const seen = new Set<string>();
  const pushUrl = (raw?: string | null) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  };

  if (Array.isArray(track.images) && track.images.length > 0) {
    const indexed = track.images.map((item, idx) => ({
      url: typeof item?.url === 'string' ? item.url.trim() : '',
      area:
        Number.isFinite(item?.width) &&
        Number.isFinite(item?.height) &&
        (item.width as number) > 0 &&
        (item.height as number) > 0
          ? (item.width as number) * (item.height as number)
          : -1,
      idx,
    }));

    indexed.sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area;
      return a.idx - b.idx;
    });

    for (const candidate of indexed) {
      pushUrl(candidate.url);
    }
  }

  pushUrl(track.artworkUrl);

  if (track.youtubeVideoId && track.youtubeVideoId.trim()) {
    pushUrl(`https://i.ytimg.com/vi/${encodeURIComponent(track.youtubeVideoId.trim())}/hqdefault.jpg`);
  }

  if (Array.isArray(track.tvFrames)) {
    for (const frame of track.tvFrames) {
      pushUrl(frame?.imageUrl);
    }
  }

  return result;
}

/**
 * Filters a track's ordered artwork candidates so the parent playlist's generic cover art
 * is never used in place of the specific song's own artwork.
 */
export function getSongSpecificArtworkUrls(
  track: TrackItem | null | undefined,
  parentPlaylistCoverUrl?: string
): string[] {
  const all = getOrderedTrackArtworkUrls(track);
  const cleanParent = (parentPlaylistCoverUrl || '').trim();
  if (!cleanParent) return all;
  return all.filter((url) => url !== cleanParent);
}

/**
 * Resolves the active album artwork URL for the current `failedAttemptCount` (0 = primary/largest,
 * 1 = second largest onError fallback, etc.), or marks `isPlaceholder: true` when all URLs fail.
 * Optionally excludes `parentPlaylistCoverUrl` so only per-track artwork is displayed.
 */
export function resolveActiveArtworkState(
  track: TrackItem | null | undefined,
  failedAttemptCount: number,
  parentPlaylistCoverUrl?: string
): {
  activeUrl: string | null;
  candidates: string[];
  isPlaceholder: boolean;
  attemptIndex: number;
} {
  const candidates = getSongSpecificArtworkUrls(track, parentPlaylistCoverUrl);
  const safeIndex = Math.max(0, Math.floor(Number.isFinite(failedAttemptCount) ? failedAttemptCount : 0));
  if (candidates.length === 0 || safeIndex >= candidates.length) {
    return {
      activeUrl: null,
      candidates,
      isPlaceholder: true,
      attemptIndex: safeIndex,
    };
  }
  return {
    activeUrl: candidates[safeIndex],
    candidates,
    isPlaceholder: false,
    attemptIndex: safeIndex,
  };
}

/**
 * Dynamically computes the spinning vinyl record's diameter so it fits the exact vertical space
 * between the bottom edge of the song-title plate and the top edge of the lyrics VFD screen,
 * with `paddingPx` (default 10px) from both the top and bottom edges.
 */
export function calculateVinylDiameterFromBounds(
  titlePlateBottomY: number,
  lyricsTopY: number,
  paddingPx = 10
): number {
  const safeTop = Number.isFinite(titlePlateBottomY) ? titlePlateBottomY : 0;
  const safeBottom = Number.isFinite(lyricsTopY) ? lyricsTopY : safeTop + 200;
  const safePad = Number.isFinite(paddingPx) && paddingPx >= 0 ? paddingPx : 10;
  const available = safeBottom - safeTop - safePad * 2;
  return Math.max(48, Math.round(available));
}

/**
 * Computes the square album-art holder box dimensions:
 * exactly 5px larger (in both width and height) than the vinyl record's current diameter.
 */
export function calculateHolderBoxSizeFromVinyl(vinylDiameterPx: number): number {
  const safeVinyl = Number.isFinite(vinylDiameterPx) && vinylDiameterPx > 0 ? Math.round(vinylDiameterPx) : 200;
  return safeVinyl + 5;
}

/**
 * Resolves tonearm motion phase transitions without lifting or returning the tonearm on Pause.
 * - Pausing playback (`isPlaying: false` while `!isStoppedAtRest && !isStandby && !forceTonearmRest`)
 *   keeps the tonearm in `'playing'` on the groove at its exact current angle.
 * - Resuming from pause when the tonearm is already on the groove stays in `'playing'` immediately.
 * - Only actual track-change (`forceTonearmRest` / `trackChanged`), stop/eject (`isStoppedAtRest`),
 *   or standby (`isStandby`) lifts/moves the tonearm.
 */
export function resolveTonearmMotionOnPlayStateChange(params: {
  isPlaying: boolean;
  wasPlaying: boolean;
  isStandby: boolean;
  isStoppedAtRest: boolean;
  trackChanged: boolean;
  forceTonearmRest: boolean;
  currentTonearmPhase: TonearmMotionPhase;
  immediateSnap?: boolean;
}): {
  nextPhase: TonearmMotionPhase;
  shouldScheduleDropToGroove: boolean;
  shouldScheduleLiftToRest: boolean;
} {
  const {
    isPlaying,
    wasPlaying,
    isStandby,
    isStoppedAtRest,
    trackChanged,
    forceTonearmRest,
    currentTonearmPhase,
    immediateSnap = false,
  } = params;

  if (forceTonearmRest) {
    return {
      nextPhase: immediateSnap ? 'rest' : 'returning-to-rest',
      shouldScheduleDropToGroove: false,
      shouldScheduleLiftToRest: false,
    };
  }

  if (isStandby || isStoppedAtRest) {
    if (immediateSnap) {
      return {
        nextPhase: 'rest',
        shouldScheduleDropToGroove: false,
        shouldScheduleLiftToRest: false,
      };
    }
    if (wasPlaying || currentTonearmPhase === 'playing') {
      return {
        nextPhase: 'lifting-to-rest',
        shouldScheduleDropToGroove: false,
        shouldScheduleLiftToRest: true,
      };
    }
    return {
      nextPhase: 'rest',
      shouldScheduleDropToGroove: false,
      shouldScheduleLiftToRest: false,
    };
  }

  // Track is loaded on the platter and not stopped/ejected:
  if (isPlaying) {
    // If track changed OR tonearm was sitting at rest, swing into the groove
    if (trackChanged || currentTonearmPhase === 'rest' || currentTonearmPhase === 'returning-to-rest') {
      if (immediateSnap) {
        return {
          nextPhase: 'playing',
          shouldScheduleDropToGroove: false,
          shouldScheduleLiftToRest: false,
        };
      }
      return {
        nextPhase: 'swinging-to-groove',
        shouldScheduleDropToGroove: true,
        shouldScheduleLiftToRest: false,
      };
    }
    // Resuming from pause while tonearm is already on the record: stay in 'playing' in place!
    return {
      nextPhase: 'playing',
      shouldScheduleDropToGroove: false,
      shouldScheduleLiftToRest: false,
    };
  }

  // Paused (`isPlaying === false`, `!isStoppedAtRest`, `!isStandby`):
  // If the tonearm was on the record (or dropping onto the record), keep it stationary in `'playing'` on the groove!
  if (
    wasPlaying ||
    currentTonearmPhase === 'playing' ||
    currentTonearmPhase === 'swinging-to-groove' ||
    currentTonearmPhase === 'dropping-to-groove'
  ) {
    return {
      nextPhase: 'playing',
      shouldScheduleDropToGroove: false,
      shouldScheduleLiftToRest: false,
    };
  }

  return {
    nextPhase: currentTonearmPhase,
    shouldScheduleDropToGroove: false,
    shouldScheduleLiftToRest: false,
  };
}

export const ALBUM_ART_SPINDLE_SNAP_RADIUS_PX = 16;

/**
 * Determines whether the draggable circular album art is centered on the vinyl spindle
 * (and should therefore rotate in sync with the vinyl record) or dragged off-center onto the board
 * (where it remains static and does not rotate).
 */
export function isAlbumArtSyncedToSpindle(
  offsetX: number,
  offsetY: number,
  snapRadiusPx = ALBUM_ART_SPINDLE_SNAP_RADIUS_PX
): boolean {
  const safeX = Number.isFinite(offsetX) ? offsetX : 0;
  const safeY = Number.isFinite(offsetY) ? offsetY : 0;
  return Math.hypot(safeX, safeY) <= Math.max(0, snapRadiusPx);
}

/**
 * Clamps a dragged album art offset (relative to the vinyl spindle center) to stay strictly
 * within the wooden board's bounding box, snapping cleanly to `{0, 0}` when near the spindle center.
 */
export function clampAlbumArtDragOffset(
  paramsOrOffsetX:
    | {
        offsetX: number;
        offsetY: number;
        boardWidth: number;
        boardHeight: number;
        discDiameter: number;
        spindleCenterX: number;
        spindleCenterY: number;
      }
    | number,
  offsetYArg?: number,
  boundsArg?: { minX: number; maxX: number; minY: number; maxY: number },
  snapRadiusPx = ALBUM_ART_SPINDLE_SNAP_RADIUS_PX
): { offsetX: number; offsetY: number; isCenteredOnSpindle: boolean } {
  let rawX = 0;
  let rawY = 0;
  let minX = -200;
  let maxX = 200;
  let minY = -200;
  let maxY = 200;

  if (typeof paramsOrOffsetX === 'object' && paramsOrOffsetX !== null) {
    rawX = paramsOrOffsetX.offsetX;
    rawY = paramsOrOffsetX.offsetY;
    const radius = Math.max(16, paramsOrOffsetX.discDiameter / 2);
    const pad = 4;
    minX = radius + pad - paramsOrOffsetX.spindleCenterX;
    maxX = paramsOrOffsetX.boardWidth - radius - pad - paramsOrOffsetX.spindleCenterX;
    minY = radius + pad - paramsOrOffsetX.spindleCenterY;
    maxY = paramsOrOffsetX.boardHeight - radius - pad - paramsOrOffsetX.spindleCenterY;
  } else {
    rawX = Number(paramsOrOffsetX);
    rawY = Number(offsetYArg ?? 0);
    if (boundsArg) {
      minX = boundsArg.minX;
      maxX = boundsArg.maxX;
      minY = boundsArg.minY;
      maxY = boundsArg.maxY;
    }
  }

  const clampedX = Math.round(
    Math.max(minX, Math.min(maxX, Number.isFinite(rawX) ? rawX : 0))
  );
  const clampedY = Math.round(
    Math.max(minY, Math.min(maxY, Number.isFinite(rawY) ? rawY : 0))
  );
  if (isAlbumArtSyncedToSpindle(clampedX, clampedY, snapRadiusPx)) {
    return { offsetX: 0, offsetY: 0, isCenteredOnSpindle: true };
  }
  return { offsetX: clampedX, offsetY: clampedY, isCenteredOnSpindle: false };
}

export interface TvSongVideoChannel {
  channelNumber: number;
  code: string;
  label: string;
  videoId: string;
  title: string;
  viewCount?: number;
  isOfficial?: boolean;
  imageUrl: string;
  frames: YouTubeGrabFrame[];
}

export interface CrtTintPreset {
  id: 'color' | 'amber' | 'cool' | 'bw';
  code: string;
  label: string;
  filterCss: string;
  overlayRgba: string;
}

export const CRT_TINT_PRESETS: CrtTintPreset[] = [
  {
    id: 'color',
    code: 'CLR',
    label: 'Color Broadcast',
    filterCss: 'contrast(1.06) saturate(1.12)',
    overlayRgba: 'rgba(0, 0, 0, 0)',
  },
  {
    id: 'amber',
    code: 'AMB',
    label: 'Warm Amber Phosphor',
    filterCss: 'sepia(0.75) contrast(1.22) saturate(1.45) brightness(0.96)',
    overlayRgba: 'rgba(245, 158, 11, 0.16)',
  },
  {
    id: 'cool',
    code: 'CYN',
    label: 'Cool Broadcast Cyan',
    filterCss: 'contrast(1.2) saturate(1.35) hue-rotate(155deg)',
    overlayRgba: 'rgba(14, 165, 233, 0.14)',
  },
  {
    id: 'bw',
    code: 'B&W',
    label: '1970s Monochrome',
    filterCss: 'grayscale(1) contrast(1.32) brightness(0.95)',
    overlayRgba: 'rgba(255, 255, 255, 0.03)',
  },
];

export function getNextCrtTintIndex(currentIndex: number): number {
  const safe = Number.isFinite(currentIndex) && currentIndex >= 0 ? Math.floor(currentIndex) : 0;
  return (safe + 1) % CRT_TINT_PRESETS.length;
}

/**
 * Maps the 4 CRT broadcast filter/tint presets (CLR, AMB, CYN, B&W) to rotary knob angles [-90, -30, +30, +90].
 */
export function getCrtTintKnobAngle(tintIndex: number): number {
  const total = CRT_TINT_PRESETS.length;
  const safe = (((Math.floor(Number.isFinite(tintIndex) ? tintIndex : 0) % total) + total) % total);
  return -90 + safe * 60;
}

/**
 * Clamps the draggable square album-art holder box offset (relative to its default left-side home position)
 * so the box can be dragged anywhere across the wooden board without leaving the board bounds.
 * Snaps cleanly back to (0, 0) when dropped within snapRadiusPx of its home position.
 */
export function clampHolderBoxDragOffset(params: {
  offsetX: number;
  offsetY: number;
  boardWidth: number;
  boardHeight: number;
  boxSize: number;
  homeCenterX: number;
  homeCenterY: number;
  snapRadiusPx?: number;
}): { offsetX: number; offsetY: number; isAtHomePosition: boolean } {
  const half = Math.max(16, (Number.isFinite(params.boxSize) ? params.boxSize : 72) / 2);
  const pad = 2;
  const boardW = Math.max(half * 2 + pad * 2, Number.isFinite(params.boardWidth) ? params.boardWidth : 400);
  const boardH = Math.max(half * 2 + pad * 2, Number.isFinite(params.boardHeight) ? params.boardHeight : 400);
  const homeX = Number.isFinite(params.homeCenterX) ? params.homeCenterX : half + 8;
  const homeY = Number.isFinite(params.homeCenterY) ? params.homeCenterY : boardH / 2;

  const minX = Math.min(0, Math.round(half + pad - homeX));
  const maxX = Math.max(0, Math.round(boardW - half - pad - homeX));
  const minY = Math.min(0, Math.round(half + pad - homeY));
  const maxY = Math.max(0, Math.round(boardH - half - pad - homeY));

  const rawX = Number.isFinite(params.offsetX) ? params.offsetX : 0;
  const rawY = Number.isFinite(params.offsetY) ? params.offsetY : 0;

  const clampedX = Math.round(Math.max(minX, Math.min(maxX, rawX)));
  const clampedY = Math.round(Math.max(minY, Math.min(maxY, rawY)));
  const snapRadius = typeof params.snapRadiusPx === 'number' ? params.snapRadiusPx : 12;

  if (Math.hypot(clampedX, clampedY) <= Math.max(0, snapRadius)) {
    return { offsetX: 0, offsetY: 0, isAtHomePosition: true };
  }
  return { offsetX: clampedX, offsetY: clampedY, isAtHomePosition: false };
}

export type TrackChangePhase =
  | 'idle'
  | 'lifting-vinyl-to-box'
  | 'returning-box-to-playlist'
  | 'bringing-new-box-from-playlist'
  | 'sliding-vinyl-to-spindle'
  | 'lowering-tonearm';

export const TRACK_CHANGE_TIMELINE_MS = {
  liftVinylEndMs: 260,
  returnBoxEndMs: 580,
  bringNewBoxEndMs: 920,
  slideVinylToSpindleEndMs: 1260,
  lowerTonearmEndMs: 1560,
} as const;

export interface TrackChangeStagePose {
  phase: TrackChangePhase;
  vinylTransform: string;
  vinylOpacity: number;
  holderBoxTransform: string;
  holderBoxOpacity: number;
  holderSlotOpen: boolean;
  forceTonearmRest: boolean;
  showOutgoingTrackInBox: boolean;
}

/**
 * Returns compositor-only (transform + opacity) poses for each phase of the 6-step track-change animation:
 * a) lifting-vinyl-to-box: vinyl lifts/slides off spindle into the album-art holder box on the left
 * b) returning-box-to-playlist: holder box shrinks & slides toward the playlist panel on the left
 * c) bringing-new-box-from-playlist: new track's holder box slides out from playlist onto wooden board
 * d) forceTonearmRest stays true throughout a-e so tonearm lifts & swings out of the way to rest
 * e) sliding-vinyl-to-spindle: new box opens and vinyl record slides out onto the turntable spindle
 * f) lowering-tonearm: tonearm swings back in and lowers onto the record
 */
export function getTrackChangeStagePose(phase: TrackChangePhase): TrackChangeStagePose {
  switch (phase) {
    case 'lifting-vinyl-to-box':
      return {
        phase,
        vinylTransform: 'translate3d(-38%, 0%, 0) scale(0.84)',
        vinylOpacity: 0.72,
        holderBoxTransform: 'translate3d(0%, 0%, 0) scale(1.02)',
        holderBoxOpacity: 1,
        holderSlotOpen: true,
        forceTonearmRest: true,
        showOutgoingTrackInBox: true,
      };
    case 'returning-box-to-playlist':
      return {
        phase,
        vinylTransform: 'translate3d(-95%, 10%, 0) scale(0.24)',
        vinylOpacity: 0,
        holderBoxTransform: 'translate3d(-85%, 18%, 0) scale(0.26)',
        holderBoxOpacity: 0.14,
        holderSlotOpen: false,
        forceTonearmRest: true,
        showOutgoingTrackInBox: true,
      };
    case 'bringing-new-box-from-playlist':
      return {
        phase,
        vinylTransform: 'translate3d(-38%, 0%, 0) scale(0.82)',
        vinylOpacity: 0.25,
        holderBoxTransform: 'translate3d(0%, 0%, 0) scale(1)',
        holderBoxOpacity: 1,
        holderSlotOpen: true,
        forceTonearmRest: true,
        showOutgoingTrackInBox: false,
      };
    case 'sliding-vinyl-to-spindle':
      return {
        phase,
        vinylTransform: 'translate3d(0%, 0%, 0) scale(1)',
        vinylOpacity: 1,
        holderBoxTransform: 'translate3d(-2%, 0%, 0) scale(1.01)',
        holderBoxOpacity: 1,
        holderSlotOpen: true,
        forceTonearmRest: true,
        showOutgoingTrackInBox: false,
      };
    case 'lowering-tonearm':
      return {
        phase,
        vinylTransform: 'translate3d(0%, 0%, 0) scale(1)',
        vinylOpacity: 1,
        holderBoxTransform: 'translate3d(0%, 0%, 0) scale(1)',
        holderBoxOpacity: 1,
        holderSlotOpen: false,
        forceTonearmRest: false,
        showOutgoingTrackInBox: false,
      };
    case 'idle':
    default:
      return {
        phase: 'idle',
        vinylTransform: 'translate3d(0%, 0%, 0) scale(1)',
        vinylOpacity: 1,
        holderBoxTransform: 'translate3d(0%, 0%, 0) scale(1)',
        holderBoxOpacity: 1,
        holderSlotOpen: false,
        forceTonearmRest: false,
        showOutgoingTrackInBox: false,
      };
  }
}

/**
 * Removes a saved playlist by ID and resolves the next active playlist ID cleanly.
 */
export function removePlaylistById(
  playlists: PlaylistPack[],
  playlistIdToRemove: string,
  currentActivePlaylistId: string
): {
  playlists: PlaylistPack[];
  remaining: PlaylistPack[];
  nextActivePlaylistId: string;
  nextActiveId: string;
} {
  if (!Array.isArray(playlists) || playlists.length === 0) {
    return {
      playlists: [],
      remaining: [],
      nextActivePlaylistId: '',
      nextActiveId: '',
    };
  }
  const remaining = playlists.filter((pl) => pl.id !== playlistIdToRemove);
  if (remaining.length === 0) {
    return {
      playlists: [],
      remaining: [],
      nextActivePlaylistId: '',
      nextActiveId: '',
    };
  }
  const activeStillExists = remaining.some((pl) => pl.id === currentActivePlaylistId);
  const nextActivePlaylistId = activeStillExists ? currentActivePlaylistId : remaining[0].id;
  return {
    playlists: remaining,
    remaining,
    nextActivePlaylistId,
    nextActiveId: nextActivePlaylistId,
  };
}

/**
 * Converts a normalized vertical pointer position along the pitch fader track
 * (ratioFromTop = 0 at TOP, 0.5 at MIDDLE idle, 1 at BOTTOM) to pitch percent [-12% .. +12%].
 * Sliding UP from idle increases pitch; sliding DOWN decreases pitch.
 */
export function verticalPointerRatioToPitch(ratioFromTop: number): number {
  const clamped = Number.isFinite(ratioFromTop) ? Math.max(0, Math.min(1, ratioFromTop)) : 0.5;
  const raw = Math.round((0.5 - clamped) * 24);
  if (raw === 0) return 0;
  return Math.max(-12, Math.min(12, raw));
}

/**
 * Computes natural counterweight hanging tilt (degrees) while dragging the album-art holder box
 * based on horizontal cursor velocity/delta, simulating a framed photo suspended on a string.
 */
export function calculateHolderBoxDragTiltDeg(deltaX: number, isDragging: boolean): number {
  if (!isDragging || !Number.isFinite(deltaX)) return 0;
  // Dragging right pulls bottom left/top right slightly; clamped to [-14, +14] deg
  const tilt = Math.max(-14, Math.min(14, deltaX * 0.45));
  return Number(tilt.toFixed(2));
}

/**
 * Computes a natural non-zero counterweight resting tilt angle (between ±3.5deg and ±7deg)
 * when the user releases the dragged album-art holder box, avoiding a stiff 0deg horizontal snap.
 */
export function calculateHolderBoxRestTiltDeg(
  offsetX: number,
  lastDeltaX: number,
  isAtHomePosition = false
): number {
  if (isAtHomePosition && Math.abs(lastDeltaX) < 1) {
    return -3.8;
  }
  const impulse = Number.isFinite(lastDeltaX) && Math.abs(lastDeltaX) >= 0.5 ? lastDeltaX : offsetX;
  const sign = impulse >= 0 ? 1 : -1;
  const magnitude = Math.min(7, 3.8 + (Math.abs(offsetX) % 32) * 0.1);
  return Number((sign * magnitude).toFixed(2));
}

/**
 * Resolves the effective CRT TV play/pause state so video follows turntable audio by default,
 * while honoring any explicit independent TV-screen toggle until the track changes.
 */
export function resolveEffectiveTvPlayState(params: {
  audioIsPlaying: boolean;
  tvOverridePlaying: boolean | null;
  tvPoweredOn: boolean;
  isStandby: boolean;
}): { effectivePlaying: boolean; isOverridden: boolean } {
  if (params.isStandby || !params.tvPoweredOn) {
    return { effectivePlaying: false, isOverridden: false };
  }
  const hasOverride = typeof params.tvOverridePlaying === 'boolean';
  return {
    effectivePlaying: hasOverride ? (params.tvOverridePlaying as boolean) : params.audioIsPlaying,
    isOverridden: hasOverride,
  };
}

/**
 * Converts a normalized vertical pointer position along the Volume fader track
 * (ratioFromTop = 0 at TOP -> 1.0 full volume, ratioFromTop = 1 at BOTTOM -> 0.0 mute).
 */
export function verticalPointerRatioToVolume(ratioFromTop: number): number {
  const clamped = Number.isFinite(ratioFromTop) ? Math.max(0, Math.min(1, ratioFromTop)) : 0.2;
  return Number((1 - clamped).toFixed(2));
}

/**
 * Computes thumb top percentage [8%, 92%] for the vertical volume slider
 * so full volume (1.0) is at the top (8%) and muted (0.0) is at the bottom (92%).
 */
export function calculateVolumeThumbTopPercent(volume: number): number {
  const clamped = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
  return Number((92 - clamped * 84).toFixed(2));
}

/**
 * Positions the entire turntable assembly (raised platter plinth + vinyl + tonearm)
 * on the right side of the plinth bed, immediately adjacent to the Pitch/Volume vertical control column.
 */
export function calculateRightDockedVinylCenterX(params: {
  bedWidth: number;
  rightReservedPx: number;
  vinylDiameterPx: number;
}): number {
  const bedW = Math.max(200, Number.isFinite(params.bedWidth) ? params.bedWidth : 560);
  const rightReserved = Number.isFinite(params.rightReservedPx)
    ? Math.max(0, Math.min(bedW * 0.4, params.rightReservedPx))
    : 84;
  const dia = Math.max(48, Number.isFinite(params.vinylDiameterPx) ? params.vinylDiameterPx : 200);
  const R = dia / 2;
  const effectiveBedRight = bedW - rightReserved;
  // Platter plinth outer bevel extends 11px beyond R; keep ~7px gap next to the Pitch/Volume column
  const rightDockedTarget = effectiveBedRight - R - 18;
  const minLeft = R + 12;
  return Number(Math.max(minLeft, rightDockedTarget).toFixed(2));
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Formats live current local time (larger display) and weekday + date (smaller display)
 * for the VFD display box on the right end of #turntable-control-row.
 */
export function formatConsoleClockAndDate(
  date: Date = new Date(),
  use24Hour = false
): { timeText: string; dateText: string } {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(0);
  const rawHours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  let timeText: string;
  if (use24Hour) {
    timeText = `${String(rawHours).padStart(2, '0')}:${mins}`;
  } else {
    const period = rawHours >= 12 ? 'PM' : 'AM';
    const h12 = rawHours % 12 || 12;
    timeText = `${h12}:${mins} ${period}`;
  }
  const weekday = WEEKDAY_SHORT[d.getDay()];
  const month = MONTH_SHORT[d.getMonth()];
  const day = d.getDate();
  return {
    timeText,
    dateText: `${weekday}, ${month} ${day}`,
  };
}

export interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  wobblePhase: number;
  wobbleSpeed: number;
}

/**
 * Generates randomized slow-moving floating dust particles for the turntable overlay canvas.
 */
export function generateDustParticles(
  count: number,
  width: number,
  height: number,
  rng: () => number = Math.random
): DustParticle[] {
  const safeCount = Math.max(0, Math.min(80, Math.floor(count)));
  const safeW = Math.max(40, Number.isFinite(width) ? width : 400);
  const safeH = Math.max(40, Number.isFinite(height) ? height : 260);
  const particles: DustParticle[] = [];
  for (let i = 0; i < safeCount; i++) {
    const r1 = rng();
    const r2 = rng();
    const r3 = rng();
    const r4 = rng();
    const r5 = rng();
    const r6 = rng();
    particles.push({
      x: r1 * safeW,
      y: r2 * safeH,
      vx: (r3 - 0.35) * 9.5, // gentle lateral drift in px/sec
      vy: -2.5 - r4 * 6.5, // slow warm updraft in px/sec
      radius: 0.75 + r5 * 1.45,
      alpha: 0.14 + r6 * 0.28,
      wobblePhase: r1 * Math.PI * 2,
      wobbleSpeed: 0.6 + r3 * 1.1,
    });
  }
  return particles;
}

/**
 * Advances floating dust particles when turntable playback is active; returns particles unchanged when paused/stopped.
 */
export function stepDustParticles(
  particles: DustParticle[],
  width: number,
  height: number,
  dtSec: number,
  isAnimating: boolean
): DustParticle[] {
  if (!isAnimating || !Array.isArray(particles) || particles.length === 0) {
    return particles;
  }
  const safeW = Math.max(40, Number.isFinite(width) ? width : 400);
  const safeH = Math.max(40, Number.isFinite(height) ? height : 260);
  const safeDt = Math.max(0, Math.min(0.1, Number.isFinite(dtSec) ? dtSec : 0.016));

  return particles.map((p) => {
    const nextPhase = p.wobblePhase + p.wobbleSpeed * safeDt;
    const wobbleDx = Math.sin(nextPhase) * 3.2 * safeDt;
    let nextX = p.x + p.vx * safeDt + wobbleDx;
    let nextY = p.y + p.vy * safeDt;

    if (nextX < -4) nextX = safeW + 4;
    if (nextX > safeW + 4) nextX = -4;
    if (nextY < -4) nextY = safeH + 4;
    if (nextY > safeH + 4) nextY = -4;

    return {
      ...p,
      x: nextX,
      y: nextY,
      wobblePhase: nextPhase,
    };
  });
}

export interface FullscreenAudioHandoffState {
  audioOwner: 'youtube' | 'spotify';
  spotifyMuted: boolean;
  spotifyAction: 'pause-and-mute' | 'unmute-and-resume';
  youtubeMuted: boolean;
  youtubeVolumePct: number;
  youtubeAction: 'unmute-and-play' | 'mute-and-pause';
  syncedTimeSec: number;
}

/**
 * Computes deterministic audio handoff state between Spotify turntable playback and YouTube TV playback
 * when entering or exiting TV fullscreen mode, keeping both aligned to the shared timeline.
 */
export function computeFullscreenAudioHandoff(params: {
  enteringFullscreen: boolean;
  spotifyVolume: number;
  currentTimeSec: number;
}): FullscreenAudioHandoffState {
  const safeVol = Number.isFinite(params.spotifyVolume)
    ? Math.max(0, Math.min(1, params.spotifyVolume))
    : 0.8;
  const youtubeVolumePct = Math.round(safeVol * 100);
  const syncedTimeSec = Math.max(0, Math.floor(Number.isFinite(params.currentTimeSec) ? params.currentTimeSec : 0));

  if (params.enteringFullscreen) {
    return {
      audioOwner: 'youtube',
      spotifyMuted: true,
      spotifyAction: 'pause-and-mute',
      youtubeMuted: false,
      youtubeVolumePct,
      youtubeAction: 'unmute-and-play',
      syncedTimeSec,
    };
  }

  return {
    audioOwner: 'spotify',
    spotifyMuted: false,
    spotifyAction: 'unmute-and-resume',
    youtubeMuted: true,
    youtubeVolumePct,
    youtubeAction: 'mute-and-pause',
    syncedTimeSec,
  };
}



