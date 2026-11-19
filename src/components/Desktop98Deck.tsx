import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Disc3,
  Zap,
} from 'lucide-react';
import {
  formatDuration,
  triggerButtonHaptic,
  resolveActiveArtworkState,
  formatConsoleClockAndDate,
  type TrackItem,
  type DominantThemePalette,
  type ViewportLayoutMode,
} from '../utils/playerLogic';
import {
  DESKTOP_98_SPECTRUM_BAR_COUNT,
  DESKTOP_98_EQ_BAND_LABELS,
  DESKTOP_98_TRACK_CHANGE_TIMELINE_MS,
  SEVEN_SEGMENT_DIGIT_MAP,
  formatDesktop98LedDigits,
  formatDesktop98MarqueeText,
  stepDesktop98SpectrumBars,
  calculateDesktop98HolderTiltDeg,
  getDesktop98BitrateAndSampleRate,
} from '../utils/desktop98Logic';
import { usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';

interface Desktop98DeckProps {
  track: TrackItem;
  isPlaying: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  nightMode: boolean;
  prefersReducedMotion: boolean;
  rpm: 33 | 45;
  pitchPercent: number;
  volume: number;
  vinylCrackle: boolean;
  needleDropCrackle: boolean;
  crossfadeSec: number;
  repeatOne: boolean;
  shuffleEnabled: boolean;
  isFullScreen: boolean;
  hideBoxArt?: boolean;
  spotifyConnected: boolean;
  viewportLayout: ViewportLayoutMode;
  themePalette: DominantThemePalette;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (targetSec: number) => void;
  onChangeRpm: (rpm: 33 | 45) => void;
  onChangePitch: (pitch: number) => void;
  onChangeVolume: (volume: number) => void;
  onChangeCrossfadeSec: (sec: number) => void;
  onToggleRepeatOne: () => void;
  onToggleShuffle: () => void;
  onToggleVinylCrackle: () => void;
  onToggleNeedleDropCrackle: () => void;
  onToggleLowPowerMode: () => void;
  onToggleNightMode: () => void;
  onToggleFullScreen: () => void;
  onOpenSpotifyModal: () => void;
  onScratch?: (intensity: 'light' | 'classic' | 'backspin') => void;
  onDragTonearmToTime?: (targetSec: number) => void;
  onResolvedPerTrackArtwork?: (trackId: string, artworkUrl: string) => void;
  isTvFullscreen?: boolean;
  playlistTracks?: TrackItem[];
  playlistName?: string;
  onSelectTrack?: (trackId: string) => void;
}

const SevenSegmentDigitSvg = React.memo<{
  char: string;
  blinkingOff?: boolean;
}>(({ char, blinkingOff = false }) => {
  if (char === ':') {
    return (
      <svg viewBox="0 0 8 24" className="w-[6px] h-[20px] sm:w-[7px] sm:h-[22px] shrink-0">
        <rect
          x="2.5"
          y="6"
          width="3"
          height="3"
          fill={blinkingOff ? '#0B2416' : '#00E36D'}
        />
        <rect
          x="2.5"
          y="15"
          width="3"
          height="3"
          fill={blinkingOff ? '#0B2416' : '#00E36D'}
        />
      </svg>
    );
  }

  const segs = SEVEN_SEGMENT_DIGIT_MAP[char] || [false, false, false, false, false, false, false];
  const onFill = blinkingOff ? '#0B2416' : '#00E36D';
  const offFill = '#091E12';

  return (
    <svg viewBox="0 0 16 26" className="w-[12px] h-[20px] sm:w-[13px] sm:h-[22px] shrink-0">
      {/* Segment A (top) */}
      <polygon points="3,1.5 13,1.5 11.4,3.7 4.6,3.7" fill={segs[0] ? onFill : offFill} />
      {/* Segment B (top-right) */}
      <polygon points="13.6,2.2 14.4,12.2 12.2,11.2 11.7,4.2" fill={segs[1] ? onFill : offFill} />
      {/* Segment C (bottom-right) */}
      <polygon points="14.2,13.6 13.4,23.6 11.4,21.6 12.0,14.6" fill={segs[2] ? onFill : offFill} />
      {/* Segment D (bottom) */}
      <polygon points="4.2,22.1 11.2,22.1 12.8,24.3 2.6,24.3" fill={segs[3] ? onFill : offFill} />
      {/* Segment E (bottom-left) */}
      <polygon points="1.8,13.6 3.8,14.6 3.4,21.6 1.2,23.6" fill={segs[4] ? onFill : offFill} />
      {/* Segment F (top-left) */}
      <polygon points="2.2,2.2 4.1,4.2 3.6,11.2 1.4,12.2" fill={segs[5] ? onFill : offFill} />
      {/* Segment G (middle) */}
      <polygon
        points="3.9,11.8 11.9,11.8 13.2,12.9 11.7,14.0 3.7,14.0 2.4,12.9"
        fill={segs[6] ? onFill : offFill}
      />
    </svg>
  );
});

const Desktop98ClockReadout = React.memo(() => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const { timeText, dateText } = useMemo(() => formatConsoleClockAndDate(new Date(nowMs)), [nowMs]);

  return (
    <div
      id="console-time-display"
      aria-label="Live Current Time and Date"
      className="d98-lcd-well px-1.5 py-0.5 flex items-center justify-between gap-1.5 shrink-0"
    >
      <span
        id="console-clock-time"
        className="font-['VT323',monospace] text-[13px] text-[#00E36D] tabular-nums leading-none"
      >
        {timeText}
      </span>
      <span
        id="console-clock-date"
        className="font-['Silkscreen',monospace] text-[7px] text-[#B8FFD9]/80 uppercase tracking-tight leading-none truncate max-w-[78px]"
      >
        {dateText}
      </span>
    </div>
  );
});

const Desktop98LedTimerAndSeek = React.memo<{
  durationSec: number;
  isStandby: boolean;
  lowPowerMode: boolean;
  isBlinkingLoading: boolean;
  onSeek: (targetSec: number) => void;
}>(({ durationSec, isStandby, lowPowerMode, isBlinkingLoading, onSeek }) => {
  const currentSec = usePlaybackSecond();
  const safeDuration = Math.max(1, durationSec || 1);
  const clampedCurrent = isStandby ? 0 : Math.min(safeDuration, Math.max(0, currentSec));
  const progressPct = isStandby ? 0 : Math.min(100, (clampedCurrent / safeDuration) * 100);
  const digits = useMemo(() => {
    const [m1, m2, s1, s2] = formatDesktop98LedDigits(clampedCurrent, isBlinkingLoading);
    return [m1, m2, ':', s1, s2];
  }, [isBlinkingLoading, clampedCurrent]);

  return (
    <>
      {/* 7-Segment LED Elapsed Time Readout */}
      <div
        id="d98-led-timer"
        aria-label="Seven Segment LED Elapsed Time"
        data-blinking={isBlinkingLoading ? 'true' : 'false'}
        className="flex items-center justify-center gap-[2px] px-1.5 py-1 bg-[#050805] border border-[#10161F] rounded-[1px]"
      >
        {digits.map((ch, idx) => (
          <SevenSegmentDigitSvg
            key={idx}
            char={ch}
            blinkingOff={isBlinkingLoading && idx % 2 === 1}
          />
        ))}
      </div>

      {/* Thin Groove Seek Bar Slider with Brushed-Steel Thumb */}
      <div
        id="d98-seek-bar-row"
        className="col-span-full w-full flex items-center gap-2 pt-0.5 shrink-0"
      >
        <span className="font-['VT323',monospace] text-[13px] text-[#00E36D] tabular-nums leading-none w-8 shrink-0">
          {formatDuration(clampedCurrent)}
        </span>
        <div className="relative flex-1 h-4 flex items-center">
          <div className="w-full h-[6px] bg-[#0A0F0A] border-t border-l border-[#10161F] border-r border-b border-[#6E8298] rounded-[1px] overflow-hidden">
            <div
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #00C853 0%, #00E36D 65%, #D8A01D 100%)',
              }}
              className="h-full"
            />
          </div>
          {/* Brushed-Steel Thumb */}
          <div
            aria-hidden="true"
            style={{
              left: `calc(${progressPct}% - 9px)`,
            }}
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-[18px] h-[11px] bg-gradient-to-b from-[#6E8298] via-[#3A4A5C] to-[#1E2733] border-t border-l border-[#B8FFD9]/75 border-r border-b border-[#10161F] flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
          >
            <span className="w-[2px] h-[7px] bg-[#D8A01D]" />
          </div>
          <input
            id="d98-seek-slider"
            type="range"
            min={0}
            max={safeDuration}
            step={1}
            disabled={isStandby}
            value={clampedCurrent}
            onChange={(e) => {
              triggerButtonHaptic(lowPowerMode);
              onSeek(Number(e.target.value));
            }}
            aria-label="Track Seek Bar"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
          />
        </div>
        <span className="font-['VT323',monospace] text-[13px] text-[#B8FFD9]/85 tabular-nums leading-none w-8 text-right shrink-0">
          {formatDuration(isStandby ? 0 : durationSec)}
        </span>
      </div>
    </>
  );
});

export const Desktop98Deck = React.memo<Desktop98DeckProps>(
  ({
    track,
    isPlaying,
    isDocumentHidden,
    lowPowerMode,
    nightMode,
    prefersReducedMotion,
    pitchPercent,
    volume,
    repeatOne,
    shuffleEnabled,
    hideBoxArt = false,
    themePalette,
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    onSeek,
    onChangePitch,
    onChangeVolume,
    onToggleRepeatOne,
    onToggleShuffle,
    onToggleLowPowerMode,
    onToggleNightMode,
    onScratch,
    onResolvedPerTrackArtwork,
  }) => {
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
    const activeLoopsEnabled =
      isPlaying && !isStandby && !isDocumentHidden && !prefersReducedMotion && !lowPowerMode;

    // 1. Track-change animation state (< 1.5s: 360ms "LOADING..." flash + 00:00 blink + flat spectrum -> 740ms typing marquee)
    const [trackChangePhase, setTrackChangePhase] = useState<'idle' | 'loading' | 'typing'>('idle');
    const [typedCharCount, setTypedCharCount] = useState<number>(999);
    const prevTrackIdRef = useRef<string>(track.id);

    const fullMarqueeUnit = useMemo(
      () =>
        formatDesktop98MarqueeText(
          isStandby ? 'STANDBY' : track.artist,
          isStandby ? 'SELECT TRACK' : track.title
        ),
      [isStandby, track.artist, track.title]
    );

    useEffect(() => {
      if (prevTrackIdRef.current === track.id) return;
      prevTrackIdRef.current = track.id;
      if (isStandby || prefersReducedMotion || lowPowerMode) {
        setTrackChangePhase('idle');
        setTypedCharCount(999);
        return;
      }

      setTrackChangePhase('loading');
      setTypedCharCount(0);

      const loadingTimer = window.setTimeout(() => {
        setTrackChangePhase('typing');
      }, DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.loadingFlashMs);

      const doneTimer = window.setTimeout(() => {
        setTrackChangePhase('idle');
        setTypedCharCount(999);
      }, DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.totalMs);

      return () => {
        window.clearTimeout(loadingTimer);
        window.clearTimeout(doneTimer);
      };
    }, [track.id, isStandby, prefersReducedMotion, lowPowerMode]);

    // Character-by-character typing ticker during the 'typing' phase
    useEffect(() => {
      if (trackChangePhase !== 'typing') return;
      const totalChars = Math.max(1, fullMarqueeUnit.length);
      const stepMs = Math.max(
        18,
        Math.floor(DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.typingDurationMs / totalChars)
      );
      const interval = window.setInterval(() => {
        setTypedCharCount((prev) => Math.min(totalChars, prev + 1));
      }, stepMs);
      return () => window.clearInterval(interval);
    }, [trackChangePhase, fullMarqueeUnit]);

    // 2. 19-Bar Spectrum Analyzer with Falling Peak Caps (animates ONLY while playing, collapses flat when paused or loading)
    const [spectrumState, setSpectrumState] = useState<{ bars: number[]; peaks: number[] }>(() => ({
      bars: Array.from({ length: DESKTOP_98_SPECTRUM_BAR_COUNT }, () => 0.05),
      peaks: Array.from({ length: DESKTOP_98_SPECTRUM_BAR_COUNT }, () => 0.05),
    }));
    const spectrumTickRef = useRef<number>(0);

    useEffect(() => {
      if (!activeLoopsEnabled || trackChangePhase === 'loading') {
        setSpectrumState((prev) =>
          stepDesktop98SpectrumBars(
            prev.bars,
            prev.peaks,
            false,
            trackChangePhase === 'loading',
            spectrumTickRef.current
          )
        );
        return;
      }

      const interval = window.setInterval(() => {
        spectrumTickRef.current += 0.25;
        setSpectrumState((prev) =>
          stepDesktop98SpectrumBars(
            prev.bars,
            prev.peaks,
            true,
            false,
            spectrumTickRef.current
          )
        );
      }, 65);

      return () => window.clearInterval(interval);
    }, [activeLoopsEnabled, trackChangePhase]);

    // 3. Decorative 10-band Graphic Equalizer sliders (default flat/center 0 dB)
    const [eqBands, setEqBands] = useState<number[]>(() =>
      DESKTOP_98_EQ_BAND_LABELS.map(() => 0)
    );

    // 4. Scratch-burst visual stutter indicator
    const [isScratchStuttering, setIsScratchStuttering] = useState<boolean>(false);
    const scratchTimerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (scratchTimerRef.current !== null) {
          window.clearTimeout(scratchTimerRef.current);
        }
      };
    }, []);

    const handleTriggerScratchBurst = () => {
      triggerButtonHaptic(lowPowerMode);
      onScratch?.('classic');
      setIsScratchStuttering(true);
      if (scratchTimerRef.current !== null) {
        window.clearTimeout(scratchTimerRef.current);
      }
      scratchTimerRef.current = window.setTimeout(() => {
        setIsScratchStuttering(false);
        scratchTimerRef.current = null;
      }, 240);
    };

    // 5. Artwork resolution for Floating Album Art Viewer Mini-Window (#album-art-holder-box)
    const [artFailedCount, setArtFailedCount] = useState<number>(0);
    const [fetchedTrackArt, setFetchedTrackArt] = useState<string | null>(null);

    useEffect(() => {
      setArtFailedCount(0);
      setFetchedTrackArt(null);
    }, [track.id, track.artworkUrl]);

    const effectiveTrackForArt = useMemo<TrackItem>(
      () =>
        fetchedTrackArt
          ? {
              ...track,
              artworkUrl: fetchedTrackArt,
              images: [{ url: fetchedTrackArt, width: 640, height: 640 }, ...(track.images || [])],
            }
          : track,
      [track, fetchedTrackArt]
    );

    const artState = useMemo(
      () => resolveActiveArtworkState(effectiveTrackForArt, artFailedCount),
      [effectiveTrackForArt, artFailedCount]
    );

    useEffect(() => {
      if (!artState.isPlaceholder || isStandby || !track.id || !track.title) return;
      let cancelled = false;
      const params = new URLSearchParams({
        trackId: track.id,
        title: track.title,
        artist: track.artist || '',
      });
      fetch(`/api/spotify/track-artwork?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { artworkUrl?: string | null } | null) => {
          if (!cancelled && data?.artworkUrl) {
            setFetchedTrackArt(data.artworkUrl);
            setArtFailedCount(0);
            onResolvedPerTrackArtwork?.(track.id, data.artworkUrl);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [artState.isPlaceholder, isStandby, track.id, track.title, track.artist, onResolvedPerTrackArtwork]);

    // 6. Draggable Floating "Album Art Viewer" Mini-Window (#album-art-holder-box) — ZERO tilt physics (rotate(0deg) always)
    const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDraggingHolder, setIsDraggingHolder] = useState<boolean>(false);
    const holderDragStartRef = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    } | null>(null);

    const restTiltDeg = calculateDesktop98HolderTiltDeg();
    const { kbps, khz } = useMemo(
      () => getDesktop98BitrateAndSampleRate(track.id),
      [track.id]
    );

    const volumePct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
    const pitchNormPct = Math.round(((pitchPercent + 8) / 16) * 100);

    const marqueeDisplayString =
      trackChangePhase === 'loading'
        ? 'LOADING...'
        : trackChangePhase === 'typing'
          ? fullMarqueeUnit.slice(0, typedCharCount)
          : `${fullMarqueeUnit}${fullMarqueeUnit}`;

    const shouldScrollMarquee =
      activeLoopsEnabled && trackChangePhase === 'idle' && !isScratchStuttering;

    return (
      <section
        id="d98-player-stage"
        aria-label="1998 Skinned PC Audio Player Stacked Windows"
        className="walnut-furniture-cabinet panel-contain relative w-full h-full min-h-0 flex flex-col justify-between gap-1.5 p-1.5 sm:p-2 select-none overflow-hidden"
      >
        {/* =========================================================================
            TOP STACK: Floating "Album Art Viewer" Mini-Window + Window 1 (Main Deck)
           ========================================================================= */}
        <div className="w-full flex items-stretch gap-1.5 shrink-0 min-w-0">
          {/* FLOATING "ALBUM ART VIEWER" MINI-WINDOW (#album-art-holder-box) — Draggable, Zero Tilt */}
          <div
            id="album-art-holder-box"
            role="group"
            aria-label="Draggable Album Art Viewer Mini-Window"
            aria-hidden={hideBoxArt ? 'true' : undefined}
            title="Drag Album Art Viewer Window"
            data-dragging={isDraggingHolder ? 'true' : 'false'}
            data-rest-tilt={restTiltDeg}
            onPointerDown={(e) => {
              if (hideBoxArt) return;
              if ((e.target as HTMLElement).closest('button')) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              setIsDraggingHolder(true);
              holderDragStartRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                originX: holderOffset.x,
                originY: holderOffset.y,
              };
            }}
            onPointerMove={(e) => {
              const drag = holderDragStartRef.current;
              if (!drag || drag.pointerId !== e.pointerId) return;
              const rawX = drag.originX + (e.clientX - drag.startX);
              const rawY = drag.originY + (e.clientY - drag.startY);
              setHolderOffset({
                x: Math.max(-220, Math.min(220, Math.round(rawX))),
                y: Math.max(-180, Math.min(180, Math.round(rawY))),
              });
            }}
            onPointerUp={(e) => {
              if (holderDragStartRef.current?.pointerId === e.pointerId) {
                holderDragStartRef.current = null;
                setIsDraggingHolder(false);
              }
            }}
            onPointerCancel={() => {
              holderDragStartRef.current = null;
              setIsDraggingHolder(false);
            }}
            style={{
              opacity: hideBoxArt ? 0 : 1,
              width: hideBoxArt ? '0px' : undefined,
              padding: hideBoxArt ? '0px' : undefined,
              marginRight: hideBoxArt ? '-6px' : undefined,
              borderWidth: hideBoxArt ? '0px' : undefined,
              overflow: hideBoxArt ? 'hidden' : undefined,
              pointerEvents: hideBoxArt ? 'none' : 'auto',
              transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) rotate(0deg) scale(${
                hideBoxArt ? 0.92 : 1
              })`,
              transition: isDraggingHolder
                ? 'none'
                : prefersReducedMotion
                  ? 'none'
                  : 'opacity 220ms ease, transform 220ms ease, width 220ms ease',
            }}
            className="d98-window relative z-30 w-[94px] sm:w-[114px] shrink-0 p-1 flex flex-col justify-between cursor-grab active:cursor-grabbing"
          >
            {/* Title Bar with Gold Pixel Grip-Lines & 3 Fake Dots */}
            <div className="d98-titlebar mb-1 shrink-0">
              <span className="font-['Silkscreen',monospace] text-[7px] font-bold text-[#FFFFFF] uppercase leading-none shrink-0">
                ART VIEW
              </span>
              <div aria-hidden="true" className="d98-grip-lines flex-1" />
              <div aria-hidden="true" className="flex items-center gap-0.5 shrink-0">
                <span className="d98-win-dot" />
                <span className="d98-win-dot" />
                <span className="d98-win-dot d98-win-dot--close" />
              </div>
            </div>

            {/* Square Album Art in Recessed Display Well */}
            <div className="d98-lcd-well relative w-full aspect-square overflow-hidden flex items-center justify-center">
              {!isStandby && !artState.isPlaceholder && artState.activeUrl ? (
                <img
                  id="holder-album-art-img"
                  src={artState.activeUrl}
                  alt={`${track.title} album art`}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => setArtFailedCount((c) => c + 1)}
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0F0A] text-[#00E36D]">
                  <Disc3 strokeWidth={1.75} className="w-6 h-6 mb-0.5" />
                  <span className="font-['Silkscreen',monospace] text-[6.5px] uppercase">
                    NO COVER
                  </span>
                </div>
              )}
            </div>

            {/* Bottom Mini Status Strip */}
            <div className="mt-1 px-1 py-0.5 bg-[#0A0F0A] border border-[#10161F] flex items-center justify-between">
              <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#00E36D] uppercase truncate">
                {isStandby ? 'IDLE' : `${track.year || 1998}`}
              </span>
              <span className="font-['VT323',monospace] text-[11px] text-[#D8A01D] leading-none">
                1:1
              </span>
            </div>
          </div>

          {/* =====================================================================
              WINDOW 1 — MAIN DECK WINDOW (#d98-main-window)
             ===================================================================== */}
          <div
            id="d98-main-window"
            aria-label="Main Deck Player Window"
            data-track-change-phase={trackChangePhase}
            className="d98-window flex-1 min-w-0 p-1 sm:p-1.5 flex flex-col justify-between gap-1"
          >
            {/* Window 1 Title Bar */}
            <div id="d98-main-titlebar" className="d98-titlebar shrink-0">
              <span className="font-['Silkscreen',monospace] text-[8.5px] font-bold tracking-wider text-[#FFFFFF] uppercase leading-none shrink-0">
                MAIN PLAYER
              </span>
              <div aria-hidden="true" className="d98-grip-lines flex-1" />
              <div aria-hidden="true" className="flex items-center gap-1 shrink-0">
                <span className="d98-win-dot" />
                <span className="d98-win-dot" />
                <span className="d98-win-dot d98-win-dot--close" />
              </div>
            </div>

            {/* Upper Bay: Left 7-Segment Timer + 19-Bar Spectrum Analyzer | Right Marquee + kbps/kHz + Volume/Pitch */}
            <div className="grid grid-cols-12 gap-1.5 items-stretch min-w-0">
              {/* Left Recessed Display Glass: 7-Segment LED Time + 19-Bar Spectrum Analyzer */}
              <div className="col-span-5 sm:col-span-5 d98-lcd-well p-1 flex flex-col justify-between gap-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#D8A01D] uppercase leading-none">
                    {isPlaying && !isStandby ? 'PLAY' : 'STOP'}
                  </span>
                  <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#00E36D] uppercase leading-none">
                    STEREO
                  </span>
                </div>

                {/* 7-Segment LED Elapsed Time + Thin Groove Seek Bar (Seek bar spans full width below) */}
                <Desktop98LedTimerAndSeek
                  durationSec={track.durationSec}
                  isStandby={isStandby}
                  lowPowerMode={lowPowerMode}
                  isBlinkingLoading={trackChangePhase === 'loading'}
                  onSeek={onSeek}
                />

                {/* 19-Bar Spectrum Analyzer with Falling Peak Caps */}
                <div
                  id="d98-spectrum-analyzer"
                  aria-label="19-Bar Spectrum Analyzer"
                  data-active={activeLoopsEnabled && trackChangePhase !== 'loading' ? 'true' : 'false'}
                  className="w-full h-[26px] sm:h-[30px] bg-[#050805] border border-[#10161F] px-1 py-0.5 flex items-end justify-between gap-[1.5px] overflow-hidden"
                >
                  {spectrumState.bars.map((barLevel, idx) => {
                    const peakLevel = spectrumState.peaks[idx] ?? barLevel;
                    return (
                      <div
                        key={idx}
                        data-spectrum-bar={idx}
                        data-bar-level={barLevel.toFixed(2)}
                        className="relative flex-1 h-full flex items-end overflow-hidden"
                      >
                        {/* Main Green Spectrum Bar (#00E36D) */}
                        <div
                          style={{
                            transform: `scaleY(${Math.max(0.04, barLevel)})`,
                            transformOrigin: 'bottom',
                          }}
                          className="w-full h-full bg-[#00E36D] transition-transform duration-75"
                        />
                        {/* Lighter Falling Peak Cap (#B8FFD9) */}
                        <div
                          data-peak-cap={idx}
                          style={{
                            transform: `translateY(-${Math.round(peakLevel * 22)}px)`,
                            opacity: peakLevel > 0.04 ? 1 : 0.35,
                          }}
                          className="pointer-events-none absolute bottom-0 inset-x-0 h-[2px] bg-[#B8FFD9]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Scrolling Marquee + kbps/kHz + Clock + Horizontal Sliders */}
              <div className="col-span-7 sm:col-span-7 flex flex-col justify-between gap-1 min-w-0">
                {/* Continuously Scrolling Text Marquee ("ARTIST - TITLE *** ") */}
                <div
                  id="d98-marquee-box"
                  className="d98-lcd-well px-1.5 py-1 overflow-hidden flex items-center min-w-0"
                >
                  {/* Hidden semantic spans for automated tests checking #console-track-title and #console-artist-name */}
                  <span id="console-track-title" className="sr-only">
                    {isStandby ? 'No Track Loaded' : track.title}
                  </span>
                  <span id="console-artist-name" className="sr-only">
                    {isStandby ? 'Connect Spotify' : track.artist}
                  </span>
                  <div
                    id="d98-marquee-track"
                    data-scrolling={shouldScrollMarquee ? 'true' : 'false'}
                    data-phase={trackChangePhase}
                    className={`d98-marquee-strip font-['VT323',monospace] text-[15px] sm:text-[16px] tracking-wide leading-none ${
                      trackChangePhase === 'loading' ? 'text-[#D8A01D]' : 'text-[#00E36D]'
                    }`}
                  >
                    <span>{marqueeDisplayString}</span>
                  </div>
                </div>

                {/* Small Decorative kbps & kHz Readouts + Corner LED Clock/Date */}
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
                    <div
                      id="d98-kbps-readout"
                      className="d98-lcd-well px-1 py-0.5 flex items-center gap-0.5"
                    >
                      <span className="font-['VT323',monospace] text-[12px] text-[#00E36D] tabular-nums leading-none">
                        {kbps}
                      </span>
                      <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#B8FFD9]/75 uppercase leading-none">
                        kbps
                      </span>
                    </div>
                    <div
                      id="d98-khz-readout"
                      className="d98-lcd-well px-1 py-0.5 flex items-center gap-0.5"
                    >
                      <span className="font-['VT323',monospace] text-[12px] text-[#00E36D] tabular-nums leading-none">
                        {khz}
                      </span>
                      <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#B8FFD9]/75 uppercase leading-none">
                        kHz
                      </span>
                    </div>
                  </div>

                  {/* Corner Small LED Clock/Date Readout */}
                  <Desktop98ClockReadout />
                </div>

                {/* Volume & Pitch Short Horizontal Sliders with Green-to-Red Gradient Fill */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  {/* Horizontal Volume Slider */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#FFFFFF] uppercase leading-none">
                        VOL
                      </span>
                      <span className="font-['VT323',monospace] text-[11px] text-[#00E36D] tabular-nums leading-none">
                        {volumePct}%
                      </span>
                    </div>
                    <div className="relative h-3.5 flex items-center">
                      <div className="w-full h-[5px] bg-[#0A0F0A] border border-[#10161F] overflow-hidden">
                        <div
                          style={{
                            width: `${volumePct}%`,
                            background:
                              'linear-gradient(90deg, #00E36D 0%, #D8A01D 62%, #FF3B30 100%)',
                          }}
                          className="h-full"
                        />
                      </div>
                      <div
                        aria-hidden="true"
                        style={{ left: `calc(${volumePct}% - 5px)` }}
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-[10px] h-[9px] bg-[#3A4A5C] border-t border-l border-[#6E8298] border-r border-b border-[#10161F]"
                      />
                      <input
                        id="vertical-volume-slider"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => onChangeVolume(Number(e.target.value))}
                        aria-label="Master Volume Slider"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                  </div>

                  {/* Horizontal Pitch Trim Slider (Synced with Real Pitch Slider in EQ Window) */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-['Silkscreen',monospace] text-[6.5px] text-[#D8A01D] uppercase leading-none">
                        PITCH
                      </span>
                      <span className="font-['VT323',monospace] text-[11px] text-[#D8A01D] tabular-nums leading-none">
                        {pitchPercent > 0 ? `+${pitchPercent.toFixed(1)}%` : `${pitchPercent.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="relative h-3.5 flex items-center">
                      <div className="w-full h-[5px] bg-[#0A0F0A] border border-[#10161F] overflow-hidden">
                        <div
                          style={{
                            width: `${pitchNormPct}%`,
                            background:
                              'linear-gradient(90deg, #00E36D 0%, #D8A01D 62%, #FF3B30 100%)',
                          }}
                          className="h-full"
                        />
                      </div>
                      <div
                        aria-hidden="true"
                        style={{ left: `calc(${pitchNormPct}% - 5px)` }}
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-[10px] h-[9px] bg-[#D8A01D] border-t border-l border-[#FFF3B0] border-r border-b border-[#10161F]"
                      />
                      <input
                        id="d98-main-pitch-slider"
                        type="range"
                        min={-8}
                        max={8}
                        step={0.5}
                        value={pitchPercent}
                        onChange={(e) => onChangePitch(Number(e.target.value))}
                        aria-label="Deck Pitch Trim Slider"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Five 3D-Pressed Beveled Transport Controls + Square Latching Toggles with Green Indicator Squares */}
            <div className="w-full flex items-center justify-between gap-1.5 pt-0.5 shrink-0">
              {/* 5 Beveled Transport Buttons: Prev, Scratch-Burst, Play/Pause, Stop, Next */}
              <div
                role="group"
                aria-label="Main Deck Transport Controls"
                className="flex items-center gap-1"
              >
                <button
                  id="btn-prev-track"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onPrevious();
                  }}
                  aria-label="Previous Track"
                  title="Previous Track"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-2 flex items-center justify-center cursor-pointer"
                >
                  <SkipBack className="w-3 h-3 text-[#FFFFFF]" />
                </button>

                <button
                  id="btn-scratch-burst"
                  type="button"
                  data-pressed={isScratchStuttering ? 'true' : 'false'}
                  onClick={handleTriggerScratchBurst}
                  aria-label="Buffer Stutter Scratch Burst"
                  title="Stutter Playback with Brief Vinyl-Crackle Burst"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-2 flex items-center justify-center gap-0.5 cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-[#D8A01D]" />
                  <span className="font-['Silkscreen',monospace] text-[7px] font-bold uppercase leading-none">
                    STUT
                  </span>
                </button>

                <button
                  id="btn-play-pause"
                  type="button"
                  data-pressed={isPlaying && !isStandby ? 'true' : 'false'}
                  aria-pressed={isPlaying && !isStandby}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onTogglePlay();
                  }}
                  aria-label={isPlaying ? 'Pause Playback' : 'Start Playback'}
                  title={isPlaying ? 'Pause' : 'Play'}
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-2.5 flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isPlaying && !isStandby ? (
                    <Pause className="w-3 h-3 fill-current text-[#00E36D]" />
                  ) : (
                    <Play className="w-3 h-3 fill-current text-[#FFFFFF]" />
                  )}
                  <span className="font-['Silkscreen',monospace] text-[7px] font-bold uppercase leading-none">
                    {isPlaying && !isStandby ? 'PAUSE' : 'PLAY'}
                  </span>
                </button>

                <button
                  id="btn-stop-playback"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onStop();
                  }}
                  aria-label="Stop Playback"
                  title="Stop"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-2 flex items-center justify-center cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current text-[#FFFFFF]" />
                </button>

                <button
                  id="btn-next-track"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onNext();
                  }}
                  aria-label="Next Track"
                  title="Next Track"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-2 flex items-center justify-center cursor-pointer"
                >
                  <SkipForward className="w-3 h-3 text-[#FFFFFF]" />
                </button>
              </div>

              {/* Small Square Latching Buttons with Lit Green Indicator Squares */}
              <div
                role="group"
                aria-label="Latching Mode Toggles"
                className="flex items-center gap-1"
              >
                <button
                  id="toggle-shuffle"
                  type="button"
                  data-pressed={shuffleEnabled ? 'true' : 'false'}
                  aria-pressed={shuffleEnabled}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleShuffle();
                  }}
                  aria-label="Toggle Shuffle"
                  title="Shuffle"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-1.5 flex items-center gap-1 cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`w-[5px] h-[5px] border border-[#10161F] ${
                      shuffleEnabled ? 'bg-[#00E36D] shadow-[0_0_5px_#00E36D]' : 'bg-[#0A0F0A]'
                    }`}
                  />
                  <Shuffle className="w-2.5 h-2.5" />
                  <span className="font-['Silkscreen',monospace] text-[7px] uppercase leading-none">
                    SHUF
                  </span>
                </button>

                <button
                  id="toggle-repeat"
                  type="button"
                  data-pressed={repeatOne ? 'true' : 'false'}
                  aria-pressed={repeatOne}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleRepeatOne();
                  }}
                  aria-label="Toggle Repeat One"
                  title="Repeat One"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-1.5 flex items-center gap-1 cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`w-[5px] h-[5px] border border-[#10161F] ${
                      repeatOne ? 'bg-[#00E36D] shadow-[0_0_5px_#00E36D]' : 'bg-[#0A0F0A]'
                    }`}
                  />
                  <Repeat className="w-2.5 h-2.5" />
                  <span className="font-['Silkscreen',monospace] text-[7px] uppercase leading-none">
                    REP
                  </span>
                </button>

                <button
                  id="toggle-eco"
                  type="button"
                  data-pressed={lowPowerMode ? 'true' : 'false'}
                  aria-pressed={lowPowerMode}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleLowPowerMode();
                  }}
                  aria-label="Toggle Eco Low-Power Mode"
                  title="Eco Mode"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-1.5 flex items-center gap-1 cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`w-[5px] h-[5px] border border-[#10161F] ${
                      lowPowerMode ? 'bg-[#00E36D]' : 'bg-[#0A0F0A]'
                    }`}
                  />
                  <span className="font-['Silkscreen',monospace] text-[6.5px] uppercase leading-none">
                    ECO
                  </span>
                </button>

                <button
                  id="toggle-night-mode"
                  type="button"
                  data-pressed={nightMode ? 'true' : 'false'}
                  aria-pressed={nightMode}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleNightMode();
                  }}
                  aria-label="Toggle Night Mode"
                  title="Night Mode"
                  className="d98-bevel-btn h-[24px] sm:h-[26px] px-1.5 hidden sm:flex items-center gap-1 cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`w-[5px] h-[5px] border border-[#10161F] ${
                      nightMode ? 'bg-[#D8A01D]' : 'bg-[#0A0F0A]'
                    }`}
                  />
                  <span className="font-['Silkscreen',monospace] text-[6.5px] uppercase leading-none">
                    NGT
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            WINDOW 2 — GRAPHIC EQUALIZER WINDOW (#d98-eq-window)
            10 Decorative EQ Sliders (Flat/Center Default) + Highlighted REAL Pitch Slider
           ========================================================================= */}
        <div
          id="d98-eq-window"
          aria-label="Graphic Equalizer and Pitch Control Window"
          className="d98-window w-full p-1 sm:p-1.5 flex flex-col justify-between gap-1 shrink-0"
        >
          {/* Window 2 Title Bar */}
          <div id="d98-eq-titlebar" className="d98-titlebar shrink-0">
            <span className="font-['Silkscreen',monospace] text-[8.5px] font-bold tracking-wider text-[#FFFFFF] uppercase leading-none shrink-0">
              GRAPHIC EQUALIZER
            </span>
            <div aria-hidden="true" className="d98-grip-lines flex-1" />
            <button
              type="button"
              onClick={() => {
                setEqBands(DESKTOP_98_EQ_BAND_LABELS.map(() => 0));
                onChangePitch(0);
              }}
              aria-label="Reset Equalizer and Pitch to Flat"
              className="d98-bevel-btn px-1.5 py-0.5 font-['Silkscreen',monospace] text-[6.5px] text-[#00E36D] uppercase leading-none cursor-pointer shrink-0"
            >
              FLAT 0dB
            </button>
            <div aria-hidden="true" className="flex items-center gap-1 shrink-0">
              <span className="d98-win-dot" />
              <span className="d98-win-dot" />
              <span className="d98-win-dot d98-win-dot--close" />
            </div>
          </div>

          {/* 10 Decorative EQ Sliders + Highlighted REAL Pitch Slider with Amber Cap */}
          <div className="w-full flex items-stretch justify-between gap-1 sm:gap-1.5 px-1 py-0.5 bg-[#19212B] border border-[#10161F]">
            {/* 10 Decorative Graphic EQ Bands */}
            <div
              id="d98-eq-bands"
              className="flex-1 grid grid-cols-10 gap-0.5 sm:gap-1 items-center"
            >
              {DESKTOP_98_EQ_BAND_LABELS.map((freqLabel, idx) => {
                const val = eqBands[idx] ?? 0;
                const pct = ((val + 12) / 24) * 100;
                return (
                  <div
                    key={freqLabel}
                    data-eq-band={freqLabel}
                    className="flex flex-col items-center justify-between gap-0.5"
                  >
                    <div className="relative w-3.5 h-[36px] sm:h-[42px] bg-[#0A0F0A] border border-[#10161F] flex items-center justify-center">
                      {/* Center 0dB Tick */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-[#6E8298]/45"
                      />
                      {/* Vertical Groove */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none w-[2px] h-full bg-[#10161F]"
                      />
                      {/* Beveled Steel Slider Cap */}
                      <div
                        aria-hidden="true"
                        style={{
                          bottom: `calc(${pct}% - 4px)`,
                        }}
                        className="pointer-events-none absolute inset-x-[1px] h-[8px] bg-[#3A4A5C] border-t border-l border-[#6E8298] border-r border-b border-[#10161F] flex items-center justify-center"
                      >
                        <span className="w-full h-[1px] bg-[#00E36D]" />
                      </div>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={1}
                        value={val}
                        onChange={(e) => {
                          const nextVal = Number(e.target.value);
                          setEqBands((prev) =>
                            prev.map((v, i) => (i === idx ? nextVal : v))
                          );
                        }}
                        aria-label={`Equalizer ${freqLabel} Hz Slider`}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                    <span className="font-['Silkscreen',monospace] text-[6px] text-[#B8FFD9]/80 uppercase leading-none">
                      {freqLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Divider & Highlighted REAL Functional Pitch Slider with Amber Cap (#D8A01D) */}
            <div className="pl-1.5 border-l-2 border-[#6E8298]/60 flex flex-col items-center justify-between shrink-0">
              <div className="relative w-6 h-[36px] sm:h-[42px] bg-[#0A0F0A] border border-[#D8A01D]/80 flex items-center justify-center shadow-[0_0_6px_rgba(216,160,29,0.25)]">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-[#D8A01D]/60"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none w-[2px] h-full bg-[#D8A01D]/45"
                />
                {/* Highlighted Amber Cap (#D8A01D) */}
                <div
                  data-testid="d98-eq-pitch-amber-cap"
                  aria-hidden="true"
                  style={{
                    bottom: `calc(${pitchNormPct}% - 5px)`,
                  }}
                  className="pointer-events-none absolute inset-x-[1px] h-[10px] bg-[#D8A01D] border-t border-l border-[#FFF3B0] border-r border-b border-[#10161F] flex items-center justify-center shadow"
                >
                  <span className="w-full h-[1.5px] bg-[#10161F]" />
                </div>
                <input
                  id="vertical-pitch-slider"
                  type="range"
                  min={-8}
                  max={8}
                  step={0.5}
                  value={pitchPercent}
                  onChange={(e) => onChangePitch(Number(e.target.value))}
                  aria-label="Real Pitch Control Slider"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>
              <span className="font-['Silkscreen',monospace] text-[6.5px] font-bold text-[#D8A01D] uppercase leading-none">
                PITCH
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            WINDOW 4 — SLIM LYRICS WINDOW (#d98-lyrics-window)
            Green Text on Black (#00C853 on #000D06), Inverse Active Line (#000D06 on #00E36D)
           ========================================================================= */}
        <div
          id="d98-lyrics-window"
          aria-label="Lyrics Viewer Window"
          className="d98-window flex-1 min-h-[76px] p-1 sm:p-1.5 flex flex-col justify-between gap-1 overflow-hidden"
        >
          {/* Window 4 Title Bar */}
          <div id="d98-lyrics-titlebar" className="d98-titlebar shrink-0">
            <span className="font-['Silkscreen',monospace] text-[8.5px] font-bold tracking-wider text-[#FFFFFF] uppercase leading-none shrink-0">
              LYRICS VIEWER
            </span>
            <div aria-hidden="true" className="d98-grip-lines flex-1" />
            <div aria-hidden="true" className="flex items-center gap-1 shrink-0">
              <span className="d98-win-dot" />
              <span className="d98-win-dot" />
              <span className="d98-win-dot d98-win-dot--close" />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <SyncedLyricsPanel
              track={track}
              isStandby={isStandby}
              prefersReducedMotion={prefersReducedMotion}
              themePalette={themePalette}
              onSeek={onSeek}
              themeId="desktop-98"
              className="flex-1 h-full !min-h-0 !max-h-none"
            />
          </div>
        </div>
      </section>
    );
  }
);
