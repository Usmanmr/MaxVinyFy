import React, { useState, useEffect, useCallback } from 'react';
import { DEFAULT_PLAYLISTS, buildYouTubeFramesForTrack } from './utils/defaultPlaylists';
import {
  clampSeekTime,
  getNextTrackIndex,
  getShuffledNextTrackIndex,
  getPreviousAction,
  calculatePlaybackRate,
  computeDominantAccentFromRgbSamples,
  type PlaylistPack,
  type TrackItem,
  type YouTubeGrabFrame,
  type DominantThemePalette,
} from './utils/playerLogic';
import { retroAudio } from './utils/retroAudioEngine';
import { TurntableDeck } from './components/TurntableDeck';
import { RetroTvTable, PlaylistQueueBox } from './components/RetroTvTable';
import { TransportAndQueueDeck } from './components/TransportAndQueueDeck';
import { SpotifyConnectModal } from './components/SpotifyConnectModal';

const SYNTH_PRESETS: TrackItem['synthPreset'][] = [
  'midnight-synth',
  'cyber-electro',
  'classic-funk',
  'velvet-soul',
  'pacific-yacht',
];

export default function App() {
  const [playlists, setPlaylists] = useState<PlaylistPack[]>(DEFAULT_PLAYLISTS);
  const [activePlaylistId, setActivePlaylistId] = useState<string>(DEFAULT_PLAYLISTS[0].id);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(18);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [repeatOne, setRepeatOne] = useState<boolean>(false);
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Turntable hardware state
  const [pitchPercent, setPitchPercent] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [crackleLevel, setCrackleLevel] = useState<number>(0.25);
  const [vuLevels, setVuLevels] = useState<{ left: number; right: number }>({ left: 0.24, right: 0.22 });

  // Spotify OAuth & user account state
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState<boolean>(false);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);
  const [spotifyAccessToken, setSpotifyAccessToken] = useState<string>('');
  const [spotifyUserLabel, setSpotifyUserLabel] = useState<string>('Connect Spotify Account');

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || playlists[0];
  const activeTrack = activePlaylist.tracks[currentTrackIndex] || activePlaylist.tracks[0];
  const effectiveRate = calculatePlaybackRate(33, pitchPercent);

  const [themePalette, setThemePalette] = useState<DominantThemePalette>(() =>
    computeDominantAccentFromRgbSamples([[24, 182, 224]], activeTrack.title)
  );

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

    const seedFallback = computeDominantAccentFromRgbSamples([], `${activeTrack.id}-${activeTrack.title}`);

    if (!activeTrack.artworkUrl) {
      applyPaletteVariables(seedFallback);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const size = 28;
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
    img.src = activeTrack.artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [activeTrack.id, activeTrack.title, activeTrack.artworkUrl]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullScreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      setIsFullScreen(false);
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullScreen((prev) => !prev);
    }
  };

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
          };
        }
        const defaultYtId = '7IBDa53IsvI';
        return {
          id: raw.id,
          title: raw.title,
          artist: raw.artist,
          album: raw.album || 'Spotify Playlist',
          durationSec: raw.durationSec || 180,
          bpm: raw.bpm || 110,
          year: raw.year || 2024,
          artworkUrl: raw.artworkUrl || fallbackCoverUrl || DEFAULT_PLAYLISTS[0].tracks[0].artworkUrl,
          spotifyUri: raw.spotifyUri,
          previewAudioUrl: raw.previewAudioUrl,
          youtubeVideoId: defaultYtId,
          synthPreset: SYNTH_PRESETS[idx % SYNTH_PRESETS.length],
          tvFrames: buildYouTubeFramesForTrack(defaultYtId, raw.title, raw.artist),
        };
      });
    },
    []
  );

  // Load initial Spotify playlist on startup
  useEffect(() => {
    let cancelled = false;
    const loadInitialSpotifyPlaylist = async () => {
      try {
        const res = await fetch('/api/spotify/playlist?id=2ENMa1IQDSlEPDKNmS25K2');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.tracks) || data.tracks.length === 0) return;

        const mergedTracks = mapRawTracksToTrackItems(data.tracks, data.coverUrl || '');

        setPlaylists((prev) =>
          prev.map((pl, idx) =>
            idx === 0
              ? {
                  ...pl,
                  name: data.name || 'Spotify · car',
                  spotifyPlaylistId: '2ENMa1IQDSlEPDKNmS25K2',
                  tracks: mergedTracks,
                }
              : pl
          )
        );
      } catch {
        // Keep default tracks
      }
    };

    loadInitialSpotifyPlaylist();
    return () => {
      cancelled = true;
    };
  }, [mapRawTracksToTrackItems]);

  // Advance song timer and VU meters when playing
  useEffect(() => {
    const interval = window.setInterval(() => {
      setVuLevels(retroAudio.getVuLevels());
      if (!isPlaying) return;

      setCurrentTimeSec((prev) => {
        const nextSec = prev + 0.25 * effectiveRate;
        if (nextSec >= activeTrack.durationSec) {
          const nextIdx = repeatOne
            ? currentTrackIndex
            : shuffleEnabled
            ? getShuffledNextTrackIndex(currentTrackIndex, activePlaylist.tracks.length)
            : getNextTrackIndex(currentTrackIndex, activePlaylist.tracks.length, false);
          if (nextIdx !== currentTrackIndex) {
            setCurrentTrackIndex(nextIdx);
            const nextTrack = activePlaylist.tracks[nextIdx];
            if (nextTrack) {
              retroAudio.startPlayback(nextTrack, effectiveRate);
            }
          }
          return 0;
        }
        return nextSec;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [
    isPlaying,
    effectiveRate,
    activeTrack.durationSec,
    currentTrackIndex,
    activePlaylist.tracks,
    repeatOne,
    shuffleEnabled,
  ]);

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

  // Fetch tracks for a specific Spotify playlist ID (using user token if authenticated, or public embed fallback)
  const fetchTracksForSpotifyPlaylistId = useCallback(
    async (spotifyPlaylistId: string, tokenOverride?: string): Promise<{ name: string; tracks: TrackItem[] } | null> => {
      const tokenToUse = tokenOverride ?? spotifyAccessToken;
      const headers: Record<string, string> = {};
      if (tokenToUse) {
        headers.Authorization = `Bearer ${tokenToUse}`;
      }
      const endpoint = tokenToUse
        ? `/api/spotify/user-playlist-tracks?id=${encodeURIComponent(spotifyPlaylistId)}`
        : `/api/spotify/playlist?id=${encodeURIComponent(spotifyPlaylistId)}`;

      const res = await fetch(endpoint, { headers });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data.tracks) || data.tracks.length === 0) return null;

      return {
        name: data.name || 'Spotify Playlist',
        tracks: mapRawTracksToTrackItems(data.tracks, data.coverUrl || ''),
      };
    },
    [spotifyAccessToken, mapRawTracksToTrackItems]
  );

  // Connect any user's Spotify account and fetch all their personal playlists
  const syncSpotifyPlaylistsWithToken = useCallback(
    async (accessToken: string) => {
      const res = await fetch('/api/spotify/user-playlists', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error('Spotify token rejected or expired. Please sign in again.');
      }
      const data = (await res.json()) as {
        user?: { id: string; displayName: string };
        playlists?: Array<{ id: string; name: string; coverUrl: string; totalTracks: number }>;
      };

      setSpotifyAccessToken(accessToken);
      setSpotifyUserLabel(data.user?.displayName || 'Spotify User');
      setSpotifyConnected(true);

      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        const userPacks: PlaylistPack[] = data.playlists.map((pl) => ({
          id: `spotify-user-${pl.id}`,
          spotifyPlaylistId: pl.id,
          name: `Spotify · ${pl.name}`,
          subtitle: `${pl.totalTracks} tracks · ${data.user?.displayName || 'Spotify'}`,
          source: 'spotify-live',
          tracks: DEFAULT_PLAYLISTS[0].tracks.slice(0, 1),
        }));

        // Load full tracks for the user's first playlist right away
        const firstSpotifyId = data.playlists[0].id;
        const firstLoaded = await fetchTracksForSpotifyPlaylistId(firstSpotifyId, accessToken);
        if (firstLoaded && firstLoaded.tracks.length > 0) {
          userPacks[0].tracks = firstLoaded.tracks;
        }

        setPlaylists((prev) => {
          const existingIds = new Set(userPacks.map((u) => u.id));
          return [...userPacks, ...prev.filter((p) => !existingIds.has(p.id))];
        });
        setActivePlaylistId(userPacks[0].id);
        setCurrentTrackIndex(0);
        setCurrentTimeSec(0);
      }
    },
    [fetchTracksForSpotifyPlaylistId]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.accessToken) {
        syncSpotifyPlaylistsWithToken(String(event.data.accessToken)).catch((err) => {
          console.error('Spotify playlist sync error:', err);
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [syncSpotifyPlaylistsWithToken]);

  const handleStartOAuthPopup = async (customClientId: string) => {
    const redirectUri = `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({ redirectUri });
    if (customClientId) {
      params.set('clientId', customClientId);
    }
    const response = await fetch(`/api/spotify/auth-url?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || !data.url) {
      throw new Error(
        data.message || 'Enter your Spotify App Client ID above or paste any Spotify Playlist link.'
      );
    }
    window.open(data.url, 'spotify_oauth_popup', 'width=560,height=680');
  };

  const handleLoadPlaylistByIdOrUrl = async (idOrUrl: string) => {
    const matchUrl = idOrUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    const cleanId = matchUrl ? matchUrl[1] : idOrUrl.replace(/[^a-zA-Z0-9]/g, '');
    if (!cleanId) {
      throw new Error('Invalid Spotify Playlist URL or ID.');
    }

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

    setPlaylists((prev) => [newPack, ...prev.filter((p) => p.id !== newPackId)]);
    setActivePlaylistId(newPackId);
    setCurrentTrackIndex(0);
    setCurrentTimeSec(0);
    if (isPlaying && loaded.tracks[0]) {
      retroAudio.startPlayback(loaded.tracks[0], effectiveRate);
    }
  };

  const handleTogglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        retroAudio.startPlayback(activeTrack, effectiveRate);
      } else {
        retroAudio.pausePlayback();
      }
      return next;
    });
  };

  const handleStopPlayback = () => {
    setIsPlaying(false);
    setCurrentTimeSec(0);
    retroAudio.pausePlayback();
  };

  const handleSelectPlaylist = async (playlistId: string) => {
    const targetPl = playlists.find((p) => p.id === playlistId);
    if (!targetPl) return;
    setActivePlaylistId(playlistId);
    setCurrentTrackIndex(0);
    setCurrentTimeSec(0);

    if (targetPl.spotifyPlaylistId && targetPl.tracks.length <= 1) {
      const loaded = await fetchTracksForSpotifyPlaylistId(targetPl.spotifyPlaylistId);
      if (loaded && loaded.tracks.length > 0) {
        setPlaylists((prev) =>
          prev.map((pl) => (pl.id === playlistId ? { ...pl, tracks: loaded.tracks } : pl))
        );
        if (isPlaying && loaded.tracks[0]) {
          retroAudio.startPlayback(loaded.tracks[0], effectiveRate);
        }
        return;
      }
    }

    if (isPlaying && targetPl.tracks[0]) {
      retroAudio.startPlayback(targetPl.tracks[0], effectiveRate);
    }
  };

  const handleSelectTrack = (trackIndex: number) => {
    const nextTrack = activePlaylist.tracks[trackIndex];
    if (!nextTrack) return;
    setCurrentTrackIndex(trackIndex);
    setCurrentTimeSec(0);
    setIsPlaying(true);
    retroAudio.startPlayback(nextTrack, effectiveRate);
  };

  const handleNextTrack = () => {
    const nextIdx = shuffleEnabled
      ? getShuffledNextTrackIndex(currentTrackIndex, activePlaylist.tracks.length)
      : getNextTrackIndex(currentTrackIndex, activePlaylist.tracks.length, false);
    handleSelectTrack(nextIdx);
  };

  const handleToggleShuffle = () => {
    setShuffleEnabled((prev) => !prev);
  };

  const handlePreviousTrack = (forcePrevious = false) => {
    const action = getPreviousAction(
      currentTrackIndex,
      activePlaylist.tracks.length,
      currentTimeSec,
      forcePrevious
    );
    if (action.action === 'restart') {
      setCurrentTimeSec(0);
    } else {
      handleSelectTrack(action.targetIndex);
    }
  };

  const handleSeek = (targetSec: number) => {
    const clamped = clampSeekTime(targetSec, activeTrack.durationSec);
    setCurrentTimeSec(clamped);
  };

  const handleChangePitch = (nextPitch: number) => {
    setPitchPercent(nextPitch);
    const nextRate = calculatePlaybackRate(33, nextPitch);
    retroAudio.setPlaybackRate(nextRate);
  };

  const handleScratch = (intensity: 'light' | 'classic' | 'backspin') => {
    retroAudio.triggerVinylScratch(intensity);
    setVuLevels({ left: 0.94, right: 0.91 });
  };

  const handleChangeVolume = (nextVol: number) => {
    setVolume(nextVol);
    retroAudio.setVolume(nextVol);
  };

  const handleChangeCrackle = (nextCrackle: number) => {
    setCrackleLevel(nextCrackle);
    retroAudio.setCrackleLevel(nextCrackle);
  };

  return (
    <div
      data-theme-primary={themePalette.primaryHex}
      className="relative w-full min-h-screen lg:w-screen lg:h-screen overflow-y-auto overflow-x-hidden lg:overflow-hidden bg-[#12100e] text-[#f5efe6] flex flex-col justify-between select-none"
    >
      {/* Background Nostalgic Car Horizon & Dynamic Album Art Ambient Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div
          style={{ backgroundColor: themePalette.glowRgba }}
          className={`absolute -top-28 left-1/4 w-[640px] h-[360px] rounded-full blur-3xl transition-all duration-700 ${
            isPlaying ? 'opacity-70' : 'opacity-35'
          }`}
        />
        <div
          style={{ backgroundColor: themePalette.glowRgba }}
          className={`absolute -bottom-32 right-1/4 w-[580px] h-[340px] rounded-full blur-3xl transition-all duration-700 ${
            isPlaying ? 'opacity-65' : 'opacity-30'
          }`}
        />
      </div>

      {/* Responsive Layout:
          - Portrait Mobile (< 1024px): Scrollable Full-Width Stack -> 1) Vinyl & Album Art on top, 2) Control Card, 3) Playlist, 4) TV Screen at bottom
          - Landscape Desktop (>= 1024px): Synchronized 2x2 Cockpit -> Left: TV on top of Playlist | Right: Vinyl/Album Art on top of Control Card */}
      <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-5 pt-6 pb-10 lg:pt-7 lg:pb-4 min-h-0 lg:overflow-hidden">
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:grid-rows-[53%_1fr] lg:gap-4 w-full lg:h-full min-h-0">
          {/* 1st on Mobile (order-1) | Top-Right on Desktop: Vinyl & Album Art + Synced Lyrics + Control & Pitch Cards */}
          <div
            id="turntable"
            className="order-1 lg:order-none w-full lg:col-span-8 lg:col-start-5 lg:row-start-1 flex flex-col justify-stretch min-h-0 lg:h-full"
          >
            <TurntableDeck
              track={activeTrack}
              currentTimeSec={currentTimeSec}
              isPlaying={isPlaying}
              pitchPercent={pitchPercent}
              isFullScreen={isFullScreen}
              themePalette={themePalette}
              onTogglePlay={handleTogglePlay}
              onChangePitch={handleChangePitch}
              onScratch={handleScratch}
              onSeek={handleSeek}
              onToggleFullScreen={handleToggleFullScreen}
            />
          </div>

          {/* 2nd on Mobile (order-2) | Bottom-Right on Desktop: Playback Control Card & Physics VU Meter */}
          <div
            id="up-next"
            className="order-2 lg:order-none w-full lg:col-span-8 lg:col-start-5 lg:row-start-2 flex flex-col justify-stretch rounded-3xl min-h-0 lg:h-full"
          >
            <TransportAndQueueDeck
              playlists={playlists}
              activePlaylist={activePlaylist}
              activeTrack={activeTrack}
              currentTrackIndex={currentTrackIndex}
              currentTimeSec={currentTimeSec}
              isPlaying={isPlaying}
              repeatOne={repeatOne}
              volume={volume}
              crackleLevel={crackleLevel}
              vuLevels={vuLevels}
              themePalette={themePalette}
              spotifyConnected={spotifyConnected}
              spotifyUserLabel={spotifyUserLabel}
              onOpenSpotifyModal={() => setIsSpotifyModalOpen(true)}
              onSelectPlaylist={handleSelectPlaylist}
              onTogglePlay={handleTogglePlay}
              onStop={handleStopPlayback}
              onPrevious={handlePreviousTrack}
              onNext={handleNextTrack}
              onSeek={handleSeek}
              onToggleRepeatOne={() => setRepeatOne((r) => !r)}
              onChangeVolume={handleChangeVolume}
              onChangeCrackle={handleChangeCrackle}
            />
          </div>

          {/* 3rd on Mobile (order-3) | Bottom-Left on Desktop: Spotify Playlist Queue Card */}
          <div
            id="playlist-queue"
            className="order-3 lg:order-none w-full lg:col-span-4 lg:col-start-1 lg:row-start-2 flex flex-col justify-stretch rounded-3xl min-h-0 lg:h-full"
          >
            <PlaylistQueueBox
              activePlaylist={activePlaylist}
              currentTrackIndex={currentTrackIndex}
              shuffleEnabled={shuffleEnabled}
              themePalette={themePalette}
              onSelectTrack={handleSelectTrack}
              onToggleShuffle={handleToggleShuffle}
              onNextTrack={handleNextTrack}
            />
          </div>

          {/* 4th on Mobile (order-4) | Top-Left on Desktop: Retro CRT TV Screen */}
          <div
            id="retro-tv"
            className="order-4 lg:order-none w-full lg:col-span-4 lg:col-start-1 lg:row-start-1 flex flex-col justify-stretch min-h-0 lg:h-full"
          >
            <RetroTvTable
              track={activeTrack}
              currentTimeSec={currentTimeSec}
              isPlaying={isPlaying}
              themePalette={themePalette}
              onResolvedTrackMetadata={handleResolvedTrackMetadata}
            />
          </div>
        </div>
      </main>

      {/* Multi-User Spotify OAuth 2.0 PKCE Login & Playlist Selector Modal */}
      <SpotifyConnectModal
        isOpen={isSpotifyModalOpen}
        isConnected={spotifyConnected}
        spotifyUserLabel={spotifyUserLabel}
        playlists={playlists}
        activePlaylistId={activePlaylist.id}
        onClose={() => setIsSpotifyModalOpen(false)}
        onStartOAuthPopup={handleStartOAuthPopup}
        onConnectWithAccessToken={syncSpotifyPlaylistsWithToken}
        onSelectPlaylist={handleSelectPlaylist}
        onLoadPlaylistByIdOrUrl={handleLoadPlaylistByIdOrUrl}
      />
    </div>
  );
}
