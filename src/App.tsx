import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_PLAYLISTS } from './utils/defaultPlaylists';
import {
  clampSeekTime,
  resolveTrackById,
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
import { retroAudio } from './utils/retroAudioEngine';
import { playbackClockStore } from './utils/playbackStore';
import { TurntableDeck } from './components/TurntableDeck';
import { RetroTvTable, PlaylistQueueBox } from './components/RetroTvTable';
import { SpotifyConnectModal } from './components/SpotifyConnectModal';
import { AndroidAppModal } from './components/AndroidAppModal';

const SAVED_PLAYLISTS_STORAGE_KEY = 'mvf_saved_playlists_v1';

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
  // Initialize with curated/saved playlists so active track and album art render immediately
  const [playlists, setPlaylists] = useState<PlaylistPack[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(SAVED_PLAYLISTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // ignore storage parse errors
      }
    }
    return DEFAULT_PLAYLISTS;
  });
  const [activePlaylistId, setActivePlaylistId] = useState<string>(
    () => DEFAULT_PLAYLISTS[0]?.id || ''
  );
  const [currentTrackId, setCurrentTrackId] = useState<string>(
    () => DEFAULT_PLAYLISTS[0]?.tracks[0]?.id || ''
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [repeatOne, setRepeatOne] = useState<boolean>(false);
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<boolean>(false);

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

  // Simple 1-Click Spotify Login state
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyUserLabel, setSpotifyUserLabel] = useState<string>('Connect Spotify Account');

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
    computeDominantAccentFromRgbSamples([[24, 182, 224]], 'MaxVinyFy')
  );

  const crossfadingTrackIdRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // Keep refs synchronized so event handlers maintain stable references
  const stateRef = useRef({
    activePlaylist,
    activeTrack,
    currentTrackId: activeTrack.id,
    isPlaying,
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
    const applyPaletteVariables = (palette: DominantThemePalette) => {
      setThemePalette(palette);
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
    };

    const seedFallback = computeDominantAccentFromRgbSamples(
      [],
      `${activeTrack.id}-${activeTrack.title}`
    );

    const primaryArtUrl =
      resolveActiveArtworkState(activeTrack, 0).activeUrl || activeTrack.artworkUrl;

    if (!primaryArtUrl) {
      applyPaletteVariables(seedFallback);
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
          applyPaletteVariables(seedFallback);
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
        applyPaletteVariables(extracted);
      } catch {
        applyPaletteVariables(seedFallback);
      }
    };
    img.onerror = () => {
      if (!cancelled) applyPaletteVariables(seedFallback);
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
      const existingById = new Map(DEFAULT_PLAYLISTS[0].tracks.map((t) => [t.id, t]));
      return rawTracks.map((raw, idx) => {
        const prebuilt = existingById.get(raw.id);
        if (prebuilt) {
          return {
            ...prebuilt,
            previewAudioUrl: raw.previewAudioUrl || prebuilt.previewAudioUrl,
            artworkUrl: raw.artworkUrl || prebuilt.artworkUrl,
            images:
              Array.isArray(raw.images) && raw.images.length > 0
                ? [...raw.images, ...(prebuilt.images || [])]
                : prebuilt.images,
          };
        }
        const defaultFallbackImg = DEFAULT_PLAYLISTS[0].tracks[idx % DEFAULT_PLAYLISTS[0].tracks.length]?.images?.[1]?.url || '/turntable/vinyl-label-paper.webp';
        const resolvedArt =
          raw.artworkUrl || fallbackCoverUrl || DEFAULT_PLAYLISTS[0].tracks[0].artworkUrl;
        const candidateImages: TrackImageCandidate[] =
          Array.isArray(raw.images) && raw.images.length > 0
            ? [...raw.images, { url: defaultFallbackImg, width: 300, height: 300 }]
            : [
                { url: resolvedArt, width: 640, height: 640 },
                ...(fallbackCoverUrl && fallbackCoverUrl !== resolvedArt
                  ? [{ url: fallbackCoverUrl, width: 300, height: 300 }]
                  : []),
                { url: defaultFallbackImg, width: 64, height: 64 },
              ];
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
          retroAudio.startPlayback(nextTrack, rate, 0);
        } else {
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

  const fetchTracksForSpotifyPlaylistId = useCallback(
    async (spotifyPlaylistId: string): Promise<{ name: string; tracks: TrackItem[] } | null> => {
      const res = await fetch(`/api/spotify/playlist?id=${encodeURIComponent(spotifyPlaylistId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data.tracks) || data.tracks.length === 0) return null;

      return {
        name: data.name || 'Spotify Playlist',
        tracks: mapRawTracksToTrackItems(data.tracks, data.coverUrl || ''),
      };
    },
    [mapRawTracksToTrackItems]
  );

  const handleOneClickSpotifyLogin = useCallback(
    async (accountHint?: string) => {
      setGuidanceActive(false);
      setIsLoadingPlaylist(true);
      try {
        const params = new URLSearchParams();
        if (accountHint) {
          params.set('account', accountHint);
        }
        const res = await fetch(`/api/spotify/quick-login?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Could not connect to Spotify right now. Please try again.');
        }
        const data = (await res.json()) as {
          user?: { id: string; displayName: string };
          playlists?: Array<{
            id: string;
            spotifyPlaylistId?: string;
            name: string;
            subtitle: string;
            coverUrl: string;
            tracks?: Array<{
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
            }>;
          }>;
        };

        const displayName = data.user?.displayName || accountHint || 'Spotify Account';
        setSpotifyUserLabel(displayName);
        setSpotifyConnected(true);

        if (Array.isArray(data.playlists) && data.playlists.length > 0) {
          const syncedPacks: PlaylistPack[] = data.playlists.map((pl) => {
            const cleanSpotifyId = pl.spotifyPlaylistId || pl.id;
            const mappedTracks =
              Array.isArray(pl.tracks) && pl.tracks.length > 0
                ? mapRawTracksToTrackItems(pl.tracks, pl.coverUrl || '')
                : DEFAULT_PLAYLISTS[0].tracks.slice(0, 1);
            return {
              id: `spotify-user-${cleanSpotifyId}`,
              spotifyPlaylistId: cleanSpotifyId,
              name: pl.name.startsWith('Spotify ·') ? pl.name : `Spotify · ${pl.name}`,
              subtitle: pl.subtitle || 'Spotify Playlist',
              source: 'spotify-live',
              tracks: mappedTracks,
            };
          });

          const firstTrack = syncedPacks[0].tracks[0];
          setPlaylists(syncedPacks);
          setActivePlaylistId(syncedPacks[0].id);
          setCurrentTrackId(firstTrack?.id || '');
          playbackClockStore.setTrackDuration(firstTrack?.durationSec || 0);
          playbackClockStore.setTime(0, true);
        }
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    [mapRawTracksToTrackItems]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SPOTIFY_QUICK_AUTH_SUCCESS') {
        handleOneClickSpotifyLogin(event.data?.accountName).catch(() => {});
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleOneClickSpotifyLogin]);

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
        const loaded = await fetchTracksForSpotifyPlaylistId(cleanId);
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
        setSpotifyConnected(true);
        setPlaylists((prev) => [newPack, ...prev.filter((p) => p.id !== newPackId)]);
        setActivePlaylistId(newPackId);
        setCurrentTrackId(firstTrack?.id || '');
        playbackClockStore.setTrackDuration(firstTrack?.durationSec || 0);
        playbackClockStore.setTime(0, true);
        if (stateRef.current.isPlaying && firstTrack) {
          retroAudio.startPlayback(firstTrack, stateRef.current.effectiveRate, 0);
        }
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    [fetchTracksForSpotifyPlaylistId]
  );

  const handleTogglePlay = useCallback(() => {
    const { activeTrack: curTrack, effectiveRate: rate } = stateRef.current;
    if (curTrack.id === 'standby-empty' || curTrack.durationSec <= 0) {
      setIsSpotifyModalOpen(true);
      return;
    }
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        retroAudio.startPlayback(curTrack, rate, playbackClockStore.getCurrentTimeSec());
      } else {
        retroAudio.pausePlayback();
      }
      return next;
    });
  }, []);

  const handleStopPlayback = useCallback(() => {
    setIsPlaying(false);
    playbackClockStore.setTime(0, true);
    retroAudio.pausePlayback();
    retroAudio.seekTo(0);
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
              if (stateRef.current.isPlaying && firstLoadedTrack) {
                retroAudio.startPlayback(firstLoadedTrack, stateRef.current.effectiveRate, 0);
              }
            }
            return;
          }
        } finally {
          setIsLoadingPlaylist(false);
        }
      }

      if (stateRef.current.isPlaying && initialTrack) {
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
          if (stateRef.current.isPlaying) {
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
    const { activePlaylist: curPlaylist, effectiveRate: rate } = stateRef.current;
    const { track: nextTrack } = resolveTrackById(curPlaylist.tracks, trackId);
    if (!nextTrack) return;
    crossfadingTrackIdRef.current = null;
    setCurrentTrackId(nextTrack.id);
    playbackClockStore.setTrackDuration(nextTrack.durationSec);
    playbackClockStore.setTime(0, true);
    setIsPlaying(true);
    retroAudio.startPlayback(nextTrack, rate, 0);
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
  }, []);

  const handleDragTonearmToTime = useCallback((targetSec: number) => {
    const { activeTrack: curTrack, isPlaying: playing, effectiveRate: rate } = stateRef.current;
    if (curTrack.id === 'standby-empty' || curTrack.durationSec <= 0) return;
    const clamped = clampSeekTime(targetSec, curTrack.durationSec);
    playbackClockStore.setTime(clamped, true);
    retroAudio.seekTo(clamped);
    if (!playing) {
      setIsPlaying(true);
      retroAudio.startPlayback(curTrack, rate, clamped);
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

  const unifiedConsoleElement = (
    <TurntableDeck
      track={activeTrack}
      isPlaying={isPlaying}
      isDocumentHidden={isDocumentHidden}
      lowPowerMode={lowPowerMode}
      nightMode={nightMode}
      prefersReducedMotion={prefersReducedMotion}
      rpm={rpm}
      pitchPercent={pitchPercent}
      volume={volume}
      vinylCrackle={vinylCrackle}
      needleDropCrackle={needleDropCrackle}
      crossfadeSec={crossfadeSec}
      repeatOne={repeatOne}
      shuffleEnabled={shuffleEnabled}
      isFullScreen={isFullScreen}
      spotifyConnected={spotifyConnected}
      viewportLayout={viewportLayout}
      themePalette={themePalette}
      onTogglePlay={handleTogglePlay}
      onStop={handleStopPlayback}
      onPrevious={() => handlePreviousTrack(true)}
      onNext={handleNextTrack}
      onSeek={handleSeek}
      onChangeRpm={handleChangeRpm}
      onChangePitch={handleChangePitch}
      onChangeVolume={handleChangeVolume}
      onChangeCrossfadeSec={handleChangeCrossfadeSec}
      onToggleRepeatOne={handleToggleRepeatOne}
      onToggleShuffle={handleToggleShuffle}
      onToggleVinylCrackle={handleToggleVinylCrackle}
      onToggleNeedleDropCrackle={handleToggleNeedleDropCrackle}
      onToggleLowPowerMode={handleToggleLowPowerMode}
      onToggleNightMode={handleToggleNightMode}
      onToggleFullScreen={handleToggleFullScreen}
      onOpenSpotifyModal={handleOpenSpotifyModal}
      onScratch={handleScratch}
      onDragTonearmToTime={handleDragTonearmToTime}
    />
  );

  return (
    <div
      data-theme-primary={themePalette.primaryHex}
      data-low-power={lowPowerMode ? 'true' : 'false'}
      data-night-mode={nightMode ? 'true' : 'false'}
      data-viewport-layout={viewportLayout}
      className={`app-viewport-shell relative bg-[#12100e] text-[#f5efe6] flex flex-col select-none ${
        nightMode ? 'night-driving-mode' : ''
      }`}
    >
      {/* Thermal-Optimized Static Ambient Gradient */}
      <div
        aria-hidden="true"
        style={{
          background: nightMode
            ? 'radial-gradient(circle at 22% 15%, rgba(245, 158, 11, 0.14) 0%, transparent 55%)'
            : `radial-gradient(circle at 22% 15%, ${themePalette.softBgRgba} 0%, transparent 52%), radial-gradient(circle at 78% 85%, ${themePalette.softBgRgba} 0%, transparent 52%)`,
        }}
        className="pointer-events-none fixed inset-0 z-0"
      />

      <main className="relative z-10 flex-1 min-h-0 w-full flex flex-col">
        <div className="main-deck-grid">
          {viewportLayout === 'desktop-tablet' && (
            <>
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
                  onChangeVolume={handleChangeVolume}
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
                  shuffleEnabled={shuffleEnabled}
                  lowPowerMode={lowPowerMode}
                  isLoadingPlaylist={isLoadingPlaylist}
                  spotifyConnected={spotifyConnected}
                  spotifyUserLabel={spotifyUserLabel}
                  needsInitialSpotifyConnect={needsInitialSpotifyConnect}
                  guidanceActive={guidanceActive}
                  isDocumentHidden={isDocumentHidden}
                  prefersReducedMotion={prefersReducedMotion}
                  themePalette={themePalette}
                  onSelectPlaylist={handleSelectPlaylist}
                  onDeletePlaylist={handleDeletePlaylist}
                  onSelectTrack={handleSelectTrack}
                  onToggleShuffle={handleToggleShuffle}
                  onNextTrack={handleNextTrack}
                  onOpenSpotifyModal={handleOpenSpotifyModal}
                />
              </div>

              {/* Right Pane Contains ONLY the Unified 3D Wooden Console */}
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
                  onChangeVolume={handleChangeVolume}
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
                  shuffleEnabled={shuffleEnabled}
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
                  onSelectPlaylist={handleSelectPlaylist}
                  onDeletePlaylist={handleDeletePlaylist}
                  onSelectTrack={handleSelectTrack}
                  onToggleShuffle={handleToggleShuffle}
                  onNextTrack={handleNextTrack}
                  onOpenSpotifyModal={handleOpenSpotifyModal}
                />
              </div>

              {/* Right Pane Contains ONLY the Unified 3D Wooden Console */}
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
              {/* Mobile Portrait Order: TV Section FIRST at Top (with Spinning Vinyl Brand Header) */}
              <div
                id="retro-tv"
                className="w-full h-[250px] flex flex-col justify-stretch shrink-0"
              >
                <RetroTvTable
                  track={activeTrack}
                  isPlaying={isPlaying}
                  isDocumentHidden={isDocumentHidden}
                  volume={volume}
                  lowPowerMode={lowPowerMode}
                  prefersReducedMotion={prefersReducedMotion}
                  themePalette={themePalette}
                  onChangeVolume={handleChangeVolume}
                  onResolvedTrackMetadata={handleResolvedTrackMetadata}
                />
              </div>

              {/* Mobile Portrait: Unified 3D Wooden Turntable Console Directly Below TV */}
              <div
                id="turntable"
                className="w-full h-[clamp(540px,70dvh,610px)] flex flex-col justify-stretch shrink-0"
              >
                {unifiedConsoleElement}
              </div>

              {/* Mobile Portrait: Taller Playlist Queue Directly Below Console */}
              <div
                id="playlist-queue"
                className="w-full flex flex-col justify-stretch rounded-[3px] h-[420px] min-h-[340px] shrink-0"
              >
                <PlaylistQueueBox
                  playlists={playlists}
                  activePlaylist={activePlaylist}
                  activeTrackId={activeTrack.id}
                  isPlaying={isPlaying}
                  shuffleEnabled={shuffleEnabled}
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
                  onSelectPlaylist={handleSelectPlaylist}
                  onDeletePlaylist={handleDeletePlaylist}
                  onSelectTrack={handleSelectTrack}
                  onToggleShuffle={handleToggleShuffle}
                  onNextTrack={handleNextTrack}
                  onOpenSpotifyModal={handleOpenSpotifyModal}
                />
              </div>
            </>
          )}
        </div>
      </main>

      <SpotifyConnectModal
        isOpen={isSpotifyModalOpen}
        isConnected={spotifyConnected}
        spotifyUserLabel={spotifyUserLabel}
        playlists={playlists}
        activePlaylistId={activePlaylist.id}
        themePalette={themePalette}
        onClose={() => setIsSpotifyModalOpen(false)}
        onOneClickSpotifyLogin={handleOneClickSpotifyLogin}
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
