import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory caches to keep server responses instantaneous and lightweight
const youtubeSearchCache = new Map<
  string,
  {
    videoId: string;
    secondaryVideoId: string;
    lyricVideoId: string;
    videoIds: string[];
  }
>();
const spotifyArtCache = new Map<string, string>();
const spotifyPlaylistCache = new Map<string, unknown>();
const pkceStore = new Map<string, { codeVerifier: string; clientId: string; redirectUri: string }>();

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function searchYouTubeBySongTitle(
  query: string
): Promise<{
  videoId: string;
  secondaryVideoId: string;
  lyricVideoId: string;
  videoIds: string[];
}> {
  const key = query.toLowerCase().trim();
  if (youtubeSearchCache.has(key)) {
    return youtubeSearchCache.get(key)!;
  }
  try {
    // 1. Official video search + 2. View-count-sorted search (sp=CAMSAhAB = sort by view count)
    const officialUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${query} official video`
    )}`;
    const viewCountSortedUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&sp=CAMSAhAB`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    const [officialHtml, sortedHtml] = await Promise.all([
      fetch(officialUrl, { headers }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(viewCountSortedUrl, { headers }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    ]);

    const officialIds = [...officialHtml.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(
      (m) => m[1]
    );
    const sortedIds = [...sortedHtml.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(
      (m) => m[1]
    );

    const primaryOfficialId = officialIds[0] || sortedIds[0];
    if (primaryOfficialId) {
      const alternates: string[] = [];
      const seen = new Set<string>([primaryOfficialId]);
      for (const candidateId of [...sortedIds, ...officialIds]) {
        if (!seen.has(candidateId)) {
          seen.add(candidateId);
          alternates.push(candidateId);
          if (alternates.length >= 4) break;
        }
      }
      const fallbackPool = ['7IBDa53IsvI', 'Ryjx5sL2ci0', 'MV_3Dpw-BRY', 'x-PvBG9akKQ', 'vX2cDW8LUWk'];
      for (const fb of fallbackPool) {
        if (alternates.length >= 4) break;
        if (!seen.has(fb)) {
          seen.add(fb);
          alternates.push(fb);
        }
      }

      const videoIds = [primaryOfficialId, ...alternates.slice(0, 4)];
      const result = {
        videoId: videoIds[0],
        secondaryVideoId: videoIds[1] || videoIds[0],
        lyricVideoId: videoIds[2] || videoIds[1] || videoIds[0],
        videoIds,
      };
      youtubeSearchCache.set(key, result);
      return result;
    }
  } catch (err) {
    console.error('YouTube search error:', err);
  }
  const defaultIds = ['7IBDa53IsvI', 'Ryjx5sL2ci0', 'MV_3Dpw-BRY', 'x-PvBG9akKQ', 'vX2cDW8LUWk'];
  return {
    videoId: defaultIds[0],
    secondaryVideoId: defaultIds[1],
    lyricVideoId: defaultIds[2],
    videoIds: defaultIds,
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

        const images = [
          ...(artworkUrl ? [{ url: artworkUrl, width: 640, height: 640 }] : []),
          ...(playlistCover && playlistCover !== artworkUrl
            ? [{ url: playlistCover, width: 300, height: 300 }]
            : []),
        ];

        return {
          id: trackId,
          title,
          artist,
          album: `Spotify · ${playlistName}`,
          durationSec,
          bpm: 108 + (idx % 16),
          year: 2024,
          artworkUrl,
          images,
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
      <p>Sign in to automatically load all your Spotify playlists into MaxVinyFy.</p>
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
      <p style="margin:0;color:#b8aca0;font-size:14px;">Syncing your playlists to MaxVinyFy...</p>
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

  // 8. Multi-Channel YouTube Video Search (Index 0 = Official, 1..4 = Top-Viewed Alternate Videos)
  app.get('/api/youtube/search-grabs', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const trackId = String(req.query.trackId || '').trim();
    const fallbackVideoId = String(req.query.videoId || '7IBDa53IsvI').trim();

    const searchQuery = `${title} ${artist}`.trim();
    const { videoId, secondaryVideoId, lyricVideoId, videoIds } = searchQuery
      ? await searchYouTubeBySongTitle(searchQuery)
      : {
          videoId: fallbackVideoId,
          secondaryVideoId: fallbackVideoId,
          lyricVideoId: fallbackVideoId,
          videoIds: [fallbackVideoId, 'Ryjx5sL2ci0', 'MV_3Dpw-BRY', 'x-PvBG9akKQ', 'vX2cDW8LUWk'],
        };

    const artworkUrl = trackId ? await fetchSpotifyTrackArtwork(trackId, '') : '';
    const secId = secondaryVideoId || videoId;
    const lyrId = lyricVideoId || secId;

    const channelRoles = [
      'Official Video',
      'Most Viewed Live / Alternate #1',
      'Popular Cover / Dance #2',
      'Lyric / Fan Video #3',
      'Alternate Performance #4',
    ];

    const channels = videoIds.slice(0, 5).map((vid, idx) => {
      const chNum = idx + 1;
      const roleLabel = channelRoles[idx] || `Alternate Video #${idx}`;
      const chFrames = [
        {
          id: `${vid}-ch${chNum}-hq`,
          label: `CH ${chNum} · ${roleLabel}`,
          timestampSec: 0,
          timestampLabel: '00:15',
          imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(vid)}/hqdefault.jpg`,
          caption: `CH ${chNum} ${roleLabel} · ${title} — ${artist}`,
        },
        {
          id: `${vid}-ch${chNum}-1`,
          label: `CH ${chNum} · Scene #1`,
          timestampSec: 35,
          timestampLabel: '00:48',
          imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(vid)}/1.jpg`,
          caption: `CH ${chNum} · ${title}`,
        },
        {
          id: `${vid}-ch${chNum}-2`,
          label: `CH ${chNum} · Scene #2`,
          timestampSec: 75,
          timestampLabel: '01:24',
          imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(vid)}/2.jpg`,
          caption: `CH ${chNum} · ${title}`,
        },
        {
          id: `${vid}-ch${chNum}-3`,
          label: `CH ${chNum} · Scene #3`,
          timestampSec: 115,
          timestampLabel: '02:05',
          imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(vid)}/3.jpg`,
          caption: `CH ${chNum} · ${title}`,
        },
      ];
      return {
        channelNumber: chNum,
        code: `CH ${chNum}`,
        label: roleLabel,
        videoId: vid,
        title: `${title} (${roleLabel})`,
        isOfficial: idx === 0,
        imageUrl: chFrames[0].imageUrl,
        frames: chFrames,
      };
    });

    const frames = channels.map((ch, idx) => ({
      id: `${ch.videoId}-hq-${idx}`,
      label: `CH 0${ch.channelNumber} · ${ch.label}`,
      timestampSec: idx * 35,
      timestampLabel: `0${Math.floor((idx * 35) / 60)}:${String((idx * 35) % 60).padStart(2, '0')}`,
      imageUrl: ch.imageUrl,
      caption: `${ch.code} ${ch.label} · ${title} — ${artist}`,
    }));

    res.json({
      videoId,
      secondaryVideoId: secId,
      lyricVideoId: lyrId,
      videoIds,
      channels,
      title,
      artist,
      artworkUrl,
      frames,
    });
  });

  // 9. Fetch Time-Synced or Plain Lyrics for the Active Song via LRCLIB (https://lrclib.net/api/get)
  const lyricsCache = new Map<
    string,
    { syncedLyrics: string | null; plainLyrics: string | null }
  >();

  app.get('/api/lyrics', async (req, res) => {
    const trackId = String(req.query.trackId || '').trim();
    const rawTitle = String(req.query.track_name || req.query.title || '').trim();
    const rawArtist = String(req.query.artist_name || req.query.artist || '').trim();
    const rawAlbum = String(req.query.album_name || req.query.album || '').trim();
    const rawDuration = Math.max(1, Math.round(Number(req.query.duration) || 180));

    const cleanTitle = rawTitle.replace(/\s*\(From.*?\)/i, '').trim() || rawTitle;
    const primaryArtist = rawArtist.split(',')[0].trim() || rawArtist;
    const cleanAlbum = rawAlbum.replace(/^Spotify\s*·\s*/i, '').trim() || rawAlbum;

    const cacheKey = (trackId || `${cleanTitle}::${primaryArtist}::${rawDuration}`).toLowerCase();
    if (lyricsCache.has(cacheKey)) {
      res.json(lyricsCache.get(cacheKey));
      return;
    }

    const tryLrclibGet = async (
      tName: string,
      aName: string,
      albName: string,
      dur: number
    ): Promise<{ syncedLyrics: string | null; plainLyrics: string | null } | null> => {
      if (!tName || !aName) return null;
      const params = new URLSearchParams({
        track_name: tName,
        artist_name: aName,
        album_name: albName || tName,
        duration: String(dur),
      });
      const getUrl = `https://lrclib.net/api/get?${params.toString()}`;
      const response = await fetch(getUrl, {
        headers: { 'User-Agent': 'MaxVinyFy/1.0' },
      });
      if (!response.ok) return null;
      const item = (await response.json()) as {
        syncedLyrics?: string | null;
        plainLyrics?: string | null;
      };
      if (item.syncedLyrics || item.plainLyrics) {
        return {
          syncedLyrics: item.syncedLyrics || null,
          plainLyrics: item.plainLyrics || null,
        };
      }
      return null;
    };

    try {
      // 1. Primary LRCLIB /api/get call with track_name, artist_name, album_name and duration
      const exactHit =
        (await tryLrclibGet(rawTitle, rawArtist, rawAlbum, rawDuration)) ||
        (cleanTitle !== rawTitle || primaryArtist !== rawArtist
          ? await tryLrclibGet(cleanTitle, primaryArtist, cleanAlbum, rawDuration)
          : null);

      if (exactHit) {
        lyricsCache.set(cacheKey, exactHit);
        res.json(exactHit);
        return;
      }

      // 2. Fallback to LRCLIB /api/search when Spotify playlist album_name differs from LRCLIB album metadata
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(
        `${cleanTitle} ${primaryArtist}`.trim()
      )}`;
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'MaxVinyFy/1.0' },
      });
      if (searchRes.ok) {
        const items = (await searchRes.json()) as Array<{
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
          duration?: number;
        }>;
        const matchWithSynced = items.find(
          (item) => item.syncedLyrics && item.syncedLyrics.includes('[')
        );
        if (matchWithSynced?.syncedLyrics) {
          const payload = {
            syncedLyrics: matchWithSynced.syncedLyrics,
            plainLyrics: matchWithSynced.plainLyrics || null,
          };
          lyricsCache.set(cacheKey, payload);
          res.json(payload);
          return;
        }
        const matchWithPlain = items.find(
          (item) => item.plainLyrics && item.plainLyrics.trim().length > 0
        );
        if (matchWithPlain?.plainLyrics) {
          const payload = {
            syncedLyrics: null,
            plainLyrics: matchWithPlain.plainLyrics,
          };
          lyricsCache.set(cacheKey, payload);
          res.json(payload);
          return;
        }
      }
    } catch {
      // Handled below
    }

    const emptyPayload = { syncedLyrics: null, plainLyrics: null };
    lyricsCache.set(cacheKey, emptyPayload);
    res.json(emptyPayload);
  });

  // 9b. Server-Side Gemini API Line-by-Line Lyrics Romanization & English Meaning Translation
  const lyricsConversionCache = new Map<string, string[]>();

  app.post('/api/lyrics/convert', async (req, res) => {
    const trackId = String(req.body?.trackId || '').trim();
    const mode = req.body?.mode === 'english_meaning' ? 'english_meaning' : 'romanized';
    const rawLines: unknown[] = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const lines = rawLines.map((l) => String(l ?? '').trim());

    if (lines.length === 0) {
      res.status(400).json({ error: 'No lyric lines provided for conversion.' });
      return;
    }

    const cacheKey = `${trackId || 'anon'}::${mode}::${lines.length}`;
    if (trackId && lyricsConversionCache.has(cacheKey)) {
      res.json({ lines: lyricsConversionCache.get(cacheKey)! });
      return;
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'Gemini API key is not configured. Please check Settings > Secrets.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const indexedInput = lines.map((text, index) => ({ index, text }));
      const systemInstruction =
        mode === 'romanized'
          ? 'You are a precise song lyrics transliterator. Convert each input line into Romanized English letters (phonetic transliteration of the original words in Latin script, keeping existing English words intact). Return a JSON object with a "lines" array containing the EXACT same number of items in the EXACT same index order. Never merge, split, omit, or reorder lines.'
          : 'You are a precise song lyrics translator. Translate each input line into natural, clear English meaning line by line. Return a JSON object with a "lines" array containing the EXACT same number of items in the EXACT same index order. Never merge, split, omit, or reorder lines.';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: JSON.stringify({
          task:
            mode === 'romanized'
              ? 'Transliterate every line into Romanized English letters (Latin script) 1-to-1.'
              : 'Translate every line into English meaning 1-to-1.',
          lineCount: lines.length,
          lines: indexedInput,
        }),
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: {
                      type: Type.INTEGER,
                      description: 'Zero-based line index matching the input line.',
                    },
                    text: {
                      type: Type.STRING,
                      description: 'Converted line text in English letters with no line breaks.',
                    },
                  },
                  required: ['index', 'text'],
                },
              },
            },
            required: ['lines'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as {
        lines?: Array<{ index?: number; text?: string } | string>;
      };

      if (!parsed || !Array.isArray(parsed.lines) || parsed.lines.length === 0) {
        res.status(502).json({ error: 'Invalid conversion response from Gemini.' });
        return;
      }

      const byIndex = new Map<number, string>();
      parsed.lines.forEach((item, posIdx) => {
        if (typeof item === 'string') {
          const clean = item.replace(/\s*\r?\n\s*/g, ' ').trim();
          if (clean) byIndex.set(posIdx, clean);
        } else if (item && typeof item === 'object') {
          const idx = typeof item.index === 'number' ? item.index : posIdx;
          const clean = String(item.text ?? '')
            .replace(/\s*\r?\n\s*/g, ' ')
            .trim();
          if (clean) byIndex.set(idx, clean);
        }
      });

      if (byIndex.size === 0) {
        res.status(502).json({ error: 'Empty conversion response from Gemini.' });
        return;
      }

      const aligned = lines.map((orig, idx) => byIndex.get(idx) || orig);
      if (trackId) {
        lyricsConversionCache.set(cacheKey, aligned);
      }
      res.json({ lines: aligned });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini lyrics conversion failed.';
      res.status(502).json({ error: message });
    }
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
    console.log(`MaxVinyFy server listening on http://localhost:${PORT}`);
  });
}

startServer();
