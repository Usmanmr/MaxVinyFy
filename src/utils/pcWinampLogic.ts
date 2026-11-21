import type { TrackItem } from './playerLogic';

export const WINAMP_EQ_BAND_LABELS = [
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

export const WINAMP_DEFAULT_BANDS_DB = [3, 2, 1, 0, -1, 1, 2, 3, 4, 4] as const;

export interface WinampEqPreset {
  id: string;
  label: string;
  preampDb: number;
  bandsDb: readonly number[];
}

export const WINAMP_EQ_PRESETS: readonly WinampEqPreset[] = [
  { id: 'rock', label: 'Rock', preampDb: 2, bandsDb: [4, 3, 1, -2, -2, 0, 2, 4, 5, 5] },
  { id: 'classic', label: 'Classic', preampDb: 1, bandsDb: [3, 2, 1, 0, -1, 1, 2, 3, 4, 4] },
  { id: 'dance', label: 'Dance', preampDb: 2, bandsDb: [5, 4, 2, 0, 0, -2, -1, 2, 4, 4] },
  { id: 'full-bass', label: 'Full Bass', preampDb: 1, bandsDb: [6, 5, 4, 2, 0, -2, -3, -3, -2, -2] },
  { id: 'soft', label: 'Soft', preampDb: 0, bandsDb: [2, 1, 0, -1, 0, 1, 2, 3, 4, 5] },
  { id: 'flat', label: 'Flat', preampDb: 0, bandsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
] as const;

export const FLOPPY_SHELL_COLORS = [
  '#242629',
  '#1D4B8F',
  '#D5CFC0',
  '#9E2626',
  '#1D6363',
] as const;

export interface ScatteredFloppyItem {
  track: TrackItem;
  trackIndex: number;
  shellHex: string;
  rotationDeg: number;
  offsetY: number;
  zIndex: number;
  inkHex: string;
  isActive: boolean;
}

export function clampEqDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(-12, Math.min(12, Math.round(db * 10) / 10));
}

export function dbToNormalized01(db: number): number {
  return (clampEqDb(db) + 12) / 24;
}

export function normalized01ToDb(norm: number): number {
  const clamped = Math.max(0, Math.min(1, norm));
  return Math.round((clamped * 24 - 12) * 10) / 10;
}

export function formatWinampLcdTime(seconds: number, remainingMode = false, durationSec = 0): string {
  const safeSec = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (remainingMode && durationSec > 0) {
    const rem = Math.max(0, Math.floor(durationSec - safeSec));
    const mins = Math.floor(rem / 60);
    const secs = rem % 60;
    return `-${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatWinampTrackDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function sumPlaylistDurationSec(tracks: readonly TrackItem[]): number {
  return tracks.reduce((acc, tr) => acc + Math.max(0, tr.durationSec || 0), 0);
}

export function formatWin98SystemClock(date: Date): string {
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${ampm}`;
}

export function buildWinampMarqueeText(track: TrackItem, indexZeroBased: number): string {
  if (!track || track.id === 'standby-empty' || track.durationSec <= 0) {
    return 'WINAMP 2.91  ***  LOAD A SPOTIFY PLAYLIST OR CLICK A FLOPPY DISK  ***  ';
  }
  const num = Math.max(1, indexZeroBased + 1);
  const dur = formatWinampTrackDuration(track.durationSec);
  const title = track.title || 'Untitled Track';
  return `${num}. ${title} (${dur})  ***  `;
}

export function computeWinampEqSplinePath(
  preampDb: number,
  bandsDb: readonly number[],
  width = 114,
  height = 24
): { linePoints: string; areaPoints: string } {
  const safeBands = bandsDb.length > 0 ? bandsDb : [...WINAMP_DEFAULT_BANDS_DB];
  const padX = 3;
  const padY = 3;
  const innerW = Math.max(10, width - padX * 2);
  const innerH = Math.max(8, height - padY * 2);
  const preampBias = clampEqDb(preampDb) * 0.25;

  const coords = safeBands.map((db, idx) => {
    const x =
      safeBands.length === 1
        ? padX + innerW / 2
        : padX + (idx / (safeBands.length - 1)) * innerW;
    const norm = dbToNormalized01(clampEqDb(db + preampBias));
    const y = padY + (1 - norm) * innerH;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const linePoints = coords.map((pt) => `${pt.x},${pt.y}`).join(' ');
  const firstX = coords[0]?.x ?? padX;
  const lastX = coords[coords.length - 1]?.x ?? padX + innerW;
  const areaPoints = `${firstX},${height} ${linePoints} ${lastX},${height}`;
  return { linePoints, areaPoints };
}

const SCATTER_ROTATIONS = [-14, 9, -6, 15, -11, 7, -16, 12] as const;
const SCATTER_Y_OFFSETS = [4, -5, 6, -3, 5, -6, 3, -4] as const;
const HANDWRITTEN_INKS = ['#182438', '#1A1A1A', '#1F2A44', '#2C1B18'] as const;

export function computeScatteredFloppyDeskItems(
  tracks: readonly TrackItem[],
  activeTrackId: string,
  maxItems = 7
): ScatteredFloppyItem[] {
  const validTracks = tracks.filter((t) => t && t.id !== 'standby-empty' && t.durationSec > 0);
  if (validTracks.length === 0) return [];

  const limit = Math.max(1, Math.min(8, maxItems));
  const activeIdx = Math.max(
    0,
    validTracks.findIndex((t) => t.id === activeTrackId)
  );

  // Build window around active track so the current song's floppy disk is always visible on the desk
  const half = Math.floor(limit / 2);
  let start = Math.max(0, activeIdx - half);
  if (start + limit > validTracks.length) {
    start = Math.max(0, validTracks.length - limit);
  }
  const slice = validTracks.slice(start, start + limit);

  return slice.map((track, localIdx) => {
    const globalIdx = start + localIdx;
    const isActive = track.id === activeTrackId;
    return {
      track,
      trackIndex: globalIdx,
      shellHex: FLOPPY_SHELL_COLORS[globalIdx % FLOPPY_SHELL_COLORS.length],
      rotationDeg: isActive ? -3 : SCATTER_ROTATIONS[globalIdx % SCATTER_ROTATIONS.length],
      offsetY: isActive ? -4 : SCATTER_Y_OFFSETS[globalIdx % SCATTER_Y_OFFSETS.length],
      zIndex: isActive ? 22 : 10 + (localIdx % 5),
      inkHex: HANDWRITTEN_INKS[globalIdx % HANDWRITTEN_INKS.length],
      isActive,
    };
  });
}

export type Win98BootStage = 'off' | 'warmup' | 'bios' | 'splash' | 'teal-wait' | 'desktop';

export const WIN98_BOOT_TIMINGS_MS = {
  biosStartMs: 280,
  splashStartMs: 650,
  tealStartMs: 2250,
  desktopStartMs: 2450,
} as const;

export function splitDesktopFloppyFlanks(items: readonly ScatteredFloppyItem[]): {
  left: ScatteredFloppyItem[];
  right: ScatteredFloppyItem[];
} {
  if (!items || items.length === 0) {
    return { left: [], right: [] };
  }
  const half = Math.ceil(items.length / 2);
  return {
    left: items.slice(0, half),
    right: items.slice(half),
  };
}

export function formatWmp64StatusLabel(
  isStandby: boolean,
  isPlaying: boolean,
  isBuffering = false
): string {
  if (isStandby) return 'Stopped   0 Kbps';
  if (isBuffering) return 'Buffering...';
  return isPlaying ? 'Playing...   128 Kbps' : 'Paused   128 Kbps';
}

export type Win98PcPowerPhase =
  | 'booting'
  | 'on'
  | 'shutting-down'
  | 'safe-to-turn-off'
  | 'off';

export const WIN98_SHUTDOWN_TIMINGS_MS = {
  splashStartMs: 200,
  safeScreenStartMs: 1500,
  powerOffStartMs: 2300,
  completeOffMs: 2600,
} as const;

export type Win98BsodPhase = 'none' | 'bsod' | 'black-flash' | 'recovery-boot';

export const WIN98_BSOD_TIMINGS_MS = {
  bsodDisplayMs: 2600,
  blackFlashMs: 200,
  recoveryBootMs: 1300,
  totalRecoveryMs: 4100,
} as const;

/**
 * Picks a deterministic randomized BSOD delay once per song playback:
 * between 25% and 72% of total track duration (or 22s–65s when duration is unavailable).
 */
export function computeBsodTriggerDelayMs(
  durationSec: number,
  elapsedSec = 0,
  randomFn: () => number = Math.random
): number {
  const r = Math.max(0, Math.min(0.9999, Number.isFinite(randomFn()) ? randomFn() : 0.5));
  if (Number.isFinite(durationSec) && durationSec > 0) {
    const targetSec = durationSec * (0.25 + r * 0.47);
    const remainingSec = Math.max(4, targetSec - Math.max(0, elapsedSec));
    return Math.round(remainingSec * 1000);
  }
  return Math.round((22 + r * 43) * 1000);
}
