import { useState, useEffect } from 'react';
import {
  extractCdSpinePaletteFromPixels,
  getFallbackCdSpinePalette,
  type CdSpinePalette,
} from './cdHifiLogic';

const cdSpinePaletteCache = new Map<string, CdSpinePalette>();
const cdInflightExtractions = new Map<string, Promise<CdSpinePalette>>();

/**
 * Extracts a vibrant dominant jewel-case spine color offscreen from album artwork URL
 * without rendering any <img> tag inside playlist spine rows.
 */
export function resolveCdSpinePaletteForUrl(
  artworkUrl?: string | null,
  fallbackSeedKey = 'cd-track'
): Promise<CdSpinePalette> {
  const trimmed = typeof artworkUrl === 'string' ? artworkUrl.trim() : '';
  const fallback = getFallbackCdSpinePalette(fallbackSeedKey);
  if (!trimmed || typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(fallback);
  }

  const cached = cdSpinePaletteCache.get(trimmed);
  if (cached) return Promise.resolve(cached);

  const pending = cdInflightExtractions.get(trimmed);
  if (pending) return pending;

  const task = new Promise<CdSpinePalette>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    let settled = false;
    const finish = (palette: CdSpinePalette) => {
      if (settled) return;
      settled = true;
      cdSpinePaletteCache.set(trimmed, palette);
      cdInflightExtractions.delete(trimmed);
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
          finish(fallback);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        finish(extractCdSpinePaletteFromPixels(data, fallbackSeedKey));
      } catch {
        finish(fallback);
      }
    };

    img.onerror = () => {
      finish(fallback);
    };

    img.src = trimmed;
  });

  cdInflightExtractions.set(trimmed, task);
  return task;
}

export function useCdSpinePalette(
  artworkUrl?: string | null,
  fallbackSeedKey = 'cd-track',
  enabled = true
): CdSpinePalette {
  const cleanUrl = enabled && typeof artworkUrl === 'string' ? artworkUrl.trim() : '';
  const [palette, setPalette] = useState<CdSpinePalette>(() =>
    cleanUrl
      ? cdSpinePaletteCache.get(cleanUrl) || getFallbackCdSpinePalette(fallbackSeedKey)
      : getFallbackCdSpinePalette(fallbackSeedKey)
  );

  useEffect(() => {
    if (!enabled) return;
    if (!cleanUrl) {
      setPalette(getFallbackCdSpinePalette(fallbackSeedKey));
      return;
    }

    const immediate = cdSpinePaletteCache.get(cleanUrl);
    if (immediate) {
      setPalette(immediate);
      return;
    }

    let cancelled = false;
    resolveCdSpinePaletteForUrl(cleanUrl, fallbackSeedKey).then((resolved) => {
      if (!cancelled) setPalette(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [cleanUrl, fallbackSeedKey, enabled]);

  return palette;
}
