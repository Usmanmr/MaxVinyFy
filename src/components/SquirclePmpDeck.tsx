import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Square,
  Shuffle,
  Repeat1,
  Disc3,
  Smartphone,
  Heart,
  X,
} from 'lucide-react';
import {
  triggerButtonHaptic,
  resolveActiveArtworkState,
  formatConsoleClockAndDate,
  shouldRunActiveAnimationLoops,
  type YouTubeGrabFrame,
} from '../utils/playerLogic';
import {
  buildYouTubeCandidateQueue,
  loadYouTubeIframeApi,
  type YTPlayerInstance,
} from '../utils/youtubePlayer';
import {
  SQUIRCLE_HOME_MENU_ITEMS,
  ZUNE_OS_SCREEN_ORDER,
  ZUNE_CHASSIS_ASPECT_RATIO,
  SQUIRCLE_LONG_PRESS_MS,
  SQUIRCLE_TRACK_CHANGE_TIMELINE_MS,
  SQUIRCLE_UNDER_VIDEO_SCROLL_MASK_GRADIENT,
  ZUNE_30_COLORWAYS,
  ZUNE_MOBILE_EDITORIAL_RIGHT_MASK,
  ZUNE_VOLUME_BAR_COUNT,
  getZuneDpadTiltTransform,
  getZuneOsScreenTranslatePct,
  getZuneLeftButtonTarget,
  stepZuneListFocusIndex,
  computeZuneScrollIndicatorMetrics,
  formatSquircleOversizedTime,
  calculateSquircleVolumeStep,
  getSquircleTrackChangePose,
  computeSquircleStageLayout,
  resolveSquircleVideoPlaybackState,
  buildZuneYoutubeScreenGrabCandidates,
  loadSavedZuneColorway,
  saveZuneColorway,
  stepZuneColorway,
  evaluateZuneColorSwipeGesture,
  volumeToZuneStepCount,
  formatZuneTrackIndexReadout,
  loadSavedZuneFavorites,
  toggleZuneFavoriteTrackId,
  type ZuneDpadZone,
  type ZuneOsScreenId,
  type SquircleTrackChangePhase,
  type ZuneColorwayId,
} from '../utils/squirclePmpLogic';
import { retroAudio } from '../utils/retroAudioEngine';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';
import { useDoubleTapHideArt } from '../hooks/useDoubleTapHideArt';

/**
 * Live lowercase time + uppercase date strip shown on Now Playing / Settings sub-screens
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
      className="flex items-center gap-1 min-w-0 shrink-0"
    >
      <span
        id="console-clock-time"
        className="font-sans font-normal tracking-tight text-[#B2C3D4] tabular-nums"
        style={{ fontSize: 'clamp(9px, 2.4cqh, 12px)', lineHeight: 1 }}
      >
        {clockText.timeText.toLowerCase()}
      </span>
      <span className="text-[#B2C3D4]/40 text-[8px] leading-none" aria-hidden="true">
        /
      </span>
      <span
        id="console-clock-date"
        className="font-sans font-light uppercase tracking-[0.08em] text-[#B2C3D4]/75 truncate max-w-[96px]"
        style={{ fontSize: 'clamp(7px, 1.7cqh, 9px)', lineHeight: 1 }}
      >
        {clockText.dateText}
      </span>
    </div>
  );
});

SquircleClockStatus.displayName = 'SquircleClockStatus';

/**
 * Single Seamless Unified Dark Charcoal Keyhole Bezel Path (Upper Screen Frame + Concave Neck + Lower Circular D-Pad Collar)
 * ViewBox: 0 0 1000 1835 (exact 0.545:1 Zune 30 physical coordinates)
 */
const UNIFIED_KEYHOLE_OUTER_PATH =
  'M 116 88 H 884 A 26 26 0 0 1 910 114 V 1135 A 26 26 0 0 1 884 1161 H 627.9 A 17.9 17.9 0 0 0 619.5 1194.7 A 255 255 0 1 1 380.5 1194.7 A 17.9 17.9 0 0 0 372.1 1161 H 116 A 26 26 0 0 1 90 1135 V 114 A 26 26 0 0 1 116 88 Z';

const KEYHOLE_DPAD_CUTOUT_PATH =
  'M 500 1200 A 220 220 0 1 0 500 1640 A 220 220 0 1 0 500 1200 Z';

const KEYHOLE_SCREEN_CUTOUT_PATH =
  'M 122 121 H 878 V 1130 H 122 Z';

interface ZuneResilientYouTubePlayerHandle {
  triggerUserGesturePlay: () => void;
}

const ZuneResilientYouTubePlayer = React.memo(
  React.forwardRef<
    ZuneResilientYouTubePlayerHandle,
    {
      primaryVideoId?: string;
      alternateVideoIds?: readonly string[];
      isPlaying: boolean;
      trackKey: string;
      seekEvent?: { timeSec: number; nonce: number };
      onAllCandidatesFailed: () => void;
    }
  >(({ primaryVideoId, alternateVideoIds = [], isPlaying, trackKey, seekEvent, onAllCandidatesFailed }, ref) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<YTPlayerInstance | null>(null);
    const isPlayerReadyRef = useRef<boolean>(false);
    const pendingVideoIdRef = useRef<string | null>(null);
    const isPlayingRef = useRef<boolean>(isPlaying);
    isPlayingRef.current = isPlaying;

    const candidateQueue = useMemo(
      () => buildYouTubeCandidateQueue(primaryVideoId, alternateVideoIds),
      [primaryVideoId, alternateVideoIds]
    );
    const [candidateIndex, setCandidateIndex] = useState<number>(0);
    const [isMaskingSwitch, setIsMaskingSwitch] = useState<boolean>(true);
    const [allFailed, setAllFailed] = useState<boolean>(false);

    const candidateQueueRef = useRef<string[]>(candidateQueue);
    candidateQueueRef.current = candidateQueue;
    const candidateIndexRef = useRef<number>(candidateIndex);
    candidateIndexRef.current = candidateIndex;

    const stallTimerRef = useRef<number | null>(null);
    const debounceTimerRef = useRef<number | null>(null);

    const activeVideoId = candidateQueue[candidateIndex] ?? '';

    const clearStallTimer = useCallback(() => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    }, []);

    const enforceStrictSilence = useCallback((p: YTPlayerInstance | null) => {
      if (!p) return;
      try {
        p.mute?.();
        p.setVolume?.(0);
      } catch {
        // ignore cross-origin YT errors
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        triggerUserGesturePlay: () => {
          const p = playerRef.current;
          if (!p || !isPlayerReadyRef.current) return;
          try {
            p.mute?.();
            p.setVolume?.(0);
            p.playVideo?.();
          } catch {
            // ignore cross-origin YT errors
          }
        },
      }),
      []
    );

    const advanceToNextCandidate = useCallback(() => {
      clearStallTimer();
      setIsMaskingSwitch(true);
      const nextIdx = candidateIndexRef.current + 1;
      if (nextIdx < candidateQueueRef.current.length) {
        setCandidateIndex(nextIdx);
      } else {
        setAllFailed(true);
        onAllCandidatesFailed();
      }
    }, [clearStallTimer, onAllCandidatesFailed]);

    const startStallWatch = useCallback(() => {
      clearStallTimer();
      stallTimerRef.current = window.setTimeout(() => {
        const p = playerRef.current;
        if (!p) return;
        try {
          const state = p.getPlayerState?.();
          if (state === -1 || state === undefined) {
            advanceToNextCandidate();
          }
        } catch {
          advanceToNextCandidate();
        }
      }, 5000);
    }, [clearStallTimer, advanceToNextCandidate]);

    useEffect(() => {
      setCandidateIndex(0);
      setAllFailed(false);
      setIsMaskingSwitch(true);
    }, [trackKey, primaryVideoId]);

    useEffect(() => {
      if (allFailed || !activeVideoId) return;
      let cancelled = false;

      loadYouTubeIframeApi()
        .then((YT) => {
          if (cancelled || !hostRef.current) return;
          if (playerRef.current) return;

          const mountNode = document.createElement('div');
          mountNode.style.width = '100%';
          mountNode.style.height = '100%';
          hostRef.current.innerHTML = '';
          hostRef.current.appendChild(mountNode);

          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const widgetReferrer = typeof window !== 'undefined' ? window.location.href : '';

          isPlayerReadyRef.current = false;
          startStallWatch();

          const player = new YT.Player(mountNode, {
            width: '100%',
            height: '100%',
            videoId: activeVideoId,
            host: 'https://www.youtube.com',
            playerVars: {
              autoplay: 1,
              mute: 1,
              controls: 0,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              playsinline: 1,
              enablejsapi: 1,
              origin,
              widget_referrer: widgetReferrer,
            },
            events: {
              onReady: (ev) => {
                if (cancelled) return;
                isPlayerReadyRef.current = true;
                const p = ev.target;
                enforceStrictSilence(p);

                try {
                  const iframeEl = p.getIframe?.();
                  if (iframeEl) {
                    iframeEl.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                    iframeEl.setAttribute(
                      'allow',
                      'autoplay; encrypted-media; picture-in-picture; fullscreen'
                    );
                    iframeEl.style.width = '100%';
                    iframeEl.style.height = '100%';
                    iframeEl.style.border = '0';
                    iframeEl.style.pointerEvents = 'none';
                  }
                } catch {
                  // ignore DOM attribute errors
                }

                const curSec = Math.max(0, Math.floor(playbackClockStore.getCurrentTimeSec()));
                if (pendingVideoIdRef.current && pendingVideoIdRef.current !== activeVideoId) {
                  const queuedId = pendingVideoIdRef.current;
                  pendingVideoIdRef.current = null;
                  p.loadVideoById?.({ videoId: queuedId, startSeconds: curSec });
                  enforceStrictSilence(p);
                  startStallWatch();
                } else {
                  if (curSec > 1) {
                    p.seekTo?.(curSec, true);
                  }
                  if (isPlayingRef.current) {
                    p.playVideo?.();
                  } else {
                    p.pauseVideo?.();
                  }
                }
              },
              onStateChange: (ev) => {
                if (cancelled) return;
                enforceStrictSilence(ev.target);
                if (ev.data === 1 || ev.data === 2 || ev.data === 5) {
                  clearStallTimer();
                  setIsMaskingSwitch(false);
                } else if (ev.data === -1) {
                  startStallWatch();
                }
              },
              onError: () => {
                if (cancelled) return;
                advanceToNextCandidate();
              },
            },
          });

          playerRef.current = player;
        })
        .catch(() => {
          if (!cancelled) {
            setAllFailed(true);
            onAllCandidatesFailed();
          }
        });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allFailed]);

    useEffect(() => {
      if (!activeVideoId || allFailed) return;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(() => {
        const player = playerRef.current;
        if (!player) return;
        if (!isPlayerReadyRef.current) {
          pendingVideoIdRef.current = activeVideoId;
          return;
        }
        setIsMaskingSwitch(true);
        startStallWatch();
        try {
          const curSec = Math.max(0, Math.floor(playbackClockStore.getCurrentTimeSec()));
          player.loadVideoById?.({ videoId: activeVideoId, startSeconds: curSec });
          enforceStrictSilence(player);
          if (isPlayingRef.current) {
            player.playVideo?.();
          } else {
            player.pauseVideo?.();
          }
        } catch {
          advanceToNextCandidate();
        }
      }, 200);

      return () => {
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    }, [
      activeVideoId,
      allFailed,
      startStallWatch,
      enforceStrictSilence,
      advanceToNextCandidate,
    ]);

    useEffect(() => {
      const player = playerRef.current;
      if (!player || !isPlayerReadyRef.current || allFailed) return;
      try {
        enforceStrictSilence(player);
        if (isPlaying) {
          player.playVideo?.();
        } else {
          player.pauseVideo?.();
        }
      } catch {
        // ignore YT sync errors
      }
    }, [isPlaying, allFailed, enforceStrictSilence]);

    useEffect(() => {
      const player = playerRef.current;
      if (!player || !isPlayerReadyRef.current || allFailed || !seekEvent || seekEvent.nonce === 0) {
        return;
      }
      try {
        player.seekTo?.(Math.max(0, Math.floor(seekEvent.timeSec)), true);
      } catch {
        // ignore YT seek errors
      }
    }, [seekEvent?.nonce, seekEvent?.timeSec, allFailed]);

    useEffect(() => {
      return () => {
        clearStallTimer();
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        isPlayerReadyRef.current = false;
        pendingVideoIdRef.current = null;
        const p = playerRef.current;
        playerRef.current = null;
        if (p) {
          try {
            p.mute?.();
            p.pauseVideo?.();
            p.destroy?.();
          } catch {
            // ignore cleanup errors
          }
        }
      };
    }, [clearStallTimer]);

    if (allFailed || !activeVideoId) {
      return null;
    }

    return (
      <div
        id="sq-video-viewport"
        data-testid="sq-video-viewport"
        data-youtube-video-id={activeVideoId}
        style={{
          isolation: 'isolate',
          transform: 'translateZ(0)',
        }}
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#060708]"
      >
        <div
          ref={hostRef}
          className="pointer-events-none w-full h-full scale-[1.08]"
        />
        {isMaskingSwitch && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 bg-[#060708]/25 transition-opacity duration-300"
          />
        )}
      </div>
    );
  })
);

ZuneResilientYouTubePlayer.displayName = 'ZuneResilientYouTubePlayer';

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
  hideBoxArt = false,
  onToggleHideBoxArt,
  isDeviceOnlyMode = false,
  onToggleDeviceOnlyMode,
  onTvFullscreenChange,
}) => {
  const doubleTapHideHandlers = useDoubleTapHideArt({
    enabled: !hideBoxArt,
    onHide: onToggleHideBoxArt,
  });
  const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
  const isMobilePortrait = viewportLayout === 'mobile-portrait';
  const isMobileLandscape = viewportLayout === 'mobile-landscape';

  // Invisible Gesture-Only 5-Colorway Hardware Selector (persisted in localStorage)
  const [zuneColorway, setZuneColorway] = useState<ZuneColorwayId>(() => loadSavedZuneColorway());
  const colorwaySpec = useMemo(() => ZUNE_30_COLORWAYS[zuneColorway], [zuneColorway]);
  const [colorwayToastVisible, setColorwayToastVisible] = useState<boolean>(false);
  const [colorwaySpringShiftPx, setColorwaySpringShiftPx] = useState<number>(0);
  const colorwayToastTimerRef = useRef<number | null>(null);
  const colorwaySpringTimerRef = useRef<number | null>(null);
  const chassisSwipeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const chassisSwipeSuppressClickRef = useRef<boolean>(false);

  const triggerChassisColorwayStep = useCallback(
    (direction: 'next' | 'prev') => {
      retroAudio.triggerSquircleThip(false);
      triggerButtonHaptic(lowPowerMode);
      setZuneColorway((prev) => {
        const next = stepZuneColorway(prev, direction);
        saveZuneColorway(next);
        return next;
      });
      if (!prefersReducedMotion && !lowPowerMode) {
        setColorwaySpringShiftPx(direction === 'next' ? -6 : 6);
        if (colorwaySpringTimerRef.current !== null) {
          window.clearTimeout(colorwaySpringTimerRef.current);
        }
        colorwaySpringTimerRef.current = window.setTimeout(() => {
          setColorwaySpringShiftPx(0);
          colorwaySpringTimerRef.current = null;
        }, 120);
      }
      setColorwayToastVisible(true);
      if (colorwayToastTimerRef.current !== null) {
        window.clearTimeout(colorwayToastTimerRef.current);
      }
      colorwayToastTimerRef.current = window.setTimeout(() => {
        setColorwayToastVisible(false);
        colorwayToastTimerRef.current = null;
      }, 900);
    },
    [lowPowerMode, prefersReducedMotion]
  );

  useEffect(() => {
    return () => {
      if (colorwayToastTimerRef.current !== null) window.clearTimeout(colorwayToastTimerRef.current);
      if (colorwaySpringTimerRef.current !== null) window.clearTimeout(colorwaySpringTimerRef.current);
    };
  }, []);

  const handleChassisPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('#sq-screen, input, [role="slider"]')) return;
    chassisSwipeRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
  };

  const handleChassisPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = chassisSwipeRef.current;
    chassisSwipeRef.current = null;
    if (!start || start.pointerId !== e.pointerId) return;
    const dx = e.clientX - start.startX;
    const dy = e.clientY - start.startY;
    const dir = evaluateZuneColorSwipeGesture(dx, dy);
    if (dir) {
      e.stopPropagation();
      chassisSwipeSuppressClickRef.current = true;
      window.setTimeout(() => {
        chassisSwipeSuppressClickRef.current = false;
      }, 80);
      triggerChassisColorwayStep(dir);
    }
  };

  const handleChassisPointerCancel = () => {
    chassisSwipeRef.current = null;
  };

  const handleChassisClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (chassisSwipeSuppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

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

  const { elapsed: elapsedDisplay, total: totalDisplay } = useMemo(
    () => formatSquircleOversizedTime(currentTimeSec, safeDuration),
    [currentTimeSec, safeDuration]
  );

  // Whenever a song is loaded/playing, default to authentic Zune 30 Now Playing album-art screen
  const [activeScreen, setActiveScreen] = useState<ZuneOsScreenId>(() =>
    !isStandby ? 'now-playing' : 'home'
  );
  const [isPortraitVideoCollapsed, setIsPortraitVideoCollapsed] = useState<boolean>(false);
  const ytPlayerRef = useRef<ZuneResilientYouTubePlayerHandle | null>(null);

  // Translucent Zune Volume Overlay Strip (auto-fades after 1.6s)
  const [volumeOverlayVisible, setVolumeOverlayVisible] = useState<boolean>(false);
  const volumeOverlayTimerRef = useRef<number | null>(null);
  const triggerVolumeOverlay = useCallback(() => {
    setVolumeOverlayVisible(true);
    if (volumeOverlayTimerRef.current !== null) {
      window.clearTimeout(volumeOverlayTimerRef.current);
    }
    volumeOverlayTimerRef.current = window.setTimeout(() => {
      setVolumeOverlayVisible(false);
      volumeOverlayTimerRef.current = null;
    }, 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (volumeOverlayTimerRef.current !== null) {
        window.clearTimeout(volumeOverlayTimerRef.current);
        volumeOverlayTimerRef.current = null;
      }
    };
  }, []);

  // Persistent Zune Heart Favorites
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<string[]>(() =>
    loadSavedZuneFavorites()
  );
  const isCurrentTrackFavorited = favoriteTrackIds.includes(track.id);
  const handleToggleFavorite = useCallback(() => {
    if (isStandby) return;
    retroAudio.triggerSquircleThip(true);
    triggerButtonHaptic(lowPowerMode);
    setFavoriteTrackIds((prev) => toggleZuneFavoriteTrackId(prev, track.id));
  }, [isStandby, lowPowerMode, track.id]);

  // Focused row state for Menu (7 items: music..settings) & Built-In Zune OS Playlist
  const [focusedMenuIndex, setFocusedMenuIndex] = useState<number>(0);
  const [focusedTrackIndex, setFocusedTrackIndex] = useState<number>(() => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    return idx >= 0 ? idx : 0;
  });

  // Auto-switch to Now Playing when playback begins from playlist view
  const prevIsPlayingRef = useRef<boolean>(isPlaying);
  useEffect(() => {
    if (isPlaying && !prevIsPlayingRef.current && !isStandby && activeScreen === 'playlist') {
      setActiveScreen('now-playing');
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, isStandby, activeScreen]);

  // Sync focusedTrackIndex & directional slide hint when active track changes
  const [trackSkipDirection, setTrackSkipDirection] = useState<'next' | 'prev'>('next');
  const prevFocusedTrackIdxRef = useRef<number>(focusedTrackIndex);
  useEffect(() => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      if (idx !== prevFocusedTrackIdxRef.current) {
        setTrackSkipDirection(idx < prevFocusedTrackIdxRef.current ? 'prev' : 'next');
        prevFocusedTrackIdxRef.current = idx;
      }
      setFocusedTrackIndex(idx);
    } else if (focusedTrackIndex >= tracks.length) {
      setFocusedTrackIndex(Math.max(0, tracks.length - 1));
    }
  }, [track.id, tracks, focusedTrackIndex]);

  // Subtle one-time warm solid-state chime on mount when tracks are present
  const mountCuePlayedRef = useRef(false);
  useEffect(() => {
    if (!mountCuePlayedRef.current && !isStandby) {
      mountCuePlayedRef.current = true;
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

  // Sub-1-second track-change choreography
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

  // Synchronized YouTube Video Resolution, Candidate Queue & Fullscreen Takeover
  const [mediaViewMode, setMediaViewMode] = useState<'video' | 'artwork'>('video');
  const [resolvedVideoId, setResolvedVideoId] = useState<string>(track.youtubeVideoId || '');
  const [alternateVideoIds, setAlternateVideoIds] = useState<string[]>([]);
  const [liveTvFrames, setLiveTvFrames] = useState<YouTubeGrabFrame[]>(track.tvFrames || []);
  const [iframeUnavailable, setIframeUnavailable] = useState<boolean>(false);

  // Fullscreen Takeover Portal state (double-click / double-tap with Spotify-to-YouTube audio handoff)
  const [isVideoFullscreen, setIsVideoFullscreen] = useState<boolean>(false);
  const [fsControlsVisible, setFsControlsVisible] = useState<boolean>(true);
  const fsOverlayRef = useRef<HTMLDivElement | null>(null);
  const fsIframeRef = useRef<HTMLIFrameElement | null>(null);
  const fsHideTimerRef = useRef<number | null>(null);
  const lastVideoTapMsRef = useRef<number>(0);

  const videoCacheRef = useRef<
    Map<string, { videoId: string; alternates: string[]; frames: YouTubeGrabFrame[] }>
  >(new Map());
  const trackIdRef = useRef<string>(track.id);
  trackIdRef.current = track.id;

  useEffect(() => {
    setIframeUnavailable(false);
    const cached = videoCacheRef.current.get(track.id);
    if (cached) {
      setResolvedVideoId(cached.videoId);
      setAlternateVideoIds(cached.alternates);
      setLiveTvFrames(cached.frames);
      return;
    }

    setResolvedVideoId(track.youtubeVideoId || '');
    setAlternateVideoIds([]);
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
          const channelIds = (data.channels ?? [])
            .map((ch) => ch.videoId)
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
          const nextVideoId =
            channelIds[0] || data.videoId || track.youtubeVideoId || '';
          const nextAlternates = channelIds.filter((id) => id !== nextVideoId);
          const nextFrames =
            data.channels?.[0]?.frames && data.channels[0].frames.length > 0
              ? data.channels[0].frames
              : Array.isArray(data.frames) && data.frames.length > 0
                ? data.frames
                : Array.isArray(track.tvFrames)
                  ? track.tvFrames
                  : [];

          if (nextVideoId || nextFrames.length > 0 || nextAlternates.length > 0) {
            videoCacheRef.current.set(targetTrackId, {
              videoId: nextVideoId,
              alternates: nextAlternates,
              frames: nextFrames,
            });
            setResolvedVideoId(nextVideoId);
            setAlternateVideoIds(nextAlternates);
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
  }, [
    track.id,
    track.title,
    track.artist,
    track.youtubeVideoId,
    track.artworkUrl,
    track.tvFrames,
    isStandby,
    onResolvedTrackMetadata,
  ]);

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

  const resetFsControlsTimer = useCallback(() => {
    setFsControlsVisible(true);
    if (fsHideTimerRef.current !== null) {
      window.clearTimeout(fsHideTimerRef.current);
    }
    fsHideTimerRef.current = window.setTimeout(() => {
      setFsControlsVisible(false);
      fsHideTimerRef.current = null;
    }, 2500);
  }, []);

  const exitVideoFullscreen = useCallback(() => {
    if (fsHideTimerRef.current !== null) {
      window.clearTimeout(fsHideTimerRef.current);
      fsHideTimerRef.current = null;
    }
    try {
      const fsWin = fsIframeRef.current?.contentWindow;
      if (fsWin) {
        fsWin.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: '' }), '*');
        fsWin.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }), '*');
        fsWin.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*');
      }
    } catch {
      // ignore iframe errors
    }

    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }

    setIsVideoFullscreen((wasFs) => {
      if (wasFs) {
        onTvFullscreenChange?.(false);
      }
      return false;
    });
  }, [onTvFullscreenChange]);

  const enterVideoFullscreen = useCallback(() => {
    if (isStandby || !activeVideoId || iframeUnavailable || mediaViewMode !== 'video') return;
    retroAudio.triggerSquircleThip(true);
    triggerButtonHaptic(lowPowerMode);
    setIsVideoFullscreen(true);
    onTvFullscreenChange?.(true);
    resetFsControlsTimer();
    window.requestAnimationFrame(() => {
      const overlayEl = fsOverlayRef.current;
      if (overlayEl && typeof overlayEl.requestFullscreen === 'function') {
        overlayEl.requestFullscreen().catch(() => {
          // iOS fixed overlay fallback remains active
        });
      }
    });
  }, [
    isStandby,
    activeVideoId,
    iframeUnavailable,
    mediaViewMode,
    lowPowerMode,
    onTvFullscreenChange,
    resetFsControlsTimer,
  ]);

  useEffect(() => {
    if (!isVideoFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitVideoFullscreen();
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        exitVideoFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [isVideoFullscreen, exitVideoFullscreen]);

  useEffect(() => {
    if (isDeviceOnlyMode && isVideoFullscreen) {
      exitVideoFullscreen();
    }
  }, [isDeviceOnlyMode, isVideoFullscreen, exitVideoFullscreen]);

  useEffect(() => {
    return () => {
      if (fsHideTimerRef.current !== null) {
        window.clearTimeout(fsHideTimerRef.current);
      }
    };
  }, []);

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

  // Zune LCD Now Playing Phase 1 (12s Album Art Ken Burns) -> Phase 2 (Validated YouTube Screen-Grab Slideshow)
  const [validatedYoutubeGrabs, setValidatedYoutubeGrabs] = useState<string[]>([]);
  const [lcdMediaPhase, setLcdMediaPhase] = useState<'art' | 'slideshow'>('art');
  const [lcdSlideCursor, setLcdSlideCursor] = useState<number>(0);
  const [lcdCrossfadeSlots, setLcdCrossfadeSlots] = useState<[string, string]>(['', '']);
  const [lcdActiveSlot, setLcdActiveSlot] = useState<0 | 1>(0);

  useEffect(() => {
    setLcdMediaPhase('art');
    setLcdSlideCursor(0);
    setValidatedYoutubeGrabs([]);
    setLcdCrossfadeSlots(['', '']);
    setLcdActiveSlot(0);

    if (isStandby || !activeVideoId) return;
    const candidates = buildZuneYoutubeScreenGrabCandidates(activeVideoId);
    if (candidates.length === 0) return;

    let cancelled = false;
    const preloaders: HTMLImageElement[] = [];
    const results: Array<string | null> = new Array(candidates.length).fill(null);
    let settledCount = 0;

    const flushValidated = () => {
      if (cancelled) return;
      const valid = results.filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (valid.length > 0) {
        setValidatedYoutubeGrabs(valid);
      }
    };

    candidates.forEach((url, idx) => {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (cancelled) return;
        if (img.naturalWidth > 120) {
          results[idx] = url;
          flushValidated();
        }
        settledCount += 1;
        if (settledCount === candidates.length) {
          flushValidated();
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        settledCount += 1;
      };
      img.src = url;
      preloaders.push(img);
    });

    return () => {
      cancelled = true;
      for (const img of preloaders) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [track.id, activeVideoId, isStandby]);

  useEffect(() => {
    if (
      isStandby ||
      !isPlaying ||
      isDocumentHidden ||
      lcdMediaPhase !== 'art' ||
      validatedYoutubeGrabs.length === 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLcdSlideCursor(0);
      setLcdCrossfadeSlots([validatedYoutubeGrabs[0], '']);
      setLcdActiveSlot(0);
      setLcdMediaPhase('slideshow');
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [isStandby, isPlaying, isDocumentHidden, lcdMediaPhase, validatedYoutubeGrabs]);

  useEffect(() => {
    if (
      isStandby ||
      !isPlaying ||
      isDocumentHidden ||
      lcdMediaPhase !== 'slideshow' ||
      validatedYoutubeGrabs.length <= 1
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      setLcdSlideCursor((prev) => {
        const nextIdx = (prev + 1) % validatedYoutubeGrabs.length;
        const nextUrl = validatedYoutubeGrabs[nextIdx];
        if (nextUrl) {
          setLcdActiveSlot((curSlot) => {
            const nextSlot: 0 | 1 = curSlot === 0 ? 1 : 0;
            setLcdCrossfadeSlots((slots) => {
              const updated: [string, string] = [...slots] as [string, string];
              updated[nextSlot] = nextUrl;
              return updated;
            });
            return nextSlot;
          });
        }
        return nextIdx;
      });
    }, 6500);
    return () => window.clearInterval(interval);
  }, [isStandby, isPlaying, isDocumentHidden, lcdMediaPhase, validatedYoutubeGrabs]);

  // Measure stage dimensions
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== 'undefined') {
      return {
        width: Math.max(240, window.innerWidth),
        height: Math.max(240, window.innerHeight),
      };
    }
    return {
      width: isMobilePortrait ? 390 : 1280,
      height: isMobilePortrait ? 844 : 800,
    };
  });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setStageDims({
        width: Math.max(240, Math.round(rect.width)),
        height: Math.max(240, Math.round(rect.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutMetrics = useMemo(
    () =>
      computeSquircleStageLayout(
        stageDims.width,
        stageDims.height,
        isMobilePortrait,
        isMobileLandscape,
        isPortraitVideoCollapsed
      ),
    [stageDims.width, stageDims.height, isMobilePortrait, isMobileLandscape, isPortraitVideoCollapsed]
  );

  // Navigate inside Zune OS screens
  const navigateToScreen = useCallback(
    (nextScreen: ZuneOsScreenId) => {
      if (nextScreen === activeScreen) return;
      retroAudio.triggerSquircleThip(false);
      triggerButtonHaptic(lowPowerMode);
      setActiveScreen(nextScreen);
    },
    [activeScreen, lowPowerMode]
  );

  const handleBackPress = useCallback(() => {
    retroAudio.triggerSquircleThip(false);
    triggerButtonHaptic(lowPowerMode);
    const target = getZuneLeftButtonTarget(activeScreen, isStandby);
    setActiveScreen(target);
  }, [activeScreen, isStandby, lowPowerMode]);

  // Touch swipe left/right inside Zune LCD screen
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
    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      e.stopPropagation();
      const curIdx = ZUNE_OS_SCREEN_ORDER.indexOf(activeScreen);
      const safeIdx = curIdx >= 0 ? curIdx : 0;
      const nextIdx =
        dx < 0
          ? Math.min(ZUNE_OS_SCREEN_ORDER.length - 1, safeIdx + 1)
          : Math.max(0, safeIdx - 1);
      navigateToScreen(ZUNE_OS_SCREEN_ORDER[nextIdx]);
    }
  };

  // Built-In Zune LCD Playlist Scrolling & Scroll Indicator
  const lcdPlaylistScrollRef = useRef<HTMLDivElement | null>(null);
  const [lcdScrollIndicator, setLcdScrollIndicator] = useState<{
    visible: boolean;
    thumbHeightPct: number;
    thumbTopPct: number;
  }>({ visible: false, thumbHeightPct: 100, thumbTopPct: 0 });

  const updateLcdScrollIndicator = useCallback(() => {
    const el = lcdPlaylistScrollRef.current;
    if (!el) return;
    setLcdScrollIndicator(
      computeZuneScrollIndicatorMetrics(el.scrollTop, el.scrollHeight, el.clientHeight)
    );
  }, []);

  useLayoutEffect(() => {
    updateLcdScrollIndicator();
  }, [tracks.length, activeScreen, layoutMetrics.chassisH, updateLcdScrollIndicator]);

  useEffect(() => {
    if (activeScreen !== 'playlist') return;
    const container = lcdPlaylistScrollRef.current;
    if (!container) return;
    const focusedBtn = container.querySelector<HTMLElement>(
      `[data-lcd-track-index="${focusedTrackIndex}"]`
    );
    if (focusedBtn) {
      const cTop = container.scrollTop;
      const cBottom = cTop + container.clientHeight;
      const elTop = focusedBtn.offsetTop;
      const elBottom = elTop + focusedBtn.offsetHeight;
      if (elTop < cTop + 6) {
        container.scrollTo({ top: Math.max(0, elTop - 6), behavior: 'smooth' });
      } else if (elBottom > cBottom - 6) {
        container.scrollTo({
          top: Math.max(0, elBottom - container.clientHeight + 6),
          behavior: 'smooth',
        });
      }
    }
    updateLcdScrollIndicator();
  }, [focusedTrackIndex, activeScreen, updateLcdScrollIndicator]);

  // Tactile 3D D-Pad Press Physics State (1.5deg tilt or center depress)
  const [dpadPressedZone, setDpadPressedZone] = useState<ZuneDpadZone>(null);
  const dpadTilt = useMemo(() => getZuneDpadTiltTransform(dpadPressedZone), [dpadPressedZone]);

  // Long-press D-pad LEFT -> Stutter-Rewind; short tap LEFT -> Previous track
  const [stutterActive, setStutterActive] = useState(false);
  const leftLongPressTimerRef = useRef<number | null>(null);
  const leftLongPressTriggeredRef = useRef<boolean>(false);
  const stutterTimerRef = useRef<number | null>(null);

  // Hold-to-accelerate D-pad UP / DOWN navigation timers
  const holdScrollTimeoutRef = useRef<number | null>(null);
  const holdScrollIntervalRef = useRef<number | null>(null);

  const clearLeftTimer = useCallback(() => {
    if (leftLongPressTimerRef.current !== null) {
      window.clearTimeout(leftLongPressTimerRef.current);
      leftLongPressTimerRef.current = null;
    }
  }, []);

  const clearHoldVerticalTimers = useCallback(() => {
    if (holdScrollTimeoutRef.current !== null) {
      window.clearTimeout(holdScrollTimeoutRef.current);
      holdScrollTimeoutRef.current = null;
    }
    if (holdScrollIntervalRef.current !== null) {
      window.clearInterval(holdScrollIntervalRef.current);
      holdScrollIntervalRef.current = null;
    }
  }, []);

  // Strict Theme Unmount Teardown
  useEffect(
    () => () => {
      clearLeftTimer();
      clearHoldVerticalTimers();
      if (stutterTimerRef.current !== null) {
        window.clearTimeout(stutterTimerRef.current);
        stutterTimerRef.current = null;
      }
    },
    [clearLeftTimer, clearHoldVerticalTimers]
  );

  const handleDpadLeftPointerDown = () => {
    setDpadPressedZone('left');
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
    setDpadPressedZone(null);
    clearLeftTimer();
  };

  const handleDpadLeftClick = () => {
    if (leftLongPressTriggeredRef.current) {
      leftLongPressTriggeredRef.current = false;
      return;
    }
    triggerButtonHaptic(lowPowerMode);
    retroAudio.triggerSquircleThip(false);
    setTrackSkipDirection('prev');
    onPrevious();
  };

  // D-Pad UP / DOWN step logic
  const stepVerticalDpadAction = useCallback(
    (dir: 'up' | 'down') => {
      triggerButtonHaptic(lowPowerMode);
      retroAudio.triggerSquircleThip(false);
      if (activeScreen === 'playlist') {
        setFocusedTrackIndex((prev) => stepZuneListFocusIndex(prev, tracks.length, dir));
        return;
      }
      if (activeScreen === 'home') {
        setFocusedMenuIndex((prev) =>
          stepZuneListFocusIndex(prev, SQUIRCLE_HOME_MENU_ITEMS.length, dir)
        );
        return;
      }
      onChangeVolume(calculateSquircleVolumeStep(volume, dir));
      triggerVolumeOverlay();
    },
    [activeScreen, tracks.length, volume, lowPowerMode, onChangeVolume, triggerVolumeOverlay]
  );

  const stepVerticalRef = useRef(stepVerticalDpadAction);
  stepVerticalRef.current = stepVerticalDpadAction;
  const holdDidRepeatRef = useRef(false);

  const handleDpadVerticalPointerDown = (dir: 'up' | 'down') => {
    setDpadPressedZone(dir);
    clearHoldVerticalTimers();
    holdDidRepeatRef.current = false;
    holdScrollTimeoutRef.current = window.setTimeout(() => {
      holdDidRepeatRef.current = true;
      stepVerticalRef.current(dir);
      holdScrollIntervalRef.current = window.setInterval(() => {
        stepVerticalRef.current(dir);
      }, 95);
    }, 320);
  };

  const handleDpadVerticalPointerEnd = () => {
    setDpadPressedZone(null);
    clearHoldVerticalTimers();
  };

  const handleDpadVerticalClick = (dir: 'up' | 'down') => {
    if (holdDidRepeatRef.current) {
      holdDidRepeatRef.current = false;
      return;
    }
    stepVerticalDpadAction(dir);
  };

  // Activate a home menu entry from the 7-item Zune Twist list
  const activateHomeMenuItem = useCallback(
    (menuId: string) => {
      retroAudio.triggerSquircleThip(true);
      triggerButtonHaptic(lowPowerMode);
      if (menuId === 'music' || menuId === 'marketplace') {
        navigateToScreen('playlist');
      } else if (menuId === 'videos') {
        setMediaViewMode('video');
        if (isMobilePortrait) {
          setIsPortraitVideoCollapsed((prev) => !prev);
        } else {
          navigateToScreen('now-playing');
        }
      } else if (menuId === 'pictures') {
        setMediaViewMode('artwork');
        navigateToScreen('now-playing');
      } else if (menuId === 'radio' || menuId === 'social') {
        navigateToScreen('lyrics');
      } else if (menuId === 'settings') {
        navigateToScreen('settings');
      }
    },
    [isMobilePortrait, lowPowerMode, navigateToScreen]
  );

  // Center Matte-Black Select Button handler
  const handleDpadCenterSelect = useCallback(() => {
    triggerButtonHaptic(lowPowerMode);
    retroAudio.triggerSquircleThip(true);

    if (activeScreen === 'playlist') {
      if (tracks.length === 0) {
        onOpenSpotifyModal();
        return;
      }
      const chosenTrack = tracks[focusedTrackIndex] || tracks[0];
      if (chosenTrack) {
        onSelectTrack?.(chosenTrack.id);
        ytPlayerRef.current?.triggerUserGesturePlay();
        setActiveScreen('now-playing');
      }
      return;
    }

    if (activeScreen === 'home') {
      const item =
        SQUIRCLE_HOME_MENU_ITEMS[focusedMenuIndex] || SQUIRCLE_HOME_MENU_ITEMS[0];
      if (item) {
        activateHomeMenuItem(item.id);
      }
      return;
    }

    if (!isPlaying) {
      ytPlayerRef.current?.triggerUserGesturePlay();
    }
    onTogglePlay();
  }, [
    activeScreen,
    tracks,
    focusedTrackIndex,
    focusedMenuIndex,
    lowPowerMode,
    isPlaying,
    onOpenSpotifyModal,
    onSelectTrack,
    activateHomeMenuItem,
    onTogglePlay,
  ]);

  // Progress bar scrub on Now Playing screen
  const handleProgressBarScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isStandby || safeDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const targetSec = ratio * safeDuration;
    retroAudio.triggerSquircleThip(false);
    onSeek(targetSec);
  };

  const screenTranslatePct = getZuneOsScreenTranslatePct(activeScreen);

  const handleExternalVideoPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('#sq-toggle-video-art')) return;
    if (!videoDisplayState.showVideoIframe) {
      doubleTapHideHandlers.onPointerUpCapture(e);
      return;
    }
    if (e.pointerType === 'mouse') return;
    const now = Date.now();
    if (now - lastVideoTapMsRef.current <= 300) {
      lastVideoTapMsRef.current = 0;
      enterVideoFullscreen();
    } else {
      lastVideoTapMsRef.current = now;
    }
  };

  const externalVideoModule = (
    <div
      className={
        isMobilePortrait
          ? 'zune-mobile-video-screen flex justify-center'
          : 'sq-external-video-wrap'
      }
      style={
        isMobilePortrait
          ? undefined
          : isMobileLandscape
          ? {
              height: `${layoutMetrics.videoMaxHeightPx}px`,
              aspectRatio: '16 / 9',
              maxWidth: '100%',
            }
          : {
              width: '100%',
              maxWidth: `${layoutMetrics.videoMaxWidthPx}px`,
              aspectRatio: '16 / 9',
            }
      }
    >
      <div
        id="sq-external-video-display"
        data-testid="sq-external-video-display"
        data-video-active={videoDisplayState.showVideoIframe ? 'true' : 'false'}
        onPointerDownCapture={(e) => {
          if (!videoDisplayState.showVideoIframe) {
            doubleTapHideHandlers.onPointerDownCapture(e);
          }
        }}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (target && target.closest('#sq-toggle-video-art')) return;
          if (!videoDisplayState.showVideoIframe) {
            doubleTapHideHandlers.onDoubleClick(e);
            return;
          }
          enterVideoFullscreen();
        }}
        onPointerUp={handleExternalVideoPointerUp}
        title={
          videoDisplayState.showVideoIframe
            ? 'Double-click or double-tap for fullscreen video'
            : 'Double-click or double-tap to hide album art'
        }
        className="sq-external-video-frame relative w-full h-full p-[5px] sm:p-[6px] flex flex-col items-center justify-between overflow-hidden cursor-pointer"
        style={{
          borderRadius: isMobilePortrait ? '16px' : isMobileLandscape ? '18px' : '20px',
        }}
      >
        {/* Crisp 1px Specular Inner Rim Highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[5px] rounded-[13px] border border-white/[0.14] z-20"
        />

        {/* Inner 16:9 Video Glass Window (Compositor-Isolated from backdrop mask) */}
        <div
          style={{
            isolation: 'isolate',
            transform: 'translateZ(0)',
          }}
          className="relative w-full flex-1 min-h-0 rounded-[12px] overflow-hidden bg-[#060708] shadow-[inset_0_2px_8px_rgba(0,0,0,0.92)]"
        >
          {/* Validated YouTube Screen-Grab Slideshow Backdrop (Active Behind Buffering Video, in Art View, or on YT Error) */}
          <div
            aria-hidden={hideBoxArt && !videoDisplayState.showVideoIframe ? 'true' : undefined}
            style={{
              opacity: hideBoxArt && !videoDisplayState.showVideoIframe ? 0 : 1,
              transform: hideBoxArt && !videoDisplayState.showVideoIframe ? 'scale(0.94)' : 'scale(1)',
              transition: prefersReducedMotion
                ? 'none'
                : 'opacity 220ms ease, transform 220ms ease',
            }}
            className="pointer-events-none absolute inset-0 overflow-hidden z-0"
          >
            {validatedYoutubeGrabs.length > 0 ? (
              <>
                {(lcdCrossfadeSlots[0] || validatedYoutubeGrabs[0]) && (
                  <img
                    src={lcdCrossfadeSlots[0] || validatedYoutubeGrabs[0]}
                    alt=""
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="sq-ext-grab-zoom absolute inset-0 w-full h-full object-cover block"
                    style={{
                      opacity:
                        validatedYoutubeGrabs.length === 1 ||
                        lcdMediaPhase === 'art' ||
                        lcdActiveSlot === 0
                          ? 1
                          : 0,
                      transition:
                        prefersReducedMotion || lowPowerMode
                          ? 'none'
                          : 'opacity 1400ms ease-in-out',
                      animationPlayState:
                        activeLoopsEnabled && !isStandby ? 'running' : 'paused',
                    }}
                  />
                )}
                {lcdCrossfadeSlots[1] && (
                  <img
                    src={lcdCrossfadeSlots[1]}
                    alt=""
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="sq-ext-grab-zoom absolute inset-0 w-full h-full object-cover block"
                    style={{
                      opacity: lcdMediaPhase === 'slideshow' && lcdActiveSlot === 1 ? 1 : 0,
                      transition:
                        prefersReducedMotion || lowPowerMode
                          ? 'none'
                          : 'opacity 1400ms ease-in-out',
                      animationPlayState:
                        activeLoopsEnabled && !isStandby ? 'running' : 'paused',
                    }}
                  />
                )}
              </>
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
                      referrerPolicy="no-referrer"
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
                      referrerPolicy="no-referrer"
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
          </div>

          {/* Persistent Live YouTube Player Mounted Above Backdrop Slideshow */}
          {videoDisplayState.showVideoIframe && activeVideoId && (
            <ZuneResilientYouTubePlayer
              ref={ytPlayerRef}
              primaryVideoId={activeVideoId}
              alternateVideoIds={alternateVideoIds}
              isPlaying={Boolean(isPlaying && !isDocumentHidden && !isVideoFullscreen)}
              trackKey={track.id}
              seekEvent={seekEvent}
              onAllCandidatesFailed={() => setIframeUnavailable(true)}
            />
          )}

          {/* Compact Video / Art Toggle Button */}
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
              className="sq-pressable absolute top-1.5 right-1.5 z-30 px-2 py-0.5 rounded-[4px] bg-black/75 border border-white/20 text-[8px] font-bold lowercase text-white/90 hover:text-white cursor-pointer"
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

        {/* Miniature Bottom Status LED Pip */}
        <span
          aria-hidden="true"
          className={`mt-[3px] w-[4px] h-[4px] rounded-full shrink-0 ${
            isPlaying ? 'bg-[#E6007E] shadow-[0_0_5px_#E6007E]' : 'bg-white/25'
          }`}
        />
      </div>
    </div>
  );

  const zuneChassisHardware = (
    <div
      onClick={(e) => {
        if (isDeviceOnlyMode) {
          e.stopPropagation();
        }
      }}
      className={
        isMobilePortrait && !isDeviceOnlyMode
          ? 'zune-mobile-portrait-device flex flex-col items-center shrink-0'
          : 'relative flex flex-col items-center shrink-0'
      }
      style={{ overflow: 'visible' }}
    >
      {/* PART 2.2: Top-of-Zune Focus Button Directly Above Top Rim */}
      {!isDeviceOnlyMode && onToggleDeviceOnlyMode && (
        <button
          id="sq-device-only-btn"
          type="button"
          aria-label="Enter Device-Only Pure Focus Mode"
          title="Device-Only Focus Mode"
          onClick={(e) => {
            e.stopPropagation();
            retroAudio.triggerSquircleThip(false);
            triggerButtonHaptic(lowPowerMode);
            onToggleDeviceOnlyMode();
          }}
          style={{
            background: 'rgba(36, 32, 30, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            marginBottom: '8px',
            zIndex: 30,
          }}
          className="sq-pressable relative px-2.5 py-1 rounded-full text-[10.5px] font-medium lowercase tracking-[0.03em] text-white/85 hover:text-white hover:border-white/30 inline-flex items-center gap-1.5 cursor-pointer backdrop-blur-sm shrink-0"
        >
          <Smartphone className="w-3 h-3 text-white/80" />
          <span>focus</span>
        </button>
      )}

      <div
        id="sq-player-chassis"
        data-active-screen={activeScreen}
        data-stutter-active={stutterActive ? 'true' : 'false'}
        data-hardware-finish="double-shot-olive-chocolate-zune30"
        data-zune-colorway={zuneColorway}
        data-no-drawer-swipe="true"
        onPointerDown={handleChassisPointerDown}
        onPointerUp={handleChassisPointerUp}
        onPointerCancel={handleChassisPointerCancel}
        onClickCapture={handleChassisClickCapture}
        className={`sq-player-chassis relative shrink-0 overflow-hidden ${
          isDeviceOnlyMode ? 'sq-device-only-chassis' : ''
        }`}
        style={
          isDeviceOnlyMode
            ? {
                height: 'min(84dvh, 700px, calc((100vw - 32px) / 0.545))',
                maxWidth: 'calc(100vw - 32px)',
                width: 'auto',
                aspectRatio: `${ZUNE_CHASSIS_ASPECT_RATIO} / 1`,
                containerType: 'size',
                padding: '2px',
                touchAction: 'pan-y',
                backgroundColor: colorwaySpec.outerShellBg,
                backgroundImage: colorwaySpec.outerShellGradient,
                boxShadow: colorwaySpec.outerShellShadow,
                transform:
                  colorwaySpringShiftPx !== 0
                    ? `translate3d(${colorwaySpringShiftPx}px, 0, 0)`
                    : undefined,
              }
            : isMobilePortrait
            ? {
                width: '100%',
                height: 'auto',
                aspectRatio: `${ZUNE_CHASSIS_ASPECT_RATIO} / 1`,
                containerType: 'size',
                padding: '2px',
                touchAction: 'pan-y',
                backgroundColor: colorwaySpec.outerShellBg,
                backgroundImage: colorwaySpec.outerShellGradient,
                boxShadow: colorwaySpec.outerShellShadow,
                transform:
                  colorwaySpringShiftPx !== 0
                    ? `translate3d(${colorwaySpringShiftPx}px, 0, 0)`
                    : undefined,
              }
            : {
                height: isMobileLandscape
                  ? 'min(calc(100dvh - 82px), calc(36vw / 0.545))'
                  : 'calc(100dvh - 108px)',
                maxHeight: isMobileLandscape
                  ? '100%'
                  : `${Math.max(300, layoutMetrics.chassisH - 56)}px`,
                maxWidth: isMobileLandscape ? '36vw' : undefined,
                width: 'auto',
                aspectRatio: `${ZUNE_CHASSIS_ASPECT_RATIO} / 1`,
                alignSelf: 'center',
                zIndex: 30,
                containerType: 'size',
                padding: '2px',
                touchAction: 'pan-y',
                backgroundColor: colorwaySpec.outerShellBg,
                backgroundImage: colorwaySpec.outerShellGradient,
                boxShadow: colorwaySpec.outerShellShadow,
                transform:
                  colorwaySpringShiftPx !== 0
                    ? `translate3d(${colorwaySpringShiftPx}px, 0, 0)`
                    : undefined,
              }
        }
      >
        {/* 2. Soft-Touch Matte Inner Core With Bead-Blasted Micro-Grain */}
        <div
          className="sq-chocolate-core relative w-full h-full overflow-hidden"
          style={{
            backgroundColor: colorwaySpec.coreBg,
            backgroundImage: colorwaySpec.coreGradient,
            boxShadow: colorwaySpec.coreShadow,
          }}
        >
          <div
            aria-hidden="true"
            className="sq-chocolate-grain pointer-events-none absolute inset-0"
          />
        </div>

        {/* 3. SINGLE SEAMLESS UNIFIED DARK-CHARCOAL KEYHOLE BEZEL SVG (Screen Frame + Concave Bridge + D-Pad Collar) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 1835"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 w-full h-full z-10"
        >
          <defs>
            <linearGradient id="sqKeyholeCharcoalGrad" x1="15%" y1="5%" x2="85%" y2="95%">
              <stop offset="0%" stopColor={colorwaySpec.keyholeTopHex} />
              <stop offset="55%" stopColor={colorwaySpec.keyholeMidHex} />
              <stop offset="100%" stopColor={colorwaySpec.keyholeBotHex} />
            </linearGradient>
          </defs>

          {/* Outer hairline molding shadow seam against matte body */}
          <path
            d={UNIFIED_KEYHOLE_OUTER_PATH}
            fill="none"
            stroke={colorwaySpec.keyholeSeamStroke}
            strokeWidth="4"
          />

          {/* Single continuous molded dark-charcoal keyhole piece with punched screen & D-pad openings */}
          <path
            d={`${UNIFIED_KEYHOLE_OUTER_PATH} ${KEYHOLE_SCREEN_CUTOUT_PATH} ${KEYHOLE_DPAD_CUTOUT_PATH}`}
            fill="url(#sqKeyholeCharcoalGrad)"
            fillRule="evenodd"
          />

          {/* Subtle outer charcoal top-edge micro-bevel glint */}
          <path
            d={UNIFIED_KEYHOLE_OUTER_PATH}
            fill="none"
            stroke={colorwaySpec.keyholeGlintStroke}
            strokeWidth="1.5"
          />

          {/* Razor-thin 1px chamfered inner highlight around D-pad circular collar (upper-right & lower-left arcs) */}
          <path
            d="M 555 1207 A 220 220 0 0 1 713 1365"
            fill="none"
            stroke="rgba(255, 255, 255, 0.32)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M 445 1633 A 220 220 0 0 1 287 1475"
            fill="none"
            stroke="rgba(255, 255, 255, 0.32)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

      {/* Recessed Stepped Glossy-Black Inner LCD Lip + Portrait Zune OS Screen (#sq-screen) */}
      <div
        id="sq-recessed-bezel-frame"
        className="absolute z-20 flex flex-col overflow-hidden"
        style={{
          left: '12.2%',
          top: '6.6%',
          width: '75.6%',
          height: '55%',
          padding: '3px',
          borderRadius: '5px',
          backgroundColor: '#0A0B0D',
          boxShadow:
            'inset 1px 1px 0 rgba(255, 255, 255, 0.38), inset -1px 0 0 rgba(255, 255, 255, 0.34), inset 0 -1px 0 rgba(255, 255, 255, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.85)',
        }}
      >
        <div
          id="sq-screen"
          data-no-drawer-swipe="true"
          onPointerDown={handleScreenPointerDown}
          onPointerUp={handleScreenPointerUp}
          className="sq-zune-lcd relative w-full h-full overflow-hidden flex flex-col"
          style={{
            borderRadius: '3px',
            containerType: 'size',
            boxShadow: 'inset 0 1.5px 4px rgba(0, 0, 0, 0.88)',
          }}
        >
          {/* 5-Screen Horizontal Zune OS Slider (#sq-pane-slider) */}
          <div className="relative flex-1 min-h-0 w-full overflow-hidden">
            <div
              id="sq-pane-slider"
              className="sq-pane-slider flex w-full h-full"
              style={{
                transform: `translate3d(-${screenTranslatePct}%, 0, 0)`,
                transition:
                  prefersReducedMotion || lowPowerMode
                    ? 'none'
                    : 'transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)',
              }}
            >
              {/* SCREEN 0: Pixel-Accurate Minimalist Zune Twist Menu (music .. settings, bottom-clipped) */}
              <section
                id="sq-screen-home"
                aria-hidden={activeScreen !== 'home'}
                className="w-full min-w-full h-full overflow-hidden"
              >
                <div
                  id="sq-twist-home-menu"
                  aria-label="Zune OS Menu"
                  className="flex flex-col w-full h-full"
                  style={{
                    paddingLeft: '8%',
                    paddingTop: '11cqh',
                  }}
                >
                  {SQUIRCLE_HOME_MENU_ITEMS.map((menuItem, idx) => {
                    const isFocused = focusedMenuIndex === idx;
                    return (
                      <button
                        key={menuItem.id}
                        type="button"
                        data-twist-menu-item={menuItem.id}
                        data-menu-active={isFocused ? 'true' : 'false'}
                        onClick={() => {
                          setFocusedMenuIndex(idx);
                          activateHomeMenuItem(menuItem.id);
                        }}
                        style={{
                          fontSize: '10.6cqh',
                          lineHeight: 1.18,
                          fontWeight: isFocused ? 400 : 300,
                          color: isFocused ? '#FFFFFF' : '#B2C3D4',
                        }}
                        className="w-full text-left bg-transparent border-0 p-0 lowercase tracking-[-0.02em] cursor-pointer transition-colors hover:text-white shrink-0"
                      >
                        {menuItem.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* SCREEN 1: Built-In Zune OS Pure-Typography Playlist (Focused Pure #FFFFFF, Surrounding #B2C3D4, Zero Boxes) */}
              <section
                id="sq-screen-playlist"
                data-testid="sq-lcd-playlist"
                aria-hidden={activeScreen !== 'playlist'}
                className="relative w-full min-w-full h-full flex flex-col overflow-hidden"
              >
                <div
                  className="shrink-0 flex items-center justify-between pr-[5%] pt-[5.5cqh] pb-[1.5cqh]"
                  style={{ paddingLeft: '8%' }}
                >
                  <button
                    type="button"
                    onClick={() => navigateToScreen('home')}
                    className="bg-transparent border-0 p-0 text-left lowercase text-[#B2C3D4]/75 hover:text-white cursor-pointer truncate max-w-[68%]"
                    style={{ fontSize: '4.8cqh', fontWeight: 300, lineHeight: 1.05 }}
                  >
                    {(playlistName || 'music').toLowerCase()}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSpotifyModal}
                    className="bg-transparent border-0 p-0 lowercase text-[#B2C3D4]/85 hover:text-white cursor-pointer"
                    style={{ fontSize: '4.2cqh', fontWeight: 400 }}
                  >
                    + spotify
                  </button>
                </div>

                {/* Scrollable Vertical Track List */}
                <div className="relative flex-1 min-h-0 flex">
                  <div
                    ref={lcdPlaylistScrollRef}
                    onScroll={updateLcdScrollIndicator}
                    data-no-drawer-swipe="true"
                    className="sq-lcd-scroll-list flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pb-[2cqh]"
                    style={{ paddingLeft: '8%', paddingRight: '10%' }}
                  >
                    {tracks.length === 0 ? (
                      <div className="flex flex-col gap-[1cqh] pt-[2cqh]">
                        <div
                          className="lowercase text-[#B2C3D4]"
                          style={{ fontSize: '7.5cqh', fontWeight: 300, lineHeight: 1.18 }}
                        >
                          no songs
                        </div>
                        <button
                          type="button"
                          onClick={onOpenSpotifyModal}
                          className="w-full text-left bg-transparent border-0 p-0 lowercase text-white cursor-pointer"
                          style={{ fontSize: '8.5cqh', fontWeight: 400, lineHeight: 1.18 }}
                        >
                          connect spotify
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {tracks.map((item, idx) => {
                          const isFocused = idx === focusedTrackIndex;
                          const isActivePlaying = item.id === track.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              data-lcd-track-index={idx}
                              data-lcd-track-focused={isFocused ? 'true' : 'false'}
                              data-lcd-track-playing={isActivePlaying ? 'true' : 'false'}
                              onClick={() => {
                                setFocusedTrackIndex(idx);
                                retroAudio.triggerSquircleThip(true);
                                triggerButtonHaptic(lowPowerMode);
                                onSelectTrack?.(item.id);
                              }}
                              onDoubleClick={() => navigateToScreen('now-playing')}
                              className="w-full text-left bg-transparent border-0 p-0 py-[0.5cqh] flex flex-col cursor-pointer transition-colors"
                            >
                              <span
                                className="lowercase truncate w-full tracking-[-0.02em]"
                                style={{
                                  fontSize: '7.8cqh',
                                  lineHeight: 1.18,
                                  fontWeight: isFocused ? 400 : 300,
                                  color: isFocused ? '#FFFFFF' : '#B2C3D4',
                                }}
                              >
                                {item.title.toLowerCase()}
                              </span>
                              {isFocused && (
                                <span
                                  className="lowercase truncate w-full text-[#B2C3D4]/80"
                                  style={{ fontSize: '4.4cqh', fontWeight: 300, lineHeight: 1.1 }}
                                >
                                  {(item.artist || 'unknown artist').toLowerCase()}
                                  {isActivePlaying && isPlaying ? ' · playing' : ''}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Subtle Razor-Thin Vertical Scroll Indicator Along Far-Right Inner Edge */}
                  {lcdScrollIndicator.visible && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute top-[1cqh] bottom-[15cqh] right-[2.5%] w-[2px] rounded-full bg-white/15 overflow-hidden"
                    >
                      <div
                        className="w-full rounded-full bg-[#B2C3D4]/75"
                        style={{
                          height: `${lcdScrollIndicator.thumbHeightPct}%`,
                          transform: `translateY(${
                            (lcdScrollIndicator.thumbTopPct /
                              Math.max(1, lcdScrollIndicator.thumbHeightPct)) *
                            100
                          }%)`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* SCREEN 2: Authentic Zune 30 "Now Playing" With Full-Bleed Zooming Album Art */}
              <section
                id="sq-pane-now-playing"
                aria-hidden={activeScreen !== 'now-playing'}
                data-lcd-media-phase={lcdMediaPhase}
                data-lcd-slide-index={lcdSlideCursor}
                className="relative w-full min-w-full h-full overflow-hidden flex flex-col bg-[#16191C]"
              >
                {/* Z-1: Full-Bleed Slow-Zooming Album Artwork Across Entire Zune LCD (double-click to hide) */}
                <div
                  id="sq-now-playing-album-art"
                  aria-hidden={hideBoxArt ? 'true' : undefined}
                  onPointerDownCapture={doubleTapHideHandlers.onPointerDownCapture}
                  onPointerUpCapture={doubleTapHideHandlers.onPointerUpCapture}
                  onDoubleClick={doubleTapHideHandlers.onDoubleClick}
                  title="Double-click to hide album art"
                  style={{
                    opacity: hideBoxArt ? 0 : 1,
                    transform: hideBoxArt ? 'scale(0.94)' : 'scale(1)',
                    transition: prefersReducedMotion
                      ? 'none'
                      : 'opacity 220ms ease, transform 220ms ease',
                  }}
                  className={`absolute inset-0 z-[1] overflow-hidden bg-[#16191C] ${
                    hideBoxArt ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
                  }`}
                >
                  {outgoingArtSnap && outgoingArtSnap.url && trackChangePhase === 'entering' && (
                    <img
                      src={outgoingArtSnap.url}
                      alt=""
                      draggable={false}
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover block"
                      style={{
                        transform:
                          trackSkipDirection === 'prev'
                            ? 'translate3d(18%, 0, 0)'
                            : 'translate3d(-18%, 0, 0)',
                        opacity: 0,
                        transition:
                          prefersReducedMotion || lowPowerMode
                            ? 'none'
                            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out',
                      }}
                    />
                  )}
                  {resolvedArtworkUrl && !artworkBroken ? (
                    <img
                      key={track.id}
                      src={resolvedArtworkUrl}
                      alt={track.title || 'Album cover'}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onError={() => {
                        if (artworkState.attemptIndex + 1 < artworkState.candidates.length) {
                          setArtworkAttempt((a) => a + 1);
                        } else {
                          setArtworkBroken(true);
                        }
                      }}
                      className="zune-art-zoom absolute inset-0 w-full h-full object-cover block"
                      style={{
                        animationPlayState:
                          activeLoopsEnabled && !isStandby ? 'running' : 'paused',
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#181C20]">
                      <Disc3 className="w-[34cqw] h-[34cqw] text-[#7D8D9C]/35" />
                    </div>
                  )}
                </div>

                {/* Z-2: Zune Legibility Dark Scrim Overlay */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[2]"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(14,16,18,0.28) 0%, rgba(14,16,18,0.18) 45%, rgba(12,14,16,0.82) 82%, rgba(10,12,14,0.95) 100%)',
                  }}
                />

                {/* Z-3: Top Status + Bottom-Anchored Metadata & Razor-Thin 2px Scrubber */}
                <div className="pointer-events-none relative z-[3] flex-1 min-h-0 flex flex-col justify-between">
                  {/* 1. Top Status Header Row */}
                  <div
                    className="shrink-0 flex items-baseline justify-between gap-2"
                    style={{ padding: '4.5cqh 6.5cqw 2cqh' }}
                  >
                    <span
                      className="lowercase font-light select-none"
                      style={{
                        fontSize: '4.8cqh',
                        color: '#E4ECF4',
                        textShadow: '0 1px 4px rgba(0, 0, 0, 0.72)',
                        letterSpacing: '0.01em',
                        lineHeight: 1.05,
                      }}
                    >
                      now playing
                    </span>
                    <span
                      id="sq-track-index-readout"
                      className="font-light tabular-nums shrink-0"
                      style={{
                        fontSize: '3.8cqh',
                        color: '#C2D0DE',
                        textShadow: '0 1px 4px rgba(0, 0, 0, 0.72)',
                        lineHeight: 1.05,
                      }}
                    >
                      {formatZuneTrackIndexReadout(focusedTrackIndex, tracks.length)}
                    </span>
                  </div>

                  {/* 2. Bottom Typography Overlay + Rating Heart + 2px Scrubber */}
                  <div className="shrink-0 flex flex-col">
                    <div className="flex flex-col" style={{ padding: '0 6.5cqw' }}>
                      <h2
                        id="console-track-title"
                        className="truncate text-white m-0"
                        style={{
                          fontWeight: 400,
                          fontSize: '6.8cqh',
                          lineHeight: 1.15,
                          textShadow: '0 1px 6px rgba(0, 0, 0, 0.85)',
                        }}
                      >
                        {isStandby ? 'standby' : track.title || 'Untitled Track'}
                      </h2>

                      <div className="mt-[0.4cqh] flex items-center justify-between gap-[2cqw]">
                        <div className="min-w-0 flex-1 flex flex-col">
                          <div
                            id="console-artist-name"
                            className="truncate"
                            style={{
                              color: '#B2C3D4',
                              fontWeight: 300,
                              fontSize: '5.0cqh',
                              lineHeight: 1.2,
                              textShadow: '0 1px 4px rgba(0, 0, 0, 0.85)',
                            }}
                          >
                            {isStandby ? 'connect spotify' : track.artist || 'Unknown Artist'}
                          </div>
                          <div
                            id="console-album-name"
                            className="truncate"
                            style={{
                              color: '#93A4B5',
                              fontWeight: 300,
                              fontSize: '3.9cqh',
                              marginTop: '0.4cqh',
                              lineHeight: 1.15,
                              textShadow: '0 1px 4px rgba(0, 0, 0, 0.85)',
                            }}
                          >
                            {isStandby ? 'zune 30 firmware' : track.album || playlistName || 'Single'}
                          </div>
                        </div>

                        {!isStandby && (
                          <button
                            id="btn-zune-favorite"
                            type="button"
                            aria-label={isCurrentTrackFavorited ? 'Remove favorite' : 'Favorite track'}
                            aria-pressed={isCurrentTrackFavorited}
                            data-no-drawer-swipe="true"
                            onClick={handleToggleFavorite}
                            className="pointer-events-auto shrink-0 bg-transparent border-0 p-[1cqw] cursor-pointer flex items-center justify-center transition-transform active:scale-90"
                            style={{
                              color: isCurrentTrackFavorited ? '#E81123' : 'rgba(255, 255, 255, 0.88)',
                            }}
                          >
                            <Heart
                              style={{ width: '5.5cqh', height: '5.5cqh' }}
                              className={isCurrentTrackFavorited ? 'fill-[#E81123]' : ''}
                            />
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      className="pointer-events-auto shrink-0 flex flex-col"
                      style={{ margin: '1.8cqh 12cqw 3cqh 6.5cqw' }}
                    >
                      <div
                        id="sq-progress-track"
                        role="slider"
                        aria-label="Track progress"
                        aria-valuemin={0}
                        aria-valuemax={Math.max(1, Math.round(safeDuration))}
                        aria-valuenow={Math.round(currentTimeSec)}
                        tabIndex={0}
                        onPointerDown={handleProgressBarScrub}
                        className="relative w-full py-[1.6cqh] flex items-center cursor-pointer touch-none"
                      >
                        <div
                          className="relative w-full overflow-hidden"
                          style={{
                            height: '2px',
                            backgroundColor: 'rgba(255, 255, 255, 0.28)',
                          }}
                        >
                          <div
                            className="h-full bg-white transition-[width] duration-150 ease-linear"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <div
                        className="flex justify-between items-baseline"
                        style={{ marginTop: '0.5cqh' }}
                      >
                        <span
                          id="sq-elapsed-numeral"
                          className="font-light tabular-nums"
                          style={{
                            color: '#E2EBF4',
                            fontSize: '3.6cqh',
                            lineHeight: 1,
                          }}
                        >
                          {elapsedDisplay}
                        </span>
                        <span
                          id="sq-total-duration"
                          className="font-light tabular-nums"
                          style={{
                            color: '#9BB0C4',
                            fontSize: '3.6cqh',
                            lineHeight: 1,
                          }}
                        >
                          {totalDisplay}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* SCREEN 3: Synced Lyrics */}
              <section
                id="sq-pane-lyrics"
                aria-hidden={activeScreen !== 'lyrics'}
                className="w-full min-w-full h-full overflow-hidden p-[4cqw] pb-[12%]"
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

              {/* SCREEN 4: Settings & Library Switcher */}
              <section
                id="sq-pane-settings"
                aria-hidden={activeScreen !== 'settings'}
                className="w-full min-w-full h-full overflow-y-auto overflow-x-hidden px-[8%] py-[6%] pb-[14%] flex flex-col justify-between gap-2 sq-lcd-scroll-list"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="lowercase text-white"
                    style={{ fontSize: '6.5cqh', fontWeight: 400 }}
                  >
                    settings
                  </span>
                  <SquircleClockStatus isDocumentHidden={isDocumentHidden} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-normal lowercase text-white">volume</span>
                      <span className="text-[9.5px] text-[#B2C3D4] tabular-nums">
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
                      className="w-full accent-[#B2C3D4] h-1.5 bg-white/20 rounded-full cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-normal lowercase text-white">
                        pitch trim
                      </span>
                      <span className="text-[9.5px] text-[#B2C3D4] tabular-nums">
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
                      className="w-full accent-[#B2C3D4] h-1.5 bg-white/20 rounded-full cursor-pointer"
                    />
                  </label>
                </div>

                {playlists && playlists.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[9.5px] lowercase text-[#B2C3D4]/75">playlists</span>
                    <div className="flex flex-wrap gap-1">
                      {playlists.slice(0, 4).map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => {
                            retroAudio.triggerSquircleThip(false);
                            triggerButtonHaptic(lowPowerMode);
                            onSelectPlaylist?.(pl.id);
                          }}
                          className={`bg-transparent border-0 p-0 pr-2 text-[10px] lowercase cursor-pointer ${
                            pl.id === activePlaylistId
                              ? 'text-white font-normal'
                              : 'text-[#B2C3D4] font-light hover:text-white'
                          }`}
                        >
                          {pl.name.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    id="toggle-shuffle"
                    type="button"
                    aria-pressed={shuffleEnabled}
                    onClick={() => {
                      retroAudio.triggerSquircleThip(false);
                      triggerButtonHaptic(lowPowerMode);
                      onToggleShuffle();
                    }}
                    className={`sq-pressable px-1.5 py-1 rounded-[4px] border text-[9.5px] lowercase flex items-center justify-between cursor-pointer ${
                      shuffleEnabled
                        ? 'bg-white/15 border-white/55 text-white'
                        : 'bg-white/[0.04] border-white/15 text-[#B2C3D4]'
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
                    className={`sq-pressable px-1.5 py-1 rounded-[4px] border text-[9.5px] lowercase flex items-center justify-between cursor-pointer ${
                      repeatOne
                        ? 'bg-white/15 border-white/55 text-white'
                        : 'bg-white/[0.04] border-white/15 text-[#B2C3D4]'
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
                    className={`sq-pressable px-1.5 py-1 rounded-[4px] border text-[9.5px] lowercase flex items-center justify-between cursor-pointer ${
                      lowPowerMode
                        ? 'bg-white/15 border-white/55 text-white'
                        : 'bg-white/[0.04] border-white/15 text-[#B2C3D4]'
                    }`}
                  >
                    <span>eco</span>
                    <span className="text-[8px] uppercase">{lowPowerMode ? 'on' : 'off'}</span>
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
                    className={`sq-pressable px-1.5 py-1 rounded-[4px] border text-[9.5px] lowercase flex items-center justify-between cursor-pointer ${
                      nightMode
                        ? 'bg-white/15 border-white/55 text-white'
                        : 'bg-white/[0.04] border-white/15 text-[#B2C3D4]'
                    }`}
                  >
                    <span>night</span>
                    <span className="text-[8px] uppercase">{nightMode ? 'on' : 'off'}</span>
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
                  className="sq-pressable w-full py-1 rounded-[4px] bg-white/[0.06] border border-white/20 text-[#B2C3D4] hover:text-white text-[9.5px] lowercase flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>stop deck</span>
                </button>
              </section>
            </div>
          </div>

          {/* Translucent Zune Volume Overlay Strip (0-20 stepped bars, auto-fades after 1.6s) */}
          <div
            id="sq-volume-overlay"
            aria-hidden={!volumeOverlayVisible}
            style={{
              opacity: volumeOverlayVisible ? 1 : 0,
              transform: volumeOverlayVisible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 4px, 0)',
              transition:
                prefersReducedMotion || lowPowerMode
                  ? 'none'
                  : 'opacity 200ms ease, transform 200ms ease',
              left: '6.5cqw',
              right: '11.5cqw',
              bottom: '8.5cqh',
              padding: '2.4cqh 3.2cqw',
              backgroundColor: 'rgba(16, 19, 22, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '2px',
            }}
            className="pointer-events-none absolute z-40 backdrop-blur-sm flex flex-col gap-[1.4cqh]"
          >
            <div className="flex items-baseline justify-between">
              <span
                className="lowercase font-light text-[#B2C3D4]"
                style={{ fontSize: '3.6cqh', lineHeight: 1 }}
              >
                volume
              </span>
              <span
                className="font-normal tabular-nums text-white"
                style={{ fontSize: '3.6cqh', lineHeight: 1 }}
              >
                {volumeToZuneStepCount(volume)}
              </span>
            </div>
            <div
              className="grid gap-[1.2px] w-full"
              style={{
                height: '2.2cqh',
                gridTemplateColumns: `repeat(${ZUNE_VOLUME_BAR_COUNT}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: ZUNE_VOLUME_BAR_COUNT }, (_, barIdx) => {
                const lit = barIdx < volumeToZuneStepCount(volume);
                return (
                  <span
                    key={barIdx}
                    style={{
                      backgroundColor: lit ? '#FFFFFF' : 'rgba(255, 255, 255, 0.18)',
                    }}
                    className="w-full h-full block"
                  />
                );
              })}
            </div>
          </div>

          {/* Bottom-Right Vertically Stacked Status Glyphs: Upright Vertical Battery Above Pause (||) / Play (▶) */}
          <div
            id="sq-oled-corner-status"
            aria-hidden="true"
            className="pointer-events-none absolute right-[4.5%] bottom-[3.5%] z-30 flex flex-col items-center gap-[3px]"
          >
            {/* Miniature Upright Vertical Battery With 1px White Shell + Pale-Blue/White Internal Charge */}
            <svg viewBox="0 0 10 16" className="w-[8px] h-[13px] block">
              {/* Top terminal nub */}
              <rect x="3.5" y="0.5" width="3" height="1.5" fill="#FFFFFF" />
              {/* Crisp 1px white outer battery shell */}
              <rect
                x="1"
                y="2"
                width="8"
                height="13"
                rx="0.8"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1"
              />
              {/* Pale-blue / white charge bar */}
              <rect x="2.4" y="4.2" width="5.2" height="9.4" fill="#92C5EB" />
            </svg>

            {/* Miniature White Play/Pause Status Directly Beneath Battery */}
            {isPlaying ? (
              <svg viewBox="0 0 10 10" className="w-[7px] h-[7px] block">
                <polygon points="2,1 9,5 2,9" fill="#FFFFFF" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" className="w-[7px] h-[7px] block">
                <rect x="2" y="1.5" width="2" height="7" fill="#FFFFFF" />
                <rect x="6" y="1.5" width="2" height="7" fill="#FFFFFF" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* 5. LEFT COLOR-MATCHED BACK BUTTON (←) — ZERO WHITE OUTLINE */}
      <button
        id="btn-sq-back"
        type="button"
        aria-label="Back"
        data-no-drawer-swipe="true"
        onClick={handleBackPress}
        className="sq-circle-btn absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-pointer"
        style={{
          left: '14.2%',
          top: '77.38%',
          width: '13.5cqw',
          height: '13.5cqw',
          backgroundColor: colorwaySpec.circleBtnBg,
          backgroundImage: colorwaySpec.circleBtnGradient,
          color: colorwaySpec.circleBtnGlyphColor,
          boxShadow: colorwaySpec.circleBtnShadow,
        }}
      >
        <svg viewBox="0 0 16 12" className="w-[46%] h-[38%]" aria-hidden="true">
          <path
            d="M 6.2 2.2 L 2.4 6 L 6.2 9.8 M 3 6 H 13.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* 4. UNBRANDED PITCH-BLACK CIRCULAR 4-WAY CONTROL RING + 47% MATTE-BLACK CENTER SELECT BUTTON */}
      <div
        id="sq-hardware-deck"
        data-no-drawer-swipe="true"
        className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
        style={{
          left: '50%',
          top: '77.38%',
          width: '44cqw',
          height: '44cqw',
        }}
      >
        <div
          id="sq-dpad"
          role="group"
          aria-label="Circular directional control pad"
          data-unbranded-blank="true"
          data-no-drawer-swipe="true"
          className="sq-dpad-ring relative w-full h-full rounded-full overflow-hidden"
          style={{
            backgroundImage: colorwaySpec.dpadRingGradient,
            transform: dpadTilt.ringTransform,
          }}
        >
          {/* 4-Way Quadrant Hit Zones (100% Unbranded / Zero Printed Glyphs) */}
          <button
            id="btn-dpad-up"
            type="button"
            aria-label={activeScreen === 'playlist' || activeScreen === 'home' ? 'Up' : 'Volume up'}
            onPointerDown={() => handleDpadVerticalPointerDown('up')}
            onPointerUp={handleDpadVerticalPointerEnd}
            onPointerLeave={handleDpadVerticalPointerEnd}
            onPointerCancel={handleDpadVerticalPointerEnd}
            onClick={() => handleDpadVerticalClick('up')}
            className="absolute top-0 left-[22%] w-[56%] h-[30%] bg-transparent border-0 p-0 cursor-pointer"
          >
            <span className="sr-only">Up</span>
          </button>

          <button
            id="btn-dpad-down"
            type="button"
            aria-label={
              activeScreen === 'playlist' || activeScreen === 'home' ? 'Down' : 'Volume down'
            }
            onPointerDown={() => handleDpadVerticalPointerDown('down')}
            onPointerUp={handleDpadVerticalPointerEnd}
            onPointerLeave={handleDpadVerticalPointerEnd}
            onPointerCancel={handleDpadVerticalPointerEnd}
            onClick={() => handleDpadVerticalClick('down')}
            className="absolute bottom-0 left-[22%] w-[56%] h-[30%] bg-transparent border-0 p-0 cursor-pointer"
          >
            <span className="sr-only">Down</span>
          </button>

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
            className="absolute left-0 top-[22%] w-[30%] h-[56%] bg-transparent border-0 p-0 cursor-pointer"
          >
            <span className="sr-only">Previous track</span>
          </button>

          <button
            id="btn-next-track"
            type="button"
            aria-label="Next track"
            onPointerDown={() => setDpadPressedZone('right')}
            onPointerUp={() => setDpadPressedZone(null)}
            onPointerLeave={() => setDpadPressedZone(null)}
            onPointerCancel={() => setDpadPressedZone(null)}
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              retroAudio.triggerSquircleThip(false);
              setTrackSkipDirection('next');
              onNext();
            }}
            className="absolute right-0 top-[22%] w-[30%] h-[56%] bg-transparent border-0 p-0 cursor-pointer"
          >
            <span className="sr-only">Next track</span>
          </button>

          {/* 47% Circular Matte-Black Center Select Button With 1.5px Crisp Dark Parting Trench (100% Blank) */}
          <button
            id="btn-play-pause"
            type="button"
            data-pressed={dpadPressedZone === 'center' ? 'true' : 'false'}
            aria-label={
              activeScreen === 'playlist' || activeScreen === 'home'
                ? 'Select'
                : isPlaying
                ? 'Pause'
                : 'Play'
            }
            onPointerDown={() => setDpadPressedZone('center')}
            onPointerUp={() => setDpadPressedZone(null)}
            onPointerLeave={() => setDpadPressedZone(null)}
            onPointerCancel={() => setDpadPressedZone(null)}
            onClick={handleDpadCenterSelect}
            style={{
              width: '47%',
              height: '47%',
              backgroundImage: colorwaySpec.dpadInnerGradient,
              transform: dpadTilt.centerTransform,
            }}
            className={`sq-dpad-inner-well absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer ${
              stutterActive ? 'ring-1 ring-[#E6007E]/80' : ''
            }`}
          >
            <span className="sr-only">Select</span>
          </button>
        </div>
      </div>

      {/* 5. RIGHT COLOR-MATCHED PLAY/PAUSE BUTTON (▶||) — ZERO WHITE OUTLINE */}
      <button
        id="btn-sq-play-shortcut"
        type="button"
        aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
        data-no-drawer-swipe="true"
        onClick={() => {
          triggerButtonHaptic(lowPowerMode);
          retroAudio.triggerSquircleThip(true);
          if (!isPlaying) {
            ytPlayerRef.current?.triggerUserGesturePlay();
          }
          onTogglePlay();
        }}
        className="sq-circle-btn absolute z-30 translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center cursor-pointer"
        style={{
          right: '14.2%',
          top: '77.38%',
          width: '13.5cqw',
          height: '13.5cqw',
          backgroundColor: colorwaySpec.circleBtnBg,
          backgroundImage: colorwaySpec.circleBtnGradient,
          color: colorwaySpec.circleBtnGlyphColor,
          boxShadow: colorwaySpec.circleBtnShadow,
        }}
      >
        <svg viewBox="0 0 18 12" className="w-[46%] h-[38%]" aria-hidden="true">
          <polygon points="2.5,2.2 8.2,6 2.5,9.8" fill="currentColor" />
          <rect x="10.2" y="2.4" width="1.7" height="7.2" fill="currentColor" />
          <rect x="13.2" y="2.4" width="1.7" height="7.2" fill="currentColor" />
        </svg>
      </button>
    </div>

      {/* PART 2.3: Bottom-of-Zune Animated Color-Swipe Hint Strip */}
      <div
        id="sq-color-swipe-hint"
        aria-hidden="true"
        style={{
          marginTop: '8px',
          pointerEvents: 'none',
        }}
        className="sq-swipe-hint-strip relative z-20 flex items-center justify-center gap-1.5 text-[10px] font-medium lowercase tracking-[0.06em] text-white/85 select-none shrink-0"
      >
        <span className="sq-swipe-chevron-left inline-block text-white/95">&lsaquo;</span>
        <span>swipe to change color</span>
        <span className="sq-swipe-chevron-right inline-block text-white/95">&rsaquo;</span>
      </div>

      {/* Transient Centered Minimal Colorway Pill Below Chassis (Auto-Fades After 900ms, Zero Permanent Swatches) */}
      <div
        id="sq-colorway-toast"
        role="status"
        aria-live="polite"
        style={{
          opacity: colorwayToastVisible ? 1 : 0,
          transform: colorwayToastVisible ? 'translate3d(-50%, 0, 0)' : 'translate3d(-50%, 4px, 0)',
          transition:
            prefersReducedMotion || lowPowerMode
              ? 'none'
              : 'opacity 240ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="pointer-events-none absolute left-1/2 bottom-[26px] z-50 px-2.5 py-0.5 rounded-full bg-black/80 border border-white/15 backdrop-blur-md flex items-center gap-1.5 whitespace-nowrap shadow-[0_6px_16px_rgba(0,0,0,0.55)]"
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: colorwaySpec.pillDotHex }}
          className="w-2 h-2 rounded-full border border-white/30 shrink-0"
        />
        <span className="text-[10px] font-medium lowercase tracking-[0.06em] text-white/90">
          {colorwaySpec.label}
        </span>
      </div>
    </div>
  );

  const fullscreenVideoPortal =
    isVideoFullscreen && activeVideoId && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={fsOverlayRef}
            id="sq-fullscreen-video-overlay"
            data-testid="sq-fullscreen-video-overlay"
            onMouseMove={resetFsControlsTimer}
            onPointerMove={resetFsControlsTimer}
            onDoubleClick={exitVideoFullscreen}
            onPointerUp={(e) => {
              resetFsControlsTimer();
              if (e.pointerType !== 'mouse') {
                const now = Date.now();
                if (now - lastVideoTapMsRef.current <= 300) {
                  lastVideoTapMsRef.current = 0;
                  exitVideoFullscreen();
                } else {
                  lastVideoTapMsRef.current = now;
                }
              }
            }}
            className="fixed inset-0 z-[10005] w-screen h-[100dvh] bg-black flex items-center justify-center overflow-hidden select-none"
          >
            <iframe
              ref={fsIframeRef}
              title={`Fullscreen video for ${track.title}`}
              src={`https://www.youtube.com/embed/${encodeURIComponent(
                activeVideoId
              )}?autoplay=1&mute=0&enablejsapi=1&controls=1&rel=0&playsinline=1&start=${Math.max(
                0,
                Math.floor(playbackClockStore.getCurrentTimeSec())
              )}${
                typeof window !== 'undefined'
                  ? `&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(
                      window.location.href
                    )}`
                  : ''
              }`}
              onLoad={() => {
                const win = fsIframeRef.current?.contentWindow;
                if (!win) return;
                try {
                  win.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*');
                  win.postMessage(
                    JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
                    '*'
                  );
                  win.postMessage(
                    JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
                    '*'
                  );
                } catch {
                  // ignore iframe errors
                }
              }}
              className="w-full h-full border-0"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />

            <button
              type="button"
              aria-label="Exit fullscreen video"
              onClick={(e) => {
                e.stopPropagation();
                exitVideoFullscreen();
              }}
              style={{
                opacity: fsControlsVisible ? 1 : 0,
                pointerEvents: fsControlsVisible ? 'auto' : 'none',
              }}
              className="fixed top-[calc(env(safe-area-inset-top,0px)+14px)] right-4 z-[10010] w-9 h-9 rounded-full bg-black/75 border border-white/25 text-white flex items-center justify-center cursor-pointer transition-opacity duration-300 hover:bg-black"
            >
              <X className="w-4 h-4" />
            </button>

            <div
              aria-hidden="true"
              style={{
                opacity: fsControlsVisible ? 0.85 : 0,
              }}
              className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+14px)] left-1/2 -translate-x-1/2 z-[10010] px-3 py-1 rounded-full bg-black/70 border border-white/15 text-[11px] text-white/85 transition-opacity duration-300"
            >
              Double-tap or press Esc to exit fullscreen
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      id="sq-player-stage"
      ref={stageRef}
      data-device-only={isDeviceOnlyMode ? 'true' : 'false'}
      onClick={() => {
        if (isDeviceOnlyMode && onToggleDeviceOnlyMode) {
          onToggleDeviceOnlyMode();
        }
      }}
      className={
        isDeviceOnlyMode
          ? 'sq-device-only-stage relative w-screen h-[100dvh] overflow-hidden box-border select-none'
          : isMobilePortrait
          ? 'zune-mobile-portrait-stage relative w-screen h-[100dvh] overflow-hidden box-border select-none'
          : 'zune-landscape-stage relative w-screen h-[100dvh] overflow-hidden box-border select-none'
      }
      style={
        isDeviceOnlyMode
          ? {
              backgroundColor: '#0b0c0e',
              backgroundImage:
                'radial-gradient(ellipse at 50% 44%, rgba(56, 60, 68, 0.28) 0%, rgba(11, 12, 14, 0.98) 72%)',
            }
          : isMobilePortrait
          ? {
              backgroundColor: '#0b0c0e',
              backgroundImage:
                'radial-gradient(ellipse at 50% 24%, rgba(56, 60, 68, 0.28) 0%, rgba(11, 12, 14, 0.98) 72%)',
            }
          : {
              columnGap: `${layoutMetrics.leftRightGapPx}px`,
              paddingTop: isMobileLandscape ? '12px' : '0px',
              paddingBottom: isMobileLandscape ? '12px' : '0px',
              paddingLeft: isMobileLandscape ? '16px' : `${layoutMetrics.leftPaddingPx}px`,
              paddingRight: `${layoutMetrics.rightClearancePx}px`,
              backgroundColor: '#0b0c0e',
              backgroundImage:
                'radial-gradient(ellipse at 26% 32%, rgba(56, 60, 68, 0.28) 0%, rgba(11, 12, 14, 0.98) 72%)',
            }
      }
    >
      {fullscreenVideoPortal}
      {isDeviceOnlyMode ? (
        <div className="w-full h-full flex items-center justify-center">
          {zuneChassisHardware}
        </div>
      ) : isMobilePortrait ? (
        <>
          {/* MOBILE PORTRAIT ROW 1 (Top): Full-Width Rounded 16:9 External Video Display (max-height: 29dvh, z-30) */}
          {!isPortraitVideoCollapsed && externalVideoModule}

          {/* MOBILE PORTRAIT ROW 2 (Lower Tier): Background Full-Width Right-Fading Playlist (z-10) + Right-Anchored Zune 30 (z-25) */}
          <div
            id="sq-mobile-lower-tier"
            className="relative w-full h-full min-h-0 flex items-center justify-end overflow-hidden"
          >
            {/* Background Layer (z-10): Editorial Text Playlist Extending All the Way Behind Zune With Smooth Horizontal Depth Fade */}
            <div
              id="sq-mobile-editorial-playlist"
              data-testid="sq-mobile-editorial-playlist"
              aria-label="Mobile Editorial Playlist"
              data-no-drawer-swipe="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                padding: '8px 0 24px 2px',
                maskImage: ZUNE_MOBILE_EDITORIAL_RIGHT_MASK,
                WebkitMaskImage: ZUNE_MOBILE_EDITORIAL_RIGHT_MASK,
              }}
              className="sq-editorial-backdrop z-10 overflow-y-auto overflow-x-hidden flex flex-col"
            >
              <div className="mb-1.5 pb-1.5 border-b border-white/[0.16] w-full">
                <div className="max-w-[48%] flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#E6007E] truncate">
                    {playlistName || 'playlist'}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onOpenSpotifyModal}
                      className="bg-transparent border-0 p-0 text-[10px] font-semibold lowercase text-white/80 hover:text-white cursor-pointer shrink-0"
                    >
                      + spotify
                    </button>
                  </div>
                </div>
              </div>

              {tracks.length === 0 ? (
                <div className="py-4 max-w-[48%] flex flex-col items-start gap-2">
                  <span
                    className="font-light lowercase tracking-[-0.02em] text-white/70"
                    style={{ fontSize: 'clamp(0.95rem, 4.1vw, 1.25rem)' }}
                  >
                    no tracks loaded
                  </span>
                  <button
                    type="button"
                    onClick={onOpenSpotifyModal}
                    className="sq-pressable px-2.5 py-1 rounded bg-[#E6007E] text-white text-[10px] font-bold lowercase cursor-pointer"
                  >
                    connect spotify
                  </button>
                </div>
              ) : (
                <div className="flex flex-col pb-8 w-full">
                  {tracks.map((item, idx) => {
                    const isCurrent = item.id === track.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-mobile-editorial-track={item.id}
                        onClick={() => {
                          setFocusedTrackIndex(idx);
                          retroAudio.triggerSquircleThip(true);
                          triggerButtonHaptic(lowPowerMode);
                          onSelectTrack?.(item.id);
                          ytPlayerRef.current?.triggerUserGesturePlay();
                          navigateToScreen('now-playing');
                        }}
                        style={{
                          borderBottom: isCurrent
                            ? '1px solid rgba(230, 0, 126, 0.72)'
                            : '1px solid rgba(255, 255, 255, 0.16)',
                        }}
                        className="w-full text-left py-2 flex items-center gap-2 cursor-pointer bg-transparent"
                      >
                        {isCurrent && (
                          <span
                            aria-hidden="true"
                            className="w-[3px] h-5 rounded-full bg-[#E6007E] shrink-0"
                          />
                        )}
                        <div className="min-w-0 max-w-[46%] flex flex-col">
                          <span
                            className={`lowercase leading-[1.08] tracking-[-0.025em] truncate ${
                              isCurrent ? 'font-semibold text-white' : 'font-light text-white/75'
                            }`}
                            style={{ fontSize: 'clamp(0.95rem, 4.1vw, 1.25rem)' }}
                          >
                            {item.title.toLowerCase()}
                          </span>
                          <span
                            className={`text-[9.5px] uppercase tracking-[0.1em] truncate ${
                              isCurrent ? 'text-[#E6007E]' : 'text-white/48'
                            }`}
                          >
                            {item.artist}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Foreground Layer (z-25): Right-Anchored Proportion-Locked Zune 30 Overlapping Background Playlist */}
            {zuneChassisHardware}
          </div>
        </>
      ) : (
        <>
          {/* DESKTOP / LANDSCAPE LEFT STAGE: Top-Left 16:9 Video Screen Above Under-Video Scrolling Playlist */}
          <div
            id="sq-left-stage-column"
            className="min-w-0 h-full flex flex-col relative z-10 overflow-hidden box-border"
            style={{
              paddingTop: isMobileLandscape ? '0px' : `${layoutMetrics.topClearancePx}px`,
            }}
          >
            {externalVideoModule}

            {layoutMetrics.isExternalPlaylistVisible && (
              <div
                id="sq-editorial-backdrop"
                data-testid="sq-editorial-backdrop"
                aria-label="Editorial Playlist Selection"
                className="sq-editorial-backdrop sq-under-video-mask flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative z-10"
                style={{
                  marginTop: '-18px',
                  paddingTop: '32px',
                  paddingBottom: '40px',
                  maskImage: SQUIRCLE_UNDER_VIDEO_SCROLL_MASK_GRADIENT,
                  WebkitMaskImage: SQUIRCLE_UNDER_VIDEO_SCROLL_MASK_GRADIENT,
                }}
              >
                <div className="w-full max-w-[760px] flex flex-col">
                  {/* Compact Editorial Playlist Switcher & Spotify Link Header */}
                  <div className="mb-2.5 pb-2 border-b border-white/[0.16] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E6007E]">
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
                              className={`sq-pressable px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-[4px] text-[10px] sm:text-[11px] font-medium lowercase tracking-tight border cursor-pointer transition-colors ${
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
                        className="sq-pressable px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-[4px] text-[10px] sm:text-[11px] font-bold lowercase tracking-tight bg-white/[0.08] border border-white/25 text-white hover:bg-[#E6007E] hover:border-[#E6007E] cursor-pointer transition-colors"
                      >
                        + spotify
                      </button>
                    </div>
                  </div>

                  {/* Pure Text-Mode Editorial Track Rows With Hairline Dividers */}
                  {tracks.length === 0 ? (
                    <div className="py-6 flex flex-col items-start gap-3">
                      <div
                        className="font-light lowercase tracking-[-0.03em] text-white/75 leading-[1.06]"
                        style={{
                          fontSize: isMobileLandscape
                            ? 'clamp(0.95rem, 2.4vw, 1.25rem)'
                            : 'clamp(1.2rem, 2.1vw, 1.95rem)',
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
                              setFocusedTrackIndex(idx);
                              retroAudio.triggerSquircleThip(true);
                              triggerButtonHaptic(lowPowerMode);
                              onSelectTrack?.(item.id);
                              ytPlayerRef.current?.triggerUserGesturePlay();
                              navigateToScreen('now-playing');
                            }}
                            style={{
                              borderBottomColor: isCurrent
                                ? 'rgba(230, 0, 126, 0.75)'
                                : 'rgba(255, 255, 255, 0.16)',
                            }}
                            className={`sq-pressable group w-full text-left py-2 sm:py-2.5 border-b flex items-baseline justify-between gap-3 cursor-pointer transition-colors ${
                              isCurrent ? 'text-white' : 'text-white/60 hover:text-white/95'
                            }`}
                          >
                            <div className="min-w-0 flex-1 flex items-baseline gap-2.5">
                              {isCurrent ? (
                                <span
                                  aria-hidden="true"
                                  className="w-[3px] self-stretch rounded-full bg-[#E6007E] shrink-0"
                                />
                              ) : (
                                <span className="text-[10px] font-bold tabular-nums text-white/40 group-hover:text-white/75 shrink-0">
                                  {String(idx + 1).padStart(2, '0')}
                                </span>
                              )}
                              <div className="min-w-0 flex-1 flex flex-col">
                                <span
                                  className={`lowercase leading-[1.06] tracking-[-0.028em] truncate transition-colors ${
                                    isCurrent
                                      ? 'font-semibold text-white'
                                      : 'font-light text-white/70 group-hover:text-white'
                                  }`}
                                  style={{
                                    fontSize: isMobileLandscape
                                      ? 'clamp(0.95rem, 2.4vw, 1.25rem)'
                                      : 'clamp(1.2rem, 2.1vw, 1.95rem)',
                                  }}
                                >
                                  {item.title.toLowerCase()}
                                </span>
                                <span
                                  className={`mt-0.5 text-[10px] uppercase tracking-[0.13em] truncate ${
                                    isCurrent ? 'text-[#E6007E]' : 'text-white/45'
                                  }`}
                                >
                                  {item.artist}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[10.5px] sm:text-xs font-medium tabular-nums shrink-0 ${
                                isCurrent ? 'text-[#E6007E]' : 'text-white/45'
                              }`}
                            >
                              {rowDuration}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* DESKTOP / LANDSCAPE RIGHT STAGE: Fit-to-Height Chocolate Zune 30 (Locked 0.545:1 Proportions) */}
          <div
            id="sq-right-chassis-column"
            className="relative z-30 shrink-0 h-full flex items-center justify-end"
          >
            {zuneChassisHardware}
          </div>
        </>
      )}
    </div>
  );
};
