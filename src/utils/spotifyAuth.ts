export const SPOTIFY_SESSION_STORAGE_KEY = 'maxyoutify_spotify_session_v1';
export const SPOTIFY_PKCE_STATE_STORAGE_KEY = 'maxyoutify_spotify_pkce_state_v1';
export const SAVED_PLAYLISTS_STORAGE_KEY = 'maxyoutify_saved_playlists_v1';
export const LEGACY_SAVED_PLAYLISTS_STORAGE_KEY = 'mvf_saved_playlists_v1';

export const SPOTIFY_OAUTH_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
] as const;

export interface SpotifyUserProfile {
  id: string;
  displayName: string;
  email?: string;
}

export interface SpotifySession {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope?: string;
  user?: SpotifyUserProfile;
}

export interface SpotifyOAuthCallbackPayload {
  type: 'SPOTIFY_OAUTH_RESULT' | 'OAUTH_AUTH_SUCCESS';
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

export type ParsedSpotifyCallbackResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresInSec: number;
      scope?: string;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
    };

const PKCE_VERIFIER_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generatePkceCodeVerifier(length = 64): string {
  const safeLen = Math.max(43, Math.min(128, Math.round(length)));
  const randomBytes = new Uint8Array(safeLen);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < safeLen; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let verifier = '';
  for (let i = 0; i < safeLen; i++) {
    verifier += PKCE_VERIFIER_CHARSET[randomBytes[i] % PKCE_VERIFIER_CHARSET.length];
  }
  return verifier;
}

export async function computePkceCodeChallenge(codeVerifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(codeVerifier);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return base64UrlEncodeBytes(new Uint8Array(digest));
  }
  // Fallback for older Node test contexts without globalThis.crypto.subtle
  const nodeCrypto = await import('node:crypto');
  const digest = nodeCrypto.createHash('sha256').update(encoded).digest();
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

export function buildSpotifyAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
  showDialog?: boolean;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId.trim(),
    response_type: 'code',
    redirect_uri: params.redirectUri.trim(),
    scope: (params.scopes || SPOTIFY_OAUTH_SCOPES).join(' '),
    state: params.state,
    code_challenge_method: 'S256',
    code_challenge: params.codeChallenge,
    show_dialog: params.showDialog === false ? 'false' : 'true',
  });
  return `https://accounts.spotify.com/authorize?${query.toString()}`;
}

export function isSpotifySessionExpired(
  session: Pick<SpotifySession, 'expiresAtMs'> | null | undefined,
  nowMs = Date.now(),
  refreshBufferMs = 60_000
): boolean {
  if (!session || !Number.isFinite(session.expiresAtMs)) return true;
  return nowMs + Math.max(0, refreshBufferMs) >= session.expiresAtMs;
}

export function mapSpotifyOAuthError(errorCode: string, errorDescription?: string): string {
  const normalized = (errorCode || '').trim().toLowerCase();
  const detail = (errorDescription || '').trim();
  switch (normalized) {
    case 'access_denied':
      return 'Spotify sign-in was cancelled (authorization consent was denied).';
    case 'missing_client_id':
      return 'Spotify OAuth is not configured yet (SPOTIFY_CLIENT_ID is missing on the server).';
    case 'session_expired':
    case 'invalid_grant':
      return 'Your Spotify session has expired or been revoked. Please sign in with Spotify again.';
    case 'state_mismatch':
      return 'Spotify security verification (state) did not match. Please try signing in again.';
    case 'popup_blocked':
      return 'Your browser blocked the Spotify sign-in window. Please allow popups and try again.';
    case 'popup_closed':
      return 'Spotify sign-in window was closed before completing authorization.';
    case 'network_error':
      return 'Network error while communicating with Spotify. Please check your connection and retry.';
    default:
      if (detail) return `Spotify sign-in failed: ${detail}`;
      if (normalized) return `Spotify sign-in error (${normalized}). Please try again.`;
      return 'Could not complete Spotify sign-in. Please try again.';
  }
}

export function parseSpotifyCallbackMessage(
  rawData: unknown,
  expectedState?: string
): ParsedSpotifyCallbackResult | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const data = rawData as Partial<SpotifyOAuthCallbackPayload>;
  if (data.type !== 'SPOTIFY_OAUTH_RESULT' && data.type !== 'OAUTH_AUTH_SUCCESS') {
    return null;
  }

  if (expectedState && data.state && data.state !== expectedState) {
    return {
      ok: false,
      errorCode: 'state_mismatch',
      message: mapSpotifyOAuthError('state_mismatch'),
    };
  }

  if (data.error) {
    return {
      ok: false,
      errorCode: String(data.error),
      message: mapSpotifyOAuthError(String(data.error), data.errorDescription),
    };
  }

  const accessToken = typeof data.accessToken === 'string' ? data.accessToken.trim() : '';
  if (!accessToken) {
    return {
      ok: false,
      errorCode: 'missing_token',
      message: mapSpotifyOAuthError('missing_token', 'No access token returned by Spotify.'),
    };
  }

  const expiresInSec =
    typeof data.expiresIn === 'number' && Number.isFinite(data.expiresIn) && data.expiresIn > 0
      ? data.expiresIn
      : 3600;

  return {
    ok: true,
    accessToken,
    refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken.trim() : '',
    expiresInSec,
    scope: typeof data.scope === 'string' ? data.scope : undefined,
  };
}

export function loadSpotifySessionFromStorage(
  storage?: Pick<Storage, 'getItem'> | null
): SpotifySession | null {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return null;
  try {
    const raw = targetStorage.getItem(SPOTIFY_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifySession>;
    if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) {
      return null;
    }
    if (!Number.isFinite(parsed.expiresAtMs)) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
      expiresAtMs: parsed.expiresAtMs as number,
      scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
      user:
        parsed.user && typeof parsed.user.displayName === 'string'
          ? {
              id: parsed.user.id || 'spotify-user',
              displayName: parsed.user.displayName,
              email: parsed.user.email,
            }
          : undefined,
    };
  } catch {
    return null;
  }
}

export function saveSpotifySessionToStorage(
  session: SpotifySession,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return;
  try {
    targetStorage.setItem(SPOTIFY_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage quota errors
  }
}

export function clearAllUserSpotifyDataFromStorage(
  storage?: Pick<Storage, 'removeItem'> | null
): void {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return;
  try {
    targetStorage.removeItem(SPOTIFY_SESSION_STORAGE_KEY);
    targetStorage.removeItem(SPOTIFY_PKCE_STATE_STORAGE_KEY);
    targetStorage.removeItem(SAVED_PLAYLISTS_STORAGE_KEY);
    targetStorage.removeItem(LEGACY_SAVED_PLAYLISTS_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
