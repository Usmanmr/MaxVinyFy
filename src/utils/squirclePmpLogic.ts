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

export const SQUIRCLE_UNDER_VIDEO_SCROLL_MASK_GRADIENT =
  'linear-gradient(to bottom, transparent 0px, rgba(0, 0, 0, 0.4) 18px, #000000 44px, #000000 100%)';

export const ZUNE_CHASSIS_ASPECT_RATIO = 0.545; // 61mm x 112mm Zune 30 physical ratio

export type ZuneDpadZone = 'up' | 'down' | 'left' | 'right' | 'center' | null;

/**
 * Computes subtle 1.5deg 3D directional ring tilt or center button depression for Zune 30 tactile feedback.
 */
export function getZuneDpadTiltTransform(zone: ZuneDpadZone): {
  ringTransform: string;
  centerTransform: string;
} {
  switch (zone) {
    case 'up':
      return {
        ringTransform: 'perspective(380px) rotateX(1.5deg)',
        centerTransform: 'scale(1)',
      };
    case 'down':
      return {
        ringTransform: 'perspective(380px) rotateX(-1.5deg)',
        centerTransform: 'scale(1)',
      };
    case 'left':
      return {
        ringTransform: 'perspective(380px) rotateY(-1.5deg)',
        centerTransform: 'scale(1)',
      };
    case 'right':
      return {
        ringTransform: 'perspective(380px) rotateY(1.5deg)',
        centerTransform: 'scale(1)',
      };
    case 'center':
      return {
        ringTransform: 'perspective(380px) rotateX(0deg) rotateY(0deg)',
        centerTransform: 'scale(0.97)',
      };
    default:
      return {
        ringTransform: 'perspective(380px) rotateX(0deg) rotateY(0deg)',
        centerTransform: 'scale(1)',
      };
  }
}

export type ZuneOsScreenId = 'home' | 'playlist' | 'now-playing' | 'lyrics' | 'settings';

export const ZUNE_OS_SCREEN_ORDER: readonly ZuneOsScreenId[] = [
  'home',
  'playlist',
  'now-playing',
  'lyrics',
  'settings',
] as const;

/**
 * Computes horizontal slide percentage (0..400%) for the authentic Zune OS 5-screen slider.
 */
export function getZuneOsScreenTranslatePct(screenId: ZuneOsScreenId): number {
  const idx = ZUNE_OS_SCREEN_ORDER.indexOf(screenId);
  return (idx >= 0 ? idx : 1) * 100;
}

/**
 * Resolves circular Back (<-) transitions: Now Playing -> Playlist -> Main Menu.
 */
export function getZuneOsBackTarget(screenId: ZuneOsScreenId): ZuneOsScreenId {
  switch (screenId) {
    case 'lyrics':
      return 'now-playing';
    case 'now-playing':
      return 'playlist';
    case 'playlist':
    case 'settings':
      return 'home';
    case 'home':
    default:
      return 'home';
  }
}

/**
 * Steps highlighted list index up/down safely within [0, totalCount - 1].
 */
export function stepZuneListFocusIndex(
  currentIndex: number,
  totalCount: number,
  direction: 'up' | 'down'
): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 0;
  const safeIdx = Math.max(0, Math.min(totalCount - 1, Math.floor(currentIndex || 0)));
  if (direction === 'up') {
    return Math.max(0, safeIdx - 1);
  }
  return Math.min(totalCount - 1, safeIdx + 1);
}

/**
 * Computes razor-thin vertical scroll-position thumb metrics for the inner Zune LCD edge.
 */
export function computeZuneScrollIndicatorMetrics(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): { visible: boolean; thumbHeightPct: number; thumbTopPct: number } {
  if (
    !Number.isFinite(scrollHeight) ||
    !Number.isFinite(clientHeight) ||
    clientHeight <= 0 ||
    scrollHeight <= clientHeight + 2
  ) {
    return { visible: false, thumbHeightPct: 100, thumbTopPct: 0 };
  }
  const ratio = Math.max(0.14, Math.min(1, clientHeight / scrollHeight));
  const thumbHeightPct = Number((ratio * 100).toFixed(1));
  const maxScroll = Math.max(1, scrollHeight - clientHeight);
  const scrollProgress = Math.max(0, Math.min(1, (scrollTop || 0) / maxScroll));
  const thumbTopPct = Number((scrollProgress * (100 - thumbHeightPct)).toFixed(1));
  return { visible: true, thumbHeightPct, thumbTopPct };
}

export interface SquircleStageLayout {
  isExternalPlaylistVisible: boolean;
  chassisW: number;
  chassisH: number;
  topClearancePx: number;
  rightClearancePx: number;
  leftPaddingPx: number;
  leftRightGapPx: number;
  videoMaxWidthPx: number;
  videoMaxHeightPx: number;
}

/**
 * Computes responsive layout geometry for Zune Mode:
 * - Desktop / Laptop & Mobile Landscape: Two-column split-stage (Top-Left 16:9 Video + Under-Video Scrolling Playlist on left, Fit-to-Height 0.545:1 Zune 30 anchored on right).
 * - Mobile Portrait: Single-viewport vertical stack with external editorial playlist unmounted/hidden and centered 0.545:1 Zune 30 hardware unit.
 */
export function computeSquircleStageLayout(
  stageWidthPx: number,
  stageHeightPx: number,
  isMobilePortrait = false,
  isMobileLandscape = false,
  isPortraitVideoCollapsed = false
): SquircleStageLayout {
  const safeW = Number.isFinite(stageWidthPx) && stageWidthPx > 220 ? stageWidthPx : 1280;
  const safeH = Number.isFinite(stageHeightPx) && stageHeightPx > 220 ? stageHeightPx : 720;

  if (isMobilePortrait) {
    const topClearancePx = 8;
    const bottomPad = 10;
    const leftPaddingPx = 12;
    const rightClearancePx = 12;
    const videoGap = isPortraitVideoCollapsed ? 0 : 12;
    const maxW = Math.max(240, safeW - leftPaddingPx - rightClearancePx);
    const videoMaxHeightPx = isPortraitVideoCollapsed
      ? 0
      : Math.min(Math.round(safeH * 0.29), Math.round(maxW * (9 / 16)));
    const videoMaxWidthPx = isPortraitVideoCollapsed
      ? 0
      : Math.min(maxW, Math.round(videoMaxHeightPx * (16 / 9)));

    const maxChassisHByDvh = Math.min(Math.round(safeH * 0.56), 460);
    const maxChassisHByWidth = Math.floor((safeW * 0.54) / ZUNE_CHASSIS_ASPECT_RATIO);
    const chassisH = Math.max(220, Math.min(maxChassisHByDvh, maxChassisHByWidth));
    const chassisW = Math.round(chassisH * ZUNE_CHASSIS_ASPECT_RATIO);

    return {
      isExternalPlaylistVisible: true,
      chassisW,
      chassisH,
      topClearancePx,
      rightClearancePx,
      leftPaddingPx,
      leftRightGapPx: 0,
      videoMaxWidthPx,
      videoMaxHeightPx,
    };
  }

  const compactLandscape = isMobileLandscape || safeH <= 500;
  const topClearancePx = compactLandscape ? 12 : 20;
  const rightClearancePx = compactLandscape ? 42 : 44;
  const leftPaddingPx = compactLandscape ? 16 : 28;
  const leftRightGapPx = compactLandscape ? 20 : 32;
  const verticalMarginPx = compactLandscape ? 24 : 40;

  // Target full-height fit without horizontal squishing or starving the left column
  const desiredChassisH = Math.max(200, safeH - verticalMarginPx);
  const maxWidthAllowedForRightCol = compactLandscape
    ? Math.max(120, Math.round(safeW * 0.36))
    : Math.max(160, Math.round(safeW * 0.44));
  const maxChassisHByWidth = Math.floor(maxWidthAllowedForRightCol / ZUNE_CHASSIS_ASPECT_RATIO);
  const chassisH = Math.min(desiredChassisH, maxChassisHByWidth);
  const chassisW = Math.round(chassisH * ZUNE_CHASSIS_ASPECT_RATIO);

  const availLeftW = Math.max(
    180,
    safeW - chassisW - rightClearancePx - leftPaddingPx - leftRightGapPx
  );
  const videoMaxHeightPx = compactLandscape
    ? Math.max(108, Math.min(188, Math.round(safeH * 0.44)))
    : Math.max(180, Math.min(315, Math.round(Math.min(560, availLeftW) * (9 / 16))));
  const videoMaxWidthPx = compactLandscape
    ? Math.min(availLeftW, Math.round(videoMaxHeightPx * (16 / 9)))
    : Math.min(560, availLeftW);

  return {
    isExternalPlaylistVisible: true,
    chassisW,
    chassisH,
    topClearancePx,
    rightClearancePx,
    leftPaddingPx,
    leftRightGapPx,
    videoMaxWidthPx,
    videoMaxHeightPx,
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

/**
 * Builds ordered YouTube video screen-grab URLs (hq1/hq2/hq3 + maxres/sddefault/0) for
 * Zune LCD Phase-2 slow Ken Burns slideshow playback after initial album-art zoom.
 */
export function buildZuneYoutubeScreenGrabCandidates(
  youtubeVideoId?: string | null
): string[] {
  const cleanId = (youtubeVideoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    return [];
  }
  const base = `https://i.ytimg.com/vi/${cleanId}`;
  return [
    `${base}/hq1.jpg`,
    `${base}/hq2.jpg`,
    `${base}/hq3.jpg`,
    `${base}/maxresdefault.jpg`,
    `${base}/sddefault.jpg`,
    `${base}/0.jpg`,
  ];
}

export type ZuneColorwayId =
  | 'chocolate'
  | 'matte-black'
  | 'pearl-white'
  | 'crimson-red'
  | 'zune-pink';

export const ZUNE_COLORWAY_ORDER: readonly ZuneColorwayId[] = [
  'chocolate',
  'matte-black',
  'pearl-white',
  'crimson-red',
  'zune-pink',
] as const;

export const ZUNE_COLORWAY_STORAGE_KEY = 'maxyoutify_zune_colorway_v1';

export interface ZuneColorwaySpec {
  id: ZuneColorwayId;
  label: string;
  outerShellBg: string;
  outerShellGradient: string;
  outerShellShadow: string;
  coreBg: string;
  coreGradient: string;
  coreShadow: string;
  keyholeTopHex: string;
  keyholeMidHex: string;
  keyholeBotHex: string;
  keyholeSeamStroke: string;
  keyholeGlintStroke: string;
  circleBtnBg: string;
  circleBtnGradient: string;
  circleBtnGlyphColor: string;
  circleBtnShadow: string;
  dpadRingGradient: string;
  dpadInnerGradient: string;
  pillDotHex: string;
}

export const ZUNE_30_COLORWAYS: Record<ZuneColorwayId, ZuneColorwaySpec> = {
  chocolate: {
    id: 'chocolate',
    label: 'chocolate',
    outerShellBg: '#4D5E29',
    outerShellGradient:
      'linear-gradient(135deg, #5C6D34 0%, #4A5A27 42%, #445324 72%, #687B3B 100%)',
    outerShellShadow:
      'inset 0.5px 0.5px 1px rgba(122, 142, 73, 0.72), inset -0.5px -0.5px 1px rgba(122, 142, 73, 0.65), 0 0 0 0.75px rgba(38, 48, 18, 0.85), -14px 16px 28px rgba(0, 0, 0, 0.42), -4px 6px 10px rgba(0, 0, 0, 0.28)',
    coreBg: '#563E36',
    coreGradient:
      'linear-gradient(115deg, #563E36 0%, #63483F 42%, #523B34 78%, #47322B 100%)',
    coreShadow:
      '0 0 2px 0.5px rgba(74, 92, 36, 0.45), inset 0 0 2px 0.5px rgba(74, 92, 36, 0.35), inset -3px 0 6px rgba(255, 232, 218, 0.08), inset 0 -4px 8px rgba(20, 12, 9, 0.35), inset 0 1px 2px rgba(255, 226, 212, 0.1)',
    keyholeTopHex: '#3D4044',
    keyholeMidHex: '#2A2C2E',
    keyholeBotHex: '#34373B',
    keyholeSeamStroke: 'rgba(22, 12, 9, 0.78)',
    keyholeGlintStroke: 'rgba(255, 255, 255, 0.1)',
    circleBtnBg: '#563F37',
    circleBtnGradient: 'linear-gradient(145deg, #5C433B 0%, #543D36 55%, #4F3831 100%)',
    circleBtnGlyphColor: 'rgba(156, 134, 126, 0.82)',
    circleBtnShadow:
      '0 0 0 1px rgba(25, 14, 10, 0.72), inset 1px 1px 2px rgba(255, 225, 210, 0.14), inset -1px -1px 2px rgba(20, 10, 8, 0.45)',
    dpadRingGradient:
      'radial-gradient(circle at 66% 24%, rgba(255, 255, 255, 0.14) 0%, transparent 42%), radial-gradient(circle at 26% 76%, rgba(255, 255, 255, 0.1) 0%, transparent 40%), linear-gradient(135deg, #1E2023 0%, #101113 55%, #1A1C1F 100%)',
    dpadInnerGradient:
      'radial-gradient(circle at 46% 32%, #1D1F23 0%, #131417 68%, #0E0F12 100%)',
    pillDotHex: '#687B3B',
  },
  'matte-black': {
    id: 'matte-black',
    label: 'matte black',
    outerShellBg: '#2C2F34',
    outerShellGradient:
      'linear-gradient(135deg, #3D4148 0%, #2B2E33 44%, #212328 76%, #454950 100%)',
    outerShellShadow:
      'inset 0.5px 0.5px 1px rgba(170, 180, 194, 0.35), inset -0.5px -0.5px 1px rgba(120, 128, 140, 0.25), 0 0 0 0.75px rgba(14, 15, 18, 0.9), -14px 16px 28px rgba(0, 0, 0, 0.55), -4px 6px 10px rgba(0, 0, 0, 0.38)',
    coreBg: '#1D1E22',
    coreGradient:
      'linear-gradient(115deg, #1E2024 0%, #27292E 42%, #1C1D21 78%, #151619 100%)',
    coreShadow:
      '0 0 2px 0.5px rgba(70, 75, 84, 0.45), inset 0 0 2px 0.5px rgba(255, 255, 255, 0.06), inset -3px 0 6px rgba(255, 255, 255, 0.05), inset 0 -4px 8px rgba(0, 0, 0, 0.55), inset 0 1px 2px rgba(255, 255, 255, 0.08)',
    keyholeTopHex: '#2F3237',
    keyholeMidHex: '#1F2125',
    keyholeBotHex: '#282A2F',
    keyholeSeamStroke: 'rgba(6, 7, 9, 0.85)',
    keyholeGlintStroke: 'rgba(255, 255, 255, 0.14)',
    circleBtnBg: '#23252A',
    circleBtnGradient: 'linear-gradient(145deg, #2A2C32 0%, #222429 55%, #1A1C20 100%)',
    circleBtnGlyphColor: 'rgba(186, 194, 204, 0.78)',
    circleBtnShadow:
      '0 0 0 1px rgba(8, 9, 12, 0.85), inset 1px 1px 2px rgba(255, 255, 255, 0.12), inset -1px -1px 2px rgba(0, 0, 0, 0.65)',
    dpadRingGradient:
      'radial-gradient(circle at 66% 24%, rgba(255, 255, 255, 0.14) 0%, transparent 42%), radial-gradient(circle at 26% 76%, rgba(255, 255, 255, 0.1) 0%, transparent 40%), linear-gradient(135deg, #1B1D20 0%, #0E0F12 55%, #17191C 100%)',
    dpadInnerGradient:
      'radial-gradient(circle at 46% 32%, #1C1E22 0%, #121316 68%, #0C0D10 100%)',
    pillDotHex: '#525761',
  },
  'pearl-white': {
    id: 'pearl-white',
    label: 'pearl white',
    outerShellBg: '#D4DBE3',
    outerShellGradient:
      'linear-gradient(135deg, #EBF0F6 0%, #D3DAE3 46%, #C5CDD8 78%, #F4F7FA 100%)',
    outerShellShadow:
      'inset 0.5px 0.5px 1px rgba(255, 255, 255, 0.92), inset -0.5px -0.5px 1px rgba(176, 186, 200, 0.7), 0 0 0 0.75px rgba(154, 164, 178, 0.75), -14px 16px 28px rgba(0, 0, 0, 0.45), -4px 6px 10px rgba(0, 0, 0, 0.28)',
    coreBg: '#ECEFF4',
    coreGradient:
      'linear-gradient(115deg, #EFF2F6 0%, #FFFFFF 44%, #EAECEF 78%, #DCE1E8 100%)',
    coreShadow:
      '0 0 2px 0.5px rgba(210, 218, 228, 0.7), inset 0 0 2px 0.5px rgba(255, 255, 255, 0.9), inset -3px 0 6px rgba(255, 255, 255, 0.65), inset 0 -4px 8px rgba(140, 150, 165, 0.25), inset 0 1px 2px rgba(255, 255, 255, 0.95)',
    keyholeTopHex: '#464A52',
    keyholeMidHex: '#31343A',
    keyholeBotHex: '#3D4047',
    keyholeSeamStroke: 'rgba(128, 136, 148, 0.6)',
    keyholeGlintStroke: 'rgba(255, 255, 255, 0.16)',
    circleBtnBg: '#E7EBF0',
    circleBtnGradient: 'linear-gradient(145deg, #F8FAFC 0%, #E7EBF0 55%, #D8DEE6 100%)',
    circleBtnGlyphColor: 'rgba(66, 72, 82, 0.84)',
    circleBtnShadow:
      '0 0 0 1px rgba(145, 154, 168, 0.65), inset 1px 1px 2px rgba(255, 255, 255, 0.95), inset -1px -1px 2px rgba(130, 140, 156, 0.35)',
    dpadRingGradient:
      'radial-gradient(circle at 66% 24%, rgba(255, 255, 255, 0.18) 0%, transparent 42%), radial-gradient(circle at 26% 76%, rgba(255, 255, 255, 0.12) 0%, transparent 40%), linear-gradient(135deg, #25282D 0%, #16181B 55%, #202227 100%)',
    dpadInnerGradient:
      'radial-gradient(circle at 46% 32%, #24272C 0%, #17191C 68%, #111215 100%)',
    pillDotHex: '#E7ECF2',
  },
  'crimson-red': {
    id: 'crimson-red',
    label: 'crimson red',
    outerShellBg: '#7A1622',
    outerShellGradient:
      'linear-gradient(135deg, #A32030 0%, #7C1724 44%, #67111C 74%, #B52638 100%)',
    outerShellShadow:
      'inset 0.5px 0.5px 1px rgba(255, 145, 158, 0.42), inset -0.5px -0.5px 1px rgba(220, 72, 90, 0.35), 0 0 0 0.75px rgba(58, 8, 14, 0.85), -14px 16px 28px rgba(0, 0, 0, 0.48), -4px 6px 10px rgba(0, 0, 0, 0.3)',
    coreBg: '#8B1A26',
    coreGradient:
      'linear-gradient(115deg, #8B1A26 0%, #A32230 44%, #821722 78%, #6D111B 100%)',
    coreShadow:
      '0 0 2px 0.5px rgba(145, 28, 42, 0.5), inset 0 0 2px 0.5px rgba(255, 170, 180, 0.16), inset -3px 0 6px rgba(255, 200, 206, 0.1), inset 0 -4px 8px rgba(34, 4, 8, 0.45), inset 0 1px 2px rgba(255, 195, 202, 0.14)',
    keyholeTopHex: '#3A3B40',
    keyholeMidHex: '#27282C',
    keyholeBotHex: '#323438',
    keyholeSeamStroke: 'rgba(32, 6, 10, 0.76)',
    keyholeGlintStroke: 'rgba(255, 255, 255, 0.12)',
    circleBtnBg: '#8B1C28',
    circleBtnGradient: 'linear-gradient(145deg, #9B212E 0%, #891A26 55%, #78141F 100%)',
    circleBtnGlyphColor: 'rgba(255, 214, 219, 0.84)',
    circleBtnShadow:
      '0 0 0 1px rgba(42, 6, 10, 0.75), inset 1px 1px 2px rgba(255, 190, 198, 0.2), inset -1px -1px 2px rgba(28, 3, 6, 0.5)',
    dpadRingGradient:
      'radial-gradient(circle at 66% 24%, rgba(255, 255, 255, 0.14) 0%, transparent 42%), radial-gradient(circle at 26% 76%, rgba(255, 255, 255, 0.1) 0%, transparent 40%), linear-gradient(135deg, #1E2023 0%, #101113 55%, #1A1C1F 100%)',
    dpadInnerGradient:
      'radial-gradient(circle at 46% 32%, #1D1F23 0%, #131417 68%, #0E0F12 100%)',
    pillDotHex: '#B52638',
  },
  'zune-pink': {
    id: 'zune-pink',
    label: 'zune pink',
    outerShellBg: '#AC2B63',
    outerShellGradient:
      'linear-gradient(135deg, #DC4586 0%, #B32E68 44%, #9A2256 76%, #E85595 100%)',
    outerShellShadow:
      'inset 0.5px 0.5px 1px rgba(255, 186, 216, 0.5), inset -0.5px -0.5px 1px rgba(255, 130, 184, 0.38), 0 0 0 0.75px rgba(78, 12, 42, 0.82), -14px 16px 28px rgba(0, 0, 0, 0.45), -4px 6px 10px rgba(0, 0, 0, 0.28)',
    coreBg: '#C4286B',
    coreGradient:
      'linear-gradient(115deg, #C4286B 0%, #DA397E 44%, #BA2465 78%, #9D1B54 100%)',
    coreShadow:
      '0 0 2px 0.5px rgba(210, 52, 118, 0.48), inset 0 0 2px 0.5px rgba(255, 200, 224, 0.2), inset -3px 0 6px rgba(255, 220, 236, 0.14), inset 0 -4px 8px rgba(48, 6, 24, 0.4), inset 0 1px 2px rgba(255, 218, 234, 0.18)',
    keyholeTopHex: '#3B393F',
    keyholeMidHex: '#28272C',
    keyholeBotHex: '#333137',
    keyholeSeamStroke: 'rgba(46, 8, 26, 0.72)',
    keyholeGlintStroke: 'rgba(255, 255, 255, 0.12)',
    circleBtnBg: '#C22A6B',
    circleBtnGradient: 'linear-gradient(145deg, #D43479 0%, #C02869 55%, #AA205B 100%)',
    circleBtnGlyphColor: 'rgba(255, 228, 240, 0.88)',
    circleBtnShadow:
      '0 0 0 1px rgba(56, 10, 30, 0.72), inset 1px 1px 2px rgba(255, 214, 232, 0.24), inset -1px -1px 2px rgba(42, 6, 22, 0.48)',
    dpadRingGradient:
      'radial-gradient(circle at 66% 24%, rgba(255, 255, 255, 0.14) 0%, transparent 42%), radial-gradient(circle at 26% 76%, rgba(255, 255, 255, 0.1) 0%, transparent 40%), linear-gradient(135deg, #1E2023 0%, #101113 55%, #1A1C1F 100%)',
    dpadInnerGradient:
      'radial-gradient(circle at 46% 32%, #1D1F23 0%, #131417 68%, #0E0F12 100%)',
    pillDotHex: '#E6007E',
  },
};

export function normalizeZuneColorway(raw?: string | null): ZuneColorwayId {
  if (raw && (ZUNE_COLORWAY_ORDER as readonly string[]).includes(raw)) {
    return raw as ZuneColorwayId;
  }
  return 'chocolate';
}

export function loadSavedZuneColorway(storage?: Storage): ZuneColorwayId {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return 'chocolate';
  try {
    return normalizeZuneColorway(store.getItem(ZUNE_COLORWAY_STORAGE_KEY));
  } catch {
    return 'chocolate';
  }
}

export function saveZuneColorway(colorway: ZuneColorwayId, storage?: Storage): ZuneColorwayId {
  const normalized = normalizeZuneColorway(colorway);
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(ZUNE_COLORWAY_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
  }
  return normalized;
}

export function stepZuneColorway(
  current: ZuneColorwayId,
  direction: 'next' | 'prev'
): ZuneColorwayId {
  const idx = ZUNE_COLORWAY_ORDER.indexOf(current);
  const safeIdx = idx >= 0 ? idx : 0;
  const len = ZUNE_COLORWAY_ORDER.length;
  const nextIdx = direction === 'next' ? (safeIdx + 1) % len : (safeIdx - 1 + len) % len;
  return ZUNE_COLORWAY_ORDER[nextIdx];
}

export function evaluateZuneColorSwipeGesture(
  dx: number,
  dy: number
): 'next' | 'prev' | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    return dx < 0 ? 'next' : 'prev';
  }
  return null;
}

export const ZUNE_MOBILE_EDITORIAL_RIGHT_MASK =
  'linear-gradient(to right, #000000 0%, #000000 48%, rgba(0, 0, 0, 0.45) 68%, rgba(0, 0, 0, 0.08) 92%)';

export const ZUNE_VOLUME_BAR_COUNT = 20;
export const ZUNE_FAVORITES_STORAGE_KEY = 'maxyoutify_zune_favorites_v1';

/**
 * Converts normalized [0, 1] volume into 0..20 discrete horizontal bars for the Zune translucent volume strip.
 */
export function volumeToZuneStepCount(
  volume: number,
  totalBars = ZUNE_VOLUME_BAR_COUNT
): number {
  const safeTotal = Math.max(1, Math.floor(totalBars || ZUNE_VOLUME_BAR_COUNT));
  const clamped = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
  return Math.round(clamped * safeTotal);
}

/**
 * Formats 2-digit padded track index readout ("03 / 14") for the Zune Now Playing top header.
 */
export function formatZuneTrackIndexReadout(
  trackIndex: number,
  totalTracks: number
): string {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalTracks) ? totalTracks : 0));
  if (safeTotal === 0) return '00 / 00';
  const safeIdx = Math.max(0, Math.min(safeTotal - 1, Math.floor(Number.isFinite(trackIndex) ? trackIndex : 0)));
  const padWidth = Math.max(2, String(safeTotal).length);
  return `${String(safeIdx + 1).padStart(padWidth, '0')} / ${String(safeTotal).padStart(padWidth, '0')}`;
}

/**
 * Resolves the Left Circular Button (<-) Zune Twist screen toggle:
 * - Toggles smoothly between Now Playing album-art screen and root Twist Main Menu
 * - Steps back cleanly from Lyrics -> Now Playing and Playlist/Settings -> Home
 */
export function getZuneLeftButtonTarget(
  currentScreen: ZuneOsScreenId,
  isStandby = false
): ZuneOsScreenId {
  switch (currentScreen) {
    case 'now-playing':
      return 'home';
    case 'home':
      return isStandby ? 'playlist' : 'now-playing';
    case 'lyrics':
      return 'now-playing';
    case 'playlist':
    case 'settings':
    default:
      return 'home';
  }
}

export function loadSavedZuneFavorites(storage?: Storage): string[] {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return [];
  try {
    const raw = store.getItem(ZUNE_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function toggleZuneFavoriteTrackId(
  currentIds: readonly string[],
  trackId: string,
  storage?: Storage
): string[] {
  if (!trackId) return [...currentIds];
  const exists = currentIds.includes(trackId);
  const next = exists
    ? currentIds.filter((id) => id !== trackId)
    : [...currentIds, trackId];
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(ZUNE_FAVORITES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}
