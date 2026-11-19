import type { TrackItem } from './playerLogic';

export type SquirclePmpPaneId = 'music' | 'now-playing' | 'lyrics' | 'settings';

export const SQUIRCLE_PMP_PANE_ORDER: readonly SquirclePmpPaneId[] = [
  'music',
  'now-playing',
  'lyrics',
  'settings',
] as const;

export const SQUIRCLE_PANE_LABELS: Record<SquirclePmpPaneId, string> = {
  music: 'music',
  'now-playing': 'now playing',
  lyrics: 'lyrics',
  settings: 'settings',
};

export const SQUIRCLE_LONG_PRESS_MS = 420;
export const SQUIRCLE_VOLUME_STEP = 0.06;

export type SquircleTrackChangePhase = 'idle' | 'entering';

/**
 * Sub-1-second track-change choreography (< 740ms):
 * background art crossfades while giant lowercase title drops into place with slight overshoot bounce.
 */
export const SQUIRCLE_TRACK_CHANGE_TIMELINE_MS = {
  crossfadeMs: 420,
  titleDropMs: 680,
  totalMs: 720,
} as const;

export interface SquircleArtistGroup {
  artistKey: string;
  artistDisplayLowercase: string;
  tracks: TrackItem[];
}

/**
 * Steps cleanly between twist UI horizontal sections on D-pad / tab / twist navigation.
 */
export function stepSquirclePaneIndex(
  currentPane: SquirclePmpPaneId,
  direction: 'prev' | 'next'
): SquirclePmpPaneId {
  const idx = SQUIRCLE_PMP_PANE_ORDER.indexOf(currentPane);
  const safeIdx = idx >= 0 ? idx : 1;
  const nextIdx =
    direction === 'next'
      ? Math.min(SQUIRCLE_PMP_PANE_ORDER.length - 1, safeIdx + 1)
      : Math.max(0, safeIdx - 1);
  return SQUIRCLE_PMP_PANE_ORDER[nextIdx];
}

/**
 * Computes twist horizontal pane translation index (0..3 -> 0%, -100%, -200%, -300%).
 */
export function getSquirclePaneTranslatePct(paneId: SquirclePmpPaneId): number {
  const idx = SQUIRCLE_PMP_PANE_ORDER.indexOf(paneId);
  return (idx >= 0 ? idx : 1) * 100;
}

/**
 * Groups playlist tracks sequentially by artist name in bold lowercase headings with indented tracks beneath.
 */
export function groupPlaylistTracksByArtist(tracks: readonly TrackItem[]): SquircleArtistGroup[] {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const groups: SquircleArtistGroup[] = [];
  const byKey = new Map<string, SquircleArtistGroup>();

  for (const track of tracks) {
    const rawArtist = (track.artist || 'unknown artist').trim();
    const key = rawArtist.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.tracks.push(track);
    } else {
      const created: SquircleArtistGroup = {
        artistKey: key,
        artistDisplayLowercase: key,
        tracks: [track],
      };
      byKey.set(key, created);
      groups.push(created);
    }
  }
  return groups;
}

/**
 * Formats oversized numeral elapsed timestamp ("0:00", "1:24") and total duration cleanly.
 */
export function formatSquircleOversizedTime(
  elapsedSec: number,
  durationSec: number
): { elapsed: string; total: string } {
  const safeDur = Math.max(0, Math.floor(Number.isFinite(durationSec) ? durationSec : 0));
  const safeEl = Math.max(
    0,
    Math.min(safeDur, Math.floor(Number.isFinite(elapsedSec) ? elapsedSec : 0))
  );
  const fmt = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  return {
    elapsed: fmt(safeEl),
    total: fmt(safeDur),
  };
}

/**
 * Steps player volume upward or downward smoothly via squircle D-pad up/down, clamped [0, 1].
 */
export function calculateSquircleVolumeStep(
  currentVolume: number,
  direction: 'up' | 'down',
  step = SQUIRCLE_VOLUME_STEP
): number {
  const safeCur = Number.isFinite(currentVolume) ? Math.max(0, Math.min(1, currentVolume)) : 0.8;
  const delta = direction === 'up' ? Math.abs(step) : -Math.abs(step);
  return Math.max(0, Math.min(1, Number((safeCur + delta).toFixed(2))));
}

/**
 * Resolves circular "back" button pane transitions using recent navigation history with deterministic fallbacks.
 */
export function getSquircleBackNavigationTarget(
  currentPane: SquirclePmpPaneId,
  historyStack: readonly SquirclePmpPaneId[]
): { nextPane: SquirclePmpPaneId; nextHistory: SquirclePmpPaneId[] } {
  const filtered = historyStack.filter((p) => p !== currentPane);
  if (filtered.length > 0) {
    return {
      nextPane: filtered[filtered.length - 1],
      nextHistory: filtered.slice(0, -1),
    };
  }
  switch (currentPane) {
    case 'lyrics':
      return { nextPane: 'now-playing', nextHistory: [] };
    case 'settings':
      return { nextPane: 'music', nextHistory: [] };
    case 'now-playing':
      return { nextPane: 'music', nextHistory: [] };
    case 'music':
    default:
      return { nextPane: 'now-playing', nextHistory: [] };
  }
}

/**
 * Computes matte photo card resting tilt angle (non-zero +-2.6deg to +-5.5deg) upon release.
 */
export function calculateSquircleHolderRestTiltDeg(
  offsetX: number,
  lastDeltaX: number
): number {
  const impulse =
    Number.isFinite(lastDeltaX) && Math.abs(lastDeltaX) >= 0.4
      ? lastDeltaX
      : Number.isFinite(offsetX) && Math.abs(offsetX) >= 0.5
        ? offsetX
        : 1;
  const sign = impulse >= 0 ? 1 : -1;
  const mag = 2.8 + (Math.abs(Math.round(offsetX || 0)) % 25) * 0.1;
  return Number((sign * Math.min(5.5, mag)).toFixed(2));
}

/**
 * Returns compositor-only transform/opacity states for the under-1s track-change choreography.
 */
export function getSquircleTrackChangePose(phase: SquircleTrackChangePhase): {
  titleTranslateYPx: number;
  titleOpacity: number;
  incomingBgOpacity: number;
  outgoingBgOpacity: number;
} {
  if (phase === 'entering') {
    return {
      titleTranslateYPx: -34,
      titleOpacity: 0.15,
      incomingBgOpacity: 0,
      outgoingBgOpacity: 1,
    };
  }
  return {
    titleTranslateYPx: 0,
    titleOpacity: 1,
    incomingBgOpacity: 1,
    outgoingBgOpacity: 0,
  };
}

export interface SquircleHomeMenuItem {
  id: string;
  label: string;
  targetPane: SquirclePmpPaneId;
}

export const SQUIRCLE_HOME_MENU_ITEMS: readonly SquircleHomeMenuItem[] = [
  { id: 'music', label: 'music', targetPane: 'music' },
  { id: 'videos', label: 'videos', targetPane: 'now-playing' },
  { id: 'pictures', label: 'pictures', targetPane: 'now-playing' },
  { id: 'social', label: 'social', targetPane: 'lyrics' },
  { id: 'radio', label: 'radio', targetPane: 'now-playing' },
  { id: 'marketplace', label: 'marketplace', targetPane: 'music' },
  { id: 'settings', label: 'settings', targetPane: 'settings' },
] as const;

export const ZUNE_OS_PORTRAIT_MENU_ITEMS: readonly SquircleHomeMenuItem[] = [
  { id: 'music', label: 'music', targetPane: 'music' },
  { id: 'videos', label: 'videos', targetPane: 'now-playing' },
  { id: 'pictures', label: 'pictures', targetPane: 'now-playing' },
  { id: 'radio', label: 'radio', targetPane: 'now-playing' },
  { id: 'community', label: 'community', targetPane: 'lyrics' },
  { id: 'settings', label: 'settings', targetPane: 'settings' },
] as const;

/**
 * Computes contextual edge fading and subtle scale for smooth vertical kinetic list scrolling.
 */
export function computeKineticListItemFade(
  itemIndex: number,
  activeIndex: number,
  totalItems: number
): { opacity: number; translateXPx: number } {
  const safeTotal = Math.max(1, Math.floor(totalItems || 1));
  const safeActive = Math.max(0, Math.min(safeTotal - 1, Math.floor(activeIndex || 0)));
  const safeIdx = Math.max(0, Math.min(safeTotal - 1, Math.floor(itemIndex || 0)));
  const distance = Math.abs(safeIdx - safeActive);
  if (distance === 0) {
    return { opacity: 1, translateXPx: 2 };
  }
  const opacity = Number(Math.max(0.42, 0.9 - distance * 0.08).toFixed(2));
  return { opacity, translateXPx: 0 };
}

export const SQUIRCLE_EDITORIAL_MASK_GRADIENT =
  'linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.1) 18%, rgba(0, 0, 0, 0.88) 36%, #000000 46%)';

export interface SquircleStageLayout {
  chassisW: number;
  chassisH: number;
  screenW: number;
  screenH: number;
  videoScreenW: number;
  videoScreenH: number;
  videoGapPx: number;
  leftPx: number;
  topOffsetPx: number;
  editorialPaddingLeftPx: number;
}

/**
 * Computes left-edge docked portrait Zune 30 hardware dimensions + dedicated external rounded-corner
 * video display directly underneath, maintaining consistent left-hardware + right-fading-playlist composition
 * across Desktop, Mobile Vertical, and Mobile Horizontal viewports.
 */
export function computeSquircleStageLayout(
  stageWidthPx: number,
  stageHeightPx: number,
  isMobilePortrait = false
): SquircleStageLayout {
  const safeW = Number.isFinite(stageWidthPx) && stageWidthPx > 220 ? stageWidthPx : 640;
  const safeH = Number.isFinite(stageHeightPx) && stageHeightPx > 240 ? stageHeightPx : 640;
  const topOffsetPx = isMobilePortrait ? 56 : safeH < 460 ? 52 : 66;
  const bottomPad = isMobilePortrait ? 12 : safeH < 460 ? 10 : 18;
  const videoGapPx = isMobilePortrait ? 10 : safeH < 460 ? 8 : 12;

  const availColumnH = Math.max(210, safeH - topOffsetPx - bottomPad);

  if (isMobilePortrait) {
    const leftPx = Math.max(10, Math.min(18, Math.round(safeW * 0.03)));
    const maxColW = Math.max(146, Math.min(198, Math.round(safeW * 0.45)));
    // Reserve ~24% of column height for external video display beneath Zune unit
    const maxChassisH = Math.max(240, Math.round((availColumnH - videoGapPx) * 0.72));
    const chassisW = Math.round(Math.min(maxColW, maxChassisH * (9.6 / 16.4)));
    const chassisH = Math.round(chassisW * (16.4 / 9.6));
    const screenW = Math.floor((chassisW * 0.88) / 2) * 2;
    const screenH = Math.round(chassisH * 0.56);
    const videoScreenW = chassisW;
    const videoScreenH = Math.max(82, Math.min(130, Math.round(videoScreenW * 0.58)));
    const editorialPaddingLeftPx = Math.max(120, Math.round(leftPx + chassisW * 0.72));

    return {
      chassisW,
      chassisH,
      screenW,
      screenH,
      videoScreenW,
      videoScreenH,
      videoGapPx,
      leftPx,
      topOffsetPx,
      editorialPaddingLeftPx,
    };
  }

  const leftPx = Math.max(16, Math.min(32, Math.round(safeW * 0.025)));
  const isCompactLandscape = safeH < 480;
  const maxColW = isCompactLandscape
    ? Math.max(128, Math.min(190, Math.round(safeW * 0.25)))
    : Math.max(182, Math.min(286, Math.round(safeW * 0.3)));

  // Balance Zune height (~72%) + External Video Display (~28%) cleanly inside column height
  const maxChassisH = Math.max(180, Math.round((availColumnH - videoGapPx) * 0.72));
  const chassisW = Math.round(Math.min(maxColW, maxChassisH * (9.6 / 16.4)));
  const chassisH = Math.round(chassisW * (16.4 / 9.6));
  const screenW = Math.floor((chassisW * 0.88) / 2) * 2;
  const screenH = Math.round(chassisH * 0.56);

  const remainingForVideo = Math.max(74, availColumnH - chassisH - videoGapPx);
  const videoScreenW = chassisW;
  const videoScreenH = Math.max(
    74,
    Math.min(remainingForVideo, Math.round(videoScreenW * 0.58))
  );

  // Editorial rows extend behind Zune right edge where horizontal CSS alpha mask fades them
  const editorialPaddingLeftPx = Math.max(128, Math.round(leftPx + chassisW * 0.72));

  return {
    chassisW,
    chassisH,
    screenW,
    screenH,
    videoScreenW,
    videoScreenH,
    videoGapPx,
    leftPx,
    topOffsetPx,
    editorialPaddingLeftPx,
  };
}

export interface SquircleVideoPlaybackDisplayState {
  showVideoIframe: boolean;
  showAnimatedFramesFallback: boolean;
}

/**
 * Resolves whether to render the synchronized YouTube video iframe or Ken-Burns animated frames fallback
 * inside #sq-pane-now-playing.
 */
export function resolveSquircleVideoPlaybackState({
  activeVideoId,
  iframeUnavailable,
  isStandby,
  viewMode,
}: {
  activeVideoId?: string | null;
  iframeUnavailable: boolean;
  isStandby: boolean;
  viewMode: 'video' | 'artwork';
}): SquircleVideoPlaybackDisplayState {
  const hasVideoId = Boolean(activeVideoId && activeVideoId.trim().length > 0);
  const showVideoIframe = Boolean(!isStandby && viewMode === 'video' && hasVideoId && !iframeUnavailable);
  const showAnimatedFramesFallback = Boolean(!isStandby && !showVideoIframe);
  return {
    showVideoIframe,
    showAnimatedFramesFallback,
  };
}


