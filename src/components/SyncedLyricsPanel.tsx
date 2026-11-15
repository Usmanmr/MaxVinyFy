import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  parseLrcLyrics,
  parsePlainLyrics,
  getActiveLyricIndex,
  buildLrclibGetUrl,
  lyricsContainNonLatinScript,
  alignConvertedLyricLines,
  calculateNextLyricTimeoutMs,
  calculateCenteredLyricTranslateY,
  stepLyricFontSize,
  formatDuration,
  triggerButtonHaptic,
  type TrackItem,
  type SyncedLyricLine,
  type DominantThemePalette,
  type LyricsDisplayLanguageMode,
} from '../utils/playerLogic';
import { playbackClockStore } from '../utils/playbackStore';

export interface SyncedLyricsPanelProps {
  track: TrackItem;
  isStandby: boolean;
  isPlaying?: boolean;
  isDocumentHidden?: boolean;
  lowPowerMode?: boolean;
  nightMode?: boolean;
  playbackRate?: number;
  prefersReducedMotion: boolean;
  themePalette: DominantThemePalette;
  onSeek: (targetSec: number) => void;
  className?: string;
}

interface CachedTrackLyricsRecord {
  trackId: string;
  mode: 'synced' | 'unsynced' | 'empty';
  syncedLines: SyncedLyricLine[];
  plainLines: string[];
  hasNonLatin: boolean;
  romanizedLines: string[] | null;
  englishMeaningLines: string[] | null;
}

const LYRICS_STORAGE_PREFIX = 'mvf_track_lyrics_v2_';
const FONT_STEP_STORAGE_KEY = 'mvf_lyrics_font_step_v1';
const memoryLyricsCache = new Map<string, CachedTrackLyricsRecord>();

function readCachedTrackLyrics(trackId: string): CachedTrackLyricsRecord | null {
  if (!trackId) return null;
  if (memoryLyricsCache.has(trackId)) {
    return memoryLyricsCache.get(trackId)!;
  }
  try {
    const raw = window.localStorage.getItem(`${LYRICS_STORAGE_PREFIX}${trackId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTrackLyricsRecord;
    if (
      parsed &&
      parsed.trackId === trackId &&
      (parsed.mode === 'synced' || parsed.mode === 'unsynced' || parsed.mode === 'empty')
    ) {
      memoryLyricsCache.set(trackId, parsed);
      return parsed;
    }
  } catch {
    // ignore storage read error
  }
  return null;
}

function writeCachedTrackLyrics(record: CachedTrackLyricsRecord): void {
  if (!record.trackId) return;
  memoryLyricsCache.set(record.trackId, record);
  try {
    window.localStorage.setItem(
      `${LYRICS_STORAGE_PREFIX}${record.trackId}`,
      JSON.stringify(record)
    );
  } catch {
    // ignore storage quota errors
  }
}

function getVfdFontSizeClasses(step: number): {
  activeClass: string;
  neighborClass: string;
  plainClass: string;
} {
  const clamped = Math.max(0, Math.min(3, Math.round(step)));
  switch (clamped) {
    case 0:
      return {
        activeClass: 'text-[10.5px] sm:text-[11.5px] leading-[17px]',
        neighborClass: 'text-[9px] sm:text-[10px] leading-[14px]',
        plainClass: 'text-[9.5px] sm:text-[10.5px] leading-snug',
      };
    case 2:
      return {
        activeClass: 'text-[12.5px] sm:text-[14px] leading-[20px]',
        neighborClass: 'text-[10.5px] sm:text-[11.5px] leading-[15px]',
        plainClass: 'text-[11.5px] sm:text-[12.5px] leading-snug',
      };
    case 3:
      return {
        activeClass: 'text-[13.5px] sm:text-[15px] leading-[21px]',
        neighborClass: 'text-[11px] sm:text-[12px] leading-[16px]',
        plainClass: 'text-[12.5px] sm:text-[13.5px] leading-snug',
      };
    case 1:
    default:
      return {
        activeClass: 'text-[11px] sm:text-[12.5px] leading-[18px] sm:leading-[20px]',
        neighborClass: 'text-[9.5px] sm:text-[11px] leading-[15px] sm:leading-[16px]',
        plainClass: 'text-[10.5px] sm:text-[11.5px] leading-snug',
      };
  }
}

/**
 * Integrated Horizontal VFD/Phosphor Dot-Matrix Lyrics Display.
 * Set into a brushed-metal bezel screwed directly into the wooden console top with 4 visible slot-head screws.
 * - Single-color phosphor on near-black glass with faint static glow and static screen-door matrix texture.
 * - Fetches time-synced or plain lyrics from LRCLIB (cached per track ID in localStorage).
 * - Automatically detects non-Latin script and converts line-by-line via Gemini into Romanized English letters or English meaning.
 * - Advances lines using the 1Hz playback clock + single setTimeout for the next line's timestamp (stopped when paused or hidden).
 * - Scrolls via `transform: translateY` with a 400ms transition; tapping any line seeks to that timestamp.
 */
export const SyncedLyricsPanel = React.memo<SyncedLyricsPanelProps>(
  ({
    track,
    isStandby,
    isPlaying = false,
    isDocumentHidden = false,
    lowPowerMode = false,
    nightMode = false,
    playbackRate = 1,
    prefersReducedMotion,
    onSeek,
    className = '',
  }) => {
    const [lyricsRecord, setLyricsRecord] = useState<CachedTrackLyricsRecord | null>(null);
    const [isLoadingLrclib, setIsLoadingLrclib] = useState<boolean>(false);
    const [languageMode, setLanguageMode] = useState<LyricsDisplayLanguageMode>('romanized');
    const [isConverting, setIsConverting] = useState<boolean>(false);
    const [conversionError, setConversionError] = useState<boolean>(false);
    const [retryTick, setRetryTick] = useState<number>(0);

    const [fontSizeStep, setFontSizeStep] = useState<number>(() => {
      try {
        const saved = window.localStorage.getItem(FONT_STEP_STORAGE_KEY);
        return saved !== null ? Math.max(0, Math.min(3, Number(saved))) : 1;
      } catch {
        return 1;
      }
    });

    const [activeLyricIndex, setActiveLyricIndex] = useState<number>(0);
    const [translateYpx, setTranslateYpx] = useState<number>(0);

    const syncedViewportRef = useRef<HTMLDivElement | null>(null);
    const translateTrackRef = useRef<HTMLDivElement | null>(null);
    const lineButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
    const nextLineTimeoutRef = useRef<number | null>(null);
    const lastClockSyncPerfRef = useRef<number>(performance.now());
    const lastClockSyncSecRef = useRef<number>(playbackClockStore.getCurrentTimeSec());

    const clearNextLineTimer = useCallback(() => {
      if (nextLineTimeoutRef.current !== null) {
        window.clearTimeout(nextLineTimeoutRef.current);
        nextLineTimeoutRef.current = null;
      }
    }, []);

    // 1. Fetch lyrics from LRCLIB (cached per track.id in localStorage)
    useEffect(() => {
      clearNextLineTimer();
      setConversionError(false);
      setIsConverting(false);

      if (isStandby || !track.id || track.id === 'standby-empty') {
        setLyricsRecord(null);
        setIsLoadingLrclib(false);
        setActiveLyricIndex(0);
        setTranslateYpx(0);
        return;
      }

      const cached = readCachedTrackLyrics(track.id);
      if (cached) {
        setLyricsRecord(cached);
        setIsLoadingLrclib(false);
        return;
      }

      let cancelled = false;
      setIsLoadingLrclib(true);
      setLyricsRecord(null);

      const fetchFromLrclib = async () => {
        let syncedLrc: string | null = null;
        let plainText: string | null = null;

        try {
          const params = new URLSearchParams({
            trackId: track.id,
            track_name: track.title,
            artist_name: track.artist,
            album_name: track.album,
            duration: String(Math.round(track.durationSec || 180)),
          });
          const res = await fetch(`/api/lyrics?${params.toString()}`);
          if (res.ok) {
            const data = (await res.json()) as {
              syncedLyrics?: string | null;
              plainLyrics?: string | null;
            };
            syncedLrc = data.syncedLyrics || null;
            plainText = data.plainLyrics || null;
          }
        } catch {
          try {
            const directUrl = buildLrclibGetUrl({
              trackName: track.title,
              artistName: track.artist,
              albumName: track.album,
              durationSec: track.durationSec,
            });
            const directRes = await fetch(directUrl);
            if (directRes.ok) {
              const directData = (await directRes.json()) as {
                syncedLyrics?: string | null;
                plainLyrics?: string | null;
              };
              syncedLrc = directData.syncedLyrics || null;
              plainText = directData.plainLyrics || null;
            }
          } catch {
            // ignore
          }
        }

        if (cancelled) return;

        const parsedSynced = syncedLrc ? parseLrcLyrics(syncedLrc, track.durationSec) : [];
        const parsedPlain =
          parsedSynced.length === 0 && plainText ? parsePlainLyrics(plainText) : [];

        let mode: 'synced' | 'unsynced' | 'empty' = 'empty';
        let baseLines: string[] = [];

        if (parsedSynced.length > 0) {
          mode = 'synced';
          baseLines = parsedSynced.map((l) => l.text);
        } else if (parsedPlain.length > 0) {
          mode = 'unsynced';
          baseLines = parsedPlain;
        }

        const hasNonLatin = lyricsContainNonLatinScript(baseLines);
        const newRecord: CachedTrackLyricsRecord = {
          trackId: track.id,
          mode,
          syncedLines: parsedSynced,
          plainLines: parsedPlain,
          hasNonLatin,
          romanizedLines: !hasNonLatin && baseLines.length > 0 ? baseLines : null,
          englishMeaningLines: null,
        };

        writeCachedTrackLyrics(newRecord);
        setLyricsRecord(newRecord);
        setIsLoadingLrclib(false);
      };

      fetchFromLrclib();
      return () => {
        cancelled = true;
      };
    }, [track.id, track.title, track.artist, track.album, track.durationSec, isStandby, clearNextLineTimer]);

    // 2. Gemini API Line-by-Line Conversion (Romanized on non-Latin detection; English meaning on first user selection)
    useEffect(() => {
      if (!lyricsRecord || lyricsRecord.mode === 'empty' || isStandby) {
        setIsConverting(false);
        return;
      }

      const baseLines =
        lyricsRecord.mode === 'synced'
          ? lyricsRecord.syncedLines.map((l) => l.text)
          : lyricsRecord.plainLines;

      if (baseLines.length === 0) {
        setIsConverting(false);
        return;
      }

      const needsRomanized =
        languageMode === 'romanized' &&
        lyricsRecord.hasNonLatin &&
        !lyricsRecord.romanizedLines;

      const needsEnglishMeaning =
        languageMode === 'english_meaning' && !lyricsRecord.englishMeaningLines;

      if (!needsRomanized && !needsEnglishMeaning) {
        setIsConverting(false);
        setConversionError(false);
        return;
      }

      let cancelled = false;
      setIsConverting(true);
      setConversionError(false);

      const targetMode: LyricsDisplayLanguageMode = needsEnglishMeaning
        ? 'english_meaning'
        : 'romanized';

      const convertLyricsViaGemini = async () => {
        try {
          const res = await fetch('/api/lyrics/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trackId: lyricsRecord.trackId,
              mode: targetMode,
              lines: baseLines,
              title: track.title,
              artist: track.artist,
            }),
          });

          if (!res.ok) {
            throw new Error(`Conversion HTTP ${res.status}`);
          }

          const payload = (await res.json()) as { lines?: unknown };
          const aligned = alignConvertedLyricLines(baseLines, payload);
          if (!aligned) {
            throw new Error('Aligned line count mismatch');
          }

          if (cancelled) return;

          setLyricsRecord((prev) => {
            if (!prev || prev.trackId !== lyricsRecord.trackId) return prev;
            const updated: CachedTrackLyricsRecord = {
              ...prev,
              romanizedLines:
                targetMode === 'romanized' ? aligned : prev.romanizedLines,
              englishMeaningLines:
                targetMode === 'english_meaning' ? aligned : prev.englishMeaningLines,
            };
            writeCachedTrackLyrics(updated);
            return updated;
          });
          setIsConverting(false);
          setConversionError(false);
        } catch {
          if (cancelled) return;
          setIsConverting(false);
          setConversionError(true);
        }
      };

      convertLyricsViaGemini();
      return () => {
        cancelled = true;
      };
    }, [lyricsRecord, languageMode, isStandby, track.title, track.artist, retryTick]);

    // 3. Compute displayed lines while preserving exact line count & order
    const displayedSyncedLines = useMemo<SyncedLyricLine[]>(() => {
      if (!lyricsRecord || lyricsRecord.mode !== 'synced') return [];
      const activeTextArray =
        languageMode === 'english_meaning'
          ? lyricsRecord.englishMeaningLines || lyricsRecord.romanizedLines
          : lyricsRecord.romanizedLines;

      if (!activeTextArray || activeTextArray.length !== lyricsRecord.syncedLines.length) {
        return lyricsRecord.syncedLines;
      }

      return lyricsRecord.syncedLines.map((line, idx) => ({
        ...line,
        text: activeTextArray[idx] || line.text,
      }));
    }, [lyricsRecord, languageMode]);

    const displayedPlainLines = useMemo<string[]>(() => {
      if (!lyricsRecord || lyricsRecord.mode !== 'unsynced') return [];
      const activeTextArray =
        languageMode === 'english_meaning'
          ? lyricsRecord.englishMeaningLines || lyricsRecord.romanizedLines
          : lyricsRecord.romanizedLines;

      if (!activeTextArray || activeTextArray.length !== lyricsRecord.plainLines.length) {
        return lyricsRecord.plainLines;
      }
      return activeTextArray;
    }, [lyricsRecord, languageMode]);

    // 4. Advance Synced Lines Using 1Hz Playback Clock + Single Scheduled setTimeout (Stopped when Paused or Hidden)
    useEffect(() => {
      clearNextLineTimer();

      if (
        isStandby ||
        !lyricsRecord ||
        lyricsRecord.mode !== 'synced' ||
        lyricsRecord.syncedLines.length === 0
      ) {
        setActiveLyricIndex(0);
        return clearNextLineTimer;
      }

      const lines = lyricsRecord.syncedLines;

      const scheduleSingleNextLineTimeout = (currentIndex: number, referenceTimeSec: number) => {
        clearNextLineTimer();
        if (!isPlaying || isDocumentHidden) return;

        const delayMs = calculateNextLyricTimeoutMs(
          lines,
          currentIndex,
          referenceTimeSec,
          playbackRate
        );
        if (delayMs === null) return;

        if (delayMs <= 1250) {
          nextLineTimeoutRef.current = window.setTimeout(() => {
            nextLineTimeoutRef.current = null;
            if (!isPlaying || isDocumentHidden) return;

            const elapsedSinceSyncSec =
              ((performance.now() - lastClockSyncPerfRef.current) / 1000) *
              Math.max(0.5, playbackRate);
            const estimatedNowSec = lastClockSyncSecRef.current + elapsedSinceSyncSec;
            const nextIdx = getActiveLyricIndex(lines, estimatedNowSec);
            setActiveLyricIndex((prev) => (prev === nextIdx ? prev : nextIdx));
            scheduleSingleNextLineTimeout(nextIdx, estimatedNowSec);
          }, delayMs);
        }
      };

      const handleClockTick = () => {
        const nowSec = playbackClockStore.getCurrentTimeSec();
        lastClockSyncSecRef.current = nowSec;
        lastClockSyncPerfRef.current = performance.now();

        const nextIdx = getActiveLyricIndex(lines, nowSec);
        setActiveLyricIndex((prev) => (prev === nextIdx ? prev : nextIdx));
        scheduleSingleNextLineTimeout(nextIdx, nowSec);
      };

      handleClockTick();
      const unsubscribe = playbackClockStore.subscribeSecond(handleClockTick);

      return () => {
        unsubscribe();
        clearNextLineTimer();
      };
    }, [
      lyricsRecord,
      isStandby,
      isPlaying,
      isDocumentHidden,
      playbackRate,
      clearNextLineTimer,
    ]);

    // 5. Calculate Centered translateY Offset (400ms transition, zero scrollTop animation)
    const recomputeCenteredTranslateY = useCallback(() => {
      const viewportEl = syncedViewportRef.current;
      const activeBtn = lineButtonRefs.current.get(activeLyricIndex);
      if (!viewportEl || !activeBtn) return;

      if (viewportEl.scrollTop !== 0) {
        viewportEl.scrollTop = 0;
      }
      const viewportH = viewportEl.clientHeight;
      const lineTop = activeBtn.offsetTop;
      const lineH = activeBtn.offsetHeight;
      const nextY = calculateCenteredLyricTranslateY(viewportH, lineTop, lineH);
      setTranslateYpx((prev) => (prev === nextY ? prev : nextY));
    }, [activeLyricIndex]);

    useEffect(() => {
      recomputeCenteredTranslateY();
    }, [recomputeCenteredTranslateY, displayedSyncedLines, fontSizeStep]);

    useEffect(() => {
      const viewportEl = syncedViewportRef.current;
      if (!viewportEl || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        recomputeCenteredTranslateY();
      });
      observer.observe(viewportEl);
      return () => observer.disconnect();
    }, [recomputeCenteredTranslateY]);

    const handleStepFontSize = (delta: -1 | 1) => {
      triggerButtonHaptic(lowPowerMode);
      setFontSizeStep((prev) => {
        const next = stepLyricFontSize(prev, delta);
        try {
          window.localStorage.setItem(FONT_STEP_STORAGE_KEY, String(next));
        } catch {
          // ignore
        }
        return next;
      });
    };

    const handleRetryConversion = () => {
      triggerButtonHaptic(lowPowerMode);
      setConversionError(false);
      setRetryTick((t) => t + 1);
    };

    const fontClasses = getVfdFontSizeClasses(fontSizeStep);
    const totalSyncedCount = displayedSyncedLines.length;

    // Single-color phosphor palette (Amber phosphor in Night driving mode, Classic VFD Amber-Gold phosphor in standard mode)
    const phosphorBright = nightMode ? '#f59e0b' : '#fbbf24';
    const phosphorDim = nightMode ? 'rgba(245, 158, 11, 0.42)' : 'rgba(251, 191, 36, 0.44)';
    const phosphorFaint = nightMode ? 'rgba(245, 158, 11, 0.22)' : 'rgba(251, 191, 36, 0.22)';

    return (
      <div
        id="vinyl-lyrics-panel"
        aria-label="Console VFD Phosphor Lyrics Display"
        data-lyrics-mode={lyricsRecord?.mode || 'standby'}
        data-language-mode={languageMode}
        data-font-step={fontSizeStep}
        className={`panel-contain relative rounded-lg px-3.5 sm:px-4 py-[3px] overflow-hidden border border-[#d6c7b2]/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_10px_rgba(0,0,0,0.65)] flex flex-col justify-between ${className}`}
      >
        {/* Brushed Metal Bezel Texture */}
        <img
          src="/console/metal-plate.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-90"
        />

        {/* Four Visible Corner Mounting Screws Strictly on Outer Metal Bezel Outside Glass Window */}
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-30"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-30"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-30"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-30"
        />

        {/* Recessed Near-Black Phosphor Glass Window */}
        <div
          style={{
            backgroundColor: nightMode ? '#080502' : '#050705',
          }}
          className="relative z-10 flex-1 min-h-0 w-full rounded-md border border-black/90 shadow-[inset_0_3px_10px_rgba(0,0,0,0.95)] flex flex-col justify-between overflow-hidden px-2 py-[1px]"
        >
          {/* Static VFD Dot-Matrix Screen-Door Texture Overlay */}
          <div
            aria-hidden="true"
            className="vfd-screen-door pointer-events-none absolute inset-0 z-20"
          />

          {/* Faint Static Single-Color Phosphor Glass Glow */}
          <div
            aria-hidden="true"
            style={{
              background: `radial-gradient(ellipse at center, ${
                nightMode ? 'rgba(245, 158, 11, 0.08)' : 'rgba(251, 191, 36, 0.09)'
              } 0%, transparent 75%)`,
            }}
            className="pointer-events-none absolute inset-0 z-10"
          />

          {/* Top VFD Status & Micro-Switch Strip */}
          <div className="relative z-30 flex items-center justify-between gap-1 border-b border-amber-400/15 pb-[1px] shrink-0">
            <div className="flex items-center gap-1 min-w-0">
              <span
                style={{ color: phosphorDim }}
                className="hidden sm:inline font-mono text-[9px] uppercase tracking-widest font-bold shrink-0"
              >
                VFD·LYRICS
              </span>
              {!isStandby && totalSyncedCount > 0 && (
                <span
                  style={{ color: phosphorDim }}
                  className="font-mono text-[8.5px] sm:text-[9px] shrink-0"
                >
                  [{String(activeLyricIndex + 1).padStart(2, '0')}/{String(totalSyncedCount).padStart(2, '0')}]
                </span>
              )}
              {isConverting && !isStandby && (
                <span
                  id="lyrics-converting-badge"
                  role="status"
                  style={{ color: phosphorBright }}
                  className="font-mono text-[8.5px] sm:text-[9px] tracking-tight truncate"
                >
                  CONV…
                </span>
              )}
              {conversionError && !isStandby && (
                <button
                  id="lyrics-retry-btn"
                  type="button"
                  onClick={handleRetryConversion}
                  aria-label="Retry Lyrics Conversion"
                  style={{ color: phosphorBright }}
                  className="px-1 py-0 rounded border border-amber-400/40 bg-black/70 font-mono text-[8px] inline-flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  <RotateCcw strokeWidth={2} className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">RETRY</span>
                </button>
              )}
            </div>

            {/* Bezel Mode & Font Controls (Romanized / English meaning + A- / A+) */}
            <div className="flex items-center gap-1 shrink-0">
              <div
                role="group"
                aria-label="Lyrics Language Mode"
                className="flex items-center gap-0.5 bg-black/70 rounded px-0.5 py-0.5 border border-amber-400/20"
              >
                <button
                  id="lyrics-mode-romanized"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    setLanguageMode('romanized');
                  }}
                  aria-pressed={languageMode === 'romanized'}
                  data-pressed={languageMode === 'romanized' ? 'true' : 'false'}
                  style={
                    languageMode === 'romanized'
                      ? { backgroundColor: phosphorBright, color: '#090705' }
                      : { color: phosphorDim }
                  }
                  className="px-1 py-0 rounded text-[8px] font-mono font-bold uppercase tracking-tight cursor-pointer"
                >
                  <span className="sm:hidden">ROM</span>
                  <span className="hidden sm:inline">Romanized</span>
                </button>
                <button
                  id="lyrics-mode-english"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    setLanguageMode('english_meaning');
                  }}
                  aria-pressed={languageMode === 'english_meaning'}
                  data-pressed={languageMode === 'english_meaning' ? 'true' : 'false'}
                  style={
                    languageMode === 'english_meaning'
                      ? { backgroundColor: phosphorBright, color: '#090705' }
                      : { color: phosphorDim }
                  }
                  className="px-1 py-0 rounded text-[8px] font-mono font-bold uppercase tracking-tight cursor-pointer"
                >
                  <span className="sm:hidden">ENG</span>
                  <span className="hidden sm:inline">English meaning</span>
                </button>
              </div>

              <button
                id="lyrics-font-decrease"
                type="button"
                disabled={fontSizeStep <= 0}
                onClick={() => handleStepFontSize(-1)}
                aria-label="Decrease Lyrics Font Size"
                title="Decrease Font Size (A-)"
                style={{ color: phosphorBright }}
                className="min-w-[20px] h-[16px] px-1 rounded border border-amber-400/25 bg-black/70 disabled:opacity-35 font-mono text-[8px] font-bold flex items-center justify-center cursor-pointer"
              >
                A-
              </button>
              <button
                id="lyrics-font-increase"
                type="button"
                disabled={fontSizeStep >= 3}
                onClick={() => handleStepFontSize(1)}
                aria-label="Increase Lyrics Font Size"
                title="Increase Font Size (A+)"
                style={{ color: phosphorBright }}
                className="min-w-[20px] h-[16px] px-1 rounded border border-amber-400/25 bg-black/70 disabled:opacity-35 font-mono text-[8px] font-bold flex items-center justify-center cursor-pointer"
              >
                A+
              </button>
            </div>
          </div>

          {/* VFD Matrix Readout Area: Shows Current Lyric Line Bright & Next Line Dimmed */}
          {isStandby ? (
            <div className="relative z-30 flex-1 flex flex-col items-center justify-center text-center px-1.5 min-w-0">
              <p
                style={{ color: phosphorBright }}
                className="w-full truncate font-mono text-[8.5px] sm:text-[11px] font-bold tracking-wider uppercase leading-none vfd-phosphor-text"
              >
                STANDBY · CONNECT SPOTIFY TO LOAD LYRICS
              </p>
            </div>
          ) : isLoadingLrclib ? (
            <div className="relative z-30 flex-1 flex flex-col items-center justify-center text-center px-1.5 min-w-0">
              <p
                style={{ color: phosphorBright }}
                className="w-full truncate font-mono text-[9px] sm:text-[10px] tracking-wider uppercase leading-none vfd-phosphor-text"
              >
                SCANNING LRCLIB MATRIX…
              </p>
            </div>
          ) : !lyricsRecord || lyricsRecord.mode === 'empty' ? (
            <div
              id="lyrics-empty-state"
              className="relative z-30 flex-1 flex flex-col items-center justify-center text-center px-1.5 min-w-0"
            >
              <p
                style={{ color: phosphorDim }}
                className="w-full truncate font-mono text-[9px] sm:text-[10px] tracking-wide uppercase leading-none"
              >
                No lyrics available for this track
              </p>
            </div>
          ) : lyricsRecord.mode === 'unsynced' ? (
            <div
              id="lyrics-unsynced-scroll"
              className="relative z-30 flex-1 overflow-y-auto space-y-1 pr-1 min-h-0"
            >
              {displayedPlainLines.map((lineText, idx) => (
                <p
                  key={`plain-${idx}`}
                  style={{ color: phosphorBright }}
                  className={`px-1.5 py-0.5 font-mono ${fontClasses.plainClass}`}
                >
                  {lineText}
                </p>
              ))}
            </div>
          ) : (
            <div
              id="lyrics-synced-viewport"
              ref={syncedViewportRef}
              style={{ overflow: 'clip' }}
              className="relative z-30 flex-1 min-h-0"
            >
              <div
                id="lyrics-translate-track"
                ref={translateTrackRef}
                data-translate-y={translateYpx}
                style={{
                  transform: `translateY(${translateYpx}px)`,
                  transition:
                    prefersReducedMotion || lowPowerMode
                      ? 'none'
                      : 'transform 400ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                }}
                className="relative w-full flex flex-col gap-[1px] px-1"
              >
                {displayedSyncedLines.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const distance = Math.abs(idx - activeLyricIndex);
                  const isImmediateNeighbor = distance === 1;

                  return (
                    <button
                      key={`synced-${line.index}-${line.startTimeSec}`}
                      ref={(el) => {
                        if (el) {
                          lineButtonRefs.current.set(idx, el);
                        } else {
                          lineButtonRefs.current.delete(idx);
                        }
                      }}
                      type="button"
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        onSeek(line.startTimeSec);
                      }}
                      data-active-verse={isActive ? 'true' : 'false'}
                      data-line-index={idx}
                      data-start-sec={line.startTimeSec}
                      aria-current={isActive ? 'true' : undefined}
                      title={`${line.text} · Seek to ${formatDuration(line.startTimeSec)}`}
                      style={{
                        color: isActive
                          ? phosphorBright
                          : isImmediateNeighbor
                          ? phosphorDim
                          : phosphorFaint,
                      }}
                      className={`w-full text-center px-2 py-[1px] rounded font-mono tracking-wide truncate transition-opacity duration-300 cursor-pointer ${
                        isActive
                          ? `font-bold vfd-phosphor-text ${fontClasses.activeClass}`
                          : `font-normal ${fontClasses.neighborClass}`
                      }`}
                    >
                      {line.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
