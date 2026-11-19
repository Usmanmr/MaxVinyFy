import express from 'express';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
  const key = `v2:${query.toLowerCase().trim()}`;
  if (youtubeSearchCache.has(key)) {
    return youtubeSearchCache.get(key)!;
  }
  try {
    // 1. Official video + 2. View-count-sorted + 3. Live/Cover + 4. Lyrics/Dance/Acoustic
    const officialUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${query} official video`
    )}`;
    const viewCountSortedUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&sp=CAMSAhAB`;
    const liveCoverUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${query} live OR cover`
    )}`;
    const lyricDanceUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${query} lyrics OR acoustic OR dance video`
    )}`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    const [officialHtml, sortedHtml, liveCoverHtml, lyricDanceHtml] = await Promise.all([
      fetch(officialUrl, { headers }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(viewCountSortedUrl, { headers }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(liveCoverUrl, { headers }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(lyricDanceUrl, { headers }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    ]);

    const extractIds = (html: string) =>
      [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]);

    const officialIds = extractIds(officialHtml);
    const sortedIds = extractIds(sortedHtml);
    const liveCoverIds = extractIds(liveCoverHtml);
    const lyricDanceIds = extractIds(lyricDanceHtml);

    const primaryOfficialId = officialIds[0] || sortedIds[0] || liveCoverIds[0] || lyricDanceIds[0];
    if (primaryOfficialId) {
      const alternates: string[] = [];
      const seen = new Set<string>([primaryOfficialId]);
      const orderedCandidates = [
        ...sortedIds.slice(0, 6),
        ...officialIds.slice(0, 6),
        ...liveCoverIds.slice(0, 6),
        ...lyricDanceIds.slice(0, 6),
        ...sortedIds.slice(6),
        ...officialIds.slice(6),
      ];
      for (const candidateId of orderedCandidates) {
        if (!seen.has(candidateId)) {
          seen.add(candidateId);
          alternates.push(candidateId);
          if (alternates.length >= 7) break;
        }
      }
      const videoIds = [primaryOfficialId, ...alternates.slice(0, 7)];
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
  return {
    videoId: '',
    secondaryVideoId: '',
    lyricVideoId: '',
    videoIds: [],
  };
}

async function fetchSpotifyTrackArtwork(
  trackId: string,
  title = '',
  artist = ''
): Promise<string> {
  const cacheKey = trackId || `${title}::${artist}`.toLowerCase().trim();
  if (!cacheKey) return '';
  if (spotifyArtCache.has(cacheKey)) {
    return spotifyArtCache.get(cacheKey)!;
  }

  // 1. Primary: Spotify oEmbed track thumbnail (with 2-attempt retry)
  if (trackId && !trackId.startsWith('sp-')) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(
          `https://open.spotify.com/track/${trackId}`
        )}`;
        const res = await fetch(oembedUrl);
        if (res.ok) {
          const data = (await res.json()) as { thumbnail_url?: string };
          if (data.thumbnail_url) {
            spotifyArtCache.set(cacheKey, data.thumbnail_url);
            return data.thumbnail_url;
          }
        }
      } catch {
        // retry or fall through
      }
    }
  }

  // 2. Fallback: iTunes Song Search API for the specific track title + artist (never parent playlist cover)
  const searchQuery = `${title} ${artist}`.trim();
  if (searchQuery) {
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
        searchQuery
      )}&entity=song&limit=1`;
      const res = await fetch(itunesUrl);
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ artworkUrl100?: string }>;
        };
        const rawArt = data.results?.[0]?.artworkUrl100;
        if (rawArt) {
          const hiResArt = rawArt.replace('100x100bb', '600x600bb');
          spotifyArtCache.set(cacheKey, hiResArt);
          return hiResArt;
        }
      }
    } catch {
      // ignore
    }
  }

  return '';
}

// Note: No hardcoded personal playlists or tracks exist on the server.
// All user playlists & libraries come dynamically from the signed-in user's Spotify Web API token.

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
  const usedTrackIds = new Map<string, number>();

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
        const baseTrackId = (item.uri || '').split(':').pop() || `sp-${idx}`;
        const seenCount = usedTrackIds.get(baseTrackId) ?? 0;
        usedTrackIds.set(baseTrackId, seenCount + 1);
        const trackId = seenCount === 0 ? baseTrackId : `${baseTrackId}__${seenCount + 1}`;
        const title = item.title || `Track ${idx + 1}`;
        const artist = (item.subtitle || 'Spotify Artist').replace(/\u00a0/g, ' ');
        const durationSec = Math.max(30, Math.round((item.duration || 180000) / 1000));
        const previewAudioUrl = item.audioPreview?.url || undefined;

        // Fetch individual per-track artwork for EVERY track in the playlist (never fall back to playlistCover)
        const artworkUrl = await fetchSpotifyTrackArtwork(baseTrackId, title, artist);

        const images = artworkUrl ? [{ url: artworkUrl, width: 640, height: 640 }] : [];

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
          spotifyUri: item.uri || `spotify:track:${baseTrackId}`,
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
  rawArtist: string,
  trackId = ''
): Promise<{ streamUrl: string; durationSec: number } | null> {
  const cleanTitle = rawTitle.replace(/\s*\(From.*?\)/i, '').trim() || rawTitle;
  const primaryArtist = rawArtist.split(',')[0].trim() || rawArtist;
  const cacheKey = trackId
    ? `${trackId}::${cleanTitle}::${primaryArtist}`.toLowerCase()
    : `${cleanTitle}::${primaryArtist}`.toLowerCase();

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
  app.set('trust proxy', true);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const getRedirectUri = (req: express.Request): string => {
    const appUrl =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL.replace(/\/$/, '')
        : `${req.protocol}://${req.get('host')}`;
    return `${appUrl}/auth/callback`;
  };

  const DEFAULT_SPOTIFY_CLIENT_ID = '56a09a1b4e784734b770200ca4a88e47';
  const DEFAULT_SPOTIFY_CLIENT_SECRET = Buffer.from(
    'YzQwM2YxODk4NDdmNDBmMmJjM2FkMmU3Y2QwN2I4YWI=',
    'base64'
  ).toString('utf8');

  const getSpotifyClientId = (): string =>
    (
      process.env.SPOTIFY_CLIENT_ID ||
      process.env.VITE_SPOTIFY_CLIENT_ID ||
      DEFAULT_SPOTIFY_CLIENT_ID
    ).trim();

  const getSpotifyClientSecret = (): string =>
    (process.env.SPOTIFY_CLIENT_SECRET || DEFAULT_SPOTIFY_CLIENT_SECRET).trim();

  // 1. Public Spotify Authorization Code with PKCE Auth URL Endpoint
  app.get('/api/spotify/auth-url', (req, res) => {
    const envClientId = getSpotifyClientId();

    if (!envClientId) {
      res.status(503).json({
        errorCode: 'missing_client_id',
        error:
          'Spotify OAuth Client ID is not configured on the server. Set SPOTIFY_CLIENT_ID in environment secrets to enable Spotify sign-in.',
      });
      return;
    }

    const requestedRedirect = String(req.query.redirectUri || '').trim();
    const redirectUri =
      /^https?:\/\/.+\/auth\/callback\/?$/i.test(requestedRedirect)
        ? requestedRedirect.replace(/\/$/, '')
        : getRedirectUri(req);

    // Purge stale PKCE entries older than 15 minutes
    const now = Date.now();
    for (const [k, entry] of pkceStore.entries()) {
      const createdAt = (entry as { createdAt?: number }).createdAt || 0;
      if (now - createdAt > 15 * 60 * 1000) {
        pkceStore.delete(k);
      }
    }

    const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
    const codeChallenge = base64UrlEncode(
      crypto.createHash('sha256').update(codeVerifier).digest()
    );
    const state = base64UrlEncode(crypto.randomBytes(16));
    (pkceStore as Map<string, { codeVerifier: string; clientId: string; redirectUri: string; createdAt: number }>).set(
      state,
      {
        codeVerifier,
        clientId: envClientId,
        redirectUri,
        createdAt: now,
      }
    );

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

    res.json({
      url: `https://accounts.spotify.com/authorize?${params.toString()}`,
      state,
      redirectUri,
    });
  });

  // 2. Standard Spotify OAuth PKCE Callback Handler
  const callbackHandler = async (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;
    let accessToken = '';
    let refreshToken = '';
    let expiresIn = 3600;
    let scope = '';
    let authError = error ? String(error) : '';
    let authErrorDescription = error_description ? String(error_description) : '';

    if (code && !authError) {
      const pkceEntry = state ? pkceStore.get(String(state)) : undefined;
      if (!pkceEntry) {
        authError = 'state_mismatch';
        authErrorDescription = 'Invalid or expired OAuth verification state.';
      } else {
        pkceStore.delete(String(state));
        try {
          const clientSecret = getSpotifyClientSecret();
          const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
          };
          if (clientSecret) {
            headers.Authorization = `Basic ${Buffer.from(
              `${pkceEntry.clientId}:${clientSecret}`
            ).toString('base64')}`;
          }

          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers,
            body: new URLSearchParams({
              client_id: pkceEntry.clientId,
              grant_type: 'authorization_code',
              code: String(code),
              redirect_uri: pkceEntry.redirectUri,
              code_verifier: pkceEntry.codeVerifier,
            }),
          });

          if (tokenRes.ok) {
            const data = (await tokenRes.json()) as {
              access_token?: string;
              refresh_token?: string;
              expires_in?: number;
              scope?: string;
            };
            accessToken = data.access_token || '';
            refreshToken = data.refresh_token || '';
            expiresIn = Number(data.expires_in) || 3600;
            scope = data.scope || '';
            if (!accessToken) {
              authError = 'missing_token';
              authErrorDescription = 'Spotify returned an empty access token.';
            }
          } else {
            const errData = (await tokenRes.json().catch(() => ({}))) as {
              error?: string;
              error_description?: string;
            };
            authError = errData.error || 'token_exchange_failed';
            authErrorDescription =
              errData.error_description || 'Spotify token exchange failed.';
          }
        } catch (err) {
          console.error('Spotify PKCE token exchange error:', err);
          authError = 'network_error';
          authErrorDescription = 'Network error exchanging authorization code with Spotify.';
        }
      }
    }

    const isSuccess = Boolean(accessToken && !authError);
    res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${isSuccess ? 'Spotify Connected — MaxYoutify' : 'Spotify Sign-In — MaxYoutify'}</title>
  </head>
  <body style="background:#12100e;color:#f5efe6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;max-width:360px;padding:24px;border:1px solid #3d332a;border-radius:12px;background:#1c1815;">
      <h2 style="margin:0 0 8px 0;color:${isSuccess ? '#1ed760' : '#f87171'};">
        ${isSuccess ? 'Spotify Connected' : 'Spotify Sign-In Cancelled'}
      </h2>
      <p style="margin:0;color:#b8aca0;font-size:14px;">
        ${isSuccess ? 'Syncing your playlists to MaxYoutify...' : 'Returning to MaxYoutify...'}
      </p>
    </div>
    <script>
      (function() {
        var payload = {
          type: 'SPOTIFY_OAUTH_RESULT',
          accessToken: ${JSON.stringify(accessToken)},
          refreshToken: ${JSON.stringify(refreshToken)},
          expiresIn: ${JSON.stringify(expiresIn)},
          scope: ${JSON.stringify(scope)},
          state: ${JSON.stringify(state ? String(state) : '')},
          error: ${JSON.stringify(authError)},
          errorDescription: ${JSON.stringify(authErrorDescription)}
        };
        if (window.opener) {
          window.opener.postMessage(payload, '*');
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

  // 3. Spotify PKCE Refresh Token Endpoint
  app.post('/api/spotify/refresh', async (req, res) => {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    const envClientId = getSpotifyClientId();
    const clientSecret = getSpotifyClientSecret();

    if (!envClientId) {
      res.status(503).json({
        errorCode: 'missing_client_id',
        error: 'Spotify OAuth Client ID is not configured on the server.',
      });
      return;
    }

    if (!refreshToken) {
      res.status(400).json({
        errorCode: 'missing_refresh_token',
        error: 'Refresh token is required.',
      });
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      if (clientSecret) {
        headers.Authorization = `Basic ${Buffer.from(
          `${envClientId}:${clientSecret}`
        ).toString('base64')}`;
      }

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers,
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: envClientId,
        }),
      });

      if (!tokenRes.ok) {
        const errData = (await tokenRes.json().catch(() => ({}))) as {
          error?: string;
          error_description?: string;
        };
        res.status(401).json({
          errorCode: errData.error || 'session_expired',
          error:
            errData.error_description ||
            'Your Spotify session expired. Please sign in with Spotify again.',
        });
        return;
      }

      const data = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };

      res.json({
        accessToken: data.access_token || '',
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: Number(data.expires_in) || 3600,
        scope: data.scope || '',
      });
    } catch (err) {
      console.error('Spotify refresh error:', err);
      res.status(502).json({
        errorCode: 'network_error',
        error: 'Network error refreshing Spotify session.',
      });
    }
  });

  // 4. Fetch Authenticated User Profile + All Their Spotify Playlists & Library via Spotify Web API
  app.get('/api/spotify/user-playlists', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        errorCode: 'session_expired',
        error: 'Missing Spotify Bearer token.',
      });
      return;
    }

    try {
      const [meRes, playlistsRes, savedRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me', { headers: { Authorization: authHeader } }),
        fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
          headers: { Authorization: authHeader },
        }),
        fetch('https://api.spotify.com/v1/me/tracks?limit=1', {
          headers: { Authorization: authHeader },
        }).catch(() => null),
      ]);

      if (meRes.status === 401 || playlistsRes.status === 401) {
        res.status(401).json({
          errorCode: 'session_expired',
          error: 'Spotify token expired or invalid. Please sign in again.',
        });
        return;
      }

      if (!meRes.ok || !playlistsRes.ok) {
        res.status(502).json({
          errorCode: 'network_error',
          error: 'Spotify Web API returned an error loading playlists.',
        });
        return;
      }

      const profile = (await meRes.json()) as {
        id?: string;
        display_name?: string;
        email?: string;
      };
      const firstPage = (await playlistsRes.json()) as {
        items?: Array<{
          id: string;
          name: string;
          description?: string;
          images?: Array<{ url: string }>;
          tracks?: { total?: number };
        }>;
        next?: string | null;
      };

      const rawItems = [...(firstPage.items || [])];
      let nextUrl = firstPage.next || null;
      let pageCount = 1;
      while (nextUrl && pageCount < 3) {
        const nextRes = await fetch(nextUrl, { headers: { Authorization: authHeader } });
        if (!nextRes.ok) break;
        const nextJson = (await nextRes.json()) as {
          items?: Array<{
            id: string;
            name: string;
            description?: string;
            images?: Array<{ url: string }>;
            tracks?: { total?: number };
          }>;
          next?: string | null;
        };
        rawItems.push(...(nextJson.items || []));
        nextUrl = nextJson.next || null;
        pageCount += 1;
      }

      const playlists = rawItems
        .filter((pl) => pl && pl.id)
        .map((pl) => ({
          id: pl.id,
          name: pl.name || 'Untitled Playlist',
          coverUrl: pl.images?.[0]?.url || '',
          totalTracks: pl.tracks?.total ?? 0,
        }));

      if (savedRes && savedRes.ok) {
        const savedJson = (await savedRes.json().catch(() => ({}))) as { total?: number };
        if (typeof savedJson.total === 'number' && savedJson.total > 0) {
          playlists.unshift({
            id: 'liked-songs',
            name: 'Liked Songs',
            coverUrl: '',
            totalTracks: savedJson.total,
          });
        }
      }

      res.json({
        user: {
          id: profile.id || 'spotify-user',
          displayName: profile.display_name || profile.email || profile.id || 'Spotify User',
          email: profile.email,
        },
        playlists,
      });
    } catch (err) {
      console.error('Error fetching Spotify user playlists:', err);
      res.status(502).json({
        errorCode: 'network_error',
        error: 'Failed to fetch playlists from Spotify Web API.',
      });
    }
  });

  // 5. Fetch Tracks for Any Selected User Playlist or Liked Songs via Bearer Token (with public fallback)
  app.get('/api/spotify/user-playlist-tracks', async (req, res) => {
    const rawId = String(req.query.id || '').trim();
    const isLikedSongs = rawId === 'liked-songs';
    const matchUrl = rawId.match(/playlist\/([a-zA-Z0-9]+)/);
    const playlistId = isLikedSongs
      ? 'liked-songs'
      : matchUrl
        ? matchUrl[1]
        : rawId.replace(/[^a-zA-Z0-9]/g, '');

    if (!playlistId) {
      res.status(400).json({ error: 'Missing playlist ID.' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        interface SpotifyApiTrackItem {
          track?: {
            id?: string | null;
            name?: string;
            uri?: string;
            duration_ms?: number;
            preview_url?: string | null;
            artists?: Array<{ name?: string }>;
            album?: {
              name?: string;
              release_date?: string;
              images?: Array<{ url: string; width?: number; height?: number }>;
            };
          } | null;
        }

        const collectedItems: SpotifyApiTrackItem[] = [];
        let playlistName = isLikedSongs ? 'Liked Songs' : 'Spotify Playlist';
        let playlistCover = '';

        if (isLikedSongs) {
          let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50';
          let pages = 0;
          while (url && pages < 3) {
            const trackRes = await fetch(url, { headers: { Authorization: authHeader } });
            if (trackRes.status === 401) {
              res.status(401).json({
                errorCode: 'session_expired',
                error: 'Spotify session expired. Please sign in again.',
              });
              return;
            }
            if (!trackRes.ok) {
              throw new Error('Failed to load Liked Songs from Spotify Web API.');
            }
            const pageJson = (await trackRes.json()) as {
              items?: SpotifyApiTrackItem[];
              next?: string | null;
            };
            collectedItems.push(...(pageJson.items || []));
            url = pageJson.next || null;
            pages += 1;
          }
        } else {
          const [metaRes, firstTracksRes] = await Promise.all([
            fetch(
              `https://api.spotify.com/v1/playlists/${encodeURIComponent(
                playlistId
              )}?fields=name,images`,
              { headers: { Authorization: authHeader } }
            ),
            fetch(
              `https://api.spotify.com/v1/playlists/${encodeURIComponent(
                playlistId
              )}/tracks?limit=100`,
              { headers: { Authorization: authHeader } }
            ),
          ]);

          if (firstTracksRes.status === 401 || metaRes.status === 401) {
            res.status(401).json({
              errorCode: 'session_expired',
              error: 'Spotify session expired. Please sign in again.',
            });
            return;
          }

          if (firstTracksRes.ok) {
            if (metaRes.ok) {
              const metaJson = (await metaRes.json()) as {
                name?: string;
                images?: Array<{ url: string }>;
              };
              if (metaJson.name) playlistName = metaJson.name;
              if (metaJson.images?.[0]?.url) playlistCover = metaJson.images[0].url;
            }
            const firstJson = (await firstTracksRes.json()) as {
              items?: SpotifyApiTrackItem[];
              next?: string | null;
            };
            collectedItems.push(...(firstJson.items || []));
            let nextUrl = firstJson.next || null;
            let pages = 1;
            while (nextUrl && pages < 3) {
              const nextRes = await fetch(nextUrl, { headers: { Authorization: authHeader } });
              if (!nextRes.ok) break;
              const nextJson = (await nextRes.json()) as {
                items?: SpotifyApiTrackItem[];
                next?: string | null;
              };
              collectedItems.push(...(nextJson.items || []));
              nextUrl = nextJson.next || null;
              pages += 1;
            }
          }
        }

        if (collectedItems.length > 0) {
          const usedIds = new Map<string, number>();
          const tracks = collectedItems
            .map((entry, idx) => {
              const tr = entry?.track;
              if (!tr || !tr.name) return null;
              const baseId = tr.id || `sp-${idx}`;
              const seen = usedIds.get(baseId) ?? 0;
              usedIds.set(baseId, seen + 1);
              const uniqueId = seen === 0 ? baseId : `${baseId}__${seen + 1}`;
              const images = (tr.album?.images || []).filter((im) => im && im.url);
              const primaryArt = images[0]?.url || '';
              const yearNum = Number((tr.album?.release_date || '').slice(0, 4)) || 2024;
              return {
                id: uniqueId,
                title: tr.name,
                artist:
                  (tr.artists || [])
                    .map((a) => a.name)
                    .filter(Boolean)
                    .join(', ') || 'Spotify Artist',
                album: tr.album?.name || playlistName,
                durationSec: Math.max(20, Math.round((tr.duration_ms || 180000) / 1000)),
                bpm: 108 + (idx % 16),
                year: yearNum,
                artworkUrl: primaryArt,
                images,
                spotifyUri: tr.uri || (tr.id ? `spotify:track:${tr.id}` : undefined),
                previewAudioUrl: tr.preview_url || undefined,
              };
            })
            .filter(Boolean);

          res.json({
            playlistId,
            name: playlistName.startsWith('Spotify ·')
              ? playlistName
              : `Spotify · ${playlistName}`,
            coverUrl: playlistCover,
            totalTracks: tracks.length,
            tracks,
          });
          return;
        }
      } catch (err) {
        console.error('Error fetching authenticated Spotify playlist tracks:', err);
        if (isLikedSongs) {
          res.status(502).json({ error: 'Failed to load Liked Songs from Spotify.' });
          return;
        }
      }
    }

    if (isLikedSongs) {
      res.status(401).json({ error: 'Sign in with Spotify to load Liked Songs.' });
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

  // 6. Direct Public Spotify Playlist Extractor (Explicit URL/ID required)
  app.get('/api/spotify/playlist', async (req, res) => {
    const rawIdOrUrl = String(req.query.id || '').trim();
    const matchUrl = rawIdOrUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    const playlistId = matchUrl ? matchUrl[1] : rawIdOrUrl.replace(/[^a-zA-Z0-9]/g, '');

    if (!playlistId) {
      res.status(400).json({ error: 'Please provide a valid Spotify playlist URL or ID.' });
      return;
    }

    try {
      const payload = await fetchPublicSpotifyPlaylistById(playlistId);
      res.json(payload);
    } catch (err) {
      console.error('Error fetching Spotify playlist:', err);
      res.status(500).json({ error: 'Failed to fetch Spotify playlist.' });
    }
  });

  // 6b. Per-Track Individual Artwork Resolver (Never returns parent playlist generic cover art)
  app.get('/api/spotify/track-artwork', async (req, res) => {
    const trackId = String(req.query.trackId || '').trim();
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();

    try {
      const artworkUrl = await fetchSpotifyTrackArtwork(trackId, title, artist);
      res.json({ trackId, artworkUrl });
    } catch {
      res.json({ trackId, artworkUrl: '' });
    }
  });

  // 7. Multi-Channel YouTube Video Search (Index 0 = Official, 1..4 = Top-Viewed Alternate Videos)
  app.get('/api/youtube/search-grabs', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const trackId = String(req.query.trackId || '').trim();

    const searchQuery = `${title} ${artist}`.trim();
    const { videoId, secondaryVideoId, lyricVideoId, videoIds } = searchQuery
      ? await searchYouTubeBySongTitle(searchQuery)
      : {
          videoId: '',
          secondaryVideoId: '',
          lyricVideoId: '',
          videoIds: [] as string[],
        };

    const artworkUrl =
      trackId || title
        ? await fetchSpotifyTrackArtwork(trackId, title, artist)
        : '';
    const secId = secondaryVideoId || videoId;
    const lyrId = lyricVideoId || secId;

    const channelRoles = [
      'Official Video',
      'Most Viewed Alternate #1',
      'Live / Stage Version #2',
      'Cover / Dance Version #3',
      'Lyric / Visual Video #4',
      'Remix / Acoustic #5',
      'Fan Edit / Session #6',
      'Alternate Clip #7',
    ];

    const channels = videoIds.slice(0, 8).map((vid, idx) => {
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
      label: `CH ${String(ch.channelNumber).padStart(2, '0')} · ${ch.label}`,
      timestampSec: idx * 35,
      timestampLabel: `0${Math.floor((idx * 35) / 60)}:${String((idx * 35) % 60).padStart(2, '0')}`,
      imageUrl: ch.imageUrl,
      caption: `${ch.code} ${ch.label} · ${title} — ${artist}`,
    }));

    res.json({
      trackId,
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
        headers: { 'User-Agent': 'MaxYoutify/1.0' },
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
        headers: { 'User-Agent': 'MaxYoutify/1.0' },
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
    const trackId = String(req.query.trackId || '').trim();
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    if (!title) {
      res.status(400).json({ error: 'Missing title' });
      return;
    }
    const resolved = await resolveFullLengthAudioStream(title, artist, trackId);
    if (!resolved) {
      res.json({ streamUrl: null, durationSec: 0 });
      return;
    }
    res.json(resolved);
  });

  const distPath = path.join(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event === 'start' && fs.existsSync(distIndexPath));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MaxYoutify server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MaxYoutify server:', err);
  process.exit(1);
});
