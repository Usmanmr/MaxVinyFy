import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Maximize2,
  Minimize2,
  Disc3,
  Pointer,
  ChevronDown,
  Trash2,
  Check,
  X,
  Tv,
  Play,
  Pause,
  Power,
  Sparkles,
} from 'lucide-react';
import {
  selectActiveTvFrame,
  formatDuration,
  getTvChannelTheme,
  getNextTvChannelIndex,
  getBinaryKnobAngle,
  buildCleanYouTubeEmbedUrl,
  triggerButtonHaptic,
  CRT_TINT_PRESETS,
  getNextCrtTintIndex,
  getCrtTintKnobAngle,
  resolveActiveArtworkState,
  resolveEffectiveTvPlayState,
  computeFullscreenAudioHandoff,
  TV_CHANNEL_CHANGE_MS,
  TV_CLICK_DEBOUNCE_MS,
  TV_CABINET_SCREEN_APERTURE,
  type TrackItem,
  type YouTubeGrabFrame,
  type TvSongVideoChannel,
  type PlaylistPack,
  type DominantThemePalette,
} from '../utils/playerLogic';
import {
  playbackClockStore,
  usePlaybackSecond,
  usePlaybackTvBucket,
} from '../utils/playbackStore';
import {
  THEME_REGISTRY,
  DEFAULT_THEME_ID,
  type ThemeDefinition,
} from '../themes/themeRegistry';
import {
  getCassetteSpineStripeColor,
  splitPlaylistIntoOrganizerColumns,
} from '../utils/cassetteDeckLogic';
import { useCassetteSpinePalette } from '../utils/cassetteSpineColor';
import { formatDesktop98PlaylistEntry } from '../utils/desktop98Logic';
import { hexToRgbaString, STREAMLINE_CHANNEL_COUNT } from '../utils/streamlineLogic';
import { auroraHexToRgba, AURORA_PALETTE } from '../utils/auroraLogic';
import { computeMonitorDockIconScale } from '../utils/clickWheelLogic';
import {
  formatBraviaOsdBanner,
  computeRotatingCdTowerRackState,
  snapCdTowerRotationDeg,
  type BraviaOsdBannerKind,
} from '../utils/cdHifiLogic';
import { SonyBraviaRemote } from './SonyBraviaRemote';
import { retroAudio } from '../utils/retroAudioEngine';

export const BrandHeader = React.memo<{
  themePalette: DominantThemePalette;
  activeThemeId?: string;
  availableThemes?: readonly ThemeDefinition[];
  onSelectTheme?: (themeId: string) => void;
  isPlaying?: boolean;
  isStandby?: boolean;
  isDocumentHidden?: boolean;
  prefersReducedMotion?: boolean;
  compact?: boolean;
  className?: string;
}>(({
  themePalette,
  activeThemeId = DEFAULT_THEME_ID,
  compact = false,
  className = '',
}) => {
  return (
    <div
      id="app-brand-header"
      className={`relative z-30 flex items-center gap-2 min-w-0 shrink pl-[168px] md:pl-[194px] ${className}`}
    >
      <div className="flex flex-col justify-center leading-none min-w-0">
        <p
          id="app-brand-subtitle"
          style={{
            color:
              activeThemeId === 'cd-hifi'
                ? '#00F0FF'
                : activeThemeId === 'aurora-deck'
                ? '#4DE1FF'
                : activeThemeId === 'streamline'
                ? '#19C6A3'
                : activeThemeId === 'desktop-98'
                  ? '#00E36D'
                  : activeThemeId === 'squircle-pmp'
                    ? '#E6007E'
                    : activeThemeId === 'click-wheel'
                      ? '#2B5FD9'
                      : activeThemeId === 'cassette-deck'
                        ? '#ff736a'
                        : activeThemeId === 'reel-to-reel'
                          ? '#FF9F43'
                          : themePalette.lightHex,
          }}
          className={`hidden xl:block ${
            compact ? 'text-[9.5px]' : 'text-[10.5px]'
          } font-medium tracking-wider opacity-95 leading-none truncate`}
        >
          {activeThemeId === 'cd-hifi'
            ? 'Sony Hi-Fi 3-Disc · Bravia TV'
            : activeThemeId === 'aurora-deck'
            ? 'Aurora Deck · Holo Field'
            : activeThemeId === 'streamline'
            ? 'Streamline'
            : activeThemeId === 'desktop-98'
              ? "'98 Desktop Player & CRT Monitor"
              : activeThemeId === 'squircle-pmp'
                ? 'squircle pmp & oled monitor'
                : activeThemeId === 'click-wheel'
                  ? 'Click Wheel & LCD Display'
                  : activeThemeId === 'cassette-deck'
                    ? 'Cassette Deck & Portable TV'
                    : activeThemeId === 'reel-to-reel'
                      ? 'Reel-to-Reel & Console TV'
                      : 'Retro Turntable & TV'}
        </p>
      </div>
    </div>
  );
});

interface RetroTvTableProps {
  track: TrackItem;
  isPlaying: boolean;
  isDocumentHidden?: boolean;
  volume?: number;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  compactLandscape?: boolean;
  hideBrandHeader?: boolean;
  themePalette: DominantThemePalette;
  activeThemeId?: string;
  availableThemes?: readonly ThemeDefinition[];
  onSelectTheme?: (themeId: string) => void;
  seekEvent?: { timeSec: number; nonce: number };
  onSeek?: (targetSec: number) => void;
  onTogglePlay?: () => void;
  onStop?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  playlistTracks?: TrackItem[];
  onSelectTrack?: (trackId: string) => void;
  onChangeVolume?: (nextVolume: number) => void;
  onTvFullscreenChange?: (isFullscreen: boolean) => void;
  onResolvedTrackMetadata?: (
    trackId: string,
    artworkUrl: string,
    videoId: string,
    frames: YouTubeGrabFrame[]
  ) => void;
}

/**
 * Fullscreen-ONLY CRT Overlay Controls (Play/Pause + Seek Timeline + Exit Fullscreen).
 * Isolated with usePlaybackSecond() so normal CRT view never renders overlays or re-renders at 1Hz.
 */
const TvFullscreenOverlayControls = React.memo<{
  trackTitle: string;
  durationSec: number;
  effectiveTvPlaying: boolean;
  lowPowerMode: boolean;
  activeThemeId?: string;
  onToggleFullscreenPlayPause: () => void;
  onSeek: (targetSec: number) => void;
  onExitFullscreen: () => void;
}>(
  ({
    trackTitle,
    durationSec,
    effectiveTvPlaying,
    lowPowerMode,
    activeThemeId = DEFAULT_THEME_ID,
    onToggleFullscreenPlayPause,
    onSeek,
    onExitFullscreen,
  }) => {
  const currentSec = usePlaybackSecond();
  const safeDuration = Math.max(1, durationSec || 1);
  const clampedCurrent = Math.min(safeDuration, Math.max(0, currentSec));
  const isStreamline = activeThemeId === 'streamline';
  const isAurora = activeThemeId === 'aurora-deck';

  return (
    <div
      id="tv-fullscreen-overlay-controls"
      data-testid="tv-fullscreen-overlay-controls"
      style={
        isAurora
          ? {
              background:
                'radial-gradient(circle at center, transparent 48%, rgba(6, 7, 12, 0.72) 100%)',
            }
          : undefined
      }
      className="fixed inset-0 z-[9998] pointer-events-none flex flex-col justify-between p-4 sm:p-6"
    >
      {/* Top Bar: Track Badge & Always-Reachable Exit Fullscreen Button */}
      <div className="w-full flex items-center justify-between gap-3">
        <div
          className={`pointer-events-auto px-3 py-1.5 truncate max-w-[65%] ${
            isAurora
              ? 'aurora-glass-panel rounded-full text-[#EAF2FF] font-display font-light tracking-[0.06em] text-xs'
              : isStreamline
              ? 'rounded-[12px] bg-[#161A20]/90 backdrop-blur-md border border-white/15 text-[#FFFFFF] font-sans text-xs font-medium shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
              : 'rounded-md bg-black/75 border border-amber-300/35 text-amber-100 font-mono text-xs'
          }`}
        >
          {trackTitle}
        </div>
        <button
          id="tv-exit-fullscreen-btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExitFullscreen();
          }}
          aria-label="Exit Fullscreen (Esc)"
          title="Exit Fullscreen (Esc)"
          className={`pointer-events-auto px-3.5 py-2 flex items-center gap-2 cursor-pointer ${
            isAurora
              ? 'aurora-glass-panel rounded-full hover:border-[#4DE1FF]/70 text-[#EAF2FF] text-xs font-display font-light tracking-[0.06em]'
              : isStreamline
              ? 'rounded-[12px] bg-[#161A20]/92 hover:bg-[#1D232B] backdrop-blur-md border border-white/20 text-[#FFFFFF] text-xs font-sans font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.65)]'
              : 'rounded-md bg-black/85 hover:bg-black border-2 border-amber-300/75 text-amber-100 text-xs font-mono font-bold uppercase tracking-wider shadow-[0_6px_20px_rgba(0,0,0,0.9)]'
          }`}
        >
          <X
            strokeWidth={2.5}
            className={`w-4 h-4 ${
              isAurora ? 'text-[#4DE1FF]' : isStreamline ? 'text-[#19C6A3]' : 'text-amber-300'
            }`}
          />
          <span>Exit Fullscreen</span>
        </button>
      </div>

      {/* Bottom Transport Bar: Play/Pause Button + Seek Timeline */}
      <div
        id="tv-fullscreen-transport-bar"
        onClick={(e) => e.stopPropagation()}
        className={`pointer-events-auto w-full max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3 ${
          isAurora
            ? 'aurora-glass-panel rounded-full'
            : isStreamline
            ? 'rounded-[16px] bg-[#161A20]/92 backdrop-blur-md border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.65)]'
            : 'rounded-lg bg-black/85 border border-amber-300/40 shadow-[0_8px_28px_rgba(0,0,0,0.92)]'
        }`}
      >
        <button
          id="tv-fullscreen-play-pause-btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerButtonHaptic(lowPowerMode);
            onToggleFullscreenPlayPause();
          }}
          aria-label={effectiveTvPlaying ? 'Pause Video and Track' : 'Play Video and Track'}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer shadow ${
            isAurora
              ? 'bg-white/[0.12] border border-[#4DE1FF]/70 hover:border-[#4DE1FF] text-[#EAF2FF]'
              : isStreamline
              ? 'bg-[#FFFFFF] hover:bg-[#19C6A3] text-[#0F1115]'
              : 'bg-amber-400 hover:bg-amber-300 text-black'
          }`}
        >
          {effectiveTvPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <span
          className={`text-xs tabular-nums w-12 text-right shrink-0 ${
            isAurora
              ? 'font-mono font-extralight text-[#4DE1FF]'
              : isStreamline
              ? 'font-sans font-bold text-[#19C6A3]'
              : 'font-mono font-bold text-amber-300'
          }`}
        >
          {formatDuration(clampedCurrent)}
        </span>

        <input
          id="tv-fullscreen-seek-bar"
          type="range"
          min={0}
          max={safeDuration}
          step={1}
          value={clampedCurrent}
          onChange={(e) => {
            triggerButtonHaptic(lowPowerMode);
            onSeek(Number(e.target.value));
          }}
          aria-label="Fullscreen Video Timeline Seek"
          className={`flex-1 cursor-pointer h-2 ${
            isAurora ? 'accent-[#4DE1FF]' : isStreamline ? 'accent-[#19C6A3]' : 'accent-amber-400'
          }`}
        />

        <span
          className={`text-xs tabular-nums w-12 shrink-0 ${
            isAurora
              ? 'font-mono font-extralight text-[#8E9AB8]'
              : isStreamline
              ? 'font-sans font-bold text-[#A7AFBC]'
              : 'font-mono font-bold text-amber-100/80'
          }`}
        >
          {formatDuration(durationSec)}
        </span>
      </div>
    </div>
  );
}
);

/** Crossfading CRT image stage — updates at most once every 5 seconds with lazy loading & opacity crossfade */
const TvFrameCrossfadeStage = React.memo<{
  effectiveTrack: TrackItem;
  manualFrameIndex: number | null;
  frameOffset: number;
  channelCode: string;
  channelName: string;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  isFullscreen?: boolean;
}>(
  ({
    effectiveTrack,
    manualFrameIndex,
    frameOffset,
    channelCode,
    channelName,
    lowPowerMode,
    prefersReducedMotion,
    isFullscreen = false,
  }) => {
    const tvBucketSec = usePlaybackTvBucket();
    const safeFrames = Array.isArray(effectiveTrack.tvFrames) ? effectiveTrack.tvFrames : [];
    const totalFrames = Math.max(1, safeFrames.length);
    const baseSelection = selectActiveTvFrame(effectiveTrack, tvBucketSec, manualFrameIndex);
    const channelAdjustedIndex = (baseSelection.frameIndex + frameOffset) % totalFrames;
    const activeFrame = safeFrames[channelAdjustedIndex] || baseSelection.frame;

    const fallbackArt = resolveActiveArtworkState(effectiveTrack, 0).activeUrl || effectiveTrack.artworkUrl;
    const [slotImages, setSlotImages] = useState<[string, string]>([
      activeFrame?.imageUrl || fallbackArt,
      '',
    ]);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
      const nextUrl = activeFrame?.imageUrl || fallbackArt;
      if (!nextUrl) return;
      setImgError(false);

      if (lowPowerMode || prefersReducedMotion) {
        setSlotImages([nextUrl, '']);
        setActiveSlot(0);
        return;
      }

      setSlotImages((prev) => {
        if (prev[activeSlot] === nextUrl) return prev;
        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
        const updated: [string, string] = [...prev] as [string, string];
        updated[nextSlot] = nextUrl;
        setActiveSlot(nextSlot);
        return updated;
      });
    }, [activeFrame?.imageUrl, fallbackArt, lowPowerMode, prefersReducedMotion]);

    if (imgError || (!slotImages[0] && !slotImages[1])) {
      return (
        <div
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse at 45% 42%, #242d28 0%, #161c19 56%, #0b0e0d 100%)',
          }}
          className="w-full h-full"
        />
      );
    }

    const fadeClass =
      lowPowerMode || prefersReducedMotion ? '' : 'transition-opacity duration-500';

    const getFillScaleClass = (url: string) =>
      isFullscreen ? 'scale-100' : url.includes('ytimg.com') ? 'scale-[1.34]' : 'scale-[1.06]';
    const fitClass = isFullscreen ? 'object-contain' : 'object-cover object-center origin-center';

    return (
      <div
        data-tv-media-fill="true"
        className="relative w-full h-full overflow-hidden bg-[#050706]"
      >
        {slotImages[0] && (
          <img
            src={slotImages[0]}
            alt={`${channelCode} ${channelName} · ${effectiveTrack.title}`}
            data-tv-media-fill="true"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (fallbackArt && slotImages[0] !== fallbackArt) {
                setSlotImages([fallbackArt, '']);
                setActiveSlot(0);
              } else {
                setImgError(true);
              }
            }}
            style={{ opacity: activeSlot === 0 ? 0.98 : 0 }}
            className={`absolute inset-0 w-full h-full ${fitClass} ${getFillScaleClass(
              slotImages[0]
            )} ${fadeClass}`}
          />
        )}
        {slotImages[1] && (
          <img
            src={slotImages[1]}
            alt={`${channelCode} ${channelName} · ${effectiveTrack.title}`}
            data-tv-media-fill="true"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (fallbackArt && slotImages[1] !== fallbackArt) {
                setSlotImages([fallbackArt, '']);
                setActiveSlot(0);
              } else {
                setImgError(true);
              }
            }}
            style={{ opacity: activeSlot === 1 ? 0.98 : 0 }}
            className={`absolute inset-0 w-full h-full ${fitClass} ${getFillScaleClass(
              slotImages[1]
            )} ${fadeClass}`}
          />
        )}
      </div>
    );
  }
);

export const RetroTvTable = React.memo<RetroTvTableProps>(
  ({
    track,
    isPlaying,
    isDocumentHidden = false,
    volume = 0.8,
    lowPowerMode,
    prefersReducedMotion,
    compactLandscape = false,
    hideBrandHeader = false,
    themePalette,
    activeThemeId = DEFAULT_THEME_ID,
    availableThemes = THEME_REGISTRY,
    onSelectTheme,
    seekEvent,
    onSeek,
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    playlistTracks = [],
    onSelectTrack,
    onChangeVolume,
    onTvFullscreenChange,
    onResolvedTrackMetadata,
  }) => {
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;

    // 1. POWER knob state (On by default; when Off, screen goes dark/static)
    const [tvPoweredOn, setTvPoweredOn] = useState<boolean>(true);
    // 2. CHANNEL knob state (CH 1 = official video, CH 2..CH N = up to 8 distinct videos for this song)
    const [channelIndex, setChannelIndex] = useState<number>(0);
    // Multi-channel YouTube video cache per track ID (>= 5 videos per song)
    const [songChannels, setSongChannels] = useState<TvSongVideoChannel[]>([]);
    const [manualFrameIndex, setManualFrameIndex] = useState<number | null>(null);
    const [liveFrames, setLiveFrames] = useState<YouTubeGrabFrame[] | null>(null);
    const [resolvedVideoId, setResolvedVideoId] = useState<string>(track.youtubeVideoId);
    // Independent TV-screen click override (`null` = follow turntable audio isPlaying; boolean = user clicked TV directly)
    const [tvOverridePlaying, setTvOverridePlaying] = useState<boolean | null>(null);
    const [iframeMountTimeSec, setIframeMountTimeSec] = useState<number>(() =>
      Math.floor(playbackClockStore.getCurrentTimeSec())
    );

    // 2 Analogue Push-Buttons below the 3 knobs: FULL & SCAN + 3rd Tint knob
    const [isTvFullscreen, setIsTvFullscreen] = useState<boolean>(false);
    const [crtScanlinesOn, setCrtScanlinesOn] = useState<boolean>(true);
    const [tintPresetIndex, setTintPresetIndex] = useState<number>(0);

    const [isChannelChanging, setIsChannelChanging] = useState<boolean>(false);
    const [channelFlashTick, setChannelFlashTick] = useState<number>(0);
    const [iframeUnavailable, setIframeUnavailable] = useState<boolean>(false);
    const [cwDockVisible, setCwDockVisible] = useState<boolean>(true);
    const [cwHoveredDockIdx, setCwHoveredDockIdx] = useState<number | null>(null);

    // Sony Bravia Plasma/LCD TV & RMT-TX102U Remote State (active when activeThemeId === 'cd-hifi')
    const [braviaPicOff, setBraviaPicOff] = useState<boolean>(false);
    const [braviaMuted, setBraviaMuted] = useState<boolean>(false);
    const [braviaInputIndex, setBraviaInputIndex] = useState<number>(0);
    const [braviaDisplayModeIdx, setBraviaDisplayModeIdx] = useState<number>(0);
    const [braviaRemoteOpenNonce, setBraviaRemoteOpenNonce] = useState<number>(0);
    const [braviaOsd, setBraviaOsd] = useState<{
      badge: string;
      title: string;
      subtitle: string;
    } | null>(null);

    const tvScreenRef = useRef<HTMLDivElement | null>(null);
    const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
    const prevTrackIdRef = useRef<string>(track.id);
    const prevEffectivePlayingRef = useRef<boolean>(false);
    const prevFullscreenRef = useRef<boolean>(false);
    const channelFlashTimerRef = useRef<number | null>(null);
    const tvClickTimerRef = useRef<number | null>(null);
    const cwDockIdleTimerRef = useRef<number | null>(null);
    const braviaOsdTimerRef = useRef<number | null>(null);
    const prevBraviaChannelRef = useRef<number>(0);
    const braviaPreMuteVolumeRef = useRef<number>(0.8);
    const channelsCacheByTrackRef = useRef<Map<string, TvSongVideoChannel[]>>(new Map());

    const BRAVIA_INPUT_LABELS = [
      'HDMI 1 · SONY HI-FI',
      'COMPONENT · 3-DISC',
      'DIGITAL TV · ATSC',
      'AV 2 · OPTICAL',
    ] as const;
    const BRAVIA_DISPLAY_MODES = [
      '1080i · 16:9 WIDE',
      'CINEMA · 24P TRUE',
      'VFD SPECTRUM SYNC',
      'OPTICAL PCM · 44.1kHz',
    ] as const;

    const totalTvChannels = Math.max(5, songChannels.length);
    const activeChannelTheme = getTvChannelTheme(channelIndex, totalTvChannels);
    const activeTintPreset = CRT_TINT_PRESETS[tintPresetIndex] || CRT_TINT_PRESETS[0];
    const volumePct = Math.round(
      (Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8) * 100
    );

    const { effectivePlaying: effectiveTvPlaying, isOverridden: hasTvPlayOverride } =
      resolveEffectiveTvPlayState({
        audioIsPlaying: isPlaying,
        tvOverridePlaying,
        tvPoweredOn,
        isStandby,
      });

    const sendYouTubePlayerCommand = (func: string, args: unknown = '') => {
      const win = ytIframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage(
          JSON.stringify({
            event: 'command',
            func,
            args,
          }),
          '*'
        );
        if (import.meta.env.DEV) {
          console.debug('[MaxYoutify TV] postMessage command:', func, args);
        }
      } catch {
        // Ignore cross-origin frame timing errors
      }
    };

    // Fullscreen synchronization + Escape key exit listener
    useEffect(() => {
      const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
          setIsTvFullscreen(false);
        } else if (tvScreenRef.current && document.fullscreenElement === tvScreenRef.current) {
          setIsTvFullscreen(true);
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsTvFullscreen(false);
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
        }
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, []);

    // Fullscreen Audio Handoff:
    // - Enter fullscreen -> pause/mute Spotify audio, unmute YouTube at synced Spotify volume & timeline time, play YouTube
    // - Exit fullscreen -> mute/pause YouTube video and unmute/resume Spotify audio at synced timeline time
    useEffect(() => {
      const wasFullscreen = prevFullscreenRef.current;
      if (wasFullscreen === isTvFullscreen) return;
      prevFullscreenRef.current = isTvFullscreen;

      const syncedSec = Math.floor(playbackClockStore.getCurrentTimeSec());
      const handoff = computeFullscreenAudioHandoff({
        enteringFullscreen: isTvFullscreen,
        spotifyVolume: volume,
        currentTimeSec: syncedSec,
      });

      onTvFullscreenChange?.(isTvFullscreen);

      if (isTvFullscreen) {
        setTvOverridePlaying(true);
        if (tvPoweredOn && !isStandby) {
          sendYouTubePlayerCommand('unMute');
          sendYouTubePlayerCommand('setVolume', [handoff.youtubeVolumePct]);
          sendYouTubePlayerCommand('seekTo', [handoff.syncedTimeSec, true]);
          sendYouTubePlayerCommand('playVideo');
        }
      } else {
        sendYouTubePlayerCommand('mute');
        sendYouTubePlayerCommand('pauseVideo');
        setTvOverridePlaying(false);
      }
    }, [isTvFullscreen, tvPoweredOn, isStandby, volume, onTvFullscreenChange]);

    // Keep YouTube fullscreen volume synchronized when user adjusts the volume slider
    useEffect(() => {
      if (!isTvFullscreen || !tvPoweredOn || isStandby) return;
      sendYouTubePlayerCommand('setVolume', [volumePct]);
    }, [isTvFullscreen, tvPoweredOn, isStandby, volumePct]);

    const triggerOneShotChannelChange = () => {
      if (prefersReducedMotion || lowPowerMode) return;
      if (channelFlashTimerRef.current !== null) {
        window.clearTimeout(channelFlashTimerRef.current);
      }
      setIsChannelChanging(true);
      setChannelFlashTick((tick) => tick + 1);
      channelFlashTimerRef.current = window.setTimeout(() => {
        setIsChannelChanging(false);
        channelFlashTimerRef.current = null;
      }, TV_CHANNEL_CHANGE_MS);
    };

    useEffect(() => {
      return () => {
        if (channelFlashTimerRef.current !== null) {
          window.clearTimeout(channelFlashTimerRef.current);
        }
        if (tvClickTimerRef.current !== null) {
          window.clearTimeout(tvClickTimerRef.current);
        }
        if (cwDockIdleTimerRef.current !== null) {
          window.clearTimeout(cwDockIdleTimerRef.current);
        }
      };
    }, []);

    // Synchronize YouTube iframe Play/Pause state whenever audio state, independent TV click override, or TV power changes
    useEffect(() => {
      if (prevEffectivePlayingRef.current === effectiveTvPlaying) return;
      prevEffectivePlayingRef.current = effectiveTvPlaying;
      if (!tvPoweredOn || isStandby) return;

      if (effectiveTvPlaying) {
        const audioPos = Math.floor(playbackClockStore.getCurrentTimeSec());
        sendYouTubePlayerCommand('seekTo', [audioPos, true]);
        sendYouTubePlayerCommand('playVideo');
      } else {
        sendYouTubePlayerCommand('pauseVideo');
      }
    }, [effectiveTvPlaying, tvPoweredOn, isStandby]);

    // Synchronize YouTube iframe seek position when scrubbing timeline, dragging tonearm, or stopping
    useEffect(() => {
      if (!seekEvent || seekEvent.nonce === 0) return;
      if (!tvPoweredOn || isStandby) return;
      sendYouTubePlayerCommand('seekTo', [Math.max(0, Math.floor(seekEvent.timeSec)), true]);
    }, [seekEvent?.nonce, seekEvent?.timeSec, tvPoweredOn, isStandby]);

    // Reset independent TV override, stale channel list, and timeline start offset whenever active track changes
    useEffect(() => {
      if (prevTrackIdRef.current !== track.id) {
        prevTrackIdRef.current = track.id;
        setChannelIndex(0);
        setTvOverridePlaying(null);
        setIframeMountTimeSec(0);
        if (import.meta.env.DEV) {
          console.debug('[MaxYoutify TV] Track changed -> resetting TV sync & resolving video:', track.id, track.title);
        }
        if (!isStandby && tvPoweredOn) {
          triggerOneShotChannelChange();
        } else {
          setIsChannelChanging(false);
        }
      }
    }, [track.id, track.title, isStandby, tvPoweredOn, prefersReducedMotion, lowPowerMode]);

    const trackRef = useRef(track);
    trackRef.current = track;

    // Fetch 5 YouTube video channels (CH 1 official + CH 2-5 top 4 most-viewed alternates) for the current song
    useEffect(() => {
      const currentTrack = trackRef.current;
      setManualFrameIndex(null);
      setSongChannels([]);
      setLiveFrames(null);
      setResolvedVideoId(currentTrack.youtubeVideoId);

      const cached = channelsCacheByTrackRef.current.get(currentTrack.id);
      if (cached && cached.length > 0) {
        setSongChannels(cached);
        setLiveFrames(cached[0].frames);
        setResolvedVideoId(cached[0].videoId);
        return;
      }

      if (isStandby || !currentTrack.title) return;

      let cancelled = false;
      const targetTrackId = currentTrack.id;
      const fetchSongYouTubeGrabs = async () => {
        try {
          const params = new URLSearchParams({
            title: currentTrack.title,
            artist: currentTrack.artist,
            trackId: targetTrackId,
            videoId: currentTrack.youtubeVideoId,
          });
          const res = await fetch(`/api/youtube/search-grabs?${params.toString()}`);
          if (!res.ok || cancelled) return;
          const data = await res.json();
          if (cancelled || trackRef.current.id !== targetTrackId) return;

          if (Array.isArray(data.channels) && data.channels.length > 0) {
            channelsCacheByTrackRef.current.set(targetTrackId, data.channels);
            setSongChannels(data.channels);
          }

          if (Array.isArray(data.frames) && data.frames.length > 0) {
            setLiveFrames(data.frames);
            if (data.videoId) setResolvedVideoId(data.videoId);

            if (onResolvedTrackMetadata) {
              onResolvedTrackMetadata(
                targetTrackId,
                data.artworkUrl || currentTrack.artworkUrl,
                data.videoId || currentTrack.youtubeVideoId,
                data.frames
              );
            }
          }
        } catch {
          // Fallback to pre-populated frames
        }
      };

      fetchSongYouTubeGrabs();
      return () => {
        cancelled = true;
      };
    }, [track.id, isStandby, onResolvedTrackMetadata]);

    // Resolve active channel's videoId and frames from the 5-channel song video list
    const activeSongChannel: TvSongVideoChannel | null =
      songChannels[channelIndex] || songChannels[0] || null;
    const activeChannelVideoId =
      activeSongChannel?.videoId || resolvedVideoId || track.youtubeVideoId;
    const activeChannelFrames =
      activeSongChannel?.frames && activeSongChannel.frames.length > 0
        ? activeSongChannel.frames
        : liveFrames && liveFrames.length > 0
        ? liveFrames
        : Array.isArray(track.tvFrames)
        ? track.tvFrames
        : [];

    const effectiveTrack: TrackItem = useMemo(
      () => ({
        ...track,
        youtubeVideoId: activeChannelVideoId,
        tvFrames: activeChannelFrames,
      }),
      [track, activeChannelVideoId, activeChannelFrames]
    );

    // Reset YouTube embed error state whenever track or channel video changes
    useEffect(() => {
      setIframeUnavailable(false);
    }, [track.id, activeChannelVideoId, channelIndex]);

    // Listen for YouTube IFrame Player API postMessages; if YouTube rejects embed (e.g. error 150 / isPlayable:false),
    // hide the broken embed UI so the CRT broadcast frame crossfade shows cleanly instead.
    useEffect(() => {
      const handleYouTubeMessage = (event: MessageEvent) => {
        if (
          typeof event.origin === 'string' &&
          !event.origin.includes('youtube.com') &&
          !event.origin.includes('youtube-nocookie.com')
        ) {
          return;
        }
        if (
          ytIframeRef.current?.contentWindow &&
          event.source &&
          event.source !== ytIframeRef.current.contentWindow
        ) {
          return;
        }
        let payload: { event?: string; info?: unknown } | null = null;
        if (typeof event.data === 'string') {
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }
        } else if (event.data && typeof event.data === 'object') {
          payload = event.data as { event?: string; info?: unknown };
        }
        if (!payload) return;

        const isErrorEvent = payload.event === 'onError';
        const infoObj =
          payload.info && typeof payload.info === 'object'
            ? (payload.info as { videoData?: { isPlayable?: boolean; errorCode?: string } })
            : null;
        const isUnplayableDelivery =
          payload.event === 'initialDelivery' &&
          infoObj?.videoData?.isPlayable === false;

        if (isErrorEvent || isUnplayableDelivery) {
          if (import.meta.env.DEV) {
            console.debug('[MaxYoutify TV] YouTube embed unavailable -> showing CRT stage fallback', {
              event: payload.event,
              info: payload.info,
            });
          }
          setIframeUnavailable(true);
        }
      };

      window.addEventListener('message', handleYouTubeMessage);
      return () => {
        window.removeEventListener('message', handleYouTubeMessage);
      };
    }, []);

    const handleTogglePowerKnob = () => {
      triggerButtonHaptic(lowPowerMode);
      setTvPoweredOn((prev) => {
        const next = !prev;
        if (next) {
          triggerOneShotChannelChange();
        }
        return next;
      });
    };

    const handleTurnChannelKnob = () => {
      triggerButtonHaptic(lowPowerMode);
      setChannelIndex((prev) => getNextTvChannelIndex(prev, totalTvChannels));
      if (tvPoweredOn) {
        triggerOneShotChannelChange();
      }
    };

    const handleEnterTvFullscreen = async () => {
      triggerButtonHaptic(lowPowerMode);
      setIframeMountTimeSec(Math.floor(playbackClockStore.getCurrentTimeSec()));
      setIsTvFullscreen(true);
      const target = tvScreenRef.current;
      if (target && typeof target.requestFullscreen === 'function' && !document.fullscreenElement) {
        try {
          await target.requestFullscreen();
        } catch {
          // Fallback overlay fullscreen remains active even if browser blocks native requestFullscreen
        }
      }
    };

    const handleExitTvFullscreen = async () => {
      triggerButtonHaptic(lowPowerMode);
      setIsTvFullscreen(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen?.();
        } catch {
          // ignore
        }
      }
    };

    const handleToggleTvFullscreen = () => {
      if (isTvFullscreen) {
        handleExitTvFullscreen();
      } else {
        handleEnterTvFullscreen();
      }
    };

    const clearPendingTvClickTimer = () => {
      if (tvClickTimerRef.current !== null) {
        window.clearTimeout(tvClickTimerRef.current);
        tvClickTimerRef.current = null;
      }
    };

    const toggleIndependentTvVideoPlayback = () => {
      if (isStandby || !tvPoweredOn) return;
      triggerButtonHaptic(lowPowerMode);
      const nextTvPlaying = !effectiveTvPlaying;
      setTvOverridePlaying(nextTvPlaying);
      if (import.meta.env.DEV) {
        console.debug(
          '[MaxYoutify TV] Screen click -> independent video toggle:',
          nextTvPlaying ? 'PLAY' : 'PAUSE',
          '(audio isPlaying:',
          isPlaying,
          ')'
        );
      }
      if (nextTvPlaying) {
        sendYouTubePlayerCommand('seekTo', [Math.floor(playbackClockStore.getCurrentTimeSec()), true]);
        sendYouTubePlayerCommand('playVideo');
      } else {
        sendYouTubePlayerCommand('pauseVideo');
      }
    };

    // Debounced single click toggles TV video playback independently; double-click cancels timer and toggles fullscreen
    const handleTvScreenSingleClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;
      if (e.detail >= 2) {
        clearPendingTvClickTimer();
        return;
      }
      clearPendingTvClickTimer();
      tvClickTimerRef.current = window.setTimeout(() => {
        tvClickTimerRef.current = null;
        toggleIndependentTvVideoPlayback();
      }, TV_CLICK_DEBOUNCE_MS);
    };

    const handleTvScreenDoubleClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;
      e.preventDefault();
      e.stopPropagation();
      clearPendingTvClickTimer();
      if (import.meta.env.DEV) {
        console.debug('[MaxYoutify TV] Screen double-click -> toggle fullscreen');
      }
      handleToggleTvFullscreen();
    };

    const handleCycleTintButton = () => {
      triggerButtonHaptic(lowPowerMode);
      setTintPresetIndex((prev) => getNextCrtTintIndex(prev));
      if (tvPoweredOn) {
        triggerOneShotChannelChange();
      }
    };

    const isReelTheme = activeThemeId === 'reel-to-reel';
    const isCassetteTheme = activeThemeId === 'cassette-deck';
    const isCdHifiTheme = activeThemeId === 'cd-hifi';
    const isClickWheelTheme = activeThemeId === 'click-wheel';
    const isSquircleTheme = activeThemeId === 'squircle-pmp';
    const isDesktop98Theme = activeThemeId === 'desktop-98';
    const isStreamlineTheme = activeThemeId === 'streamline';
    const isAuroraTheme = activeThemeId === 'aurora-deck';
    const showCrtEffects =
      !isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && crtScanlinesOn && !lowPowerMode;
    const powerKnobAngleDeg = getBinaryKnobAngle(tvPoweredOn);
    const tintKnobAngleDeg = getCrtTintKnobAngle(tintPresetIndex);
    const channelNumberLabel = `CH ${channelIndex + 1}`;
    const knobTransition =
      prefersReducedMotion || lowPowerMode ? 'none' : 'transform 160ms linear';

    const triggerBraviaOsd = React.useCallback(
      (title: string, subtitle: string, badge = 'BRAVIA OSD') => {
        if (braviaOsdTimerRef.current !== null) {
          window.clearTimeout(braviaOsdTimerRef.current);
        }
        setBraviaOsd({ badge, title, subtitle });
        braviaOsdTimerRef.current = window.setTimeout(() => {
          setBraviaOsd(null);
          braviaOsdTimerRef.current = null;
        }, 2400);
      },
      []
    );

    useEffect(() => {
      return () => {
        if (braviaOsdTimerRef.current !== null) {
          window.clearTimeout(braviaOsdTimerRef.current);
        }
      };
    }, []);

    const scheduleCwDockHide = React.useCallback(() => {
      if (cwDockIdleTimerRef.current !== null) {
        window.clearTimeout(cwDockIdleTimerRef.current);
      }
      cwDockIdleTimerRef.current = window.setTimeout(() => {
        setCwDockVisible(false);
        cwDockIdleTimerRef.current = null;
      }, 3000);
    }, []);

    const wakeCwMonitorDock = React.useCallback(() => {
      if (!isClickWheelTheme) return;
      setCwDockVisible(true);
      scheduleCwDockHide();
    }, [isClickWheelTheme, scheduleCwDockHide]);

    useEffect(() => {
      if (!isClickWheelTheme) {
        if (cwDockIdleTimerRef.current !== null) {
          window.clearTimeout(cwDockIdleTimerRef.current);
          cwDockIdleTimerRef.current = null;
        }
        return;
      }
      setCwDockVisible(true);
      scheduleCwDockHide();
      return () => {
        if (cwDockIdleTimerRef.current !== null) {
          window.clearTimeout(cwDockIdleTimerRef.current);
          cwDockIdleTimerRef.current = null;
        }
      };
    }, [isClickWheelTheme, scheduleCwDockHide]);

    return (
      <section
        aria-label={
          isAuroraTheme
            ? 'Aurora Deck Bezel-Less Floating Holo-Panel'
            : isStreamlineTheme
            ? 'Streamline Borderless Music Video Card'
            : isCdHifiTheme
              ? 'Sony Bravia Wide-Screen Plasma/LCD Television'
              : isDesktop98Theme
                ? '1998 Beige Desktop CRT Computer Monitor'
                : isSquircleTheme
                  ? '2006-2011 Soft-Touch Brown OLED Monitor Display'
                  : isClickWheelTheme
                    ? '2004-2008 White and Silver Flat-Panel LCD Display'
                    : isCassetteTheme
                      ? 'Mid-1980s Portable Charcoal Plastic CRT Television'
                      : isReelTheme
                        ? '1960s Walnut Console Television'
                        : 'Photorealistic 1970s CRT Television on Vintage Table'
        }
        className="relative flex flex-col justify-between gap-0 select-none w-full h-auto min-h-0 overflow-visible z-30"
      >
        {/* Top Balanced Horizontal Header Composition */}
        {!hideBrandHeader && (
          <div
            id="tv-top-header-bar"
            className={`relative w-full flex items-center justify-between px-1 ${
              compactLandscape ? 'min-h-[38px] pb-0.5' : 'min-h-[42px] md:min-h-[54px] pb-1'
            } shrink-0 z-30`}
          >
            <BrandHeader
              themePalette={themePalette}
              activeThemeId={activeThemeId}
              availableThemes={availableThemes}
              onSelectTheme={onSelectTheme}
              isPlaying={isPlaying}
              isStandby={isStandby}
              isDocumentHidden={isDocumentHidden}
              prefersReducedMotion={prefersReducedMotion}
              compact={compactLandscape}
            />

            {isCdHifiTheme ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="bravia-summon-remote-btn"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    setBraviaRemoteOpenNonce((n) => n + 1);
                  }}
                  aria-label="Show Sony RMT-TX102U Remote Control"
                  title="Show / Summon Sony RMT-TX102U TV Remote"
                  className="px-2 py-0.5 rounded-[4px] border border-[#00F0FF]/55 bg-[#0A0E17] hover:bg-[#111927] text-[#00F0FF] font-mono text-[9.5px] font-bold tracking-wider uppercase shadow-[0_0_8px_rgba(0,240,255,0.2)] flex items-center gap-1 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_5px_#38BDF8]" />
                  <span>REMOTE</span>
                </button>
                <div
                  id="bravia-tv-header-badge"
                  aria-hidden="true"
                  className="pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] border border-white/15 bg-[#12151C] shadow-sm text-[9.5px] font-mono font-bold text-[#E2E8F0] shrink-0"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      tvPoweredOn ? 'bg-[#22C55E] shadow-[0_0_6px_#22C55E]' : 'bg-[#EF4444]'
                    }`}
                  />
                  <span className="tabular-nums">BRAVIA · {channelNumberLabel}</span>
                </div>
              </div>
            ) : isAuroraTheme ? (
              <div
                id="aurora-tv-header-badge"
                aria-hidden="true"
                className="pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.14] bg-white/[0.06] backdrop-blur-md text-[10.5px] font-mono font-extralight text-[#EAF2FF] shrink-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    tvPoweredOn ? 'bg-[#4DE1FF] shadow-[0_0_8px_#4DE1FF]' : 'bg-[#8E9AB8]/60'
                  }`}
                />
                <span className="tabular-nums">HOLO · {channelNumberLabel}</span>
              </div>
            ) : isStreamlineTheme ? (
              <div
                id="sl-video-header-badge"
                aria-hidden="true"
                className="pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-[#161A20] shadow-sm text-[11px] font-medium text-[#A7AFBC] shrink-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    tvPoweredOn ? 'bg-[#19C6A3]' : 'bg-[#5E6673]'
                  }`}
                />
                <span className="tabular-nums">{channelNumberLabel}</span>
              </div>
            ) : isDesktop98Theme ? (
              /* 1998 Skinned Steel & LED Monitor Channel Badge */
              <div
                id="d98-crt-header-badge"
                aria-hidden="true"
                className="pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border border-[#6E8298] bg-[#1E2733] shadow-sm text-[9px] font-['Silkscreen',monospace] text-[#00E36D] shrink-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-[1px] ${
                    tvPoweredOn ? 'bg-[#00E36D]' : 'bg-[#6E8298]/50'
                  }`}
                />
                <span className="tabular-nums">CRT-98 · {channelNumberLabel}</span>
              </div>
            ) : isSquircleTheme ? (
              /* Minimal Soft-Touch Brown & Olive OLED Channel Status Pill */
              <div
                id="sq-monitor-header-badge"
                aria-hidden="true"
                className="pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] border border-[#857F74] bg-[#4A3A2E] shadow-sm text-[10px] font-medium lowercase text-[#FFFFFF] shrink-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    tvPoweredOn ? 'bg-[#E6007E]' : 'bg-[#9B938B]'
                  }`}
                />
                <span className="tabular-nums">{channelNumberLabel.toLowerCase()}</span>
              </div>
            ) : isClickWheelTheme ? (
              /* Minimal White/Silver Bezel Channel Status Badge for Flat-Panel LCD */
              <div
                id="cw-lcd-header-badge"
                aria-hidden="true"
                className="pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#C3C7CC] bg-[#FAFAFA] shadow-sm text-[10px] font-medium text-[#6E6E73] shrink-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    tvPoweredOn ? 'bg-[#3478F6]' : 'bg-[#8A8F98]'
                  }`}
                />
                <span className="tabular-nums">{channelNumberLabel}</span>
              </div>
            ) : isCassetteTheme ? (
              /* Early-1980s Silver Portable CRT Carry Handle + Telescoping Chrome Antenna */
              <div
                id="tv-rabbit-ear-antennas"
                aria-hidden="true"
                className="pointer-events-none relative flex items-end justify-end gap-1 translate-y-[2px] mr-1.5 sm:mr-2.5 shrink-0 z-20"
              >
                <div
                  id="portable-tv-carry-handle"
                  className="flex items-end"
                >
                  <div className="w-9 lg:w-16 h-[7px] sm:h-[9px] rounded-t-[6px] border-t-[3px] border-x-[3px] border-[#D4D6D9] bg-transparent shadow-[0_-1px_2px_rgba(255,255,255,0.65)] flex items-end justify-between px-1">
                    <span className="w-1.5 h-[3px] bg-[#6E7278]" />
                    <span className="w-1.5 h-[3px] bg-[#6E7278]" />
                  </div>
                </div>

                <svg
                  viewBox="0 0 58 34"
                  className={compactLandscape ? 'w-8 h-4' : 'w-9 lg:w-12 h-5 lg:h-6'}
                >
                  <defs>
                    <linearGradient id="casTelAntennaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#9DA0A4" />
                      <stop offset="50%" stopColor="#F4F5F7" />
                      <stop offset="100%" stopColor="#7C8087" />
                    </linearGradient>
                  </defs>
                  <line x1="12" y1="29" x2="29" y2="17" stroke="#D4D6D9" strokeWidth="3.6" strokeLinecap="round" />
                  <line x1="29" y1="17" x2="49" y2="5" stroke="url(#casTelAntennaGrad)" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="49" cy="5" r="3" fill="#D64541" stroke="#141516" strokeWidth="1" />
                  <circle cx="12" cy="29" r="3.5" fill="#D4D6D9" stroke="#141516" strokeWidth="1.2" />
                  <rect x="4" y="29" width="18" height="4.5" rx="1.5" fill="#9DA0A4" stroke="#6E7278" strokeWidth="1" />
                </svg>
              </div>
            ) : (
              /* Right-Positioned Retro Rabbit-Ear Dipole Antenna Assembly */
              <div
                id="tv-rabbit-ear-antennas"
                aria-hidden="true"
                className="pointer-events-none relative flex flex-col items-center justify-end translate-y-[4px] mr-[2%] sm:mr-[4%] shrink-0 z-20"
              >
                <svg
                  viewBox="0 0 220 44"
                  className={
                    compactLandscape
                      ? 'w-16 h-4 overflow-visible'
                      : 'w-28 sm:w-40 h-5 sm:h-7 overflow-visible'
                  }
                >
                  <defs>
                    <linearGradient id="antennaRodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#71717a" />
                      <stop offset="48%" stopColor="#f4f4f5" />
                      <stop offset="100%" stopColor="#52525b" />
                    </linearGradient>
                    <linearGradient id="antennaBaseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={isReelTheme ? '#C9CCCE' : '#5a351d'} />
                      <stop offset="55%" stopColor={isReelTheme ? '#8f9397' : '#2b180c'} />
                      <stop offset="100%" stopColor={isReelTheme ? '#54575b' : '#140b05'} />
                    </linearGradient>
                  </defs>
                  <line x1="96" y1="36" x2="16" y2="3" stroke="url(#antennaRodGrad)" strokeWidth="3.2" strokeLinecap="round" />
                  <line x1="96" y1="36" x2="56" y2="19.5" stroke="#d4d4d8" strokeWidth="4.4" strokeLinecap="round" />
                  <circle cx="16" cy="3" r="4" fill={isReelTheme ? '#E8590C' : '#d97706'} stroke="#27272a" strokeWidth="1.2" />

                  <line x1="124" y1="36" x2="204" y2="3" stroke="url(#antennaRodGrad)" strokeWidth="3.2" strokeLinecap="round" />
                  <line x1="124" y1="36" x2="164" y2="19.5" stroke="#d4d4d8" strokeWidth="4.4" strokeLinecap="round" />
                  <circle cx="204" cy="3" r="4" fill={isReelTheme ? '#E8590C' : '#d97706'} stroke="#27272a" strokeWidth="1.2" />

                  <circle cx="96" cy="35" r="4.5" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.2" />
                  <circle cx="124" cy="35" r="4.5" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.2" />

                  <path
                    d="M 70 43 L 78 31 L 142 31 L 150 43 Z"
                    fill="url(#antennaBaseGrad)"
                    stroke={isReelTheme ? '#6c7074' : '#7c4d2b'}
                    strokeWidth="1.4"
                  />
                  <rect
                    x="64"
                    y="39"
                    width="92"
                    height="5"
                    rx="1.5"
                    fill={isReelTheme ? '#C9CCCE' : '#a16207'}
                    stroke="#29170b"
                    strokeWidth="1.2"
                  />
                </svg>

                <div
                  id="tv-antenna-mount-bracket"
                  className="relative -mt-[3px] w-16 sm:w-20 h-[6px] rounded-[2px] bg-gradient-to-b from-[#d6c7b2] via-[#8c7a65] to-[#3f3429] border border-black/80 shadow-[0_1px_2px_rgba(0,0,0,0.85)] flex items-center justify-between px-1.5"
                >
                  <img src="/console/screw-head.webp" alt="" draggable={false} className="w-1.5 h-1.5 object-contain" />
                  <span className="font-mono text-[4px] font-black tracking-widest text-[#1c150e] uppercase leading-none">
                    VHF/UHF
                  </span>
                  <img src="/console/screw-head.webp" alt="" draggable={false} className="w-1.5 h-1.5 object-contain" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* TV Cabinet Wrapper */}
        <div
          className={`relative w-full flex flex-col items-center justify-center ${
            isAuroraTheme || isStreamlineTheme || isCdHifiTheme || isClickWheelTheme || isSquircleTheme || isDesktop98Theme
              ? 'pb-0'
              : isReelTheme
                ? 'pb-2.5 sm:pb-3'
                : 'pb-0.5'
          }`}
        >
          {/* Ambient Art-Colored Glow Behind Borderless Streamline Video Card */}
          {isStreamlineTheme && !isTvFullscreen && (
            <div
              id="streamline-video-ambient-glow"
              aria-hidden="true"
              style={{
                background: `radial-gradient(ellipse at center, ${hexToRgbaString(
                  themePalette.primaryHex || '#19C6A3',
                  0.42
                )} 0%, transparent 72%)`,
                filter: 'blur(22px)',
              }}
              className="pointer-events-none absolute -inset-2 rounded-[22px] z-0 opacity-80"
            />
          )}

          {/* Faint Chromatic Aberration Edge Field Around Aurora Floating Holo-Panel */}
          {isAuroraTheme && !isTvFullscreen && (
            <div
              id="aurora-tv-chromatic-halo"
              aria-hidden="true"
              style={{
                background:
                  'linear-gradient(125deg, rgba(77,225,255,0.22) 0%, transparent 32%, transparent 68%, rgba(255,77,157,0.2) 100%)',
                filter: 'blur(12px)',
              }}
              className="pointer-events-none absolute -inset-1 rounded-[18px] z-0 opacity-75"
            />
          )}

          {/* Tapered Mid-Century Walnut Console Legs for 1960s Reel-to-Reel TV */}
          {isReelTheme && (
            <div
              id="r2r-console-tv-legs"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 inset-x-[9%] h-2.5 sm:h-3 flex items-end justify-between z-0"
            >
              <div className="w-3 sm:w-4 h-full bg-gradient-to-b from-[#6B4A2F] to-[#2e1c0e] border border-[#2b1a0d] rounded-b-[2px] shadow-[0_3px_5px_rgba(0,0,0,0.75)] -rotate-[8deg] origin-top" />
              <div className="w-3 sm:w-4 h-full bg-gradient-to-b from-[#6B4A2F] to-[#2e1c0e] border border-[#2b1a0d] rounded-b-[2px] shadow-[0_3px_5px_rgba(0,0,0,0.75)] rotate-[8deg] origin-top" />
            </div>
          )}

          {/* Static Grounding Contact Shadow Under Cabinet */}
          {!isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 inset-x-[6%] h-2.5 rounded-full bg-black/65 z-0"
            />
          )}

          <div
            id="retro-tv-chassis"
            data-tv-powered={tvPoweredOn ? 'true' : 'false'}
            data-tv-channel={channelNumberLabel}
            data-tv-channel-code={activeChannelTheme.code}
            data-tv-channel-video-id={activeChannelVideoId}
            data-tv-tint={activeTintPreset.code}
            data-bravia-pic-off={braviaPicOff ? 'true' : 'false'}
            data-bravia-muted={braviaMuted ? 'true' : 'false'}
            onPointerMove={isClickWheelTheme ? wakeCwMonitorDock : undefined}
            onMouseEnter={isClickWheelTheme ? wakeCwMonitorDock : undefined}
            onFocusCapture={isClickWheelTheme ? wakeCwMonitorDock : undefined}
            style={{
              aspectRatio:
                isAuroraTheme || isStreamlineTheme
                  ? compactLandscape
                    ? '16 / 7.5'
                    : '16 / 9'
                  : isCdHifiTheme
                    ? compactLandscape
                      ? '16 / 8.8'
                      : '16 / 9.6'
                    : isClickWheelTheme
                      ? compactLandscape
                        ? '16 / 8.8'
                        : '16 / 9.4'
                      : '16 / 10',
              containerType: 'inline-size',
            }}
            className={`${
              isAuroraTheme
                ? 'aurora-glass-panel aurora-chromatic-edge rounded-[16px] bg-white/[0.04]'
                : isStreamlineTheme
                ? 'sl-card rounded-[16px] border border-white/[0.08] bg-[#161A20]'
                : isCdHifiTheme
                  ? 'bravia-tv-shell rounded-[6px]'
                  : isDesktop98Theme
                    ? 'd98-beige-crt-shell walnut-furniture-cabinet rounded-[6px]'
                    : isSquircleTheme
                      ? 'walnut-furniture-cabinet rounded-[14px]'
                      : isClickWheelTheme
                        ? 'cw-silver-monitor-shell rounded-[10px]'
                        : isCassetteTheme
                          ? 'cas-body-cabinet walnut-furniture-cabinet'
                          : isReelTheme
                            ? 'r2r-walnut-cabinet walnut-furniture-cabinet'
                            : 'walnut-furniture-cabinet'
            } relative z-10 w-full overflow-visible`}
          >
            {/* Top-Left Crisp BRAVIA Badge on Glossy Piano-Black Bezel */}
            {isCdHifiTheme && !isTvFullscreen && (
              <div
                id="bravia-bezel-badge"
                aria-hidden="true"
                className="pointer-events-none absolute top-[1.4%] left-[3.2%] z-30 flex items-center gap-2"
              >
                <span className="font-sans text-[8px] sm:text-[9px] font-black tracking-[0.26em] text-[#CBD5E1] uppercase leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                  BRAVIA
                </span>
                <span className="font-mono text-[6.5px] tracking-widest text-[#64748B] uppercase leading-none hidden sm:inline">
                  WEGA ENGINE HD
                </span>
              </div>
            )}

            {/* Visible Top Vent Slots Along the Beige Desktop CRT Monitor Shell */}
            {isDesktop98Theme && !isTvFullscreen && (
              <div
                id="d98-crt-vent-slots"
                aria-hidden="true"
                className="pointer-events-none absolute top-[2.0%] inset-x-[12%] h-[2.8%] flex items-center justify-between gap-1 z-20"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((slotIdx) => (
                  <span
                    key={slotIdx}
                    className="flex-1 h-full rounded-[1px] bg-[#6B6454] border-b border-[#EFE9D8]/80 shadow-inner"
                  />
                ))}
              </div>
            )}

            {/* Four Corner Slot-Head Screws (Turntable & Reel-to-Reel Wood Cabinets only) */}
            {!isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isCassetteTheme && (
              <>
                <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-40 opacity-85" />
                <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-40 opacity-85" />
                <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-40 opacity-85" />
                <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-40 opacity-85" />
              </>
            )}

            {/* Recessed Screen Frame */}
            {(isReelTheme || isCassetteTheme || isCdHifiTheme || isClickWheelTheme || isSquircleTheme || isDesktop98Theme) && !isTvFullscreen && (
              <div
                aria-hidden="true"
                style={
                  isCdHifiTheme
                    ? {
                        left: '2.6%',
                        top: '5.0%',
                        width: '94.8%',
                        height: '78.2%',
                        borderRadius: '2px',
                      }
                    : isDesktop98Theme
                      ? {
                          left: '3.4%',
                          top: '6.2%',
                          width: '93.2%',
                          height: '76.6%',
                          borderRadius: '4.5% / 5.5%',
                        }
                      : isClickWheelTheme
                        ? {
                            left: '2.0%',
                            top: '3.2%',
                            width: '96.0%',
                            height: '93.6%',
                            borderRadius: '5px',
                          }
                        : isSquircleTheme
                        ? {
                            left: '3.2%',
                            top: '4.8%',
                            width: '93.6%',
                            height: '77.8%',
                            borderRadius: '8px',
                          }
                        : {
                            left: '2.5%',
                            top: '5%',
                            width: '73%',
                            height: '90%',
                            borderRadius: isCassetteTheme ? '7% / 9%' : '6% / 8%',
                          }
                }
                className={`pointer-events-none absolute z-[12] ${
                  isCdHifiTheme
                    ? 'border border-[#272D38] bg-[#04060A] shadow-[inset_0_2px_10px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.14)]'
                    : isDesktop98Theme
                      ? 'border-[2px] border-[#8A8372] bg-[#0A0F0A] shadow-[inset_0_3px_10px_rgba(0,0,0,0.92),0_1px_0_rgba(255,255,255,0.65)]'
                      : isSquircleTheme
                        ? 'border-[1.5px] border-[#857F74] bg-[#0B0A0A] shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)]'
                        : isClickWheelTheme
                          ? 'border border-[#8E9399]/80 shadow-[inset_0_1px_4px_rgba(15,23,42,0.45),0_1px_0_rgba(255,255,255,0.75)]'
                          : isCassetteTheme
                            ? 'border-[3px] border-[#9DA0A4] bg-[#141516]/25 shadow-[inset_0_0_14px_rgba(0,0,0,0.75),0_1px_0_rgba(255,255,255,0.75)]'
                            : 'border-[3px] border-[#C9CCCE]/80 shadow-[inset_0_0_12px_rgba(0,0,0,0.88),0_2px_6px_rgba(0,0,0,0.5)]'
                }`}
              />
            )}

            {/* CRT / LCD / OLED / Borderless Streaming Screen Aperture */}
            <div
              id="retro-tv-screen"
              ref={tvScreenRef}
              role="button"
              tabIndex={0}
              aria-label={effectiveTvPlaying ? 'Pause TV Video' : 'Play TV Video'}
              title="Click screen to Play/Pause Video · Double-click for Fullscreen"
              data-tv-channel={channelNumberLabel}
              data-tv-channel-count={totalTvChannels}
              data-tv-channel-label={activeSongChannel?.label || activeChannelTheme.name}
              data-tv-fullscreen={isTvFullscreen ? 'true' : 'false'}
              data-yt-muted={isTvFullscreen ? 'false' : 'true'}
              data-yt-volume={volumePct}
              data-audio-owner={isTvFullscreen ? 'youtube' : 'spotify'}
              data-tv-playing={effectiveTvPlaying ? 'true' : 'false'}
              data-tv-override={hasTvPlayOverride ? 'true' : 'false'}
              data-tv-paused-still={!effectiveTvPlaying && tvPoweredOn && !isStandby ? 'true' : 'false'}
              data-tv-video-id={activeChannelVideoId}
              data-tv-iframe-fallback={iframeUnavailable ? 'true' : 'false'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleIndependentTvVideoPlayback();
                }
              }}
              style={
                isTvFullscreen
                  ? {
                      borderRadius: 0,
                    }
                  : isAuroraTheme || isStreamlineTheme
                    ? {
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: '16px',
                      }
                    : isCdHifiTheme
                      ? {
                          left: '3.0%',
                          top: '5.5%',
                          width: '94.0%',
                          height: '77.2%',
                          borderRadius: '2px',
                        }
                      : isDesktop98Theme
                        ? {
                            left: '4.0%',
                            top: '7.1%',
                            width: '92.0%',
                            height: '74.8%',
                            borderRadius: '4% / 5%',
                          }
                        : isClickWheelTheme
                          ? {
                              left: '2.3%',
                              top: '3.8%',
                              width: '95.4%',
                              height: '92.4%',
                              borderRadius: '4px',
                            }
                          : isSquircleTheme
                          ? {
                              left: '3.6%',
                              top: '5.5%',
                              width: '92.8%',
                              height: '76.4%',
                              borderRadius: '6px',
                            }
                          : isReelTheme || isCassetteTheme
                            ? {
                                left: '3.2%',
                                top: '6.5%',
                                width: '71.5%',
                                height: '87%',
                                borderRadius: isCassetteTheme ? '7% / 9%' : '6% / 8%',
                              }
                            : {
                                left: TV_CABINET_SCREEN_APERTURE.left,
                                top: TV_CABINET_SCREEN_APERTURE.top,
                                width: TV_CABINET_SCREEN_APERTURE.width,
                                height: TV_CABINET_SCREEN_APERTURE.height,
                                borderRadius: TV_CABINET_SCREEN_APERTURE.borderRadius,
                              }
              }
              className={`panel-contain overflow-hidden bg-[#050706] flex items-center justify-center cursor-pointer ${
                isAuroraTheme || isStreamlineTheme ? 'group/tv' : ''
              } ${
                isTvFullscreen
                  ? 'fixed inset-0 z-[9990] w-screen h-screen bg-black'
                  : 'absolute z-10'
              }`}
            >
              {/* CRT Video Container (Poster crossfade behind live YouTube embed; NO fullscreen scale zoom) */}
              <div
                id="retro-tv-video-aspect-box"
                data-tv-media-fill="true"
                style={{
                  filter: activeTintPreset.filterCss,
                }}
                className="relative w-full h-full overflow-hidden bg-[#070908] flex items-center justify-center"
              >
                {!tvPoweredOn ? (
                  /* TV POWER OFF STATE: Dimming Holographic Field on Aurora, Dark Phosphor Glass on Hardware */
                  <div
                    id="tv-power-off-screen"
                    data-powered="false"
                    data-tv-media-fill="true"
                    style={{
                      background: isAuroraTheme
                        ? 'radial-gradient(circle at 50% 50%, rgba(124, 77, 255, 0.14) 0%, rgba(6, 7, 12, 0.92) 60%, #06070C 100%)'
                        : 'radial-gradient(circle at 50% 50%, #171c19 0%, #0a0d0c 48%, #040505 100%)',
                    }}
                    className="relative w-full h-full flex flex-col items-center justify-center"
                  >
                    <div
                      className={`w-16 h-[1.5px] rounded-full ${
                        isAuroraTheme
                          ? 'bg-[#4DE1FF]/35 shadow-[0_0_12px_rgba(77,225,255,0.45)]'
                          : 'bg-amber-100/20 shadow-[0_0_8px_rgba(255,255,255,0.25)]'
                      }`}
                    />
                    <span
                      className={`mt-2 font-mono text-[9px] uppercase tracking-widest ${
                        isAuroraTheme ? 'font-extralight text-[#8E9AB8]/70' : 'text-white/30'
                      }`}
                    >
                      {isAuroraTheme ? 'FIELD DIMMED' : 'POWER OFF'}
                    </span>
                  </div>
                ) : (
                  /* TV POWER ON STATE: Instant Crossfade Poster + Live Muted YouTube Broadcast Embed */
                  <div
                    key={`screen-roll-${channelFlashTick}`}
                    data-tv-media-fill="true"
                    className={`relative w-full h-full flex items-center justify-center ${
                      isChannelChanging && !prefersReducedMotion && !lowPowerMode
                        ? 'tv-vertical-roll'
                        : ''
                    }`}
                  >
                    {isStandby ? (
                      <div
                        data-tv-media-fill="true"
                        style={{
                          background:
                            'radial-gradient(ellipse at 45% 42%, #242d28 0%, #161c19 56%, #0b0e0d 100%)',
                        }}
                        className="w-full h-full"
                      />
                    ) : (
                      <>
                        {/* Song Screen-Grab / Thumbnail Crossfade Layer (Elevated cleanly over paused iframe so CRT never goes blank/dark when paused) */}
                        <div
                          id="tv-still-frame-stage"
                          className={`absolute inset-0 ${
                            !effectiveTvPlaying || iframeUnavailable ? 'z-[3]' : 'z-[1]'
                          }`}
                        >
                          <TvFrameCrossfadeStage
                            effectiveTrack={effectiveTrack}
                            manualFrameIndex={manualFrameIndex}
                            frameOffset={activeChannelTheme.frameOffset}
                            channelCode={channelNumberLabel}
                            channelName={activeSongChannel?.label || activeChannelTheme.name}
                            lowPowerMode={lowPowerMode}
                            prefersReducedMotion={prefersReducedMotion}
                            isFullscreen={isTvFullscreen}
                          />
                        </div>

                        {/* Live Synchronized YouTube Broadcast Embed (Visible when playing; hidden cleanly when paused or unavailable so last screen-grab stays visible) */}
                        {activeChannelVideoId && !iframeUnavailable && (
                          <div
                            className={`relative z-[2] ${
                              isTvFullscreen
                                ? 'w-full h-full max-w-full max-h-full aspect-video'
                                : 'w-full h-full'
                            } flex items-center justify-center transition-opacity duration-200 ${
                              effectiveTvPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                          >
                            <iframe
                              id="retro-tv-youtube-iframe"
                              key={`${track.id}-${activeChannelVideoId}-${channelIndex}`}
                              ref={ytIframeRef}
                              data-tv-media-fill="true"
                              title={`YouTube broadcast for ${track.title} (${channelNumberLabel})`}
                              src={buildCleanYouTubeEmbedUrl(
                                activeChannelVideoId,
                                effectiveTvPlaying,
                                iframeMountTimeSec,
                                typeof window !== 'undefined' ? window.location.origin : undefined,
                                !isTvFullscreen
                              )}
                              onLoad={() => {
                                const win = ytIframeRef.current?.contentWindow;
                                if (!win) return;
                                try {
                                  win.postMessage(
                                    JSON.stringify({ event: 'listening', id: 'retro-tv-youtube-iframe' }),
                                    '*'
                                  );
                                } catch {
                                  // ignore
                                }
                                const curSec = Math.floor(playbackClockStore.getCurrentTimeSec());
                                if (isTvFullscreen) {
                                  sendYouTubePlayerCommand('unMute');
                                  sendYouTubePlayerCommand('setVolume', [volumePct]);
                                } else {
                                  sendYouTubePlayerCommand('mute');
                                }
                                sendYouTubePlayerCommand('seekTo', [curSec, true]);
                                sendYouTubePlayerCommand(
                                  effectiveTvPlaying ? 'playVideo' : 'pauseVideo'
                                );
                              }}
                              className="w-full h-full object-contain scale-100 border-0 pointer-events-none"
                              allow="autoplay; encrypted-media; fullscreen"
                              allowFullScreen
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Subtle Broadcast Tint Overlay */}
                    {!lowPowerMode && !isStandby && (
                      <div
                        aria-hidden="true"
                        style={{ backgroundColor: activeTintPreset.overlayRgba }}
                        className="pointer-events-none absolute inset-0 z-[5]"
                      />
                    )}
                  </div>
                )}

                {/* One-Shot 300ms Channel Change Static Snow Burst (Never Loops) */}
                {tvPoweredOn && isChannelChanging && !prefersReducedMotion && !lowPowerMode && (
                  <img
                    key={`static-burst-${channelFlashTick}`}
                    src="/tv/tv-static-noise.webp"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="tv-static-flash pointer-events-none absolute inset-0 z-20 w-full h-full object-cover"
                  />
                )}

                {/* Static Tiled CRT Scanline Texture (Toggled by SCAN Push-Button) */}
                {tvPoweredOn && showCrtEffects && !isStandby && (
                  <div
                    id="tv-scanline-overlay"
                    aria-hidden="true"
                    className="crt-scanlines pointer-events-none absolute inset-0 z-30"
                  />
                )}

                {/* Static Inner CRT Edge Vignette */}
                {!isTvFullscreen && !isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && !isClickWheelTheme && !isSquircleTheme && (
                  <img
                    src="/tv/tv-screen-vignette.png"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 z-40 w-full h-full object-fill"
                  />
                )}

                {/* Subtle Edge Reflection Band on Flat Screen Displays / Chromatic Edge on Aurora Holo-Panel */}
                {!isTvFullscreen && !isStreamlineTheme && (
                  isAuroraTheme ? (
                    <div
                      id="aurora-holo-edge-aberration"
                      aria-hidden="true"
                      style={{
                        boxShadow:
                          'inset 1px 0 0 rgba(77, 225, 255, 0.35), inset -1px 0 0 rgba(255, 77, 157, 0.3), inset 0 1px 0 rgba(234, 242, 255, 0.24)',
                      }}
                      className="pointer-events-none absolute inset-0 z-50 rounded-[16px]"
                    />
                  ) : isCdHifiTheme ? (
                    <div
                      id="bravia-plasma-glass-sheen"
                      aria-hidden="true"
                      style={{
                        background:
                          'linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 26%, transparent 50%)',
                      }}
                      className="pointer-events-none absolute inset-0 z-50"
                    />
                  ) : isClickWheelTheme ? (
                    <div
                      id="cw-lcd-gloss-band"
                      aria-hidden="true"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 22%, transparent 46%)',
                      }}
                      className="pointer-events-none absolute inset-0 z-50"
                    />
                  ) : isSquircleTheme ? (
                    <div
                      id="sq-oled-edge-sheen"
                      aria-hidden="true"
                      style={{
                        background:
                          'linear-gradient(160deg, rgba(255,255,255,0.08) 0%, transparent 32%)',
                      }}
                      className="pointer-events-none absolute inset-0 z-50"
                    />
                  ) : (
                    <img
                      src="/tv/tv-glass-overlay.png"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 z-50 w-full h-full object-fill"
                    />
                  )
                )}

                {/* Sony Bravia PIC OFF Audio-Only Screen Dimming Overlay */}
                {isCdHifiTheme && braviaPicOff && tvPoweredOn && (
                  <div
                    id="bravia-pic-off-overlay"
                    data-pic-off="true"
                    className="pointer-events-none absolute inset-0 z-[54] bg-[#04060A]/94 flex flex-col items-center justify-center gap-1"
                  >
                    <span className="font-mono text-[10px] font-bold tracking-[0.22em] text-[#22C55E] uppercase">
                      PICTURE OFF · AUDIO ONLY
                    </span>
                    <span className="font-mono text-[8.5px] text-[#94A3B8]">
                      Press PIC OFF on Sony Remote to restore screen
                    </span>
                  </div>
                )}

                {/* Classic Sony Bravia Translucent Dark-Grey On-Screen Display (OSD) Banner */}
                {isCdHifiTheme && braviaOsd && tvPoweredOn && (
                  <div
                    id="bravia-osd-banner"
                    role="status"
                    aria-live="polite"
                    className="pointer-events-none absolute top-2.5 right-2.5 left-2.5 z-[58] rounded-[4px] border border-white/25 bg-[#0C1018]/88 backdrop-blur-md px-3 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.85)] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded-[2px] bg-[#00F0FF]/18 border border-[#00F0FF]/60 font-mono text-[8.5px] font-bold tracking-widest text-[#00F0FF] uppercase shrink-0">
                        BRAVIA OSD
                      </span>
                      <span className="font-mono text-[11px] font-bold tracking-wider text-white truncate">
                        {braviaOsd.title}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-semibold text-[#38BDF8] tabular-nums truncate shrink-0">
                      {braviaOsd.subtitle}
                    </span>
                  </div>
                )}
              </div>

              {/* Unobstructed Top Transparent Hit Layer (z-60) Capturing Single-Click Video Toggle & Double-Click Fullscreen */}
              <div
                id="tv-screen-click-surface"
                data-testid="tv-screen-click-surface"
                aria-hidden="true"
                onClick={handleTvScreenSingleClick}
                onDoubleClick={handleTvScreenDoubleClick}
                className="absolute inset-0 z-[60] pointer-events-auto cursor-pointer"
              />

              {/* Aurora Deck Holographic Glass Hover-OSD (5 Channel Orbs + Filter Chip + Power Dimming) */}
              {isAuroraTheme && !isTvFullscreen && (
                <div
                  id="aurora-tv-hover-osd"
                  role="group"
                  aria-label="Aurora Holo-Panel Controls"
                  className="pointer-events-none absolute inset-0 z-[65] flex flex-col justify-between p-2 opacity-0 group-hover/tv:opacity-100 group-focus-within/tv:opacity-100 transition-opacity duration-200"
                >
                  <div className="pointer-events-none flex items-center justify-between gap-1 bg-gradient-to-b from-[#06070C]/80 via-[#06070C]/35 to-transparent -m-2 p-2 rounded-t-[16px]">
                    <div className="pointer-events-auto flex items-center gap-1">
                      <button
                        id="tv-power-knob"
                        type="button"
                        data-powered={tvPoweredOn ? 'true' : 'false'}
                        data-knob-angle={powerKnobAngleDeg}
                        aria-pressed={tvPoweredOn}
                        aria-label={`Holo Field Power (${tvPoweredOn ? 'On' : 'Dimmed'})`}
                        title={`Holo Field: ${tvPoweredOn ? 'ACTIVE' : 'DIMMED'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePowerKnob();
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-extralight border backdrop-blur-md transition-colors cursor-pointer ${
                          tvPoweredOn
                            ? 'bg-white/[0.1] border-[#4DE1FF]/70 text-[#4DE1FF]'
                            : 'bg-[#06070C]/80 border-white/[0.16] text-[#8E9AB8] hover:text-[#EAF2FF]'
                        }`}
                      >
                        {tvPoweredOn ? 'ON' : 'DIM'}
                      </button>

                      <button
                        id="tv-tint-knob"
                        type="button"
                        data-tint={activeTintPreset.code}
                        data-knob-angle={tintKnobAngleDeg}
                        data-pressed={tintPresetIndex > 0 ? 'true' : 'false'}
                        aria-label={`Holo Filter (${activeTintPreset.label})`}
                        title={`Filter: ${activeTintPreset.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCycleTintButton();
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-extralight border backdrop-blur-md transition-colors cursor-pointer ${
                          tintPresetIndex > 0
                            ? 'bg-[#9D7CFF]/25 border-[#9D7CFF] text-[#EAF2FF]'
                            : 'bg-white/[0.06] border-white/[0.14] text-[#8E9AB8] hover:text-[#EAF2FF]'
                        }`}
                      >
                        {activeTintPreset.code}
                      </button>
                    </div>

                    {/* 5 Glowing Holographic Channel Orbs */}
                    <div className="pointer-events-auto flex items-center gap-1">
                      {Array.from({ length: STREAMLINE_CHANNEL_COUNT }, (_, chipIdx) => {
                        const isActiveChip = channelIndex === chipIdx;
                        return (
                          <button
                            key={chipIdx}
                            type="button"
                            data-tv-channel-chip={chipIdx + 1}
                            aria-pressed={isActiveChip}
                            aria-label={`Channel ${chipIdx + 1}`}
                            title={`Channel ${chipIdx + 1}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerButtonHaptic(lowPowerMode);
                              setChannelIndex(chipIdx);
                              if (tvPoweredOn) {
                                triggerOneShotChannelChange();
                              }
                            }}
                            style={
                              isActiveChip
                                ? {
                                    boxShadow: '0 0 10px rgba(77, 225, 255, 0.7)',
                                  }
                                : undefined
                            }
                            className={`w-5 h-5 rounded-full border text-[9px] font-mono font-extralight tabular-nums flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer ${
                              isActiveChip
                                ? 'bg-[#4DE1FF]/25 border-[#4DE1FF] text-[#EAF2FF]'
                                : 'bg-white/[0.06] border-white/[0.16] text-[#8E9AB8] hover:border-[#4DE1FF]/60 hover:text-[#EAF2FF]'
                            }`}
                          >
                            {chipIdx + 1}
                          </button>
                        );
                      })}
                      <button
                        id="tv-channel-knob"
                        type="button"
                        data-channel-index={channelIndex + 1}
                        data-channel-total={totalTvChannels}
                        data-channel-label={channelNumberLabel}
                        data-channel-angle={activeChannelTheme.dialAngleDeg}
                        aria-label={`Next Channel (${channelNumberLabel} of ${totalTvChannels})`}
                        title={`Next Channel (${channelNumberLabel})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTurnChannelKnob();
                        }}
                        className="sr-only"
                      >
                        {channelNumberLabel}
                      </button>
                    </div>
                  </div>

                  {/* Center Frosted Play/Pause Orb */}
                  <div className="pointer-events-none flex items-center justify-center">
                    <button
                      id="aurora-tv-osd-play"
                      type="button"
                      disabled={!tvPoweredOn || isStandby}
                      aria-label={effectiveTvPlaying ? 'Pause Video' : 'Play Video'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleIndependentTvVideoPlayback();
                      }}
                      className="pointer-events-auto w-10 h-10 rounded-full bg-white/[0.1] backdrop-blur-xl border border-white/[0.22] text-[#EAF2FF] hover:border-[#4DE1FF] hover:text-[#4DE1FF] flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.65)] transition-[transform,color,border-color] active:scale-95 cursor-pointer disabled:opacity-40"
                    >
                      {effectiveTvPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current translate-x-[1px]" />
                      )}
                    </button>
                  </div>

                  {/* Bottom OSD Row */}
                  <div className="pointer-events-none flex items-center justify-between gap-2 bg-gradient-to-t from-[#06070C]/80 via-[#06070C]/35 to-transparent -m-2 p-2 rounded-b-[16px]">
                    <span className="text-[10px] font-mono font-extralight text-[#8E9AB8] truncate tabular-nums">
                      {activeSongChannel?.label || activeChannelTheme.name}
                    </span>
                    <button
                      id="tv-btn-fullscreen"
                      type="button"
                      data-pressed={isTvFullscreen ? 'true' : 'false'}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTvFullscreen();
                      }}
                      aria-label={isTvFullscreen ? 'Exit Video Fullscreen' : 'Enter Video Fullscreen'}
                      title="Fullscreen Video"
                      className="pointer-events-auto w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.16] text-[#EAF2FF] hover:border-[#4DE1FF] hover:text-[#4DE1FF] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <Maximize2 strokeWidth={2} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Streamline Modern Borderless Video Card Hover-OSD */}
              {isStreamlineTheme && !isTvFullscreen && (
                <div
                  id="streamline-tv-hover-osd"
                  role="group"
                  aria-label="Streamline Video Card Controls"
                  className="pointer-events-none absolute inset-0 z-[65] flex flex-col justify-between p-2 opacity-0 group-hover/tv:opacity-100 group-focus-within/tv:opacity-100 transition-opacity duration-200"
                >
                  {/* Top OSD Row: Power + Filter Left, CH 1-5 + Cycle Knob Right */}
                  <div className="pointer-events-none flex items-center justify-between gap-1 bg-gradient-to-b from-black/65 via-black/30 to-transparent -m-2 p-2 rounded-t-[16px]">
                    <div className="pointer-events-auto flex items-center gap-1">
                      <button
                        id="tv-power-knob"
                        type="button"
                        data-powered={tvPoweredOn ? 'true' : 'false'}
                        data-knob-angle={powerKnobAngleDeg}
                        aria-pressed={tvPoweredOn}
                        aria-label={`Video Power (${tvPoweredOn ? 'On' : 'Off'})`}
                        title={`Video Power: ${tvPoweredOn ? 'ON' : 'OFF'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePowerKnob();
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-sans font-semibold border transition-colors cursor-pointer ${
                          tvPoweredOn
                            ? 'bg-[#19C6A3]/20 border-[#19C6A3]/70 text-[#19C6A3]'
                            : 'bg-[#161A20]/85 border-white/15 text-[#A7AFBC] hover:text-white'
                        }`}
                      >
                        {tvPoweredOn ? 'ON' : 'OFF'}
                      </button>

                      <button
                        id="tv-tint-knob"
                        type="button"
                        data-tint={activeTintPreset.code}
                        data-knob-angle={tintKnobAngleDeg}
                        data-pressed={tintPresetIndex > 0 ? 'true' : 'false'}
                        aria-label={`Video Filter (${activeTintPreset.label})`}
                        title={`Filter: ${activeTintPreset.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCycleTintButton();
                        }}
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-sans font-medium border transition-colors cursor-pointer ${
                          tintPresetIndex > 0
                            ? 'bg-[#19C6A3]/20 border-[#19C6A3]/70 text-[#FFFFFF]'
                            : 'bg-[#161A20]/85 border-white/15 text-[#A7AFBC] hover:text-white'
                        }`}
                      >
                        {activeTintPreset.code}
                      </button>
                    </div>

                    <div className="pointer-events-auto flex items-center gap-0.5">
                      {Array.from({ length: STREAMLINE_CHANNEL_COUNT }, (_, chipIdx) => {
                        const isActiveChip = channelIndex === chipIdx;
                        return (
                          <button
                            key={chipIdx}
                            type="button"
                            data-tv-channel-chip={chipIdx + 1}
                            aria-pressed={isActiveChip}
                            aria-label={`Channel ${chipIdx + 1}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerButtonHaptic(lowPowerMode);
                              setChannelIndex(chipIdx);
                              if (tvPoweredOn) {
                                triggerOneShotChannelChange();
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded-[6px] text-[9px] font-sans font-semibold tabular-nums transition-colors cursor-pointer ${
                              isActiveChip
                                ? 'bg-[#19C6A3] text-[#0F1115]'
                                : 'bg-[#161A20]/80 text-[#A7AFBC] hover:bg-[#1D232B] hover:text-white'
                            }`}
                          >
                            CH {chipIdx + 1}
                          </button>
                        );
                      })}
                      <button
                        id="tv-channel-knob"
                        type="button"
                        data-channel-index={channelIndex + 1}
                        data-channel-total={totalTvChannels}
                        data-channel-label={channelNumberLabel}
                        data-channel-angle={activeChannelTheme.dialAngleDeg}
                        aria-label={`Next Channel (${channelNumberLabel} of ${totalTvChannels})`}
                        title={`Next Channel (${channelNumberLabel})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTurnChannelKnob();
                        }}
                        className="sr-only"
                      >
                        {channelNumberLabel}
                      </button>
                    </div>
                  </div>

                  {/* Center Hover Play/Pause Button */}
                  <div className="pointer-events-none flex items-center justify-center">
                    <button
                      id="streamline-tv-osd-play"
                      type="button"
                      disabled={!tvPoweredOn || isStandby}
                      aria-label={effectiveTvPlaying ? 'Pause Video' : 'Play Video'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleIndependentTvVideoPlayback();
                      }}
                      className="pointer-events-auto w-10 h-10 rounded-full bg-[#0F1115]/80 backdrop-blur-md border border-white/20 text-white hover:border-[#19C6A3] hover:text-[#19C6A3] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.55)] transition-[transform,color,border-color] active:scale-95 cursor-pointer disabled:opacity-40"
                    >
                      {effectiveTvPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current translate-x-[1px]" />
                      )}
                    </button>
                  </div>

                  {/* Bottom OSD Row: Channel Label Left, Fullscreen Button Right */}
                  <div className="pointer-events-none flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent -m-2 p-2 rounded-b-[16px]">
                    <span className="text-[10px] font-sans font-medium text-[#A7AFBC] truncate tabular-nums">
                      {activeSongChannel?.label || activeChannelTheme.name}
                    </span>
                    <button
                      id="tv-btn-fullscreen"
                      type="button"
                      data-pressed={isTvFullscreen ? 'true' : 'false'}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTvFullscreen();
                      }}
                      aria-label={isTvFullscreen ? 'Exit Video Fullscreen' : 'Enter Video Fullscreen'}
                      title="Fullscreen Video"
                      className="pointer-events-auto w-6 h-6 rounded-[8px] bg-[#161A20]/85 border border-white/15 text-white hover:border-[#19C6A3] hover:text-[#19C6A3] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <Maximize2 strokeWidth={2.2} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Click Wheel Silver Monitor On-Screen Magnifying Dock Bar (Power, 5 Channel Thumbnails, Filter, Fullscreen; Auto-Hides after 3s Idle) */}
              {isClickWheelTheme && !isTvFullscreen && (
                <div
                  id="cw-monitor-dock-bar"
                  role="toolbar"
                  aria-label="Monitor Quick Control Dock"
                  data-dock-visible={cwDockVisible || cwHoveredDockIdx !== null ? 'true' : 'false'}
                  onPointerMove={(e) => {
                    e.stopPropagation();
                    wakeCwMonitorDock();
                  }}
                  onMouseLeave={() => setCwHoveredDockIdx(null)}
                  style={{
                    containerType: 'inline-size',
                    opacity: cwDockVisible || cwHoveredDockIdx !== null ? 1 : 0,
                    transform:
                      cwDockVisible || cwHoveredDockIdx !== null
                        ? 'translate3d(0, 0, 0)'
                        : 'translate3d(0, 6px, 0)',
                    transition:
                      prefersReducedMotion || lowPowerMode
                        ? 'none'
                        : 'opacity 220ms ease, transform 220ms ease',
                  }}
                  className={`absolute inset-x-0 bottom-1.5 z-[65] flex justify-center px-1.5 ${
                    cwDockVisible || cwHoveredDockIdx !== null
                      ? 'pointer-events-auto'
                      : 'pointer-events-none'
                  }`}
                >
                  <div className="max-w-full px-[clamp(4px,2cqw,8px)] py-1 rounded-[10px] bg-white/65 backdrop-blur-md border border-white/85 shadow-[0_6px_18px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.95)] flex items-end gap-[clamp(2.5px,1.4cqw,6px)]">
                    {/* Dock Tile 0: Power */}
                    {(() => {
                      const scale =
                        prefersReducedMotion || lowPowerMode
                          ? 1
                          : computeMonitorDockIconScale(0, cwHoveredDockIdx);
                      const liftY = -Math.max(0, (scale - 1) * 14);
                      return (
                        <button
                          id="tv-power-knob"
                          type="button"
                          data-dock-index={0}
                          data-dock-scale={scale}
                          data-powered={tvPoweredOn ? 'true' : 'false'}
                          data-knob-angle={powerKnobAngleDeg}
                          aria-pressed={tvPoweredOn}
                          aria-label={`Display Power (${tvPoweredOn ? 'On' : 'Off'})`}
                          title={`Power: ${tvPoweredOn ? 'ON' : 'OFF'}`}
                          onMouseEnter={() => {
                            setCwHoveredDockIdx(0);
                            wakeCwMonitorDock();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            wakeCwMonitorDock();
                            handleTogglePowerKnob();
                          }}
                          style={{
                            width: 'clamp(15px, 6.8cqw, 22px)',
                            height: 'clamp(15px, 6.8cqw, 22px)',
                            transform: `translate3d(0, ${liftY.toFixed(1)}px, 0) scale(${scale})`,
                            transformOrigin: 'bottom center',
                            transition:
                              prefersReducedMotion || lowPowerMode
                                ? 'none'
                                : 'transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                          }}
                          className={`relative shrink-0 rounded-[5px] border shadow-[0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] flex items-center justify-center cursor-pointer ${
                            tvPoweredOn
                              ? 'bg-gradient-to-b from-[#60A5FA] via-[#3478F6] to-[#1D4ED8] border-white/80 text-white'
                              : 'bg-gradient-to-b from-[#9CA3AF] to-[#4B5563] border-white/60 text-white/85'
                          }`}
                        >
                          <Power strokeWidth={2.5} className="w-[58%] h-[58%]" />
                        </button>
                      );
                    })()}

                    <span aria-hidden="true" className="w-[1px] h-3.5 bg-black/15 self-center mx-[1px] shrink-0" />

                    {/* Dock Tiles 1..5: 5 Channel Thumbnail Tiles */}
                    {Array.from({ length: STREAMLINE_CHANNEL_COUNT }, (_, chIdx) => {
                      const tileIdx = chIdx + 1;
                      const isActiveCh = channelIndex === chIdx;
                      const scale =
                        prefersReducedMotion || lowPowerMode
                          ? 1
                          : computeMonitorDockIconScale(tileIdx, cwHoveredDockIdx);
                      const liftY = -Math.max(0, (scale - 1) * 14);
                      const thumbUrl = songChannels[chIdx]?.frames?.[0]?.imageUrl || '';
                      return (
                        <button
                          key={chIdx}
                          type="button"
                          data-cw-dock-channel={tileIdx}
                          data-dock-index={tileIdx}
                          data-dock-scale={scale}
                          aria-pressed={isActiveCh}
                          aria-label={`Channel ${tileIdx}`}
                          title={`Channel ${tileIdx}`}
                          onMouseEnter={() => {
                            setCwHoveredDockIdx(tileIdx);
                            wakeCwMonitorDock();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            wakeCwMonitorDock();
                            triggerButtonHaptic(lowPowerMode);
                            setChannelIndex(chIdx);
                            if (tvPoweredOn) {
                              triggerOneShotChannelChange();
                            }
                          }}
                          style={{
                            width: 'clamp(15px, 6.8cqw, 22px)',
                            height: 'clamp(15px, 6.8cqw, 22px)',
                            transform: `translate3d(0, ${liftY.toFixed(1)}px, 0) scale(${scale})`,
                            transformOrigin: 'bottom center',
                            transition:
                              prefersReducedMotion || lowPowerMode
                                ? 'none'
                                : 'transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                          }}
                          className={`relative shrink-0 rounded-[5px] overflow-hidden border shadow-[0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.8)] flex items-center justify-center cursor-pointer ${
                            isActiveCh
                              ? 'border-[#3478F6] ring-1 ring-[#3478F6]/70 bg-gradient-to-b from-[#1E293B] to-[#0F172A]'
                              : 'border-white/80 bg-gradient-to-b from-[#374151] to-[#111827]'
                          }`}
                        >
                          {thumbUrl && (
                            <img
                              src={thumbUrl}
                              alt=""
                              draggable={false}
                              className="absolute inset-0 w-full h-full object-cover opacity-70"
                            />
                          )}
                          <span className="relative z-10 font-sans text-[clamp(7.5px,3cqw,9px)] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] tabular-nums">
                            {tileIdx}
                          </span>
                          {isActiveCh && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-[1px] left-1/2 -translate-x-1/2 w-1.5 h-[2px] rounded-full bg-[#60A5FA]"
                            />
                          )}
                        </button>
                      );
                    })}

                    {/* Accessible cycle channel button synced with dock channels */}
                    <button
                      id="tv-channel-knob"
                      type="button"
                      data-channel-index={channelIndex + 1}
                      data-channel-total={totalTvChannels}
                      data-channel-label={channelNumberLabel}
                      data-channel-angle={activeChannelTheme.dialAngleDeg}
                      aria-label={`Next Channel (${channelNumberLabel} of ${totalTvChannels})`}
                      title={`Next Channel (${channelNumberLabel})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        wakeCwMonitorDock();
                        handleTurnChannelKnob();
                      }}
                      className="sr-only pointer-events-auto"
                    >
                      {channelNumberLabel}
                    </button>

                    <span aria-hidden="true" className="w-[1px] h-3.5 bg-black/15 self-center mx-[1px] shrink-0" />

                    {/* Dock Tile 6: Filter / Tint */}
                    {(() => {
                      const scale =
                        prefersReducedMotion || lowPowerMode
                          ? 1
                          : computeMonitorDockIconScale(6, cwHoveredDockIdx);
                      const liftY = -Math.max(0, (scale - 1) * 14);
                      return (
                        <button
                          id="tv-tint-knob"
                          type="button"
                          data-dock-index={6}
                          data-dock-scale={scale}
                          data-tint={activeTintPreset.code}
                          data-knob-angle={tintKnobAngleDeg}
                          data-pressed={tintPresetIndex > 0 ? 'true' : 'false'}
                          aria-label={`Display Color Filter (${activeTintPreset.label})`}
                          title={`Filter: ${activeTintPreset.label}`}
                          onMouseEnter={() => {
                            setCwHoveredDockIdx(6);
                            wakeCwMonitorDock();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            wakeCwMonitorDock();
                            handleCycleTintButton();
                          }}
                          style={{
                            width: 'clamp(15px, 6.8cqw, 22px)',
                            height: 'clamp(15px, 6.8cqw, 22px)',
                            transform: `translate3d(0, ${liftY.toFixed(1)}px, 0) scale(${scale})`,
                            transformOrigin: 'bottom center',
                            transition:
                              prefersReducedMotion || lowPowerMode
                                ? 'none'
                                : 'transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                          }}
                          className={`relative shrink-0 rounded-[5px] border shadow-[0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] flex items-center justify-center cursor-pointer ${
                            tintPresetIndex > 0
                              ? 'bg-gradient-to-b from-[#A855F7] via-[#7E22CE] to-[#581C87] border-white/85 text-white'
                              : 'bg-gradient-to-b from-[#FFFFFF] via-[#E5E7EB] to-[#9CA3AF] border-white/85 text-[#1D1D1F]'
                          }`}
                        >
                          <Sparkles strokeWidth={2.2} className="w-[58%] h-[58%]" />
                        </button>
                      );
                    })()}

                    {/* Dock Tile 7: Fullscreen */}
                    {(() => {
                      const scale =
                        prefersReducedMotion || lowPowerMode
                          ? 1
                          : computeMonitorDockIconScale(7, cwHoveredDockIdx);
                      const liftY = -Math.max(0, (scale - 1) * 14);
                      return (
                        <button
                          id="tv-btn-fullscreen"
                          type="button"
                          data-dock-index={7}
                          data-dock-scale={scale}
                          data-pressed={isTvFullscreen ? 'true' : 'false'}
                          aria-label={
                            isTvFullscreen ? 'Exit Display Fullscreen' : 'Enter Display Fullscreen'
                          }
                          title="Fullscreen Video"
                          onMouseEnter={() => {
                            setCwHoveredDockIdx(7);
                            wakeCwMonitorDock();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            wakeCwMonitorDock();
                            handleToggleTvFullscreen();
                          }}
                          style={{
                            width: 'clamp(15px, 6.8cqw, 22px)',
                            height: 'clamp(15px, 6.8cqw, 22px)',
                            transform: `translate3d(0, ${liftY.toFixed(1)}px, 0) scale(${scale})`,
                            transformOrigin: 'bottom center',
                            transition:
                              prefersReducedMotion || lowPowerMode
                                ? 'none'
                                : 'transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                          }}
                          className="relative shrink-0 rounded-[5px] border border-white/85 bg-gradient-to-b from-[#FFFFFF] via-[#E2E8F0] to-[#94A3B8] text-[#1E293B] shadow-[0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] flex items-center justify-center cursor-pointer"
                        >
                          <Maximize2 strokeWidth={2.3} className="w-[58%] h-[58%]" />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* FULLSCREEN-ONLY Overlay Controls (Play/Pause + Seek Bar + Exit) — Completely Hidden in Normal Mode */}
              {isTvFullscreen && (
                <TvFullscreenOverlayControls
                  trackTitle={`${track.title} — ${track.artist}`}
                  durationSec={track.durationSec}
                  effectiveTvPlaying={effectiveTvPlaying}
                  lowPowerMode={lowPowerMode}
                  activeThemeId={activeThemeId}
                  onToggleFullscreenPlayPause={() => {
                    setTvOverridePlaying(null);
                    onTogglePlay?.();
                  }}
                  onSeek={(targetSec) => onSeek?.(targetSec)}
                  onExitFullscreen={handleExitTvFullscreen}
                />
              )}
            </div>

            {/* Photorealistic 1970s Walnut Cabinet Overlay OR Solid Trim Container */}
            {!isAuroraTheme && !isStreamlineTheme && !isReelTheme && !isCassetteTheme && !isCdHifiTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme ? (
              <img
                src="/tv/tv-cabinet.webp"
                alt="1970s Walnut CRT Television Cabinet"
                draggable={false}
                className="pointer-events-none relative z-30 w-full h-full object-fill"
              />
            ) : (
              <div
                aria-hidden="true"
                className="pointer-events-none relative z-30 w-full h-full"
              />
            )}

            {/* =======================================================================
                MONITOR / TV CONTROLS:
                - On Aurora Deck: Bezel-less holo-panel — controls live inside #aurora-tv-hover-osd
                - On Streamline: Borderless card — controls live inside #streamline-tv-hover-osd
                - On CD Hi-Fi System: Full-width brushed dark-titanium speaker bar with pinhole status LEDs, raised chrome SONY emblem, and discrete bezel controls
                - On '98 Desktop Player: Beige Desktop CRT Monitor Bottom Bezel with Green Power LED & OSD Beveled Buttons
                - On Squircle PMP: Soft-Touch Olive-Brown Bezel Strip + Lowercase Magenta-Tinted OSD Controls
                - On Click Wheel: Sleek Bottom Bezel Strip with Small Chrome Dot Buttons
                - On Cassette Deck / Reel-to-Reel / Retro Turntable: Right Side Mount
               ======================================================================= */}
            {!isAuroraTheme && !isStreamlineTheme && (isCdHifiTheme ? (
              <div
                id="bravia-speaker-bar"
                style={{
                  left: '2.0%',
                  bottom: '2.0%',
                  width: '96.0%',
                  height: '13.8%',
                  padding: '0 1.4cqw',
                }}
                className="bravia-titanium-speaker-bar absolute z-40 rounded-[3px] flex items-center justify-between gap-[1.2cqw] overflow-hidden"
              >
                {/* Left Pinhole Status LEDs: POWER (Green/Red), TIMER (Amber), PIC OFF (Green) */}
                <div
                  id="bravia-status-leds"
                  className="flex items-center gap-[1.1cqw] shrink-0 bg-black/45 px-[0.9cqw] py-[0.35cqw] rounded-[2px] border border-white/10"
                >
                  <div className="flex items-center gap-[0.35cqw]" title="Power / Standby Indicator">
                    <span
                      id="tv-standby-led"
                      aria-label={tvPoweredOn ? 'Bravia Power On LED' : 'Bravia Standby LED'}
                      style={{
                        width: '1.1cqw',
                        height: '1.1cqw',
                        backgroundColor: tvPoweredOn ? '#22C55E' : '#EF4444',
                        boxShadow: tvPoweredOn ? '0 0 6px #22C55E' : '0 0 5px #EF4444',
                      }}
                      className="rounded-full shrink-0"
                    />
                    <span style={{ fontSize: '1.15cqw' }} className="font-mono font-bold text-[#CBD5E1] uppercase leading-none">
                      I/O
                    </span>
                  </div>
                  <div className="flex items-center gap-[0.35cqw]" title="Timer LED">
                    <span
                      style={{
                        width: '0.95cqw',
                        height: '0.95cqw',
                        backgroundColor: isPlaying ? '#F59E0B' : '#334155',
                        boxShadow: isPlaying ? '0 0 4px #F59E0B' : 'none',
                      }}
                      className="rounded-full shrink-0"
                    />
                    <span style={{ fontSize: '1.05cqw' }} className="font-mono text-[#94A3B8] uppercase leading-none">
                      TMR
                    </span>
                  </div>
                  <div className="flex items-center gap-[0.35cqw]" title="Picture Off Indicator">
                    <span
                      style={{
                        width: '0.95cqw',
                        height: '0.95cqw',
                        backgroundColor: braviaPicOff ? '#22C55E' : '#334155',
                        boxShadow: braviaPicOff ? '0 0 5px #22C55E' : 'none',
                      }}
                      className="rounded-full shrink-0"
                    />
                    <span style={{ fontSize: '1.05cqw' }} className="font-mono text-[#94A3B8] uppercase leading-none">
                      PIC
                    </span>
                  </div>
                </div>

                {/* Center Raised Chrome SONY Emblem */}
                <div
                  id="bravia-sony-emblem"
                  aria-hidden="true"
                  className="pointer-events-none px-[1.2cqw] py-[0.25cqw] rounded-[2px] bg-[#181C24]/90 border border-white/20 shadow-[0_1px_3px_rgba(0,0,0,0.85)] shrink-0"
                >
                  <span
                    style={{ fontSize: '1.85cqw' }}
                    className="font-serif font-black tracking-[0.25em] text-[#F1F5F9] uppercase leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)]"
                  >
                    SONY
                  </span>
                </div>

                {/* Right Discrete Bravia Bezel Tactile Controls + Remote Summon */}
                <div
                  id="retro-tv-analogue-buttons"
                  role="group"
                  aria-label="Sony Bravia Speaker Bar Controls"
                  className="flex items-center gap-[0.75cqw] shrink-0"
                >
                  <button
                    id="tv-power-knob"
                    type="button"
                    data-powered={tvPoweredOn ? 'true' : 'false'}
                    data-knob-angle={powerKnobAngleDeg}
                    aria-pressed={tvPoweredOn}
                    aria-label={`Bravia Power Button (${tvPoweredOn ? 'On' : 'Off'})`}
                    title={`TV Power: ${tvPoweredOn ? 'ON' : 'STANDBY'}`}
                    onClick={() => {
                      handleTogglePowerKnob();
                      triggerBraviaOsd('POWER', tvPoweredOn ? 'STANDBY' : 'POWER ON');
                    }}
                    style={{ fontSize: '1.25cqw' }}
                    className={`px-[0.9cqw] py-[0.45cqw] rounded-[2px] border font-mono font-bold uppercase leading-none cursor-pointer ${
                      tvPoweredOn
                        ? 'bg-[#0F172A] border-[#22C55E]/70 text-[#4ADE80]'
                        : 'bg-[#1E293B] border-white/20 text-[#94A3B8]'
                    }`}
                  >
                    {tvPoweredOn ? 'PWR' : 'STBY'}
                  </button>

                  <button
                    id="tv-channel-knob"
                    type="button"
                    data-channel-index={channelIndex + 1}
                    data-channel-total={totalTvChannels}
                    data-channel-label={channelNumberLabel}
                    data-channel-angle={activeChannelTheme.dialAngleDeg}
                    onClick={() => {
                      handleTurnChannelKnob();
                      const nextCh = ((channelIndex + 1) % totalTvChannels) + 1;
                      triggerBraviaOsd(
                        `CH ${nextCh}`,
                        activeSongChannel?.label || activeChannelTheme.name
                      );
                    }}
                    aria-label={`Channel Selector Button (${channelNumberLabel} of ${totalTvChannels})`}
                    title={`Channel: ${channelNumberLabel} of ${totalTvChannels}`}
                    style={{ fontSize: '1.25cqw' }}
                    className="px-[0.9cqw] py-[0.45cqw] rounded-[2px] border border-white/25 bg-[#0F172A] text-[#E2E8F0] hover:border-[#00F0FF] font-mono font-bold uppercase tabular-nums leading-none cursor-pointer"
                  >
                    {channelNumberLabel}
                  </button>

                  <button
                    id="tv-tint-knob"
                    type="button"
                    data-tint={activeTintPreset.code}
                    data-knob-angle={tintKnobAngleDeg}
                    onClick={() => {
                      handleCycleTintButton();
                      triggerBraviaOsd('PICTURE MODE', activeTintPreset.label);
                    }}
                    aria-label={`Bravia Picture Preset (${activeTintPreset.label})`}
                    title={`Picture Filter: ${activeTintPreset.label}`}
                    data-pressed={tintPresetIndex > 0 ? 'true' : 'false'}
                    style={{ fontSize: '1.25cqw' }}
                    className="px-[0.9cqw] py-[0.45cqw] rounded-[2px] border border-white/25 bg-[#0F172A] text-[#38BDF8] font-mono font-bold uppercase leading-none cursor-pointer"
                  >
                    {activeTintPreset.code}
                  </button>

                  <button
                    id="tv-btn-fullscreen"
                    type="button"
                    data-pressed={isTvFullscreen ? 'true' : 'false'}
                    onClick={handleToggleTvFullscreen}
                    aria-label={isTvFullscreen ? 'Exit Bravia Fullscreen' : 'Enter Bravia Fullscreen'}
                    title="Fullscreen Video"
                    style={{ fontSize: '1.25cqw' }}
                    className="px-[0.9cqw] py-[0.45cqw] rounded-[2px] border border-white/25 bg-[#0F172A] text-[#E2E8F0] font-mono font-bold uppercase leading-none cursor-pointer"
                  >
                    FULL
                  </button>

                  <button
                    id="tv-btn-scanlines"
                    type="button"
                    data-pressed={crtScanlinesOn ? 'true' : 'false'}
                    aria-pressed={crtScanlinesOn}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      setCrtScanlinesOn((v) => !v);
                    }}
                    aria-label="Toggle Display Scanlines"
                    title={`Scanlines: ${crtScanlinesOn ? 'ON' : 'OFF'}`}
                    style={{ fontSize: '1.25cqw' }}
                    className="px-[0.9cqw] py-[0.45cqw] rounded-[2px] border border-white/25 bg-[#0F172A] text-[#94A3B8] font-mono font-bold uppercase leading-none cursor-pointer"
                  >
                    SCAN
                  </button>
                </div>
              </div>
            ) : isDesktop98Theme ? (
              <div
                id="retro-tv-side-mount"
                style={{
                  left: '3.6%',
                  bottom: '2.4%',
                  width: '92.8%',
                  height: '13.5%',
                  padding: '0 1.2cqw',
                }}
                className="absolute z-40 flex items-center justify-between gap-[1.2cqw] overflow-hidden"
              >
                {/* Left Monitor Model Label & Small Green Power LED */}
                <div className="flex items-center gap-[0.9cqw] shrink-0">
                  <span
                    id="tv-standby-led"
                    aria-label={tvPoweredOn ? 'Monitor Power On LED' : 'Monitor Power Off LED'}
                    style={{
                      width: '1.35cqw',
                      height: '1.35cqw',
                      backgroundColor: tvPoweredOn ? '#00E36D' : '#5e645e',
                      boxShadow: tvPoweredOn ? '0 0 6px rgba(0, 227, 109, 0.9)' : 'none',
                    }}
                    className="rounded-[1px] border border-[#2c332c] shrink-0"
                  />
                  <span
                    style={{ fontSize: '1.45cqw' }}
                    className="font-['Silkscreen',monospace] font-bold uppercase tracking-tight text-[#2b2820] leading-none"
                  >
                    SVGA-98
                  </span>
                </div>

                {/* OSD-Style Beveled Buttons Along the Beige Monitor Bottom Bezel */}
                <div
                  id="retro-tv-analogue-buttons"
                  role="group"
                  aria-label="1998 Beige CRT Monitor OSD Buttons"
                  className="flex items-center gap-[0.95cqw] shrink-0"
                >
                  <button
                    id="tv-power-knob"
                    type="button"
                    data-powered={tvPoweredOn ? 'true' : 'false'}
                    data-knob-angle={powerKnobAngleDeg}
                    aria-pressed={tvPoweredOn}
                    aria-label={`Monitor Power Button (${tvPoweredOn ? 'On' : 'Off'})`}
                    title={`Monitor Power: ${tvPoweredOn ? 'ON' : 'OFF'}`}
                    onClick={handleTogglePowerKnob}
                    className="d98-beige-osd-btn px-[1.1cqw] py-[0.5cqw] font-['Silkscreen',monospace] font-bold uppercase leading-none cursor-pointer"
                    style={{ fontSize: '1.35cqw' }}
                  >
                    {tvPoweredOn ? 'PWR ON' : 'PWR OFF'}
                  </button>

                  <button
                    id="tv-channel-knob"
                    type="button"
                    data-channel-index={channelIndex + 1}
                    data-channel-total={totalTvChannels}
                    data-channel-label={channelNumberLabel}
                    data-channel-angle={activeChannelTheme.dialAngleDeg}
                    onClick={handleTurnChannelKnob}
                    aria-label={`Channel Selector Button (${channelNumberLabel} of ${totalTvChannels})`}
                    title={`Channel: ${channelNumberLabel} of ${totalTvChannels}`}
                    className="d98-beige-osd-btn px-[1.1cqw] py-[0.5cqw] font-['Silkscreen',monospace] font-bold uppercase tabular-nums leading-none cursor-pointer"
                    style={{ fontSize: '1.35cqw' }}
                  >
                    {channelNumberLabel}
                  </button>

                  <button
                    id="tv-tint-knob"
                    type="button"
                    data-tint={activeTintPreset.code}
                    data-knob-angle={tintKnobAngleDeg}
                    onClick={handleCycleTintButton}
                    aria-label={`Monitor Color Preset (${activeTintPreset.label})`}
                    title={`Color Filter: ${activeTintPreset.label}`}
                    data-pressed={tintPresetIndex > 0 ? 'true' : 'false'}
                    className="d98-beige-osd-btn px-[1.1cqw] py-[0.5cqw] font-['Silkscreen',monospace] font-bold uppercase leading-none cursor-pointer"
                    style={{ fontSize: '1.35cqw' }}
                  >
                    {activeTintPreset.code}
                  </button>

                  <button
                    id="tv-btn-fullscreen"
                    type="button"
                    data-pressed={isTvFullscreen ? 'true' : 'false'}
                    onClick={handleToggleTvFullscreen}
                    aria-label={isTvFullscreen ? 'Exit Monitor Fullscreen' : 'Enter Monitor Fullscreen'}
                    title="Fullscreen Video"
                    className="d98-beige-osd-btn px-[1.1cqw] py-[0.5cqw] font-['Silkscreen',monospace] font-bold uppercase leading-none cursor-pointer"
                    style={{ fontSize: '1.35cqw' }}
                  >
                    FULL
                  </button>

                  <button
                    id="tv-btn-scanlines"
                    type="button"
                    data-pressed={crtScanlinesOn ? 'true' : 'false'}
                    aria-pressed={crtScanlinesOn}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      setCrtScanlinesOn((v) => !v);
                    }}
                    aria-label="Toggle CRT Scanlines"
                    title={`Scanlines: ${crtScanlinesOn ? 'ON' : 'OFF'}`}
                    className="d98-beige-osd-btn px-[1.1cqw] py-[0.5cqw] font-['Silkscreen',monospace] font-bold uppercase leading-none cursor-pointer"
                    style={{ fontSize: '1.35cqw' }}
                  >
                    SCAN
                  </button>
                </div>
              </div>
            ) : isSquircleTheme ? (
              <div
                id="retro-tv-side-mount"
                style={{
                  left: '3.6%',
                  bottom: '3.4%',
                  width: '92.8%',
                  height: '13.5%',
                  padding: '0 1.4cqw',
                }}
                className="absolute z-40 flex items-center justify-between gap-[1.4cqw] overflow-hidden"
              >
                {/* Left Lowercase Label & Small Magenta Power LED */}
                <div className="flex items-center gap-[0.9cqw] shrink-0">
                  <span
                    id="tv-standby-led"
                    aria-label={tvPoweredOn ? 'Display Power On LED' : 'Display Power Off LED'}
                    style={{
                      width: '1.25cqw',
                      height: '1.25cqw',
                      backgroundColor: tvPoweredOn ? '#E6007E' : '#9B938B',
                      boxShadow: tvPoweredOn ? '0 0 8px rgba(230, 0, 126, 0.9)' : 'none',
                    }}
                    className="rounded-full shrink-0"
                  />
                  <span
                    style={{ fontSize: '1.65cqw' }}
                    className="font-sans font-bold lowercase tracking-tight text-[#FFFFFF] leading-none"
                  >
                    oled dock
                  </span>
                </div>

                {/* Lowercase Magenta-Tinted OSD Controls */}
                <div
                  id="retro-tv-analogue-buttons"
                  role="group"
                  aria-label="Squircle Monitor OSD Controls"
                  className="flex items-center gap-[1.1cqw] shrink-0"
                >
                  <button
                    id="tv-power-knob"
                    type="button"
                    data-powered={tvPoweredOn ? 'true' : 'false'}
                    data-knob-angle={powerKnobAngleDeg}
                    aria-pressed={tvPoweredOn}
                    aria-label={`Display Power Button (${tvPoweredOn ? 'On' : 'Off'})`}
                    title={`Display Power: ${tvPoweredOn ? 'ON' : 'OFF'}`}
                    onClick={handleTogglePowerKnob}
                    className={`sq-pressable px-[1.2cqw] py-[0.55cqw] rounded-[5px] border font-sans font-bold lowercase leading-none cursor-pointer ${
                      tvPoweredOn
                        ? 'bg-[#0B0A0A] border-[#E6007E] text-[#E6007E]'
                        : 'bg-[#55503C] border-[#857F74] text-[#9B938B]'
                    }`}
                    style={{ fontSize: '1.5cqw' }}
                  >
                    {tvPoweredOn ? 'pwr on' : 'pwr off'}
                  </button>

                  <button
                    id="tv-channel-knob"
                    type="button"
                    data-channel-index={channelIndex + 1}
                    data-channel-total={totalTvChannels}
                    data-channel-label={channelNumberLabel}
                    data-channel-angle={activeChannelTheme.dialAngleDeg}
                    onClick={handleTurnChannelKnob}
                    aria-label={`Channel Selector Button (${channelNumberLabel} of ${totalTvChannels})`}
                    title={`Channel: ${channelNumberLabel} of ${totalTvChannels}`}
                    className="sq-pressable px-[1.2cqw] py-[0.55cqw] rounded-[5px] border border-[#857F74] bg-[#0B0A0A] text-[#FFFFFF] hover:border-[#E6007E] font-sans font-bold lowercase tabular-nums leading-none cursor-pointer"
                    style={{ fontSize: '1.5cqw' }}
                  >
                    {channelNumberLabel.toLowerCase()}
                  </button>

                  <button
                    id="tv-tint-knob"
                    type="button"
                    data-tint={activeTintPreset.code}
                    data-knob-angle={tintKnobAngleDeg}
                    onClick={handleCycleTintButton}
                    aria-label={`Display Color Preset (${activeTintPreset.label})`}
                    title={`Color Filter: ${activeTintPreset.label}`}
                    className={`sq-pressable px-[1.2cqw] py-[0.55cqw] rounded-[5px] border font-sans font-bold lowercase leading-none cursor-pointer ${
                      tintPresetIndex > 0
                        ? 'bg-[#E6007E]/15 border-[#E6007E] text-[#E6007E]'
                        : 'bg-[#0B0A0A] border-[#857F74] text-[#9B938B]'
                    }`}
                    style={{ fontSize: '1.5cqw' }}
                  >
                    {activeTintPreset.code.toLowerCase()}
                  </button>

                  <button
                    id="tv-btn-fullscreen"
                    type="button"
                    data-pressed={isTvFullscreen ? 'true' : 'false'}
                    onClick={handleToggleTvFullscreen}
                    aria-label={isTvFullscreen ? 'Exit Display Fullscreen' : 'Enter Display Fullscreen'}
                    title="Fullscreen Video"
                    className={`sq-pressable px-[1.2cqw] py-[0.55cqw] rounded-[5px] border font-sans font-bold lowercase leading-none cursor-pointer ${
                      isTvFullscreen
                        ? 'bg-[#E6007E] border-[#E6007E] text-[#FFFFFF]'
                        : 'bg-[#0B0A0A] border-[#857F74] text-[#FFFFFF]'
                    }`}
                    style={{ fontSize: '1.5cqw' }}
                  >
                    full
                  </button>

                  <button
                    id="tv-btn-scanlines"
                    type="button"
                    data-pressed={crtScanlinesOn ? 'true' : 'false'}
                    aria-pressed={crtScanlinesOn}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      setCrtScanlinesOn((v) => !v);
                    }}
                    aria-label="Toggle Display Scanlines"
                    title={`Scanlines: ${crtScanlinesOn ? 'ON' : 'OFF'}`}
                    className={`sq-pressable px-[1.2cqw] py-[0.55cqw] rounded-[5px] border font-sans font-bold lowercase leading-none cursor-pointer ${
                      crtScanlinesOn
                        ? 'bg-[#0B0A0A] border-[#F26A1B] text-[#F26A1B]'
                        : 'bg-[#55503C] border-[#857F74] text-[#9B938B]'
                    }`}
                    style={{ fontSize: '1.5cqw' }}
                  >
                    scan
                  </button>
                </div>
              </div>
            ) : isClickWheelTheme ? null : (
            <div
              id="retro-tv-side-mount"
              style={
                isReelTheme || isCassetteTheme
                  ? {
                      left: '76.8%',
                      top: '5%',
                      width: '20.8%',
                      height: '90%',
                      padding: '0.75cqw',
                    }
                  : {
                      left: '79.5%',
                      top: '6.6%',
                      width: '18.5%',
                      height: '85.2%',
                      padding: '0.85cqw',
                    }
              }
              className={
                isCassetteTheme
                  ? 'cas-brushed-steel absolute z-40 rounded-[3px] flex flex-col justify-between items-center overflow-hidden'
                  : isReelTheme
                    ? 'r2r-aluminum-fascia absolute z-40 rounded-[3px] flex flex-col justify-between items-center overflow-hidden'
                    : 'absolute z-40 rounded-[3px] border border-[#3d291a] bg-gradient-to-b from-[#d8cfc2] via-[#b8ac9b] to-[#8f8272] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_2px_6px_rgba(0,0,0,0.65)] flex flex-col justify-between items-center overflow-hidden'
              }
            >
              {/* Top Brand & Power LED Strip */}
              <div
                style={{ padding: '0.38cqw 0.45cqw' }}
                className={`w-full flex items-center justify-between gap-[0.3cqw] rounded-[2px] border shrink-0 ${
                  isCassetteTheme
                    ? 'bg-[#E9E6DA] border-[#84888E]'
                    : isReelTheme
                      ? 'bg-[#2a2724] border-[#525558]'
                      : 'bg-[#1b1510] border-black/70'
                }`}
              >
                <span
                  style={{ fontSize: '1.35cqw' }}
                  className={`font-mono font-extrabold tracking-[0.04em] uppercase leading-none whitespace-nowrap ${
                    isCassetteTheme
                      ? 'text-[#141516]'
                      : isReelTheme
                        ? 'text-[#EFE9DC]'
                        : 'text-amber-200/90'
                  }`}
                >
                  MAXYOUTIFY
                </span>
                <span
                  id="tv-standby-led"
                  aria-label={tvPoweredOn ? 'TV Power On LED' : 'TV Power Off LED'}
                  style={{
                    width: '1.3cqw',
                    height: '1.3cqw',
                    backgroundColor: tvPoweredOn
                      ? isCassetteTheme
                        ? '#3E8E5A'
                        : isReelTheme
                          ? '#FF9F43'
                          : '#22c55e'
                      : isCassetteTheme
                        ? '#D64541'
                        : isReelTheme
                          ? '#E8590C'
                          : '#ef4444',
                    boxShadow: tvPoweredOn
                      ? isCassetteTheme
                        ? '0 0 6px rgba(62, 142, 90, 0.9)'
                        : isReelTheme
                          ? '0 0 6px rgba(255, 159, 67, 0.9)'
                          : '0 0 5px rgba(34, 197, 94, 0.9)'
                      : '0 0 4px rgba(214, 69, 65, 0.75)',
                  }}
                  className="rounded-full border border-black/60 shrink-0"
                />
              </div>

              {isCassetteTheme ? (
                <>
                  {/* TWO LARGE KNURLED SILVER ROTARY DIALS (POWER + CHANNEL) */}
                  <div
                    id="retro-tv-large-knobs"
                    className="flex-1 w-full flex flex-col items-center justify-evenly min-h-0 py-[0.3cqw]"
                  >
                    {/* Large Silver Dial 1: POWER (Doubled 2x Tactile Size) */}
                    <div className="w-full flex flex-col items-center justify-center gap-[0.25cqw]">
                      <button
                        id="tv-power-knob"
                        type="button"
                        data-dial-scale="2x"
                        data-powered={tvPoweredOn ? 'true' : 'false'}
                        data-knob-angle={powerKnobAngleDeg}
                        aria-pressed={tvPoweredOn}
                        aria-label={`TV Power Knob (${tvPoweredOn ? 'On' : 'Off'})`}
                        title={`TV Power: ${tvPoweredOn ? 'ON (Click to turn Off)' : 'OFF (Click to turn On)'}`}
                        onClick={handleTogglePowerKnob}
                        style={{ width: '12.4cqw', height: '12.4cqw' }}
                        className="cas-knurled-knob relative rounded-full p-[0.55cqw] cursor-pointer flex items-center justify-center shrink-0 shadow-[0_4px_10px_rgba(0,0,0,0.48),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                      >
                        <div
                          style={{
                            transform: `rotate(${powerKnobAngleDeg}deg)`,
                            transition: knobTransition,
                          }}
                          className="w-[76%] h-[76%] rounded-full border border-[#6F7379] bg-gradient-to-b from-[#F4F5F7] via-[#D4D6D9] to-[#AEB1B6] flex items-start justify-center pointer-events-none shadow-inner"
                        >
                          <span className="mt-[0.45cqw] w-[0.95cqw] h-[2.6cqw] rounded-full bg-[#D64541] shadow-[0_0_4px_rgba(214,69,65,0.65)]" />
                        </div>
                      </button>
                      <div
                        id="tv-power-label-plate"
                        style={{ height: '2.8cqw', padding: '0 0.45cqw' }}
                        className="w-full rounded-[2px] border border-[#84888E] bg-[#E9E6DA] shadow-inner flex items-center justify-center overflow-hidden shrink-0"
                      >
                        <span
                          style={{ fontSize: '1.65cqw' }}
                          className="cas-condensed-label font-extrabold text-[#141516] leading-none whitespace-nowrap"
                        >
                          {tvPoweredOn ? 'PWR ON' : 'PWR OFF'}
                        </span>
                      </div>
                    </div>

                    {/* Large Silver Dial 2: CHANNEL (CH 1..5, Doubled 2x Tactile Size) */}
                    <div className="w-full flex flex-col items-center justify-center gap-[0.25cqw]">
                      <button
                        id="tv-channel-knob"
                        type="button"
                        data-dial-scale="2x"
                        data-channel-index={channelIndex + 1}
                        data-channel-total={totalTvChannels}
                        data-channel-label={channelNumberLabel}
                        data-channel-angle={activeChannelTheme.dialAngleDeg}
                        onClick={handleTurnChannelKnob}
                        aria-label={`TV Channel Selector Knob (${channelNumberLabel} of ${totalTvChannels})`}
                        title={`Channel Selector: ${channelNumberLabel} of ${totalTvChannels}`}
                        style={{ width: '12.4cqw', height: '12.4cqw' }}
                        className="cas-knurled-knob relative rounded-full p-[0.55cqw] cursor-pointer flex items-center justify-center shrink-0 shadow-[0_4px_10px_rgba(0,0,0,0.48),inset_0_1px_1px_rgba(255,255,255,0.9)]"
                      >
                        <div
                          style={{
                            transform: `rotate(${activeChannelTheme.dialAngleDeg}deg)`,
                            transition: knobTransition,
                          }}
                          className="w-[76%] h-[76%] rounded-full border border-[#6F7379] bg-gradient-to-b from-[#F4F5F7] via-[#D4D6D9] to-[#AEB1B6] flex items-start justify-center pointer-events-none shadow-inner"
                        >
                          <span className="mt-[0.45cqw] w-[0.95cqw] h-[2.6cqw] rounded-full bg-[#D64541] shadow-[0_0_4px_rgba(214,69,65,0.65)]" />
                        </div>
                      </button>
                      <div
                        id="tv-channel-label-plate"
                        style={{ height: '2.8cqw', padding: '0 0.45cqw' }}
                        className="w-full rounded-[2px] border border-[#84888E] bg-[#E9E6DA] shadow-inner flex items-center justify-center overflow-hidden shrink-0"
                      >
                        <span
                          style={{ fontSize: '1.65cqw' }}
                          className="cas-condensed-label font-extrabold text-[#D64541] leading-none whitespace-nowrap"
                        >
                          {channelNumberLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ROW OF SMALL SILVER MICRO-BUTTONS: FILTER/TINT + FULL + SCAN */}
                  <div
                    id="retro-tv-analogue-buttons"
                    role="group"
                    aria-label="Portable TV Silver Micro-Buttons"
                    style={{ paddingTop: '0.45cqw', gap: '0.35cqw' }}
                    className="w-full grid grid-cols-3 border-t border-[#84888E] shrink-0"
                  >
                    <button
                      id="tv-tint-knob"
                      type="button"
                      data-tint={activeTintPreset.code}
                      data-knob-angle={tintKnobAngleDeg}
                      onClick={handleCycleTintButton}
                      aria-label={`TV Filter and Tint Button (${activeTintPreset.label})`}
                      title={`Broadcast Filter/Tint: ${activeTintPreset.label} (${activeTintPreset.code})`}
                      style={{ height: '5.2cqw' }}
                      className={`rounded-[2px] border border-[#6E7278] ${
                        tintPresetIndex > 0
                          ? 'bg-gradient-to-b from-[#9DA0A4] to-[#B6B9BD] text-[#3E8E5A] translate-y-[0.5px]'
                          : 'bg-gradient-to-b from-[#F4F5F7] via-[#D4D6D9] to-[#A6AAAF] text-[#141516]'
                      } shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1.5px_3px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center cursor-pointer active:translate-y-[1px]`}
                    >
                      <span style={{ fontSize: '1.25cqw' }} className="cas-condensed-label font-extrabold leading-none">
                        {activeTintPreset.code}
                      </span>
                    </button>

                    <button
                      id="tv-btn-fullscreen"
                      type="button"
                      data-pressed={isTvFullscreen ? 'true' : 'false'}
                      onClick={handleToggleTvFullscreen}
                      aria-label={isTvFullscreen ? 'Exit TV Fullscreen' : 'Enter TV Fullscreen'}
                      title="Fullscreen Video (FULL)"
                      style={{ height: '5.2cqw' }}
                      className={`rounded-[2px] border border-[#6E7278] ${
                        isTvFullscreen
                          ? 'bg-gradient-to-b from-[#9DA0A4] to-[#B6B9BD] text-[#D64541] translate-y-[0.5px]'
                          : 'bg-gradient-to-b from-[#F4F5F7] via-[#D4D6D9] to-[#A6AAAF] text-[#141516]'
                      } shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1.5px_3px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center cursor-pointer active:translate-y-[1px]`}
                    >
                      <span style={{ fontSize: '1.25cqw' }} className="cas-condensed-label font-extrabold leading-none">
                        FULL
                      </span>
                    </button>

                    <button
                      id="tv-btn-scanlines"
                      type="button"
                      data-pressed={crtScanlinesOn ? 'true' : 'false'}
                      aria-pressed={crtScanlinesOn}
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        setCrtScanlinesOn((v) => !v);
                      }}
                      aria-label="Toggle CRT Scanlines Overlay"
                      title={`CRT Scanlines: ${crtScanlinesOn ? 'ON' : 'OFF'}`}
                      style={{ height: '5.2cqw' }}
                      className={`rounded-[2px] border border-[#6E7278] ${
                        crtScanlinesOn
                          ? 'bg-gradient-to-b from-[#9DA0A4] to-[#B6B9BD] text-[#3E6FB0] translate-y-[0.5px]'
                          : 'bg-gradient-to-b from-[#F4F5F7] via-[#D4D6D9] to-[#A6AAAF] text-[#141516]'
                      } shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1.5px_3px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center cursor-pointer active:translate-y-[1px]`}
                    >
                      <span style={{ fontSize: '1.25cqw' }} className="cas-condensed-label font-extrabold leading-none">
                        SCAN
                      </span>
                    </button>
                  </div>

                  {/* Molded Speaker Louver Slots */}
                  <div
                    aria-hidden="true"
                    style={{ height: '5.5cqw', marginTop: '0.4cqw' }}
                    className="w-full rounded-[2px] bg-[#141516] border border-[#6E7278] px-[0.4cqw] flex flex-col justify-evenly overflow-hidden shrink-0"
                  >
                    <span className="w-full h-[1.5px] bg-[#D64541]" />
                    <span className="w-full h-[1px] bg-[#3A3C3F]" />
                    <span className="w-full h-[1px] bg-[#3A3C3F]" />
                    <span className="w-full h-[1px] bg-[#3A3C3F]" />
                  </div>
                </>
              ) : (
                <>
                  {/* THREE ROTARY KNOBS: 1) POWER, 2) CHANNEL (CH 1..5), 3) FILTER/TINT */}
                  <div
                    id="retro-tv-large-knobs"
                    className="flex-1 w-full flex flex-col items-center justify-evenly min-h-0 py-[0.25cqw]"
                  >
                    {/* Knob 1: POWER */}
                    <div className="w-full flex flex-col items-center justify-center gap-[0.32cqw]">
                      <button
                        id="tv-power-knob"
                        type="button"
                        data-dial-scale="2x"
                        data-powered={tvPoweredOn ? 'true' : 'false'}
                        data-knob-angle={powerKnobAngleDeg}
                        aria-pressed={tvPoweredOn}
                        aria-label={`TV Power Knob (${tvPoweredOn ? 'On' : 'Off'})`}
                        title={`TV Power: ${tvPoweredOn ? 'ON (Click to turn Off)' : 'OFF (Click to turn On)'}`}
                        onClick={handleTogglePowerKnob}
                        style={{ width: isReelTheme ? '9.4cqw' : '10.2cqw', height: isReelTheme ? '9.4cqw' : '10.2cqw' }}
                        className={`relative rounded-full p-[0.45cqw] cursor-pointer flex items-center justify-center shrink-0 ${
                          isReelTheme
                            ? 'border border-[#5c6064] bg-gradient-to-br from-[#f1f3f5] via-[#C9CCCE] to-[#8a8e92] shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.85)] ring-2 ring-[#3c3f42]/50'
                            : 'border border-black/70 bg-[#18130f] shadow-[0_2px_5px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                        }`}
                      >
                        {isReelTheme ? (
                          <div
                            style={{
                              transform: `rotate(${powerKnobAngleDeg}deg)`,
                              transition: knobTransition,
                            }}
                            className="w-[74%] h-[74%] rounded-full border border-[#5e6266] bg-gradient-to-b from-[#e8ecef] to-[#a9adb1] flex items-start justify-center pointer-events-none"
                          >
                            <span className="mt-[0.25cqw] w-[0.55cqw] h-[1.4cqw] rounded-full bg-[#E8590C]" />
                          </div>
                        ) : (
                          <>
                            <img
                              src="/tv/tv-knob.webp"
                              alt=""
                              aria-hidden="true"
                              draggable={false}
                              style={{
                                transform: `rotate(${powerKnobAngleDeg}deg)`,
                                transition: knobTransition,
                              }}
                              className="w-full h-full object-contain pointer-events-none"
                            />
                            <span
                              aria-hidden="true"
                              style={{ width: '1.15cqw', height: '1.15cqw', top: '0.35cqw' }}
                              className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border border-black/70 ${
                                tvPoweredOn ? 'bg-emerald-400' : 'bg-red-500'
                              }`}
                            />
                          </>
                        )}
                      </button>
                      <div
                        id="tv-power-label-plate"
                        style={{ height: isReelTheme ? '3.4cqw' : '4.6cqw', padding: '0 0.45cqw' }}
                        className={`w-full rounded-[2px] border shadow-inner flex items-center justify-center overflow-hidden shrink-0 ${
                          isReelTheme ? 'bg-[#EFE9DC] border-[#786e60]' : 'bg-[#1a140f] border-[#3d2e1e]'
                        }`}
                      >
                        <span
                          style={{ fontSize: isReelTheme ? '1.85cqw' : '2.25cqw' }}
                          className={`font-mono font-black uppercase tracking-normal leading-none whitespace-nowrap ${
                            isReelTheme ? 'text-[#2b1a0e]' : 'text-[#fff3d6]'
                          }`}
                        >
                          {tvPoweredOn ? 'PWR ON' : 'PWR OFF'}
                        </span>
                      </div>
                    </div>

                    {/* Knob 2: CHANNEL Selector */}
                    <div className="w-full flex flex-col items-center justify-center gap-[0.32cqw]">
                      <button
                        id="tv-channel-knob"
                        type="button"
                        data-dial-scale="2x"
                        data-channel-index={channelIndex + 1}
                        data-channel-total={totalTvChannels}
                        data-channel-label={channelNumberLabel}
                        data-channel-angle={activeChannelTheme.dialAngleDeg}
                        onClick={handleTurnChannelKnob}
                        aria-label={`TV Channel Selector Knob (${channelNumberLabel} of ${totalTvChannels})`}
                        title={`Channel Selector: ${channelNumberLabel} of ${totalTvChannels} (${activeSongChannel?.label || activeChannelTheme.name}) — Click to cycle ${totalTvChannels} YouTube videos`}
                        style={{ width: isReelTheme ? '9.4cqw' : '10.2cqw', height: isReelTheme ? '9.4cqw' : '10.2cqw' }}
                        className={`relative rounded-full p-[0.45cqw] cursor-pointer flex items-center justify-center shrink-0 ${
                          isReelTheme
                            ? 'border border-[#5c6064] bg-gradient-to-br from-[#f1f3f5] via-[#C9CCCE] to-[#8a8e92] shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.85)] ring-2 ring-[#3c3f42]/50'
                            : 'border border-black/70 bg-[#18130f] shadow-[0_2px_5px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                        }`}
                      >
                        {isReelTheme ? (
                          <div
                            style={{
                              transform: `rotate(${activeChannelTheme.dialAngleDeg}deg)`,
                              transition: knobTransition,
                            }}
                            className="w-[74%] h-[74%] rounded-full border border-[#5e6266] bg-gradient-to-b from-[#e8ecef] to-[#a9adb1] flex items-start justify-center pointer-events-none"
                          >
                            <span className="mt-[0.25cqw] w-[0.55cqw] h-[1.4cqw] rounded-full bg-[#E8590C]" />
                          </div>
                        ) : (
                          <>
                            <img
                              src="/tv/tv-knob.webp"
                              alt=""
                              aria-hidden="true"
                              draggable={false}
                              style={{
                                transform: `rotate(${activeChannelTheme.dialAngleDeg}deg)`,
                                transition: knobTransition,
                              }}
                              className="w-full h-full object-contain pointer-events-none"
                            />
                            <span
                              aria-hidden="true"
                              style={{ width: '1.15cqw', height: '1.15cqw', top: '0.35cqw' }}
                              className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-amber-400 border border-black/70"
                            />
                          </>
                        )}
                      </button>
                      <div
                        id="tv-channel-label-plate"
                        style={{ height: isReelTheme ? '3.4cqw' : '4.6cqw', padding: '0 0.45cqw' }}
                        className={`w-full rounded-[2px] border shadow-inner flex items-center justify-center overflow-hidden shrink-0 ${
                          isReelTheme ? 'bg-[#EFE9DC] border-[#786e60]' : 'bg-[#1a140f] border-[#3d2e1e]'
                        }`}
                      >
                        <span
                          style={{ fontSize: isReelTheme ? '1.85cqw' : '2.25cqw' }}
                          className={`font-mono font-black uppercase tracking-normal leading-none whitespace-nowrap ${
                            isReelTheme ? 'text-[#2b1a0e]' : 'text-amber-300'
                          }`}
                        >
                          {channelNumberLabel}
                        </span>
                      </div>
                    </div>

                    {/* Knob 3: FILTER / TINT */}
                    <div className="w-full flex flex-col items-center justify-center gap-[0.32cqw]">
                      <button
                        id="tv-tint-knob"
                        type="button"
                        data-dial-scale="2x"
                        data-tint={activeTintPreset.code}
                        data-knob-angle={tintKnobAngleDeg}
                        onClick={handleCycleTintButton}
                        aria-label={`TV Filter and Tint Knob (${activeTintPreset.label})`}
                        title={`Broadcast Filter/Tint Knob: ${activeTintPreset.label} (${activeTintPreset.code})`}
                        style={{ width: isReelTheme ? '9.4cqw' : '10.2cqw', height: isReelTheme ? '9.4cqw' : '10.2cqw' }}
                        className={`relative rounded-full p-[0.45cqw] cursor-pointer flex items-center justify-center shrink-0 ${
                          isReelTheme
                            ? 'border border-[#5c6064] bg-gradient-to-br from-[#f1f3f5] via-[#C9CCCE] to-[#8a8e92] shadow-[0_2px_5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.85)] ring-2 ring-[#3c3f42]/50'
                            : 'border border-black/70 bg-[#18130f] shadow-[0_2px_5px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                        }`}
                      >
                        {isReelTheme ? (
                          <div
                            style={{
                              transform: `rotate(${tintKnobAngleDeg}deg)`,
                              transition: knobTransition,
                            }}
                            className="w-[74%] h-[74%] rounded-full border border-[#5e6266] bg-gradient-to-b from-[#e8ecef] to-[#a9adb1] flex items-start justify-center pointer-events-none"
                          >
                            <span className="mt-[0.25cqw] w-[0.55cqw] h-[1.4cqw] rounded-full bg-[#E8590C]" />
                          </div>
                        ) : (
                          <>
                            <img
                              src="/tv/tv-knob.webp"
                              alt=""
                              aria-hidden="true"
                              draggable={false}
                              style={{
                                transform: `rotate(${tintKnobAngleDeg}deg)`,
                                transition: knobTransition,
                              }}
                              className="w-full h-full object-contain pointer-events-none"
                            />
                            <span
                              aria-hidden="true"
                              style={{ width: '1.15cqw', height: '1.15cqw', top: '0.35cqw' }}
                              className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border border-black/70 ${
                                tintPresetIndex > 0 ? 'bg-cyan-300' : 'bg-amber-200'
                              }`}
                            />
                          </>
                        )}
                      </button>
                      <div
                        id="tv-tint-label-plate"
                        style={{ height: isReelTheme ? '3.4cqw' : '4.6cqw', padding: '0 0.45cqw' }}
                        className={`w-full rounded-[2px] border shadow-inner flex items-center justify-center overflow-hidden shrink-0 ${
                          isReelTheme ? 'bg-[#EFE9DC] border-[#786e60]' : 'bg-[#1a140f] border-[#3d2e1e]'
                        }`}
                      >
                        <span
                          style={{ fontSize: isReelTheme ? '1.8cqw' : '2.25cqw' }}
                          className={`font-mono font-black uppercase tracking-normal leading-none whitespace-nowrap ${
                            isReelTheme ? 'text-[#2b1a0e]' : 'text-[#fff3d6]'
                          }`}
                        >
                          {`TINT ${activeTintPreset.code}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* TWO PUSH-BUTTONS BELOW KNOBS: FULL & SCAN */}
                  <div
                    id="retro-tv-analogue-buttons"
                    role="group"
                    aria-label="TV Analogue Push Buttons"
                    style={{ paddingTop: '0.5cqw', gap: '0.5cqw' }}
                    className="w-full grid grid-cols-2 border-t border-black/35 shrink-0"
                  >
                    <button
                      id="tv-btn-fullscreen"
                      type="button"
                      data-pressed={isTvFullscreen ? 'true' : 'false'}
                      onClick={handleToggleTvFullscreen}
                      aria-label={isTvFullscreen ? 'Exit TV Fullscreen' : 'Enter TV Fullscreen'}
                      title="Fullscreen Video (FULL)"
                      style={{ height: isReelTheme ? '5.4cqw' : '7.1cqw' }}
                      className={`rounded-[3px] border border-black/85 ${
                        isTvFullscreen
                          ? 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                          : isReelTheme
                            ? 'bg-gradient-to-b from-[#f0f3f5] via-[#C9CCCE] to-[#9EA2A6] text-[#1f1914]'
                            : 'bg-gradient-to-b from-[#faf4ec] via-[#dccfb9] to-[#9b8c79] text-[#17120d]'
                      } shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.75)] flex flex-col items-center justify-center gap-[0.2cqw] cursor-pointer active:translate-y-[1px]`}
                    >
                      {isTvFullscreen ? (
                        <Minimize2 strokeWidth={2.4} style={{ width: '2.2cqw', height: '2.2cqw' }} />
                      ) : (
                        <Maximize2 strokeWidth={2.4} style={{ width: '2.2cqw', height: '2.2cqw' }} />
                      )}
                      <span
                        style={{ fontSize: '1.6cqw' }}
                        className="font-mono font-black uppercase tracking-tight leading-none"
                      >
                        FULL
                      </span>
                    </button>

                    <button
                      id="tv-btn-scanlines"
                      type="button"
                      data-pressed={crtScanlinesOn ? 'true' : 'false'}
                      aria-pressed={crtScanlinesOn}
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        setCrtScanlinesOn((v) => !v);
                      }}
                      aria-label="Toggle CRT Scanlines Overlay"
                      title={`CRT Scanlines: ${crtScanlinesOn ? 'ON' : 'OFF'}`}
                      style={{ height: isReelTheme ? '5.4cqw' : '7.1cqw' }}
                      className={`rounded-[3px] border border-black/85 ${
                        crtScanlinesOn
                          ? isReelTheme
                            ? 'bg-gradient-to-b from-[#4a301c] to-[#2e1c0f] text-[#FF9F43] translate-y-[0.5px]'
                            : 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                          : isReelTheme
                            ? 'bg-gradient-to-b from-[#f0f3f5] via-[#C9CCCE] to-[#9EA2A6] text-[#1f1914]'
                            : 'bg-gradient-to-b from-[#faf4ec] via-[#dccfb9] to-[#9b8c79] text-[#17120d]'
                      } shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.75)] flex flex-col items-center justify-center gap-[0.2cqw] cursor-pointer active:translate-y-[1px]`}
                    >
                      <Tv strokeWidth={2.4} style={{ width: '2.2cqw', height: '2.2cqw' }} />
                      <span
                        style={{ fontSize: '1.6cqw' }}
                        className="font-mono font-black uppercase tracking-tight leading-none"
                      >
                        SCAN
                      </span>
                    </button>
                  </div>

                  {/* Woven Silver-Thread Speaker Grille for 1960s Console TV */}
                  {isReelTheme && (
                    <div
                      id="r2r-tv-speaker-grille"
                      aria-hidden="true"
                      style={{ height: '7.5cqw', marginTop: '0.5cqw' }}
                      className="r2r-speaker-grille w-full rounded-[2px] border border-[#4a4d50] shadow-inner shrink-0"
                    />
                  )}
                </>
              )}
            </div>
            ))}
          </div>

          {/* Sleek Glossy Piano-Black Rectangular Pedestal Stand with Dark-Chrome Neck for Sony Bravia TV */}
          {isCdHifiTheme && (
            <div
              id="bravia-tv-pedestal"
              aria-hidden="true"
              className="pointer-events-none relative z-[5] -mt-[1px] flex flex-col items-center justify-start w-full shrink-0"
            >
              {/* Short Dark-Chrome Support Neck */}
              <div className="w-[18%] max-w-[74px] min-w-[42px] h-[8px] sm:h-[11px] bg-gradient-to-r from-[#1E2430] via-[#64748B] to-[#1E2430] border-x border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.28)]" />
              {/* Glossy Piano-Black Rectangular Footplate */}
              <div className="bravia-pedestal-stand w-[56%] max-w-[230px] min-w-[130px] h-[8px] sm:h-[10px] -mt-[1px] rounded-[2px]" />
            </div>
          )}

          {/* Early-2000s Clear Acrylic Sculpted Pedestal Foot Under Silver Widescreen Monitor */}
          {isClickWheelTheme && (
            <div
              id="cw-lcd-pedestal"
              aria-hidden="true"
              className="pointer-events-none relative z-[5] -mt-[1px] flex flex-col items-center justify-start w-full shrink-0"
            >
              {/* Sculpted Clear Acrylic Support Neck with Bright Specular Refraction Edges */}
              <div className="cw-acrylic-pedestal-leg w-[20%] max-w-[78px] min-w-[44px] h-[11px] sm:h-[15px] rounded-b-[4px]" />
              {/* Curved Clear Acrylic Footplate */}
              <div className="cw-acrylic-pedestal-leg w-[54%] max-w-[208px] min-w-[116px] h-[8px] sm:h-[10px] -mt-[2px] rounded-full" />
            </div>
          )}

          {/* 1998 Beige Tilt-Swivel CRT Monitor Pedestal Base */}
          {isDesktop98Theme && (
            <div
              id="d98-crt-pedestal"
              aria-hidden="true"
              className="pointer-events-none relative z-[5] -mt-[2px] flex flex-col items-center justify-start w-full shrink-0"
            >
              <div className="w-[28%] max-w-[100px] min-w-[54px] h-[7px] sm:h-[9px] bg-gradient-to-r from-[#A59D8A] via-[#D8D1C1] to-[#98907C] border-x border-[#6B6454]" />
              <div className="w-[56%] max-w-[210px] min-w-[120px] h-[8px] sm:h-[10px] -mt-[1px] rounded-t-[4px] rounded-b-[2px] bg-gradient-to-b from-[#DFD9CA] via-[#C7BFA9] to-[#9D9580] border border-[#6B6454] shadow-[0_4px_10px_rgba(0,0,0,0.65)]" />
            </div>
          )}
        </div>

        {/* Free-Floating Draggable Sony RMT-TX102U TV Remote (Exclusive to CD Hi-Fi System Theme) */}
        {isCdHifiTheme && (
          <SonyBraviaRemote
            tvPoweredOn={tvPoweredOn}
            picOffMode={braviaPicOff}
            isMuted={braviaMuted}
            volume={volume}
            isPlaying={effectiveTvPlaying}
            lowPowerMode={lowPowerMode}
            totalTracks={playlistTracks.length}
            externalOpenRequestNonce={braviaRemoteOpenNonce}
            onToggleTvPower={() => {
              handleTogglePowerKnob();
              triggerBraviaOsd('POWER', tvPoweredOn ? 'STANDBY' : 'POWER ON', 'POWER');
            }}
            onCycleTvInput={() => {
              setBraviaInputIndex((prev) => {
                const next = (prev + 1) % BRAVIA_INPUT_LABELS.length;
                const banner = formatBraviaOsdBanner('INPUT', {
                  inputLabel: BRAVIA_INPUT_LABELS[next],
                });
                triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
                return next;
              });
            }}
            onCycleTvChannel={(delta) => {
              if (!tvPoweredOn) return;
              setChannelIndex((prev) => {
                prevBraviaChannelRef.current = prev;
                const next = (prev + delta + totalTvChannels) % totalTvChannels;
                const banner = formatBraviaOsdBanner('CHANNEL', {
                  channelNumber: next + 1,
                  channelLabel: activeSongChannel?.label || activeChannelTheme.name,
                });
                triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
                return next;
              });
              triggerOneShotChannelChange();
            }}
            onJumpChannel={() => {
              if (!tvPoweredOn) return;
              setChannelIndex((prev) => {
                const target = prevBraviaChannelRef.current % totalTvChannels;
                prevBraviaChannelRef.current = prev;
                const banner = formatBraviaOsdBanner('CHANNEL', {
                  channelNumber: target + 1,
                  channelLabel: activeSongChannel?.label || activeChannelTheme.name,
                });
                triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
                return target;
              });
              triggerOneShotChannelChange();
            }}
            onSelectTrackIndex={(trackIdx) => {
              if (trackIdx >= 0 && trackIdx < totalTvChannels && tvPoweredOn) {
                prevBraviaChannelRef.current = channelIndex;
                setChannelIndex(trackIdx);
                triggerOneShotChannelChange();
              }
              if (playlistTracks.length > 0 && onSelectTrack) {
                const clampedIdx = Math.max(0, Math.min(playlistTracks.length - 1, trackIdx));
                const chosen = playlistTracks[clampedIdx];
                if (chosen) {
                  onSelectTrack(chosen.id);
                  triggerBraviaOsd(
                    `DISC TRACK ${String(clampedIdx + 1).padStart(2, '0')}`,
                    `${chosen.title} · ${chosen.artist}`,
                    'HI-FI SYNC'
                  );
                }
              }
            }}
            onChangeVolume={(nextVol) => {
              const clamped = Math.max(0, Math.min(1, Number(nextVol.toFixed(2))));
              onChangeVolume?.(clamped);
              setBraviaMuted(clamped === 0);
              const banner = formatBraviaOsdBanner('VOLUME', {
                volumePct: Math.round(clamped * 100),
                isMuted: clamped === 0,
              });
              triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
            }}
            onToggleMute={() => {
              setBraviaMuted((prev) => {
                const nextMuted = !prev;
                if (nextMuted) {
                  braviaPreMuteVolumeRef.current = volume > 0 ? volume : 0.75;
                  onChangeVolume?.(0);
                } else {
                  onChangeVolume?.(braviaPreMuteVolumeRef.current || 0.75);
                }
                const banner = formatBraviaOsdBanner('MUTING', {
                  isMuted: nextMuted,
                  volumePct: nextMuted ? 0 : Math.round((braviaPreMuteVolumeRef.current || 0.75) * 100),
                });
                triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
                return nextMuted;
              });
            }}
            onTogglePicOff={() => {
              setBraviaPicOff((prev) => {
                const next = !prev;
                const banner = formatBraviaOsdBanner('PIC_OFF', {
                  picOff: next,
                });
                triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
                return next;
              });
            }}
            onTriggerColorShortcut={(color) => {
              const colorMap: Record<'YELLOW' | 'BLUE' | 'RED' | 'GREEN', number> = {
                YELLOW: 1,
                BLUE: 2,
                RED: 3,
                GREEN: 0,
              };
              const nextIdx = colorMap[color] % CRT_TINT_PRESETS.length;
              setTintPresetIndex(nextIdx);
              const preset = CRT_TINT_PRESETS[nextIdx] || CRT_TINT_PRESETS[0];
              triggerBraviaOsd(`COLOR · ${color}`, preset.label, 'PICTURE');
            }}
            onTriggerNetflixMode={() => {
              setTintPresetIndex(1);
              if (tvPoweredOn) {
                triggerOneShotChannelChange();
              }
              const banner = formatBraviaOsdBanner('NETFLIX', {
                channelLabel: `${track.title} · WIDESCREEN 24P`,
              });
              triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
            }}
            onCycleDisplayMode={() => {
              setBraviaDisplayModeIdx((prev) => {
                const next = (prev + 1) % BRAVIA_DISPLAY_MODES.length;
                const banner = formatBraviaOsdBanner('DISPLAY', {
                  displayModeLabel: BRAVIA_DISPLAY_MODES[next],
                  channelLabel: `${track.title} — ${track.artist}`,
                });
                triggerBraviaOsd(banner.title, banner.subtitle, banner.badge);
                return next;
              });
            }}
            onTogglePlay={() => {
              setTvOverridePlaying(null);
              onTogglePlay?.();
              triggerBraviaOsd('TRANSPORT', effectiveTvPlaying ? 'PAUSE ⏸' : 'PLAY ▶', 'HI-FI LINK');
            }}
            onStop={() => {
              onStop?.();
              triggerBraviaOsd('TRANSPORT', 'STOP ■', 'HI-FI LINK');
            }}
            onPrevious={() => {
              onPrevious?.();
              triggerBraviaOsd('TRANSPORT', 'PREV I◀◀', 'HI-FI LINK');
            }}
            onNext={() => {
              onNext?.();
              triggerBraviaOsd('TRANSPORT', 'NEXT ▶▶I', 'HI-FI LINK');
            }}
            onSeekDelta={(deltaSec) => {
              const cur = playbackClockStore.getCurrentTimeSec();
              const nextSec = Math.max(0, Math.min(track.durationSec, cur + deltaSec));
              onSeek?.(nextSec);
              triggerBraviaOsd(
                'SCAN SEEK',
                `${deltaSec > 0 ? 'FF ▶▶' : 'REW ◀◀'} ${formatDuration(nextSec)}`,
                'HI-FI LINK'
              );
            }}
          />
        )}
      </section>
    );
  }
);

/**
 * Shared Screwed-in Brushed-Metal Label Plate for Playlist Hardware Push-Buttons (Matching Turntable Controls).
 */
const PlaylistHardwareLabelPlate = React.memo<{ label: string }>(({ label }) => (
  <div className="relative min-w-[42px] sm:min-w-[46px] px-2 h-[12px] sm:h-[13px] rounded-[2px] overflow-hidden border border-[#d6c7b2]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.7)] flex items-center justify-center shrink-0">
    <img
      src="/console/metal-plate.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute inset-0 w-full h-full object-cover"
    />
    <img
      src="/console/screw-head.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute left-[2px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] z-10"
    />
    <img
      src="/console/screw-head.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute right-[2px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] z-10"
    />
    <span className="relative z-10 font-mono text-[5.5px] sm:text-[6px] font-extrabold uppercase tracking-tight text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] leading-none whitespace-nowrap">
      {label}
    </span>
  </div>
));

/**
 * Round Machined Metal Push-Button + Screwed-In Engraved Label Plate for the Playlist Box
 * (Exact same retro hardware theme as the controls on the turntable board).
 */
const PlaylistHardwarePushButton = React.memo<{
  id?: string;
  label: string;
  ariaLabel: string;
  title: string;
  disabled?: boolean;
  isPressed?: boolean;
  isBlinking?: boolean;
  highlightEmerald?: boolean;
  isReelTheme?: boolean;
  isCassetteTheme?: boolean;
  isCdHifiTheme?: boolean;
  isClickWheelTheme?: boolean;
  isSquircleTheme?: boolean;
  isDesktop98Theme?: boolean;
  isStreamlineTheme?: boolean;
  isAuroraTheme?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>(
  ({
    id,
    label,
    ariaLabel,
    title,
    disabled = false,
    isPressed = false,
    isBlinking = false,
    highlightEmerald = false,
    isReelTheme = false,
    isCassetteTheme = false,
    isCdHifiTheme = false,
    isClickWheelTheme = false,
    isSquircleTheme = false,
    isDesktop98Theme = false,
    isStreamlineTheme = false,
    isAuroraTheme = false,
    onClick,
    children,
  }) => {
    const [momentaryDown, setMomentaryDown] = useState(false);
    const depressed = isPressed || momentaryDown;

    if (
      isAuroraTheme ||
      isStreamlineTheme ||
      isCdHifiTheme ||
      isClickWheelTheme ||
      isSquircleTheme ||
      isDesktop98Theme ||
      isCassetteTheme
    ) {
      return (
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={isPressed}
          title={title}
          data-pressed={depressed ? 'true' : 'false'}
          data-blinking={isBlinking ? 'true' : 'false'}
          onPointerDown={() => {
            if (!disabled) setMomentaryDown(true);
          }}
          onPointerUp={() => setMomentaryDown(false)}
          onPointerLeave={() => {
            if (momentaryDown) setMomentaryDown(false);
          }}
          onClick={onClick}
          style={{
            transform: depressed && !disabled ? 'translateY(1px)' : 'translateY(0px)',
            transition: 'transform 80ms linear, background-color 120ms linear',
          }}
          className={`${
            isDesktop98Theme
              ? 'h-[26px] sm:h-[28px] px-2.5 rounded-[3px] text-[10px]'
              : isCassetteTheme
                ? 'h-[36px] sm:h-[38px] px-2.5 rounded-[5px] text-[11px]'
                : isAuroraTheme || isStreamlineTheme
                  ? 'h-[40px] px-3 rounded-[10px] text-[11px]'
                  : 'h-[40px] sm:h-[44px] px-3 rounded-[8px] text-[11px]'
          } border border-[#199e48] bg-[#1DB954] hover:bg-[#1ed760] text-white font-sans font-bold tracking-tight flex items-center justify-center gap-1.5 shadow-[0_2px_6px_rgba(29,185,84,0.32)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
            isBlinking ? 'spotify-connect-blink ring-2 ring-[#1ed760]' : ''
          }`}
        >
          <span className="flex items-center justify-center shrink-0">{children}</span>
          <span className="leading-none whitespace-nowrap">
            {spotifyConnectedLabel(label)}
          </span>
        </button>
      );
    }

    if (isReelTheme) {
      return (
        <div className="flex flex-col items-center justify-end gap-0.5 shrink-0">
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-pressed={isPressed}
            title={title}
            data-pressed={depressed ? 'true' : 'false'}
            data-blinking={isBlinking ? 'true' : 'false'}
            onPointerDown={() => {
              if (!disabled) setMomentaryDown(true);
            }}
            onPointerUp={() => setMomentaryDown(false)}
            onPointerLeave={() => {
              if (momentaryDown) setMomentaryDown(false);
            }}
            onClick={onClick}
            style={{
              transform: depressed && !disabled ? 'translateY(1.5px)' : 'translateY(0px)',
              transition: 'transform 80ms linear, background-color 120ms linear',
            }}
            className={`relative w-[30px] h-[30px] rounded-full border border-[#6E7276] flex items-center justify-center cursor-pointer disabled:opacity-40 focus:outline-none ${
              isBlinking ? 'spotify-connect-blink ring-2 ring-[#1ed760]' : ''
            } ${
              highlightEmerald
                ? 'bg-[#1DB954] text-white shadow-[0_2px_6px_rgba(29,185,84,0.38)]'
                : 'r2r-aluminum-fascia text-[#2b1a0e] shadow-[0_2px_5px_rgba(0,0,0,0.4)]'
            }`}
          >
            {children}
          </button>
          <span className="px-1.5 py-[1px] rounded-[2px] border border-[#8c7e6a] bg-[#EFE9DC] font-mono text-[6px] font-bold uppercase tracking-tight text-[#2b1a0e] leading-none whitespace-nowrap">
            {label}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-end gap-0.5 shrink-0">
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={isPressed}
          title={title}
          data-pressed={depressed ? 'true' : 'false'}
          data-blinking={isBlinking ? 'true' : 'false'}
          onPointerDown={() => {
            if (!disabled) setMomentaryDown(true);
          }}
          onPointerUp={() => setMomentaryDown(false)}
          onPointerLeave={() => {
            if (momentaryDown) setMomentaryDown(false);
          }}
          onClick={onClick}
          style={{
            transform: depressed && !disabled ? 'translateY(1.5px)' : 'translateY(0px)',
            transition: 'transform 80ms linear, opacity 120ms linear',
          }}
          className={`relative w-[28px] h-[28px] sm:w-[32px] sm:h-[32px] rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
            isBlinking ? 'spotify-connect-blink ring-2 ring-[#1ed760]' : ''
          } ${
            highlightEmerald
              ? 'ring-1 ring-emerald-400/70 shadow-[0_2px_6px_rgba(0,0,0,0.75)]'
              : 'shadow-[0_2px_6px_rgba(0,0,0,0.75)]'
          }`}
        >
          <img
            src={depressed ? '/console/pushbutton-down.webp' : '/console/pushbutton-up.webp'}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] object-contain"
          />
          <span
            className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
              highlightEmerald
                ? 'text-emerald-950'
                : depressed
                ? 'text-amber-300'
                : 'text-[#18130e]'
            }`}
          >
            {children}
          </span>
        </button>
        <PlaylistHardwareLabelPlate label={label} />
      </div>
    );
  }
);

function spotifyConnectedLabel(rawLabel: string): string {
  return rawLabel === 'SPOTIFY' ? 'Spotify' : rawLabel;
}

interface PlaylistQueueBoxProps {
  playlists: PlaylistPack[];
  activePlaylist: PlaylistPack;
  activeTrackId: string;
  isPlaying?: boolean;
  lowPowerMode?: boolean;
  isLoadingPlaylist?: boolean;
  spotifyConnected?: boolean;
  spotifyUserLabel?: string;
  needsInitialSpotifyConnect?: boolean;
  guidanceActive?: boolean;
  isDocumentHidden?: boolean;
  prefersReducedMotion: boolean;
  showCompactBrandHeader?: boolean;
  themePalette: DominantThemePalette;
  activeThemeId?: string;
  auroraAccents?: { primaryHex: string; secondaryHex: string };
  availableThemes?: readonly ThemeDefinition[];
  onSelectTheme?: (themeId: string) => void;
  parentPlaylistCoverUrl?: string;
  onSelectPlaylist: (playlistId: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onOpenSpotifyModal?: () => void;
  onResolvedPerTrackArtwork?: (trackId: string, artworkUrl: string) => void;
}

/**
 * Requirement 9: Individual Playlist Track Row with Song-Specific Artwork, Retry/Fallback & Loading Skeleton
 */
const PlaylistTrackRow = React.memo<{
  item: TrackItem;
  trackIndex: number;
  isCurrent: boolean;
  lowPowerMode: boolean;
  activeThemeId?: string;
  auroraAccentHex?: string;
  parentPlaylistCoverUrl?: string;
  activeRowRef: React.MutableRefObject<HTMLButtonElement | null>;
  onSelectTrack: (trackId: string) => void;
  onResolvedPerTrackArtwork?: (trackId: string, artworkUrl: string) => void;
}>(
  ({
    item,
    trackIndex,
    isCurrent,
    lowPowerMode,
    activeThemeId = DEFAULT_THEME_ID,
    auroraAccentHex = AURORA_PALETTE.cyan,
    parentPlaylistCoverUrl,
    activeRowRef,
    onSelectTrack,
    onResolvedPerTrackArtwork,
  }) => {
    const isReelTheme = activeThemeId === 'reel-to-reel';
    const isCassetteTheme = activeThemeId === 'cassette-deck';
    const isCdHifiTheme = activeThemeId === 'cd-hifi';
    const isClickWheelTheme = activeThemeId === 'click-wheel';
    const isSquircleTheme = activeThemeId === 'squircle-pmp';
    const isDesktop98Theme = activeThemeId === 'desktop-98';
    const isStreamlineTheme = activeThemeId === 'streamline';
    const isAuroraTheme = activeThemeId === 'aurora-deck';
    const spineColor = getCassetteSpineStripeColor(trackIndex);
    const [failedCount, setFailedCount] = useState<number>(0);
    const [imgLoaded, setImgLoaded] = useState<boolean>(false);
    const [fetchedSongArt, setFetchedSongArt] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
      setFailedCount(0);
      setImgLoaded(false);
    }, [item.id, item.artworkUrl]);

    const effectiveTrackForArt = useMemo<TrackItem>(
      () =>
        fetchedSongArt
          ? {
              ...item,
              artworkUrl: fetchedSongArt,
              images: [{ url: fetchedSongArt, width: 640, height: 640 }, ...(item.images || [])],
            }
          : item,
      [item, fetchedSongArt]
    );

    const artState = useMemo(
      () => resolveActiveArtworkState(effectiveTrackForArt, failedCount, parentPlaylistCoverUrl),
      [effectiveTrackForArt, failedCount, parentPlaylistCoverUrl]
    );

    useEffect(() => {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth > 0) {
        setImgLoaded(true);
      }
    }, [artState.activeUrl, item.id]);

    // If song-specific artwork is missing or all initial candidates failed, fetch individual song artwork with retry
    useEffect(() => {
      if (!artState.isPlaceholder || !item.id || !item.title || item.id === 'standby-empty') return;

      let cancelled = false;
      let retryTimerId: number | null = null;
      const fetchWithRetry = async (attempt: number) => {
        try {
          const params = new URLSearchParams({
            trackId: item.id,
            title: item.title,
            artist: item.artist || '',
          });
          const res = await fetch(`/api/spotify/track-artwork?${params.toString()}`);
          if (res.ok) {
            const data = (await res.json()) as { artworkUrl?: string | null };
            if (!cancelled && data?.artworkUrl) {
              setFetchedSongArt(data.artworkUrl);
              setFailedCount(0);
              onResolvedPerTrackArtwork?.(item.id, data.artworkUrl);
              return;
            }
          }
        } catch {
          // retry if possible
        }
        if (!cancelled && attempt < 1) {
          retryTimerId = window.setTimeout(() => {
            retryTimerId = null;
            if (!cancelled) fetchWithRetry(attempt + 1);
          }, 350);
        }
      };

      fetchWithRetry(0);
      return () => {
        cancelled = true;
        if (retryTimerId !== null) {
          window.clearTimeout(retryTimerId);
        }
      };
    }, [artState.isPlaceholder, item.id, item.title, item.artist, onResolvedPerTrackArtwork]);

    const spinePalette = useCassetteSpinePalette(
      isCassetteTheme && !artState.isPlaceholder ? artState.activeUrl : '',
      isCassetteTheme
    );

    if (isCdHifiTheme) {
      return (
        <div
          data-cd-jewel-slot={trackIndex + 1}
          style={{ perspective: '900px' }}
          className="relative rounded-[4px] bg-[#090C12]/95 border border-[#2E3748] p-[2px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)] overflow-visible"
        >
          <button
            ref={isCurrent ? activeRowRef : null}
            type="button"
            data-track-id={item.id}
            data-cd-jewel-case="true"
            data-cd-loaded={isCurrent ? 'true' : 'false'}
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              if (!lowPowerMode) {
                retroAudio.triggerCdTrackChangeCue();
              }
              onSelectTrack(item.id);
            }}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`Load Compact Disc ${item.title} by ${item.artist}`}
            className={`cd-jewel-case-slot group/jewel relative w-full min-h-[48px] rounded-[3px] flex items-stretch overflow-hidden text-left transition-all duration-200 cursor-pointer ${
              isCurrent
                ? 'cd-jewel-case-slot--active translate-x-[12px] z-20'
                : 'translate-x-0 hover:[transform:perspective(900px)_translateZ(28px)_translateX(16px)] hover:shadow-[0_14px_28px_rgba(0,0,0,0.88),0_0_14px_rgba(0,240,255,0.32)] hover:z-30'
            }`}
          >
            {/* 2.1 Left Hinged Frosted/Ribbed Clear Polystyrene Spine Strip (width: 12px) with Hinge Pins & Printed Spine Edge */}
            <div
              aria-hidden="true"
              data-jewel-spine-width="12"
              className="cd-jewel-ridged-spine w-[12px] shrink-0 flex flex-col items-center justify-between py-1 border-r border-white/30"
            >
              {/* Top Plastic Hinge Pin */}
              <span className="w-[6px] h-[2px] rounded-full bg-white/65 shadow-xs" />
              {/* Printed Paper Spine Edge Peeking Through */}
              <span className="font-mono text-[6.5px] font-extrabold text-[#00F0FF] -rotate-90 tracking-tighter tabular-nums">
                {String(trackIndex + 1).padStart(2, '0')}
              </span>
              {/* Bottom Plastic Hinge Pin */}
              <span className="w-[6px] h-[2px] rounded-full bg-white/65 shadow-xs" />
            </div>

            {/* Clear Acrylic Front Cover + Square Booklet Insert + Semi-Visible Silver Disc Edge */}
            <div className="relative flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1 bg-gradient-to-r from-[#111722]/96 via-[#172030]/92 to-[#0D131D]/96">
              {/* Clear Acrylic Front Cover Glare (125deg) + 1px Specular Bevel Highlights */}
              <div
                aria-hidden="true"
                className="cd-jewel-acrylic-glare pointer-events-none absolute inset-0 z-10"
              />

              {/* Subtle Inner Corner Retention Tabs Holding Square Booklet Insert */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0.5 left-9 z-30 w-1.5 h-1.5 border-t border-r border-white/55"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0.5 left-9 z-30 w-1.5 h-1.5 border-b border-r border-white/55"
              />

              <div className="relative z-20 flex items-center gap-2.5 min-w-0 flex-1">
                {/* Square Booklet Insert + Semi-Visible Silver Compact Disc Edge Peeking From Dark Charcoal Tray */}
                <div className="relative w-10 h-9 flex items-center shrink-0">
                  {/* Semi-Visible Silver Compact Disc Edge Peeking Behind Right Side of Booklet */}
                  <div
                    aria-hidden="true"
                    data-testid="cd-jewel-disc-edge"
                    className="cd-optical-disc-rainbow pointer-events-none absolute right-0 w-8 h-8 rounded-full border border-white/75 opacity-90 shadow-[0_2px_6px_rgba(0,0,0,0.85)]"
                  />
                  {/* Square Printed Booklet Insert Thumbnail */}
                  <div className="relative z-10 w-8 h-8 rounded-[2px] overflow-hidden border border-white/40 bg-[#090D14] shrink-0 shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                    {!artState.isPlaceholder && artState.activeUrl && (
                      <img
                        ref={imgRef}
                        src={artState.activeUrl}
                        alt={`${item.title} booklet cover`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onLoad={() => setImgLoaded(true)}
                        onError={() => {
                          setImgLoaded(false);
                          setFailedCount((prev) => prev + 1);
                        }}
                        className={`w-full h-full object-cover transition-opacity duration-200 ${
                          imgLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    )}
                    {(artState.isPlaceholder || !imgLoaded) && (
                      <div className="w-full h-full flex items-center justify-center bg-[#0F172A]">
                        <Disc3 className="w-4 h-4 text-[#00F0FF]" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Printed Spine Title & Artist Typography */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono text-[8px] font-bold px-1 py-[0.5px] rounded-[2px] border tabular-nums shrink-0 ${
                        isCurrent
                          ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]'
                          : 'bg-black/55 border-white/20 text-[#94A3B8]'
                      }`}
                    >
                      DISC {((trackIndex % 3) + 1)} · T{String(trackIndex + 1).padStart(2, '0')}
                    </span>
                    <p
                      className={`font-sans text-[11.5px] font-bold truncate ${
                        isCurrent ? 'text-[#00F0FF] cd-vfd-cyan-glow' : 'text-[#F1F5F9]'
                      }`}
                    >
                      {item.title}
                    </p>
                  </div>
                  <p className="font-sans text-[10px] font-medium text-[#94A3B8] truncate mt-0.5">
                    {item.artist}
                  </p>
                </div>
              </div>

              {/* Right Interactive "Load Disc" Action Badge + Duration */}
              <div className="relative z-20 flex items-center gap-1.5 shrink-0">
                <span
                  data-testid="cd-jewel-load-disc-badge"
                  className={`px-1.5 py-0.5 rounded-[2px] border font-mono text-[8px] font-bold uppercase tracking-wider transition-all ${
                    isCurrent
                      ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF] opacity-100 shadow-[0_0_8px_rgba(0,240,255,0.35)]'
                      : 'bg-[#0F172A]/90 border-[#38BDF8]/50 text-[#38BDF8] opacity-85 group-hover/jewel:opacity-100 group-hover/jewel:bg-[#00F0FF]/20 group-hover/jewel:border-[#00F0FF] group-hover/jewel:text-[#00F0FF]'
                  }`}
                >
                  {isCurrent ? 'IN TRAY' : 'LOAD DISC'}
                </span>
                <span className="font-mono text-[10px] font-semibold text-[#CBD5E1] tabular-nums">
                  {formatDuration(item.durationSec)}
                </span>
              </div>
            </div>
          </button>
        </div>
      );
    }

    if (isCassetteTheme) {
      return (
        <div
          data-cas-track-slot="matte-charcoal"
          className="relative rounded-[2.5px] bg-[#18191B] p-[2px] border border-[#3A3E42] shadow-[inset_0_2px_4px_rgba(0,0,0,0.92),0_1px_0_rgba(255,255,255,0.25)] overflow-hidden"
        >
          {/* Hidden/Preload image to drive real artwork resolution & failure retries cleanly */}
          {!artState.isPlaceholder && artState.activeUrl && (
            <img
              ref={imgRef}
              src={artState.activeUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgLoaded(false);
                setFailedCount((prev) => prev + 1);
              }}
              className="sr-only"
            />
          )}

          <button
            ref={isCurrent ? activeRowRef : null}
            type="button"
            data-track-id={item.id}
            data-spine-color={spinePalette.baseHex}
            data-cas-pulled-out={isCurrent ? 'true' : 'false'}
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              onSelectTrack(item.id);
            }}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`Play ${item.title} by ${item.artist}`}
            style={{
              borderColor: isCurrent ? '#E61919' : '#686C70',
              boxShadow: isCurrent
                ? '0 4px 10px rgba(0, 0, 0, 0.78), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
                : '0 1.5px 3px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.78)',
            }}
            className={`group/cas relative w-full min-h-[42px] rounded-[2px] border px-1.5 py-1 flex items-center justify-between gap-1.5 text-left transition-transform duration-150 cursor-pointer bg-gradient-to-b from-[#E6E8EA] via-[#D0D3D6] to-[#AEB2B8] text-[#141516] ${
              isCurrent
                ? 'translate-x-[8px] z-10'
                : 'translate-x-0 hover:translate-x-[4px]'
            }`}
          >
            {/* Recessed Mechanical Active-Track Latch & LED Indicator Well */}
            <div
              data-cas-mechanical-indicator={isCurrent ? 'active' : 'idle'}
              className="relative z-10 w-[12px] h-[28px] rounded-[1.5px] bg-[#18191B] border border-[#565A62] shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.92)] flex flex-col items-center justify-between py-1 shrink-0"
            >
              <span
                aria-hidden="true"
                style={{
                  backgroundColor: isCurrent ? '#E61919' : '#3A1212',
                  boxShadow: isCurrent ? '0 0 5px rgba(230, 25, 25, 0.95)' : 'none',
                }}
                className="w-[5px] h-[5px] rounded-full border border-black/80"
              />
              <span
                aria-hidden="true"
                style={{ backgroundColor: spinePalette.baseHex }}
                className="w-[6px] h-[10px] rounded-[0.5px] border border-white/40"
              />
            </div>

            {/* Physical Cassette Spine Paper-Label Track Title Header & Brushed Silver Artist Sub-Strip */}
            <div className="relative z-10 min-w-0 flex-1 flex flex-col justify-center rounded-[1.5px] border border-[#8C9094] bg-gradient-to-b from-[#F4F6F8] via-[#E6E8EA] to-[#CFD3D6] px-1.5 py-[2px] shadow-inner">
              <div className="flex items-center gap-1 min-w-0 border-b border-[#B8BCC0] pb-[1px]">
                <span className="px-1 py-[0.5px] rounded-[1px] bg-[#18191B] text-[#F4F6F8] cas-technical-num text-[7.5px] font-extrabold shrink-0">
                  A{String(trackIndex + 1).padStart(2, '0')}
                </span>
                <p
                  data-cas-handwritten="true"
                  className="cas-condensed-label font-extrabold text-[11px] sm:text-[11.5px] text-[#141516] leading-tight truncate tracking-tight"
                >
                  {item.title}
                </p>
              </div>
              <div className="flex items-center justify-between gap-1 pt-[1px]">
                <p className="cas-condensed-label text-[8.5px] font-bold text-[#3A3E42] leading-tight truncate">
                  {item.artist}
                </p>
                <span
                  className={`cas-technical-num text-[9px] font-extrabold tabular-nums shrink-0 ${
                    isCurrent ? 'text-[#E61919]' : 'text-[#141516]'
                  }`}
                >
                  {formatDuration(item.durationSec)}
                </span>
              </div>
            </div>
          </button>
        </div>
      );
    }

    // '98 Desktop Player classic green-on-black numbered row ("1. Artist - Title    3:11") in VT323 pixel font
    if (isDesktop98Theme) {
      const formattedEntry = formatDesktop98PlaylistEntry(
        trackIndex,
        item.artist,
        item.title,
        item.durationSec
      );
      return (
        <button
          ref={isCurrent ? activeRowRef : null}
          type="button"
          data-track-id={item.id}
          onClick={() => {
            triggerButtonHaptic(lowPowerMode);
            onSelectTrack(item.id);
          }}
          aria-current={isCurrent ? 'true' : undefined}
          aria-label={`Play ${item.title} by ${item.artist}`}
          className={`w-full px-1.5 py-0.5 flex items-center justify-between gap-2 text-left font-['VT323',monospace] text-[15px] leading-tight cursor-pointer transition-opacity ${
            isCurrent
              ? 'bg-[#1F3B2A] text-[#FFFFFF]'
              : 'bg-[#000D06] hover:bg-[#1F3B2A]/55 text-[#00C853]'
          }`}
        >
          <span className="truncate">{formattedEntry.numberedTitle}</span>
          <span
            className={`tabular-nums shrink-0 ${
              isCurrent ? 'text-[#FFFFFF]' : 'text-[#00C853]'
            }`}
          >
            {formattedEntry.durationText}
          </span>
        </button>
      );
    }

    return (
      <button
        ref={isCurrent ? activeRowRef : null}
        type="button"
        data-track-id={item.id}
        data-spine-color={isCassetteTheme ? spineColor : undefined}
        onClick={() => {
          triggerButtonHaptic(lowPowerMode);
          onSelectTrack(item.id);
        }}
        aria-current={isCurrent ? 'true' : undefined}
        aria-label={`Play ${item.title} by ${item.artist}`}
        style={
          isAuroraTheme
            ? {
                borderColor: isCurrent ? auroraHexToRgba(auroraAccentHex, 0.52) : 'rgba(255,255,255,0.10)',
                backgroundColor: isCurrent ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.04)',
                boxShadow: isCurrent
                  ? `0 10px 26px rgba(0, 0, 0, 0.55), 0 0 18px ${auroraHexToRgba(auroraAccentHex, 0.22)}`
                  : '0 4px 12px rgba(0, 0, 0, 0.28)',
              }
            : isStreamlineTheme
            ? undefined
            : isSquircleTheme
              ? {
                  borderColor: isCurrent ? '#E6007E' : '#55503C',
                }
              : isClickWheelTheme
                ? {
                    borderColor: isCurrent ? '#2B5FD9' : '#E2E4E8',
                  }
                : isCassetteTheme
                  ? {
                      borderColor: isCurrent ? '#E03E2D' : '#5e626a',
                      boxShadow: isCurrent
                        ? '0 4px 12px rgba(0, 0, 0, 0.75), 0 0 8px rgba(255, 59, 48, 0.25)'
                        : 'inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 1px 3px rgba(0, 0, 0, 0.5)',
                      transform: isCurrent ? 'translateX(8px)' : 'translateX(0px)',
                    }
                  : isReelTheme
                    ? {
                        borderColor: isCurrent ? '#E8590C' : '#b7a88e',
                        boxShadow: isCurrent
                          ? '0 0 12px rgba(255, 159, 67, 0.55), 0 4px 10px rgba(0, 0, 0, 0.4)'
                          : '0 1px 2px rgba(0, 0, 0, 0.25)',
                        transform: isCurrent ? 'translateX(5px)' : 'translateX(0px)',
                      }
                    : isCurrent
                      ? {
                          borderColor: '#d97706',
                        }
                      : undefined
        }
        className={`relative w-full overflow-hidden flex items-center justify-between gap-2 text-left transition-[transform,opacity] active:translate-y-[1px] cursor-pointer ${
          isAuroraTheme
            ? 'aurora-depth-row border rounded-[12px] min-h-[46px] px-2.5 py-1.5 backdrop-blur-md'
            : isStreamlineTheme
            ? `border-0 rounded-[10px] min-h-[48px] px-2.5 py-1.5 ${
                isCurrent
                  ? 'bg-[#1D232B] shadow-[inset_3px_0_0_#19C6A3]'
                  : 'bg-transparent hover:bg-[#1D232B]'
              }`
            : isSquircleTheme
              ? `border sq-pressable rounded-[6px] min-h-[42px] px-2.5 py-1.5 ${
                  isCurrent
                    ? 'bg-[#E6007E]/18 text-[#FFFFFF] shadow-[inset_3px_0_0_#E6007E]'
                    : 'bg-[#0B0A0A] hover:bg-[#55503C]/35 text-[#FFFFFF]'
                }`
              : isClickWheelTheme
                ? `border rounded-[6px] min-h-[42px] px-2.5 py-1.5 ${
                    isCurrent
                      ? 'cw-active-row-gradient shadow-[0_2px_6px_rgba(43,95,217,0.3)]'
                      : 'bg-[#FAFAFA] hover:bg-[#ECEEF2] text-[#1D1D1F]'
                  }`
                : isCassetteTheme
                  ? `border rounded-[3px] min-h-[38px] px-2 pt-[6px] pb-1 ${
                      isCurrent
                        ? 'bg-[#f4efe3] text-[#16171a]'
                        : 'bg-[#E6DFCE] hover:bg-[#f2ecde] text-[#1C1D20]'
                    }`
                  : `border rounded-[3px] min-h-[42px] px-2.5 py-1.5 ${
                      isReelTheme
                        ? isCurrent
                          ? 'bg-[#fff7e8] text-[#1f1309] border-l-4 border-t-2'
                          : 'bg-[#EFE9DC] hover:bg-[#f7f1e3] text-[#2b1a0e] border-t-2 border-t-[#c97e38]/45'
                        : isCurrent
                          ? 'bg-gradient-to-r from-[#422612] via-[#331c0d] to-[#261409] text-[#fff3e0] shadow-[inset_0_1px_0_rgba(255,220,170,0.3)]'
                          : 'bg-[#1a0f08]/75 hover:bg-[#2a180d]/90 text-[#edd8be] border-[#5c391e]/55'
                    }`
        }`}
      >
        {/* Edge-On Colored Cassette Spine Top Stripe Band */}
        {isCassetteTheme && (
          <span
            aria-hidden="true"
            style={{ backgroundColor: spineColor }}
            className="pointer-events-none absolute top-0 inset-x-0 h-[3px]"
          />
        )}

        <div className="flex items-center gap-2.5 min-w-0">
          {isCassetteTheme && (
            <span
              data-testid={isCurrent ? 'cas-spine-active-led' : undefined}
              aria-hidden="true"
              style={{
                backgroundColor: isCurrent ? '#FF3B30' : '#4a4d54',
                boxShadow: isCurrent ? '0 0 6px rgba(255, 59, 48, 0.95)' : 'none',
              }}
              className="w-[6px] h-[6px] rounded-full border border-black/60 shrink-0"
            />
          )}
          <div
            style={
              isAuroraTheme && isCurrent
                ? {
                    borderColor: auroraAccentHex,
                    boxShadow: `0 0 14px ${auroraHexToRgba(auroraAccentHex, 0.72)}`,
                  }
                : undefined
            }
            className={`relative w-8 h-8 overflow-hidden shrink-0 border flex items-center justify-center ${
              isAuroraTheme
                ? 'rounded-[8px] border-white/[0.16] bg-[#06070C]/80'
                : isStreamlineTheme
                ? 'rounded-[6px] border-white/[0.08] bg-[#0F1115]'
                : isSquircleTheme
                  ? `rounded-[14px] bg-[#181410] ${
                      isCurrent ? 'border-[#E6007E]' : 'border-[#857F74]/55'
                    }`
                  : isClickWheelTheme
                    ? 'rounded-[4px] border-[#D8DADE] bg-[#F4F5F7]'
                    : isCassetteTheme
                      ? 'rounded-[2px] border-[#7c7668] bg-[#d8d0bc]'
                      : isReelTheme
                        ? 'rounded-[2px] border-[#8f7c60] bg-[#dfd4be]'
                        : 'rounded-[2px] border-amber-200/25 bg-[#120b06]'
            }`}
          >
            {!imgLoaded && !artState.isPlaceholder && (
              <div
                data-row-art-skeleton="true"
                className={`absolute inset-0 flex items-center justify-center z-10 ${
                  isAuroraTheme
                    ? 'bg-white/[0.08]'
                    : isStreamlineTheme
                    ? 'bg-[#1D232B]'
                    : isSquircleTheme
                      ? 'bg-[#1f1914]'
                      : isClickWheelTheme
                        ? 'bg-[#ECEEF2]'
                        : 'bg-gradient-to-br from-[#2d1b0e] via-[#3f2614] to-[#160d07]'
                }`}
              >
                <Disc3
                  strokeWidth={1.75}
                  className={`w-3.5 h-3.5 ${
                    isAuroraTheme
                      ? 'text-[#4DE1FF]/70'
                      : isStreamlineTheme
                      ? 'text-[#5E6673]'
                      : isSquircleTheme
                        ? 'text-[#9B938B]'
                        : isClickWheelTheme
                          ? 'text-[#8A8F98]'
                          : 'text-amber-200/45'
                  }`}
                />
              </div>
            )}

            {!artState.isPlaceholder && artState.activeUrl ? (
              <img
                ref={imgRef}
                src={artState.activeUrl}
                alt={`${item.title} artwork`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setImgLoaded(false);
                  setFailedCount((prev) => prev + 1);
                }}
                className={`w-full h-full object-cover transition-opacity duration-150 ${
                  imgLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ) : (
              <Disc3
                strokeWidth={1.75}
                className={`w-4 h-4 ${
                  isAuroraTheme
                    ? 'text-[#4DE1FF]/75'
                    : isStreamlineTheme
                    ? 'text-[#5E6673]'
                    : isSquircleTheme
                      ? 'text-[#9B938B]'
                      : isClickWheelTheme
                        ? 'text-[#8A8F98]'
                        : isCassetteTheme
                          ? 'text-[#1B3B8B]'
                          : isReelTheme
                            ? 'text-[#6B4A2F]'
                            : 'text-amber-200/65'
                }`}
              />
            )}
          </div>
          <div className="min-w-0">
            <p
              style={
                isAuroraTheme && isCurrent
                  ? { textShadow: `0 0 12px ${auroraHexToRgba(auroraAccentHex, 0.35)}` }
                  : undefined
              }
              className={`truncate ${
                isAuroraTheme
                  ? `font-display text-[13px] tracking-[0.04em] leading-tight ${
                      isCurrent ? 'font-normal text-[#EAF2FF]' : 'font-light text-[#EAF2FF]/90'
                    }`
                  : isStreamlineTheme
                  ? `font-sans text-[13px] font-semibold leading-tight ${
                      isCurrent ? 'text-[#19C6A3]' : 'text-[#FFFFFF]'
                    }`
                  : isSquircleTheme
                    ? `font-sans text-[13px] font-bold lowercase leading-tight ${
                        isCurrent ? 'text-[#FFFFFF]' : 'text-[#FFFFFF]/90'
                      }`
                    : isClickWheelTheme
                      ? `font-sans font-semibold text-[13px] leading-tight ${
                          isCurrent ? 'text-white' : 'text-[#1D1D1F]'
                        }`
                      : isCassetteTheme
                        ? 'text-xs font-bold cas-condensed-label tracking-normal text-[#16171a]'
                        : isReelTheme
                          ? 'text-xs font-bold font-mono text-[#1f1309]'
                          : 'text-xs font-bold engraved-wood-text'
              }`}
            >
              {item.title}
            </p>
            <p
              className={`truncate ${
                isAuroraTheme
                  ? 'font-sans text-[11px] font-light text-[#8E9AB8] leading-tight mt-0.5'
                  : isStreamlineTheme
                  ? 'font-sans text-[11.5px] text-[#A7AFBC] leading-tight mt-0.5'
                  : isSquircleTheme
                    ? 'font-sans text-[9.5px] uppercase tracking-[0.08em] text-[#9B938B] leading-tight'
                    : isClickWheelTheme
                      ? `font-sans text-[11px] leading-tight ${
                          isCurrent ? 'text-white/85' : 'text-[#6E6E73]'
                        }`
                      : isCassetteTheme
                        ? 'text-[10.5px] font-mono text-[#484b52]'
                        : isReelTheme
                          ? 'text-[10.5px] font-mono text-[#5e4228]'
                          : 'text-[10.5px] text-amber-200/70'
              }`}
            >
              {item.artist}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            style={
              isAuroraTheme && isCurrent ? { color: auroraAccentHex } : undefined
            }
            className={`tabular-nums shrink-0 ${
              isAuroraTheme
                ? `font-mono font-extralight text-[11.5px] ${isCurrent ? '' : 'text-[#8E9AB8]'}`
                : isStreamlineTheme
                ? `font-sans text-[12px] font-medium ${
                    isCurrent ? 'text-[#19C6A3]' : 'text-[#A7AFBC]'
                  }`
                : isSquircleTheme
                  ? `text-[11px] font-sans font-bold ${isCurrent ? 'text-[#E6007E]' : 'text-[#F26A1B]'}`
                  : isClickWheelTheme
                    ? `text-[11px] font-sans font-medium ${isCurrent ? 'text-white' : 'text-[#6E6E73]'}`
                    : isCassetteTheme
                      ? isCurrent
                        ? 'text-[11px] font-mono text-[#E03E2D] font-bold'
                        : 'text-[11px] font-mono text-[#3a3d45]'
                      : isReelTheme
                        ? isCurrent
                          ? 'text-[11px] font-mono text-[#E8590C] font-bold'
                          : 'text-[11px] font-mono text-[#5b4128]'
                        : 'text-[11px] font-mono text-amber-200/75'
            }`}
          >
            {formatDuration(item.durationSec)}
          </span>
          {isClickWheelTheme && (
            <span
              aria-hidden="true"
              className={`text-xs font-semibold leading-none ${
                isCurrent ? 'text-white/90' : 'text-[#B0B4BC]'
              }`}
            >
              &rsaquo;
            </span>
          )}
        </div>
      </button>
    );
  }
);

export const PlaylistQueueBox = React.memo<PlaylistQueueBoxProps>(
  ({
    playlists,
    activePlaylist,
    activeTrackId,
    isPlaying = false,
    lowPowerMode = false,
    isLoadingPlaylist = false,
    spotifyConnected = false,
    spotifyUserLabel = 'Connect Spotify Account',
    needsInitialSpotifyConnect = false,
    guidanceActive = false,
    isDocumentHidden = false,
    prefersReducedMotion,
    showCompactBrandHeader = false,
    themePalette,
    activeThemeId = DEFAULT_THEME_ID,
    auroraAccents,
    availableThemes = THEME_REGISTRY,
    onSelectTheme,
    parentPlaylistCoverUrl,
    onSelectPlaylist,
    onDeletePlaylist,
    onSelectTrack,
    onOpenSpotifyModal,
    onResolvedPerTrackArtwork,
  }) => {
    const activeRowRef = useRef<HTMLButtonElement | null>(null);
    const tracksScrollRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [dockedArtFailedCount, setDockedArtFailedCount] = useState<number>(0);

    const hasTracks = activePlaylist.tracks.length > 0;
    const activeTrackItem = useMemo(
      () =>
        activePlaylist.tracks.find((t) => t.id === activeTrackId) ||
        activePlaylist.tracks[0] ||
        null,
      [activePlaylist.tracks, activeTrackId]
    );

    useEffect(() => {
      setDockedArtFailedCount(0);
    }, [activeTrackItem?.id, activeTrackItem?.artworkUrl]);

    const dockedArtState = useMemo(
      () =>
        activeTrackItem
          ? resolveActiveArtworkState(activeTrackItem, dockedArtFailedCount, parentPlaylistCoverUrl)
          : { activeUrl: '', isPlaceholder: true },
      [activeTrackItem, dockedArtFailedCount, parentPlaylistCoverUrl]
    );

    const shouldAnimateGuidance =
      needsInitialSpotifyConnect && guidanceActive && !isDocumentHidden && !prefersReducedMotion;

    // Close playlist dropdown on outside click
    useEffect(() => {
      if (!isDropdownOpen) return;
      const handlePointerDown = (e: PointerEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setIsDropdownOpen(false);
          setPendingDeleteId(null);
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isDropdownOpen]);

    // Auto-scroll highlighted active track inside its own scroll container ONLY (never scroll window/document)
    useEffect(() => {
      const row = activeRowRef.current;
      if (!hasTracks || !row) return;
      const colParent = row.closest('[data-cas-scroll-col="true"]') as HTMLDivElement | null;
      const container = colParent || tracksScrollRef.current;
      if (!container) return;
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      if (rowTop < viewTop) {
        container.scrollTop = rowTop;
      } else if (rowBottom > viewBottom) {
        container.scrollTop = rowBottom - container.clientHeight;
      }
    }, [activeTrackId, activePlaylist.id, hasTracks]);

    const isReelTheme = activeThemeId === 'reel-to-reel';
    const isCassetteTheme = activeThemeId === 'cassette-deck';
    const isCdHifiTheme = activeThemeId === 'cd-hifi';
    const isClickWheelTheme = activeThemeId === 'click-wheel';
    const isSquircleTheme = activeThemeId === 'squircle-pmp';
    const isDesktop98Theme = activeThemeId === 'desktop-98';
    const isStreamlineTheme = activeThemeId === 'streamline';
    const isAuroraTheme = activeThemeId === 'aurora-deck';
    const auroraAccentHex = auroraAccents?.primaryHex || AURORA_PALETTE.cyan;

    const cassetteOrganizerColumns = useMemo(
      () => (isCassetteTheme ? splitPlaylistIntoOrganizerColumns(activePlaylist.tracks) : null),
      [isCassetteTheme, activePlaylist.tracks]
    );

    // 2.2 Interactive 3D Rotating Vertical CD Tower Rack State (360° Y-Axis Rotation + Magnetic Slot Snapping)
    const [cdTowerRotationDeg, setCdTowerRotationDeg] = useState<number>(0);
    const [cdTowerHoveredSlot, setCdTowerHoveredSlot] = useState<number | null>(null);
    const cdTowerDragRef = useRef<{ active: boolean; startX: number; startDeg: number }>({
      active: false,
      startX: 0,
      startDeg: 0,
    });

    const activeTrackSlotIndex = useMemo(
      () => activePlaylist.tracks.findIndex((t) => t.id === activeTrackId),
      [activePlaylist.tracks, activeTrackId]
    );

    const cdTowerState = useMemo(
      () =>
        computeRotatingCdTowerRackState(
          cdTowerRotationDeg,
          Math.max(4, activePlaylist.tracks.length),
          activeTrackSlotIndex >= 0 ? activeTrackSlotIndex : 0,
          cdTowerHoveredSlot
        ),
      [cdTowerRotationDeg, activePlaylist.tracks.length, activeTrackSlotIndex, cdTowerHoveredSlot]
    );

    return (
      <div
        className={
          isCassetteTheme
            ? 'w-full h-full flex flex-col justify-between min-h-0'
            : 'w-full h-full flex flex-col min-h-0'
        }
      >
        <section
          id="playlist-panel"
          aria-label={isCdHifiTheme ? '3D Rotating Vertical CD Jewel Case Tower Rack' : 'Spotify Playlist Queue'}
          className={`${
            isAuroraTheme
              ? 'aurora-glass-panel rounded-[18px] p-3 sm:p-3.5 text-[#EAF2FF]'
              : isStreamlineTheme
              ? 'sl-card walnut-furniture-cabinet p-3 sm:p-3.5'
              : isCdHifiTheme
                ? 'cd-jewel-tower-rack rounded-[8px] p-2.5 sm:p-3 text-[#F1F5F9]'
                : isDesktop98Theme
                  ? 'd98-window walnut-furniture-cabinet rounded-[2px] p-1 sm:p-1.5'
                  : isSquircleTheme
                    ? 'walnut-furniture-cabinet rounded-[14px] p-2.5 sm:p-3'
                    : isClickWheelTheme
                      ? 'walnut-furniture-cabinet rounded-[14px] p-2.5 sm:p-3'
                      : isCassetteTheme
                        ? 'cas-organizer-rack p-2 sm:p-2.5 text-[#141516]'
                        : isReelTheme
                          ? 'r2r-walnut-cabinet walnut-furniture-cabinet p-2.5 sm:p-3'
                          : 'walnut-furniture-cabinet p-2.5 sm:p-3'
          } panel-contain relative flex flex-col justify-start select-none w-full flex-1 min-h-0 overflow-hidden z-10`}
        >
        {/* 2.2 Brushed Aluminum & Smoked Acrylic 3D Rotating Vertical CD Tower Header Strip */}
        {isCdHifiTheme && (
          <div
            id="cd-jewel-rack-header"
            className="mb-1.5 px-2 py-1 rounded-[4px] border border-white/15 bg-gradient-to-r from-[#1E2430] via-[#2B3344] to-[#1E2430] flex items-center justify-between gap-1.5 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#00F0FF] shadow-[0_0_6px_#00F0FF] shrink-0" />
              <span className="font-mono text-[8px] font-bold tracking-[0.12em] text-[#E2E8F0] uppercase truncate">
                3D ROTATING CD TOWER · {Math.round(cdTowerState.normalizedRotationDeg)}°
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                id="cd-rack-spin-left-btn"
                type="button"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  setCdTowerRotationDeg((prev) => snapCdTowerRotationDeg(prev - 45, 45));
                }}
                aria-label="Spin CD Tower Left 45 Degrees"
                title="Spin CD Tower Left (Drag Horizontally to Spin 360°)"
                className="px-1.5 py-0.5 rounded-[2px] bg-[#0F172A] border border-[#38BDF8]/60 font-mono text-[7px] font-bold text-[#00F0FF] cursor-pointer active:translate-y-[1px]"
              >
                ◀ SPIN
              </button>
              <button
                id="cd-rack-spin-right-btn"
                type="button"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  setCdTowerRotationDeg((prev) => snapCdTowerRotationDeg(prev + 45, 45));
                }}
                aria-label="Spin CD Tower Right 45 Degrees"
                title="Spin CD Tower Right (Drag Horizontally to Spin 360°)"
                className="px-1.5 py-0.5 rounded-[2px] bg-[#0F172A] border border-[#38BDF8]/60 font-mono text-[7px] font-bold text-[#00F0FF] cursor-pointer active:translate-y-[1px]"
              >
                SPIN ▶
              </button>
              <span className="font-mono text-[7.5px] font-semibold text-[#38BDF8] tabular-nums ml-0.5">
                {activePlaylist.tracks.length} DISCS
              </span>
            </div>
          </div>
        )}

        {/* Window 3 Title Bar for '98 Desktop Player */}
        {isDesktop98Theme && (
          <div id="d98-playlist-titlebar" className="d98-titlebar mb-1 shrink-0">
            <span className="font-['Silkscreen',monospace] text-[8.5px] font-bold tracking-wider text-[#FFFFFF] uppercase leading-none shrink-0">
              PLAYLIST EDITOR
            </span>
            <div aria-hidden="true" className="d98-grip-lines flex-1" />
            <div aria-hidden="true" className="flex items-center gap-1 shrink-0">
              <span className="d98-win-dot" />
              <span className="d98-win-dot" />
              <span className="d98-win-dot d98-win-dot--close" />
            </div>
          </div>
        )}

        {/* Four Corner Phillips Screw Fasteners on Brushed Satin Silver Aluminum Cassette Playlist Rack (Section 2.6) */}
        {isCassetteTheme && (
          <>
            {[
              { pos: 'tl', cls: 'top-1 left-1', rot: 'rotate-[25deg]' },
              { pos: 'tr', cls: 'top-1 right-1', rot: 'rotate-[115deg]' },
              { pos: 'bl', cls: 'bottom-1 left-1', rot: 'rotate-[205deg]' },
              { pos: 'br', cls: 'bottom-1 right-1', rot: 'rotate-[295deg]' },
            ].map((sc) => (
              <span
                key={sc.pos}
                data-cas-rack-screw={sc.pos}
                aria-hidden="true"
                className={`pointer-events-none absolute ${sc.cls} w-[10px] h-[10px] rounded-full bg-[#24272C] border border-[#565A62] shadow-[inset_0_1px_2px_rgba(0,0,0,0.88),0_1px_0_rgba(255,255,255,0.75)] flex items-center justify-center z-30`}
              >
                <span
                  className={`w-[7px] h-[7px] rounded-full bg-[radial-gradient(circle_at_30%_28%,#FFFFFF_0%,#C8CCD2_50%,#686C70_100%)] flex items-center justify-center ${sc.rot}`}
                >
                  <span className="w-[5px] h-[1px] bg-[#18191B]" />
                </span>
              </span>
            ))}
          </>
        )}

        {/* Four Corner Slot-Head Screws (Retro Turntable theme only — cleaned off all other themes) */}
        {!isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isCassetteTheme && !isReelTheme && (
          <>
            <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-30 opacity-85" />
            <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-30 opacity-85" />
            <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-30 opacity-85" />
            <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-30 opacity-85" />
          </>
        )}

        {showCompactBrandHeader && (
          <div className="pb-1.5 mb-1.5 border-b border-amber-200/15 shrink-0">
            <BrandHeader
              themePalette={themePalette}
              activeThemeId={activeThemeId}
              availableThemes={availableThemes}
              onSelectTheme={onSelectTheme}
              isPlaying={isPlaying}
              isStandby={!hasTracks}
              isDocumentHidden={isDocumentHidden}
              prefersReducedMotion={prefersReducedMotion}
              compact
            />
          </div>
        )}

        {/* Top Bar: Playlist Selector Plate + Spotify Action Button */}
        <div
          className={`relative z-30 flex items-center justify-between gap-1.5 ${
            isDesktop98Theme ? 'pb-1 mb-1 border-b border-[#10161F]' : 'pb-1.5 mb-1.5 border-b'
          } ${
            isDesktop98Theme
              ? ''
              : isAuroraTheme
                ? 'border-white/[0.12]'
                : isStreamlineTheme
                ? 'border-white/[0.06]'
                : isCdHifiTheme
                  ? 'border-[#2E384B]'
                  : isSquircleTheme
                    ? 'border-[#857F74]/45'
                    : isClickWheelTheme
                      ? 'border-[#D8DADE]'
                      : isCassetteTheme
                        ? 'border-[#C6C3B8]'
                        : isReelTheme
                          ? 'border-[#5a3b22]'
                          : 'border-amber-200/20'
          } shrink-0`}
        >
          <div
            id="playlist-selector-dropdown"
            ref={dropdownRef}
            className="relative flex-1 min-w-0 flex items-center gap-1"
          >
            <button
              id="playlist-selector-trigger"
              type="button"
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                setIsDropdownOpen((prev) => !prev);
                setPendingDeleteId(null);
              }}
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-label="Select or Manage Loaded Playlists"
              className={`relative w-full ${
                isDesktop98Theme
                  ? 'h-[26px] sm:h-[28px] px-2 d98-bevel-btn'
                  : isCassetteTheme || isCdHifiTheme
                    ? 'h-[36px] sm:h-[38px] px-2.5'
                    : 'h-[40px] sm:h-[44px] px-2.5 sm:px-3.5'
              } overflow-hidden flex items-center justify-between gap-1.5 cursor-pointer text-left active:translate-y-[1px] ${
                isDesktop98Theme
                  ? ''
                  : isAuroraTheme
                    ? 'rounded-[12px] bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.14] backdrop-blur-md transition-colors'
                    : isStreamlineTheme
                    ? 'rounded-[12px] bg-[#1D232B]/75 hover:bg-[#1D232B] border border-white/[0.08] transition-colors'
                    : isCdHifiTheme
                      ? 'rounded-[4px] bg-[#121824] hover:bg-[#182132] border border-[#38455E] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                      : isSquircleTheme
                        ? 'sq-pressable rounded-[8px] bg-[#55503C] border border-[#857F74] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                        : isClickWheelTheme
                          ? 'rounded-[8px] bg-[#FAFAFA] border border-[#C3C7CC] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]'
                          : isCassetteTheme
                            ? 'rounded-[2px] bg-gradient-to-b from-[#F4F6F8] via-[#D0D3D6] to-[#B8BCC0] hover:from-[#FFFFFF] hover:to-[#C8CCD0] border border-[#686C70] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(0,0,0,0.35)]'
                            : isReelTheme
                              ? 'rounded-[3px] r2r-aluminum-fascia border border-[#72767a]'
                              : 'rounded-[3px] border border-[#d6c7b2]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_7px_rgba(0,0,0,0.75)]'
              }`}
            >
              {!isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && !isReelTheme && !isCassetteTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && (
                <img
                  src="/console/metal-plate.webp"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                />
              )}
              {!isAuroraTheme && !isStreamlineTheme && !isCdHifiTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isCassetteTheme && !isReelTheme && (
                <>
                  <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute top-1 left-1 w-1.5 h-1.5 z-20" />
                  <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute top-1 right-1 w-1.5 h-1.5 z-20" />
                  <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute bottom-1 left-1 w-1.5 h-1.5 z-20" />
                  <img src="/console/screw-head.webp" alt="" aria-hidden="true" draggable={false} className="pointer-events-none absolute bottom-1 right-1 w-1.5 h-1.5 z-20" />
                </>
              )}

              <div
                className={`relative z-10 min-w-0 flex-1 leading-tight ${
                  isAuroraTheme || isStreamlineTheme || isCdHifiTheme || isClickWheelTheme || isSquircleTheme || isDesktop98Theme || isCassetteTheme
                    ? ''
                    : isReelTheme
                      ? 'bg-[#EFE9DC] border border-[#8c7e6a] rounded-[2px] px-2 py-0.5 shadow-inner'
                      : ''
                }`}
              >
                <p
                  className={`font-display ${
                    isDesktop98Theme
                      ? "font-['Silkscreen',monospace] text-[8.5px] text-[#00E36D]"
                      : 'text-[11px] sm:text-xs font-bold'
                  } truncate ${
                    isDesktop98Theme
                      ? ''
                      : isAuroraTheme
                        ? 'font-display font-light text-[13px] tracking-[0.04em] text-[#EAF2FF]'
                        : isStreamlineTheme
                        ? 'font-sans text-[13px] font-semibold text-[#FFFFFF]'
                        : isCdHifiTheme
                          ? 'font-mono text-[11px] font-bold tracking-wider uppercase text-[#00F0FF]'
                          : isSquircleTheme
                            ? 'font-sans lowercase text-[#FFFFFF]'
                            : isClickWheelTheme
                              ? 'font-sans text-[#1D1D1F]'
                              : isCassetteTheme
                                ? 'uppercase tracking-wide cas-condensed-label font-extrabold text-[#141516]'
                                : isReelTheme
                                  ? 'uppercase tracking-wide text-[#1e140c]'
                                  : 'uppercase tracking-wide text-[#17130f] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]'
                  }`}
                >
                  {hasTracks
                    ? activePlaylist.name
                    : isSquircleTheme
                      ? 'select playlist'
                      : 'Select Playlist'}
                </p>
                {!isDesktop98Theme && (
                  <p
                    className={`text-[9.5px] font-medium truncate tabular-nums ${
                      isAuroraTheme
                        ? 'font-mono font-extralight text-[10.5px] text-[#8E9AB8]'
                        : isStreamlineTheme
                        ? 'font-sans text-[11px] text-[#A7AFBC]'
                        : isCdHifiTheme
                          ? 'font-mono text-[9.5px] text-[#94A3B8]'
                          : isSquircleTheme
                            ? 'font-sans uppercase tracking-[0.08em] text-[#FFFFFF]/80'
                            : isClickWheelTheme
                              ? 'font-sans text-[#6E6E73]'
                              : isCassetteTheme
                                ? 'cas-technical-num font-semibold text-[#4E5158]'
                                : isReelTheme
                                  ? 'font-mono font-bold text-[#5b3f25]'
                                  : 'font-mono font-bold text-[#2b241d]/90 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]'
                    }`}
                  >
                    {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} ·{' '}
                    {activePlaylist.tracks.length} tracks
                  </p>
                )}
              </div>

              {/* Hardware/Label Dropdown Chevron */}
              <span
                className={`relative z-10 ${
                  isDesktop98Theme ? 'w-4 h-4' : 'w-6 h-6'
                } rounded-full flex items-center justify-center shrink-0`}
              >
                {isDesktop98Theme ? (
                  <ChevronDown
                    strokeWidth={2.5}
                    className={`w-3 h-3 text-[#00E36D] transition-transform duration-150 ${
                      isDropdownOpen ? 'rotate-180 text-[#D8A01D]' : ''
                    }`}
                  />
                ) : isCdHifiTheme ? (
                  <span className="w-6 h-6 rounded-[3px] bg-[#0B0F17] border border-[#38455E] flex items-center justify-center">
                    <ChevronDown
                      strokeWidth={2.3}
                      className={`w-3.5 h-3.5 text-[#00F0FF] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#FFB020]' : ''
                      }`}
                    />
                  </span>
                ) : isAuroraTheme ? (
                  <span className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.16] flex items-center justify-center">
                    <ChevronDown
                      strokeWidth={2}
                      className={`w-3.5 h-3.5 text-[#8E9AB8] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#4DE1FF]' : ''
                      }`}
                    />
                  </span>
                ) : isStreamlineTheme ? (
                  <span className="w-6 h-6 rounded-full bg-[#0F1115] border border-white/10 flex items-center justify-center">
                    <ChevronDown
                      strokeWidth={2.2}
                      className={`w-3.5 h-3.5 text-[#A7AFBC] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#19C6A3]' : ''
                      }`}
                    />
                  </span>
                ) : isSquircleTheme ? (
                  <span className="w-6 h-6 rounded-full bg-[#0B0A0A] border border-[#857F74] flex items-center justify-center">
                    <ChevronDown
                      strokeWidth={2.5}
                      className={`w-3.5 h-3.5 text-[#FFFFFF] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#E6007E]' : ''
                      }`}
                    />
                  </span>
                ) : isClickWheelTheme ? (
                  <span className="w-6 h-6 rounded-full bg-gradient-to-b from-[#FFFFFF] to-[#E2E4E8] border border-[#C3C7CC] flex items-center justify-center shadow-sm">
                    <ChevronDown
                      strokeWidth={2.5}
                      className={`w-3.5 h-3.5 text-[#1D1D1F] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#3478F6]' : ''
                      }`}
                    />
                  </span>
                ) : isCassetteTheme ? (
                  <span className="w-6 h-6 rounded-[2px] bg-[#DFDBD0] border border-[#B8B3A4] flex items-center justify-center">
                    <ChevronDown
                      strokeWidth={2.5}
                      className={`w-3.5 h-3.5 text-[#141516] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#D64541]' : ''
                      }`}
                    />
                  </span>
                ) : isReelTheme ? (
                  <span className="w-6 h-6 rounded-full r2r-aluminum-fascia border border-[#72767a] flex items-center justify-center">
                    <ChevronDown
                      strokeWidth={2.5}
                      className={`w-3.5 h-3.5 text-[#2b1a0e] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-[#E8590C]' : ''
                      }`}
                    />
                  </span>
                ) : (
                  <>
                    <img
                      src={isDropdownOpen ? '/console/pushbutton-down.webp' : '/console/pushbutton-up.webp'}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                    />
                    <ChevronDown
                      strokeWidth={2.5}
                      className={`relative z-10 w-3.5 h-3.5 text-[#17130f] transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-amber-300' : ''
                      }`}
                    />
                  </>
                )}
              </span>
            </button>

            {/* Tiny Beveled Delete Button Integrated Directly in '98 Playlist Header */}
            {isDesktop98Theme && (
              <button
                id="d98-header-delete-playlist-btn"
                type="button"
                disabled={playlists.length === 0}
                aria-label="Delete Active Playlist"
                title="Delete Active Playlist"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  if (activePlaylist.id && playlists.length > 0) {
                    onDeletePlaylist(activePlaylist.id);
                  }
                }}
                className="d98-bevel-btn h-[26px] sm:h-[28px] px-1.5 font-['Silkscreen',monospace] text-[8px] font-bold text-[#FFFFFF] hover:text-[#D8A01D] flex items-center justify-center gap-0.5 cursor-pointer disabled:opacity-40 shrink-0"
              >
                <Trash2 strokeWidth={2.2} className="w-2.5 h-2.5" />
                <span>DEL</span>
              </button>
            )}

            {/* Dropdown Menu Listing All Loaded/Saved Playlists with Delete Buttons */}
            {isDropdownOpen && (
              <div
                id="playlist-selector-menu"
                role="listbox"
                aria-label="Saved Playlists"
                className={`absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto p-1.5 space-y-1 ${
                  isAuroraTheme
                    ? 'aurora-dropdown-sheet aurora-glass-panel rounded-[14px] bg-[#090B14]/92'
                    : isStreamlineTheme
                    ? 'rounded-[14px] border border-white/10 bg-[#161A20] shadow-[0_12px_32px_rgba(0,0,0,0.65)]'
                    : isCdHifiTheme
                      ? 'rounded-[6px] border border-[#38455E] bg-[#0D131F] shadow-[0_14px_30px_rgba(0,0,0,0.92)]'
                      : isDesktop98Theme
                        ? 'rounded-[2px] border-2 border-[#6E8298] bg-[#000D06] shadow-[0_14px_30px_rgba(0,0,0,0.92)]'
                        : isSquircleTheme
                          ? 'rounded-[8px] border border-[#857F74] bg-[#0B0A0A] shadow-[0_14px_30px_rgba(0,0,0,0.88)]'
                          : isClickWheelTheme
                            ? 'rounded-[8px] border border-[#C3C7CC] bg-[#FAFAFA] shadow-[0_14px_30px_rgba(15,23,42,0.2)]'
                            : isCassetteTheme
                              ? 'rounded-[4px] border-2 border-[#C6C3B8] bg-[#F2F1EC] shadow-[0_12px_26px_rgba(0,0,0,0.28)]'
                              : isReelTheme
                                ? 'rounded-[3px] border-2 border-[#8c7e6a] bg-[#EFE9DC] shadow-[0_14px_30px_rgba(0,0,0,0.45)]'
                                : 'rounded-[3px] border-2 border-[#a87c4f] bg-[#1a0f08] shadow-[0_14px_30px_rgba(0,0,0,0.92)]'
                }`}
              >
                {playlists.length === 0 ? (
                  <div
                    className={`px-2.5 py-3 text-center text-[11px] ${
                      isAuroraTheme
                        ? 'font-display font-light text-[#8E9AB8]'
                        : isStreamlineTheme
                        ? 'font-sans text-[#A7AFBC]'
                        : isDesktop98Theme
                          ? "font-['VT323',monospace] text-[14px] text-[#00C853]"
                          : isSquircleTheme
                            ? 'font-sans text-[#9B938B]'
                            : isClickWheelTheme
                              ? 'font-sans text-[#6E6E73]'
                              : isCassetteTheme
                                ? 'cas-condensed-label font-semibold text-[#4E5158]'
                                : isReelTheme
                                  ? 'font-mono text-[#5b3f25]'
                                  : 'font-mono text-amber-100/60'
                    }`}
                  >
                    No saved playlists. Click Spotify to load one.
                  </div>
                ) : (
                  playlists.map((pl) => {
                    const isSelected = pl.id === activePlaylist.id;
                    const isConfirmingDelete = pendingDeleteId === pl.id;
                    return (
                      <div
                        key={pl.id}
                        data-playlist-row-id={pl.id}
                        className={`group/plrow flex items-center justify-between gap-1.5 px-2 py-1.5 border ${
                          isAuroraTheme
                            ? isSelected
                              ? 'rounded-[10px] bg-white/[0.10] border-[#4DE1FF]/70 text-[#EAF2FF]'
                              : 'rounded-[10px] bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-[#EAF2FF]'
                            : isStreamlineTheme
                            ? isSelected
                              ? 'rounded-[10px] bg-[#1D232B] border-[#19C6A3] text-[#19C6A3]'
                              : 'rounded-[10px] bg-[#0F1115]/60 hover:bg-[#1D232B] border-white/[0.06] text-[#FFFFFF]'
                            : isDesktop98Theme
                              ? isSelected
                                ? 'rounded-[2px] bg-[#1F3B2A] border-[#00E36D] text-[#FFFFFF]'
                                : 'rounded-[2px] bg-[#000D06] hover:bg-[#1F3B2A]/60 border-[#27313E] text-[#00C853]'
                              : isSquircleTheme
                                ? isSelected
                                  ? 'rounded-[6px] bg-[#E6007E]/20 border-[#E6007E] text-[#FFFFFF]'
                                  : 'rounded-[6px] bg-[#4A3A2E]/60 hover:bg-[#55503C] border-[#55503C] text-[#FFFFFF]/90'
                                : isClickWheelTheme
                                  ? isSelected
                                    ? 'rounded-[6px] cw-active-row-gradient border-[#2B5FD9] text-white'
                                    : 'rounded-[6px] bg-white hover:bg-[#ECEEF2] border-[#E2E4E8] text-[#1D1D1F]'
                                  : isCassetteTheme
                                    ? isSelected
                                      ? 'rounded-[3px] bg-[#E9E6DA] border-[#D64541] text-[#141516]'
                                      : 'rounded-[3px] bg-white/80 hover:bg-[#E9E6DA] border-[#C6C3B8] text-[#141516]'
                                    : isReelTheme
                                      ? isSelected
                                        ? 'rounded-[3px] bg-[#fff7e8] border-[#E8590C] text-[#1f1309]'
                                        : 'rounded-[3px] bg-[#e5dcc9] hover:bg-[#f7f1e3] border-[#a89982] text-[#2b1a0e]'
                                      : isSelected
                                        ? 'rounded-[3px] bg-[#382111] border-amber-400/65 text-amber-100'
                                        : 'rounded-[3px] bg-[#24150b]/85 hover:bg-[#2f1b0e] border-[#7a4f2a]/45 text-amber-100/85'
                        }`}
                      >
                        {isConfirmingDelete ? (
                          <div className="w-full flex items-center justify-between gap-1.5 py-0.5">
                            <span
                              className={`text-[10px] font-bold truncate ${
                                isAuroraTheme
                                  ? 'font-display font-light text-[#EAF2FF]'
                                  : isStreamlineTheme
                                  ? 'font-sans text-[#FFFFFF]'
                                  : isDesktop98Theme
                                    ? "font-['Silkscreen',monospace] text-[8.5px] text-[#FFFFFF]"
                                    : isSquircleTheme
                                      ? 'font-sans text-[#FFFFFF]'
                                      : isClickWheelTheme
                                        ? isSelected
                                          ? 'font-sans text-white'
                                          : 'font-sans text-[#1D1D1F]'
                                        : isCassetteTheme
                                          ? 'cas-condensed-label font-extrabold text-[#141516]'
                                          : isReelTheme
                                            ? 'font-mono text-[#2b1a0e]'
                                            : 'font-mono text-amber-200'
                              }`}
                            >
                              Delete &ldquo;{pl.name}&rdquo;?
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                data-confirm-delete-playlist={pl.id}
                                aria-label={`Confirm Delete ${pl.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerButtonHaptic(lowPowerMode);
                                  onDeletePlaylist(pl.id);
                                  setPendingDeleteId(null);
                                }}
                                className="px-2 py-0.5 rounded-[4px] border border-red-300/60 bg-gradient-to-b from-red-500 to-red-700 text-white font-mono text-[9.5px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center gap-0.5 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                              <button
                                type="button"
                                data-cancel-delete-playlist={pl.id}
                                aria-label="Cancel Delete Playlist"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDeleteId(null);
                                }}
                                className={`relative px-2 py-0.5 rounded-[4px] overflow-hidden font-mono text-[9.5px] font-extrabold cursor-pointer ${
                                  isAuroraTheme
                                    ? 'bg-white/[0.08] border border-white/[0.16] text-[#EAF2FF]'
                                    : isStreamlineTheme
                                    ? 'bg-[#1D232B] border border-white/10 text-[#FFFFFF]'
                                    : isDesktop98Theme
                                      ? 'd98-bevel-btn text-[#FFFFFF]'
                                      : isSquircleTheme
                                        ? 'bg-[#55503C] border border-[#857F74] text-[#FFFFFF]'
                                        : isClickWheelTheme
                                          ? 'bg-[#E2E4E8] border border-[#C3C7CC] text-[#1D1D1F]'
                                          : isCassetteTheme
                                            ? 'bg-[#DFDBD0] border border-[#B8B3A4] text-[#141516]'
                                            : isReelTheme
                                              ? 'r2r-aluminum-fascia border border-[#72767a] text-[#2b1a0e]'
                                              : 'border border-[#d6c7b2]/50 text-[#17130f]'
                                }`}
                              >
                                {!isAuroraTheme && !isStreamlineTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isCassetteTheme && !isReelTheme && (
                                  <img
                                    src="/console/metal-plate.webp"
                                    alt=""
                                    aria-hidden="true"
                                    draggable={false}
                                    className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                                  />
                                )}
                                <span className="relative z-10">Cancel</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              data-playlist-option-id={pl.id}
                              onClick={() => {
                                triggerButtonHaptic(lowPowerMode);
                                onSelectPlaylist(pl.id);
                                setIsDropdownOpen(false);
                                setPendingDeleteId(null);
                              }}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <p
                                className={`text-xs truncate ${
                                  isAuroraTheme
                                    ? 'font-display font-light text-[#EAF2FF]'
                                    : isStreamlineTheme
                                    ? 'font-sans font-bold'
                                    : isDesktop98Theme
                                      ? "font-['VT323',monospace] text-[15px] font-bold"
                                      : isCassetteTheme
                                        ? 'cas-condensed-label font-extrabold text-[#141516]'
                                        : 'font-display font-bold'
                                }`}
                              >
                                {pl.name}
                              </p>
                              <p
                                className={`text-[9.5px] truncate ${
                                  isAuroraTheme
                                    ? 'font-mono font-extralight text-[#8E9AB8]'
                                    : isStreamlineTheme
                                    ? 'font-sans text-[#A7AFBC]'
                                    : isDesktop98Theme
                                      ? "font-['VT323',monospace] text-[12px] text-[#00C853]"
                                      : isSquircleTheme
                                        ? 'font-sans text-[#9B938B]'
                                        : isClickWheelTheme
                                          ? isSelected
                                            ? 'font-sans text-white/85'
                                            : 'font-sans text-[#6E6E73]'
                                          : isCassetteTheme
                                            ? 'cas-technical-num text-[#4E5158]'
                                            : isReelTheme
                                              ? 'font-mono text-[#5b3f25]'
                                              : 'font-mono text-amber-200/60'
                                }`}
                              >
                                {pl.tracks.length} tracks
                              </p>
                            </button>
                            {/* Delete Control (Peel-off sticker on hover for Cassette Organizer, themed button elsewhere) */}
                            {isCassetteTheme ? (
                              <button
                                type="button"
                                data-delete-playlist-id={pl.id}
                                aria-label={`Delete playlist ${pl.name}`}
                                title={`Peel off / Delete ${pl.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerButtonHaptic(lowPowerMode);
                                  setPendingDeleteId(pl.id);
                                }}
                                className="cas-peel-sticker relative px-1.5 py-0.5 rounded-[2px] flex items-center gap-0.5 text-[8px] cas-condensed-label font-extrabold text-[#D64541] cursor-pointer shrink-0 opacity-85 sm:opacity-0 sm:group-hover/plrow:opacity-100 sm:group-focus-within/plrow:opacity-100 focus-visible:opacity-100 transition-opacity"
                              >
                                <span
                                  aria-hidden="true"
                                  className="w-1.5 h-1.5 border-r border-t border-[#B8A35C] bg-[#FDF8E4] rotate-45 -ml-0.5"
                                />
                                <Trash2 strokeWidth={2.2} className="w-2.5 h-2.5" />
                                <span>DEL</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                data-delete-playlist-id={pl.id}
                                aria-label={`Delete playlist ${pl.name}`}
                                title={`Delete ${pl.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerButtonHaptic(lowPowerMode);
                                  setPendingDeleteId(pl.id);
                                }}
                                className={`relative w-6 h-6 rounded-full flex items-center justify-center hover:text-red-500 cursor-pointer shrink-0 active:translate-y-[1px] ${
                                  isAuroraTheme
                                    ? 'bg-white/[0.08] border border-white/[0.16] text-[#8E9AB8] hover:text-[#FFB24D]'
                                    : isStreamlineTheme
                                    ? 'bg-[#1D232B] border border-white/10 text-[#A7AFBC] hover:text-red-400'
                                    : isDesktop98Theme
                                      ? 'd98-bevel-btn !rounded-[2px]'
                                      : isSquircleTheme
                                        ? 'bg-[#0B0A0A] border border-[#857F74] text-[#FFFFFF]'
                                        : isClickWheelTheme
                                          ? 'bg-[#E2E4E8] border border-[#C3C7CC] text-[#1D1D1F]'
                                          : isReelTheme
                                            ? 'r2r-aluminum-fascia border border-[#72767a] text-[#2b1a0e]'
                                            : 'text-[#18130e]'
                                }`}
                              >
                                {!isAuroraTheme && !isStreamlineTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isReelTheme && (
                                  <img
                                    src="/console/pushbutton-up.webp"
                                    alt=""
                                    aria-hidden="true"
                                    draggable={false}
                                    className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                                  />
                                )}
                                <Trash2 strokeWidth={2.2} className="relative z-10 w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Action Push-Button Immediately to the Right of the Playlist Dropdown */}
          <div className="flex items-end gap-1.5 shrink-0">
            {needsInitialSpotifyConnect && shouldAnimateGuidance && onOpenSpotifyModal && (
              <button
                id="spotify-hand-pointer"
                type="button"
                aria-label="Click Connect Spotify"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onOpenSpotifyModal();
                }}
                className={`hand-pointer-nudge relative ${
                  isDesktop98Theme ? 'h-[26px] px-1.5 rounded-[2px]' : 'h-[32px] px-2 rounded-[6px]'
                } overflow-hidden border border-[#1ed760] font-bold text-xs flex items-center justify-center shadow-md cursor-pointer ${
                  isAuroraTheme
                    ? 'bg-white/[0.08] text-[#4DE1FF]'
                    : isStreamlineTheme
                    ? 'bg-[#161A20] text-[#19C6A3]'
                    : isDesktop98Theme
                      ? 'bg-[#0A0F0A] text-[#00E36D]'
                      : isSquircleTheme
                        ? 'bg-[#0B0A0A] text-[#FFFFFF]'
                        : isClickWheelTheme
                          ? 'bg-[#FFFFFF] text-[#1D1D1F]'
                          : isCassetteTheme
                            ? 'bg-[#E9E6DA] text-[#141516]'
                            : isReelTheme
                              ? 'r2r-aluminum-fascia text-[#2b1a0e]'
                              : 'text-[#17130f]'
                }`}
              >
                {!isAuroraTheme && !isStreamlineTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isCassetteTheme && !isReelTheme && (
                  <img
                    src="/console/metal-plate.webp"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <Pointer strokeWidth={2.2} className="relative z-10 w-4 h-4 rotate-90" />
              </button>
            )}

            {onOpenSpotifyModal && (
              <PlaylistHardwarePushButton
                id="spotify-connect-btn"
                label="SPOTIFY"
                ariaLabel="Connect Spotify Account and Select Playlist"
                title={
                  spotifyConnected
                    ? `Spotify Connected (${spotifyUserLabel})`
                    : 'Connect Spotify'
                }
                isPressed={spotifyConnected}
                isBlinking={shouldAnimateGuidance}
                highlightEmerald={spotifyConnected || needsInitialSpotifyConnect}
                isReelTheme={isReelTheme}
                isCassetteTheme={isCassetteTheme}
                isCdHifiTheme={isCdHifiTheme}
                isClickWheelTheme={isClickWheelTheme}
                isSquircleTheme={isSquircleTheme}
                isDesktop98Theme={isDesktop98Theme}
                isStreamlineTheme={isStreamlineTheme}
                isAuroraTheme={isAuroraTheme}
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onOpenSpotifyModal();
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current"
                  aria-hidden="true"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.334.132-.67.469-.745 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.855zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
                </svg>
              </PlaylistHardwarePushButton>
            )}
          </div>
        </div>

        {/* Loading Skeletons for Playlist While Fetching */}
        {isLoadingPlaylist ? (
          <div
            id="playlist-loading-skeleton"
            aria-label="Loading Playlist Tracks"
            className="flex-1 space-y-1.5 overflow-hidden pr-1 min-h-0"
          >
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className={`w-full min-h-[42px] px-2.5 py-1.5 rounded-[4px] flex items-center justify-between gap-2.5 border ${
                  isAuroraTheme
                    ? 'bg-white/[0.04] border-white/[0.1] rounded-[12px]'
                    : isStreamlineTheme
                    ? 'bg-[#1D232B]/55 border-white/[0.06] rounded-[10px]'
                    : isDesktop98Theme
                      ? 'bg-[#000D06] border-[#1F3B2A]'
                      : isSquircleTheme
                        ? 'bg-[#0B0A0A] border-[#55503C]'
                        : isClickWheelTheme
                          ? 'bg-[#FAFAFA] border-[#E2E4E8]'
                          : isCassetteTheme
                            ? 'bg-[#E9E6DA] border-[#C6C3B8]'
                            : isReelTheme
                              ? 'bg-[#EFE9DC]/75 border-[#b7a88e]'
                              : 'bg-black/35 border-amber-200/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-8 h-8 rounded-[3px] shrink-0 ${
                      isAuroraTheme
                        ? 'bg-white/[0.08] rounded-[8px]'
                        : isStreamlineTheme
                        ? 'bg-[#1D232B] rounded-[6px]'
                        : isDesktop98Theme
                          ? 'bg-[#1F3B2A]'
                          : isSquircleTheme
                            ? 'bg-[#55503C]/50'
                            : isClickWheelTheme
                              ? 'bg-[#E2E4E8]'
                              : isCassetteTheme
                                ? 'bg-[#D6D2C4]'
                                : isReelTheme
                                  ? 'bg-[#dcd3bf]'
                                  : 'bg-amber-100/10'
                    }`}
                  />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div
                      className={`h-3 w-3/5 rounded ${
                        isAuroraTheme
                          ? 'bg-white/[0.1]'
                          : isStreamlineTheme
                          ? 'bg-[#1D232B]'
                          : isDesktop98Theme
                            ? 'bg-[#00C853]/30'
                            : isSquircleTheme
                              ? 'bg-[#55503C]/65'
                              : isClickWheelTheme
                                ? 'bg-[#E2E4E8]'
                                : isCassetteTheme
                                  ? 'bg-[#C6C3B8]'
                                  : isReelTheme
                                    ? 'bg-[#c9bfa9]'
                                    : 'bg-amber-100/15'
                      }`}
                    />
                    <div
                      className={`h-2.5 w-2/5 rounded ${
                        isAuroraTheme
                          ? 'bg-white/[0.06]'
                          : isStreamlineTheme
                          ? 'bg-[#1D232B]/70'
                          : isDesktop98Theme
                            ? 'bg-[#00C853]/20'
                            : isSquircleTheme
                              ? 'bg-[#55503C]/40'
                              : isClickWheelTheme
                                ? 'bg-[#F0F1F4]'
                                : isCassetteTheme
                                  ? 'bg-[#D6D2C4]'
                                  : isReelTheme
                                    ? 'bg-[#dcd3bf]'
                                    : 'bg-amber-100/10'
                      }`}
                    />
                  </div>
                </div>
                <div
                  className={`h-3 w-8 rounded shrink-0 ${
                    isAuroraTheme
                      ? 'bg-white/[0.08]'
                      : isStreamlineTheme
                      ? 'bg-[#1D232B]'
                      : isDesktop98Theme
                        ? 'bg-[#00C853]/25'
                        : isSquircleTheme
                          ? 'bg-[#55503C]/50'
                          : isClickWheelTheme
                            ? 'bg-[#E2E4E8]'
                            : isCassetteTheme
                              ? 'bg-[#C6C3B8]'
                              : isReelTheme
                                ? 'bg-[#c9bfa9]'
                                : 'bg-amber-100/10'
                  }`}
                />
              </div>
            ))}
          </div>
        ) : isDesktop98Theme ? (
          /* Window 3 Body: Left Green-on-Black Numbered Track List + Right Docked Square Album-Art Preview Pane */
          <div className="flex-1 flex items-stretch gap-1.5 min-h-0 overflow-hidden">
            {hasTracks ? (
              <div
                id="playlist-tracks-scroll"
                ref={tracksScrollRef}
                className="d98-lcd-well d98-chunky-scroll relative flex-1 space-y-0.5 overflow-y-auto min-h-0 !bg-[#000D06] p-1"
              >
                {activePlaylist.tracks.map((item, idx) => (
                  <PlaylistTrackRow
                    key={`${item.id}-${idx}`}
                    item={item}
                    trackIndex={idx}
                    isCurrent={item.id === activeTrackId}
                    lowPowerMode={lowPowerMode}
                    activeThemeId={activeThemeId}
                    auroraAccentHex={auroraAccentHex}
                    parentPlaylistCoverUrl={parentPlaylistCoverUrl}
                    activeRowRef={activeRowRef}
                    onSelectTrack={onSelectTrack}
                    onResolvedPerTrackArtwork={onResolvedPerTrackArtwork}
                  />
                ))}
              </div>
            ) : (
              <div className="d98-lcd-well flex-1 flex flex-col items-center justify-center text-center px-3 py-4 !bg-[#000D06] text-[#00C853]">
                <Disc3 strokeWidth={1.75} className="w-5 h-5 mb-1.5 text-[#00E36D]" />
                <p className="font-['Silkscreen',monospace] text-[9px] font-bold uppercase text-[#FFFFFF]">
                  NO PLAYLIST LOADED
                </p>
                <p className="font-['VT323',monospace] text-[14px] mt-0.5 text-[#00C853]">
                  Click <strong className="text-[#00E36D]">Spotify</strong> to load your playlists.
                </p>
              </div>
            )}

            {/* Right-Docked Square Album-Art Preview Pane Inside Playlist Window */}
            <div
              id="d98-playlist-art-dock"
              aria-label="Playlist Docked Album Art Preview"
              className="w-[66px] sm:w-[76px] shrink-0 flex flex-col items-center justify-between p-1 bg-[#1E2733] border border-[#10161F]"
            >
              <div className="d98-lcd-well w-full aspect-square overflow-hidden flex items-center justify-center relative">
                {!dockedArtState.isPlaceholder && dockedArtState.activeUrl ? (
                  <img
                    src={dockedArtState.activeUrl}
                    alt={activeTrackItem ? `${activeTrackItem.title} preview` : 'Album Art Preview'}
                    referrerPolicy="no-referrer"
                    onError={() => setDockedArtFailedCount((c) => c + 1)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc3 strokeWidth={1.75} className="w-5 h-5 text-[#00E36D]/65" />
                )}
              </div>
              <div className="w-full text-center mt-1">
                <span className="block font-['Silkscreen',monospace] text-[7px] uppercase tracking-wider text-[#D8A01D] leading-none truncate">
                  ART PREVIEW
                </span>
                <span className="block font-['VT323',monospace] text-[12px] text-[#00E36D] leading-tight tabular-nums truncate">
                  {activePlaylist.tracks.length} TRK
                </span>
              </div>
            </div>
          </div>
        ) : isCassetteTheme && hasTracks && cassetteOrganizerColumns ? (
          /* Section 2.6: Unified WTB-732 Brushed Satin Silver Aluminum & Matte-Charcoal (#18191B) Cassette Organizer Rack */
          <div className="relative flex-1 flex flex-col gap-1 min-h-0 overflow-hidden">
            {/* Rack Micro-Details Bar: Brushed Satin Silver Aluminum Trim, Stamped Ventilation Slots & Dual L/R Indicator Meters */}
            <div
              id="cas-rack-micro-details"
              aria-label="Cassette Rack Ventilation and Indicator Strip"
              className="shrink-0 h-[22px] rounded-[2px] border border-[#686C70] bg-gradient-to-b from-[#E6E8EA] via-[#D0D3D6] to-[#AEB2B8] px-2 flex items-center justify-between gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.35)]"
            >
              {/* Left Ventilation Louver Slots */}
              <div id="cas-rack-vent-slots" className="flex items-center gap-[3px] shrink-0" aria-hidden="true">
                {Array.from({ length: 8 }).map((_, vIdx) => (
                  <span
                    key={vIdx}
                    className="w-[3px] h-[11px] rounded-[0.5px] bg-[#18191B] border-r border-white/55 shadow-inner"
                  />
                ))}
              </div>

              <span className="cas-condensed-label text-[7.5px] font-extrabold tracking-[0.14em] text-[#141516] truncate">
                WTB-732 TAPE RACK · C-90 CHROME
              </span>

              {/* Right Dual L/R Rack Peak Indicator Meters */}
              <div id="cas-rack-indicator-meters" className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-[2px]" title="Left Channel Rack Meter">
                  <span className="cas-condensed-label text-[6.5px] font-extrabold text-[#141516]">L</span>
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#18191B]" />
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#18191B]" />
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#E61919] shadow-[0_0_3px_rgba(230,25,25,0.8)]" />
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#E61919]" />
                </div>
                <div className="flex items-center gap-[2px]" title="Right Channel Rack Meter">
                  <span className="cas-condensed-label text-[6.5px] font-extrabold text-[#141516]">R</span>
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#18191B]" />
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#18191B]" />
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#E61919] shadow-[0_0_3px_rgba(230,25,25,0.8)]" />
                  <span className="w-[5px] h-[7px] rounded-[0.5px] bg-[#565A62]" />
                </div>
              </div>
            </div>

            <div
              id="playlist-tracks-scroll"
              ref={tracksScrollRef}
              className="relative flex-1 grid grid-cols-2 gap-1.5 min-h-0 overflow-hidden p-1 rounded-[3px] bg-gradient-to-b from-[#B8BCC0] via-[#9EA3A8] to-[#8C9094] border border-[#5A5E62] shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)]"
            >
              <div
                id="cas-organizer-col-left"
                data-cas-scroll-col="true"
                className="cas-rack-slats h-full overflow-y-auto overflow-x-hidden rounded-[2px] border border-[#45484E] p-1 pr-2.5 space-y-1 min-h-0"
              >
                {cassetteOrganizerColumns.leftColumn.map(({ item, trackIndex }) => (
                  <PlaylistTrackRow
                    key={`${item.id}-${trackIndex}`}
                    item={item}
                    trackIndex={trackIndex}
                    isCurrent={item.id === activeTrackId}
                    lowPowerMode={lowPowerMode}
                    activeThemeId={activeThemeId}
                    auroraAccentHex={auroraAccentHex}
                    parentPlaylistCoverUrl={parentPlaylistCoverUrl}
                    activeRowRef={activeRowRef}
                    onSelectTrack={onSelectTrack}
                    onResolvedPerTrackArtwork={onResolvedPerTrackArtwork}
                  />
                ))}
              </div>

              <div
                id="cas-organizer-col-right"
                data-cas-scroll-col="true"
                className="cas-rack-slats h-full overflow-y-auto overflow-x-hidden rounded-[2px] border border-[#45484E] p-1 pr-2.5 space-y-1 min-h-0"
              >
                {cassetteOrganizerColumns.rightColumn.map(({ item, trackIndex }) => (
                  <PlaylistTrackRow
                    key={`${item.id}-${trackIndex}`}
                    item={item}
                    trackIndex={trackIndex}
                    isCurrent={item.id === activeTrackId}
                    lowPowerMode={lowPowerMode}
                    activeThemeId={activeThemeId}
                    auroraAccentHex={auroraAccentHex}
                    parentPlaylistCoverUrl={parentPlaylistCoverUrl}
                    activeRowRef={activeRowRef}
                    onSelectTrack={onSelectTrack}
                    onResolvedPerTrackArtwork={onResolvedPerTrackArtwork}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : isCdHifiTheme ? (
          /* 2.2 Interactive 3D Rotating Vertical CD Holder Rack (Cylindrical Spindle + Slotted Jewel Cases) */
          <div
            id="cd-rotating-vertical-rack"
            data-tower-rotation-deg={cdTowerState.normalizedRotationDeg}
            data-tower-snapped-deg={cdTowerState.snappedRotationDeg}
            onPointerDown={(e) => {
              cdTowerDragRef.current = {
                active: true,
                startX: e.clientX,
                startDeg: cdTowerRotationDeg,
              };
            }}
            onPointerMove={(e) => {
              if (!cdTowerDragRef.current.active) return;
              const dx = e.clientX - cdTowerDragRef.current.startX;
              if (Math.abs(dx) > 4) {
                setCdTowerRotationDeg(cdTowerDragRef.current.startDeg + dx * 0.85);
              }
            }}
            onPointerUp={() => {
              if (cdTowerDragRef.current.active) {
                cdTowerDragRef.current.active = false;
                setCdTowerRotationDeg((prev) => snapCdTowerRotationDeg(prev, 45));
              }
            }}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
                e.preventDefault();
                const delta = (e.deltaX || e.deltaY) > 0 ? 45 : -45;
                setCdTowerRotationDeg((prev) => snapCdTowerRotationDeg(prev + delta, 45));
              }
            }}
            className="cd-rotating-tower-scene relative flex-1 flex flex-col justify-between min-h-0 overflow-hidden rounded-[6px] border border-[#334155] bg-gradient-to-b from-[#0A0E15] via-[#111724] to-[#080B10] px-2 py-1.5 shadow-[inset_0_4px_16px_rgba(0,0,0,0.92)] cursor-grab active:cursor-grabbing"
          >
            {/* Central Brushed-Aluminum Vertical Spindle Column Running Behind Slotted Shelves */}
            <div
              aria-hidden="true"
              style={{
                backgroundPositionX: `${cdTowerState.normalizedRotationDeg}%`,
              }}
              className="cd-rotating-tower-spindle pointer-events-none absolute inset-y-2 left-1/2 -translate-x-1/2 w-[26px] rounded-full opacity-55 z-0"
            />

            {/* Top Smoked-Acrylic Carousel Crown Ring */}
            <div
              aria-hidden="true"
              className="relative z-10 w-[92%] h-[6px] mx-auto mb-1 rounded-full bg-gradient-to-r from-[#334155] via-[#CBD5E1] to-[#334155] border border-white/30 shadow-md shrink-0"
            />

            {hasTracks ? (
              <div
                id="playlist-tracks-scroll"
                ref={tracksScrollRef}
                style={{
                  transform: prefersReducedMotion
                    ? 'none'
                    : `perspective(1100px) rotateY(${
                        Math.sin((cdTowerRotationDeg * Math.PI) / 180) * 14
                      }deg)`,
                  transition: cdTowerDragRef.current.active
                    ? 'none'
                    : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className="relative z-10 flex-1 overflow-y-auto overflow-x-visible min-h-0 space-y-1.5 pr-1 py-0.5"
              >
                {activePlaylist.tracks.map((item, idx) => {
                  const slotPose = cdTowerState.slots[idx];
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      onMouseEnter={() => setCdTowerHoveredSlot(idx)}
                      onMouseLeave={() => setCdTowerHoveredSlot(null)}
                      style={{
                        transform:
                          slotPose && !prefersReducedMotion
                            ? `perspective(900px) rotateY(${slotPose.shelfRotateYDeg}deg) translateZ(${slotPose.pullOutTranslateZPx}px) translateX(${slotPose.pullOutTranslateXPx}px)`
                            : undefined,
                        transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      <PlaylistTrackRow
                        item={item}
                        trackIndex={idx}
                        isCurrent={item.id === activeTrackId}
                        lowPowerMode={lowPowerMode}
                        activeThemeId={activeThemeId}
                        auroraAccentHex={auroraAccentHex}
                        parentPlaylistCoverUrl={parentPlaylistCoverUrl}
                        activeRowRef={activeRowRef}
                        onSelectTrack={onSelectTrack}
                        onResolvedPerTrackArtwork={onResolvedPerTrackArtwork}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Standby Slotted CD Jewel Cases + Connect Prompt Inside Rotating Tower */
              <div className="relative z-10 flex-1 flex flex-col justify-between min-h-0 py-1">
                <div
                  style={{
                    transform: prefersReducedMotion
                      ? 'none'
                      : `perspective(1100px) rotateY(${
                          Math.sin((cdTowerRotationDeg * Math.PI) / 180) * 16
                        }deg)`,
                    transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  className="space-y-1.5 px-1"
                >
                  {[0, 1, 2].map((slotIdx) => (
                    <div
                      key={slotIdx}
                      onMouseEnter={() => setCdTowerHoveredSlot(slotIdx)}
                      onMouseLeave={() => setCdTowerHoveredSlot(null)}
                      style={{
                        transform:
                          cdTowerHoveredSlot === slotIdx && !prefersReducedMotion
                            ? 'perspective(900px) translateZ(28px) translateX(16px)'
                            : undefined,
                        transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                      className="cd-jewel-case-slot relative w-full h-[38px] rounded-[3px] flex items-stretch overflow-hidden"
                    >
                      <div
                        data-jewel-spine-width="12"
                        className="cd-jewel-ridged-spine w-[12px] shrink-0 flex flex-col items-center justify-between py-1 border-r border-white/30"
                      >
                        <span className="w-[6px] h-[2px] rounded-full bg-white/65" />
                        <span className="font-mono text-[6px] font-bold text-[#00F0FF] -rotate-90">
                          0{slotIdx + 1}
                        </span>
                        <span className="w-[6px] h-[2px] rounded-full bg-white/65" />
                      </div>
                      <div className="relative flex-1 flex items-center justify-between px-2 bg-[#111722]/90">
                        <div className="cd-jewel-acrylic-glare pointer-events-none absolute inset-0" />
                        <div className="flex items-center gap-2">
                          <div className="cd-optical-disc-rainbow w-6 h-6 rounded-full border border-white/60" />
                          <span className="font-mono text-[8.5px] font-bold text-[#CBD5E1] uppercase tracking-wider">
                            SLOT 0{slotIdx + 1} · EMPTY JEWEL CASE
                          </span>
                        </div>
                        <span className="font-mono text-[7.5px] text-[#00F0FF]">READY</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-center px-3 py-2 rounded-[6px] bg-[#0B0F17]/90 border border-[#334155]">
                  <p className="font-mono text-[10px] font-bold text-[#00F0FF] uppercase tracking-wider">
                    No Discs Loaded in Tower Rack
                  </p>
                  <p className="font-sans text-[10.5px] text-[#94A3B8] mt-0.5">
                    Click <strong className="text-[#1ed760]">Spotify</strong> above to populate the 3D rotating CD rack.
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Weighted Brushed-Aluminum 360° Turntable Base */}
            <div
              aria-hidden="true"
              className="relative z-10 w-[96%] h-[8px] mx-auto mt-1 rounded-full bg-gradient-to-r from-[#1E293B] via-[#94A3B8] to-[#1E293B] border border-white/30 shadow-[0_4px_10px_rgba(0,0,0,0.9)] flex items-center justify-center shrink-0"
            >
              <span className="font-mono text-[5.5px] font-bold tracking-[0.2em] text-[#0F172A] uppercase">
                360° ROTATING CAROUSEL BASE · DRAG HORIZONTALLY
              </span>
            </div>
          </div>
        ) : hasTracks ? (
          <div
            id="playlist-tracks-scroll"
            ref={tracksScrollRef}
            className={`relative flex-1 overflow-y-auto min-h-0 ${
              isAuroraTheme
                ? 'space-y-1.5 pr-1 py-0.5'
                : isStreamlineTheme
                ? 'space-y-1 pr-1'
                : isSquircleTheme
                  ? 'space-y-1.5 rounded-[8px] bg-[#0B0A0A]/85 p-1.5 border border-[#55503C]/70'
                  : 'space-y-1.5 pr-1'
            }`}
          >
            {activePlaylist.tracks.map((item, idx) => (
              <PlaylistTrackRow
                key={`${item.id}-${idx}`}
                item={item}
                trackIndex={idx}
                isCurrent={item.id === activeTrackId}
                lowPowerMode={lowPowerMode}
                activeThemeId={activeThemeId}
                auroraAccentHex={auroraAccentHex}
                parentPlaylistCoverUrl={parentPlaylistCoverUrl}
                activeRowRef={activeRowRef}
                onSelectTrack={onSelectTrack}
                onResolvedPerTrackArtwork={onResolvedPerTrackArtwork}
              />
            ))}
          </div>
        ) : (
          <div
            className={`flex-1 flex flex-col items-center justify-center text-center px-4 py-6 rounded-[12px] ${
              isAuroraTheme
                ? 'bg-white/[0.04] border border-white/[0.12] text-[#EAF2FF]'
                : isStreamlineTheme
                ? 'bg-[#0F1115]/55 border border-white/[0.06] text-[#FFFFFF]'
                : isSquircleTheme
                  ? 'bg-[#0B0A0A] border border-[#55503C] text-[#FFFFFF]'
                  : isClickWheelTheme
                    ? 'bg-[#FAFAFA] border border-[#E2E4E8] text-[#1D1D1F]'
                    : isCassetteTheme
                      ? 'cas-rack-slats border border-[#5A5E62] text-[#F4F6F8]'
                      : isReelTheme
                        ? 'bg-[#EFE9DC]/95 border border-[#8e7a5d] text-[#2b1a0e] shadow-inner'
                        : 'text-amber-100/70'
            }`}
          >
            <Disc3
              strokeWidth={1.75}
              className={`hifi-icon mb-2 ${
                isAuroraTheme
                  ? 'text-[#4DE1FF]'
                  : isStreamlineTheme
                    ? 'text-[#19C6A3]'
                    : 'text-[#1ed760]'
              }`}
            />
            <p
              className={`text-xs font-bold ${
                isAuroraTheme
                  ? 'font-display font-light text-[13px] tracking-[0.04em] text-[#EAF2FF]'
                  : isStreamlineTheme
                  ? 'font-sans text-[13px] font-semibold text-[#FFFFFF]'
                  : isSquircleTheme
                    ? 'font-sans lowercase text-[#FFFFFF]'
                    : isClickWheelTheme
                      ? 'font-sans text-[#1D1D1F]'
                      : isCassetteTheme
                        ? 'cas-condensed-label font-extrabold text-[#F4F6F8] tracking-wider'
                        : isReelTheme
                          ? 'font-mono text-[#1f1309]'
                          : 'engraved-wood-text'
              }`}
            >
              {isSquircleTheme ? 'no spotify playlist loaded' : 'No Playlist Loaded'}
            </p>
            <p
              className={`text-[11px] mt-1 max-w-[230px] ${
                isAuroraTheme
                  ? 'font-sans font-light text-[#8E9AB8]'
                  : isStreamlineTheme
                  ? 'font-sans text-[#A7AFBC]'
                  : isSquircleTheme
                    ? 'font-sans text-[#9B938B]'
                    : isClickWheelTheme
                      ? 'font-sans text-[#6E6E73]'
                      : isCassetteTheme
                        ? 'cas-condensed-label font-semibold text-[#CFD3D6]'
                        : isReelTheme
                          ? 'font-mono text-[#5e4228]'
                          : 'text-amber-200/60'
              }`}
            >
              Click{' '}
              <strong
                className={
                  isAuroraTheme
                    ? 'text-[#4DE1FF]'
                    : isStreamlineTheme
                    ? 'text-[#19C6A3]'
                    : isClickWheelTheme || isReelTheme
                      ? 'text-[#15803d]'
                      : 'text-[#1ed760]'
                }
              >
                Spotify
              </strong>{' '}
              to sign in and load your playlists.
            </p>
          </div>
        )}
      </section>

      {/* PART 4.5: Playlist Box Bottom Isolation Feet & Level Zero-Scroll Floor Alignment (Cassette Mode) */}
      {isCassetteTheme && (
        <div
          id="cas-playlist-isolation-feet"
          data-testid="cas-playlist-isolation-feet"
          aria-hidden="true"
          className="relative w-full h-[10px] shrink-0 pointer-events-none"
        >
          <div
            id="cas-playlist-foot-left"
            style={{
              left: '6%',
              width: '12%',
              height: '100%',
              borderRadius: '0 0 4px 4px',
            }}
            className="cas-rubber-foot absolute top-0"
          />
          <div
            id="cas-playlist-foot-right"
            style={{
              right: '6%',
              width: '12%',
              height: '100%',
              borderRadius: '0 0 4px 4px',
            }}
            className="cas-rubber-foot absolute top-0"
          />
        </div>
      )}
    </div>
  );
  }
);

