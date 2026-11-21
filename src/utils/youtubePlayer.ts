export const VERIFIED_EMBED_SAFE_VISUALIZER_IDS = [
  'jfKfPfyJRdk',
  '5qap5aO4i9A',
  'DWcJFNfaw9c',
  '4xDzrJKXOOY',
] as const;

const YOUTUBE_ID_EXACT_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_URL_PATTERNS: readonly RegExp[] = [
  /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/i,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/i,
  /youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/i,
  /youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/i,
  /[?&]v=([a-zA-Z0-9_-]{11})(?:[&#]|$)/i,
];

/**
 * Strictly extracts and validates an 11-character YouTube video ID from raw IDs or URLs.
 * Never returns empty strings, malformed query params, or full URLs.
 */
export function extractValidYouTubeVideoId(input?: string | null): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_EXACT_REGEX.test(trimmed)) {
    return trimmed;
  }

  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1] && YOUTUBE_ID_EXACT_REGEX.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

/**
 * Builds a deduplicated, embed-safe candidate queue for a track:
 * primary track ID -> alternate search result IDs -> verified embed-safe ambient fallbacks.
 */
export function buildYouTubeCandidateQueue(
  primaryInput?: string | null,
  alternateInputs: ReadonlyArray<string | null | undefined> = []
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushIfValid = (raw?: string | null) => {
    const valid = extractValidYouTubeVideoId(raw);
    if (valid && !seen.has(valid)) {
      seen.add(valid);
      out.push(valid);
    }
  };

  pushIfValid(primaryInput);
  for (const alt of alternateInputs) {
    pushIfValid(alt);
  }
  for (const safeFallback of VERIFIED_EMBED_SAFE_VISUALIZER_IDS) {
    pushIfValid(safeFallback);
  }

  return out;
}

export interface YTPlayerInstance {
  loadVideoById: (arg: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (arg: string | { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (vol: number) => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getPlayerState?: () => number;
  getIframe?: () => HTMLIFrameElement;
  destroy: () => void;
}

export interface YTPlayerOptions {
  height?: string | number;
  width?: string | number;
  videoId?: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { target: YTPlayerInstance; data: number }) => void;
    onError?: (event: { target: YTPlayerInstance; data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (elementOrId: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState?: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

/**
 * Singleton Promise loader for https://www.youtube.com/iframe_api so switching themes
 * never injects duplicate <script> tags or overwrites window.onYouTubeIframeAPIReady.
 */
export function loadYouTubeIframeApi(timeoutMs = 8500): Promise<YTNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame API requires a browser environment.'));
  }

  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }

  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        ytApiPromise = null;
        reject(new Error('Timed out loading YouTube IFrame API.'));
      }
    }, timeoutMs);

    const completeSuccess = () => {
      if (settled) return;
      if (window.YT && typeof window.YT.Player === 'function') {
        settled = true;
        window.clearTimeout(timer);
        resolve(window.YT);
      }
    };

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {
          // ignore pre-existing handler error
        }
      }
      completeSuccess();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]'
    );

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          ytApiPromise = null;
          reject(new Error('Failed to load YouTube IFrame API script.'));
        }
      };
      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript?.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }
    }

    // Poll briefly in case existing script finished before handler hooked
    const poll = window.setInterval(() => {
      if (settled) {
        window.clearInterval(poll);
        return;
      }
      if (window.YT && typeof window.YT.Player === 'function') {
        window.clearInterval(poll);
        completeSuccess();
      }
    }, 120);
  });

  return ytApiPromise;
}

export function resetYouTubeIframeApiLoaderForTests(): void {
  ytApiPromise = null;
}
