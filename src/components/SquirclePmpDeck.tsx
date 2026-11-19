import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
  Square,
  Shuffle,
  Repeat1,
  ChevronLeft,
  ChevronRight,
  Disc3,
} from 'lucide-react';
import {
  triggerButtonHaptic,
  resolveActiveArtworkState,
  formatConsoleClockAndDate,
  shouldRunActiveAnimationLoops,
  buildCleanYouTubeEmbedUrl,
  type YouTubeGrabFrame,
} from '../utils/playerLogic';
import {
  SQUIRCLE_PMP_PANE_ORDER,
  SQUIRCLE_PANE_LABELS,
  ZUNE_OS_PORTRAIT_MENU_ITEMS,
  SQUIRCLE_LONG_PRESS_MS,
  SQUIRCLE_TRACK_CHANGE_TIMELINE_MS,
  SQUIRCLE_EDITORIAL_MASK_GRADIENT,
  stepSquirclePaneIndex,
  getSquirclePaneTranslatePct,
  groupPlaylistTracksByArtist,
  formatSquircleOversizedTime,
  calculateSquircleVolumeStep,
  getSquircleBackNavigationTarget,
  getSquircleTrackChangePose,
  computeSquircleStageLayout,
  resolveSquircleVideoPlaybackState,
  type SquirclePmpPaneId,
  type SquircleTrackChangePhase,
} from '../utils/squirclePmpLogic';
import { retroAudio } from '../utils/retroAudioEngine';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';

/**
 * Live lowercase time + uppercase date strip inside the OLED header
 */
const SquircleClockStatus = React.memo<{
  isDocumentHidden: boolean;
}>(({ isDocumentHidden }) => {
  const [clockText, setClockText] = useState<{ timeText: string; dateText: string }>(() =>
    formatConsoleClockAndDate(new Date())
  );

  useEffect(() => {
    const syncNow = () => {
      setClockText(formatConsoleClockAndDate(new Date()));
    };
    syncNow();
    if (isDocumentHidden) return;
    return playbackClockStore.subscribeSecond(syncNow);
  }, [isDocumentHidden]);

  return (
    <div
      id="console-time-display"
      aria-label="Current Time and Date"
      className="flex items-center gap-1.5 min-w-0 shrink-0"
    >
      <span
        id="console-clock-time"
        className="font-sans font-bold tracking-tight text-white tabular-nums"
        style={{ fontSize: 'clamp(9.5px, 2.3cqh, 12px)', lineHeight: 1 }}
      >
        {clockText.timeText.toLowerCase()}
      </span>
      <span className="text-[#55503C] text-[9px] leading-none" aria-hidden="true">
        /
      </span>
      <span
        id="console-clock-date"
        className="font-sans font-medium uppercase tracking-[0.11em] text-[#9B938B] truncate max-w-[115px]"
        style={{ fontSize: 'clamp(7px, 1.55cqh, 8.5px)', lineHeight: 1 }}
      >
        {clockText.dateText}
      </span>
    </div>
  );
});

SquircleClockStatus.displayName = 'SquircleClockStatus';

export const SquirclePmpDeck: React.FC<TurntableDeckProps> = ({
  track,
  isPlaying,
  isDocumentHidden,
  lowPowerMode,
  nightMode,
  prefersReducedMotion,
  pitchPercent,
  volume,
  repeatOne,
  shuffleEnabled,
  viewportLayout,
  themePalette,
  onTogglePlay,
  onStop,
  onPrevious,
  onNext,
  onSeek,
  onChangePitch,
  onChangeVolume,
  onToggleRepeatOne,
  onToggleShuffle,
  onToggleLowPowerMode,
  onToggleNightMode,
  onOpenSpotifyModal,
  onScratch,
  onResolvedPerTrackArtwork,
  onResolvedTrackMetadata,
  playlistTracks,
  playlistName,
  playlists,
  activePlaylistId,
  onSelectPlaylist,
  onSelectTrack,
  seekEvent,
}) => {
  const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
  const isMobilePortrait = viewportLayout === 'mobile-portrait';
  const activeLoopsEnabled = shouldRunActiveAnimationLoops(
    isPlaying,
    isDocumentHidden,
    prefersReducedMotion,
    lowPowerMode
  );
  const currentTimeSec = usePlaybackSecond();
  const safeDuration = Math.max(0, track.durationSec || 0);
  const progressPct =
    safeDuration > 0 ? Math.max(0, Math.min(100, (currentTimeSec / safeDuration) * 100)) : 0;

  const tracks = useMemo(
    () => (playlistTracks && playlistTracks.length > 0 ? playlistTracks : isStandby ? [] : [track]),
    [playlistTracks, isStandby, track]
  );

  const artistGroups = useMemo(() => groupPlaylistTracksByArtist(tracks), [tracks]);
  const { elapsed: elapsedDisplay, total: totalDisplay } = useMemo(
    () => formatSquircleOversizedTime(currentTimeSec, safeDuration),
    [currentTimeSec, safeDuration]
  );

  // Default to 'music' in standby (displaying the iconic Twist lowercase menu) and 'now-playing' when a track is loaded
  const [activePane, setActivePane] = useState<SquirclePmpPaneId>(() =>
    isStandby ? 'music' : 'now-playing'
  );
  const [paneHistory, setPaneHistory] = useState<SquirclePmpPaneId[]>(['music']);

  // Subtle one-time warm solid-state chime on mount when tracks are present
  const mountCuePlayedRef = useRef(false);
  useEffect(() => {
    if (!mountCuePlayedRef.current && !isStandby) {
      mountCuePlayedRef.current = true;
      setActivePane('now-playing');
      retroAudio.triggerSquircleLoadCue();
    }
  }, [isStandby]);

  // Artwork resolution & caching
  const [artworkAttempt, setArtworkAttempt] = useState<number>(0);
  const [artworkBroken, setArtworkBroken] = useState<boolean>(false);

  const artworkState = useMemo(
    () => resolveActiveArtworkState(track, artworkAttempt),
    [track, artworkAttempt]
  );
  const resolvedArtworkUrl = artworkState.activeUrl || '';
  const hasMoreFallbackCandidates = artworkAttempt + 1 < artworkState.candidates.length;

  useEffect(() => {
    setArtworkAttempt(0);
    setArtworkBroken(false);
  }, [track.id, track.artworkUrl]);

  useEffect(() => {
    if (!isStandby && !resolvedArtworkUrl && onResolvedPerTrackArtwork) {
      let cancelled = false;
      const q = encodeURIComponent(`${track.title} ${track.artist}`.trim());
      fetch(`/api/spotify/track-artwork?q=${q}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.artworkUrl) {
            onResolvedPerTrackArtwork(track.id, data.artworkUrl);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [isStandby, resolvedArtworkUrl, track.id, track.title, track.artist, onResolvedPerTrackArtwork]);

  // Sub-1-second track-change choreography: background art crossfades while giant lowercase title drops with subtle overshoot bounce
  const prevTrackIdRef = useRef<string>(track.id);
  const prevArtSnapRef = useRef<{ url: string; title: string }>({
    url: resolvedArtworkUrl,
    title: track.title,
  });
  const [outgoingArtSnap, setOutgoingArtSnap] = useState<{ url: string; title: string } | null>(
    null
  );
  const [trackChangePhase, setTrackChangePhase] = useState<SquircleTrackChangePhase>('idle');

  useEffect(() => {
    const prevId = prevTrackIdRef.current;
    const prevSnap = prevArtSnapRef.current;
    if (prevId !== track.id) {
      prevTrackIdRef.current = track.id;
      if (prefersReducedMotion || lowPowerMode || isDocumentHidden) {
        setOutgoingArtSnap(null);
        setTrackChangePhase('idle');
      } else {
        setOutgoingArtSnap(prevSnap);
        setTrackChangePhase('entering');
        let raf2: number | null = null;
        const raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            setTrackChangePhase('idle');
          });
        });
        const timerId = window.setTimeout(() => {
          setOutgoingArtSnap(null);
          setTrackChangePhase('idle');
        }, SQUIRCLE_TRACK_CHANGE_TIMELINE_MS.totalMs);
        retroAudio.triggerSquircleTrackChangeCue();
        return () => {
          window.cancelAnimationFrame(raf1);
          if (raf2 !== null) window.cancelAnimationFrame(raf2);
          window.clearTimeout(timerId);
        };
      }
    }
  }, [track.id, prefersReducedMotion, lowPowerMode, isDocumentHidden]);

  useEffect(() => {
    prevArtSnapRef.current = { url: resolvedArtworkUrl, title: track.title };
  }, [resolvedArtworkUrl, track.title]);

  const trackChangePose = useMemo(
    () => getSquircleTrackChangePose(trackChangePhase),
    [trackChangePhase]
  );

  // Synchronized YouTube Video Resolution & Iframe Control inside Zune OLED Screen
  const [mediaViewMode, setMediaViewMode] = useState<'video' | 'artwork'>('video');
  const [resolvedVideoId, setResolvedVideoId] = useState<string>(track.youtubeVideoId || '');
  const [liveTvFrames, setLiveTvFrames] = useState<YouTubeGrabFrame[]>(track.tvFrames || []);
  const [iframeUnavailable, setIframeUnavailable] = useState<boolean>(false);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoCacheRef = useRef<Map<string, { videoId: string; frames: YouTubeGrabFrame[] }>>(
    new Map()
  );
  const trackIdRef = useRef<string>(track.id);
  trackIdRef.current = track.id;

  const sendSqYouTubeCommand = useCallback((func: string, args: unknown = '') => {
    const win = ytIframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {
      // Ignore cross-origin frame timing errors
    }
  }, []);

  useEffect(() => {
    setIframeUnavailable(false);
    const cached = videoCacheRef.current.get(track.id);
    if (cached) {
      setResolvedVideoId(cached.videoId);
      setLiveTvFrames(cached.frames);
      return;
    }

    setResolvedVideoId(track.youtubeVideoId || '');
    setLiveTvFrames(Array.isArray(track.tvFrames) ? track.tvFrames : []);

    if (isStandby || !track.title) return;

    let cancelled = false;
    const targetTrackId = track.id;
    const params = new URLSearchParams({
      title: track.title,
      artist: track.artist || '',
      trackId: targetTrackId,
      videoId: track.youtubeVideoId || '',
    });

    fetch(`/api/youtube/search-grabs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            videoId?: string;
            artworkUrl?: string;
            frames?: YouTubeGrabFrame[];
            channels?: Array<{ videoId: string; frames: YouTubeGrabFrame[] }>;
          } | null
        ) => {
          if (cancelled || !data || trackIdRef.current !== targetTrackId) return;
          const nextVideoId =
            data.channels?.[0]?.videoId || data.videoId || track.youtubeVideoId || '';
          const nextFrames =
            data.channels?.[0]?.frames && data.channels[0].frames.length > 0
              ? data.channels[0].frames
              : Array.isArray(data.frames) && data.frames.length > 0
                ? data.frames
                : Array.isArray(track.tvFrames)
                  ? track.tvFrames
                  : [];

          if (nextVideoId || nextFrames.length > 0) {
            videoCacheRef.current.set(targetTrackId, {
              videoId: nextVideoId,
              frames: nextFrames,
            });
            setResolvedVideoId(nextVideoId);
            setLiveTvFrames(nextFrames);
            onResolvedTrackMetadata?.(
              targetTrackId,
              data.artworkUrl || track.artworkUrl,
              nextVideoId,
              nextFrames
            );
          }
        }
      )
      .catch(() => {
        // Keep Ken-Burns frame/artwork fallback cleanly
      });

    return () => {
      cancelled = true;
    };
  }, [track.id, track.title, track.artist, track.youtubeVideoId, track.artworkUrl, track.tvFrames, isStandby, onResolvedTrackMetadata]);

  // Listen for YouTube embed error messages so broken videos cleanly fall back to Ken-Burns frames
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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

      const infoObj =
        payload.info && typeof payload.info === 'object'
          ? (payload.info as { videoData?: { isPlayable?: boolean } })
          : null;
      if (
        payload.event === 'onError' ||
        (payload.event === 'initialDelivery' && infoObj?.videoData?.isPlayable === false)
      ) {
        setIframeUnavailable(true);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const activeVideoId = resolvedVideoId || track.youtubeVideoId || '';
  const videoDisplayState = useMemo(
    () =>
      resolveSquircleVideoPlaybackState({
        activeVideoId,
        iframeUnavailable,
        isStandby,
        viewMode: mediaViewMode,
      }),
    [activeVideoId, iframeUnavailable, isStandby, mediaViewMode]
  );

  // Sync play/pause & seek state with active Zune YouTube iframe
  useEffect(() => {
    if (!videoDisplayState.showVideoIframe) return;
    if (isPlaying && !isDocumentHidden) {
      const curSec = Math.floor(playbackClockStore.getCurrentTimeSec());
      sendSqYouTubeCommand('seekTo', [curSec, true]);
      sendSqYouTubeCommand('playVideo');
    } else {
      sendSqYouTubeCommand('pauseVideo');
    }
  }, [isPlaying, isDocumentHidden, videoDisplayState.showVideoIframe, sendSqYouTubeCommand]);

  useEffect(() => {
    if (!videoDisplayState.showVideoIframe || !seekEvent || seekEvent.nonce === 0) return;
    sendSqYouTubeCommand('seekTo', [Math.max(0, Math.floor(seekEvent.timeSec)), true]);
  }, [seekEvent?.nonce, seekEvent?.timeSec, videoDisplayState.showVideoIframe, sendSqYouTubeCommand]);

  // Animated fallback TV frame cycle when video iframe is unavailable or artwork view is selected
  const activeFrames = useMemo(
    () => (liveTvFrames.length > 0 ? liveTvFrames : track.tvFrames || []),
    [liveTvFrames, track.tvFrames]
  );
  const animatedFrameUrl = useMemo(() => {
    if (activeFrames.length === 0) return resolvedArtworkUrl;
    const frameIdx = Math.floor(currentTimeSec / 4) % activeFrames.length;
    const candidate = activeFrames[frameIdx];
    if (!candidate) return resolvedArtworkUrl;
    return typeof candidate === 'string'
      ? candidate
      : candidate.imageUrl || resolvedArtworkUrl;
  }, [activeFrames, currentTimeSec, resolvedArtworkUrl]);

  // Measure #sq-player-stage for crisp left-docked Zune proportions + editorial mask spacing
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState<{ width: number; height: number }>({
    width: isMobilePortrait ? 390 : 1100,
    height: 680,
  });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setStageDims({
        width: Math.max(240, Math.round(rect.width)),
        height: Math.max(260, Math.round(rect.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutMetrics = useMemo(
    () => computeSquircleStageLayout(stageDims.width, stageDims.height, isMobilePortrait),
    [stageDims.width, stageDims.height, isMobilePortrait]
  );

  // Pane navigation maintaining history for the circular matte Back button
  const navigateToPane = useCallback(
    (nextPane: SquirclePmpPaneId) => {
      if (nextPane === activePane) return;
      retroAudio.triggerSquircleThip(false);
      triggerButtonHaptic(lowPowerMode);
      setPaneHistory((prev) => [...prev.slice(-6), activePane]);
      setActivePane(nextPane);
    },
    [activePane, lowPowerMode]
  );

  const handleBackPress = useCallback(() => {
    retroAudio.triggerSquircleThip(false);
    triggerButtonHaptic(lowPowerMode);
    const { nextPane, nextHistory } = getSquircleBackNavigationTarget(activePane, paneHistory);
    setPaneHistory(nextHistory);
    setActivePane(nextPane);
  }, [activePane, paneHistory, lowPowerMode]);

  // Swipe left/right on OLED screen for Twist pane switching
  const screenSwipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const handleScreenPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, [role="slider"]')) return;
    screenSwipeRef.current = { startX: e.clientX, startY: e.clientY };
  };
  const handleScreenPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!screenSwipeRef.current) return;
    const dx = e.clientX - screenSwipeRef.current.startX;
    const dy = e.clientY - screenSwipeRef.current.startY;
    screenSwipeRef.current = null;
    if (Math.abs(dx) >= 38 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      const nextPane = stepSquirclePaneIndex(activePane, dx < 0 ? 'next' : 'prev');
      navigateToPane(nextPane);
    }
  };

  // Long-press D-pad LEFT -> Stutter-Rewind; short tap LEFT -> Previous track
  const [stutterActive, setStutterActive] = useState(false);
  const leftLongPressTimerRef = useRef<number | null>(null);
  const leftLongPressTriggeredRef = useRef<boolean>(false);

  const clearLeftTimer = () => {
    if (leftLongPressTimerRef.current !== null) {
      window.clearTimeout(leftLongPressTimerRef.current);
      leftLongPressTimerRef.current = null;
    }
  };

  const stutterTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      clearLeftTimer();
      if (stutterTimerRef.current !== null) {
        window.clearTimeout(stutterTimerRef.current);
      }
      sendSqYouTubeCommand('pauseVideo');
    },
    [sendSqYouTubeCommand]
  );

  const handleDpadLeftPointerDown = () => {
    clearLeftTimer();
    leftLongPressTriggeredRef.current = false;
    leftLongPressTimerRef.current = window.setTimeout(() => {
      leftLongPressTriggeredRef.current = true;
      triggerButtonHaptic(lowPowerMode);
      retroAudio.triggerSquircleStutterRewind('backspin');
      onScratch('backspin');
      setStutterActive(true);
      if (stutterTimerRef.current !== null) window.clearTimeout(stutterTimerRef.current);
      stutterTimerRef.current = window.setTimeout(() => {
        setStutterActive(false);
        stutterTimerRef.current = null;
      }, 380);
    }, SQUIRCLE_LONG_PRESS_MS);
  };

  const handleDpadLeftPointerUpOrCancel = () => {
    clearLeftTimer();
  };

  const handleDpadLeftClick = () => {
    if (leftLongPressTriggeredRef.current) {
      leftLongPressTriggeredRef.current = false;
      return;
    }
    triggerButtonHaptic(lowPowerMode);
    retroAudio.triggerSquircleThip(false);
    onPrevious();
  };

  // D-pad UP / DOWN volume step controls
  const handleDpadVolume = (dir: 'up' | 'down') => {
    triggerButtonHaptic(lowPowerMode);
    retroAudio.triggerSquircleThip(false);
    onChangeVolume(calculateSquircleVolumeStep(volume, dir));
  };

  // Progress bar scrub on Now Playing pane
  const handleProgressBarScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isStandby || safeDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const targetSec = ratio * safeDuration;
    retroAudio.triggerSquircleThip(false);
    if (videoDisplayState.showVideoIframe) {
      sendSqYouTubeCommand('seekTo', [Math.floor(targetSec), true]);
    }
    onSeek(targetSec);
  };

  const activePaneIdx = Math.max(0, SQUIRCLE_PMP_PANE_ORDER.indexOf(activePane));
  const paneTranslatePct = getSquirclePaneTranslatePct(activePane);

  // Active Zune home menu highlight follows current selected menu category
  const [selectedMenuId, setSelectedMenuId] = useState<string>('music');

  // D-pad geometry sized inside unified brushed gunmetal keyhole ring
  const dpadDiameterPx = Math.max(70, Math.min(108, Math.round(layoutMetrics.chassisW * 0.36)));
  const keyholeOuterRingPx = dpadDiameterPx + 10;
  const sideBtnSizePx = Math.max(26, Math.min(36, Math.round(layoutMetrics.chassisW * 0.12)));

  return (
    <div
      id="sq-player-stage"
      ref={stageRef}
      className="relative w-full h-full min-h-0 flex flex-row items-start justify-start overflow-hidden select-none"
      style={{
        backgroundColor: '#0b0c0e',
        backgroundImage:
          'radial-gradient(ellipse at 26% 32%, rgba(56, 60, 68, 0.28) 0%, rgba(11, 12, 14, 0.98) 72%)',
      }}
    >
      {/* LAYER 1 (z-index: 10): Full-Height Open Scrollable Editorial Text-Mode Background Playlist
          Identical fading composition behind the left-docked Zune + Video column across Desktop & Mobile */}
      <div
        id="sq-editorial-backdrop"
        data-testid="sq-editorial-backdrop"
        aria-label="Editorial Playlist Selection Backdrop"
        className="sq-editorial-backdrop sq-editorial-mask-desktop absolute inset-0 z-10 overflow-y-auto pr-4 sm:pr-[54px] pb-8"
        style={{
          paddingTop: `${layoutMetrics.topOffsetPx}px`,
          paddingLeft: `${layoutMetrics.editorialPaddingLeftPx}px`,
          maskImage: SQUIRCLE_EDITORIAL_MASK_GRADIENT,
          WebkitMaskImage: SQUIRCLE_EDITORIAL_MASK_GRADIENT,
        }}
      >
        <div className="w-full max-w-[920px] ml-auto flex flex-col">
          {/* Editorial Playlist Switcher & Status Header */}
          <div className="mb-2.5 pb-2 border-b border-white/[0.15] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-[#E6007E]">
                editorial queue
              </span>
              <span className="text-[11px] sm:text-xs font-medium lowercase tracking-tight text-white/75 truncate">
                {playlistName || 'connected collection'} · {tracks.length}{' '}
                {tracks.length === 1 ? 'track' : 'tracks'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {playlists &&
                playlists.length > 0 &&
                playlists.slice(0, 6).map((pl) => {
                  const isPlActive = pl.id === activePlaylistId;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        retroAudio.triggerSquircleThip(false);
                        triggerButtonHaptic(lowPowerMode);
                        onSelectPlaylist?.(pl.id);
                      }}
                      className={`sq-pressable px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-medium lowercase tracking-tight border cursor-pointer transition-colors ${
                        isPlActive
                          ? 'bg-[#E6007E] border-[#E6007E] text-white'
                          : 'bg-white/[0.05] border-white/[0.14] text-white/65 hover:text-white hover:border-white/35'
                      }`}
                    >
                      {pl.name.toLowerCase()}
                    </button>
                  );
                })}
              <button
                type="button"
                onClick={onOpenSpotifyModal}
                className="sq-pressable px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold lowercase tracking-tight bg-white/[0.08] border border-white/25 text-white hover:bg-[#E6007E] hover:border-[#E6007E] cursor-pointer transition-colors"
              >
                + spotify
              </button>
            </div>
          </div>

          {/* Open Scrollable Reduced-Scale Sleek Editorial Track Rows with Bottom Divider Lines */}
          {tracks.length === 0 ? (
            <div className="py-8 flex flex-col items-start gap-3">
              <div
                className="font-light lowercase tracking-[-0.03em] text-white/75 leading-[1.02]"
                style={{
                  fontSize: isMobilePortrait
                    ? 'clamp(1.05rem, 4.2vw, 1.35rem)'
                    : 'clamp(1.25rem, 2.3vw, 2.1rem)',
                }}
              >
                no tracks loaded
              </div>
              <button
                type="button"
                onClick={onOpenSpotifyModal}
                className="sq-pressable px-3.5 py-1.5 rounded-md bg-[#E6007E] text-white text-xs font-bold lowercase tracking-wide cursor-pointer"
              >
                connect spotify library
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {tracks.map((item, idx) => {
                const isCurrent = item.id === track.id;
                const rowDuration = formatSquircleOversizedTime(
                  item.durationSec,
                  item.durationSec
                ).total;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-editorial-track-id={item.id}
                    data-editorial-active={isCurrent ? 'true' : 'false'}
                    onClick={() => {
                      retroAudio.triggerSquircleThip(true);
                      triggerButtonHaptic(lowPowerMode);
                      onSelectTrack?.(item.id);
                      navigateToPane('now-playing');
                    }}
                    className={`sq-pressable group w-full text-left py-2 sm:py-2.5 border-b border-white/[0.14] flex items-baseline justify-between gap-3 cursor-pointer transition-colors ${
                      isCurrent
                        ? 'text-white'
                        : 'text-white/55 hover:text-white/95'
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex items-baseline gap-2.5">
                      <span
                        className={`text-[10px] font-bold tabular-nums shrink-0 ${
                          isCurrent ? 'text-[#E6007E]' : 'text-[#9B938B]/65 group-hover:text-white/75'
                        }`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1 flex flex-col">
                        <span
                          className={`lowercase leading-[1.04] tracking-[-0.03em] truncate transition-colors ${
                            isCurrent
                              ? 'font-medium text-white'
                              : 'font-light text-white/65 group-hover:text-white'
                          }`}
                          style={{
                            fontSize: isMobilePortrait
                              ? 'clamp(1.0rem, 4.2vw, 1.35rem)'
                              : 'clamp(1.25rem, 2.3vw, 2.1rem)',
                          }}
                        >
                          {item.title.toLowerCase()}
                        </span>
                        <span
                          className={`mt-0.5 text-[9.5px] sm:text-[10.5px] uppercase tracking-[0.14em] truncate ${
                            isCurrent ? 'text-[#E6007E]' : 'text-[#9B938B]/75'
                          }`}
                        >
                          {item.artist}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isCurrent && (
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 rounded-full bg-[#E6007E] shadow-[0_0_8px_#E6007E]"
                        />
                      )}
                      <span
                        className={`text-[10.5px] sm:text-xs font-medium tabular-nums ${
                          isCurrent ? 'text-[#E6007E]' : 'text-[#9B938B]/75'
                        }`}
                      >
                        {rowDuration}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* LAYER 2 (z-index: 20): Left-Edge Docked Hardware Column — Zune 30 Unit + Dedicated External Rounded-Corner Video Screen */}
      <div
        id="sq-left-hardware-column"
        style={{
          marginTop: `${layoutMetrics.topOffsetPx}px`,
          marginLeft: `${layoutMetrics.leftPx}px`,
          width: `${layoutMetrics.chassisW}px`,
          gap: `${layoutMetrics.videoGapPx}px`,
        }}
        className="relative z-20 flex flex-col items-center shrink-0"
      >
        {/* MATTE CHARCOAL-BLACK ZUNE 30 CHASSIS (#sq-player-chassis) WITH GLOSSY BLACK DOUBLE-SHOT RIM */}
        <div
          id="sq-player-chassis"
          data-active-pane={activePane}
          data-stutter-active={stutterActive ? 'true' : 'false'}
          data-hardware-finish="matte-charcoal-glossy-black-rim"
          className="sq-player-chassis relative flex flex-col items-center justify-between shrink-0 overflow-hidden"
          style={{
            width: `${layoutMetrics.chassisW}px`,
            height: `${layoutMetrics.chassisH}px`,
            borderRadius: `${Math.max(18, Math.round(layoutMetrics.chassisW * 0.088))}px`,
            paddingTop: `${Math.max(8, Math.round(layoutMetrics.chassisH * 0.028))}px`,
            paddingBottom: `${Math.max(10, Math.round(layoutMetrics.chassisH * 0.03))}px`,
            paddingLeft: `${Math.max(7, Math.round((layoutMetrics.chassisW - layoutMetrics.screenW) / 2))}px`,
            paddingRight: `${Math.max(7, Math.round((layoutMetrics.chassisW - layoutMetrics.screenW) / 2))}px`,
          }}
        >
          {/* Subtle Neutral Glossy Black Studio Rim Highlight Along Perimeter */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[1px] rounded-[inherit] border border-white/[0.12]"
          />

          {/* UNIFIED SATIN BRUSHED GUNMETAL KEYHOLE BEZEL: Screen Frame + Neck Bridge + D-Pad Ring */}
          <div
            id="sq-keyhole-screen-collar"
            className="sq-keyhole-bezel relative z-10 p-[4px] rounded-[11px] flex flex-col items-center shrink-0"
          >
            {/* Recessed Dark Matte Inner Bezel Well Wrapping the 3:4 Zune Portrait LCD (#sq-screen) */}
            <div
              id="sq-recessed-bezel-frame"
              className="sq-recessed-black-bezel relative z-10 p-[2px] rounded-[7px] flex flex-col items-center shrink-0"
            >
              {/* Zune OS 3:4 Portrait LCD Screen (#sq-screen) — Strictly OS UI Only (Video lives in External Display below) */}
              <div
                id="sq-screen"
                onPointerDown={handleScreenPointerDown}
                onPointerUp={handleScreenPointerUp}
                className="relative w-full overflow-hidden flex flex-col border border-[#222428] shadow-[inset_0_2px_10px_rgba(0,0,0,0.92)]"
                style={{
                  width: `${layoutMetrics.screenW - 12}px`,
                  height: `${layoutMetrics.screenH - 6}px`,
                  borderRadius: '5px',
                  containerType: 'size',
                  backgroundColor: '#0A0D12',
                  backgroundImage:
                    'radial-gradient(circle at 22% 24%, rgba(78, 98, 122, 0.42) 0%, transparent 48%), radial-gradient(circle at 78% 68%, rgba(58, 74, 92, 0.35) 0%, transparent 52%), linear-gradient(165deg, #161E28 0%, #0D1117 55%, #07080A 100%)',
                }}
              >
                {/* Soft Atmospheric Bokeh Light Orbs */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-4 -right-3 w-20 h-20 rounded-full bg-white/[0.06] blur-md"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-6 -left-4 w-16 h-16 rounded-full bg-[#6482A0]/[0.12] blur-md"
                />

                {/* Compact OS Status Header */}
                <div className="relative z-20 shrink-0 flex items-center justify-between px-2 pt-1 pb-0.5 bg-black/25 border-b border-white/[0.06]">
                  <span className="text-[7px] font-bold lowercase tracking-[0.14em] text-white/70 truncate">
                    {isPlaying ? 'playing' : isStandby ? 'zune os' : 'paused'}
                  </span>
                  <SquircleClockStatus isDocumentHidden={isDocumentHidden} />
                </div>

                {/* Section Ribbon (#sq-twist-ribbon) */}
                <div
                  id="sq-twist-ribbon"
                  role="tablist"
                  aria-label="Zune OS interface sections"
                  className="relative z-20 shrink-0 w-full flex items-center justify-between px-2 py-0.5 bg-black/20 border-b border-white/[0.06] overflow-hidden"
                >
                  <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
                    {SQUIRCLE_PMP_PANE_ORDER.map((paneId) => {
                      const isSelected = activePane === paneId;
                      return (
                        <button
                          key={paneId}
                          id={`sq-tab-${paneId}`}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => navigateToPane(paneId)}
                          className={`sq-pressable shrink-0 bg-transparent border-none p-0 cursor-pointer lowercase transition-colors leading-none ${
                            isSelected
                              ? 'text-white font-bold'
                              : 'text-white/45 hover:text-white/80 font-light'
                          }`}
                          style={{
                            fontSize: isSelected
                              ? 'clamp(11px, 3.8cqh, 16px)'
                              : 'clamp(9.5px, 3.2cqh, 13px)',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {SQUIRCLE_PANE_LABELS[paneId]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 pl-1">
                    <button
                      type="button"
                      aria-label="Previous section"
                      onClick={() => navigateToPane(stepSquirclePaneIndex(activePane, 'prev'))}
                      disabled={activePaneIdx === 0}
                      className="sq-pressable w-4 h-4 rounded flex items-center justify-center text-white/60 hover:text-white disabled:opacity-25 cursor-pointer"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next section"
                      onClick={() => navigateToPane(stepSquirclePaneIndex(activePane, 'next'))}
                      disabled={activePaneIdx === SQUIRCLE_PMP_PANE_ORDER.length - 1}
                      className="sq-pressable w-4 h-4 rounded flex items-center justify-center text-white/60 hover:text-white disabled:opacity-25 cursor-pointer"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Horizontal 4-Pane Sliding Viewport (#sq-pane-slider) */}
                <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                  <div
                    id="sq-pane-slider"
                    className="sq-pane-slider flex w-full h-full"
                    style={{
                      transform: `translate3d(-${paneTranslatePct}%, 0, 0)`,
                      transition:
                        prefersReducedMotion || lowPowerMode
                          ? 'none'
                          : 'transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                    }}
                  >
                    {/* PANE 0: Authentic Zune OS Portrait Vertical Lowercase Menu (music, videos, pictures, radio, community, settings) */}
                    <section
                      id="sq-pane-music"
                      aria-hidden={activePane !== 'music'}
                      className="w-full min-w-full h-full overflow-y-auto overflow-x-hidden py-1.5 custom-scrollbar"
                    >
                      <div
                        id="sq-twist-home-menu"
                        aria-label="Zune OS Portrait Home Menu"
                        className="flex flex-col gap-0.5 pt-0.5 pb-1.5"
                      >
                        {ZUNE_OS_PORTRAIT_MENU_ITEMS.map((menuItem) => {
                          const isHighlighted = selectedMenuId === menuItem.id;
                          return (
                            <button
                              key={menuItem.id}
                              type="button"
                              data-twist-menu-item={menuItem.id}
                              data-menu-active={isHighlighted ? 'true' : 'false'}
                              onClick={() => {
                                setSelectedMenuId(menuItem.id);
                                retroAudio.triggerSquircleThip(true);
                                triggerButtonHaptic(lowPowerMode);
                                if (menuItem.id === 'videos') {
                                  setMediaViewMode('video');
                                } else if (menuItem.id === 'pictures') {
                                  setMediaViewMode('artwork');
                                }
                                if (menuItem.id !== 'music') {
                                  navigateToPane(menuItem.targetPane);
                                }
                              }}
                              style={{
                                fontSize: 'clamp(16px, 5.8cqh, 25px)',
                                background: isHighlighted
                                  ? 'linear-gradient(90deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.58) 65%, rgba(255,255,255,0) 100%)'
                                  : 'transparent',
                              }}
                              className={`sq-pressable w-full text-left pl-2.5 pr-2 py-[2px] font-normal lowercase tracking-[-0.025em] leading-[1.06] cursor-pointer transition-colors ${
                                isHighlighted
                                  ? 'text-[#101214] font-semibold'
                                  : 'text-white/90 hover:text-white'
                              }`}
                            >
                              {menuItem.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Compact Artist & Track Sub-List Beneath Home Menu */}
                      {tracks.length > 0 && (
                        <div className="px-2.5 pt-1 border-t border-white/[0.08] flex flex-col gap-1.5">
                          {artistGroups.map((group) => {
                            const groupHasActive = group.tracks.some((t) => t.id === track.id);
                            return (
                              <div key={group.artistKey} className="overflow-hidden">
                                <div
                                  className={`font-semibold lowercase tracking-[-0.02em] leading-none whitespace-nowrap mb-0.5 text-[11px] ${
                                    groupHasActive ? 'text-[#E6007E]' : 'text-white/75'
                                  }`}
                                >
                                  {group.artistDisplayLowercase}
                                </div>
                                <div className="flex flex-col gap-0.5 pl-1.5 border-l border-white/15">
                                  {group.tracks.map((item) => {
                                    const isCurrent = item.id === track.id;
                                    return (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => {
                                          retroAudio.triggerSquircleThip(true);
                                          triggerButtonHaptic(lowPowerMode);
                                          if (onSelectTrack) {
                                            onSelectTrack(item.id);
                                          }
                                          navigateToPane('now-playing');
                                        }}
                                        className={`sq-pressable w-full text-left py-0.5 px-1 rounded-[4px] flex items-center justify-between gap-1 cursor-pointer ${
                                          isCurrent
                                            ? 'bg-white/90 text-[#101214] font-semibold'
                                            : 'text-white/80 hover:text-white'
                                        }`}
                                      >
                                        <span className="text-[10px] lowercase truncate">
                                          {item.title.toLowerCase()}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* PANE 1: Clean Zune OS Now Playing (Artwork Card + Lowercase Metadata + Timeline — NO video inside Zune screen) */}
                    <section
                      id="sq-pane-now-playing"
                      aria-hidden={activePane !== 'now-playing'}
                      className="relative w-full min-w-full h-full overflow-hidden flex flex-col justify-between p-2"
                    >
                      <div className="relative z-10 flex flex-col items-start gap-1.5">
                        {resolvedArtworkUrl && !artworkBroken ? (
                          <div
                            id="sq-now-playing-art-card"
                            data-sq-rounded-art="true"
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-[12px] overflow-hidden border border-white/25 shadow-[0_6px_14px_rgba(0,0,0,0.6)] shrink-0"
                          >
                            <img
                              src={resolvedArtworkUrl}
                              alt=""
                              draggable={false}
                              className="w-full h-full object-cover rounded-[12px]"
                            />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-[12px] bg-white/[0.06] border border-white/15 flex items-center justify-center">
                            <Disc3 className="w-7 h-7 text-white/45" />
                          </div>
                        )}
                      </div>

                      <div className="relative z-10 flex flex-col justify-end">
                        <div className="overflow-hidden">
                          <h2
                            id="console-track-title"
                            className="font-bold lowercase tracking-[-0.03em] text-white whitespace-nowrap leading-[0.95]"
                            style={{
                              fontSize: 'clamp(16px, 6.2cqh, 26px)',
                              transform: `translate3d(0, ${trackChangePose.titleTranslateYPx}px, 0)`,
                              opacity: trackChangePose.titleOpacity,
                              transition:
                                prefersReducedMotion || lowPowerMode
                                  ? 'none'
                                  : `transform ${SQUIRCLE_TRACK_CHANGE_TIMELINE_MS.titleDropMs}ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 280ms ease-out`,
                            }}
                          >
                            {isStandby ? 'standby' : (track.title || 'untitled').toLowerCase()}
                          </h2>
                        </div>
                        <div
                          id="console-artist-name"
                          className="mt-0.5 font-medium uppercase tracking-[0.12em] text-white/65 truncate"
                          style={{ fontSize: 'clamp(7.5px, 2cqh, 9.5px)' }}
                        >
                          {isStandby ? 'connect spotify' : track.artist}
                        </div>

                        <div className="mt-1.5 flex items-baseline justify-between gap-2">
                          <span
                            id="sq-elapsed-numeral"
                            className="font-light text-white tabular-nums tracking-[-0.04em] leading-none"
                            style={{ fontSize: 'clamp(15px, 5.2cqh, 22px)' }}
                          >
                            {elapsedDisplay}
                          </span>
                          <span
                            id="sq-total-duration"
                            className="font-medium uppercase tracking-[0.12em] text-white/60 tabular-nums"
                            style={{ fontSize: 'clamp(7.5px, 2cqh, 9.5px)' }}
                          >
                            / {totalDisplay}
                          </span>
                        </div>

                        {/* Scrubbable Timeline Bar */}
                        <div
                          id="sq-progress-track"
                          role="slider"
                          aria-label="Track progress"
                          aria-valuemin={0}
                          aria-valuemax={Math.max(1, Math.round(safeDuration))}
                          aria-valuenow={Math.round(currentTimeSec)}
                          tabIndex={0}
                          onPointerDown={handleProgressBarScrub}
                          className="mt-1 relative w-full h-2.5 flex items-center cursor-pointer touch-none"
                        >
                          <div className="w-full h-[2px] rounded-full bg-white/25 overflow-hidden">
                            <div
                              className="h-full bg-white transition-[width] duration-150 ease-linear"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* PANE 2: Synced Lyrics */}
                    <section
                      id="sq-pane-lyrics"
                      aria-hidden={activePane !== 'lyrics'}
                      className="w-full min-w-full h-full overflow-hidden p-1.5 bg-[#0A0D12]"
                    >
                      <SyncedLyricsPanel
                        track={track}
                        isStandby={isStandby}
                        isPlaying={isPlaying}
                        isDocumentHidden={isDocumentHidden}
                        lowPowerMode={lowPowerMode}
                        nightMode={nightMode}
                        prefersReducedMotion={prefersReducedMotion}
                        themePalette={themePalette}
                        themeId="squircle-pmp"
                        onSeek={onSeek}
                        className="w-full h-full"
                      />
                    </section>

                    {/* PANE 3: Settings */}
                    <section
                      id="sq-pane-settings"
                      aria-hidden={activePane !== 'settings'}
                      className="w-full min-w-full h-full overflow-y-auto overflow-x-hidden px-2.5 py-2 flex flex-col justify-between gap-2 bg-[#0A0D12] custom-scrollbar"
                    >
                      <div className="flex flex-col gap-1.5">
                        <label className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-bold lowercase text-white">volume</span>
                            <span className="text-[8.5px] text-white/75 tabular-nums">
                              {Math.round(volume * 100)}%
                            </span>
                          </div>
                          <input
                            id="vertical-volume-slider"
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(volume * 100)}
                            aria-label="Volume level"
                            onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
                            className="w-full accent-[#E6007E] h-1.5 bg-white/20 rounded-full cursor-pointer"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-bold lowercase text-white">pitch trim</span>
                            <span className="text-[8.5px] text-white/70 tabular-nums">
                              {pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
                            </span>
                          </div>
                          <input
                            id="vertical-pitch-slider"
                            type="range"
                            min={-12}
                            max={12}
                            step={0.5}
                            value={pitchPercent}
                            aria-label="Pitch percentage"
                            onChange={(e) => onChangePitch(Number(e.target.value))}
                            className="w-full accent-[#E6007E] h-1.5 bg-white/20 rounded-full cursor-pointer"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-1">
                        <button
                          id="toggle-shuffle"
                          type="button"
                          aria-pressed={shuffleEnabled}
                          onClick={() => {
                            retroAudio.triggerSquircleThip(false);
                            triggerButtonHaptic(lowPowerMode);
                            onToggleShuffle();
                          }}
                          className={`sq-pressable px-1.5 py-1 rounded-[5px] border text-[9px] font-bold lowercase flex items-center justify-between cursor-pointer ${
                            shuffleEnabled
                              ? 'bg-[#E6007E] border-[#E6007E] text-white'
                              : 'bg-white/[0.06] border-white/20 text-white/75'
                          }`}
                        >
                          <span>shuffle</span>
                          <Shuffle className="w-2.5 h-2.5" />
                        </button>
                        <button
                          id="toggle-repeat"
                          type="button"
                          aria-pressed={repeatOne}
                          onClick={() => {
                            retroAudio.triggerSquircleThip(false);
                            triggerButtonHaptic(lowPowerMode);
                            onToggleRepeatOne();
                          }}
                          className={`sq-pressable px-1.5 py-1 rounded-[5px] border text-[9px] font-bold lowercase flex items-center justify-between cursor-pointer ${
                            repeatOne
                              ? 'bg-[#E6007E] border-[#E6007E] text-white'
                              : 'bg-white/[0.06] border-white/20 text-white/75'
                          }`}
                        >
                          <span>repeat</span>
                          <Repeat1 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          id="toggle-eco"
                          type="button"
                          aria-pressed={lowPowerMode}
                          onClick={() => {
                            retroAudio.triggerSquircleThip(false);
                            triggerButtonHaptic(lowPowerMode);
                            onToggleLowPowerMode();
                          }}
                          className={`sq-pressable px-1.5 py-1 rounded-[5px] border text-[9px] font-bold lowercase flex items-center justify-between cursor-pointer ${
                            lowPowerMode
                              ? 'bg-white text-[#101214] border-white'
                              : 'bg-white/[0.06] border-white/20 text-white/75'
                          }`}
                        >
                          <span>eco</span>
                          <span className="text-[7.5px] uppercase">{lowPowerMode ? 'on' : 'off'}</span>
                        </button>
                        <button
                          id="toggle-night-mode"
                          type="button"
                          aria-pressed={nightMode}
                          onClick={() => {
                            retroAudio.triggerSquircleThip(false);
                            triggerButtonHaptic(lowPowerMode);
                            onToggleNightMode();
                          }}
                          className={`sq-pressable px-1.5 py-1 rounded-[5px] border text-[9px] font-bold lowercase flex items-center justify-between cursor-pointer ${
                            nightMode
                              ? 'bg-white text-[#101214] border-white'
                              : 'bg-white/[0.06] border-white/20 text-white/75'
                          }`}
                        >
                          <span>night</span>
                          <span className="text-[7.5px] uppercase">{nightMode ? 'on' : 'off'}</span>
                        </button>
                      </div>

                      <button
                        id="btn-stop-playback"
                        type="button"
                        onClick={() => {
                          retroAudio.triggerSquircleStopCue();
                          triggerButtonHaptic(lowPowerMode);
                          onStop();
                        }}
                        className="sq-pressable w-full py-1 rounded-[5px] bg-white/[0.08] border border-white/25 text-white text-[9.5px] font-bold lowercase flex items-center justify-center gap-1 cursor-pointer hover:border-white/50"
                      >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        <span>stop deck</span>
                      </button>
                    </section>
                  </div>
                </div>

                {/* Authentic Zune 30 Bottom-Right Crisp White Wireless, Horizontal Battery & Play-State Status Glyphs */}
                <div
                  id="sq-oled-corner-status"
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-1.5 right-2 z-30 flex items-center gap-1.5 opacity-95"
                >
                  {/* Tiny White Wireless / Wi-Fi Wave Arcs */}
                  <svg viewBox="0 0 14 11" className="w-[11px] h-[9px]">
                    <path
                      d="M1.5 3.5 C4.5 0.8, 9.5 0.8, 12.5 3.5"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M3.6 6 C5.5 4.2, 8.5 4.2, 10.4 6"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    <circle cx="7" cy="8.8" r="1.1" fill="#FFFFFF" />
                  </svg>

                  {/* Tiny White Horizontal Battery Icon */}
                  <svg viewBox="0 0 16 10" className="w-[13px] h-[8px]">
                    <rect
                      x="1"
                      y="1.5"
                      width="12.5"
                      height="7"
                      rx="1"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="1.1"
                    />
                    <rect x="13.5" y="3.5" width="1.5" height="3" fill="#FFFFFF" />
                    <rect x="2.5" y="3" width="9" height="4" fill="#FFFFFF" />
                  </svg>

                  {/* Tiny Play / Pause Glyph */}
                  {isPlaying ? (
                    <div className="flex items-center gap-[1.5px]">
                      <span className="w-[1.8px] h-[6px] bg-white" />
                      <span className="w-[1.8px] h-[6px] bg-white" />
                    </div>
                  ) : (
                    <span className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Seamless Brushed Gunmetal Keyhole Bridge Connecting Screen Frame to Metallic D-Pad Ring */}
          <div
            id="sq-keyhole-neck"
            aria-hidden="true"
            className="sq-keyhole-bezel relative z-[9] w-[42px] h-[16px] -mt-[4px] -mb-[10px] shrink-0"
          />

          {/* Lower Hardware Control Deck: Recessed Charcoal Back (<-) + Gunmetal Ring & Blank Glossy Black D-Pad + Recessed Charcoal Play/Pause (>||) */}
          <div
            id="sq-hardware-deck"
            className="relative z-20 w-full flex-1 min-h-0 flex items-center justify-between gap-1.5 pt-0 px-2"
          >
            {/* Left Recessed Dark-Charcoal Back Button (←) — ZERO White Outline/Ring */}
            <button
              id="btn-sq-back"
              type="button"
              aria-label="Back section"
              onClick={handleBackPress}
              className="sq-circle-btn sq-pressable shrink-0 rounded-full flex items-center justify-center text-[#9EA3AA] hover:text-white cursor-pointer"
              style={{
                width: `${sideBtnSizePx}px`,
                height: `${sideBtnSizePx}px`,
              }}
            >
              <svg viewBox="0 0 16 12" className="w-[11px] h-[9px]" aria-hidden="true">
                <path
                  d="M6 2 L2 6 L6 10 M2.5 6 H14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Outer Brushed Gunmetal Circular Surround Ring Framing the Glossy Black 4-Way D-Pad */}
            <div
              className="sq-keyhole-bezel relative shrink-0 rounded-full p-[5px] flex items-center justify-center"
              style={{
                width: `${keyholeOuterRingPx}px`,
                height: `${keyholeOuterRingPx}px`,
              }}
            >
              {/* Glossy Piano-Black 4-Way D-Pad Ring + Blank Matte-Black Domed Center Select Button (100% Unbranded) */}
              <div
                id="sq-dpad"
                role="group"
                aria-label="Circular directional control pad"
                data-unbranded-blank="true"
                className="sq-dpad-ring relative w-full h-full grid grid-cols-3 grid-rows-3 p-[3px]"
                style={{ borderRadius: '9999px' }}
              >
                {/* Row 1: Volume Up (Invisible Hit Area — Zero Printed Glyph) */}
                <div />
                <button
                  id="btn-dpad-up"
                  type="button"
                  aria-label="Volume up"
                  onClick={() => handleDpadVolume('up')}
                  className="sq-pressable w-full h-full bg-transparent border-0 cursor-pointer rounded-t-full"
                >
                  <span className="sr-only">Volume up</span>
                </button>
                <div />

                {/* Row 2: Prev (Tap) / Stutter-Rewind (Long-press), Blank Matte Center Select Disc, Next Track */}
                <button
                  id="btn-prev-track"
                  type="button"
                  aria-label="Previous track (hold for stutter-rewind)"
                  title="Tap: Previous track · Hold: Stutter-Rewind"
                  onPointerDown={handleDpadLeftPointerDown}
                  onPointerUp={handleDpadLeftPointerUpOrCancel}
                  onPointerLeave={handleDpadLeftPointerUpOrCancel}
                  onPointerCancel={handleDpadLeftPointerUpOrCancel}
                  onClick={handleDpadLeftClick}
                  className="sq-pressable w-full h-full bg-transparent border-0 cursor-pointer rounded-l-full"
                >
                  <span className="sr-only">Previous track</span>
                </button>

                {/* Flush Subtly Domed Matte-Black Center Select Disc (100% Blank) */}
                <button
                  id="btn-play-pause"
                  type="button"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    retroAudio.triggerSquircleThip(true);
                    onTogglePlay();
                  }}
                  className={`sq-dpad-inner-well sq-pressable w-full h-full rounded-full cursor-pointer ${
                    stutterActive ? 'ring-1 ring-[#E6007E]/80' : ''
                  }`}
                >
                  <span className="sr-only">{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  id="btn-next-track"
                  type="button"
                  aria-label="Next track"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    retroAudio.triggerSquircleThip(false);
                    onNext();
                  }}
                  className="sq-pressable w-full h-full bg-transparent border-0 cursor-pointer rounded-r-full"
                >
                  <span className="sr-only">Next track</span>
                </button>

                {/* Row 3: Volume Down (Invisible Hit Area — Zero Printed Glyph) */}
                <div />
                <button
                  id="btn-dpad-down"
                  type="button"
                  aria-label="Volume down"
                  onClick={() => handleDpadVolume('down')}
                  className="sq-pressable w-full h-full bg-transparent border-0 cursor-pointer rounded-b-full"
                >
                  <span className="sr-only">Volume down</span>
                </button>
                <div />
              </div>
            </div>

            {/* Right Recessed Dark-Charcoal Play/Pause Button (▶||) — ZERO White Outline/Ring */}
            <button
              id="btn-sq-play-shortcut"
              type="button"
              aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                retroAudio.triggerSquircleThip(true);
                onTogglePlay();
              }}
              className="sq-circle-btn sq-pressable shrink-0 rounded-full flex items-center justify-center text-[#9EA3AA] hover:text-white cursor-pointer"
              style={{
                width: `${sideBtnSizePx}px`,
                height: `${sideBtnSizePx}px`,
              }}
            >
              <svg viewBox="0 0 18 12" className="w-[12px] h-[9px]" aria-hidden="true">
                <polygon points="2,2 8,6 2,10" fill="currentColor" />
                <rect x="10" y="2.2" width="1.8" height="7.6" fill="currentColor" />
                <rect x="13.2" y="2.2" width="1.8" height="7.6" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        {/* DEDICATED EXTERNAL ROUNDED-CORNER VIDEO DISPLAY MODULE DIRECTLY BELOW ZUNE UNIT (#sq-external-video-display) */}
        <div
          id="sq-external-video-display"
          data-testid="sq-external-video-display"
          data-video-active={videoDisplayState.showVideoIframe ? 'true' : 'false'}
          style={{
            width: `${layoutMetrics.videoScreenW}px`,
            height: `${layoutMetrics.videoScreenH}px`,
          }}
          className="sq-external-video-frame relative p-[7px] flex flex-col items-center justify-between shrink-0 overflow-hidden"
        >
          {/* Specular Inner Edge Rim Highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[6px] rounded-[14px] border border-white/[0.12] z-20"
          />

          {/* Inner Video Viewport (14px Rounded Glass Window) */}
          <div className="relative w-full flex-1 min-h-0 rounded-[13px] overflow-hidden bg-[#060708] shadow-[inset_0_2px_8px_rgba(0,0,0,0.92)]">
            {videoDisplayState.showVideoIframe && activeVideoId ? (
              <div
                id="sq-video-viewport"
                data-testid="sq-video-viewport"
                data-youtube-video-id={activeVideoId}
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
              >
                <iframe
                  id="sq-youtube-video-iframe"
                  key={`${track.id}-${activeVideoId}`}
                  ref={ytIframeRef}
                  title={`Synchronized video for ${track.title}`}
                  src={buildCleanYouTubeEmbedUrl(
                    activeVideoId,
                    Boolean(isPlaying && !isDocumentHidden),
                    0,
                    typeof window !== 'undefined' ? window.location.origin : undefined,
                    true
                  )}
                  onLoad={() => {
                    const win = ytIframeRef.current?.contentWindow;
                    if (!win) return;
                    try {
                      win.postMessage(
                        JSON.stringify({ event: 'listening', id: 'sq-youtube-video-iframe' }),
                        '*'
                      );
                    } catch {
                      // ignore
                    }
                    const curSec = Math.floor(playbackClockStore.getCurrentTimeSec());
                    sendSqYouTubeCommand('mute');
                    sendSqYouTubeCommand('seekTo', [curSec, true]);
                    sendSqYouTubeCommand(
                      isPlaying && !isDocumentHidden ? 'playVideo' : 'pauseVideo'
                    );
                  }}
                  className="pointer-events-none w-full h-full border-0 scale-[1.08]"
                  allow="autoplay; encrypted-media"
                />
              </div>
            ) : (
              <>
                {outgoingArtSnap && outgoingArtSnap.url && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                    style={{
                      opacity: trackChangePose.outgoingBgOpacity * 0.75,
                      transition: `opacity ${SQUIRCLE_TRACK_CHANGE_TIMELINE_MS.crossfadeMs}ms ease-out`,
                    }}
                  >
                    <img
                      src={outgoingArtSnap.url}
                      alt=""
                      className="w-full h-full object-cover scale-105"
                    />
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                  style={{
                    opacity: trackChangePose.incomingBgOpacity * 0.92,
                    transition:
                      prefersReducedMotion || lowPowerMode
                        ? 'none'
                        : `opacity ${SQUIRCLE_TRACK_CHANGE_TIMELINE_MS.crossfadeMs}ms ease-out`,
                  }}
                >
                  {animatedFrameUrl && !artworkBroken ? (
                    <img
                      src={animatedFrameUrl}
                      alt=""
                      draggable={false}
                      data-ken-burns={activeLoopsEnabled && !isStandby ? 'true' : 'false'}
                      className="sq-ken-burns w-full h-full object-cover block"
                      style={{
                        animationPlayState:
                          activeLoopsEnabled && !isStandby ? 'running' : 'paused',
                      }}
                    />
                  ) : (
                    <div
                      data-ken-burns="false"
                      className="w-full h-full flex items-center justify-center bg-[#08090B]"
                    >
                      <Disc3 className="w-8 h-8 text-white/30" />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Compact Video / Art Toggle Pill */}
            {!isStandby && activeVideoId && !iframeUnavailable && (
              <button
                id="sq-toggle-video-art"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  retroAudio.triggerSquircleThip(false);
                  triggerButtonHaptic(lowPowerMode);
                  setMediaViewMode((m) => (m === 'video' ? 'artwork' : 'video'));
                }}
                className="sq-pressable absolute top-1.5 right-1.5 z-30 px-1.5 py-0.5 rounded-full bg-black/75 border border-white/20 text-[7.5px] font-bold lowercase text-white/90 hover:text-white cursor-pointer"
              >
                {mediaViewMode === 'video' ? 'video · on' : 'art'}
              </button>
            )}

            {/* Subtle Diagonal Glass Reflection Sheen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12)_0%,transparent_38%,transparent_68%,rgba(255,255,255,0.04)_100%)]"
            />
          </div>

          {/* Miniature Lower-Bezel Status LED Pip */}
          <span
            aria-hidden="true"
            className={`mt-[3px] w-[4px] h-[4px] rounded-full shrink-0 ${
              isPlaying
                ? 'bg-[#E6007E] shadow-[0_0_5px_#E6007E]'
                : 'bg-white/25'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
