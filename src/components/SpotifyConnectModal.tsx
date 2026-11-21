import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Disc3,
  CheckCircle2,
  AlertCircle,
  Music,
  PlusCircle,
  LogOut,
  RefreshCw,
  Search,
  Check,
  Loader2,
} from 'lucide-react';
import type { PlaylistPack, DominantThemePalette, TrackImageCandidate } from '../utils/playerLogic';
import {
  buildPlaylistRoasts,
  extractSpotifyPlaylistId,
  type RoastTrackSeed,
} from '../utils/playlistRoast';

export interface SpotifySearchTrackResult {
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
}

export interface SpotifySearchAlbumResult {
  id: string;
  title: string;
  artist: string;
  releaseYear: number;
  totalTracks: number;
  artworkUrl: string;
  images?: TrackImageCandidate[];
  spotifyUri?: string;
}

export interface SpotifySearchResultsPayload {
  tracks: SpotifySearchTrackResult[];
  albums: SpotifySearchAlbumResult[];
}

interface SpotifyConnectModalProps {
  isOpen: boolean;
  isConnected: boolean;
  isSigningIn?: boolean;
  spotifyUserLabel: string;
  playlists: PlaylistPack[];
  activePlaylistId: string;
  themePalette: DominantThemePalette;
  authErrorMessage?: string | null;
  onClose: () => void;
  onStartSpotifyLogin: () => Promise<void>;
  onRefreshLibrary: () => Promise<void>;
  onLogout: () => void;
  onSelectPlaylist: (playlistId: string) => Promise<void> | void;
  onLoadPlaylistByIdOrUrl: (idOrUrl: string) => Promise<void>;
  onSearchSpotify?: (
    query: string,
    type?: 'all' | 'track' | 'album'
  ) => Promise<SpotifySearchResultsPayload>;
  onAddSearchTrackToQueue?: (track: SpotifySearchTrackResult) => void;
  onAddSearchAlbumToQueue?: (album: SpotifySearchAlbumResult) => Promise<number>;
}

export const SpotifyConnectModal: React.FC<SpotifyConnectModalProps> = ({
  isOpen,
  isConnected,
  isSigningIn = false,
  spotifyUserLabel,
  playlists,
  activePlaylistId,
  themePalette,
  authErrorMessage = null,
  onClose,
  onStartSpotifyLogin,
  onRefreshLibrary,
  onLogout,
  onSelectPlaylist,
  onLoadPlaylistByIdOrUrl,
  onSearchSpotify,
  onAddSearchTrackToQueue,
  onAddSearchAlbumToQueue,
}) => {
  const [playlistUrlInput, setPlaylistUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'track' | 'album'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SpotifySearchResultsPayload | null>(null);
  const [addedItemIds, setAddedItemIds] = useState<Record<string, boolean>>({});
  const [addingAlbumId, setAddingAlbumId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingCaption, setLoadingCaption] = useState('Loading Spotify Playlist...');
  const [loadingPlaylistName, setLoadingPlaylistName] = useState('');
  const [roastSeedTracks, setRoastSeedTracks] = useState<RoastTrackSeed[]>([]);
  const [roastMode, setRoastMode] = useState<'playlist' | 'refresh' | 'login'>('playlist');
  const [roastIndex, setRoastIndex] = useState(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const activeReqIdRef = useRef(0);
  const pointerDownOnBackdropRef = useRef(true);

  const libraryFallbackTracks = useMemo<RoastTrackSeed[]>(() => {
    const collected: RoastTrackSeed[] = [];
    for (const pl of playlists) {
      for (const tr of pl.tracks || []) {
        if (tr.title || tr.artist) {
          collected.push({ title: tr.title, artist: tr.artist });
        }
        if (collected.length >= 16) return collected;
      }
    }
    return collected;
  }, [playlists]);

  const roasts = useMemo(
    () =>
      buildPlaylistRoasts({
        playlistName: loadingPlaylistName,
        tracks: roastSeedTracks,
        fallbackTracks: libraryFallbackTracks,
        mode: roastMode,
      }),
    [loadingPlaylistName, roastSeedTracks, libraryFallbackTracks, roastMode]
  );

  useEffect(() => {
    if (!isOpen) {
      activeReqIdRef.current += 1;
      setStatusMessage(null);
      setLocalErrorMessage(null);
      setIsLoading(false);
      setIsSearching(false);
      setAddingAlbumId(null);
      setLoadingPlaylistName('');
      setRoastSeedTracks([]);
      setRoastIndex(0);
      return;
    }
    pointerDownOnBackdropRef.current = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        activeReqIdRef.current += 1;
        setIsLoading(false);
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const busy = isLoading || isSigningIn;

  useEffect(() => {
    setRoastIndex(0);
  }, [roasts, busy]);

  useEffect(() => {
    if (!isOpen || !busy || roasts.length <= 1) return;
    const timer = window.setInterval(() => {
      setRoastIndex((prev) => (prev + 1) % roasts.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [isOpen, busy, roasts.length]);

  if (!isOpen) return null;

  const combinedError = localErrorMessage || authErrorMessage;
  const activeRoast = roasts[roastIndex % Math.max(1, roasts.length)] || '';

  const handleDismissModal = () => {
    activeReqIdRef.current += 1;
    setIsLoading(false);
    onCloseRef.current();
  };

  const peekPlaylistTracksForRoast = (spotifyPlaylistId: string, reqId: number) => {
    if (!spotifyPlaylistId) return;
    fetch(`/api/spotify/playlist-peek?id=${encodeURIComponent(spotifyPlaylistId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            name?: string;
            tracks?: Array<{ title?: string; artist?: string }>;
          } | null
        ) => {
          if (!data || !isOpenRef.current || activeReqIdRef.current !== reqId) return;
          if (data.name) {
            setLoadingPlaylistName(data.name);
          }
          if (Array.isArray(data.tracks) && data.tracks.length > 0) {
            setRoastSeedTracks(
              data.tracks.map((t) => ({
                title: t.title || '',
                artist: t.artist || '',
              }))
            );
          }
        }
      )
      .catch(() => {
        // Non-blocking: roasts still fall back cleanly
      });
  };

  const handleSignInClick = async () => {
    if (busy) return;
    const reqId = ++activeReqIdRef.current;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setRoastMode('login');
    setLoadingPlaylistName('');
    setRoastSeedTracks([]);
    setLoadingCaption('Connecting to Spotify...');
    setIsLoading(true);
    try {
      await onStartSpotifyLogin();
    } catch (err) {
      if (isOpenRef.current && activeReqIdRef.current === reqId) {
        setLocalErrorMessage(
          err instanceof Error ? err.message : 'Could not start Spotify sign-in.'
        );
      }
    } finally {
      if (activeReqIdRef.current === reqId) {
        setIsLoading(false);
      }
    }
  };

  const handleRefreshClick = async () => {
    if (busy) return;
    const reqId = ++activeReqIdRef.current;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setRoastMode('refresh');
    setLoadingPlaylistName('Your Spotify Library');
    setRoastSeedTracks(libraryFallbackTracks);
    setLoadingCaption('Loading Spotify Playlist...');
    setIsLoading(true);
    try {
      await onRefreshLibrary();
      if (isOpenRef.current && activeReqIdRef.current === reqId) {
        setStatusMessage('Synced your Spotify playlists & library.');
      }
    } catch (err) {
      if (isOpenRef.current && activeReqIdRef.current === reqId) {
        setLocalErrorMessage(
          err instanceof Error ? err.message : 'Failed to refresh your Spotify library.'
        );
      }
    } finally {
      if (activeReqIdRef.current === reqId) {
        setIsLoading(false);
      }
    }
  };

  const handleLogoutClick = () => {
    if (busy) return;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    onLogout();
  };

  const handleSelectPlaylistClick = async (pl: PlaylistPack) => {
    if (busy) return;
    const reqId = ++activeReqIdRef.current;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setRoastMode('playlist');
    setLoadingPlaylistName(pl.name);
    setRoastSeedTracks(
      (pl.tracks || []).map((t) => ({ title: t.title || '', artist: t.artist || '' }))
    );
    setLoadingCaption('Loading Spotify Playlist...');
    setIsLoading(true);
    if ((!pl.tracks || pl.tracks.length === 0) && pl.spotifyPlaylistId) {
      peekPlaylistTracksForRoast(pl.spotifyPlaylistId, reqId);
    }
    try {
      await Promise.resolve(onSelectPlaylist(pl.id));
      if (!isOpenRef.current || activeReqIdRef.current !== reqId) return;
      setIsLoading(false);
      onCloseRef.current();
    } catch (err) {
      if (isOpenRef.current && activeReqIdRef.current === reqId) {
        setLocalErrorMessage(
          err instanceof Error ? err.message : 'Failed to load Spotify playlist.'
        );
        setIsLoading(false);
      }
    }
  };

  const handleAddPlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = playlistUrlInput.trim();
    if (busy || !trimmed) return;
    const reqId = ++activeReqIdRef.current;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setRoastMode('playlist');
    setLoadingPlaylistName('');
    setRoastSeedTracks([]);
    setLoadingCaption('Loading Spotify Playlist...');
    setIsLoading(true);
    const cleanId = extractSpotifyPlaylistId(trimmed);
    if (cleanId) {
      peekPlaylistTracksForRoast(cleanId, reqId);
    }
    try {
      await onLoadPlaylistByIdOrUrl(trimmed);
      if (!isOpenRef.current || activeReqIdRef.current !== reqId) return;
      setPlaylistUrlInput('');
      setStatusMessage('Loaded Spotify playlist.');
      setIsLoading(false);
      onCloseRef.current();
    } catch (err) {
      if (isOpenRef.current && activeReqIdRef.current === reqId) {
        setLocalErrorMessage(
          err instanceof Error ? err.message : 'Failed to load Spotify playlist.'
        );
        setIsLoading(false);
      }
    }
  };

  const executeSearch = async (queryText: string, filterType: 'all' | 'track' | 'album') => {
    const trimmed = queryText.trim();
    if (!trimmed || !onSearchSpotify) return;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setIsSearching(true);
    try {
      const payload = await onSearchSpotify(trimmed, filterType);
      if (isOpenRef.current) {
        setSearchResults(payload);
      }
    } catch (err) {
      if (isOpenRef.current) {
        setLocalErrorMessage(err instanceof Error ? err.message : 'Spotify search failed.');
      }
    } finally {
      if (isOpenRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(searchQuery, searchFilter);
  };

  const handleAddTrackClick = (track: SpotifySearchTrackResult) => {
    if (!onAddSearchTrackToQueue) return;
    onAddSearchTrackToQueue(track);
    setAddedItemIds((prev) => ({ ...prev, [track.id]: true }));
    setStatusMessage(`Added "${track.title}" to your queue.`);
  };

  const handleAddAlbumClick = async (album: SpotifySearchAlbumResult) => {
    if (!onAddSearchAlbumToQueue || addingAlbumId) return;
    setAddingAlbumId(album.id);
    setLocalErrorMessage(null);
    try {
      const addedCount = await onAddSearchAlbumToQueue(album);
      if (isOpenRef.current) {
        setAddedItemIds((prev) => ({ ...prev, [album.id]: true }));
        setStatusMessage(`Added ${addedCount} tracks from "${album.title}" to your queue.`);
      }
    } catch (err) {
      if (isOpenRef.current) {
        setLocalErrorMessage(err instanceof Error ? err.message : 'Could not add album tracks.');
      }
    } finally {
      if (isOpenRef.current) {
        setAddingAlbumId(null);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-modal-title"
      data-testid="spotify-modal-backdrop"
      onPointerDown={(e) => {
        pointerDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pointerDownOnBackdropRef.current) {
          pointerDownOnBackdropRef.current = true;
          handleDismissModal();
        } else {
          pointerDownOnBackdropRef.current = true;
        }
      }}
      className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        id="spotify-modal-card"
        onPointerDown={() => {
          pointerDownOnBackdropRef.current = false;
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: 'calc(100dvh - 32px)',
          overflow: 'hidden',
          borderRadius: '16px',
          boxSizing: 'border-box',
        }}
        className="glass-panel relative shadow-2xl text-[#f5efe6]"
      >
        {/* Centered Loading Spinner Overlay During Playlist / Library Fetch */}
        {busy && (
          <div
            id="spotify-modal-loading-overlay"
            data-testid="spotify-modal-loading-overlay"
            aria-live="polite"
            className="absolute inset-0 z-30 rounded-[16px] bg-black/88 backdrop-blur-md flex flex-col items-center justify-center gap-3.5 p-6 text-center"
          >
            <button
              id="spotify-loading-close-btn"
              data-testid="spotify-loading-close-btn"
              type="button"
              onClick={handleDismissModal}
              aria-label="Close loading overlay"
              title="Close & keep loading in background"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="absolute top-4 right-4 z-40 bg-white/12 hover:bg-white/25 border border-white/20 text-white/90 hover:text-white cursor-pointer transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div
              aria-hidden="true"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '9999px',
                border: '4px solid rgba(255, 255, 255, 0.16)',
                borderTopColor: '#1ED760',
                animation: 'spin 0.9s linear infinite',
              }}
            />
            <p
              id="spotify-loading-caption"
              className="font-sans text-sm font-semibold text-white tracking-tight"
            >
              {loadingCaption}
            </p>
            {activeRoast && (
              <p
                id="spotify-loading-roast"
                data-testid="spotify-loading-roast"
                key={roastIndex}
                className="max-w-[340px] px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs leading-relaxed text-[#e6dfd4] italic"
              >
                {activeRoast}
              </p>
            )}
            <button
              id="spotify-loading-dismiss-bg-btn"
              type="button"
              onClick={handleDismissModal}
              className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/75 hover:text-white bg-white/[0.06] hover:bg-white/15 border border-white/10 cursor-pointer transition-colors"
            >
              Close &amp; keep loading in background
            </button>
          </div>
        )}

        <div
          style={{
            maxHeight: 'calc(100dvh - 32px)',
            overflowY: 'auto',
            padding: '20px',
            boxSizing: 'border-box',
          }}
          className="space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >

        {/* Modal Header (Flexbox Row: Title Left, Crisp 32x32 Circular Close Right) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
          }}
          className="border-b border-white/10 pb-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Disc3 style={{ color: themePalette.lightHex }} className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h2
                id="spotify-modal-title"
                className="font-display text-base font-bold text-white leading-tight truncate"
              >
                Load Spotify Playlist
              </h2>
              <p className="text-[11px] text-white/60 leading-snug">
                Connect Spotify (PKCE) or paste a playlist link.
              </p>
            </div>
          </div>
          <button
            id="spotify-modal-close-btn"
            type="button"
            onClick={handleDismissModal}
            aria-label="Close Spotify Modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            className="bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white cursor-pointer transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Spotify Account Connection Card */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-3">
          {isConnected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-[#1ED760] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    Signed in as <span className="text-[#1ED760]">{spotifyUserLabel}</span>
                  </p>
                  <p className="text-[11px] text-white/55">
                    {playlists.length} Spotify playlists synced &amp; ready
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <button
                  id="spotify-refresh-library-btn"
                  type="button"
                  onClick={handleRefreshClick}
                  disabled={busy}
                  style={{
                    height: '40px',
                    minHeight: '40px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className="hifi-btn px-3.5 gap-1.5 text-xs font-semibold text-white/90 rounded-xl"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                  <span>{busy ? 'Syncing...' : 'Refresh'}</span>
                </button>
                <button
                  id="spotify-logout-btn"
                  type="button"
                  onClick={handleLogoutClick}
                  disabled={busy}
                  style={{
                    height: '40px',
                    minHeight: '40px',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  className="hifi-btn px-3.5 gap-1.5 text-xs font-semibold text-red-300 border-red-400/35 hover:text-red-200 rounded-xl"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-white">Connect Your Spotify Library</p>
                <p className="text-[11px] text-white/60 leading-snug">
                  Authenticates via Spotify OAuth 2.0 + PKCE. Nothing is shared with other users.
                </p>
              </div>
              <button
                id="spotify-one-click-login-btn"
                type="button"
                onClick={handleSignInClick}
                disabled={busy}
                style={{
                  height: '40px',
                  minHeight: '40px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className="w-full px-4 rounded-full bg-[#1ED760] hover:bg-[#1fdf64] active:scale-[0.99] text-[#000000] font-bold text-xs gap-2 transition-[transform,background-color] cursor-pointer shadow-[0_6px_18px_rgba(30,215,96,0.3)] disabled:opacity-60"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 fill-current shrink-0"
                  aria-hidden="true"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.334.132-.67.469-.745 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.855zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
                </svg>
                <span>{busy ? 'Signing in...' : 'Sign in with Spotify'}</span>
              </button>
            </div>
          )}
        </div>

        {statusMessage && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {combinedError && (
          <div
            role="alert"
            data-testid="spotify-auth-error"
            className="bg-red-950/60 border border-red-500/50 rounded-xl p-3 flex items-center gap-2.5 text-xs text-red-200"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{combinedError}</span>
          </div>
        )}

        {/* User's Synced Spotify Playlists */}
        {playlists.length > 0 && (
          <div className="bg-black/35 border border-white/10 rounded-xl p-3.5 space-y-2.5">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-white/85 flex items-center gap-2">
              <Music style={{ color: themePalette.lightHex }} className="w-4 h-4 shrink-0" />
              <span>Your Spotify Playlists ({playlists.length})</span>
            </h3>
            <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-0.5">
              {playlists.map((pl) => {
                const isSelected = pl.id === activePlaylistId;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleSelectPlaylistClick(pl)}
                    style={
                      isSelected
                        ? {
                            backgroundColor: themePalette.softBgRgba,
                            borderColor: themePalette.borderRgba,
                          }
                        : undefined
                    }
                    className={`min-h-[42px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left border transition-[transform,opacity] cursor-pointer disabled:opacity-60 ${
                      isSelected
                        ? 'text-white'
                        : 'glass-button text-white/80 hover:text-white border-transparent'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{pl.name}</p>
                      <p className="text-[10px] text-white/50 truncate">
                        {pl.tracks.length > 1 ? `${pl.tracks.length} tracks · Spotify` : pl.subtitle}
                      </p>
                    </div>
                    <span
                      style={{ color: themePalette.lightHex }}
                      className="text-[11px] font-mono shrink-0"
                    >
                      Play
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Spotify Tracks & Albums Directly Into Queue */}
        {onSearchSpotify && (
          <div className="bg-black/35 border border-white/10 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-white/85 flex items-center gap-2">
                <Search style={{ color: themePalette.lightHex }} className="w-3.5 h-3.5 shrink-0" />
                <span>Search Tracks or Albums</span>
              </h3>
              <div className="flex items-center gap-1">
                {(['all', 'track', 'album'] as const).map((kind) => {
                  const active = searchFilter === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setSearchFilter(kind);
                        if (searchQuery.trim()) {
                          void executeSearch(searchQuery, kind);
                        }
                      }}
                      style={
                        active
                          ? {
                              backgroundColor: themePalette.softBgRgba,
                              borderColor: themePalette.borderRgba,
                              color: themePalette.lightHex,
                            }
                          : undefined
                      }
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border cursor-pointer transition-colors ${
                        active
                          ? ''
                          : 'border-white/10 bg-black/40 text-white/60 hover:text-white'
                      }`}
                    >
                      {kind === 'all' ? 'All' : kind === 'track' ? 'Tracks' : 'Albums'}
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <input
                id="spotify-search-input"
                data-testid="spotify-search-input"
                type="text"
                disabled={busy}
                placeholder="Search songs, artists, or albums..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ height: '40px' }}
                className="flex-1 min-w-0 px-3 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-white/40"
              />
              <button
                id="spotify-search-submit-btn"
                type="submit"
                disabled={busy || isSearching || !searchQuery.trim()}
                style={{
                  height: '40px',
                  minHeight: '40px',
                  whiteSpace: 'nowrap',
                  color: themePalette.lightHex,
                }}
                className="hifi-btn px-3.5 gap-1.5 text-xs font-semibold rounded-xl inline-flex items-center justify-center shrink-0"
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>{isSearching ? 'Searching' : 'Search'}</span>
              </button>
            </form>

            {searchResults && (
              <div
                id="spotify-search-results"
                data-testid="spotify-search-results"
                className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5"
              >
                {searchResults.tracks.length === 0 && searchResults.albums.length === 0 ? (
                  <p className="text-[11px] text-white/55 text-center py-2">
                    No matching tracks or albums found.
                  </p>
                ) : (
                  <>
                    {searchResults.tracks.map((tr) => {
                      const isAdded = Boolean(addedItemIds[tr.id]);
                      return (
                        <div
                          key={`sr-tr-${tr.id}`}
                          className="px-2.5 py-2 rounded-xl bg-black/45 border border-white/10 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {tr.artworkUrl ? (
                              <img
                                src={tr.artworkUrl}
                                alt={tr.title}
                                className="w-8 h-8 rounded object-cover shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                                <Music className="w-3.5 h-3.5 text-white/60" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{tr.title}</p>
                              <p className="text-[10px] text-white/55 truncate">
                                Track · {tr.artist}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddTrackClick(tr)}
                            style={
                              isAdded
                                ? {
                                    borderColor: 'rgba(30, 215, 96, 0.5)',
                                    color: '#1ED760',
                                  }
                                : { color: themePalette.lightHex }
                            }
                            className="hifi-btn px-2.5 h-[30px] rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            {isAdded ? <Check className="w-3 h-3" /> : <PlusCircle className="w-3 h-3" />}
                            <span>{isAdded ? 'Added' : 'Add'}</span>
                          </button>
                        </div>
                      );
                    })}

                    {searchResults.albums.map((al) => {
                      const isAdded = Boolean(addedItemIds[al.id]);
                      const isAddingThis = addingAlbumId === al.id;
                      return (
                        <div
                          key={`sr-al-${al.id}`}
                          className="px-2.5 py-2 rounded-xl bg-black/45 border border-white/10 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {al.artworkUrl ? (
                              <img
                                src={al.artworkUrl}
                                alt={al.title}
                                className="w-8 h-8 rounded object-cover shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center shrink-0">
                                <Disc3 className="w-3.5 h-3.5 text-white/60" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{al.title}</p>
                              <p className="text-[10px] text-white/55 truncate">
                                Album · {al.artist} ({al.totalTracks} tracks)
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isAddingThis}
                            onClick={() => handleAddAlbumClick(al)}
                            style={
                              isAdded
                                ? {
                                    borderColor: 'rgba(30, 215, 96, 0.5)',
                                    color: '#1ED760',
                                  }
                                : { color: themePalette.lightHex }
                            }
                            className="hifi-btn px-2.5 h-[30px] rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-60"
                          >
                            {isAddingThis ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isAdded ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <PlusCircle className="w-3 h-3" />
                            )}
                            <span>{isAddingThis ? 'Adding' : isAdded ? 'Added' : 'Add Album'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Public Spotify Playlist URL / ID Loader */}
        <form
          onSubmit={handleAddPlaylistSubmit}
          className="bg-black/35 border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5"
        >
          <input
            id="spotify-playlist-url-input"
            type="text"
            disabled={busy}
            placeholder="Paste Spotify playlist URL or ID..."
            value={playlistUrlInput}
            onChange={(e) => setPlaylistUrlInput(e.target.value)}
            style={{ width: '100%', height: '44px' }}
            className="px-3 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-white/40"
          />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              id="spotify-load-playlist-btn"
              type="submit"
              disabled={busy || !playlistUrlInput.trim()}
              style={{
                height: '40px',
                minHeight: '40px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: themePalette.lightHex,
              }}
              className="hifi-btn px-4 gap-2 font-semibold text-xs rounded-xl"
            >
              <PlusCircle strokeWidth={1.75} className="w-4 h-4 shrink-0" />
              <span>Load Playlist</span>
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};
