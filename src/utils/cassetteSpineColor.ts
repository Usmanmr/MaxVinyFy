import { useState, useEffect } from 'react';
import {
  DEFAULT_CASSETTE_SPINE_PALETTE,
  extractCassetteSpinePaletteFromPixels,
  type CassetteSpinePalette,
} from './cassetteDeckLogic';

const spinePaletteCache = new Map<string, CassetteSpinePalette>();
const inflightExtractions = new Map<string, Promise<CassetteSpinePalette>>();

/**
 * Samples album artwork onto a small offscreen canvas using CORS anonymous loading and extracts
 * a high-contrast J-card spine palette, falling back safely to neutral cream (#E9E6DA) on
 * missing artwork, load error, or CORS canvas taint.
 */
export function resolveCassetteSpinePaletteForUrl(
  artworkUrl?: string | null
): Promise<CassetteSpinePalette> {
  const trimmed = typeof artworkUrl === 'string' ? artworkUrl.trim() : '';
  if (!trimmed || typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(DEFAULT_CASSETTE_SPINE_PALETTE);
  }

  const cached = spinePaletteCache.get(trimmed);
  if (cached) return Promise.resolve(cached);

  const pending = inflightExtractions.get(trimmed);
  if (pending) return pending;

  const task = new Promise<CassetteSpinePalette>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    const finish = (palette: CassetteSpinePalette) => {
      if (settled) return;
      settled = true;
      spinePaletteCache.set(trimmed, palette);
      inflightExtractions.delete(trimmed);
      resolve(palette);
    };

    img.onload = () => {
      try {
        const size = 20;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          finish(DEFAULT_CASSETTE_SPINE_PALETTE);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        finish(extractCassetteSpinePaletteFromPixels(data));
      } catch {
        // SecurityError on CORS-restricted remote cover -> neutral cream fallback
        finish(DEFAULT_CASSETTE_SPINE_PALETTE);
      }
    };

    img.onerror = () => {
      finish(DEFAULT_CASSETTE_SPINE_PALETTE);
    };

    img.src = trimmed;
  });

  inflightExtractions.set(trimmed, task);
  return task;
}

export function useCassetteSpinePalette(
  artworkUrl?: string | null,
  enabled = true
): CassetteSpinePalette {
  const cleanUrl = enabled && typeof artworkUrl === 'string' ? artworkUrl.trim() : '';
  const [palette, setPalette] = useState<CassetteSpinePalette>(() =>
    cleanUrl ? spinePaletteCache.get(cleanUrl) || DEFAULT_CASSETTE_SPINE_PALETTE : DEFAULT_CASSETTE_SPINE_PALETTE
  );

  useEffect(() => {
    if (!cleanUrl) {
      setPalette(DEFAULT_CASSETTE_SPINE_PALETTE);
      return;
    }

    const immediate = spinePaletteCache.get(cleanUrl);
    if (immediate) {
      setPalette(immediate);
      return;
    }

    let cancelled = false;
    resolveCassetteSpinePaletteForUrl(cleanUrl).then((resolved) => {
      if (!cancelled) setPalette(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [cleanUrl]);

  return palette;
}
