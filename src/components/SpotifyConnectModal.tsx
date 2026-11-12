import React, { useState } from 'react';
import { X, Disc3, ExternalLink, PlusCircle, CheckCircle2, AlertCircle, Music } from 'lucide-react';
import type { PlaylistPack } from '../utils/playerLogic';

interface SpotifyConnectModalProps {
  isOpen: boolean;
  isConnected: boolean;
  spotifyUserLabel: string;
  playlists: PlaylistPack[];
  activePlaylistId: string;
  onClose: () => void;
  onStartOAuthPopup: (customClientId: string) => Promise<void>;
  onConnectWithAccessToken: (token: string) => Promise<void>;
  onSelectPlaylist: (playlistId: string) => void;
  onLoadPlaylistByIdOrUrl: (idOrUrl: string) => Promise<void>;
}

export const SpotifyConnectModal: React.FC<SpotifyConnectModalProps> = ({
  isOpen,
  isConnected,
  spotifyUserLabel,
  playlists,
  activePlaylistId,
  onClose,
  onStartOAuthPopup,
  onConnectWithAccessToken,
  onSelectPlaylist,
  onLoadPlaylistByIdOrUrl,
}) => {
  const [clientId, setClientId] = useState('');
  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [playlistUrlInput, setPlaylistUrlInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const callbackUrl = `${window.location.origin}/auth/callback`;

  const handleOAuthClick = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onStartOAuthPopup(clientId.trim());
      setStatusMessage('Opened Spotify Login popup. Sign in to load all your Spotify playlists.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not initiate Spotify OAuth.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessTokenInput.trim()) {
      setErrorMessage('Please paste a valid Spotify Web API Bearer token.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onConnectWithAccessToken(accessTokenInput.trim());
      setStatusMessage('Logged into your Spotify account and synced all your playlists!');
      setAccessTokenInput('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to fetch Spotify playlists with token.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrlInput.trim()) {
      setErrorMessage('Enter a Spotify Playlist URL or Playlist ID.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLoading(true);
    try {
      await onLoadPlaylistByIdOrUrl(playlistUrlInput.trim());
      setStatusMessage('Loaded Spotify playlist onto the turntable!');
      setPlaylistUrlInput('');
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
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="glass-panel rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-[#f5efe6]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Disc3 className="w-6 h-6 text-amber-400" />
            <div>
              <h2 id="spotify-modal-title" className="font-display text-lg font-bold text-white">
                Spotify Account Login & Playlist Selector
              </h2>
              <p className="text-xs text-white/60">
                Sign in with your Spotify account to load all your personal playlists, or select any playlist below.
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

        {isConnected && (
          <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-3 flex items-center justify-between gap-2.5 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Logged in to Spotify: <strong>{spotifyUserLabel}</strong></span>
            </div>
            <span className="text-[11px] text-emerald-300/80">{playlists.length} Playlists Available</span>
          </div>
        )}

        {statusMessage && (
          <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-amber-200">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-950/60 border border-red-500/50 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* User's Available Spotify Playlists Picker */}
        <div className="bg-black/35 border border-white/10 rounded-2xl p-4 space-y-2.5">
          <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
            <Music className="w-4 h-4 text-amber-400" />
            <span>Select Active Spotify Playlist ({playlists.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
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
                  className={`px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left transition-all ${
                    isSelected
                      ? 'bg-amber-500/25 border border-amber-400/60 text-white'
                      : 'glass-button text-white/80 hover:text-white'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{pl.name}</p>
                    <p className="text-[10px] text-white/50 truncate">{pl.subtitle || `${pl.tracks.length} tracks`}</p>
                  </div>
                  <span className="text-[11px] font-mono text-amber-300 shrink-0">
                    {pl.tracks.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: Login to Spotify Account via OAuth 2.0 PKCE or Token */}
          <div className="bg-black/35 border border-white/10 rounded-2xl p-4 space-y-3">
            <h3 className="font-display text-sm font-semibold text-white">
              01. Login with Your Spotify Account (OAuth 2.0 PKCE)
            </h3>
            <p className="text-xs text-white/60">
              Sign in with any Spotify account to fetch all your personal & collaborative playlists. Redirect URI:
            </p>
            <div className="p-2 rounded-xl bg-black/50 border border-white/10 font-mono text-[11px] text-amber-300 break-all select-all">
              {callbackUrl}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="spotify-client-id" className="block text-xs text-white/75">
                Spotify App Client ID (Optional if configured in .env)
              </label>
              <input
                id="spotify-client-id"
                type="text"
                placeholder="Paste Spotify Client ID..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="button"
              onClick={handleOAuthClick}
              disabled={isLoading}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#12100e] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Login with Spotify Popup</span>
            </button>

            <form onSubmit={handleTokenSubmit} className="pt-2 border-t border-white/10 space-y-2">
              <label htmlFor="spotify-bearer-token" className="block text-xs text-white/75">
                Or Paste Your Spotify Web API Access Token
              </label>
              <div className="flex gap-2">
                <input
                  id="spotify-bearer-token"
                  type="password"
                  placeholder="BQD..."
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  className="glass-button min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium text-amber-300 whitespace-nowrap"
                >
                  Sync Account
                </button>
              </div>
            </form>
          </div>

          {/* Option 2: Load Any Spotify Playlist by URL or ID */}
          <form
            onSubmit={handleAddPlaylistSubmit}
            className="bg-black/35 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-3"
          >
            <div className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-white">
                02. Load Any Spotify Playlist by Link or ID
              </h3>
              <p className="text-xs text-white/60">
                Paste any Spotify playlist link or ID from any user account to load its tracks, album covers, and YouTube TV screen grabs.
              </p>
              <div className="space-y-1.5 pt-1">
                <label htmlFor="spotify-playlist-url-input" className="block text-xs text-white/75">
                  Spotify Playlist URL or ID
                </label>
                <input
                  id="spotify-playlist-url-input"
                  type="text"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={playlistUrlInput}
                  onChange={(e) => setPlaylistUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="glass-button w-full min-h-[40px] px-4 py-2 rounded-xl text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Load Spotify Playlist</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
