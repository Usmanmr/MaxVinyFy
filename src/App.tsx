import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  clampSeekTime,
  resolveTrackById,
  ensureUniqueTrackIds,
  getNextTrackId,
  getPreviousTrackIdAction,
  calculatePlaybackRate,
  computeDominantAccentFromRgbSamples,
  shouldEnableLowPowerByHardware,
  classifyViewportLayout,
  shouldTriggerTrackCrossfade,
  removePlaylistById,
  resolveActiveArtworkState,
  EMPTY_STANDBY_TRACK,
  EMPTY_STANDBY_PLAYLIST,
  type PlaylistPack,
  type TrackItem,
  type TrackImageCandidate,
  type YouTubeGrabFrame,
  type DominantThemePalette,
  type ViewportLayoutMode,
} from './utils/playerLogic';
import {
  THEME_REGISTRY,
  getThemeById,
  loadSavedThemeId,
  saveThemeId,
} from './themes/themeRegistry';
import {
  SAVED_PLAYLISTS_STORAGE_KEY,
  LEGACY_SAVED_PLAYLISTS_STORAGE_KEY,
  loadSpotifySessionFromStorage,
  saveSpotifySessionToStorage,
  clearAllUserSpotifyDataFromStorage,
  isSpotifySessionExpired,
  parseSpotifyCallbackMessage,
  mapSpotifyOAuthError,
  type SpotifySession,
} from './utils/spotifyAuth';
import { retroAudio } from './utils/retroAudioEngine';
import { playbackClockStore } from './utils/playbackStore';
import { TurntableDeck } from './components/TurntableDeck';
import { ReelToReelDeck } from './components/ReelToReelDeck';
import { CassetteDeck } from './components/CassetteDeck';
import { ClickWheelDeck } from './components/ClickWheelDeck';
import { SquirclePmpDeck } from './components/SquirclePmpDeck';
import { Desktop98Deck } from './components/Desktop98Deck';
import { StreamlineDeck } from './components/StreamlineDeck';
import { StreamlinePlayerBar } from './components/StreamlinePlayerBar';
import { AuroraDeck } from './components/AuroraDeck';
import { CdHifiDeck } from './components/CdHifiDeck';
import { RetroTvTable, PlaylistQueueBox, BrandHeader } from './components/RetroTvTable';
import { buildStreamlineAmbientGradient } from './utils/streamlineLogic';
import {
  AURORA_PALETTE,
  extractTwoAuroraAccentsFromRgbSamples,
  type AuroraDualAccents,
} from './utils/auroraLogic';
import { SpotifyConnectModal } from './components/SpotifyConnectModal';
import { AndroidAppModal } from './components/AndroidAppModal';
import { GlobalThemeSelector } from './components/GlobalThemeSelector';

const HIDE_BOX_ART_STORAGE_KEY = 'maxyoutify_hide_box_art_v1';

const SYNTH_PRESETS: TrackItem['synthPreset'][] = [
  'midnight-synth',
  'cyber-electro',
  'classic-funk',
  'velvet-soul',
  'pacific-yacht',
];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export default function App() {
  // Clean logged-out initial state: only restore saved playlists when an authenticated user session exists
  const [spotifySession, setSpotifySession] = useState<SpotifySession | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(LEGACY_SAVED_PLAYLISTS_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
    }
    return loadSpotifySessionFromStorage();
  });

  const [playlists, setPlaylists] = useState<PlaylistPack[]>(() => {
    if (typeof window !== 'undefined' && loadSpotifySessionFromStorage()) {
      try {
        const raw = window.localStorage.getItem(SAVED_PLAYLISTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((pl: PlaylistPack) => ({
              ...pl,
              tracks: ensureUniqueTrackIds(pl.tracks || []),
            }));
          }
        }
      } catch {
        // ignore storage parse errors
      }
    }
    return [];
  });
  const [activePlaylistId, setActivePlaylistId] = useState<string>(
    () => playlists[0]?.id || ''
  );
  const [currentTrackId, setCurrentTrackId] = useState<string>(
    () => playlists[0]?.tracks[0]?.id || ''
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isTvFullscreen, setIsTvFullscreen] = useState<boolean>(false);
  const [repeatOne, setRepeatOne] = useState<boolean>(false);
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<boolean>(false);
  const [seekEvent, setSeekEvent] = useState<{ timeSec: number; nonce: number }>({
    timeSec: 0,
    nonce: 0,
  });

  // Visual Theme Registry state (persisted in localStorage)
  const [activeThemeId, setActiveThemeId] = useState<string>(() => loadSavedThemeId());
  const activeTheme = getThemeById(activeThemeId);

  const [hideBoxArt, setHideBoxArt] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(HIDE_BOX_ART_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleHideBoxArt = useCallback(() => {
    setHideBoxArt((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(HIDE_BOX_ART_STORAGE_KEY, next ? 'true' : 'false');
        } catch {
          // ignore storage quota errors
        }
      }
      return next;
    });
  }, []);

  const handleSelectTheme = useCallback((nextThemeId: string) => {
    retroAudio.cancelPendingThemeEffects();
    const persisted = saveThemeId(nextThemeId);
    setActiveThemeId(persisted);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', activeTheme.id);
    }
    retroAudio.setSoundTheme(activeTheme.id);
  }, [activeTheme.id]);

  // Responsive viewport classification (desktop-tablet | mobile-landscape | mobile-portrait)
  const [viewportLayout, setViewportLayout] = useState<ViewportLayoutMode>(() =>
    typeof window !== 'undefined'
      ? classifyViewportLayout(window.innerWidth, window.innerHeight)
      : 'desktop-tablet'
  );

  // Power, Visibility, Night Mode & Motion Preference states
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [lowPowerMode, setLowPowerMode] = useState<boolean>(() =>
    typeof navigator !== 'undefined'
      ? shouldEnableLowPowerByHardware(navigator.hardwareConcurrency)
      : false
  );
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [guidanceActive, setGuidanceActive] = useState<boolean>(true);

  // Turntable console hardware state
  const [rpm, setRpm] = useState<33 | 45>(33);
  const [pitchPercent, setPitchPercent] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [vinylCrackle, setVinylCrackle] = useState<boolean>(true);
  const [needleDropCrackle, setNeedleDropCrackle] = useState<boolean>(true);
  const [crossfadeSec, setCrossfadeSec] = useState<number>(3);

  // Spotify Authorization Code + PKCE Connection state
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState<boolean>(false);
  const [isSpotifySigningIn, setIsSpotifySigningIn] = useState<boolean>(false);
  const [spotifyAuthError, setSpotifyAuthError] = useState<string | null>(null);
  const spotifyConnected = Boolean(spotifySession?.accessToken);
  const spotifyUserLabel = spotifySession?.user?.displayName || 'Connect Spotify';

  // Android Standalone App Install state
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState<boolean>(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(false);

  const activePlaylist =
    playlists.find((p) => p.id === activePlaylistId) || playlists[0] || EMPTY_STANDBY_PLAYLIST;
  const resolvedActive = resolveTrackById(activePlaylist.tracks, currentTrackId);
  const activeTrack =
    resolvedActive.track || activePlaylist.tracks[0] || EMPTY_STANDBY_TRACK;
  const needsInitialSpotifyConnect = !spotifyConnected && playlists.length === 0;
  const effectiveRate = calculatePlaybackRate(rpm, pitchPercent);

  const [themePalette, setThemePalette] = useState<DominantThemePalette>(() =>
    computeDominantAccentFromRgbSamples([[24, 182, 224]], 'MaxYoutify')
  );
  const [auroraAccents, setAuroraAccents] = useState<AuroraDualAccents>(() =>
    extractTwoAuroraAccentsFromRgbSamples([], 'standby-empty')
  );

  // Dual-slot ambient gradient state for Streamline's 600ms dominant-color crossfade
  const [ambientLayerIndex, setAmbientLayerIndex] = useState<0 | 1>(0);
  const [ambientGradients, setAmbientGradients] = useState<[string, string]>(() => {
    const initialGrad = buildStreamlineAmbientGradient('#19C6A3');
    return [initialGrad, initialGrad];
  });
  const ambientLayerIndexRef = useRef<0 | 1>(0);
  const ambientGradientsRef = useRef<[string, string]>(ambientGradients);
  ambientLayerIndexRef.current = ambientLayerIndex;
  ambientGradientsRef.current = ambientGradients;

  useEffect(() => {
    const nextGradient = buildStreamlineAmbientGradient(
      themePalette.primaryHex,
      themePalette.lightHex,
      themePalette.darkHex
    );
    const currentIdx = ambientLayerIndexRef.current;
    if (ambientGradientsRef.current[currentIdx] === nextGradient) return;
    const nextIdx: 0 | 1 = currentIdx === 0 ? 1 : 0;
    setAmbientGradients((prev) => {
      const updated: [string, string] = [...prev] as [string, string];
      updated[nextIdx] = nextGradient;
      return updated;
    });
    setAmbientLayerIndex(nextIdx);
  }, [themePalette.primaryHex, themePalette.lightHex, themePalette.darkHex]);

  const spotifySessionRef = useRef<SpotifySession | null>(spotifySession);
  spotifySessionRef.current = spotifySession;
  const pendingOAuthStateRef = useRef<string>('');
  const oauthPopupWatchRef = useRef<number | null>(null);

  const crossfadingTrackIdRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // Keep refs synchronized so event handlers maintain stable references
  const stateRef = useRef({
    activePlaylist,
    activeTrack,
    currentTrackId: activeTrack.id,
    isPlaying,
    isTvFullscreen,
    repeatOne,
    shuffleEnabled,
    effectiveRate,
    crossfadeSec,
    lowPowerMode,
  });
  stateRef.current = {
    activePlaylist,
    activeTrack,
    currentTrackId: activeTrack.id,
    isPlaying,
    isTvFullscreen,
    repeatOne,
    shuffleEnabled,
    effectiveRate,
    crossfadeSec,
    lowPowerMode,
  };

  // Sync active track duration to external playback clock store
  useEffect(() => {
    crossfadingTrackIdRef.current = null;
    playbackClockStore.setTrackDuration(activeTrack.durationSec);
  }, [activeTrack.id, activeTrack.durationSec]);

  // Screen Wake Lock while playing, released on pause or tab hidden
  useEffect(() => {
    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // ignore
        }
        wakeLockRef.current = null;
      }
    };

    if (!isPlaying || isDocumentHidden) {
      releaseWakeLock();
      return;
    }

    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
        };
        if (nav.wakeLock && typeof nav.wakeLock.request === 'function') {
          const sentinel = await nav.wakeLock.request('screen');
          if (cancelled) {
            await sentinel.release();
          } else {
            wakeLockRef.current = sentinel;
          }
        }
      } catch {
        // WakeLock may be disallowed by browser permissions policy in iframes
      }
    };

    requestWakeLock();
    return () => {
      cancelled = true;
      releaseWakeLock();
    };
  }, [isPlaying, isDocumentHidden]);

  // Responsive Viewport & Orientation Listener
  useEffect(() => {
    const syncViewport = () => {
      setViewportLayout(classifyViewportLayout(window.innerWidth, window.innerHeight));
    };
    syncViewport();
    window.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('orientationchange', syncViewport, { passive: true });
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  // Visibility & Reduced-Motion listeners: pause all active loops when hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';
      setIsDocumentHidden(hidden);
      retroAudio.setDocumentHidden(hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let mediaQuery: MediaQueryList | null = null;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      mediaQuery.addEventListener?.('change', handleMotionChange);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      mediaQuery?.removeEventListener?.('change', handleMotionChange);
    };
  }, []);

  // Stop initial "Connect Spotify" blink and hand-pointer nudge after 10 seconds OR after first user interaction
  useEffect(() => {
    if (!guidanceActive) return;

    const stopGuidance = () => setGuidanceActive(false);
    const timeoutId = window.setTimeout(stopGuidance, 10000);

    window.addEventListener('pointerdown', stopGuidance, { once: true, passive: true });
    window.addEventListener('keydown', stopGuidance, { once: true, passive: true });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('pointerdown', stopGuidance);
      window.removeEventListener('keydown', stopGuidance);
    };
  }, [guidanceActive]);

  // Detect Android standalone mode & capture native beforeinstallprompt
  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
      setIsStandaloneApp(standalone);
    };
    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsStandaloneApp(true);
      setDeferredInstallPrompt(null);
    });
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleTriggerAndroidInstall = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredInstallPrompt(null);
      setIsAndroidModalOpen(false);
    }
  }, [deferredInstallPrompt]);

  // Extract dominant color from the active track's album cover image via offscreen canvas
  useEffect(() => {
    let cancelled = false;
    const applyPaletteVariables = (
      palette: DominantThemePalette,
      dualAccents: AuroraDualAccents
    ) => {
      setThemePalette(palette);
      setAuroraAccents(dualAccents);
      const root = document.documentElement;
      root.style.setProperty('--accent-primary', palette.primaryHex);
      root.style.setProperty('--accent-light', palette.lightHex);
      root.style.setProperty('--accent-soft-bg', palette.softBgRgba);
      root.style.setProperty('--accent-border', palette.borderRgba);
      root.style.setProperty('--accent-glow', palette.glowRgba);
      root.style.setProperty('--vu-start', palette.vuStartHex);
      root.style.setProperty('--vu-mid', palette.vuMidHex);
      root.style.setProperty('--vu-peak', palette.vuPeakHex);
      root.style.setProperty('--tv-outer-bg', palette.tvCabinetGradient);
      root.style.setProperty('--tv-outer-border', palette.tvCabinetBorderHex);
      root.style.setProperty('--aurora-accent-1', dualAccents.primaryHex);
      root.style.setProperty('--aurora-accent-2', dualAccents.secondaryHex);
    };

    const seedKey =
      activeTrack.id === 'standby-empty'
        ? 'standby-empty'
        : `${activeTrack.id}-${activeTrack.title}`;
    const seedFallback = computeDominantAccentFromRgbSamples(
      [],
      `${activeTrack.id}-${activeTrack.title}`
    );
    const auroraSeedFallback = extractTwoAuroraAccentsFromRgbSamples([], seedKey);

    const primaryArtUrl =
      resolveActiveArtworkState(activeTrack, 0).activeUrl || activeTrack.artworkUrl;

    if (!primaryArtUrl) {
      applyPaletteVariables(seedFallback, auroraSeedFallback);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const size = 24;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          applyPaletteVariables(seedFallback, auroraSeedFallback);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size).data;
        const samples: Array<[number, number, number]> = [];
        for (let i = 0; i < imageData.length; i += 4) {
          if (imageData[i + 3] < 128) continue;
          samples.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
        }
        const extracted = computeDominantAccentFromRgbSamples(
          samples,
          `${activeTrack.id}-${activeTrack.title}`
        );
        const extractedAurora = extractTwoAuroraAccentsFromRgbSamples(samples, seedKey);
        applyPaletteVariables(extracted, extractedAurora);
      } catch {
        applyPaletteVariables(seedFallback, auroraSeedFallback);
      }
    };
    img.onerror = () => {
      if (!cancelled) applyPaletteVariables(seedFallback, auroraSeedFallback);
    };
    img.src = primaryArtUrl;

    return () => {
      cancelled = true;
    };
  }, [activeTrack]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullScreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      setIsFullScreen(false);
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullScreen((prev) => !prev);
    }
  }, []);

  const handleToggleLowPowerMode = useCallback(() => {
    setLowPowerMode((prev) => !prev);
  }, []);

  const handleToggleNightMode = useCallback(() => {
    setNightMode((prev) => !prev);
  }, []);

  const mapRawTracksToTrackItems = useCallback(
    (
      rawTracks: Array<{
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
      }>,
      fallbackCoverUrl: string
    ): TrackItem[] => {
      const mapped = rawTracks.map((raw, idx) => {
        const resolvedArt = raw.artworkUrl ? raw.artworkUrl.trim() : '';
        const candidateImages: TrackImageCandidate[] =
          Array.isArray(raw.images) && raw.images.length > 0
            ? raw.images.filter((img) => img.url && img.url !== fallbackCoverUrl)
            : resolvedArt && resolvedArt !== fallbackCoverUrl
              ? [{ url: resolvedArt, width: 640, height: 640 }]
              : [];
        return {
          id: raw.id,
          title: raw.title,
          artist: raw.artist,
          album: raw.album || 'Spotify Playlist',
          durationSec: raw.durationSec || 180,
          bpm: raw.bpm || 110,
          year: raw.year || 2024,
          artworkUrl: resolvedArt,
          images: candidateImages,
          spotifyUri: raw.spotifyUri,
          previewAudioUrl: raw.previewAudioUrl,
          youtubeVideoId: '',
          synthPreset: SYNTH_PRESETS[idx % SYNTH_PRESETS.length],
          tvFrames: [],
        };
      });
      return ensureUniqueTrackIds(mapped);
    },
    []
  );

  // External 1Hz Playback Clock Timer: updates playbackClockStore once per second ONLY when playing & visible
  // Also triggers Web Audio GainNode linearRampToValueAtTime crossfade when approaching track end!
  useEffect(() => {
    if (
      !isPlaying ||
      isDocumentHidden ||
      activeTrack.id === 'standby-empty' ||
      activeTrack.durationSec <= 0
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      const {
        activeTrack: curTrack,
        activePlaylist: curPlaylist,
        repeatOne: isRepeat,
        shuffleEnabled: isShuffle,
        effectiveRate: rate,
        crossfadeSec: fadeSec,
        lowPowerMode: lowPwr,
      } = stateRef.current;

      const prevSec = playbackClockStore.getCurrentTimeSec();
      const realAudioSec = retroAudio.getCurrentAudioTime();
      const nextSec =
        realAudioSec !== null && Math.abs(realAudioSec - prevSec) < 3
          ? realAudioSec
          : prevSec + 1 * rate;

      // Check whether to trigger Web Audio linearRampToValueAtTime crossfade into next track
      if (
        !stateRef.current.isTvFullscreen &&
        shouldTriggerTrackCrossfade({
          currentTimeSec: nextSec,
          durationSec: curTrack.durationSec,
          crossfadeSec: fadeSec,
          lowPowerMode: lowPwr,
          isManualSkip: false,
          alreadyCrossfading: crossfadingTrackIdRef.current === curTrack.id,
        })
      ) {
        crossfadingTrackIdRef.current = curTrack.id;
        const nextTrackId = getNextTrackId(
          curPlaylist.tracks,
          curTrack.id,
          isRepeat,
          isShuffle
        );
        const nextTrack = resolveTrackById(curPlaylist.tracks, nextTrackId).track || curTrack;
        playbackClockStore.setTrackDuration(nextTrack.durationSec);
        playbackClockStore.setTime(0, true);
        setCurrentTrackId(nextTrack.id);
        retroAudio.crossfadeToTrack(nextTrack, rate, fadeSec, lowPwr);
        return;
      }

      if (nextSec >= curTrack.durationSec) {
        const nextTrackId = getNextTrackId(
          curPlaylist.tracks,
          curTrack.id,
          isRepeat,
          isShuffle
        );
        const nextTrack = resolveTrackById(curPlaylist.tracks, nextTrackId).track || curTrack;
        playbackClockStore.setTime(0, true);
        if (nextTrack.id !== curTrack.id) {
          playbackClockStore.setTrackDuration(nextTrack.durationSec);
          setCurrentTrackId(nextTrack.id);
          if (!stateRef.current.isTvFullscreen) {
            retroAudio.startPlayback(nextTrack, rate, 0);
          }
        } else if (!stateRef.current.isTvFullscreen) {
          retroAudio.startPlayback(curTrack, rate, 0);
        }
        return;
      }

      playbackClockStore.setTime(nextSec);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPlaying, isDocumentHidden, activeTrack.id, activeTrack.durationSec]);

  // Cache resolved YouTube video IDs and Spotify track artwork into state when RetroTvTable searches YouTube
  const handleResolvedTrackMetadata = useCallback(
    (trackId: string, artworkUrl: string, videoId: string, frames: YouTubeGrabFrame[]) => {
      setPlaylists((prev) =>
        prev.map((pl) => ({
          ...pl,
          tracks: pl.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  artworkUrl: artworkUrl || t.artworkUrl,
                  images:
                    artworkUrl && (!t.images || !t.images.some((img) => img.url === artworkUrl))
                      ? [{ url: artworkUrl, width: 640, height: 640 }, ...(t.images || [])]
                      : t.images,
                  youtubeVideoId: videoId || t.youtubeVideoId,
                  tvFrames: frames.length > 0 ? frames : t.tvFrames,
                }
              : t
          ),
        }))
      );
    },
    []
  );

  const handleResolvedPerTrackArtwork = useCallback((trackId: string, artworkUrl: string) => {
    if (!trackId || !artworkUrl) return;
    setPlaylists((prev) =>
      prev.map((pl) => ({
        ...pl,
        tracks: pl.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                artworkUrl,
                images: [
                  { url: artworkUrl, width: 640, height: 640 },
                  ...(t.images || []).filter((img) => img.url !== artworkUrl),
                ],
              }
            : t
        ),
      }))
    );
  }, []);

  const handleSpotifyLogout = useCallback((reasonMessage?: string) => {
    if (oauthPopupWatchRef.current !== null) {
      window.clearInterval(oauthPopupWatchRef.current);
      oauthPopupWatchRef.current = null;
    }
    pendingOAuthStateRef.current = '';
    clearAllUserSpotifyDataFromStorage();
    setSpotifySession(null);
    setIsSpotifySigningIn(false);
    setSpotifyAuthError(reasonMessage || null);
    setPlaylists([]);
    setActivePlaylistId('');
    setCurrentTrackId('');
    setIsPlaying(false);
    playbackClockStore.setTrackDuration(0);
    playbackClockStore.setTime(0, true);
    retroAudio.pausePlayback();
  }, []);

  const refreshSpotifyAccessToken = useCallback(
    async (sessionOverride?: SpotifySession): Promise<SpotifySession | null> => {
      const targetSession = sessionOverride || spotifySessionRef.current;
      if (!targetSession?.refreshToken) {
        handleSpotifyLogout(mapSpotifyOAuthError('session_expired'));
        return null;
      }
      try {
        const res = await fetch('/api/spotify/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: targetSession.refreshToken }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          accessToken?: string;
          refreshToken?: string;
          expiresIn?: number;
          scope?: string;
          errorCode?: string;
          error?: string;
        };
        if (!res.ok || !data.accessToken) {
          handleSpotifyLogout(
            mapSpotifyOAuthError(data.errorCode || 'session_expired', data.error)
          );
          return null;
        }
        const refreshedSession: SpotifySession = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || targetSession.refreshToken,
          expiresAtMs: Date.now() + (data.expiresIn || 3600) * 1000,
          scope: data.scope || targetSession.scope,
          user: targetSession.user,
        };
        saveSpotifySessionToStorage(refreshedSession);
        setSpotifySession(refreshedSession);
        return refreshedSession;
      } catch {
        setSpotifyAuthError(mapSpotifyOAuthError('network_error'));
        return null;
      }
    },
    [handleSpotifyLogout]
  );

  const ensureValidSpotifySession = useCallback(
    async (sessionOverride?: SpotifySession): Promise<SpotifySession | null> => {
      const current = sessionOverride || spotifySessionRef.current;
      if (!current) return null;
      if (!isSpotifySessionExpired(current)) {
        return current;
      }
      if (current.refreshToken) {
        return refreshSpotifyAccessToken(current);
      }
      handleSpotifyLogout(mapSpotifyOAuthError('session_expired'));
      return null;
    },
    [refreshSpotifyAccessToken, handleSpotifyLogout]
  );

  const fetchTracksForSpotifyPlaylistId = useCallback(
    async (
      spotifyPlaylistId: string,
      sessionOverride?: SpotifySession | null
    ): Promise<{ name: string; tracks: TrackItem[] } | null> => {
      const activeSession = await ensureValidSpotifySession(sessionOverride || undefined);
      const runFetch = async (token?: string) =>
        fetch(`/api/spotify/user-playlist-tracks?id=${encodeURIComponent(spotifyPlaylistId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

      let res = await runFetch(activeSession?.accessToken);
      if (res.status === 401 && activeSession?.refreshToken) {
        const refreshed = await refreshSpotifyAccessToken(activeSession);
        if (refreshed) {
          res = await runFetch(refreshed.accessToken);
        }
      }
      if (res.status === 401) {
        handleSpotifyLogout(mapSpotifyOAuthError('session_expired'));
        throw new Error(mapSpotifyOAuthError('session_expired'));
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data.tracks) || data.tracks.length === 0) return null;

      return {
        name: data.name || 'Spotify Playlist',
        tracks: mapRawTracksToTrackItems(data.tracks, data.coverUrl || ''),
      };
    },
    [
      ensureValidSpotifySession,
      refreshSpotifyAccessToken,
      handleSpotifyLogout,
      mapRawTracksToTrackItems,
    ]
  );

  const syncAuthenticatedSpotifyLibrary = useCallback(
    async (sessionOverride?: SpotifySession) => {
      setIsLoadingPlaylist(true);
      setSpotifyAuthError(null);
      try {
        let activeSession = await ensureValidSpotifySession(sessionOverride);
        if (!activeSession) {
          throw new Error(mapSpotifyOAuthError('session_expired'));
        }

        let res = await fetch('/api/spotify/user-playlists', {
          headers: { Authorization: `Bearer ${activeSession.accessToken}` },
        });
        if (res.status === 401 && activeSession.refreshToken) {
          const refreshed = await refreshSpotifyAccessToken(activeSession);
          if (refreshed) {
            activeSession = refreshed;
            res = await fetch('/api/spotify/user-playlists', {
              headers: { Authorization: `Bearer ${activeSession.accessToken}` },
            });
          }
        }

        if (res.status === 401) {
          const msg = mapSpotifyOAuthError('session_expired');
          handleSpotifyLogout(msg);
          throw new Error(msg);
        }

        if (!res.ok) {
          const errJson = (await res.json().catch(() => ({}))) as {
            errorCode?: string;
            error?: string;
          };
          const msg = mapSpotifyOAuthError(errJson.errorCode || 'network_error', errJson.error);
          setSpotifyAuthError(msg);
          throw new Error(msg);
        }

        const data = (await res.json()) as {
          user?: { id: string; displayName: string; email?: string };
          playlists?: Array<{
            id: string;
            name: string;
            coverUrl: string;
            totalTracks: number;
          }>;
        };

        const updatedSession: SpotifySession = {
          ...activeSession,
          user: data.user
            ? {
                id: data.user.id || 'spotify-user',
                displayName: data.user.displayName || 'Spotify User',
                email: data.user.email,
              }
            : activeSession.user,
        };
        saveSpotifySessionToStorage(updatedSession);
        setSpotifySession(updatedSession);

        const rawPlaylists = Array.isArray(data.playlists) ? data.playlists : [];
        if (rawPlaylists.length === 0) {
          setPlaylists([]);
          setActivePlaylistId('');
          setCurrentTrackId('');
          return;
        }

        const firstSummary = rawPlaylists[0];
        const firstLoaded = await fetchTracksForSpotifyPlaylistId(
          firstSummary.id,
          updatedSession
        ).catch(() => null);

        const syncedPacks: PlaylistPack[] = rawPlaylists.map((pl, idx) => {
          const isFirstWithTracks = idx === 0 && firstLoaded && firstLoaded.tracks.length > 0;
          return {
            id: `spotify-user-${pl.id}`,
            spotifyPlaylistId: pl.id,
            name: pl.name.startsWith('Spotify ·') ? pl.name : `Spotify · ${pl.name}`,
            subtitle: `${pl.totalTracks || (isFirstWithTracks ? firstLoaded!.tracks.length : 0)} tracks · Spotify`,
            source: 'spotify-live',
            tracks: isFirstWithTracks ? firstLoaded!.tracks : [],
          };
        });

        const firstTrack = syncedPacks[0]?.tracks[0];
        setPlaylists(syncedPacks);
        setActivePlaylistId(syncedPacks[0]?.id || '');
        setCurrentTrackId(firstTrack?.id || '');
        playbackClockStore.setTrackDuration(firstTrack?.durationSec || 0);
        playbackClockStore.setTime(0, true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : mapSpotifyOAuthError('network_error');
        setSpotifyAuthError(message);
        throw err;
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    [
      ensureValidSpotifySession,
      refreshSpotifyAccessToken,
      handleSpotifyLogout,
      fetchTracksForSpotifyPlaylistId,
    ]
  );

  const handleStartSpotifyLogin = useCallback(async () => {
    setGuidanceActive(false);
    setSpotifyAuthError(null);
    setIsSpotifySigningIn(true);

    const popup = window.open(
      'about:blank',
      'spotify-oauth-popup',
      'width=520,height=720,menubar=no,toolbar=no'
    );

    if (!popup) {
      const blockedMsg = mapSpotifyOAuthError('popup_blocked');
      setSpotifyAuthError(blockedMsg);
      setIsSpotifySigningIn(false);
      throw new Error(blockedMsg);
    }

    try {
      popup.document.write(
        '<!doctype html><html><body style="background:#12100e;color:#f5efe6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p>Connecting to Spotify...</p></body></html>'
      );
    } catch {
      // ignore cross-context write issues
    }

    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const res = await fetch(
        `/api/spotify/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        state?: string;
        errorCode?: string;
        error?: string;
      };

      if (!res.ok || !data.url) {
        try {
          popup.close();
        } catch {
          // ignore
        }
        const msg = mapSpotifyOAuthError(data.errorCode || 'missing_client_id', data.error);
        setSpotifyAuthError(msg);
        setIsSpotifySigningIn(false);
        throw new Error(msg);
      }

      pendingOAuthStateRef.current = data.state || '';
      popup.location.href = data.url;

      if (oauthPopupWatchRef.current !== null) {
        window.clearInterval(oauthPopupWatchRef.current);
      }
      oauthPopupWatchRef.current = window.setInterval(() => {
        if (popup.closed) {
          if (oauthPopupWatchRef.current !== null) {
            window.clearInterval(oauthPopupWatchRef.current);
            oauthPopupWatchRef.current = null;
          }
          setIsSpotifySigningIn(false);
        }
      }, 400);
    } catch (err) {
      try {
        popup.close();
      } catch {
        // ignore
      }
      setIsSpotifySigningIn(false);
      if (err instanceof Error) {
        setSpotifyAuthError(err.message);
        throw err;
      }
      const fallbackMsg = mapSpotifyOAuthError('network_error');
      setSpotifyAuthError(fallbackMsg);
      throw new Error(fallbackMsg);
    }
  }, []);

  // Listen for OAuth 2.0 + PKCE popup callback results
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const parsed = parseSpotifyCallbackMessage(
        event.data,
        pendingOAuthStateRef.current || undefined
      );
      if (!parsed) return;

      if (oauthPopupWatchRef.current !== null) {
        window.clearInterval(oauthPopupWatchRef.current);
        oauthPopupWatchRef.current = null;
      }
      pendingOAuthStateRef.current = '';
      setIsSpotifySigningIn(false);

      if (!parsed.ok) {
        setSpotifyAuthError(parsed.message);
        return;
      }

      const nextSession: SpotifySession = {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAtMs: Date.now() + parsed.expiresInSec * 1000,
        scope: parsed.scope,
      };
      saveSpotifySessionToStorage(nextSession);
      setSpotifySession(nextSession);
      syncAuthenticatedSpotifyLibrary(nextSession).catch(() => {});
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (oauthPopupWatchRef.current !== null) {
        window.clearInterval(oauthPopupWatchRef.current);
      }
    };
  }, [syncAuthenticatedSpotifyLibrary]);

  // Restore or refresh an existing authenticated user session on mount
  useEffect(() => {
    const existing = loadSpotifySessionFromStorage();
    if (!existing) return;
    if (isSpotifySessionExpired(existing)) {
      refreshSpotifyAccessToken(existing).then((refreshed) => {
        if (refreshed && playlists.length === 0) {
          syncAuthenticatedSpotifyLibrary(refreshed).catch(() => {});
        }
      });
    } else if (playlists.length === 0) {
      syncAuthenticatedSpotifyLibrary(existing).catch(() => {});
    }
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadPlaylistByIdOrUrl = useCallback(
    async (idOrUrl: string) => {
      setGuidanceActive(false);
      const matchUrl = idOrUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      const cleanId = matchUrl ? matchUrl[1] : idOrUrl.replace(/[^a-zA-Z0-9]/g, '');
      if (!cleanId) {
        throw new Error('Invalid Spotify Playlist URL or ID.');
      }

      setIsLoadingPlaylist(true);
      try {
        let loaded = await fetchTracksForSpotifyPlaylistId(cleanId);
        if (!loaded || loaded.tracks.length === 0) {
          const publicRes = await fetch(`/api/spotify/playlist?id=${encodeURIComponent(cleanId)}`);
          if (publicRes.ok) {
            const pubData = await publicRes.json();
            if (Array.isArray(pubData.tracks) && pubData.tracks.length > 0) {
              loaded = {
                name: pubData.name || 'Spotify Playlist',
                tracks: mapRawTracksToTrackItems(pubData.tracks, pubData.coverUrl || ''),
              };
            }
          }
        }
        if (!loaded || loaded.tracks.length === 0) {
          throw new Error('Could not load tracks from that Spotify playlist.');
        }

        const newPackId = `spotify-pl-${cleanId}`;
        const newPack: PlaylistPack = {
          id: newPackId,
          spotifyPlaylistId: cleanId,
          name: loaded.name,
          subtitle: `${loaded.tracks.length} tracks · Spotify`,
          source: 'spotify-live',
          tracks: loaded.tracks,
        };

        const firstTrack = loaded.tracks[0];
        setPlaylists((prev) => [newPack, ...prev.filter((p) => p.id !== newPackId)]);
        setActivePlaylistId(newPackId);
        setCurrentTrackId(firstTrack?.id || '');
        playbackClockStore.setTrackDuration(firstTrack?.durationSec || 0);
        playbackClockStore.setTime(0, true);
        if (stateRef.current.isPlaying && firstTrack && !stateRef.current.isTvFullscreen) {
          retroAudio.startPlayback(firstTrack, stateRef.current.effectiveRate, 0);
        }
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    [fetchTracksForSpotifyPlaylistId, mapRawTracksToTrackItems]
  );

  const handleTogglePlay = useCallback(() => {
    const { activeTrack: curTrack, effectiveRate: rate, isTvFullscreen: tvFs } = stateRef.current;
    if (curTrack.id === 'standby-empty' || curTrack.durationSec <= 0) {
      setIsSpotifyModalOpen(true);
      return;
    }
    setIsPlaying((prev) => {
      const next = !prev;
      if (tvFs) {
        // In fullscreen YouTube owns audio: keep Spotify paused & muted cleanly
        retroAudio.pausePlayback();
        retroAudio.setMuted(true);
      } else if (next) {
        retroAudio.setMuted(false);
        retroAudio.startPlayback(curTrack, rate, playbackClockStore.getCurrentTimeSec());
      } else {
        retroAudio.pausePlayback();
      }
      return next;
    });
  }, []);

  const handleTvFullscreenChange = useCallback((enteringFullscreen: boolean) => {
    setIsTvFullscreen(enteringFullscreen);
    const { activeTrack: curTrack, effectiveRate: rate } = stateRef.current;
    if (enteringFullscreen) {
      retroAudio.pausePlayback();
      retroAudio.setMuted(true);
      if (curTrack.id !== 'standby-empty' && curTrack.durationSec > 0) {
        setIsPlaying(true);
      }
    } else {
      retroAudio.setMuted(false);
      if (curTrack.id !== 'standby-empty' && curTrack.durationSec > 0) {
        const syncedSec = clampSeekTime(playbackClockStore.getCurrentTimeSec(), curTrack.durationSec);
        retroAudio.startPlayback(curTrack, rate, syncedSec);
        setIsPlaying(true);
      }
    }
  }, []);

  const handleStopPlayback = useCallback(() => {
    setIsPlaying(false);
    playbackClockStore.setTime(0, true);
    retroAudio.pausePlayback();
    retroAudio.seekTo(0);
    setSeekEvent((prev) => ({ timeSec: 0, nonce: prev.nonce + 1 }));
  }, []);

  const handleSelectPlaylist = useCallback(
    async (playlistId: string) => {
      const targetPl = playlists.find((p) => p.id === playlistId);
      if (!targetPl) return;
      const initialTrack = targetPl.tracks[0];
      setActivePlaylistId(playlistId);
      setCurrentTrackId(initialTrack?.id || '');
      playbackClockStore.setTrackDuration(initialTrack?.durationSec || 0);
      playbackClockStore.setTime(0, true);

      if (targetPl.spotifyPlaylistId && targetPl.tracks.length <= 1) {
        setIsLoadingPlaylist(true);
        try {
          const loaded = await fetchTracksForSpotifyPlaylistId(targetPl.spotifyPlaylistId);
          if (loaded && loaded.tracks.length > 0) {
            setPlaylists((prev) =>
              prev.map((pl) => (pl.id === playlistId ? { ...pl, tracks: loaded.tracks } : pl))
            );
            if (stateRef.current.activePlaylist.id === playlistId) {
              const firstLoadedTrack = loaded.tracks[0];
              setCurrentTrackId(firstLoadedTrack?.id || '');
              playbackClockStore.setTrackDuration(firstLoadedTrack?.durationSec || 0);
              playbackClockStore.setTime(0, true);
              if (stateRef.current.isPlaying && firstLoadedTrack && !stateRef.current.isTvFullscreen) {
                retroAudio.startPlayback(firstLoadedTrack, stateRef.current.effectiveRate, 0);
              }
            }
            return;
          }
        } finally {
          setIsLoadingPlaylist(false);
        }
      }

      if (stateRef.current.isPlaying && initialTrack && !stateRef.current.isTvFullscreen) {
        retroAudio.startPlayback(initialTrack, stateRef.current.effectiveRate, 0);
      }
    },
    [playlists, fetchTracksForSpotifyPlaylistId]
  );

  // Persist playlists to localStorage whenever modified
  useEffect(() => {
    try {
      if (playlists.length > 0) {
        window.localStorage.setItem(SAVED_PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
      } else {
        window.localStorage.removeItem(SAVED_PLAYLISTS_STORAGE_KEY);
      }
    } catch {
      // ignore storage quota errors
    }
  }, [playlists]);

  const handleDeletePlaylist = useCallback(
    (playlistIdToDelete: string) => {
      setPlaylists((prev) => {
        const { remaining, nextActiveId } = removePlaylistById(
          prev,
          playlistIdToDelete,
          stateRef.current.activePlaylist.id
        );
        setActivePlaylistId(nextActiveId);
        const nextPlaylist =
          remaining.find((p) => p.id === nextActiveId) || remaining[0] || null;
        const nextTrack = nextPlaylist?.tracks[0] || null;
        if (nextTrack) {
          setCurrentTrackId(nextTrack.id);
          playbackClockStore.setTrackDuration(nextTrack.durationSec);
          playbackClockStore.setTime(0, true);
          if (stateRef.current.isPlaying && !stateRef.current.isTvFullscreen) {
            retroAudio.startPlayback(nextTrack, stateRef.current.effectiveRate, 0);
          }
        } else {
          setCurrentTrackId('');
          setIsPlaying(false);
          playbackClockStore.setTrackDuration(0);
          playbackClockStore.setTime(0, true);
          retroAudio.pausePlayback();
        }
        return remaining;
      });
    },
    []
  );

  // Manual track selection / skip: resolves strictly by unique track ID against the ORIGINAL unfiltered tracks array
  const handleSelectTrack = useCallback((trackId: string) => {
    const {
      activePlaylist: curPlaylist,
      activeTrack: prevTrack,
      effectiveRate: rate,
      isPlaying: wasPlaying,
      crossfadeSec: curCrossfadeSec,
      lowPowerMode: curLowPower,
    } = stateRef.current;
    const { track: nextTrack } = resolveTrackById(curPlaylist.tracks, trackId);
    if (!nextTrack) return;
    const isSwitchingDifferentTrack = prevTrack && prevTrack.id !== nextTrack.id;
    crossfadingTrackIdRef.current = null;
    setCurrentTrackId(nextTrack.id);
    playbackClockStore.setTrackDuration(nextTrack.durationSec);
    playbackClockStore.setTime(0, true);
    setIsPlaying(true);

    if (isSwitchingDifferentTrack && !stateRef.current.isTvFullscreen) {
      retroAudio.triggerTrackChangeHandlingCue(1260);
    }

    if (stateRef.current.isTvFullscreen) {
      retroAudio.pausePlayback();
      retroAudio.setMuted(true);
    } else if (wasPlaying && isSwitchingDifferentTrack) {
      retroAudio.setMuted(false);
      retroAudio.crossfadeToTrack(
        nextTrack,
        rate,
        Math.max(0.8, Math.min(2, curCrossfadeSec)),
        curLowPower
      );
    } else {
      retroAudio.setMuted(false);
      retroAudio.startPlayback(nextTrack, rate, 0);
    }
  }, []);

  const handleNextTrack = useCallback(() => {
    const {
      activePlaylist: curPlaylist,
      activeTrack: curTrack,
      shuffleEnabled: isShuffle,
    } = stateRef.current;
    if (curPlaylist.tracks.length === 0) return;
    const nextTrackId = getNextTrackId(curPlaylist.tracks, curTrack.id, false, isShuffle);
    if (nextTrackId) {
      handleSelectTrack(nextTrackId);
    }
  }, [handleSelectTrack]);

  const handleToggleShuffle = useCallback(() => {
    setShuffleEnabled((prev) => !prev);
  }, []);

  const handleToggleRepeatOne = useCallback(() => {
    setRepeatOne((r) => !r);
  }, []);

  const handlePreviousTrack = useCallback(
    (forcePrevious = false) => {
      const { activePlaylist: curPlaylist, activeTrack: curTrack } = stateRef.current;
      if (curPlaylist.tracks.length === 0) return;
      const action = getPreviousTrackIdAction(
        curPlaylist.tracks,
        curTrack.id,
        playbackClockStore.getCurrentTimeSec(),
        forcePrevious
      );
      if (action.action === 'restart') {
        playbackClockStore.setTime(0, true);
        retroAudio.seekTo(0);
        setSeekEvent((prev) => ({ timeSec: 0, nonce: prev.nonce + 1 }));
      } else if (action.targetTrackId) {
        handleSelectTrack(action.targetTrackId);
      }
    },
    [handleSelectTrack]
  );

  const handleSeek = useCallback((targetSec: number) => {
    const { activeTrack: curTrack } = stateRef.current;
    if (curTrack.id === 'standby-empty' || curTrack.durationSec <= 0) return;
    const clamped = clampSeekTime(targetSec, curTrack.durationSec);
    playbackClockStore.setTime(clamped, true);
    retroAudio.seekTo(clamped);
    setSeekEvent((prev) => ({ timeSec: clamped, nonce: prev.nonce + 1 }));
  }, []);

  const handleDragTonearmToTime = useCallback((targetSec: number) => {
    const { activeTrack: curTrack, isPlaying: playing, effectiveRate: rate } = stateRef.current;
    if (curTrack.id === 'standby-empty' || curTrack.durationSec <= 0) return;
    const clamped = clampSeekTime(targetSec, curTrack.durationSec);
    playbackClockStore.setTime(clamped, true);
    retroAudio.seekTo(clamped);
    setSeekEvent((prev) => ({ timeSec: clamped, nonce: prev.nonce + 1 }));
    if (!playing) {
      setIsPlaying(true);
      if (!stateRef.current.isTvFullscreen) {
        retroAudio.setMuted(false);
        retroAudio.startPlayback(curTrack, rate, clamped);
      }
    }
  }, []);

  const handleChangeRpm = useCallback(
    (nextRpm: 33 | 45) => {
      setRpm(nextRpm);
      const nextRate = calculatePlaybackRate(nextRpm, pitchPercent);
      retroAudio.setPlaybackRate(nextRate);
    },
    [pitchPercent]
  );

  const handleChangePitch = useCallback(
    (nextPitch: number) => {
      setPitchPercent(nextPitch);
      const nextRate = calculatePlaybackRate(rpm, nextPitch);
      retroAudio.setPlaybackRate(nextRate);
    },
    [rpm]
  );

  const handleScratch = useCallback((intensity: 'light' | 'classic' | 'backspin') => {
    retroAudio.triggerVinylScratch(intensity);
  }, []);

  const handleChangeVolume = useCallback((nextVol: number) => {
    setVolume(nextVol);
    retroAudio.setVolume(nextVol);
  }, []);

  const handleToggleVinylCrackle = useCallback(() => {
    setVinylCrackle((prev) => {
      const next = !prev;
      retroAudio.setCrackleLevel(next ? 0.25 : 0);
      return next;
    });
  }, []);

  const handleToggleNeedleDropCrackle = useCallback(() => {
    setNeedleDropCrackle((prev) => {
      const next = !prev;
      retroAudio.setNeedleDropCrackle(next);
      return next;
    });
  }, []);

  const handleChangeCrossfadeSec = useCallback((sec: number) => {
    setCrossfadeSec(Math.max(1, Math.min(5, Math.round(sec))));
  }, []);

  const handleOpenSpotifyModal = useCallback(() => {
    setGuidanceActive(false);
    setIsSpotifyModalOpen(true);
  }, []);

  const deckSharedProps = {
    track: activeTrack,
    isPlaying,
    isDocumentHidden,
    lowPowerMode,
    nightMode,
    prefersReducedMotion,
    rpm,
    pitchPercent,
    volume,
    vinylCrackle,
    needleDropCrackle,
    crossfadeSec,
    repeatOne,
    shuffleEnabled,
    isFullScreen,
    hideBoxArt,
    spotifyConnected,
    viewportLayout,
    themePalette,
    onTogglePlay: handleTogglePlay,
    onStop: handleStopPlayback,
    onPrevious: () => handlePreviousTrack(true),
    onNext: handleNextTrack,
    onSeek: handleSeek,
    onChangeRpm: handleChangeRpm,
    onChangePitch: handleChangePitch,
    onChangeVolume: handleChangeVolume,
    onChangeCrossfadeSec: handleChangeCrossfadeSec,
    onToggleRepeatOne: handleToggleRepeatOne,
    onToggleShuffle: handleToggleShuffle,
    onToggleVinylCrackle: handleToggleVinylCrackle,
    onToggleNeedleDropCrackle: handleToggleNeedleDropCrackle,
    onToggleLowPowerMode: handleToggleLowPowerMode,
    onToggleNightMode: handleToggleNightMode,
    onToggleFullScreen: handleToggleFullScreen,
    onOpenSpotifyModal: handleOpenSpotifyModal,
    onScratch: handleScratch,
    onDragTonearmToTime: handleDragTonearmToTime,
    onResolvedPerTrackArtwork: handleResolvedPerTrackArtwork,
    onResolvedTrackMetadata: handleResolvedTrackMetadata,
    isTvFullscreen,
    playlistTracks: activePlaylist.tracks,
    playlistName: activePlaylist.name,
    playlists,
    activePlaylistId: activePlaylist.id,
    onSelectPlaylist: handleSelectPlaylist,
    onSelectTrack: handleSelectTrack,
    seekEvent,
  };

  const isStreamlineTheme = activeTheme.id === 'streamline';
  const isAuroraTheme = activeTheme.id === 'aurora-deck';
  const isClickWheelTheme = activeTheme.id === 'click-wheel';
  const isSquircleTheme = activeTheme.id === 'squircle-pmp';
  const auroraAnimationsActive =
    isPlaying && !isDocumentHidden && !prefersReducedMotion && !lowPowerMode;

  const renderClickWheelImacVideoWindow = () => (
    <RetroTvTable
      track={activeTrack}
      isPlaying={isPlaying}
      isDocumentHidden={isDocumentHidden}
      volume={volume}
      lowPowerMode={lowPowerMode}
      prefersReducedMotion={prefersReducedMotion}
      themePalette={themePalette}
      activeThemeId={activeTheme.id}
      availableThemes={THEME_REGISTRY}
      onSelectTheme={handleSelectTheme}
      hideBrandHeader={true}
      seekEvent={seekEvent}
      onSeek={handleSeek}
      onTogglePlay={handleTogglePlay}
      onStop={handleStopPlayback}
      onPrevious={() => handlePreviousTrack(true)}
      onNext={handleNextTrack}
      onChangeVolume={handleChangeVolume}
      playlistTracks={activePlaylist.tracks}
      onSelectTrack={handleSelectTrack}
      onTvFullscreenChange={handleTvFullscreenChange}
      onResolvedTrackMetadata={handleResolvedTrackMetadata}
    />
  );

  const renderClickWheelImacLibraryWindow = () => (
    <PlaylistQueueBox
      playlists={playlists}
      activePlaylist={activePlaylist}
      activeTrackId={activeTrack.id}
      isPlaying={isPlaying}
      lowPowerMode={lowPowerMode}
      isLoadingPlaylist={isLoadingPlaylist}
      spotifyConnected={spotifyConnected}
      spotifyUserLabel={spotifyUserLabel}
      needsInitialSpotifyConnect={needsInitialSpotifyConnect}
      guidanceActive={guidanceActive}
      isDocumentHidden={isDocumentHidden}
      prefersReducedMotion={prefersReducedMotion}
      showCompactBrandHeader={false}
      themePalette={themePalette}
      auroraAccents={auroraAccents}
      activeThemeId={activeTheme.id}
      availableThemes={THEME_REGISTRY}
      onSelectTheme={handleSelectTheme}
      onSelectPlaylist={handleSelectPlaylist}
      onDeletePlaylist={handleDeletePlaylist}
      onSelectTrack={handleSelectTrack}
      onOpenSpotifyModal={handleOpenSpotifyModal}
      onResolvedPerTrackArtwork={handleResolvedPerTrackArtwork}
    />
  );

  const unifiedConsoleElement =
    activeTheme.id === 'aurora-deck' ? (
      <AuroraDeck key="aurora-deck" {...deckSharedProps} auroraAccents={auroraAccents} />
    ) : activeTheme.id === 'streamline' ? (
      <StreamlineDeck key="streamline" {...deckSharedProps} />
    ) : activeTheme.id === 'cd-hifi' ? (
      <CdHifiDeck key="cd-hifi" {...deckSharedProps} />
    ) : activeTheme.id === 'reel-to-reel' ? (
      <ReelToReelDeck key="reel-to-reel" {...deckSharedProps} />
    ) : activeTheme.id === 'cassette-deck' ? (
      <CassetteDeck key="cassette-deck" {...deckSharedProps} />
    ) : activeTheme.id === 'click-wheel' ? (
      <ClickWheelDeck
        key="click-wheel"
        {...deckSharedProps}
        renderImacLibraryWindow={renderClickWheelImacLibraryWindow}
        renderImacVideoWindow={renderClickWheelImacVideoWindow}
      />
    ) : activeTheme.id === 'squircle-pmp' ? (
      <SquirclePmpDeck key="squircle-pmp" {...deckSharedProps} />
    ) : activeTheme.id === 'desktop-98' ? (
      <Desktop98Deck key="desktop-98" {...deckSharedProps} />
    ) : (
      <TurntableDeck key="retro-turntable" {...deckSharedProps} />
    );

  return (
    <div
      data-theme={activeTheme.id}
      data-hide-box-art={hideBoxArt ? 'true' : 'false'}
      data-theme-primary={isAuroraTheme ? auroraAccents.primaryHex : themePalette.primaryHex}
      data-low-power={lowPowerMode ? 'true' : 'false'}
      data-night-mode={nightMode ? 'true' : 'false'}
      data-viewport-layout={viewportLayout}
      data-tv-fullscreen={isTvFullscreen ? 'true' : 'false'}
      data-spotify-audio-muted={isTvFullscreen ? 'true' : 'false'}
      data-spotify-audio-playing={isPlaying && !isTvFullscreen ? 'true' : 'false'}
      className={`app-viewport-shell relative ${
        isAuroraTheme
          ? 'bg-[#06070C] text-[#EAF2FF]'
          : isStreamlineTheme
          ? 'bg-[#0F1115] text-[#FFFFFF]'
          : 'bg-[#12100e] text-[#f5efe6]'
      } flex flex-col select-none ${nightMode ? 'night-driving-mode' : ''}`}
    >
      <GlobalThemeSelector
        activeThemeId={activeTheme.id}
        availableThemes={THEME_REGISTRY}
        themePalette={themePalette}
        hideBoxArt={hideBoxArt}
        isPlaying={isPlaying}
        isStandby={activeTrack.id === 'standby-empty' || activeTrack.durationSec <= 0}
        isDocumentHidden={isDocumentHidden}
        prefersReducedMotion={prefersReducedMotion}
        onSelectTheme={handleSelectTheme}
        onToggleHideBoxArt={handleToggleHideBoxArt}
      />
      {/* Ambient Backdrop: 30s Aurora Wash on Aurora Deck, 600ms Crossfade on Streamline, Static Radial on Hardware */}
      {isAuroraTheme ? (
        <div
          id="aurora-wash-backdrop"
          data-aurora-active={auroraAnimationsActive ? 'true' : 'false'}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06070C]"
        >
          <div
            className="aurora-wash-layer-a absolute -inset-16"
            style={{
              background: `radial-gradient(ellipse 68% 58% at 24% 24%, ${AURORA_PALETTE.washLoopColors[0]} 0%, transparent 70%)`,
              opacity: auroraAnimationsActive ? undefined : 0.06,
            }}
          />
          <div
            className="aurora-wash-layer-b absolute -inset-16"
            style={{
              background: `radial-gradient(ellipse 64% 56% at 76% 32%, ${AURORA_PALETTE.washLoopColors[1]} 0%, transparent 70%)`,
              opacity: auroraAnimationsActive ? undefined : 0.03,
            }}
          />
          <div
            className="aurora-wash-layer-c absolute -inset-16"
            style={{
              background: `radial-gradient(ellipse 70% 58% at 52% 82%, ${AURORA_PALETTE.washLoopColors[2]} 0%, transparent 72%)`,
              opacity: auroraAnimationsActive ? undefined : 0.03,
            }}
          />
        </div>
      ) : isStreamlineTheme ? (
        <div id="sl-ambient-backdrop" aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div
            style={{
              background: ambientGradients[0],
              opacity: ambientLayerIndex === 0 ? 1 : 0,
              transition: prefersReducedMotion ? 'none' : 'opacity 600ms ease',
            }}
            className="absolute inset-0"
          />
          <div
            style={{
              background: ambientGradients[1],
              opacity: ambientLayerIndex === 1 ? 1 : 0,
              transition: prefersReducedMotion ? 'none' : 'opacity 600ms ease',
            }}
            className="absolute inset-0"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          style={{
            background: nightMode
              ? 'radial-gradient(circle at 22% 15%, rgba(245, 158, 11, 0.14) 0%, transparent 55%)'
              : `radial-gradient(circle at 22% 15%, ${themePalette.softBgRgba} 0%, transparent 52%), radial-gradient(circle at 78% 85%, ${themePalette.softBgRgba} 0%, transparent 52%)`,
          }}
          className="pointer-events-none fixed inset-0 z-0"
        />
      )}

      <main className="relative z-10 flex-1 min-h-0 w-full flex flex-col">
        <div className={isStreamlineTheme ? 'sl-main-wrapper' : 'flex-1 min-h-0 w-full flex flex-col'}>
          <div className="main-deck-grid">
            {isClickWheelTheme || isSquircleTheme ? (
              <div
                id="turntable"
                className="deck-slot-turntable w-full h-full flex-1 flex flex-col justify-stretch min-h-0"
              >
                {unifiedConsoleElement}
              </div>
            ) : (
              <>
                {viewportLayout === 'desktop-tablet' && (
                  <>
                    {isStreamlineTheme && (
                      <div className="sl-left-brand-slot flex items-center">
                        <BrandHeader
                          themePalette={themePalette}
                          activeThemeId={activeTheme.id}
                          availableThemes={THEME_REGISTRY}
                          onSelectTheme={handleSelectTheme}
                          isPlaying={isPlaying}
                          isStandby={activeTrack.id === 'standby-empty'}
                          isDocumentHidden={isDocumentHidden}
                          prefersReducedMotion={prefersReducedMotion}
                        />
                      </div>
                    )}

                    <div
                      id="retro-tv"
                      className="deck-slot-tv flex flex-col justify-stretch min-h-0"
                    >
                      <RetroTvTable
                        track={activeTrack}
                        isPlaying={isPlaying}
                        isDocumentHidden={isDocumentHidden}
                        volume={volume}
                        lowPowerMode={lowPowerMode}
                        prefersReducedMotion={prefersReducedMotion}
                        themePalette={themePalette}
                        activeThemeId={activeTheme.id}
                        availableThemes={THEME_REGISTRY}
                        onSelectTheme={handleSelectTheme}
                        hideBrandHeader={isStreamlineTheme}
                        seekEvent={seekEvent}
                        onSeek={handleSeek}
                        onTogglePlay={handleTogglePlay}
                        onStop={handleStopPlayback}
                        onPrevious={() => handlePreviousTrack(true)}
                        onNext={handleNextTrack}
                        onChangeVolume={handleChangeVolume}
                        playlistTracks={activePlaylist.tracks}
                        onSelectTrack={handleSelectTrack}
                        onTvFullscreenChange={handleTvFullscreenChange}
                        onResolvedTrackMetadata={handleResolvedTrackMetadata}
                      />
                    </div>

                    <div
                      id="playlist-queue"
                      className="deck-slot-playlist flex flex-col justify-stretch rounded-[3px] min-h-0"
                    >
                      <PlaylistQueueBox
                        playlists={playlists}
                        activePlaylist={activePlaylist}
                        activeTrackId={activeTrack.id}
                        isPlaying={isPlaying}
                        lowPowerMode={lowPowerMode}
                        isLoadingPlaylist={isLoadingPlaylist}
                        spotifyConnected={spotifyConnected}
                        spotifyUserLabel={spotifyUserLabel}
                        needsInitialSpotifyConnect={needsInitialSpotifyConnect}
                        guidanceActive={guidanceActive}
                        isDocumentHidden={isDocumentHidden}
                        prefersReducedMotion={prefersReducedMotion}
                        themePalette={themePalette}
                        auroraAccents={auroraAccents}
                        activeThemeId={activeTheme.id}
                        availableThemes={THEME_REGISTRY}
                        onSelectTheme={handleSelectTheme}
                        onSelectPlaylist={handleSelectPlaylist}
                        onDeletePlaylist={handleDeletePlaylist}
                        onSelectTrack={handleSelectTrack}
                        onOpenSpotifyModal={handleOpenSpotifyModal}
                        onResolvedPerTrackArtwork={handleResolvedPerTrackArtwork}
                      />
                    </div>

                    {/* Right Pane Contains Unified Console / Hero Stage */}
                    <div
                      id="turntable"
                      className="deck-slot-turntable flex flex-col justify-stretch min-h-0"
                    >
                      {unifiedConsoleElement}
                    </div>
                  </>
                )}

                {viewportLayout === 'mobile-landscape' && (
                  <>
                    {isStreamlineTheme && (
                      <div className="sl-left-brand-slot flex items-center">
                        <BrandHeader
                          themePalette={themePalette}
                          activeThemeId={activeTheme.id}
                          availableThemes={THEME_REGISTRY}
                          onSelectTheme={handleSelectTheme}
                          isPlaying={isPlaying}
                          isStandby={activeTrack.id === 'standby-empty'}
                          isDocumentHidden={isDocumentHidden}
                          prefersReducedMotion={prefersReducedMotion}
                          compact
                        />
                      </div>
                    )}

                    <div
                      id="retro-tv"
                      className="deck-slot-tv flex flex-col justify-stretch min-h-0"
                    >
                      <RetroTvTable
                        track={activeTrack}
                        isPlaying={isPlaying}
                        isDocumentHidden={isDocumentHidden}
                        volume={volume}
                        lowPowerMode={lowPowerMode}
                        prefersReducedMotion={prefersReducedMotion}
                        compactLandscape={true}
                        themePalette={themePalette}
                        activeThemeId={activeTheme.id}
                        availableThemes={THEME_REGISTRY}
                        onSelectTheme={handleSelectTheme}
                        hideBrandHeader={isStreamlineTheme}
                        seekEvent={seekEvent}
                        onSeek={handleSeek}
                        onTogglePlay={handleTogglePlay}
                        onStop={handleStopPlayback}
                        onPrevious={() => handlePreviousTrack(true)}
                        onNext={handleNextTrack}
                        onChangeVolume={handleChangeVolume}
                        playlistTracks={activePlaylist.tracks}
                        onSelectTrack={handleSelectTrack}
                        onTvFullscreenChange={handleTvFullscreenChange}
                        onResolvedTrackMetadata={handleResolvedTrackMetadata}
                      />
                    </div>

                    <div
                      id="playlist-queue"
                      className="deck-slot-playlist flex flex-col justify-stretch rounded-[3px] min-h-0"
                    >
                      <PlaylistQueueBox
                        playlists={playlists}
                        activePlaylist={activePlaylist}
                        activeTrackId={activeTrack.id}
                        isPlaying={isPlaying}
                        lowPowerMode={lowPowerMode}
                        isLoadingPlaylist={isLoadingPlaylist}
                        spotifyConnected={spotifyConnected}
                        spotifyUserLabel={spotifyUserLabel}
                        needsInitialSpotifyConnect={needsInitialSpotifyConnect}
                        guidanceActive={guidanceActive}
                        isDocumentHidden={isDocumentHidden}
                        prefersReducedMotion={prefersReducedMotion}
                        showCompactBrandHeader={false}
                        themePalette={themePalette}
                        auroraAccents={auroraAccents}
                        activeThemeId={activeTheme.id}
                        availableThemes={THEME_REGISTRY}
                        onSelectTheme={handleSelectTheme}
                        onSelectPlaylist={handleSelectPlaylist}
                        onDeletePlaylist={handleDeletePlaylist}
                        onSelectTrack={handleSelectTrack}
                        onOpenSpotifyModal={handleOpenSpotifyModal}
                        onResolvedPerTrackArtwork={handleResolvedPerTrackArtwork}
                      />
                    </div>

                    {/* Right Pane Contains Unified Console / Hero Stage */}
                    <div
                      id="turntable"
                      className="deck-slot-turntable flex flex-col justify-stretch min-h-0"
                    >
                      {unifiedConsoleElement}
                    </div>
                  </>
                )}

                {viewportLayout === 'mobile-portrait' && (
                  <>
                    {/* Mobile Portrait Order: TV Section FIRST at Top (with Brand Header) */}
                    <div
                      id="retro-tv"
                      className="w-full h-auto flex flex-col justify-stretch shrink-0"
                    >
                      <RetroTvTable
                        track={activeTrack}
                        isPlaying={isPlaying}
                        isDocumentHidden={isDocumentHidden}
                        volume={volume}
                        lowPowerMode={lowPowerMode}
                        prefersReducedMotion={prefersReducedMotion}
                        themePalette={themePalette}
                        activeThemeId={activeTheme.id}
                        availableThemes={THEME_REGISTRY}
                        onSelectTheme={handleSelectTheme}
                        seekEvent={seekEvent}
                        onSeek={handleSeek}
                        onTogglePlay={handleTogglePlay}
                        onStop={handleStopPlayback}
                        onPrevious={() => handlePreviousTrack(true)}
                        onNext={handleNextTrack}
                        onChangeVolume={handleChangeVolume}
                        playlistTracks={activePlaylist.tracks}
                        onSelectTrack={handleSelectTrack}
                        onTvFullscreenChange={handleTvFullscreenChange}
                        onResolvedTrackMetadata={handleResolvedTrackMetadata}
                      />
                    </div>

                    {/* Mobile Portrait: Console / Hero Stage Directly Below TV */}
                    <div
                      id="turntable"
                      className={`w-full ${
                        isStreamlineTheme
                          ? 'h-auto min-h-[410px]'
                          : isAuroraTheme
                          ? 'h-auto min-h-[435px]'
                          : activeTheme.id === 'cd-hifi'
                          ? 'h-auto min-h-[465px]'
                          : activeTheme.id === 'cassette-deck'
                          ? 'h-auto min-h-[540px]'
                          : 'h-[435px]'
                      } flex flex-col justify-stretch shrink-0`}
                    >
                      {unifiedConsoleElement}
                    </div>

                    {/* Mobile Portrait: Playlist Queue Directly Below Console */}
                    <div
                      id="playlist-queue"
                      className={`w-full flex flex-col justify-stretch rounded-[3px] ${
                        isStreamlineTheme ? 'h-[360px] min-h-[300px]' : 'h-[420px] min-h-[340px]'
                      } shrink-0`}
                    >
                      <PlaylistQueueBox
                        playlists={playlists}
                        activePlaylist={activePlaylist}
                        activeTrackId={activeTrack.id}
                        isPlaying={isPlaying}
                        lowPowerMode={lowPowerMode}
                        isLoadingPlaylist={isLoadingPlaylist}
                        spotifyConnected={spotifyConnected}
                        spotifyUserLabel={spotifyUserLabel}
                        needsInitialSpotifyConnect={needsInitialSpotifyConnect}
                        guidanceActive={guidanceActive}
                        isDocumentHidden={isDocumentHidden}
                        prefersReducedMotion={prefersReducedMotion}
                        showCompactBrandHeader={false}
                        themePalette={themePalette}
                        auroraAccents={auroraAccents}
                        activeThemeId={activeTheme.id}
                        availableThemes={THEME_REGISTRY}
                        onSelectTheme={handleSelectTheme}
                        onSelectPlaylist={handleSelectPlaylist}
                        onDeletePlaylist={handleDeletePlaylist}
                        onSelectTrack={handleSelectTrack}
                        onOpenSpotifyModal={handleOpenSpotifyModal}
                        onResolvedPerTrackArtwork={handleResolvedPerTrackArtwork}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Streamline Pinned Full-Width Bottom Player Bar */}
          {isStreamlineTheme && (
            <StreamlinePlayerBar
              track={activeTrack}
              isPlaying={isPlaying}
              isDocumentHidden={isDocumentHidden}
              lowPowerMode={lowPowerMode}
              nightMode={nightMode}
              prefersReducedMotion={prefersReducedMotion}
              rpm={rpm}
              pitchPercent={pitchPercent}
              volume={volume}
              repeatOne={repeatOne}
              shuffleEnabled={shuffleEnabled}
              compact={viewportLayout === 'mobile-landscape'}
              onTogglePlay={handleTogglePlay}
              onStop={handleStopPlayback}
              onPrevious={() => handlePreviousTrack(true)}
              onNext={handleNextTrack}
              onSeek={handleSeek}
              onChangeRpm={handleChangeRpm}
              onChangePitch={handleChangePitch}
              onChangeVolume={handleChangeVolume}
              onToggleRepeatOne={handleToggleRepeatOne}
              onToggleShuffle={handleToggleShuffle}
              onToggleLowPowerMode={handleToggleLowPowerMode}
              onToggleNightMode={handleToggleNightMode}
              onScratch={handleScratch}
            />
          )}
        </div>
      </main>

      <SpotifyConnectModal
        isOpen={isSpotifyModalOpen}
        isConnected={spotifyConnected}
        isSigningIn={isSpotifySigningIn}
        spotifyUserLabel={spotifyUserLabel}
        playlists={playlists}
        activePlaylistId={activePlaylist.id}
        themePalette={themePalette}
        authErrorMessage={spotifyAuthError}
        onClose={() => setIsSpotifyModalOpen(false)}
        onStartSpotifyLogin={handleStartSpotifyLogin}
        onRefreshLibrary={() => syncAuthenticatedSpotifyLibrary()}
        onLogout={() => handleSpotifyLogout()}
        onSelectPlaylist={handleSelectPlaylist}
        onLoadPlaylistByIdOrUrl={handleLoadPlaylistByIdOrUrl}
      />

      <AndroidAppModal
        isOpen={isAndroidModalOpen}
        isStandalone={isStandaloneApp}
        canPromptInstall={Boolean(deferredInstallPrompt)}
        onClose={() => setIsAndroidModalOpen(false)}
        onTriggerInstallPrompt={handleTriggerAndroidInstall}
      />
    </div>
  );
}
