import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Home,
  Search,
  Library,
  PlusSquare,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  Clock,
  Mic2,
  Tv,
  Volume2,
  VolumeX,
  ChevronDown,
  X,
  Music2,
  Disc3,
} from 'lucide-react';
import {
  formatDuration,
  buildCleanYouTubeEmbedUrl,
  type TrackItem,
} from '../utils/playerLogic';
import { usePlaybackSecond } from '../utils/playbackStore';
import { useDoubleTapHideArt } from '../hooks/useDoubleTapHideArt';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';

const SPOTIFY_LIKED_STORAGE_KEY = 'maxyoutify_spotify_liked_tracks_v1';

type SpotifyNavTab = 'home' | 'search' | 'library';
type SpotifyMainPanel = 'tracks' | 'lyrics' | 'canvas';

function hexToRgbTriplet(hex?: string): string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex.trim())) {
    return '30, 86, 62';
  }
  const clean = hex.trim().replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function formatTotalPlaylistDuration(tracks: readonly TrackItem[]): string {
  const totalSec = tracks.reduce((sum, t) => sum + (Number.isFinite(t.durationSec) ? Math.max(0, t.durationSec) : 0), 0);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hrs > 0) {
    return `${hrs} hr ${mins} min`;
  }
  return `${Math.max(1, mins)} min`;
}

function loadSavedLikedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SPOTIFY_LIKED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const SpotifyDeck: React.FC<TurntableDeckProps> = React.memo(
  ({
    track,
    isPlaying,
    prefersReducedMotion,
    volume,
    repeatOne,
    shuffleEnabled,
    hideBoxArt = false,
    onToggleHideBoxArt,
    viewportLayout,
    themePalette,
    playlistTracks = [],
    playlistName = 'Loaded Playlist',
    playlists = [],
    activePlaylistId,
    onSelectPlaylist,
    onSelectTrack,
    onTogglePlay,
    onPrevious,
    onNext,
    onSeek,
    onChangeVolume,
    onToggleRepeatOne,
    onToggleShuffle,
    onOpenSpotifyModal,
    onResolvedTrackMetadata,
  }) => {
    const { doubleTapHideArtBind } = useDoubleTapHideArt(onToggleHideBoxArt);
    const elapsedSec = usePlaybackSecond();
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;

    const [navTab, setNavTab] = useState<SpotifyNavTab>('home');
    const [mainPanel, setMainPanel] = useState<SpotifyMainPanel>('tracks');
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
    const [mobileSheetView, setMobileSheetView] = useState<'player' | 'lyrics'>('player');
    const [likedIds, setLikedIds] = useState<string[]>(() => loadSavedLikedIds());
    const [resolvedVideoId, setResolvedVideoId] = useState<string>(track.youtubeVideoId || '');
    const [preMuteVolume, setPreMuteVolume] = useState<number>(0.8);

    const scrubberRef = useRef<HTMLDivElement | null>(null);
    const volBarRef = useRef<HTMLDivElement | null>(null);
    const sheetScrubberRef = useRef<HTMLDivElement | null>(null);
    const videoCacheRef = useRef<Map<string, string>>(new Map());
    const trackIdRef = useRef(track.id);
    trackIdRef.current = track.id;

    const [isMobilePortrait, setIsMobilePortrait] = useState<boolean>(() => {
      if (viewportLayout === 'mobile-portrait') return true;
      if (typeof window !== 'undefined') {
        return window.innerWidth <= 767 && window.innerHeight > window.innerWidth;
      }
      return false;
    });

    useEffect(() => {
      const check = () => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const h = typeof window !== 'undefined' ? window.innerHeight : 800;
        setIsMobilePortrait(viewportLayout === 'mobile-portrait' || (w <= 767 && h > w));
      };
      check();
      window.addEventListener('resize', check);
      return () => window.removeEventListener('resize', check);
    }, [viewportLayout]);

    const toggleLikeTrack = useCallback((id: string) => {
      if (!id || id === 'standby-empty') return;
      setLikedIds((prev) => {
        const exists = prev.includes(id);
        const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(SPOTIFY_LIKED_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore storage errors
          }
        }
        return next;
      });
    }, []);

    // Resolve YouTube video metadata when Video/Canvas pane is open
    useEffect(() => {
      if (track.youtubeVideoId) {
        setResolvedVideoId(track.youtubeVideoId);
        videoCacheRef.current.set(track.id, track.youtubeVideoId);
        return;
      }
      const cached = videoCacheRef.current.get(track.id);
      if (cached) {
        setResolvedVideoId(cached);
        return;
      }
      setResolvedVideoId('');
      if (mainPanel !== 'canvas' || isStandby || !track.title) return;

      let cancelled = false;
      const targetId = track.id;
      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist || '',
        trackId: targetId,
        videoId: '',
      });
      fetch(`/api/youtube/search-grabs?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || trackIdRef.current !== targetId) return;
          const nextVid = data?.channels?.[0]?.videoId || data?.videoId || '';
          if (nextVid) {
            videoCacheRef.current.set(targetId, nextVid);
            setResolvedVideoId(nextVid);
            onResolvedTrackMetadata?.(
              targetId,
              data?.artworkUrl || track.artworkUrl,
              nextVid,
              data?.channels?.[0]?.frames || data?.frames || track.tvFrames || []
            );
          }
        })
        .catch(() => {
          // fallback to album art canvas
        });
      return () => {
        cancelled = true;
      };
    }, [mainPanel, track.id, track.title, track.artist, track.youtubeVideoId, track.artworkUrl, track.tvFrames, isStandby, onResolvedTrackMetadata]);

    const activePlaylist = useMemo(
      () => playlists.find((pl) => pl.id === activePlaylistId) || playlists[0],
      [playlists, activePlaylistId]
    );

    const heroCoverUrl = useMemo(() => {
      return (
        activePlaylist?.coverArtUrl ||
        (!isStandby && track.artworkUrl ? track.artworkUrl : '') ||
        playlistTracks.find((t) => t.artworkUrl)?.artworkUrl ||
        ''
      );
    }, [activePlaylist?.coverArtUrl, isStandby, track.artworkUrl, playlistTracks]);

    const filteredTracks = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q || navTab !== 'search') return playlistTracks;
      return playlistTracks.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.artist.toLowerCase().includes(q) ||
          item.album.toLowerCase().includes(q)
      );
    }, [playlistTracks, searchQuery, navTab]);

    const rgbTriplet = useMemo(
      () => hexToRgbTriplet(themePalette?.primaryHex),
      [themePalette?.primaryHex]
    );

    const progressPct =
      track.durationSec > 0
        ? Math.max(0, Math.min(100, (elapsedSec / track.durationSec) * 100))
        : 0;
    const clampedVol = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
    const isActiveLiked = likedIds.includes(track.id);

    const seekFromBarEvent = useCallback(
      (clientX: number, barEl: HTMLDivElement | null) => {
        if (!barEl || track.durationSec <= 0 || isStandby) return;
        const rect = barEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        onSeek(Math.round(ratio * track.durationSec));
      },
      [track.durationSec, isStandby, onSeek]
    );

    const volumeFromBarEvent = useCallback(
      (clientX: number, barEl: HTMLDivElement | null) => {
        if (!barEl) return;
        const rect = barEl.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        onChangeVolume(Number(ratio.toFixed(2)));
      },
      [onChangeVolume]
    );

    const toggleMute = useCallback(() => {
      if (clampedVol > 0.01) {
        setPreMuteVolume(clampedVol);
        onChangeVolume(0);
      } else {
        onChangeVolume(preMuteVolume > 0.05 ? preMuteVolume : 0.8);
      }
    }, [clampedVol, preMuteVolume, onChangeVolume]);

    const windowOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    /* =========================================================================
       MOBILE VERTICAL VIEW (max-width: 767px AND orientation: portrait)
       ========================================================================= */
    if (isMobilePortrait) {
      return (
        <div
          id="spotify-deck-stage"
          data-testid="spotify-deck-stage"
          data-layout="mobile-portrait"
          className="w-full h-full min-h-0 flex flex-col bg-[#121212] text-white overflow-hidden relative"
        >
          {/* Top Scrollable Main View */}
          <div
            className="sp-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-[86px]"
            style={{
              background: `linear-gradient(180deg, rgba(${rgbTriplet}, 0.56) 0%, #121212 36%, #121212 100%)`,
            }}
          >
            {navTab === 'search' ? (
              <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-6 space-y-4">
                <div className="flex items-center justify-between gap-2 pl-[54px]">
                  <h2 className="text-[22px] font-black tracking-tight text-white">Search</h2>
                  <button
                    type="button"
                    onClick={onOpenSpotifyModal}
                    className="px-3 py-1.5 rounded-full bg-[#1DB954] text-black text-[12px] font-bold cursor-pointer"
                  >
                    + Load Spotify
                  </button>
                </div>
                <div className="relative flex items-center bg-white text-[#121212] rounded-[6px] px-3 h-[42px]">
                  <Search className="w-4 h-4 text-[#121212] shrink-0 mr-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="What do you want to listen to?"
                    className="flex-1 min-w-0 bg-transparent text-[13.5px] font-medium placeholder:text-[#535353] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="p-1 text-[#121212] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {filteredTracks.map((item) => {
                    const isActive = item.id === track.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectTrack?.(item.id)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-[6px] hover:bg-white/[0.07] active:bg-white/[0.12] text-left cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-[4px] bg-[#282828] overflow-hidden shrink-0 flex items-center justify-center">
                          {item.artworkUrl ? (
                            <img
                              src={item.artworkUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music2 className="w-5 h-5 text-[#B3B3B3]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-[14px] font-semibold truncate ${
                              isActive ? 'text-[#1DB954]' : 'text-white'
                            }`}
                          >
                            {item.title}
                          </p>
                          <p className="text-[12px] text-[#B3B3B3] truncate">
                            {item.artist} · {item.album}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  {filteredTracks.length === 0 && (
                    <div className="py-8 text-center text-[#B3B3B3] text-[13px]">
                      No tracks match &ldquo;{searchQuery}&rdquo;.
                    </div>
                  )}
                </div>
              </div>
            ) : navTab === 'library' ? (
              <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-6 space-y-4">
                <div className="flex items-center justify-between gap-2 pl-[54px]">
                  <h2 className="text-[22px] font-black tracking-tight text-white">Your Library</h2>
                  <button
                    type="button"
                    onClick={onOpenSpotifyModal}
                    className="px-3 py-1.5 rounded-full bg-[#1DB954] text-black text-[12px] font-bold cursor-pointer"
                  >
                    + Load
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {playlists.map((pl) => {
                    const isActivePl = pl.id === activePlaylistId;
                    const plArt = pl.coverArtUrl || pl.tracks[0]?.artworkUrl || '';
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => {
                          onSelectPlaylist?.(pl.id);
                          setNavTab('home');
                        }}
                        className={`p-3 rounded-[8px] text-left cursor-pointer transition-colors ${
                          isActivePl
                            ? 'bg-[#282828] ring-1 ring-[#1DB954]/60'
                            : 'bg-[#181818] hover:bg-[#242424]'
                        }`}
                      >
                        <div className="aspect-square w-full rounded-[6px] bg-[#282828] overflow-hidden mb-2.5 shadow-md flex items-center justify-center">
                          {plArt ? (
                            <img
                              src={plArt}
                              alt={pl.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Disc3 className="w-8 h-8 text-[#B3B3B3]" />
                          )}
                        </div>
                        <p
                          className={`text-[13.5px] font-bold truncate ${
                            isActivePl ? 'text-[#1DB954]' : 'text-white'
                          }`}
                        >
                          {pl.name}
                        </p>
                        <p className="text-[11.5px] text-[#B3B3B3] mt-0.5">
                          Playlist · {pl.tracks.length} songs
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Home / Active Playlist Mobile Stage */
              <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-4">
                {!hideBoxArt && (
                  <div className="flex justify-center pt-2 pb-4">
                    <div
                      {...doubleTapHideArtBind}
                      data-testid="spotify-mobile-hero-art"
                      title="Double-click or double-tap to hide album art"
                      className="w-[clamp(148px,44vw,204px)] aspect-square rounded-[4px] bg-[#282828] shadow-[0_12px_32px_rgba(0,0,0,0.65)] overflow-hidden flex items-center justify-center cursor-pointer"
                    >
                      {heroCoverUrl ? (
                        <img
                          src={heroCoverUrl}
                          alt={playlistName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music2 className="w-12 h-12 text-[#B3B3B3]" />
                      )}
                    </div>
                  </div>
                )}

                <div className={`${hideBoxArt ? 'pl-[54px] pt-1' : ''} flex items-end justify-between gap-3 mb-3`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#B3B3B3]">
                      Playlist
                    </p>
                    <h1 className="text-[22px] font-black tracking-tight text-white leading-tight truncate">
                      {playlistName}
                    </h1>
                    <p className="text-[12px] text-[#B3B3B3] mt-0.5 tabular-nums">
                      {playlistTracks.length} songs · {formatTotalPlaylistDuration(playlistTracks)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onTogglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-[52px] h-[52px] rounded-full bg-[#1DB954] hover:bg-[#1ED760] text-black flex items-center justify-center shadow-[0_6px_18px_rgba(29,185,84,0.45)] shrink-0 cursor-pointer active:scale-95 transition-transform"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                {/* Quick Utility Row: Shuffle, Heart Active, Load Spotify */}
                <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-[#282828]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onToggleShuffle}
                      aria-label="Toggle Shuffle"
                      className={`p-1.5 rounded-full cursor-pointer ${
                        shuffleEnabled ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
                      }`}
                    >
                      <Shuffle className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLikeTrack(track.id)}
                      aria-label="Favorite active song"
                      className={`p-1.5 rounded-full cursor-pointer ${
                        isActiveLiked ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isActiveLiked ? 'fill-[#1DB954]' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileSheetView('lyrics');
                        setMobileSheetOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-[6px] bg-white/[0.08] text-[11px] font-bold text-white cursor-pointer"
                    >
                      Lyrics
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenSpotifyModal}
                    className="px-2.5 py-1 rounded-[6px] border border-[#282828] text-[11px] font-semibold text-[#B3B3B3] hover:text-white cursor-pointer"
                  >
                    + Load Playlist
                  </button>
                </div>

                {/* Track List */}
                <div className="space-y-1">
                  {playlistTracks.map((item) => {
                    const isActive = item.id === track.id;
                    const itemLiked = likedIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectTrack?.(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectTrack?.(item.id);
                          }
                        }}
                        className="flex items-center gap-3 px-1.5 py-2 rounded-[6px] active:bg-white/[0.08] cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-[4px] bg-[#282828] overflow-hidden shrink-0 flex items-center justify-center">
                          {item.artworkUrl ? (
                            <img
                              src={item.artworkUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music2 className="w-5 h-5 text-[#B3B3B3]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {isActive && isPlaying && (
                              <span className="inline-flex items-end gap-[1.5px] h-3 shrink-0" aria-hidden="true">
                                <span className="sp-eq-bar-1 w-[2.5px] h-full bg-[#1DB954] rounded-t-[1px]" />
                                <span className="sp-eq-bar-2 w-[2.5px] h-full bg-[#1DB954] rounded-t-[1px]" />
                                <span className="sp-eq-bar-3 w-[2.5px] h-full bg-[#1DB954] rounded-t-[1px]" />
                              </span>
                            )}
                            <p
                              className={`text-[14px] font-semibold truncate ${
                                isActive ? 'text-[#1DB954]' : 'text-white'
                              }`}
                            >
                              {item.title}
                            </p>
                          </div>
                          <p className="text-[12px] text-[#B3B3B3] truncate">{item.artist}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeTrack(item.id);
                          }}
                          aria-label={`Favorite ${item.title}`}
                          className={`p-2 shrink-0 cursor-pointer ${
                            itemLiked ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${itemLiked ? 'fill-[#1DB954]' : ''}`} />
                        </button>
                      </div>
                    );
                  })}
                  {playlistTracks.length === 0 && (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-[14px] text-[#B3B3B3]">No tracks loaded yet.</p>
                      <button
                        type="button"
                        onClick={onOpenSpotifyModal}
                        className="px-4 py-2 rounded-full bg-[#1DB954] text-black text-[13px] font-bold cursor-pointer"
                      >
                        Load Spotify Playlist
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Floating Now Playing Mini-Bar */}
          <div
            className="absolute left-2 right-2 z-20"
            style={{
              bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setMobileSheetView('player');
                setMobileSheetOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setMobileSheetView('player');
                  setMobileSheetOpen(true);
                }
              }}
              style={{
                background: `linear-gradient(90deg, rgba(${rgbTriplet}, 0.88) 0%, #242424 100%)`,
              }}
              className="relative rounded-[8px] px-2.5 py-2 flex items-center gap-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.65)] overflow-hidden cursor-pointer"
            >
              <div className="w-10 h-10 rounded-[4px] bg-[#181818] overflow-hidden shrink-0 flex items-center justify-center">
                {!hideBoxArt && track.artworkUrl ? (
                  <img
                    src={track.artworkUrl}
                    alt={track.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music2 className="w-5 h-5 text-[#B3B3B3]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white truncate">
                  {isStandby ? 'No Track Loaded' : track.title}
                </p>
                <p className="text-[11px] text-[#E0E0E0] truncate">
                  {isStandby ? 'Tap Load to add a Spotify playlist' : track.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLikeTrack(track.id);
                }}
                aria-label="Favorite current track"
                className={`p-1.5 shrink-0 cursor-pointer ${
                  isActiveLiked ? 'text-[#1DB954]' : 'text-white/80'
                }`}
              >
                <Heart className={`w-4 h-4 ${isActiveLiked ? 'fill-[#1DB954]' : ''}`} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlay();
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="p-1.5 text-white shrink-0 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
              {/* Razor-thin 2px bottom progress rim */}
              <div className="absolute left-2 right-2 bottom-0 h-[2px] bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Mobile Bottom Tab Bar */}
          <nav
            aria-label="Spotify Navigation"
            style={{
              height: 'calc(54px + env(safe-area-inset-bottom, 0px))',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              background: 'linear-gradient(to top, rgba(0,0,0,0.98) 65%, rgba(0,0,0,0.84) 100%)',
            }}
            className="relative z-20 w-full border-t border-[#282828] grid grid-cols-4 items-center shrink-0"
          >
            {[
              { id: 'home' as const, label: 'Home', icon: Home, onTap: () => setNavTab('home') },
              { id: 'search' as const, label: 'Search', icon: Search, onTap: () => setNavTab('search') },
              { id: 'library' as const, label: 'Your Library', icon: Library, onTap: () => setNavTab('library') },
              { id: 'load' as const, label: 'Load', icon: PlusSquare, onTap: onOpenSpotifyModal },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = navTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={tab.onTap}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer ${
                    active ? 'text-white' : 'text-[#B3B3B3]'
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 1.8} />
                  <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Expandable Full-Screen Spotify Mobile Now Playing Sheet */}
          {mobileSheetOpen && (
            <div
              data-testid="spotify-mobile-now-playing-sheet"
              style={{
                background: `linear-gradient(180deg, rgba(${rgbTriplet}, 0.85) 0%, #121212 65%, #121212 100%)`,
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
              }}
              className="fixed inset-0 z-[100] px-5 flex flex-col justify-between overflow-hidden"
            >
              {/* Top Sheet Bar */}
              <div className="flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  aria-label="Minimize Now Playing"
                  className="p-2 -ml-2 text-white cursor-pointer"
                >
                  <ChevronDown className="w-6 h-6" />
                </button>
                <div className="text-center min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">
                    Playing from playlist
                  </p>
                  <p className="text-[12px] font-bold text-white truncate">{playlistName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileSheetView((v) => (v === 'lyrics' ? 'player' : 'lyrics'))}
                  aria-label="Toggle Lyrics"
                  className={`p-2 -mr-2 cursor-pointer ${
                    mobileSheetView === 'lyrics' ? 'text-[#1DB954]' : 'text-white/85'
                  }`}
                >
                  <Mic2 className="w-5 h-5" />
                </button>
              </div>

              {mobileSheetView === 'lyrics' ? (
                <div className="flex-1 min-h-0 my-4 rounded-[12px] bg-black/35 border border-white/10 p-3 overflow-hidden">
                  <SyncedLyricsPanel
                    track={track}
                    isStandby={isStandby}
                    isPlaying={isPlaying}
                    prefersReducedMotion={Boolean(prefersReducedMotion)}
                    themePalette={themePalette}
                    themeId="spotify"
                    onSeek={onSeek}
                    className="w-full h-full"
                  />
                </div>
              ) : (
                /* Center Large Album Art */
                <div className="flex-1 min-h-0 flex items-center justify-center py-4">
                  {!hideBoxArt ? (
                    <div
                      {...doubleTapHideArtBind}
                      className="w-full max-w-[330px] aspect-square rounded-[8px] bg-[#282828] shadow-[0_20px_50px_rgba(0,0,0,0.65)] overflow-hidden flex items-center justify-center cursor-pointer"
                    >
                      {track.artworkUrl ? (
                        <img
                          src={track.artworkUrl}
                          alt={track.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music2 className="w-16 h-16 text-[#B3B3B3]" />
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-[#B3B3B3] text-[13px]">
                      Album artwork hidden
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Controls Stack */}
              <div className="space-y-4 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[20px] font-black text-white truncate">
                      {isStandby ? 'No Track Selected' : track.title}
                    </h2>
                    <p className="text-[14px] text-[#B3B3B3] truncate">{track.artist}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLikeTrack(track.id)}
                    aria-label="Favorite active song"
                    className={`p-2 cursor-pointer ${
                      isActiveLiked ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
                    }`}
                  >
                    <Heart className={`w-6 h-6 ${isActiveLiked ? 'fill-[#1DB954]' : ''}`} />
                  </button>
                </div>

                {/* Scrubber */}
                <div>
                  <div
                    ref={sheetScrubberRef}
                    onClick={(e) => seekFromBarEvent(e.clientX, sheetScrubberRef.current)}
                    className="sp-scrubber-group relative h-5 flex items-center cursor-pointer"
                  >
                    <div className="w-full h-[4px] bg-white/25 rounded-full overflow-hidden">
                      <div
                        className="sp-scrubber-fill h-full bg-white rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span
                      style={{ left: `calc(${progressPct}% - 6px)` }}
                      className="sp-scrubber-thumb absolute w-3 h-3 rounded-full bg-white shadow"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-[#B3B3B3] tabular-nums">
                    <span>{formatDuration(elapsedSec)}</span>
                    <span>{formatDuration(track.durationSec)}</span>
                  </div>
                </div>

                {/* Transport */}
                <div className="flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={onToggleShuffle}
                    aria-label="Toggle Shuffle"
                    className={`p-2 cursor-pointer ${
                      shuffleEnabled ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
                    }`}
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={onPrevious}
                    aria-label="Previous"
                    className="p-2 text-white cursor-pointer"
                  >
                    <SkipBack className="w-7 h-7 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition-transform"
                  >
                    {isPlaying ? (
                      <Pause className="w-7 h-7 fill-current" />
                    ) : (
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    aria-label="Next"
                    className="p-2 text-white cursor-pointer"
                  >
                    <SkipForward className="w-7 h-7 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleRepeatOne}
                    aria-label="Toggle Repeat"
                    className={`p-2 cursor-pointer ${
                      repeatOne ? 'text-[#1DB954]' : 'text-[#B3B3B3]'
                    }`}
                  >
                    <Repeat className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* =========================================================================
       DESKTOP & WIDESCREEN VIEWPORT (>= 768px)
       1. Left Nav Sidebar (200-250px)
       2. Center/Right Main Stage (flex: 1)
       3. Bottom Persistent Now Playing Bar (84px)
       ========================================================================= */
    return (
      <div
        id="spotify-deck-stage"
        data-testid="spotify-deck-stage"
        data-layout="desktop"
        className="w-full h-full min-h-0 flex flex-col bg-[#000000] text-white overflow-hidden"
      >
        {/* Top Main 2-Pane Workspace */}
        <div className="flex-1 min-h-0 flex gap-2 p-2 pb-0 overflow-hidden">
          {/* 1. LEFT NAVIGATION SIDEBAR */}
          <aside
            id="spotify-left-sidebar"
            style={{ width: 'clamp(200px, 20vw, 250px)' }}
            className="h-full min-h-0 shrink-0 flex flex-col gap-2 overflow-hidden"
          >
            {/* Primary Nav Card (Pad left for top-left MYT emblem clearance) */}
            <div className="bg-[#121212] rounded-[8px] pt-[66px] px-3 pb-3 space-y-1 shrink-0">
              {[
                { id: 'home' as const, label: 'Home', icon: Home },
                { id: 'search' as const, label: 'Search', icon: Search },
                { id: 'library' as const, label: 'Your Library', icon: Library },
              ].map((item) => {
                const Icon = item.icon;
                const active = navTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setNavTab(item.id);
                      if (item.id === 'home') setMainPanel('tracks');
                    }}
                    className={`w-full flex items-center gap-3.5 px-2.5 py-2 rounded-[6px] text-[14px] font-bold transition-colors cursor-pointer ${
                      active ? 'text-white bg-white/[0.08]' : 'text-[#B3B3B3] hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={onOpenSpotifyModal}
                className="w-full flex items-center gap-3.5 px-2.5 py-2 rounded-[6px] text-[13.5px] font-bold text-[#B3B3B3] hover:text-white transition-colors cursor-pointer"
              >
                <PlusSquare className="w-5 h-5 text-[#1DB954] shrink-0" />
                <span className="truncate">Load Spotify Playlist</span>
              </button>
            </div>

            {/* Secondary Library Shelf + Expandable Bottom-Left Album Art Preview */}
            <div className="bg-[#121212] rounded-[8px] flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#282828] flex items-center justify-between shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#B3B3B3]">
                  Playlists
                </span>
                <button
                  type="button"
                  onClick={onOpenSpotifyModal}
                  aria-label="Add Spotify playlist"
                  className="text-[16px] leading-none text-[#B3B3B3] hover:text-white cursor-pointer"
                >
                  +
                </button>
              </div>

              <div className="sp-scroll flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
                {playlists.map((pl) => {
                  const active = pl.id === activePlaylistId;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        onSelectPlaylist?.(pl.id);
                        setNavTab('home');
                        setMainPanel('tracks');
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-[5px] text-left text-[13px] truncate cursor-pointer transition-colors ${
                        active
                          ? 'text-[#1DB954] font-bold bg-white/[0.06]'
                          : 'text-[#B3B3B3] hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      {pl.name}
                    </button>
                  );
                })}
              </div>

              {/* Expandable Bottom-Left Album Art Preview (Respects hideBoxArt & Double-Click Hide) */}
              {!hideBoxArt && !isStandby && (
                <div className="p-2 border-t border-[#282828] shrink-0">
                  <div
                    {...doubleTapHideArtBind}
                    data-testid="spotify-sidebar-art-preview"
                    title="Double-click to hide album art"
                    className="w-full aspect-square max-h-[168px] mx-auto rounded-[4px] bg-[#181818] overflow-hidden shadow-[0_8px_20px_rgba(0,0,0,0.65)] cursor-pointer flex items-center justify-center"
                  >
                    {track.artworkUrl ? (
                      <img
                        src={track.artworkUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music2 className="w-10 h-10 text-[#B3B3B3]" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* 2. CENTER / RIGHT MAIN STAGE */}
          <section
            id="spotify-main-stage"
            className="flex-1 min-w-0 h-full min-h-0 rounded-[8px] overflow-hidden flex flex-col relative"
            style={{
              background: `linear-gradient(180deg, rgba(${rgbTriplet}, 0.55) 0%, #121212 38%, #121212 100%)`,
            }}
          >
            {/* Top Bar inside Main Stage (Search Input when in Search tab, or View Switcher pills) */}
            <div className="px-6 pr-12 pt-4 pb-2 flex items-center justify-between gap-4 shrink-0">
              {navTab === 'search' ? (
                <div className="relative flex items-center w-full max-w-[380px] bg-white text-[#121212] rounded-full px-3.5 h-9 shadow">
                  <Search className="w-4 h-4 text-[#121212] shrink-0 mr-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tracks, artists, or albums..."
                    className="flex-1 min-w-0 bg-transparent text-[13px] font-medium placeholder:text-[#535353] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear filter"
                      className="p-1 text-[#121212] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMainPanel('tracks')}
                    className={`px-3 py-1 rounded-full text-[12px] font-bold cursor-pointer transition-colors ${
                      mainPanel === 'tracks'
                        ? 'bg-white text-black'
                        : 'bg-black/35 text-white hover:bg-black/55'
                    }`}
                  >
                    Playlist
                  </button>
                  <button
                    type="button"
                    onClick={() => setMainPanel((p) => (p === 'lyrics' ? 'tracks' : 'lyrics'))}
                    className={`px-3 py-1 rounded-full text-[12px] font-bold cursor-pointer transition-colors ${
                      mainPanel === 'lyrics'
                        ? 'bg-white text-black'
                        : 'bg-black/35 text-white hover:bg-black/55'
                    }`}
                  >
                    Lyrics
                  </button>
                  <button
                    type="button"
                    onClick={() => setMainPanel((p) => (p === 'canvas' ? 'tracks' : 'canvas'))}
                    className={`px-3 py-1 rounded-full text-[12px] font-bold cursor-pointer transition-colors ${
                      mainPanel === 'canvas'
                        ? 'bg-white text-black'
                        : 'bg-black/35 text-white hover:bg-black/55'
                    }`}
                  >
                    Video / Canvas
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onOpenSpotifyModal}
                className="px-3.5 py-1.5 rounded-full bg-black/45 hover:bg-black/70 border border-white/15 text-[12px] font-bold text-white shrink-0 cursor-pointer transition-colors"
              >
                + Load Playlist
              </button>
            </div>

            <div className="sp-scroll flex-1 min-h-0 overflow-y-auto px-6 pb-8">
              {navTab === 'library' ? (
                <div className="pt-2 space-y-4">
                  <h1 className="text-[28px] font-black tracking-tight text-white">Your Library</h1>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {playlists.map((pl) => {
                      const plArt = pl.coverArtUrl || pl.tracks[0]?.artworkUrl || '';
                      const isActivePl = pl.id === activePlaylistId;
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => {
                            onSelectPlaylist?.(pl.id);
                            setNavTab('home');
                            setMainPanel('tracks');
                          }}
                          className="group p-4 rounded-[8px] bg-[#181818] hover:bg-[#282828] transition-colors text-left cursor-pointer"
                        >
                          <div className="relative aspect-square w-full rounded-[6px] bg-[#242424] overflow-hidden shadow-lg mb-3 flex items-center justify-center">
                            {plArt ? (
                              <img
                                src={plArt}
                                alt={pl.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Disc3 className="w-10 h-10 text-[#B3B3B3]" />
                            )}
                            <span className="absolute right-2.5 bottom-2.5 w-11 h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-lg opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </span>
                          </div>
                          <p
                            className={`text-[15px] font-bold truncate ${
                              isActivePl ? 'text-[#1DB954]' : 'text-white'
                            }`}
                          >
                            {pl.name}
                          </p>
                          <p className="text-[12.5px] text-[#B3B3B3] mt-1">
                            Playlist · {pl.tracks.length} songs
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : mainPanel === 'lyrics' ? (
                <div className="max-w-[760px] mx-auto pt-4">
                  <div className="mb-4 flex items-center gap-4">
                    {!hideBoxArt && track.artworkUrl && (
                      <img
                        src={track.artworkUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-[4px] object-cover shadow"
                      />
                    )}
                    <div className="min-w-0">
                      <h2 className="text-[22px] font-black text-white truncate">{track.title}</h2>
                      <p className="text-[13px] text-[#B3B3B3] truncate">{track.artist}</p>
                    </div>
                  </div>
                  <div className="rounded-[12px] bg-black/35 border border-[#282828] p-5 h-[360px] overflow-hidden">
                    <SyncedLyricsPanel
                      track={track}
                      isStandby={isStandby}
                      isPlaying={isPlaying}
                      prefersReducedMotion={Boolean(prefersReducedMotion)}
                      themePalette={themePalette}
                      themeId="spotify"
                      onSeek={onSeek}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              ) : mainPanel === 'canvas' ? (
                <div className="max-w-[880px] mx-auto pt-3 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[22px] font-black text-white truncate">
                        {isStandby ? 'Canvas Standby' : track.title}
                      </h2>
                      <p className="text-[13px] text-[#B3B3B3] truncate">{track.artist}</p>
                    </div>
                  </div>
                  <div className="w-full aspect-video rounded-[10px] overflow-hidden bg-black border border-[#282828] shadow-[0_16px_42px_rgba(0,0,0,0.65)] relative flex items-center justify-center">
                    {!isStandby && resolvedVideoId ? (
                      <iframe
                        key={`${track.id}-${resolvedVideoId}`}
                        title={`Spotify Video Canvas - ${track.title}`}
                        src={buildCleanYouTubeEmbedUrl(
                          resolvedVideoId,
                          isPlaying,
                          Math.floor(elapsedSec),
                          windowOrigin,
                          true
                        )}
                        referrerPolicy="strict-origin-when-cross-origin"
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        className="w-full h-full border-0"
                      />
                    ) : !hideBoxArt && track.artworkUrl ? (
                      <img
                        src={track.artworkUrl}
                        alt={track.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-80"
                      />
                    ) : (
                      <div className="text-center text-[#B3B3B3] text-[14px]">
                        Select a track to view video canvas
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Playlist Hero Header */}
                  <div className="flex items-end gap-6 pt-3 pb-6">
                    {!hideBoxArt && (
                      <div
                        {...doubleTapHideArtBind}
                        data-testid="spotify-hero-cover-art"
                        title="Double-click to hide album art"
                        style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                        className="w-[180px] h-[180px] rounded-[4px] bg-[#282828] overflow-hidden shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        {heroCoverUrl ? (
                          <img
                            src={heroCoverUrl}
                            alt={playlistName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music2 className="w-14 h-14 text-[#B3B3B3]" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/90">
                        Playlist
                      </p>
                      <h1
                        style={{ fontSize: 'clamp(2rem, 4.5vw, 4rem)' }}
                        className="font-black tracking-tight text-white leading-[1.05] mt-1 mb-2 truncate"
                      >
                        {playlistName}
                      </h1>
                      <p className="text-[13.5px] font-medium text-[#E5E5E5] tabular-nums">
                        {playlistTracks.length} {playlistTracks.length === 1 ? 'song' : 'songs'} ·{' '}
                        <span className="text-[#B3B3B3]">
                          {formatTotalPlaylistDuration(playlistTracks)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Action Row */}
                  <div className="flex items-center gap-5 pb-5">
                    <button
                      type="button"
                      onClick={onTogglePlay}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      className="w-[56px] h-[56px] rounded-full bg-[#1DB954] hover:bg-[#1ED760] hover:scale-105 active:scale-95 text-black flex items-center justify-center shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition-transform cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6 fill-current" />
                      ) : (
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={onToggleShuffle}
                      aria-label="Toggle Shuffle"
                      title="Shuffle"
                      className={`p-2 cursor-pointer transition-colors ${
                        shuffleEnabled ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
                      }`}
                    >
                      <Shuffle className="w-6 h-6" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleLikeTrack(track.id)}
                      aria-label="Favorite active song"
                      title="Save to Liked Songs"
                      className={`p-2 cursor-pointer transition-colors ${
                        isActiveLiked ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
                      }`}
                    >
                      <Heart className={`w-6 h-6 ${isActiveLiked ? 'fill-[#1DB954]' : ''}`} />
                    </button>
                  </div>

                  {/* Tracklist Table */}
                  <div className="w-full">
                    {/* Sticky Table Header */}
                    <div
                      className="sticky top-0 z-10 grid items-center gap-4 px-4 py-2 border-b border-[#282828] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#B3B3B3] bg-[#121212]/90 backdrop-blur-sm"
                      style={{
                        gridTemplateColumns: '32px minmax(0, 1.8fr) minmax(0, 1.1fr) 72px',
                      }}
                    >
                      <span className="text-center">#</span>
                      <span>Title</span>
                      <span>Album</span>
                      <span className="flex justify-end pr-1">
                        <Clock className="w-4 h-4" />
                      </span>
                    </div>

                    {/* Track Rows */}
                    <div className="pt-2 space-y-0.5">
                      {filteredTracks.map((item, idx) => {
                        const isActive = item.id === track.id;
                        const itemLiked = likedIds.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectTrack?.(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelectTrack?.(item.id);
                              }
                            }}
                            style={{
                              gridTemplateColumns: '32px minmax(0, 1.8fr) minmax(0, 1.1fr) 72px',
                            }}
                            className="sp-track-row grid items-center gap-4 px-4 h-[56px] rounded-[4px] cursor-pointer"
                          >
                            {/* # / Hover Play / Equalizer */}
                            <div className="flex items-center justify-center">
                              {isActive && isPlaying ? (
                                <span
                                  className="sp-row-index items-end gap-[2px] h-3.5"
                                  aria-label="Playing"
                                >
                                  <span className="sp-eq-bar-1 w-[3px] h-full bg-[#1DB954] rounded-t-[1px]" />
                                  <span className="sp-eq-bar-2 w-[3px] h-full bg-[#1DB954] rounded-t-[1px]" />
                                  <span className="sp-eq-bar-3 w-[3px] h-full bg-[#1DB954] rounded-t-[1px]" />
                                </span>
                              ) : (
                                <span
                                  className={`sp-row-index text-[14px] tabular-nums ${
                                    isActive ? 'text-[#1DB954] font-bold' : 'text-[#B3B3B3]'
                                  }`}
                                >
                                  {idx + 1}
                                </span>
                              )}
                              <span className="sp-row-play-icon text-white">
                                {isActive && isPlaying ? (
                                  <Pause className="w-4 h-4 fill-current text-[#1DB954]" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current" />
                                )}
                              </span>
                            </div>

                            {/* Artwork + Title + Artist */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-[2px] bg-[#282828] overflow-hidden shrink-0 flex items-center justify-center">
                                {item.artworkUrl ? (
                                  <img
                                    src={item.artworkUrl}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Music2 className="w-4 h-4 text-[#B3B3B3]" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p
                                  className={`text-[14.5px] font-medium truncate ${
                                    isActive ? 'text-[#1DB954]' : 'text-white'
                                  }`}
                                >
                                  {item.title}
                                </p>
                                <p className="text-[12.5px] text-[#B3B3B3] truncate">{item.artist}</p>
                              </div>
                            </div>

                            {/* Album */}
                            <span className="text-[13px] text-[#B3B3B3] truncate">{item.album}</span>

                            {/* Favorite + Duration */}
                            <div className="flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLikeTrack(item.id);
                                }}
                                aria-label={`Favorite ${item.title}`}
                                className={`cursor-pointer transition-colors ${
                                  itemLiked
                                    ? 'text-[#1DB954]'
                                    : 'text-[#B3B3B3] opacity-60 hover:opacity-100 hover:text-white'
                                }`}
                              >
                                <Heart className={`w-4 h-4 ${itemLiked ? 'fill-[#1DB954]' : ''}`} />
                              </button>
                              <span className="text-[13px] text-[#B3B3B3] tabular-nums w-9 text-right">
                                {formatDuration(item.durationSec)}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {filteredTracks.length === 0 && (
                        <div className="py-12 text-center space-y-3">
                          <p className="text-[14px] text-[#B3B3B3]">
                            {searchQuery
                              ? `No songs matched "${searchQuery}".`
                              : 'Load a Spotify playlist to populate your queue.'}
                          </p>
                          <button
                            type="button"
                            onClick={onOpenSpotifyModal}
                            className="px-5 py-2 rounded-full bg-[#1DB954] hover:bg-[#1ED760] text-black text-[13px] font-bold cursor-pointer"
                          >
                            Load Spotify Playlist
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* 3. BOTTOM PERSISTENT NOW PLAYING BAR (84px) */}
        <footer
          id="spotify-now-playing-bar"
          style={{
            height: '84px',
            gridTemplateColumns: '30% 40% 30%',
          }}
          className="w-full shrink-0 bg-[#181818] border-t border-[#282828] px-4 grid items-center"
        >
          {/* Left: Current Art, Title, Artist, Heart */}
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-[56px] h-[56px] rounded-[4px] bg-[#282828] overflow-hidden shrink-0 flex items-center justify-center">
              {!hideBoxArt && track.artworkUrl ? (
                <img
                  src={track.artworkUrl}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music2 className="w-6 h-6 text-[#B3B3B3]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white truncate">
                {isStandby ? 'No Track Selected' : track.title}
              </p>
              <p className="text-[11.5px] text-[#B3B3B3] truncate">
                {isStandby ? 'Spotify Standby' : track.artist}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleLikeTrack(track.id)}
              aria-label="Favorite active song"
              className={`p-1.5 ml-1 shrink-0 cursor-pointer ${
                isActiveLiked ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${isActiveLiked ? 'fill-[#1DB954]' : ''}`} />
            </button>
          </div>

          {/* Center: Transport + Scrubber */}
          <div className="flex flex-col items-center justify-center gap-1.5 min-w-0 px-2">
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={onToggleShuffle}
                aria-label="Shuffle"
                className={`cursor-pointer transition-colors ${
                  shuffleEnabled ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onPrevious}
                aria-label="Previous"
                className="text-[#B3B3B3] hover:text-white cursor-pointer transition-colors"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-[34px] h-[34px] rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label="Next"
                className="text-[#B3B3B3] hover:text-white cursor-pointer transition-colors"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button
                type="button"
                onClick={onToggleRepeatOne}
                aria-label="Repeat"
                className={`cursor-pointer transition-colors ${
                  repeatOne ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
                }`}
              >
                <Repeat className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full max-w-[520px] flex items-center gap-2">
              <span className="text-[11px] text-[#B3B3B3] tabular-nums w-8 text-right shrink-0">
                {formatDuration(elapsedSec)}
              </span>
              <div
                ref={scrubberRef}
                onClick={(e) => seekFromBarEvent(e.clientX, scrubberRef.current)}
                className="sp-scrubber-group relative flex-1 h-4 flex items-center cursor-pointer"
              >
                <div className="w-full h-[4px] bg-[#4D4D4D] rounded-full overflow-hidden">
                  <div
                    className="sp-scrubber-fill h-full bg-white rounded-full transition-[width] duration-150"
                    style={{
                      width: `${progressPct}%`,
                      transition: prefersReducedMotion ? 'none' : undefined,
                    }}
                  />
                </div>
                <span
                  style={{ left: `calc(${progressPct}% - 6px)` }}
                  className="sp-scrubber-thumb opacity-0 transition-opacity absolute w-3 h-3 rounded-full bg-white shadow pointer-events-none"
                />
              </div>
              <span className="text-[11px] text-[#B3B3B3] tabular-nums w-8 shrink-0">
                {formatDuration(track.durationSec)}
              </span>
            </div>
          </div>

          {/* Right: Lyrics, Video/Canvas, Volume */}
          <div className="flex items-center justify-end gap-3 pl-3">
            <button
              type="button"
              onClick={() => setMainPanel((p) => (p === 'lyrics' ? 'tracks' : 'lyrics'))}
              aria-label="Lyrics View"
              title="Lyrics"
              className={`p-1.5 cursor-pointer transition-colors ${
                mainPanel === 'lyrics' ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
              }`}
            >
              <Mic2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMainPanel((p) => (p === 'canvas' ? 'tracks' : 'canvas'))}
              aria-label="Video Canvas View"
              title="Video / Canvas"
              className={`p-1.5 cursor-pointer transition-colors ${
                mainPanel === 'canvas' ? 'text-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
              }`}
            >
              <Tv className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 w-[124px]">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={clampedVol <= 0.01 ? 'Unmute' : 'Mute'}
                className="text-[#B3B3B3] hover:text-white cursor-pointer shrink-0"
              >
                {clampedVol <= 0.01 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <div
                ref={volBarRef}
                onClick={(e) => volumeFromBarEvent(e.clientX, volBarRef.current)}
                className="sp-scrubber-group relative flex-1 h-4 flex items-center cursor-pointer"
              >
                <div className="w-full h-[4px] bg-[#4D4D4D] rounded-full overflow-hidden">
                  <div
                    className="sp-scrubber-fill h-full bg-white rounded-full"
                    style={{ width: `${Math.round(clampedVol * 100)}%` }}
                  />
                </div>
                <span
                  style={{ left: `calc(${Math.round(clampedVol * 100)}% - 5px)` }}
                  className="sp-scrubber-thumb opacity-0 transition-opacity absolute w-2.5 h-2.5 rounded-full bg-white shadow pointer-events-none"
                />
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }
);

SpotifyDeck.displayName = 'SpotifyDeck';
