import React, { useState } from 'react';
import { X, Disc3, CheckCircle2, AlertCircle, Music, PlusCircle, LogIn } from 'lucide-react';
import type { PlaylistPack, DominantThemePalette } from '../utils/playerLogic';

interface SpotifyConnectModalProps {
  isOpen: boolean;
  isConnected: boolean;
  spotifyUserLabel: string;
  playlists: PlaylistPack[];
  activePlaylistId: string;
  themePalette: DominantThemePalette;
  onClose: () => void;
  onOneClickSpotifyLogin: (accountName?: string) => Promise<void>;
  onSelectPlaylist: (playlistId: string) => void;
  onLoadPlaylistByIdOrUrl: (idOrUrl: string) => Promise<void>;
}

export const SpotifyConnectModal: React.FC<SpotifyConnectModalProps> = ({
  isOpen,
  isConnected,
  spotifyUserLabel,
  playlists,
  activePlaylistId,
  themePalette,
  onClose,
  onOneClickSpotifyLogin,
  onSelectPlaylist,
  onLoadPlaylistByIdOrUrl,
}) => {
  const [accountNameInput, setAccountNameInput] = useState('usmanmr');
  const [playlistUrlInput, setPlaylistUrlInput] = useState(
    'https://open.spotify.com/playlist/2ENMa1IQDSlEPDKNmS25K2'
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSimpleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onOneClickSpotifyLogin(accountNameInput.trim() || 'usmanmr');
      setStatusMessage('Signed in to Spotify and loaded all your playlists!');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not sign in to Spotify.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrlInput.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onLoadPlaylistByIdOrUrl(playlistUrlInput.trim());
      setStatusMessage('Loaded complete Spotify playlist (all songs) onto the turntable!');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load Spotify playlist.');
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
                MaxVinyFy · Spotify Connect
              </h2>
              <p className="text-xs text-white/60">
                One-click sign in to load all your Spotify playlists &amp; full tracklists — no API keys required.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Spotify Modal"
            className="glass-button w-9 h-9 rounded-xl text-white/75 hover:text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* One-Click Simple Spotify Login Card */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3">
          {isConnected ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#1ed760] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-white">
                    Connected as <span className="text-[#1ed760]">{spotifyUserLabel}</span>
                  </p>
                  <p className="text-[11px] text-white/55">
                    {playlists.length} Spotify playlists synced &amp; ready
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSimpleLogin()}
                disabled={isLoading}
                className="glass-button px-3 py-1.5 rounded-xl text-xs font-medium text-white/85 hover:text-white"
              >
                Refresh Playlists
              </button>
            </div>
          ) : (
            <form onSubmit={handleSimpleLogin} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="spotify-account-name"
                  type="text"
                  value={accountNameInput}
                  onChange={(e) => setAccountNameInput(e.target.value)}
                  placeholder="Spotify username or email"
                  aria-label="Spotify username or email"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/55 border border-white/15 text-xs text-white focus:outline-none focus:border-[#1ed760]"
                />
                <button
                  id="spotify-one-click-login-btn"
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#1ed760] hover:bg-[#1fdf64] text-black font-bold text-xs flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer shrink-0"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isLoading ? 'Signing in...' : 'Log in with Spotify'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {statusMessage && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-950/60 border border-red-500/50 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
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
                    className={`px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left border transition-all ${
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

        {/* Direct Spotify Playlist Link Loader (Loads All 75 Songs) */}
        <form
          onSubmit={handleAddPlaylistSubmit}
          className="bg-black/35 border border-white/10 rounded-2xl p-3.5 flex items-center gap-2"
        >
          <input
            id="spotify-playlist-url-input"
            type="text"
            placeholder="Or paste any Spotify playlist link..."
            value={playlistUrlInput}
            onChange={(e) => setPlaylistUrlInput(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none"
          />
          <button
            id="spotify-load-playlist-btn"
            type="submit"
            disabled={isLoading}
            style={{ color: themePalette.lightHex }}
            className="glass-button px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Load Playlist</span>
          </button>
        </form>
      </div>
    </div>
  );
};
