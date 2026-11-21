import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import andromedaWallpaper from '../../assets/images/osx_lion_andromeda_1794925891597.jpg';
import {
  buildMutedImacYoutubeEmbedUrl,
} from '../../utils/clickWheelLogic';
import {
  buildYouTubeCandidateQueue,
  loadYouTubeIframeApi,
  type YTPlayerInstance,
} from '../../utils/youtubePlayer';

import type { TrackItem } from '../../utils/playerLogic';
import { formatDuration } from '../../utils/playerLogic';

export { buildMutedImacYoutubeEmbedUrl };

export type ImacOpenAppId = 'none' | 'itunes' | 'video' | 'finder' | 'prefs';

export interface ClickWheelImacDisplayMetrics {
  imacWidthPx: number;
  imacScreenHeightPx: number;
  imacChinHeightPx: number;
  imacTotalHeightPx: number;
  imacStandHeightPx?: number;
}

export interface ClickWheelImacBackdropProps {
  metrics: ClickWheelImacDisplayMetrics;
  isMobilePortrait: boolean;
  isPlaying: boolean;
  isDocumentHidden?: boolean;
  trackTitle: string;
  trackArtist: string;
  trackArtworkUrl?: string;
  youtubeVideoId?: string;
  youtubeCandidateIds?: string[];
  tracks?: TrackItem[];
  activeTrackId?: string;
  playlistName?: string;
  onSelectTrack?: (trackId: string) => void;
  openApp: ImacOpenAppId;
  onToggleApp: (app: ImacOpenAppId) => void;
  onOpenSettingsPane: () => void;
  onCycleGeneration: () => void;
  renderLibraryWindowContent?: () => React.ReactNode;
  renderVideoWindowContent?: () => React.ReactNode;
  volume?: number;
  onChangeVolume?: (v: number) => void;
  shuffleEnabled?: boolean;
  onToggleShuffle?: () => void;
  repeatOne?: boolean;
  onToggleRepeatOne?: () => void;
  lowPowerMode?: boolean;
  onToggleLowPowerMode?: () => void;
  nightMode?: boolean;
  onToggleNightMode?: () => void;
  hideBoxArt?: boolean;
  onToggleHideBoxArt?: () => void;
  onToggleDeviceOnlyMode?: () => void;
}

const DOCK_APPS: Array<{
  id: 'finder' | 'launchpad' | 'youtube' | 'spotify' | 'prefs';
  label: string;
}> = [
  { id: 'finder', label: 'Finder' },
  { id: 'launchpad', label: 'Launchpad' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'prefs', label: 'System Preferences' },
];

function renderDockIconSvg(id: 'finder' | 'launchpad' | 'youtube' | 'spotify' | 'prefs') {
  switch (id) {
    case 'finder':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="cwFinderL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6DC4FF" />
              <stop offset="100%" stopColor="#267AE0" />
            </linearGradient>
            <linearGradient id="cwFinderR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5FAFF" />
              <stop offset="100%" stopColor="#C8DDF5" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="32" height="32" rx="6" fill="url(#cwFinderR)" stroke="#6888B0" strokeWidth="1" />
          <path d="M2 8 C2 4.7 4.7 2 8 2 H18 C16.5 11 16 17 19.5 19 L17.5 34 H8 C4.7 34 2 31.3 2 28 Z" fill="url(#cwFinderL)" />
          <circle cx="11.5" cy="14" r="1.5" fill="#0F294A" />
          <circle cx="24.5" cy="14" r="1.5" fill="#0F294A" />
          <path d="M10.5 23 Q18 28.5 25.5 23" fill="none" stroke="#0F294A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'launchpad':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="cwLpBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E4EAF2" />
              <stop offset="100%" stopColor="#8F9BAE" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="32" height="32" rx="7" fill="url(#cwLpBg)" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1" />
          <rect x="7" y="7" width="6" height="6" rx="1.5" fill="#F87171" />
          <rect x="15" y="7" width="6" height="6" rx="1.5" fill="#FBBF24" />
          <rect x="23" y="7" width="6" height="6" rx="1.5" fill="#34D399" />
          <rect x="7" y="15" width="6" height="6" rx="1.5" fill="#60A5FA" />
          <rect x="15" y="15" width="6" height="6" rx="1.5" fill="#A78BFA" />
          <rect x="23" y="15" width="6" height="6" rx="1.5" fill="#F472B6" />
          <rect x="7" y="23" width="6" height="6" rx="1.5" fill="#38BDF8" />
          <rect x="15" y="23" width="6" height="6" rx="1.5" fill="#FB923C" />
          <rect x="23" y="23" width="6" height="6" rx="1.5" fill="#4ADE80" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <defs>
            <linearGradient id="cwYtRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF3B30" />
              <stop offset="52%" stopColor="#E11D24" />
              <stop offset="100%" stopColor="#991B1B" />
            </linearGradient>
            <linearGradient id="cwYtGloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <rect x="2" y="5" width="32" height="26" rx="7.5" fill="url(#cwYtRed)" stroke="#FCA5A5" strokeWidth="1" />
          <path d="M4 11 C4 7.5 6.8 6 10 6 H26 C29.2 6 32 7.5 32 11 V14.5 C24 16.5 12 16.5 4 14.5 Z" fill="url(#cwYtGloss)" />
          <polygon points="14.5,11.8 25,18 14.5,24.2" fill="#FFFFFF" />
        </svg>
      );
    case 'spotify':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <defs>
            <radialGradient id="cwSpotifyGreen" cx="38%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#4ADE80" />
              <stop offset="48%" stopColor="#1ED760" />
              <stop offset="100%" stopColor="#117A37" />
            </radialGradient>
            <linearGradient id="cwSpotifyGloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <circle cx="18" cy="18" r="16" fill="url(#cwSpotifyGreen)" stroke="#BBF7D0" strokeWidth="1.1" />
          <ellipse cx="18" cy="10.2" rx="11.5" ry="6.2" fill="url(#cwSpotifyGloss)" />
          <path
            d="M9.6 13.8 C15.2 12.1 21.8 12.4 26.8 15.2"
            fill="none"
            stroke="#090D11"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M11.0 18.6 C15.6 17.2 20.9 17.5 25.1 19.9"
            fill="none"
            stroke="#090D11"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M12.2 23.1 C16.0 21.9 20.1 22.2 23.4 24.1"
            fill="none"
            stroke="#090D11"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'prefs':
    default:
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="cwPrefsBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D8DCE3" />
              <stop offset="100%" stopColor="#7C8391" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="32" height="32" rx="7" fill="url(#cwPrefsBg)" stroke="#E5E9F0" strokeWidth="1" />
          <circle cx="18" cy="18" r="9.5" fill="#4B525E" stroke="#F8FAFC" strokeWidth="1.5" strokeDasharray="3 1.7" />
          <circle cx="18" cy="18" r="4.5" fill="#CBD5E1" stroke="#334155" strokeWidth="1.2" />
        </svg>
      );
  }
}

const ImacResilientYouTubePlayer: React.FC<{
  candidateQueue: string[];
  isPlaying: boolean;
  trackTitle: string;
  trackArtist: string;
  trackArtworkUrl?: string;
  onExit: () => void;
}> = ({ candidateQueue, isPlaying, trackTitle, trackArtist, trackArtworkUrl, onExit }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isPlayerReadyRef = useRef(false);
  const pendingVideoIdRef = useRef<string | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const [candidateIdx, setCandidateIdx] = useState(0);
  const [isMaskingSwitch, setIsMaskingSwitch] = useState(true);
  const [allFailed, setAllFailed] = useState(false);

  const queueKey = candidateQueue.join(',');
  const activeVideoId = candidateQueue[candidateIdx] || '';

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const advanceToNextCandidate = useCallback(() => {
    clearStallTimer();
    setIsMaskingSwitch(true);
    setCandidateIdx((prev) => {
      const next = prev + 1;
      if (next >= candidateQueue.length) {
        setAllFailed(true);
        return prev;
      }
      return next;
    });
  }, [candidateQueue.length, clearStallTimer]);

  // Reset candidate queue whenever the track's candidate list changes
  useEffect(() => {
    setCandidateIdx(0);
    setAllFailed(candidateQueue.length === 0);
    setIsMaskingSwitch(true);
  }, [queueKey, candidateQueue.length]);

  const startStallWatch = useCallback(() => {
    clearStallTimer();
    stallTimerRef.current = window.setTimeout(() => {
      advanceToNextCandidate();
    }, 5000);
  }, [clearStallTimer, advanceToNextCandidate]);

  const enforceStrictSilence = useCallback((player: YTPlayerInstance | null) => {
    if (!player) return;
    try {
      player.mute?.();
      player.setVolume?.(0);
    } catch {
      // ignore cross-origin YT command errors
    }
  }, []);

  // Initialize singleton YouTube IFrame API player once while Video Mode is mounted
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setAllFailed(true);
      return;
    }
    if (!activeVideoId || allFailed) return;

    let cancelled = false;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        if (playerRef.current) return;

        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const widgetReferrer = typeof window !== 'undefined' ? window.location.href : '';

        const mountTarget = document.createElement('div');
        mountTarget.style.width = '100%';
        mountTarget.style.height = '100%';
        hostRef.current.innerHTML = '';
        hostRef.current.appendChild(mountTarget);

        startStallWatch();

        const player = new YT.Player(mountTarget, {
          width: '100%',
          height: '100%',
          videoId: activeVideoId,
          playerVars: {
            autoplay: isPlayingRef.current ? 1 : 0,
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
              loadedVideoIdRef.current = activeVideoId;
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

              if (pendingVideoIdRef.current && pendingVideoIdRef.current !== activeVideoId) {
                const queuedId = pendingVideoIdRef.current;
                pendingVideoIdRef.current = null;
                loadedVideoIdRef.current = queuedId;
                p.loadVideoById?.({ videoId: queuedId, startSeconds: 0 });
                enforceStrictSilence(p);
                startStallWatch();
              } else if (isPlayingRef.current) {
                p.playVideo?.();
              } else {
                p.pauseVideo?.();
                clearStallTimer();
                setIsMaskingSwitch(false);
              }
            },
            onStateChange: (ev) => {
              if (cancelled) return;
              enforceStrictSilence(ev.target);
              // -1 = UNSTARTED, 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING, 5 = CUED
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
        }
      });

    return () => {
      cancelled = true;
    };
    // Mount YT.Player once per open video session; subsequent IDs use debounced loadVideoById
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFailed]);

  // Debounced (200ms) track/candidate switch via loadVideoById guarded by isPlayerReadyRef
  useEffect(() => {
    if (!activeVideoId || allFailed) return;
    if (loadedVideoIdRef.current === activeVideoId) return;
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
      if (loadedVideoIdRef.current === activeVideoId) return;
      loadedVideoIdRef.current = activeVideoId;
      setIsMaskingSwitch(true);
      startStallWatch();
      try {
        player.loadVideoById?.({ videoId: activeVideoId, startSeconds: 0 });
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

  // Keep play/pause and mute state synchronized with iPod transport
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

  // Guaranteed cleanup on unmount / exit
  useEffect(() => {
    return () => {
      clearStallTimer();
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      isPlayerReadyRef.current = false;
      pendingVideoIdRef.current = null;
      if (playerRef.current) {
        try {
          playerRef.current.destroy?.();
        } catch {
          // ignore destroy errors
        }
        playerRef.current = null;
      }
    };
  }, [clearStallTimer]);

  return (
    <div
      id="cw-imac-chromeless-youtube"
      data-testid="cw-imac-chromeless-youtube"
      data-youtube-video-id={activeVideoId}
      data-youtube-muted="true"
      data-fallback-active={allFailed ? 'true' : 'false'}
      className="absolute inset-0 z-20 w-full h-full bg-black overflow-hidden"
    >
      {allFailed ? (
        /* Graceful Offline / All-Failed Animated Album-Art Ken Burns + Audio Visualizer Fallback */
        <div
          data-testid="cw-imac-artwork-fallback"
          className="relative w-full h-full bg-[#090B12] flex flex-col items-center justify-center overflow-hidden"
        >
          {trackArtworkUrl && (
            <img
              src={trackArtworkUrl}
              alt={trackTitle}
              style={{
                animation: isPlaying ? 'pulse 6s ease-in-out infinite' : undefined,
              }}
              className="absolute inset-0 w-full h-full object-cover scale-110 opacity-75 blur-[1px] transition-transform duration-1000"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/60" />
          <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-center">
            {trackArtworkUrl && (
              <img
                src={trackArtworkUrl}
                alt={trackTitle}
                className="w-16 h-16 sm:w-24 sm:h-24 rounded-lg object-cover shadow-[0_10px_28px_rgba(0,0,0,0.75)] ring-1 ring-white/25"
              />
            )}
            <div className="max-w-[88%]">
              <p className="font-sans text-[10px] sm:text-[13px] font-bold text-white truncate">
                {trackTitle}
              </p>
              <p className="font-sans text-[8.5px] sm:text-[10.5px] text-white/75 truncate">
                {trackArtist}
              </p>
            </div>
            <div className="flex items-end gap-1 h-4 mt-1" aria-hidden="true">
              {[0.45, 0.85, 0.6, 0.95, 0.5, 0.78, 0.4].map((h, i) => (
                <span
                  key={i}
                  style={{
                    height: isPlaying ? `${Math.round(h * 100)}%` : '22%',
                    transition: 'height 220ms ease',
                  }}
                  className="w-1 rounded-full bg-[#38BDF8]"
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={hostRef}
            id="cw-imac-youtube-player-host"
            className="w-full h-full pointer-events-none scale-[1.03]"
          />
          {isMaskingSwitch && (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-[45] bg-[#07090E] flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-1.5 text-center px-3">
                <span className="w-4 h-4 rounded-full border-2 border-white/25 border-t-white/80 animate-spin" />
                <span className="font-sans text-[9px] sm:text-[10.5px] font-medium text-white/75">
                  Syncing silent visual stream...
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Transparent Click-Through Exit Overlay Above Always-On-Top Dock Strip */}
      <button
        id="cw-imac-youtube-exit-overlay"
        type="button"
        aria-label="Toggle YouTube Mode OFF"
        title="Click screen to exit YouTube Mode"
        onClick={onExit}
        className="absolute top-0 left-0 right-0 bottom-[28px] sm:bottom-[44px] z-[35] bg-transparent border-0 p-0 cursor-pointer"
      />
      <span
        id="cw-imac-youtube-exit-btn"
        aria-hidden="true"
        className="pointer-events-none absolute top-2 right-2 z-[36] px-2 py-0.5 rounded-full bg-black/55 border border-white/25 text-[8.5px] sm:text-[10px] font-sans font-semibold text-white/90 backdrop-blur-md"
      >
        YouTube OFF (Muted)
      </span>
    </div>
  );
};

export const ClickWheelImacBackdrop: React.FC<ClickWheelImacBackdropProps> = React.memo(
  ({
    metrics,
    isMobilePortrait,
    isPlaying,
    isDocumentHidden = false,
    trackTitle,
    trackArtist,
    trackArtworkUrl,
    youtubeVideoId,
    youtubeCandidateIds,
    tracks = [],
    activeTrackId,
    playlistName = 'Current Playlist',
    onSelectTrack,
    openApp,
    onToggleApp,
    onCycleGeneration,
    renderLibraryWindowContent,
    volume = 0.85,
    onChangeVolume,
    shuffleEnabled = false,
    onToggleShuffle,
    repeatOne = false,
    onToggleRepeatOne,
    lowPowerMode = false,
    onToggleLowPowerMode,
    nightMode = false,
    onToggleNightMode,
    hideBoxArt = false,
    onToggleHideBoxArt,
    onToggleDeviceOnlyMode,
  }) => {
    const [finderSource, setFinderSource] = useState<'playlist' | 'library'>('playlist');
    const neckHeightPx = isMobilePortrait ? 12 : Math.max(28, (metrics.imacStandHeightPx ?? 50) - 10);
    const footHeightPx = isMobilePortrait ? 5 : 9;

    // Live macOS Menubar Clock (e.g., "Sat 6:11 AM")
    const [menuBarClock, setMenuBarClock] = useState<string>(() => {
      const now = new Date();
      const day = now.toLocaleDateString('en-US', { weekday: 'short' });
      const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${day} ${time}`;
    });
    const lastNonZeroVolRef = useRef<number>(volume > 0 ? volume : 0.8);
    if (volume > 0.02) {
      lastNonZeroVolRef.current = volume;
    }

    useEffect(() => {
      if (isDocumentHidden) return;
      const updateClock = () => {
        const now = new Date();
        const day = now.toLocaleDateString('en-US', { weekday: 'short' });
        const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        setMenuBarClock(`${day} ${time}`);
      };
      updateClock();
      const id = window.setInterval(updateClock, 30000);
      return () => window.clearInterval(id);
    }, [isDocumentHidden]);

    // Two-Step Animated macOS Demo Mouse Pointer (1: Spotify Callout -> 2: YouTube Callout -> Dismiss)
    const [demoStep, setDemoStep] = useState<'spotify' | 'youtube' | 'dismissed'>('spotify');

    const dismissDemoCursor = useCallback(() => {
      setDemoStep('dismissed');
    }, []);

    useEffect(() => {
      if (demoStep === 'dismissed') return;
      const toYoutubeTimer = window.setTimeout(() => {
        setDemoStep((prev) => (prev === 'spotify' ? 'youtube' : prev));
      }, 2400);
      const toFinishTimer = window.setTimeout(() => {
        setDemoStep((prev) => (prev === 'youtube' ? 'spotify' : prev));
      }, 4800);
      return () => {
        window.clearTimeout(toYoutubeTimer);
        window.clearTimeout(toFinishTimer);
      };
    }, [demoStep]);

    const candidateQueue = useMemo(
      () => buildYouTubeCandidateQueue(youtubeVideoId, youtubeCandidateIds),
      [youtubeVideoId, youtubeCandidateIds]
    );

    const activeMenuAppName =
      openApp === 'video'
        ? 'YouTube'
        : openApp === 'itunes'
          ? 'iTunes'
          : openApp === 'prefs'
            ? 'System Preferences'
            : 'Finder';

    return (
      <div
        id="cw-2011-imac-assembly"
        style={{
          width: `${metrics.imacWidthPx}px`,
        }}
        className="pointer-events-auto relative z-[14] flex flex-col items-center select-none shrink-0"
      >
        {/* Main iMac Display Chassis (86% Black Glass Display + 14% Brushed Aluminum Bottom Chin) */}
        <div
          id="cw-2011-imac-frame"
          style={{
            width: `${metrics.imacWidthPx}px`,
            height: `${metrics.imacTotalHeightPx}px`,
          }}
          className="cw-imac-housing relative rounded-[10px] sm:rounded-[16px] overflow-hidden flex flex-col"
        >
          {/* Upper 86%: Edge-to-Edge Glossy Black Glass Bezel + Andromeda OS X Lion Desktop */}
          <div
            style={{ height: `${metrics.imacScreenHeightPx}px` }}
            className="cw-imac-glass-bezel relative w-full shrink-0 p-[5px] sm:p-[11px] flex flex-col"
          >
            {/* Top-Center iSight / FaceTime Camera Dot */}
            <div
              aria-hidden="true"
              className="absolute top-[2px] sm:top-[4px] left-1/2 -translate-x-1/2 w-[3.5px] h-[3.5px] sm:w-[5px] sm:h-[5px] rounded-full bg-[#1C2430] ring-1 ring-white/15 flex items-center justify-center z-30"
            >
              <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#38BDF8]/55" />
            </div>

            {/* Active LCD Panel Displaying OS X Lion Andromeda Galaxy Wallpaper OR 100% Fullscreen Chromeless YouTube Mode */}
            <div
              id="cw-osx-lion-desktop"
              onPointerDown={dismissDemoCursor}
              onMouseEnter={dismissDemoCursor}
              className="relative w-full h-full rounded-[2px] overflow-hidden bg-[#0A0817] flex flex-col justify-between"
            >
              <img
                src={andromedaWallpaper}
                alt="OS X Lion Andromeda Galaxy Desktop"
                draggable={false}
                className="pointer-events-none absolute inset-0 w-full h-full object-cover"
              />

              {/* Authentic Translucent OS X Lion Top Menu Bar */}
              <div
                id="cw-osx-menubar"
                style={{
                  height: '22px',
                  minHeight: '22px',
                  backgroundColor: 'rgba(242, 244, 247, 0.88)',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.14)',
                  zIndex: 55,
                }}
                className="relative w-full px-2 sm:px-2.5 backdrop-blur-md flex items-center justify-between text-[8px] sm:text-[10px] font-sans text-[#1D1D1F] shrink-0"
              >
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                  {/* Solid Black Apple Logo Silhouette */}
                  <svg
                    viewBox="0 0 14 17"
                    aria-hidden="true"
                    className="w-[8.5px] h-[10.5px] sm:w-[10px] sm:h-[12px] fill-[#1D1D1F] shrink-0"
                  >
                    <path d="M11.6 8.9c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.4 0-2.6.8-3.3 2-.1.2-1.3 2.4-.3 5.5.6 1.7 1.4 3.6 2.5 3.6 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1 0 1.8-1.7 2.5-3.4.8-1.8 1.1-3.5 1.1-3.6-.1 0-1.9-.7-1.9-2.4zM9.4 2.8c.5-.7.9-1.6.8-2.6-.8 0-1.8.5-2.3 1.2-.5.6-.9 1.5-.8 2.5.9.1 3.1-.8 2.3-1.1z" />
                  </svg>
                  <span className="font-bold tracking-tight truncate max-w-[115px] sm:max-w-none">
                    {activeMenuAppName}
                  </span>
                  <span className="hidden sm:inline font-medium opacity-85">File</span>
                  <span className="hidden sm:inline font-medium opacity-85">Edit</span>
                  <span className="hidden sm:inline font-medium opacity-85">View</span>
                </div>

                {/* Right Monochrome System Tray Icons: Bluetooth, Wi-Fi, Speaker Volume, Live Clock, Spotlight */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-[#1D1D1F] tabular-nums font-medium">
                  {/* Bluetooth Icon */}
                  <svg viewBox="0 0 12 16" aria-hidden="true" className="w-[8px] h-[11px] sm:w-[9px] sm:h-[12px] text-[#1D1D1F] shrink-0">
                    <path
                      d="M5.8 1.5 V14.5 L9.8 10.8 L2.6 5.2 M2.6 10.8 L9.8 5.2 L5.8 1.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {/* Wi-Fi Signal Arcs */}
                  <svg viewBox="0 0 16 14" aria-hidden="true" className="w-[10px] h-[9px] sm:w-[12px] sm:h-[10px] text-[#1D1D1F] shrink-0">
                    <path d="M1.5 4.6 C5.2 1.2 10.8 1.2 14.5 4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M3.8 7.3 C6.3 5 9.7 5 12.2 7.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M6.1 9.9 C7.2 8.9 8.8 8.9 9.9 9.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="8" cy="12" r="1.15" fill="currentColor" />
                  </svg>
                  {/* Interactive Volume Speaker Toggle */}
                  <button
                    id="cw-menubar-volume-btn"
                    type="button"
                    aria-label={volume <= 0.02 ? 'Unmute volume' : 'Mute volume'}
                    title={`Volume: ${Math.round(volume * 100)}%`}
                    onClick={() => {
                      if (!onChangeVolume) return;
                      onChangeVolume(volume <= 0.02 ? lastNonZeroVolRef.current : 0);
                    }}
                    className="bg-transparent border-0 p-0 text-[#1D1D1F] hover:opacity-70 cursor-pointer flex items-center shrink-0"
                  >
                    <svg viewBox="0 0 16 14" aria-hidden="true" className="w-[10.5px] h-[9.5px] sm:w-[12px] sm:h-[11px]">
                      <polygon points="1.5,5 4.6,5 8,2.2 8,11.8 4.6,9 1.5,9" fill="currentColor" />
                      {volume > 0.02 ? (
                        <>
                          <path d="M10 4.8 C11.1 5.9 11.1 8.1 10 9.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          {volume > 0.45 && (
                            <path d="M12.2 3.1 C14.1 5.1 14.1 8.9 12.2 10.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          )}
                        </>
                      ) : (
                        <path d="M10.2 4.8 L13.8 9.2 M13.8 4.8 L10.2 9.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      )}
                    </svg>
                  </button>
                  {/* Live Clock */}
                  <span id="cw-menubar-clock" className="text-[7.5px] sm:text-[9.5px] font-semibold tracking-tight whitespace-nowrap">
                    {menuBarClock}
                  </span>
                  {/* Spotlight Magnifying Glass */}
                  <svg viewBox="0 0 14 14" aria-hidden="true" className="w-[8.5px] h-[8.5px] sm:w-[10px] sm:h-[10px] text-[#1D1D1F] shrink-0">
                    <circle cx="5.8" cy="5.8" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="8.8" y1="8.8" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* Resilient Singleton-API Silent YouTube Mode */}
              {openApp === 'video' ? (
                <div className="relative flex-1 min-h-0 w-full">
                  <ImacResilientYouTubePlayer
                    candidateQueue={candidateQueue}
                    isPlaying={isPlaying}
                    trackTitle={trackTitle}
                    trackArtist={trackArtist}
                    trackArtworkUrl={trackArtworkUrl}
                    onExit={() => onToggleApp('none')}
                  />
                </div>
              ) : (
                <>

                  {/* Optional On-Demand Floating OS X Lion App Window (iTunes Library) */}
                  {openApp === 'itunes' && (
                    <div
                      id="cw-osx-floating-window"
                      className="relative z-30 mx-auto my-auto mb-[32px] sm:mb-[46px] w-[92%] sm:w-[86%] h-[70%] rounded-[7px] bg-[#ECEEF2]/95 border border-black/35 shadow-[0_14px_34px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden backdrop-blur-md"
                    >
                      <div className="h-[18px] sm:h-[22px] px-2 bg-gradient-to-b from-[#E7E9EE] to-[#C8CCD4] border-b border-[#989DA6] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Close Window"
                            onClick={() => onToggleApp('none')}
                            className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E] cursor-pointer"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                        </div>
                        <span className="font-sans text-[8.5px] sm:text-[10.5px] font-bold text-[#272A30] truncate">
                          iTunes — Playlists & Spotify
                        </span>
                        <span className="w-6" />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto p-1.5 bg-[#F4F5F7]">
                        {renderLibraryWindowContent?.()}
                      </div>
                    </div>
                  )}

                  {/* Functional OS X Lion Finder Playlist Browser Window */}
                  {openApp === 'finder' && (
                    <div
                      id="cw-osx-finder-window"
                      data-testid="cw-osx-finder-window"
                      className="relative z-30 mx-auto my-auto mb-[32px] sm:mb-[46px] w-[92%] sm:w-[88%] h-[72%] rounded-[7px] bg-[#FFFFFF] border border-black/40 shadow-[0_16px_38px_rgba(0,0,0,0.68)] flex flex-col overflow-hidden"
                    >
                      {/* Brushed-Silver OS X Lion Titlebar with Traffic Lights */}
                      <div className="h-[20px] sm:h-[24px] px-2 bg-gradient-to-b from-[#E7E9EE] to-[#C8CCD4] border-b border-[#989DA6] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Close Finder Window"
                            onClick={() => onToggleApp('none')}
                            className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E] cursor-pointer"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                        </div>
                        <span className="font-sans text-[8.5px] sm:text-[10.5px] font-bold text-[#272A30] truncate">
                          Finder — {playlistName || 'Current Playlist'}
                        </span>
                        <span className="font-sans text-[7.5px] sm:text-[9px] font-medium text-[#525866] tabular-nums shrink-0">
                          {tracks.length} items
                        </span>
                      </div>

                      {/* Finder Two-Pane Body: Left Source Sidebar + Alternating #FFFFFF / #F3F6FA Rows */}
                      <div className="flex-1 min-h-0 flex overflow-hidden">
                        <aside className="w-[74px] sm:w-[116px] shrink-0 bg-gradient-to-b from-[#DDE4EE] to-[#CFD7E3] border-r border-[#B8C0CC] p-1 sm:p-1.5 flex flex-col gap-0.5 select-none">
                          <span className="px-1 py-0.5 font-sans text-[6.5px] sm:text-[8px] font-bold uppercase tracking-wider text-[#5B6472]">
                            Favorites
                          </span>
                          <button
                            type="button"
                            onClick={() => setFinderSource('playlist')}
                            className={`w-full px-1.5 py-0.5 sm:py-1 rounded-[4px] text-left font-sans text-[7.5px] sm:text-[9.5px] font-semibold truncate cursor-pointer ${
                              finderSource === 'playlist'
                                ? 'bg-[#3875D7] text-white'
                                : 'text-[#1F242D] hover:bg-black/[0.06]'
                            }`}
                          >
                            Current Playlist
                          </button>
                          <button
                            type="button"
                            onClick={() => setFinderSource('library')}
                            className={`w-full px-1.5 py-0.5 sm:py-1 rounded-[4px] text-left font-sans text-[7.5px] sm:text-[9.5px] font-semibold truncate cursor-pointer ${
                              finderSource === 'library'
                                ? 'bg-[#3875D7] text-white'
                                : 'text-[#1F242D] hover:bg-black/[0.06]'
                            }`}
                          >
                            Library
                          </button>
                        </aside>

                        <div
                          id="cw-osx-finder-list"
                          className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-[#FFFFFF] flex flex-col"
                        >
                          {tracks.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center p-3 text-center font-sans text-[9px] sm:text-[11px] text-[#6E6E73]">
                              No tracks in playlist yet — click Spotify in the Dock to load songs.
                            </div>
                          ) : (
                            tracks.map((item, idx) => {
                              const isSelected = item.id === activeTrackId;
                              return (
                                <button
                                  key={`${item.id}-${idx}`}
                                  type="button"
                                  data-finder-track-id={item.id}
                                  data-selected={isSelected ? 'true' : 'false'}
                                  onClick={() => onSelectTrack?.(item.id)}
                                  style={{
                                    backgroundColor: isSelected
                                      ? '#3875D7'
                                      : idx % 2 === 0
                                        ? '#FFFFFF'
                                        : '#F3F6FA',
                                    color: isSelected ? '#FFFFFF' : '#1D1D1F',
                                  }}
                                  className="w-full px-2 py-1 sm:py-1.5 flex items-center justify-between gap-2 text-left cursor-pointer border-b border-black/[0.04] shrink-0"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span
                                      className={`font-sans text-[7.5px] sm:text-[9.5px] tabular-nums w-4 text-right shrink-0 ${
                                        isSelected ? 'text-white/85' : 'text-[#6E6E73]'
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>
                                    <span className="font-sans text-[8px] sm:text-[10.5px] font-semibold truncate">
                                      {item.title}
                                    </span>
                                    {item.artist && (
                                      <span
                                        className={`hidden sm:inline font-sans text-[9px] truncate ${
                                          isSelected ? 'text-white/80' : 'text-[#6E6E73]'
                                        }`}
                                      >
                                        — {item.artist}
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className={`font-sans text-[7.5px] sm:text-[9.5px] tabular-nums shrink-0 ${
                                      isSelected ? 'text-white/90' : 'text-[#6E6E73]'
                                    }`}
                                  >
                                    {formatDuration(item.durationSec)}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Authentic OS X Lion System Preferences Floating Window */}
                  {openApp === 'prefs' && (
                    <div
                      id="cw-osx-prefs-window"
                      data-testid="cw-osx-prefs-window"
                      className="relative z-30 mx-auto my-auto mb-[32px] sm:mb-[46px] w-[92%] sm:w-[82%] max-h-[72%] rounded-[7px] bg-[#EDEDEE] border border-black/40 shadow-[0_16px_38px_rgba(0,0,0,0.68)] flex flex-col overflow-hidden"
                    >
                      <div className="h-[20px] sm:h-[24px] px-2 bg-gradient-to-b from-[#E7E9EE] to-[#C8CCD4] border-b border-[#989DA6] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Close System Preferences"
                            onClick={() => onToggleApp('none')}
                            className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E] cursor-pointer"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                        </div>
                        <span className="font-sans text-[8.5px] sm:text-[10.5px] font-bold text-[#272A30] truncate">
                          System Preferences
                        </span>
                        <span className="w-6" />
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 flex flex-col gap-2 text-[#1D1D1F] font-sans">
                        {/* Volume Slider Row */}
                        <div className="p-2 rounded-[5px] bg-white border border-black/10 flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[8px] sm:text-[10px] font-semibold">
                            <span>Sound Output Level</span>
                            <span className="tabular-nums text-[#525866]">{Math.round(volume * 100)}%</span>
                          </div>
                          <input
                            id="cw-imac-prefs-volume"
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(volume * 100)}
                            aria-label="System volume"
                            onChange={(e) => onChangeVolume?.(Number(e.target.value) / 100)}
                            className="w-full h-1.5 accent-[#007AFF] cursor-pointer"
                          />
                        </div>

                        {/* Interactive Toggle Grid */}
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleShuffle?.()}
                            className={`px-2 py-1.5 rounded-[5px] border text-left text-[8px] sm:text-[10px] font-semibold flex items-center justify-between cursor-pointer ${
                              shuffleEnabled
                                ? 'bg-[#007AFF]/12 border-[#007AFF]/50 text-[#0055CC]'
                                : 'bg-white border-black/10 text-[#1D1D1F]'
                            }`}
                          >
                            <span>Shuffle</span>
                            <span className="uppercase text-[7px] sm:text-[8.5px]">{shuffleEnabled ? 'On' : 'Off'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleRepeatOne?.()}
                            className={`px-2 py-1.5 rounded-[5px] border text-left text-[8px] sm:text-[10px] font-semibold flex items-center justify-between cursor-pointer ${
                              repeatOne
                                ? 'bg-[#007AFF]/12 border-[#007AFF]/50 text-[#0055CC]'
                                : 'bg-white border-black/10 text-[#1D1D1F]'
                            }`}
                          >
                            <span>Repeat One</span>
                            <span className="uppercase text-[7px] sm:text-[8.5px]">{repeatOne ? 'On' : 'Off'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleLowPowerMode?.()}
                            className={`px-2 py-1.5 rounded-[5px] border text-left text-[8px] sm:text-[10px] font-semibold flex items-center justify-between cursor-pointer ${
                              lowPowerMode
                                ? 'bg-[#007AFF]/12 border-[#007AFF]/50 text-[#0055CC]'
                                : 'bg-white border-black/10 text-[#1D1D1F]'
                            }`}
                          >
                            <span>Energy Saver</span>
                            <span className="uppercase text-[7px] sm:text-[8.5px]">{lowPowerMode ? 'Eco' : 'Std'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleNightMode?.()}
                            className={`px-2 py-1.5 rounded-[5px] border text-left text-[8px] sm:text-[10px] font-semibold flex items-center justify-between cursor-pointer ${
                              nightMode
                                ? 'bg-[#007AFF]/12 border-[#007AFF]/50 text-[#0055CC]'
                                : 'bg-white border-black/10 text-[#1D1D1F]'
                            }`}
                          >
                            <span>Night Shift</span>
                            <span className="uppercase text-[7px] sm:text-[8.5px]">{nightMode ? 'On' : 'Off'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleHideBoxArt?.()}
                            className={`px-2 py-1.5 rounded-[5px] border text-left text-[8px] sm:text-[10px] font-semibold flex items-center justify-between cursor-pointer ${
                              !hideBoxArt
                                ? 'bg-[#007AFF]/12 border-[#007AFF]/50 text-[#0055CC]'
                                : 'bg-white border-black/10 text-[#1D1D1F]'
                            }`}
                          >
                            <span>Album Cards</span>
                            <span className="uppercase text-[7px] sm:text-[8.5px]">{hideBoxArt ? 'Hidden' : 'Shown'}</span>
                          </button>
                          {onToggleDeviceOnlyMode && (
                            <button
                              type="button"
                              onClick={() => {
                                onToggleApp('none');
                                onToggleDeviceOnlyMode();
                              }}
                              className="px-2 py-1.5 rounded-[5px] border border-black/15 bg-white hover:bg-[#F5F7FA] text-left text-[8px] sm:text-[10px] font-semibold flex items-center justify-between cursor-pointer text-[#1D1D1F]"
                            >
                              <span>Focus Mode</span>
                              <span className="text-[7px] sm:text-[8.5px] text-[#007AFF]">Enter</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Always-On-Top Translucent 3D Glass OS X Lion Bottom Dock (Pinned Above Video & App Windows at z-50) */}
              <div
                id="cw-osx-lion-dock"
                role="toolbar"
                aria-label="OS X Lion Desktop Dock"
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 50,
                  pointerEvents: 'auto',
                }}
                className="flex flex-col items-center shrink-0"
              >
                <div className="relative px-2 sm:px-4 pt-1 pb-[2px] sm:pb-[3px] flex items-end gap-1.5 sm:gap-3.5">
                  {/* 3D Perspective Translucent Glass Shelf Behind Icons */}
                  <div
                    aria-hidden="true"
                    style={{
                      transform: 'perspective(180px) rotateX(26deg)',
                      transformOrigin: 'bottom center',
                    }}
                    className="cw-osx-glass-dock-shelf pointer-events-none absolute inset-x-0 bottom-0 h-[11px] sm:h-[20px] rounded-[4px]"
                  />

                  {DOCK_APPS.map((app) => {
                    const isActive =
                      (app.id === 'finder' && openApp === 'finder') ||
                      (app.id === 'spotify' && (openApp === 'itunes' || isPlaying)) ||
                      (app.id === 'youtube' && openApp === 'video') ||
                      (app.id === 'prefs' && openApp === 'prefs');
                    const isDemoHovered =
                      openApp === 'none' &&
                      ((demoStep === 'spotify' && app.id === 'spotify') ||
                        (demoStep === 'youtube' && app.id === 'youtube'));

                    return (
                      <button
                        key={app.id}
                        id={`cw-imac-dock-app-${app.id}`}
                        type="button"
                        data-imac-dock-app={app.id}
                        data-demo-hovered={isDemoHovered ? 'true' : 'false'}
                        aria-label={app.label}
                        title={app.label}
                        onClick={() => {
                          dismissDemoCursor();
                          if (app.id === 'finder') {
                            onToggleApp(openApp === 'finder' ? 'none' : 'finder');
                          } else if (app.id === 'spotify') {
                            onToggleApp(openApp === 'itunes' ? 'none' : 'itunes');
                          } else if (app.id === 'youtube') {
                            onToggleApp(openApp === 'video' ? 'none' : 'video');
                          } else if (app.id === 'prefs') {
                            onToggleApp(openApp === 'prefs' ? 'none' : 'prefs');
                          } else if (app.id === 'launchpad') {
                            onCycleGeneration();
                          } else {
                            onToggleApp('none');
                          }
                        }}
                        className={`group relative z-10 w-[16px] h-[16px] sm:w-[28px] sm:h-[28px] transition-transform duration-200 hover:-translate-y-1.5 hover:scale-125 active:scale-95 cursor-pointer flex flex-col items-center ${
                          isDemoHovered ? '-translate-y-1.5 scale-125' : ''
                        }`}
                      >
                        {/* Frosted macOS Onboarding Callout Tooltip */}
                        {isDemoHovered && (
                          <span
                            id="cw-imac-demo-tooltip"
                            role="status"
                            className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-[5px] bg-[#1D1D1F]/88 backdrop-blur-md border border-white/25 text-[7.5px] sm:text-[9.5px] font-sans font-semibold text-white whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,0.45)] z-40"
                          >
                            {app.id === 'spotify'
                              ? 'Load your playlist from Spotify'
                              : 'Toggle YouTube Mode ON/OFF'}
                          </span>
                        )}

                        {renderDockIconSvg(app.id)}

                        {/* Classic macOS Black-Arrow Mouse Pointer (White Outline + Drop Shadow) */}
                        {isDemoHovered && (
                          <span
                            id="cw-imac-demo-cursor"
                            data-testid="cw-imac-demo-cursor"
                            data-demo-step={demoStep}
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-2 -right-2 z-50 w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-500"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]"
                            >
                              <path
                                d="M4 2 L4 19 L8.5 14.8 L12.2 22 L15 20.6 L11.3 13.5 L17.5 13.5 Z"
                                fill="#0B0D10"
                                stroke="#FFFFFF"
                                strokeWidth="1.8"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        )}

                        {/* Subtle Dock Shelf Reflection Under Each Glossy Icon */}
                        <span
                          aria-hidden="true"
                          className="pointer-events-none w-[70%] h-[3px] rounded-full bg-white/25 blur-[1px] mt-[0.5px]"
                        />
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="w-[3px] h-[3px] sm:w-[4px] sm:h-[4px] rounded-full bg-[#E0F2FE] shadow-[0_0_5px_#7DD3FC]"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Subtle Diagonal Ambient Room Glass Reflection Across Display Bezel */}
            <div
              aria-hidden="true"
              className="cw-imac-glass-reflection pointer-events-none absolute inset-0 z-30"
            />
          </div>

          {/* Lower 14%: Brushed Anodized Aluminum Bottom Chin + Centered Glossy Black Apple Emblem */}
          <div
            id="cw-2011-imac-chin"
            style={{ height: `${metrics.imacChinHeightPx}px` }}
            className="cw-imac-aluminum-chin relative w-full shrink-0 flex items-center justify-center"
          >
            <svg
              viewBox="0 0 24 28"
              aria-label="Apple Emblem"
              className="w-[10px] h-[12px] sm:w-[19px] sm:h-[23px] fill-[#111317] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]"
            >
              <path d="M19.8 14.9c0-3.4 2.8-5 2.9-5.1-1.6-2.3-4.1-2.6-4.9-2.7-2-.2-4 1.2-5 1.2-1.1 0-2.7-1.2-4.4-1.2-2.3 0-4.4 1.3-5.6 3.4-2.4 4.1-.6 10.2 1.7 13.6 1.1 1.6 2.5 3.5 4.3 3.4 1.7-.1 2.4-1.1 4.4-1.1 2.1 0 2.7 1.1 4.5 1.1 1.9 0 3.1-1.7 4.2-3.3 1.3-1.9 1.9-3.8 1.9-3.9-.1 0-4-1.5-4-5.4zM16.1 5.1c.9-1.1 1.6-2.7 1.4-4.3-1.4.1-3.1.9-4.1 2-.9 1-1.6 2.6-1.4 4.2 1.5.1 3.1-.8 4.1-1.9z" />
            </svg>
          </div>
        </div>

        {/* Tapered Brushed Aluminum L-Stand Casting Soft Contact Shadow */}
        <div
          id="cw-2011-imac-stand"
          aria-hidden="true"
          className="pointer-events-none relative flex flex-col items-center -mt-[1px]"
        >
          <div
            style={{
              width: `${Math.round(metrics.imacWidthPx * 0.21)}px`,
              height: `${neckHeightPx}px`,
              clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
            }}
            className="cw-imac-l-stand-neck"
          />
          <div
            style={{
              width: `${Math.round(metrics.imacWidthPx * 0.27)}px`,
              height: `${footHeightPx}px`,
            }}
            className="cw-imac-l-stand-foot rounded-b-[4px]"
          />
          <div
            style={{
              width: `${Math.round(metrics.imacWidthPx * 0.34)}px`,
              height: isMobilePortrait ? '6px' : '10px',
            }}
            className="-mt-[3px] rounded-full bg-black/25 blur-[5px]"
          />
        </div>
      </div>
    );
  }
);

ClickWheelImacBackdrop.displayName = 'ClickWheelImacBackdrop';
