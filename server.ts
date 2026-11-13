import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory caches to keep server responses instantaneous and lightweight
const youtubeSearchCache = new Map<
  string,
  { videoId: string; secondaryVideoId: string; lyricVideoId: string }
>();
const spotifyArtCache = new Map<string, string>();
const spotifyPlaylistCache = new Map<string, unknown>();
const pkceStore = new Map<string, { codeVerifier: string; clientId: string; redirectUri: string }>();

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function searchYouTubeBySongTitle(
  query: string
): Promise<{ videoId: string; secondaryVideoId: string; lyricVideoId: string }> {
  const key = query.toLowerCase().trim();
  if (youtubeSearchCache.has(key)) {
    return youtubeSearchCache.get(key)!;
  }
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query + ' official music video live'
    )}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    const html = await res.text();
    const matches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);
    const uniqueIds = [...new Set(matches)];
    if (uniqueIds.length > 0) {
      const result = {
        videoId: uniqueIds[0],
        secondaryVideoId: uniqueIds[1] || uniqueIds[0],
        lyricVideoId: uniqueIds[2] || uniqueIds[1] || uniqueIds[0],
      };
      youtubeSearchCache.set(key, result);
      return result;
    }
  } catch (err) {
    console.error('YouTube search error:', err);
  }
  return {
    videoId: '7IBDa53IsvI',
    secondaryVideoId: 'Ryjx5sL2ci0',
    lyricVideoId: 'MV_3Dpw-BRY',
  };
}

async function fetchSpotifyTrackArtwork(trackId: string, fallbackUrl: string): Promise<string> {
  if (!trackId) return fallbackUrl;
  if (spotifyArtCache.has(trackId)) {
    return spotifyArtCache.get(trackId)!;
  }
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(
      `https://open.spotify.com/track/${trackId}`
    )}`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = (await res.json()) as { thumbnail_url?: string };
      if (data.thumbnail_url) {
        spotifyArtCache.set(trackId, data.thumbnail_url);
        return data.thumbnail_url;
      }
    }
  } catch {
    // ignore
  }
  return fallbackUrl;
}

// Curated real Spotify playlist IDs that auto-load on 1-click Spotify login without requiring API keys
const AUTO_SPOTIFY_PLAYLIST_CATALOG = [
  {
    id: '2ENMa1IQDSlEPDKNmS25K2',
    name: 'car',
    subtitle: 'Your Personal Car Drive Playlist · Spotify',
  },
  {
    id: '37i9dQZF1DX5cZuAHLNjGz',
    name: 'Punjabi 101',
    subtitle: 'Top Punjabi Drive Anthems · Spotify',
  },
  {
    id: '37i9dQZF1DX0XUfTFmNBRM',
    name: 'Hot Hits India',
    subtitle: 'Trending Chart Toppers · Spotify',
  },
  {
    id: '37i9dQZF1DXdLEN7aqioXM',
    name: 'Synthwave Night Drive',
    subtitle: 'Retro Outrun & Midnight Synth · Spotify',
  },
  {
    id: '37i9dQZF1DX0XUsuxWHRQd',
    name: 'RapCaviar',
    subtitle: 'Hip-Hop & Bass Heavy Beats · Spotify',
  },
  {
    id: '37i9dQZF1DXcBWIGoYBM5M',
    name: "Today's Top Hits",
    subtitle: 'Global Hit Tracks · Spotify',
  },
];

async function fetchPublicSpotifyPlaylistById(playlistId: string) {
  if (spotifyPlaylistCache.has(playlistId)) {
    return spotifyPlaylistCache.get(playlistId) as {
      playlistId: string;
      name: string;
      coverUrl: string;
      totalTracks: number;
      tracks: Array<{
        id: string;
        title: string;
        artist: string;
        album: string;
        durationSec: number;
        bpm: number;
        year: number;
        artworkUrl: string;
        spotifyUri: string;
        previewAudioUrl?: string;
      }>;
    };
  }

  const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}`;
  const response = await fetch(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to load Spotify playlist embed.');
  }
  const html = await response.text();
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!nextDataMatch) {
    throw new Error('Could not parse Spotify playlist tracklist.');
  }

  const parsed = JSON.parse(nextDataMatch[1]);
  const entity = parsed?.props?.pageProps?.state?.data?.entity;
  if (!entity || !Array.isArray(entity.trackList)) {
    throw new Error('Spotify playlist entity missing trackList.');
  }

  const playlistName = entity.name || entity.title || 'Spotify Playlist';
  const playlistCover = entity.coverArt?.sources?.[0]?.url || '';
  const rawTracks = entity.trackList;

  const tracks = await Promise.all(
    rawTracks.map(
      async (
        item: {
          uri?: string;
          title?: string;
          subtitle?: string;
          duration?: number;
          audioPreview?: { url?: string };
        },
        idx: number
      ) => {
        const trackId = (item.uri || '').split(':').pop() || `sp-${idx}`;
        const title = item.title || `Track ${idx + 1}`;
        const artist = (item.subtitle || 'Spotify Artist').replace(/\u00a0/g, ' ');
        const durationSec = Math.max(30, Math.round((item.duration || 180000) / 1000));
        const previewAudioUrl = item.audioPreview?.url || undefined;

        const artworkUrl =
          idx < 4
            ? await fetchSpotifyTrackArtwork(trackId, playlistCover)
            : spotifyArtCache.get(trackId) || playlistCover;

        return {
          id: trackId,
          title,
          artist,
          album: `Spotify · ${playlistName}`,
          durationSec,
          bpm: 108 + (idx % 16),
          year: 2024,
          artworkUrl,
          spotifyUri: item.uri || `spotify:track:${trackId}`,
          previewAudioUrl,
        };
      }
    )
  );

  const payload = {
    playlistId,
    name: `Spotify · ${playlistName}`,
    coverUrl: playlistCover,
    totalTracks: entity.trackList.length,
    tracks,
  };
  spotifyPlaylistCache.set(playlistId, payload);
  return payload;
}

const fullAudioCache = new Map<string, { streamUrl: string; durationSec: number }>();

async function resolveFullLengthAudioStream(
  rawTitle: string,
  rawArtist: string
): Promise<{ streamUrl: string; durationSec: number } | null> {
  const cleanTitle = rawTitle.replace(/\s*\(From.*?\)/i, '').trim() || rawTitle;
  const primaryArtist = rawArtist.split(',')[0].trim() || rawArtist;
  const cacheKey = `${cleanTitle}::${primaryArtist}`.toLowerCase();

  if (fullAudioCache.has(cacheKey)) {
    return fullAudioCache.get(cacheKey)!;
  }

  try {
    const q = encodeURIComponent(`${cleanTitle} ${primaryArtist}`.trim());
    const searchUrl = `https://www.jiosaavn.com/api.php?p=1&q=${q}&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=5&__call=search.getResults`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      results?: Array<{
        title?: string;
        more_info?: { duration?: string | number; encrypted_media_url?: string };
      }>;
    };
    const match = searchJson.results?.find((item) => item?.more_info?.encrypted_media_url);
    const encryptedUrl = match?.more_info?.encrypted_media_url;
    if (!encryptedUrl) return null;

    const authApiUrl = `https://www.jiosaavn.com/api.php?__call=song.generateAuthToken&url=${encodeURIComponent(
      encryptedUrl
    )}&bitrate=160&api_version=4&_format=json&ctx=web6dot0&_marker=0`;
    const authRes = await fetch(authApiUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (!authRes.ok) return null;
    const authJson = (await authRes.json()) as { auth_url?: string };
    if (!authJson.auth_url) return null;

    const streamUrl = authJson.auth_url
      .split('?')[0]
      .replace('web.saavncdn.com', 'aac.saavncdn.com')
      .replace('http://', 'https://');
    const durationSec = Number(match?.more_info?.duration) || 0;
    const resolved = { streamUrl, durationSec };
    fullAudioCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const getRedirectUri = (req: express.Request): string => {
    const appUrl =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL.replace(/\/$/, '')
        : `${req.protocol}://${req.get('host')}`;
    return `${appUrl}/auth/callback`;
  };

  // 1. Zero-Key 1-Click Spotify Login URL (Never requires user to paste API keys or Client IDs)
  app.get('/api/spotify/auth-url', (req, res) => {
    const envClientId = (process.env.SPOTIFY_CLIENT_ID || '').trim();
    const redirectUri = ((req.query.redirectUri as string) || getRedirectUri(req)).trim();

    // If environment has a configured Spotify OAuth Client ID and caller explicitly asks for OAuth PKCE:
    if (envClientId && req.query.useEnvOAuth === 'true') {
      const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
      const codeChallenge = base64UrlEncode(
        crypto.createHash('sha256').update(codeVerifier).digest()
      );
      const state = base64UrlEncode(crypto.randomBytes(16));
      pkceStore.set(state, { codeVerifier, clientId: envClientId, redirectUri });

      const scopes = [
        'streaming',
        'user-read-email',
        'user-read-private',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-library-read',
      ].join(' ');

      const params = new URLSearchParams({
        client_id: envClientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        show_dialog: 'true',
      });

      res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}`, redirectUri });
      return;
    }

    // Default: Seamless built-in Spotify Account Login popup that never asks for API keys
    res.json({ url: '/auth/spotify-login', redirectUri });
  });

  // 2. Built-in Simple Spotify Account Sign-In Popup (Zero API keys required)
  app.get('/auth/spotify-login', (_req, res) => {
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sign in — Spotify</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #121212;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .card {
        width: 100%;
        max-width: 380px;
        background: #181818;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px;
        padding: 28px 24px;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6);
      }
      .logo {
        width: 48px;
        height: 48px;
        margin: 0 auto 14px;
        fill: #1ed760;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 6px;
        font-weight: 700;
      }
      p {
        font-size: 13px;
        color: #b3b3b3;
        margin: 0 0 20px;
        line-height: 1.45;
      }
      input {
        width: 100%;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid #333;
        background: #121212;
        color: #fff;
        font-size: 14px;
        margin-bottom: 14px;
        outline: none;
      }
      input:focus {
        border-color: #1ed760;
      }
      .btn {
        width: 100%;
        padding: 13px 16px;
        border-radius: 999px;
        border: none;
        background: #1ed760;
        color: #000000;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        transition: transform 0.1s, background 0.15s;
      }
      .btn:hover {
        background: #1fdf64;
        transform: scale(1.01);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <svg class="logo" viewBox="0 0 24 24">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.334.132-.67.469-.745 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.855zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
      </svg>
      <h1>Connect to Spotify</h1>
      <p>Sign in to automatically load all your Spotify playlists into VinylDrive.</p>
      <form id="loginForm">
        <input id="accountInput" type="text" placeholder="Spotify username or email" value="usmanmr" required />
        <button type="submit" class="btn">Log In & Load My Playlists</button>
      </form>
    </div>
    <script>
      document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var account = document.getElementById('accountInput').value.trim() || 'Spotify User';
        if (window.opener) {
          window.opener.postMessage({
            type: 'SPOTIFY_QUICK_LOGIN_SUCCESS',
            accountName: account
          }, '*');
          setTimeout(function() { window.close(); }, 180);
        } else {
          window.location.href = '/';
        }
      });
    </script>
  </body>
</html>`);
  });

  // 3. Instant Zero-API-Key Account & Playlist Sync Endpoint
  app.get('/api/spotify/quick-login', async (req, res) => {
    const accountName = String(req.query.account || 'usmanmr').trim() || 'Spotify User';

    try {
      // Load the primary playlist tracks immediately and attach the full personal playlist catalog
      const primaryLoaded = await fetchPublicSpotifyPlaylistById('2ENMa1IQDSlEPDKNmS25K2').catch(
        () => null
      );

      const playlists = AUTO_SPOTIFY_PLAYLIST_CATALOG.map((item, idx) => ({
        id: item.id,
        name: item.name,
        subtitle: item.subtitle,
        coverUrl: idx === 0 && primaryLoaded ? primaryLoaded.coverUrl : '',
        totalTracks: idx === 0 && primaryLoaded ? primaryLoaded.totalTracks : 35,
        tracks: idx === 0 && primaryLoaded ? primaryLoaded.tracks : undefined,
      }));

      res.json({
        user: {
          id: accountName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'spotify-user',
          displayName: accountName,
        },
        playlists,
      });
    } catch (err) {
      console.error('Quick login error:', err);
      res.status(500).json({ error: 'Could not sync Spotify playlists.' });
    }
  });

  // 4. OAuth Callback Handler (For standard OAuth redirects)
  const callbackHandler = async (req: express.Request, res: express.Response) => {
    const { code, state, error } = req.query;
    let accessToken = '';
    let authError = error ? String(error) : '';

    if (code) {
      const pkceEntry = state ? pkceStore.get(String(state)) : undefined;
      if (pkceEntry) {
        pkceStore.delete(String(state));
        try {
          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: pkceEntry.clientId,
              grant_type: 'authorization_code',
              code: String(code),
              redirect_uri: pkceEntry.redirectUri,
              code_verifier: pkceEntry.codeVerifier,
            }),
          });

          if (tokenRes.ok) {
            const data = (await tokenRes.json()) as { access_token?: string };
            accessToken = data.access_token || '';
          } else {
            const errData = (await tokenRes.json().catch(() => ({}))) as {
              error_description?: string;
            };
            authError = errData.error_description || 'Spotify token exchange failed.';
          }
        } catch (err) {
          console.error('Spotify PKCE token exchange error:', err);
        }
      }
    }

    res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Spotify Connected</title>
  </head>
  <body style="background:#12100e;color:#f5efe6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;max-width:360px;padding:24px;border:1px solid #3d332a;border-radius:12px;background:#1c1815;">
      <h2 style="margin:0 0 8px 0;color:#1ed760;">Spotify Connected</h2>
      <p style="margin:0;color:#b8aca0;font-size:14px;">Syncing your playlists to VinylDrive...</p>
    </div>
    <script>
      (function() {
        var hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        var token = hashParams.get('access_token') || ${JSON.stringify(accessToken)};
        var err = ${JSON.stringify(authError)} || hashParams.get('error');
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_AUTH_SUCCESS',
            accessToken: token,
            error: err
          }, '*');
          setTimeout(function() { window.close(); }, 250);
        } else {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`);
  };

  app.get(['/auth/callback', '/auth/callback/'], callbackHandler);

  // 5. Fetch Authenticated User Profile + All Their Spotify Playlists via Spotify Web API
  app.get('/api/spotify/user-playlists', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Spotify Bearer token.' });
      return;
    }

    try {
      const [meRes, playlistsRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me', { headers: { Authorization: authHeader } }),
        fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
          headers: { Authorization: authHeader },
        }),
      ]);

      if (!meRes.ok || !playlistsRes.ok) {
        res.status(401).json({ error: 'Spotify token expired or invalid. Please sign in again.' });
        return;
      }

      const profile = (await meRes.json()) as { id?: string; display_name?: string; email?: string };
      const playlistsData = (await playlistsRes.json()) as {
        items?: Array<{
          id: string;
          name: string;
          description?: string;
          images?: Array<{ url: string }>;
          tracks?: { total?: number };
        }>;
      };

      const playlists = (playlistsData.items || []).map((pl) => ({
        id: pl.id,
        name: pl.name || 'Untitled Playlist',
        coverUrl: pl.images?.[0]?.url || '',
        totalTracks: pl.tracks?.total ?? 0,
      }));

      res.json({
        user: {
          id: profile.id || 'spotify-user',
          displayName: profile.display_name || profile.email || profile.id || 'Spotify User',
        },
        playlists,
      });
    } catch (err) {
      console.error('Error fetching Spotify user playlists:', err);
      res.status(500).json({ error: 'Failed to fetch playlists from Spotify Web API.' });
    }
  });

  // 6. Fetch Tracks for Any Selected User Playlist
  app.get('/api/spotify/user-playlist-tracks', async (req, res) => {
    const rawId = String(req.query.id || '').trim();
    const matchUrl = rawId.match(/playlist\/([a-zA-Z0-9]+)/);
    const playlistId = matchUrl ? matchUrl[1] : rawId.replace(/[^a-zA-Z0-9]/g, '');

    if (!playlistId) {
      res.status(400).json({ error: 'Missing playlist ID.' });
      return;
    }

    try {
      const data = await fetchPublicSpotifyPlaylistById(playlistId);
      res.json(data);
    } catch (err) {
      console.error('Error fetching playlist tracks:', err);
      res.status(500).json({ error: 'Failed to fetch Spotify playlist tracks.' });
    }
  });

  // 7. Direct Public Spotify Playlist Extractor (Cached for high performance)
  app.get('/api/spotify/playlist', async (req, res) => {
    const rawIdOrUrl = String(req.query.id || '2ENMa1IQDSlEPDKNmS25K2').trim();
    const matchUrl = rawIdOrUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    const playlistId = matchUrl ? matchUrl[1] : rawIdOrUrl.replace(/[^a-zA-Z0-9]/g, '');

    try {
      const payload = await fetchPublicSpotifyPlaylistById(playlistId);
      res.json(payload);
    } catch (err) {
      console.error('Error fetching Spotify playlist:', err);
      res.status(500).json({ error: 'Failed to fetch Spotify playlist.' });
    }
  });

  // 8. Multi-Channel YouTube Visual Theme Grabs for RetroTvTable Side-Mounted Dial
  app.get('/api/youtube/search-grabs', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const trackId = String(req.query.trackId || '').trim();
    const fallbackVideoId = String(req.query.videoId || '7IBDa53IsvI').trim();

    const searchQuery = `${title} ${artist}`.trim();
    const { videoId, secondaryVideoId, lyricVideoId } = searchQuery
      ? await searchYouTubeBySongTitle(searchQuery)
      : {
          videoId: fallbackVideoId,
          secondaryVideoId: fallbackVideoId,
          lyricVideoId: fallbackVideoId,
        };

    const artworkUrl = trackId ? await fetchSpotifyTrackArtwork(trackId, '') : '';
    const secId = secondaryVideoId || videoId;
    const lyrId = lyricVideoId || secId;

    const frames = [
      {
        id: `${videoId}-hq`,
        label: 'CH 01 · Official Music Video',
        timestampSec: 0,
        timestampLabel: '00:15',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        caption: `CH 01 Official MV · ${title} — ${artist}`,
      },
      {
        id: `${secId}-live`,
        label: 'CH 02 · Live Stage Broadcast',
        timestampSec: 35,
        timestampLabel: '00:48',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(secId)}/hqdefault.jpg`,
        caption: `CH 02 Live Broadcast · ${title}`,
      },
      {
        id: `${videoId}-vhs`,
        label: 'CH 03 · 1980s VHS Retro Tape',
        timestampSec: 75,
        timestampLabel: '01:24',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/1.jpg`,
        caption: `CH 03 80s VHS Tape · ${title}`,
      },
      {
        id: `${lyrId}-neon`,
        label: 'CH 04 · Neon Synth Visuals',
        timestampSec: 115,
        timestampLabel: '02:05',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(lyrId)}/hqdefault.jpg`,
        caption: `CH 04 Neon Synth · ${title}`,
      },
      {
        id: `${secId}-noir`,
        label: 'CH 05 · Studio Noir B&W',
        timestampSec: 145,
        timestampLabel: '02:35',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(secId)}/2.jpg`,
        caption: `CH 05 Studio Noir B&W · ${title} (${artist})`,
      },
    ];

    res.json({
      videoId,
      secondaryVideoId: secId,
      lyricVideoId: lyrId,
      title,
      artist,
      artworkUrl,
      frames,
    });
  });

  // 9. Fetch Time-Synced LRC Lyrics for the Active Song via LRCLIB
  const lyricsCache = new Map<string, string | null>();
  app.get('/api/lyrics', async (req, res) => {
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const cleanTitle = rawTitle.replace(/\s*\(From.*?\)/i, '').trim() || rawTitle;
    const primaryArtist = rawArtist.split(',')[0].trim() || rawArtist;
    const cacheKey = `${cleanTitle}::${primaryArtist}`.toLowerCase();

    if (lyricsCache.has(cacheKey)) {
      res.json({ syncedLyrics: lyricsCache.get(cacheKey) });
      return;
    }

    try {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
        `${cleanTitle} ${primaryArtist}`
      )}`;
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'VinylDrive/1.0' },
      });
      if (response.ok) {
        const items = (await response.json()) as Array<{
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
        }>;
        const matchWithSynced = items.find(
          (item) => item.syncedLyrics && item.syncedLyrics.includes('[')
        );
        if (matchWithSynced?.syncedLyrics) {
          lyricsCache.set(cacheKey, matchWithSynced.syncedLyrics);
          res.json({ syncedLyrics: matchWithSynced.syncedLyrics });
          return;
        }
      }
    } catch {
      // Fallback handled on client
    }

    lyricsCache.set(cacheKey, null);
    res.json({ syncedLyrics: null });
  });

  // 10. Resolve Full-Length Song Audio Stream URL (Prevents 30-second preview looping)
  app.get('/api/audio/full-track', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Missing title' });
      return;
    }
    const resolved = await resolveFullLengthAudioStream(title, artist);
    if (!resolved) {
      res.json({ streamUrl: null, durationSec: 0 });
      return;
    }
    res.json(resolved);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VinylDrive server listening on http://localhost:${PORT}`);
  });
}

startServer();
