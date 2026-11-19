import React, { useState, useEffect } from 'react';
import {
  X,
  Disc3,
  CheckCircle2,
  AlertCircle,
  Music,
  PlusCircle,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import type { PlaylistPack, DominantThemePalette } from '../utils/playerLogic';

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
  onSelectPlaylist: (playlistId: string) => void;
  onLoadPlaylistByIdOrUrl: (idOrUrl: string) => Promise<void>;
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
}) => {
  const [playlistUrlInput, setPlaylistUrlInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStatusMessage(null);
      setLocalErrorMessage(null);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const combinedError = localErrorMessage || authErrorMessage;
  const busy = isLoading || isSigningIn;

  const handleSignInClick = async () => {
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onStartSpotifyLogin();
    } catch (err) {
      setLocalErrorMessage(
        err instanceof Error ? err.message : 'Could not start Spotify sign-in.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshClick = async () => {
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onRefreshLibrary();
      setStatusMessage('Synced your Spotify playlists & library.');
    } catch (err) {
      setLocalErrorMessage(
        err instanceof Error ? err.message : 'Failed to refresh your Spotify library.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoutClick = () => {
    setLocalErrorMessage(null);
    setStatusMessage(null);
    onLogout();
  };

  const handleAddPlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrlInput.trim()) return;
    setLocalErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onLoadPlaylistByIdOrUrl(playlistUrlInput.trim());
      setPlaylistUrlInput('');
      setStatusMessage('Loaded Spotify playlist onto the turntable.');
      onClose();
    } catch (err) {
      setLocalErrorMessage(
        err instanceof Error ? err.message : 'Failed to load Spotify playlist.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-modal-title"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div className="glass-panel rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-[#f5efe6]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Disc3 style={{ color: themePalette.lightHex }} className="w-6 h-6" />
            <div>
              <h2 id="spotify-modal-title" className="font-display text-lg font-bold text-white">
                MaxYoutify · Spotify Connect
              </h2>
              <p className="text-xs text-white/60">
                Sign in securely with your Spotify account (OAuth 2.0 + PKCE) to load your playlists &amp; Liked Songs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Spotify Modal"
            className="hifi-btn text-white/80"
          >
            <X strokeWidth={1.75} className="hifi-icon" />
          </button>
        </div>

        {/* Spotify Account Connection Card */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3">
          {isConnected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-5 h-5 text-[#1ED760] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    Signed in as <span className="text-[#1ED760]">{spotifyUserLabel}</span>
                  </p>
                  <p className="text-[11px] text-white/55">
                    {playlists.length} Spotify playlists synced &amp; ready
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="spotify-refresh-library-btn"
                  type="button"
                  onClick={handleRefreshClick}
                  disabled={busy}
                  className="hifi-btn px-3 gap-1.5 text-xs font-medium text-white/90"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                  <span>{busy ? 'Syncing...' : 'Refresh'}</span>
                </button>
                <button
                  id="spotify-logout-btn"
                  type="button"
                  onClick={handleLogoutClick}
                  className="hifi-btn px-3 gap-1.5 text-xs font-medium text-red-300 border-red-400/35 hover:text-red-200"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-white">Connect Your Spotify Library</p>
                <p className="text-[11px] text-white/60 leading-snug">
                  Authenticates via Spotify Authorization Code + PKCE. Nothing is shared with other users.
                </p>
              </div>
              <button
                id="spotify-one-click-login-btn"
                type="button"
                onClick={handleSignInClick}
                disabled={busy}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#1ED760] hover:bg-[#1fdf64] active:scale-[0.99] text-[#000000] font-bold text-xs inline-flex items-center justify-center gap-2 transition-[transform,background-color] cursor-pointer shrink-0 shadow-[0_6px_18px_rgba(30,215,96,0.3)] disabled:opacity-60"
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
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {combinedError && (
          <div
            role="alert"
            data-testid="spotify-auth-error"
            className="bg-red-950/60 border border-red-500/50 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-red-200"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{combinedError}</span>
          </div>
        )}

        {/* User's Synced Spotify Playlists */}
        {playlists.length > 0 && (
          <div className="bg-black/35 border border-white/10 rounded-2xl p-4 space-y-2.5">
            <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
              <Music style={{ color: themePalette.lightHex }} className="w-4 h-4" />
              <span>Your Spotify Playlists ({playlists.length})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {playlists.map((pl) => {
                const isSelected = pl.id === activePlaylistId;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => {
                      onSelectPlaylist(pl.id);
                      onClose();
                    }}
                    style={
                      isSelected
                        ? {
                            backgroundColor: themePalette.softBgRgba,
                            borderColor: themePalette.borderRgba,
                          }
                        : undefined
                    }
                    className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left border transition-[transform,opacity] cursor-pointer ${
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

        {/* Optional Public Spotify Playlist Link Loader */}
        <form
          onSubmit={handleAddPlaylistSubmit}
          className="bg-black/35 border border-white/10 rounded-2xl p-3.5 flex items-center gap-2"
        >
          <input
            id="spotify-playlist-url-input"
            type="text"
            placeholder="Paste any public Spotify playlist URL or ID..."
            value={playlistUrlInput}
            onChange={(e) => setPlaylistUrlInput(e.target.value)}
            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none"
          />
          <button
            id="spotify-load-playlist-btn"
            type="submit"
            disabled={busy || !playlistUrlInput.trim()}
            style={{ color: themePalette.lightHex }}
            className="hifi-btn px-3.5 gap-2 font-semibold text-xs shrink-0"
          >
            <PlusCircle strokeWidth={1.75} className="hifi-icon" />
            <span>Load Playlist</span>
          </button>
        </form>
      </div>
    </div>
  );
};
