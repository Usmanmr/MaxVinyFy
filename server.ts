import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for YouTube searches, Spotify track artwork, and OAuth PKCE verifiers
const youtubeSearchCache = new Map<string, { videoId: string; secondaryVideoId?: string }>();
const spotifyArtCache = new Map<string, string>();
const pkceStore = new Map<string, { codeVerifier: string; clientId: string; redirectUri: string }>();

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function searchYouTubeBySongTitle(query: string): Promise<{ videoId: string; secondaryVideoId?: string }> {
  const key = query.toLowerCase().trim();
  if (youtubeSearchCache.has(key)) {
    return youtubeSearchCache.get(key)!;
  }
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' official music video')}`;
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
      };
      youtubeSearchCache.set(key, result);
      return result;
    }
  } catch (err) {
    console.error('YouTube search error:', err);
  }
  return { videoId: '7IBDa53IsvI', secondaryVideoId: 'Ryjx5sL2ci0' };
}

async function fetchSpotifyTrackArtwork(trackId: string, fallbackUrl: string): Promise<string> {
  if (!trackId) return fallbackUrl;
  if (spotifyArtCache.has(trackId)) {
    return spotifyArtCache.get(trackId)!;
  }
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`;
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

  // 1. Construct Spotify OAuth 2.0 Authorization URL with PKCE (works for any user's Spotify account)
  app.get('/api/spotify/auth-url', (req, res) => {
    const clientId = ((req.query.clientId as string) || process.env.SPOTIFY_CLIENT_ID || '').trim();
    const redirectUri = ((req.query.redirectUri as string) || getRedirectUri(req)).trim();

    if (!clientId) {
      res.status(400).json({
        error: 'MISSING_CLIENT_ID',
        message: 'Enter your Spotify App Client ID or paste your Spotify Web API Token below to log in.',
        redirectUri,
      });
      return;
    }

    const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
    const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64UrlEncode(crypto.randomBytes(16));

    pkceStore.set(state, { codeVerifier, clientId, redirectUri });

    const scopes = [
      'streaming',
      'user-read-email',
      'user-read-private',
      'user-read-playback-state',
      'user-modify-playback-state',
      'playlist-read-private',
      'playlist-read-collaborative',
      'user-library-read',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      show_dialog: 'true',
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    res.json({ url: authUrl, redirectUri });
  });

  // 2. OAuth Callback Handler (Supports PKCE Code Exchange, Client Secret Code Exchange, and Implicit Token)
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
            const errData = (await tokenRes.json().catch(() => ({}))) as { error_description?: string };
            authError = errData.error_description || 'Spotify token exchange failed.';
          }
        } catch (err) {
          console.error('Spotify PKCE token exchange error:', err);
        }
      } else if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
        try {
          const redirectUri = getRedirectUri(req);
          const basicAuth = Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64');

          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              Authorization: `Basic ${basicAuth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code: String(code),
              redirect_uri: redirectUri,
            }),
          });

          if (tokenRes.ok) {
            const data = (await tokenRes.json()) as { access_token?: string };
            accessToken = data.access_token || '';
          }
        } catch (err) {
          console.error('Spotify token exchange error:', err);
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
      <h2 style="margin:0 0 8px 0;color:#f59e0b;">Spotify Connected</h2>
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
          setTimeout(function() { window.close(); }, 300);
        } else {
          window.location.href = '/';
        }
      })();
    </script>
  </body>
</html>`);
  };

  app.get(['/auth/callback', '/auth/callback/'], callbackHandler);

  // 3. Fetch Authenticated User Profile + All Their Spotify Playlists via Spotify Web API
  app.get('/api/spotify/user-playlists', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Spotify Bearer token.' });
      return;
    }

    try {
      const [meRes, playlistsRes] = await Promise.all([
        fetch('https://api.spotify.com/v1/me', { headers: { Authorization: authHeader } }),
        fetch('https://api.spotify.com/v1/me/playlists?limit=50', { headers: { Authorization: authHeader } }),
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

  // 4. Fetch Tracks for Any Selected User Playlist via Official Spotify Web API (with Embed Fallback)
  app.get('/api/spotify/user-playlist-tracks', async (req, res) => {
    const rawId = String(req.query.id || '').trim();
    const matchUrl = rawId.match(/playlist\/([a-zA-Z0-9]+)/);
    const playlistId = matchUrl ? matchUrl[1] : rawId.replace(/[^a-zA-Z0-9]/g, '');
    const authHeader = req.headers.authorization;

    if (!playlistId) {
      res.status(400).json({ error: 'Missing playlist ID.' });
      return;
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const plRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`, {
          headers: { Authorization: authHeader },
        });

        if (plRes.ok) {
          const plData = (await plRes.json()) as {
            id?: string;
            name?: string;
            images?: Array<{ url: string }>;
            tracks?: {
              total?: number;
              items?: Array<{
                track?: {
                  id?: string;
                  uri?: string;
                  name?: string;
                  duration_ms?: number;
                  preview_url?: string | null;
                  artists?: Array<{ name?: string }>;
                  album?: { name?: string; images?: Array<{ url: string }> };
                } | null;
              }>;
            };
          };

          const playlistName = plData.name || 'Spotify Playlist';
          const playlistCover = plData.images?.[0]?.url || '';
          const rawItems = (plData.tracks?.items || [])
            .map((item) => item.track)
            .filter((t): t is NonNullable<typeof t> => Boolean(t && t.name));

          const tracks = rawItems.slice(0, 50).map((t, idx) => {
            const trackId = t.id || `sp-user-${idx}`;
            const artist = (t.artists || []).map((a) => a.name).filter(Boolean).join(', ') || 'Spotify Artist';
            const artworkUrl = t.album?.images?.[0]?.url || playlistCover;
            if (artworkUrl && trackId) {
              spotifyArtCache.set(trackId, artworkUrl);
            }
            return {
              id: trackId,
              title: t.name || `Track ${idx + 1}`,
              artist,
              album: t.album?.name || `Spotify · ${playlistName}`,
              durationSec: Math.max(30, Math.round((t.duration_ms || 180000) / 1000)),
              bpm: 108 + (idx % 16),
              year: 2024,
              artworkUrl,
              spotifyUri: t.uri || `spotify:track:${trackId}`,
              previewAudioUrl: t.preview_url || undefined,
            };
          });

          if (tracks.length > 0) {
            res.json({
              playlistId,
              name: `Spotify · ${playlistName}`,
              coverUrl: playlistCover,
              totalTracks: plData.tracks?.total || tracks.length,
              tracks,
            });
            return;
          }
        }
      } catch (err) {
        console.error('Spotify API playlist tracks error, falling back to embed:', err);
      }
    }

    // Fallback to public embed extractor so public playlists always load even without token
    res.redirect(`/api/spotify/playlist?id=${encodeURIComponent(playlistId)}`);
  });

  // 5. Direct Public Spotify Playlist Extractor
  app.get('/api/spotify/playlist', async (req, res) => {
    const rawIdOrUrl = String(req.query.id || '2ENMa1IQDSlEPDKNmS25K2').trim();
    const matchUrl = rawIdOrUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    const playlistId = matchUrl ? matchUrl[1] : rawIdOrUrl.replace(/[^a-zA-Z0-9]/g, '');

    try {
      const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(playlistId)}`;
      const response = await fetch(embedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) {
        res.status(400).json({ error: 'Failed to load Spotify playlist embed.' });
        return;
      }
      const html = await response.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!nextDataMatch) {
        res.status(400).json({ error: 'Could not parse Spotify playlist tracklist.' });
        return;
      }

      const parsed = JSON.parse(nextDataMatch[1]);
      const entity = parsed?.props?.pageProps?.state?.data?.entity;
      if (!entity || !Array.isArray(entity.trackList)) {
        res.status(400).json({ error: 'Spotify playlist entity missing trackList.' });
        return;
      }

      const playlistName = entity.name || entity.title || 'Spotify Playlist';
      const playlistCover = entity.coverArt?.sources?.[0]?.url || '';
      const rawTracks = entity.trackList.slice(0, 35);

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
              idx < 6
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

      res.json({
        playlistId,
        name: `Spotify · ${playlistName}`,
        coverUrl: playlistCover,
        totalTracks: entity.trackList.length,
        tracks,
      });
    } catch (err) {
      console.error('Error fetching Spotify playlist:', err);
      res.status(500).json({ error: 'Failed to fetch Spotify playlist.' });
    }
  });

  // 6. Read Song Title & Artist -> Search YouTube -> Return Real YouTube Video Grabs + Track Cover Art
  app.get('/api/youtube/search-grabs', async (req, res) => {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const trackId = String(req.query.trackId || '').trim();
    const fallbackVideoId = String(req.query.videoId || '7IBDa53IsvI').trim();

    const searchQuery = `${title} ${artist}`.trim();
    const { videoId, secondaryVideoId } = searchQuery
      ? await searchYouTubeBySongTitle(searchQuery)
      : { videoId: fallbackVideoId, secondaryVideoId: fallbackVideoId };

    const artworkUrl = trackId ? await fetchSpotifyTrackArtwork(trackId, '') : '';
    const secId = secondaryVideoId || videoId;

    const frames = [
      {
        id: `${videoId}-hq`,
        label: 'CH 03 · YouTube Master Grab',
        timestampSec: 0,
        timestampLabel: '00:15',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        caption: `YouTube Search: "${title}" — ${artist} (Master Broadcast)`,
      },
      {
        id: `${videoId}-1`,
        label: 'CH 04 · Video Scene Grab #1',
        timestampSec: 35,
        timestampLabel: '00:48',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/1.jpg`,
        caption: `YouTube Video Grab #1 · ${title}`,
      },
      {
        id: `${videoId}-2`,
        label: 'CH 05 · Video Scene Grab #2',
        timestampSec: 75,
        timestampLabel: '01:24',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/2.jpg`,
        caption: `YouTube Video Grab #2 · ${title}`,
      },
      {
        id: `${videoId}-3`,
        label: 'CH 06 · Video Scene Grab #3',
        timestampSec: 115,
        timestampLabel: '02:05',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/3.jpg`,
        caption: `YouTube Video Grab #3 · ${title}`,
      },
      {
        id: `${secId}-alt`,
        label: 'CH 07 · Alternate Video Angle',
        timestampSec: 145,
        timestampLabel: '02:35',
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(secId)}/hqdefault.jpg`,
        caption: `YouTube Alternate Broadcast · ${title} (${artist})`,
      },
    ];

    res.json({
      videoId,
      secondaryVideoId: secId,
      title,
      artist,
      artworkUrl,
      frames,
    });
  });

  // 7. Public Spotify URL OEmbed Importer
  app.get('/api/spotify/import-url', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !rawUrl.includes('spotify.com')) {
      res.status(400).json({ error: 'Please provide a valid open.spotify.com track or playlist URL.' });
      return;
    }

    try {
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`;
      const response = await fetch(oembedUrl);
      if (!response.ok) {
        res.status(400).json({ error: 'Could not fetch Spotify metadata for that URL.' });
        return;
      }
      const data = (await response.json()) as {
        title?: string;
        thumbnail_url?: string;
      };

      res.json({
        title: data.title || 'Spotify Imported Selection',
        thumbnailUrl: data.thumbnail_url || '',
        sourceUrl: rawUrl,
      });
    } catch {
      res.status(500).json({ error: 'Failed to reach Spotify oEmbed endpoint.' });
    }
  });

  // 8. Fetch Time-Synced LRC Lyrics for the Active Song via LRCLIB
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
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${primaryArtist}`)}`;
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'VinylDrive/1.0' },
      });
      if (response.ok) {
        const items = (await response.json()) as Array<{ syncedLyrics?: string | null; plainLyrics?: string | null }>;
        const matchWithSynced = items.find((item) => item.syncedLyrics && item.syncedLyrics.includes('['));
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
