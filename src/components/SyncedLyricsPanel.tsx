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
import { getStreamlineKaraokeWindow } from '../utils/streamlineLogic';
import { auroraHexToRgba, getAuroraWordRevealTokens } from '../utils/auroraLogic';
import type { ClickWheelGenerationId } from '../utils/clickWheelLogic';

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
  themeId?: string;
  clickWheelGen?: ClickWheelGenerationId;
  auroraPrimaryHex?: string;
  auroraSecondaryHex?: string;
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

const LYRICS_STORAGE_PREFIX = 'maxyoutify_track_lyrics_v2_';
const FONT_STEP_STORAGE_KEY = 'maxyoutify_lyrics_font_step_v1';
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
    themeId = 'retro-turntable',
    clickWheelGen = 'gen3',
    auroraPrimaryHex = '#4DE1FF',
    auroraSecondaryHex = '#9D7CFF',
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

    const isReelTheme = themeId === 'reel-to-reel';
    const isCassetteTheme = themeId === 'cassette-deck';
    const isCdHifiTheme = themeId === 'cd-hifi';
    const isClickWheelTheme = themeId === 'click-wheel';
    const isCwGen1 = isClickWheelTheme && clickWheelGen === 'gen1';
    const isCwGen2 = isClickWheelTheme && clickWheelGen === 'gen2';
    const isCwMonoLcd = isCwGen1 || isCwGen2;
    const isSquircleTheme = themeId === 'squircle-pmp';
    const isDesktop98Theme = themeId === 'desktop-98';
    const isStreamlineTheme = themeId === 'streamline';
    const isAuroraTheme = themeId === 'aurora-deck';
    const streamlineKaraokeWindow = useMemo(
      () =>
        isStreamlineTheme
          ? getStreamlineKaraokeWindow(displayedSyncedLines.length, activeLyricIndex)
          : null,
      [isStreamlineTheme, displayedSyncedLines.length, activeLyricIndex]
    );
    const phosphorBright = isAuroraTheme
      ? '#EAF2FF'
      : isCdHifiTheme
      ? '#00F0FF'
      : isStreamlineTheme
      ? '#FFFFFF'
      : isDesktop98Theme
        ? '#00E36D'
        : isSquircleTheme
          ? '#FFFFFF'
          : isCwGen1
            ? '#161F13'
            : isCwGen2
              ? '#122033'
              : isClickWheelTheme
                ? '#1D1D1F'
                : isCassetteTheme
                  ? '#F4F7FA'
                  : isReelTheme
                    ? '#fff7eb'
                    : nightMode
                      ? '#f59e0b'
                      : '#fbbf24';
    const phosphorDim = isAuroraTheme
      ? '#8E9AB8'
      : isCdHifiTheme
      ? '#FFB020'
      : isStreamlineTheme
      ? '#5E6673'
      : isDesktop98Theme
        ? '#00C853'
        : isSquircleTheme
          ? '#9B938B'
          : isCwGen1
            ? '#3F4D37'
            : isCwGen2
              ? '#3B5270'
              : isClickWheelTheme
                ? '#6E6E73'
                : isCassetteTheme
                  ? 'rgba(216, 224, 234, 0.72)'
                  : isReelTheme
                    ? 'rgba(43, 25, 11, 0.72)'
                    : nightMode
                      ? 'rgba(245, 158, 11, 0.42)'
                      : 'rgba(251, 191, 36, 0.44)';
    const phosphorFaint = isAuroraTheme
      ? 'rgba(142, 154, 184, 0.52)'
      : isCdHifiTheme
      ? 'rgba(0, 240, 255, 0.35)'
      : isStreamlineTheme
      ? '#5E6673'
      : isDesktop98Theme
        ? 'rgba(0, 200, 83, 0.48)'
        : isSquircleTheme
          ? '#55503C'
          : isCwGen1
            ? '#59694E'
            : isCwGen2
              ? '#647D9C'
              : isClickWheelTheme
                ? '#B0B4BC'
                : isCassetteTheme
                  ? 'rgba(176, 188, 204, 0.42)'
                  : isReelTheme
                    ? 'rgba(43, 25, 11, 0.42)'
                    : nightMode
                      ? 'rgba(245, 158, 11, 0.22)'
                      : 'rgba(251, 191, 36, 0.22)';

    const cwLcdBg = isCwGen1 ? 'transparent' : isCwGen2 ? 'transparent' : '#FAFAFA';
    const cwBorderClass = isCwGen1
      ? 'border-b border-[#7D8B74] pb-1 mb-0.5'
      : isCwGen2
        ? 'border-b border-[#9EB1C9] pb-1 mb-0.5'
        : 'border-b border-[#E2E4E8] pb-1 mb-0.5';
    const cwAccentBgHex = isCwGen1 ? '#161F13' : isCwGen2 ? '#1F3452' : '#3478F6';
    const cwAccentTextHex = isCwGen1 ? '#C7D4B6' : isCwGen2 ? '#E8F1FC' : '#FFFFFF';
    const cwSubTextHex = isCwGen1 ? '#3F4D37' : isCwGen2 ? '#3B5270' : '#6E6E73';
    const cwControlSurfaceClass = isCwGen1
      ? 'bg-[#B4C3A2] border-[#7D8B74]'
      : isCwGen2
        ? 'bg-[#D2E1F4] border-[#9EB1C9]'
        : 'bg-[#F4F5F7] border-[#D8DADE]';
    const cwTypographyClass = isCwMonoLcd ? "font-['Silkscreen',monospace] tracking-tight" : 'font-sans';

    return (
      <div
        id="vinyl-lyrics-panel"
        aria-label={
          isAuroraTheme
            ? 'Aurora Deck Holographic Lyrics Field'
            : isCdHifiTheme
            ? 'Sony Hi-Fi VFD Cyan Matrix Lyrics Readout'
            : isStreamlineTheme
            ? 'Streamline Karaoke Lyrics Display'
            : isDesktop98Theme
              ? "'98 Desktop Player Lyrics Window"
              : isSquircleTheme
                ? 'Squircle PMP OLED Lyrics Screen'
                : isClickWheelTheme
                  ? 'Click Wheel Screen Lyrics View'
                  : isCassetteTheme
                    ? 'WTB-732 Monochrome Silver LCD Lyrics Strip'
                    : isReelTheme
                      ? 'Backlit Amber Glass Lyrics Window'
                      : 'Console VFD Phosphor Lyrics Display'
        }
        data-lyrics-mode={lyricsRecord?.mode || 'standby'}
        data-language-mode={languageMode}
        data-font-step={fontSizeStep}
        className={`panel-contain relative overflow-hidden flex flex-col justify-between ${
          isAuroraTheme
            ? 'rounded-[14px] bg-white/[0.04] border border-white/[0.12] backdrop-blur-md px-2.5 py-1'
            : isCdHifiTheme
            ? 'cd-vfd-window rounded-[6px] border border-[#334155] px-2 py-0.5'
            : isStreamlineTheme
            ? 'bg-transparent border-0 rounded-none px-1 py-0'
            : isDesktop98Theme
              ? 'bg-[#000D06] border-0 rounded-none px-1.5 py-0.5'
              : isSquircleTheme
                ? 'bg-[#0B0A0A] border-0 rounded-none px-2 py-1'
                : isClickWheelTheme
                  ? `${isCwMonoLcd ? 'bg-transparent' : 'bg-[#FAFAFA]'} border-0 rounded-none px-1.5 py-0.5`
                  : isCassetteTheme
                    ? 'cas-brushed-steel border border-[#6E7278] !px-2 !py-[2px] !rounded-none rounded-none max-h-[46px] mx-auto'
                    : `rounded-lg px-3.5 sm:px-4 py-[3px] ${
                        isReelTheme
                          ? 'r2r-aluminum-fascia border border-[#8a8e92]'
                          : 'border border-[#d6c7b2]/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_10px_rgba(0,0,0,0.65)]'
                      }`
        } ${className}`}
      >
        {/* Brushed Metal Bezel Texture */}
        {!isAuroraTheme && !isCdHifiTheme && !isReelTheme && !isCassetteTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isStreamlineTheme && (
          <img
            src="/console/metal-plate.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-90"
          />
        )}

        {/* Four Visible Corner Mounting Screws Strictly on Outer Metal Bezel Outside Glass Window (Retro Turntable & Reel-to-Reel only) */}
        {!isAuroraTheme && !isCdHifiTheme && !isCassetteTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isStreamlineTheme && (
          <>
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
          </>
        )}

        {/* Recessed Window */}
        <div
          style={{
            backgroundColor: isAuroraTheme || isStreamlineTheme || isCdHifiTheme
              ? 'transparent'
              : isDesktop98Theme
                ? '#000D06'
                : isSquircleTheme
                  ? '#0B0A0A'
                  : isClickWheelTheme
                    ? cwLcdBg
                    : isCassetteTheme
                      ? '#101215'
                      : isReelTheme
                        ? '#b56217'
                        : nightMode
                          ? '#080502'
                          : '#050705',
          }}
          className={`relative z-10 flex-1 min-h-0 w-full flex ${
            isCassetteTheme ? 'flex-row items-center justify-center gap-2' : 'flex-col justify-between'
          } overflow-hidden ${
            isAuroraTheme || isStreamlineTheme || isCdHifiTheme
              ? 'px-0 py-0 border-0 rounded-none'
              : isDesktop98Theme
                ? 'px-1 py-0.5 border-0 rounded-none'
                : isSquircleTheme
                  ? 'px-1 py-0.5 border-0 rounded-none'
                  : isClickWheelTheme
                    ? 'px-1 py-0.5 border-0 rounded-none'
                    : isCassetteTheme
                      ? 'cas-80s-lyrics-bezel !rounded-none rounded-none px-3 py-0.5'
                      : `rounded-md border px-2 py-[1px] ${
                          isReelTheme
                            ? 'r2r-backlit-amber border-[#5c3614]/85'
                            : 'border-black/90 shadow-[inset_0_3px_10px_rgba(0,0,0,0.95)]'
                        }`
          }`}
        >
          {/* Texture Overlay */}
          {isAuroraTheme || isClickWheelTheme || isSquircleTheme || isDesktop98Theme || isStreamlineTheme ? null : isCassetteTheme ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20"
              style={{
                background:
                  'linear-gradient(125deg, rgba(255,255,255,0.09) 0%, transparent 45%, rgba(0,0,0,0.28) 100%)',
              }}
            />
          ) : isReelTheme ? (
            <div
              aria-hidden="true"
              className="r2r-glass-reflection pointer-events-none absolute inset-0 z-20"
            />
          ) : (
            <div
              aria-hidden="true"
              className="vfd-screen-door pointer-events-none absolute inset-0 z-20"
            />
          )}

          {/* Faint Static Glow */}
          {!isAuroraTheme && !isClickWheelTheme && !isSquircleTheme && !isDesktop98Theme && !isStreamlineTheme && (
            <div
              aria-hidden="true"
              style={{
                background: isCassetteTheme
                  ? 'radial-gradient(ellipse at center, rgba(216, 228, 244, 0.14) 0%, transparent 76%)'
                  : isReelTheme
                    ? 'radial-gradient(ellipse at center, rgba(255, 224, 175, 0.22) 0%, transparent 74%)'
                    : `radial-gradient(ellipse at center, ${
                        nightMode ? 'rgba(245, 158, 11, 0.08)' : 'rgba(251, 191, 36, 0.09)'
                      } 0%, transparent 75%)`,
              }}
              className="pointer-events-none absolute inset-0 z-10"
            />
          )}

          {/* Top Status & Micro-Switch Strip */}
          <div
            className={`relative z-30 flex items-center justify-between gap-1 ${
              isAuroraTheme
                ? 'border-b border-white/[0.1] pb-1 mb-0.5'
                : isStreamlineTheme
                ? 'border-b border-white/[0.06] pb-1 mb-0.5'
                : isSquircleTheme
                  ? 'border-b border-[#55503C]/55 pb-1 mb-0.5'
                  : isClickWheelTheme
                    ? cwBorderClass
                    : isCassetteTheme
                      ? 'order-last border-l border-white/20 pl-2 ml-1 shrink-0'
                      : isReelTheme
                        ? 'border-b border-[#5a3210]/30 pb-[1px]'
                        : 'border-b border-amber-400/15 pb-[1px]'
            } shrink-0`}
          >
            {isCassetteTheme && (
              <span
                style={{ color: phosphorDim }}
                className="hidden md:inline font-['VT323',monospace] text-[12px] tracking-[0.12em] uppercase font-bold shrink-0 mr-1"
              >
                80S·SYNC
              </span>
            )}
            <div className={`${isCassetteTheme ? 'hidden' : 'flex'} items-center gap-1 min-w-0`}>
              <span
                style={{ color: isAuroraTheme ? auroraPrimaryHex : phosphorDim }}
                className={`${
                  isAuroraTheme
                    ? 'font-mono font-extralight text-[9.5px] tracking-[0.14em]'
                    : isStreamlineTheme
                    ? 'font-sans text-[10px] tracking-[0.06em]'
                    : isSquircleTheme
                      ? 'font-sans text-[8.5px] tracking-[0.14em]'
                      : isClickWheelTheme
                        ? `${cwTypographyClass} text-[10px] tracking-wider`
                        : 'hidden sm:inline font-mono text-[9px] tracking-wider'
                } uppercase font-semibold shrink-0`}
              >
                {isAuroraTheme
                  ? 'LYRIC·FIELD'
                  : isStreamlineTheme
                  ? 'Lyrics'
                  : isSquircleTheme
                    ? 'LYRICS'
                    : isClickWheelTheme
                      ? 'Lyrics'
                      : isCassetteTheme
                        ? 'LCD·LYRICS'
                        : isReelTheme
                          ? 'LYRICS WINDOW'
                          : 'VFD·LYRICS'}
              </span>
              {!isStandby && totalSyncedCount > 0 && (
                <span
                  style={{
                    color: isAuroraTheme
                      ? '#EAF2FF'
                      : isStreamlineTheme
                      ? '#19C6A3'
                      : isSquircleTheme
                        ? '#F26A1B'
                        : phosphorDim,
                  }}
                  className={`${
                    isAuroraTheme
                      ? 'font-mono font-extralight text-[9.5px] tabular-nums'
                      : isStreamlineTheme
                      ? 'font-sans text-[10px] tabular-nums font-medium'
                      : isSquircleTheme
                        ? 'font-sans text-[8.5px] tabular-nums'
                        : isClickWheelTheme
                          ? 'font-sans text-[9.5px] tabular-nums'
                          : 'font-mono text-[8.5px] sm:text-[9px]'
                  } shrink-0`}
                >
                  {isAuroraTheme || isStreamlineTheme || isClickWheelTheme || isSquircleTheme
                    ? `${activeLyricIndex + 1}/${totalSyncedCount}`
                    : `[${String(activeLyricIndex + 1).padStart(2, '0')}/${String(totalSyncedCount).padStart(2, '0')}]`}
                </span>
              )}
              {isConverting && !isStandby && (
                <span
                  id="lyrics-converting-badge"
                  role="status"
                  style={{
                    color: isAuroraTheme
                      ? auroraPrimaryHex
                      : isStreamlineTheme
                      ? '#19C6A3'
                      : isSquircleTheme
                        ? '#E6007E'
                        : isClickWheelTheme
                          ? '#2B5FD9'
                          : phosphorBright,
                  }}
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
                  style={{
                    color: isAuroraTheme
                      ? auroraPrimaryHex
                      : isStreamlineTheme
                      ? '#19C6A3'
                      : isSquircleTheme
                        ? '#E6007E'
                        : isClickWheelTheme
                          ? '#2B5FD9'
                          : phosphorBright,
                  }}
                  className={`px-1 py-0 rounded border font-mono text-[8px] inline-flex items-center gap-0.5 cursor-pointer shrink-0 ${
                    isAuroraTheme
                      ? 'border-white/20 bg-white/[0.06]'
                      : isStreamlineTheme
                      ? 'border-[#19C6A3]/45 bg-[#161A20]'
                      : isSquircleTheme
                        ? 'border-[#E6007E]/60 bg-[#0B0A0A]'
                        : isClickWheelTheme
                          ? 'border-[#3478F6]/50 bg-[#F4F5F7]'
                          : 'border-emerald-400/40 bg-black/70'
                  }`}
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
                className={`flex items-center gap-0.5 rounded px-0.5 py-0.5 border ${
                  isAuroraTheme
                    ? 'bg-white/[0.06] border-white/[0.14]'
                    : isStreamlineTheme
                    ? 'bg-[#161A20]/70 border-white/[0.08]'
                    : isSquircleTheme
                      ? 'bg-[#171411] border-[#55503C]'
                      : isClickWheelTheme
                        ? cwControlSurfaceClass
                        : isCassetteTheme
                          ? 'bg-[#CFD4DC] border-[#787D84] rounded-none'
                          : isReelTheme
                            ? 'bg-[#221409]/90 border-[#5e3819]'
                            : 'bg-black/70 border-amber-400/20'
                }`}
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
                      ? {
                          backgroundColor: isAuroraTheme
                            ? auroraPrimaryHex
                            : isStreamlineTheme
                            ? '#19C6A3'
                            : isSquircleTheme
                              ? '#E6007E'
                              : isClickWheelTheme
                                ? cwAccentBgHex
                                : isCassetteTheme
                                  ? '#141516'
                                  : isReelTheme
                                    ? '#EFE9DC'
                                    : phosphorBright,
                          color: isAuroraTheme
                            ? '#06070C'
                            : isStreamlineTheme
                            ? '#0F1115'
                            : isSquircleTheme
                              ? '#FFFFFF'
                              : isClickWheelTheme
                                ? cwAccentTextHex
                                : isCassetteTheme
                                  ? '#E8EBF0'
                                  : '#08120c',
                        }
                      : {
                          color: isAuroraTheme
                            ? '#8E9AB8'
                            : isStreamlineTheme
                            ? '#A7AFBC'
                            : isSquircleTheme
                              ? '#9B938B'
                              : isClickWheelTheme
                                ? cwSubTextHex
                                : isCassetteTheme
                                  ? '#141516'
                                  : isReelTheme
                                    ? '#fde6c4'
                                    : phosphorDim,
                        }
                  }
                  className={`px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wider cursor-pointer ${
                    isClickWheelTheme
                      ? cwTypographyClass
                      : isAuroraTheme || isStreamlineTheme || isSquircleTheme
                        ? 'font-sans'
                        : 'font-mono'
                  }`}
                >
                  <span
                    className={
                      isAuroraTheme || isStreamlineTheme || isClickWheelTheme || isSquircleTheme ? '' : 'sm:hidden'
                    }
                  >
                    ROM
                  </span>
                  {!isAuroraTheme && !isStreamlineTheme && !isClickWheelTheme && !isSquircleTheme && (
                    <span className="hidden sm:inline">Romanized</span>
                  )}
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
                      ? {
                          backgroundColor: isAuroraTheme
                            ? auroraPrimaryHex
                            : isStreamlineTheme
                            ? '#19C6A3'
                            : isSquircleTheme
                              ? '#E6007E'
                              : isClickWheelTheme
                                ? cwAccentBgHex
                                : isCassetteTheme
                                  ? '#141516'
                                  : isReelTheme
                                    ? '#EFE9DC'
                                    : phosphorBright,
                          color: isAuroraTheme
                            ? '#06070C'
                            : isStreamlineTheme
                            ? '#0F1115'
                            : isSquircleTheme
                              ? '#FFFFFF'
                              : isClickWheelTheme
                                ? cwAccentTextHex
                                : isCassetteTheme
                                  ? '#E8EBF0'
                                  : '#08120c',
                        }
                      : {
                          color: isAuroraTheme
                            ? '#8E9AB8'
                            : isStreamlineTheme
                            ? '#A7AFBC'
                            : isSquircleTheme
                              ? '#9B938B'
                              : isClickWheelTheme
                                ? cwSubTextHex
                                : isCassetteTheme
                                  ? '#141516'
                                  : isReelTheme
                                    ? '#fde6c4'
                                    : phosphorDim,
                        }
                  }
                  className={`px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wider cursor-pointer ${
                    isClickWheelTheme
                      ? cwTypographyClass
                      : isAuroraTheme || isStreamlineTheme || isSquircleTheme
                        ? 'font-sans'
                        : 'font-mono'
                  }`}
                >
                  <span
                    className={
                      isAuroraTheme || isStreamlineTheme || isClickWheelTheme || isSquircleTheme ? '' : 'sm:hidden'
                    }
                  >
                    ENG
                  </span>
                  {!isAuroraTheme && !isStreamlineTheme && !isClickWheelTheme && !isSquircleTheme && (
                    <span className="hidden sm:inline">English meaning</span>
                  )}
                </button>
              </div>

              <button
                id="lyrics-font-decrease"
                type="button"
                disabled={fontSizeStep <= 0}
                onClick={() => handleStepFontSize(-1)}
                aria-label="Decrease Lyrics Font Size"
                title="Decrease Font Size (A-)"
                style={{
                  color: isAuroraTheme
                    ? '#EAF2FF'
                    : isStreamlineTheme
                    ? '#A7AFBC'
                    : isSquircleTheme
                      ? '#FFFFFF'
                      : isClickWheelTheme
                        ? phosphorBright
                        : isReelTheme
                          ? '#EFE9DC'
                          : phosphorBright,
                }}
                className={`min-w-[20px] h-[16px] px-1 rounded border disabled:opacity-35 text-[8px] font-bold flex items-center justify-center cursor-pointer ${
                  isAuroraTheme
                    ? 'font-mono border-white/[0.14] bg-white/[0.06]'
                    : isStreamlineTheme
                    ? 'font-sans border-white/[0.08] bg-[#161A20]/70 hover:text-white'
                    : isSquircleTheme
                      ? 'font-sans border-[#55503C] bg-[#171411]'
                      : isClickWheelTheme
                        ? `${cwTypographyClass} ${cwControlSurfaceClass}`
                        : isCassetteTheme
                          ? 'font-mono border-[#787D84] bg-[#CFD4DC] rounded-none'
                          : isReelTheme
                            ? 'font-mono border-[#5e3819] bg-[#221409]/90'
                            : 'font-mono border-amber-400/25 bg-black/70'
                }`}
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
                style={{
                  color: isAuroraTheme
                    ? '#EAF2FF'
                    : isStreamlineTheme
                    ? '#A7AFBC'
                    : isSquircleTheme
                      ? '#FFFFFF'
                      : isClickWheelTheme
                        ? phosphorBright
                        : isReelTheme
                          ? '#EFE9DC'
                          : phosphorBright,
                }}
                className={`min-w-[20px] h-[16px] px-1 rounded border disabled:opacity-35 text-[8px] font-bold flex items-center justify-center cursor-pointer ${
                  isAuroraTheme
                    ? 'font-mono border-white/[0.14] bg-white/[0.06]'
                    : isStreamlineTheme
                    ? 'font-sans border-white/[0.08] bg-[#161A20]/70 hover:text-white'
                    : isSquircleTheme
                      ? 'font-sans border-[#55503C] bg-[#171411]'
                      : isClickWheelTheme
                        ? `${cwTypographyClass} ${cwControlSurfaceClass}`
                        : isCassetteTheme
                          ? 'font-mono border-[#787D84] bg-[#CFD4DC] rounded-none'
                          : isReelTheme
                            ? 'font-mono border-[#5e3819] bg-[#221409]/90'
                            : 'font-mono border-amber-400/25 bg-black/70'
                }`}
              >
                A+
              </button>
            </div>
          </div>

          {/* Readout Area */}
          {isStandby ? (
            <div className="relative z-30 flex-1 flex flex-col items-center justify-center text-center px-1.5 min-w-0">
              <p
                style={{
                  color: isAuroraTheme
                    ? '#8E9AB8'
                    : isStreamlineTheme
                    ? '#5E6673'
                    : isSquircleTheme
                      ? '#9B938B'
                      : isClickWheelTheme
                        ? cwSubTextHex
                        : isReelTheme
                          ? '#2b190b'
                          : phosphorBright,
                }}
                className={`w-full truncate ${
                  isAuroraTheme
                    ? 'font-display font-light text-[12px] sm:text-[13px] tracking-[0.06em]'
                    : isStreamlineTheme
                    ? 'font-sans text-[14px] sm:text-[15px] font-medium'
                    : isSquircleTheme
                      ? 'font-sans text-[12px] font-light lowercase tracking-tight'
                      : isClickWheelTheme
                        ? `${cwTypographyClass} text-[11px] font-medium`
                        : isCassetteTheme
                          ? 'cas-80s-lyrics-text font-bold leading-none text-center'
                          : `font-mono text-[8.5px] sm:text-[11px] font-bold tracking-wider uppercase leading-none ${
                              isReelTheme ? '' : 'vfd-phosphor-text'
                            }`
                }`}
              >
                {isAuroraTheme
                  ? 'Select a track to materialize lyrics'
                  : isStreamlineTheme
                  ? 'Select a track to follow live synced lyrics'
                  : isSquircleTheme
                    ? 'connect spotify to load lyrics'
                    : isClickWheelTheme
                      ? 'Connect Spotify to view lyrics'
                      : 'STANDBY · CONNECT SPOTIFY TO LOAD LYRICS'}
              </p>
            </div>
          ) : isLoadingLrclib ? (
            <div className="relative z-30 flex-1 flex flex-col items-center justify-center text-center px-1.5 min-w-0">
              <p
                style={{
                  color: isAuroraTheme
                    ? auroraPrimaryHex
                    : isStreamlineTheme
                    ? '#19C6A3'
                    : isSquircleTheme
                      ? '#E6007E'
                      : isClickWheelTheme
                        ? cwAccentBgHex
                        : isReelTheme
                          ? '#2b190b'
                          : phosphorBright,
                }}
                className={`w-full truncate ${
                  isAuroraTheme
                    ? 'font-display font-light text-[12px] tracking-[0.06em]'
                    : isStreamlineTheme
                    ? 'font-sans text-[14px] font-medium'
                    : isSquircleTheme
                      ? 'font-sans text-[12px] font-light lowercase tracking-tight'
                      : isClickWheelTheme
                        ? `${cwTypographyClass} text-[11px] font-medium`
                        : `font-mono text-[9px] sm:text-[10px] tracking-wider uppercase leading-none ${
                            isCassetteTheme
                              ? 'cas-lcd-text font-bold'
                              : isReelTheme
                                ? 'font-bold'
                                : 'vfd-phosphor-text'
                          }`
                }`}
              >
                {isAuroraTheme
                  ? 'Calibrating holographic lyric stream…'
                  : isStreamlineTheme
                  ? 'Loading synced lyrics…'
                  : isSquircleTheme
                    ? 'loading lyrics...'
                    : isClickWheelTheme
                      ? 'Loading lyrics…'
                      : 'SCANNING LRCLIB MATRIX…'}
              </p>
            </div>
          ) : !lyricsRecord || lyricsRecord.mode === 'empty' ? (
            <div
              id="lyrics-empty-state"
              className="relative z-30 flex-1 flex flex-col items-center justify-center text-center px-1.5 min-w-0"
            >
              <p
                style={{
                  color: isAuroraTheme
                    ? '#8E9AB8'
                    : isStreamlineTheme
                    ? '#5E6673'
                    : isSquircleTheme
                      ? '#9B938B'
                      : isClickWheelTheme
                        ? cwSubTextHex
                        : isReelTheme
                          ? 'rgba(43, 25, 11, 0.78)'
                          : phosphorDim,
                }}
                className={`w-full truncate ${
                  isAuroraTheme
                    ? 'font-display font-light text-[12px] tracking-[0.06em]'
                    : isStreamlineTheme
                    ? 'font-sans text-[14px] font-medium'
                    : isSquircleTheme
                      ? 'font-sans text-[12px] font-light lowercase tracking-tight'
                      : isClickWheelTheme
                        ? `${cwTypographyClass} text-[11px] font-medium`
                        : 'font-mono text-[9px] sm:text-[10px] tracking-wide uppercase leading-none'
                }`}
              >
                {isSquircleTheme ? 'no lyrics available' : 'No lyrics available for this track'}
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
                  style={{
                    color: isAuroraTheme
                      ? '#EAF2FF'
                      : isStreamlineTheme
                      ? '#FFFFFF'
                      : isSquircleTheme
                        ? '#FFFFFF'
                        : isClickWheelTheme
                          ? phosphorBright
                          : isReelTheme
                            ? '#1f1208'
                            : phosphorBright,
                  }}
                  className={`px-1.5 py-0.5 ${
                    isAuroraTheme
                      ? 'font-display text-center font-light text-[13px] tracking-[0.04em] leading-snug'
                      : isStreamlineTheme
                      ? 'font-sans text-center text-[15px] font-medium leading-snug'
                      : isSquircleTheme
                        ? 'font-sans text-left lowercase font-light leading-snug'
                        : isClickWheelTheme
                          ? `${cwTypographyClass} text-left leading-snug`
                          : `font-mono ${isCassetteTheme ? 'cas-lcd-text' : ''}`
                  } ${isAuroraTheme || isStreamlineTheme ? '' : fontClasses.plainClass}`}
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
                      : isStreamlineTheme
                        ? 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)'
                        : isCassetteTheme
                          ? 'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)'
                          : 'transform 400ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                }}
                className="relative w-full flex flex-col gap-[2px] px-1"
              >
                {displayedSyncedLines.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const distance = Math.abs(idx - activeLyricIndex);
                  const isImmediateNeighbor = distance === 1;
                  const isInStreamlineWindow =
                    !isStreamlineTheme ||
                    (streamlineKaraokeWindow
                      ? streamlineKaraokeWindow.visibleIndices.includes(idx)
                      : distance <= 1);

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
                      data-karaoke-visible={isInStreamlineWindow ? 'true' : 'false'}
                      aria-current={isActive ? 'true' : undefined}
                      title={`${line.text} · Seek to ${formatDuration(line.startTimeSec)}`}
                      style={{
                        opacity: isStreamlineTheme
                          ? isInStreamlineWindow
                            ? 1
                            : 0
                          : isAuroraTheme
                            ? isActive
                              ? 1
                              : idx < activeLyricIndex
                                ? 0.45
                                : 0.72
                            : undefined,
                        transform: isAuroraTheme && idx < activeLyricIndex ? 'scale(0.94)' : undefined,
                        textShadow:
                          isAuroraTheme && isActive
                            ? `0 0 12px ${auroraHexToRgba(auroraPrimaryHex, 0.35)}`
                            : undefined,
                        pointerEvents: isStreamlineTheme && !isInStreamlineWindow ? 'none' : undefined,
                        backgroundColor:
                          isDesktop98Theme && isActive
                            ? '#00E36D'
                            : isCwMonoLcd && isActive
                              ? cwAccentBgHex
                              : undefined,
                        color: isAuroraTheme
                          ? isActive
                            ? '#EAF2FF'
                            : '#8E9AB8'
                          : isStreamlineTheme
                          ? isActive
                            ? '#FFFFFF'
                            : '#5E6673'
                          : isDesktop98Theme
                            ? isActive
                              ? '#000D06'
                              : '#00C853'
                            : isSquircleTheme
                              ? isActive
                                ? '#FFFFFF'
                                : isImmediateNeighbor
                                  ? '#9B938B'
                                  : '#55503C'
                              : isCwMonoLcd
                                ? isActive
                                  ? cwAccentTextHex
                                  : isImmediateNeighbor
                                    ? phosphorDim
                                    : phosphorFaint
                                : isClickWheelTheme
                                  ? isActive
                                    ? '#1D1D1F'
                                    : isImmediateNeighbor
                                      ? '#6E6E73'
                                      : '#B0B4BC'
                                  : isReelTheme
                                    ? isActive
                                      ? '#1f1208'
                                      : isImmediateNeighbor
                                        ? 'rgba(43, 25, 11, 0.72)'
                                        : 'rgba(43, 25, 11, 0.4)'
                                    : isActive
                                      ? phosphorBright
                                      : isImmediateNeighbor
                                        ? phosphorDim
                                        : phosphorFaint,
                      }}
                      className={`w-full ${
                        isAuroraTheme
                          ? 'text-center px-2 py-[2px] rounded font-display tracking-[0.04em] transition-[transform,opacity,color] duration-200'
                          : isStreamlineTheme
                          ? 'text-center px-2 py-[2px] rounded font-sans tracking-tight transition-[color,opacity] duration-200'
                          : isDesktop98Theme
                            ? 'text-left px-2 py-[1px] rounded-none font-mono tracking-normal'
                            : isSquircleTheme
                              ? `text-left px-2 py-[2px] border-l-2 ${
                                  isActive ? 'border-[#E6007E]' : 'border-transparent'
                                } lowercase font-sans tracking-tight transition-colors duration-200`
                              : isClickWheelTheme
                                ? `text-center px-2 py-[1px] rounded-none ${cwTypographyClass} tracking-normal transition-colors duration-200`
                                : `text-center px-2 py-[1px] rounded font-mono tracking-wide ${
                                    isCassetteTheme
                                      ? 'transition-[opacity,color] duration-500'
                                      : 'transition-opacity duration-300'
                                  }`
                      } truncate cursor-pointer ${
                        isActive
                          ? `${
                              isAuroraTheme
                                ? 'font-light text-[14px] sm:text-[16px] leading-snug'
                                : isStreamlineTheme
                                ? 'font-bold text-[18px] sm:text-[22px] leading-tight'
                                : isDesktop98Theme
                                  ? 'font-bold text-[14px] leading-tight'
                                  : isSquircleTheme
                                    ? 'font-bold text-[14px] leading-tight'
                                    : isClickWheelTheme
                                      ? 'font-bold'
                                      : isCassetteTheme
                                        ? 'font-bold cas-80s-lyrics-text !text-[20px] sm:!text-[24px] leading-none'
                                        : isReelTheme
                                          ? 'font-bold'
                                          : 'font-bold vfd-phosphor-text'
                            } ${isAuroraTheme || isStreamlineTheme || isSquircleTheme || isDesktop98Theme || isCassetteTheme ? '' : fontClasses.activeClass}`
                          : `${
                              isAuroraTheme
                                ? 'font-light text-[11px] sm:text-[12px] leading-snug'
                                : isStreamlineTheme
                                ? 'font-medium text-[13.5px] sm:text-[15px] leading-snug'
                                : isDesktop98Theme
                                  ? 'font-normal text-[13px]'
                                  : isSquircleTheme
                                    ? 'font-light text-[11px]'
                                    : isCassetteTheme
                                      ? "font-['VT323','Barlow_Condensed',monospace] text-[15px] sm:text-[17px] uppercase tracking-wider leading-none"
                                      : 'font-normal'
                            } ${isAuroraTheme || isStreamlineTheme || isSquircleTheme || isDesktop98Theme || isCassetteTheme ? '' : fontClasses.neighborClass}`
                      }`}
                    >
                      {isAuroraTheme && isActive
                        ? getAuroraWordRevealTokens(
                            line.text,
                            prefersReducedMotion || lowPowerMode || !isPlaying || isDocumentHidden
                          ).map((tok) => (
                            <span
                              key={`${idx}-w-${tok.index}`}
                              data-aurora-word-index={tok.index}
                              style={
                                prefersReducedMotion || lowPowerMode || !isPlaying || isDocumentHidden
                                  ? undefined
                                  : { animationDelay: `${tok.delayMs}ms` }
                              }
                              className={`${
                                prefersReducedMotion || lowPowerMode || !isPlaying || isDocumentHidden
                                  ? ''
                                  : 'aurora-word-reveal'
                              } mr-[0.28em] last:mr-0`}
                            >
                              {tok.word}
                            </span>
                          ))
                        : line.text}
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
