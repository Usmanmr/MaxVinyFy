import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat1,
  Disc3,
  Volume2,
  VolumeX,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
import {
  formatDuration,
  triggerButtonHaptic,
  resolveActiveArtworkState,
  formatConsoleClockAndDate,
  clampSeekTime,
  type TrackItem,
} from '../utils/playerLogic';
import { computeSeekHoverPreview } from '../utils/streamlineLogic';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';

export interface StreamlinePlayerBarProps {
  track: TrackItem;
  isPlaying: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  nightMode: boolean;
  prefersReducedMotion: boolean;
  rpm: 33 | 45;
  pitchPercent: number;
  volume: number;
  repeatOne: boolean;
  shuffleEnabled: boolean;
  compact?: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (targetSec: number) => void;
  onChangeRpm: (rpm: 33 | 45) => void;
  onChangePitch: (pitch: number) => void;
  onChangeVolume: (volume: number) => void;
  onToggleRepeatOne: () => void;
  onToggleShuffle: () => void;
  onToggleLowPowerMode: () => void;
  onToggleNightMode: () => void;
  onScratch?: (intensity: 'light' | 'classic' | 'backspin') => void;
}

const StreamlineTinyClock = React.memo<{ isDocumentHidden: boolean }>(({ isDocumentHidden }) => {
  const [clockText, setClockText] = useState<{ timeText: string; dateText: string }>(() =>
    formatConsoleClockAndDate(new Date())
  );

  useEffect(() => {
    const sync = () => setClockText(formatConsoleClockAndDate(new Date()));
    sync();
    if (isDocumentHidden) return;
    return playbackClockStore.subscribeSecond(sync);
  }, [isDocumentHidden]);

  return (
    <div
      id="console-time-display"
      aria-label="Live Current Time and Date"
      className="flex items-center justify-end gap-1.5 text-[10px] leading-none tabular-nums whitespace-nowrap"
    >
      <span id="console-clock-time" className="font-semibold text-[#A7AFBC]">
        {clockText.timeText}
      </span>
      <span className="text-[#5E6673]" aria-hidden="true">
        ·
      </span>
      <span id="console-clock-date" className="font-medium text-[#5E6673] truncate max-w-[110px]">
        {clockText.dateText}
      </span>
    </div>
  );
});

StreamlineTinyClock.displayName = 'StreamlineTinyClock';

export const StreamlinePlayerBar = React.memo<StreamlinePlayerBarProps>(
  ({
    track,
    isPlaying,
    isDocumentHidden,
    lowPowerMode,
    nightMode,
    prefersReducedMotion,
    rpm,
    pitchPercent,
    volume,
    repeatOne,
    shuffleEnabled,
    compact = false,
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    onSeek,
    onChangeRpm,
    onChangePitch,
    onChangeVolume,
    onToggleRepeatOne,
    onToggleShuffle,
    onToggleLowPowerMode,
    onToggleNightMode,
    onScratch,
  }) => {
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
    const currentSec = usePlaybackSecond();
    const safeDuration = Math.max(1, track.durationSec || 1);
    const clampedCurrent = isStandby
      ? 0
      : Math.min(safeDuration, Math.max(0, Math.round(currentSec)));
    const progressPct = isStandby ? 0 : Math.min(100, (clampedCurrent / safeDuration) * 100);

    // Seek bar hover bubble & dragging state
    const seekTrackRef = useRef<HTMLDivElement | null>(null);
    const [seekHover, setSeekHover] = useState<{
      active: boolean;
      percent: number;
      targetSec: number;
    }>({ active: false, percent: 0, targetSec: 0 });
    const [isSeekingDrag, setIsSeekingDrag] = useState<boolean>(false);

    // DJ-brake scratch button active feedback
    const [djBrakeActive, setDjBrakeActive] = useState<boolean>(false);
    const djBrakeTimerRef = useRef<number | null>(null);

    // Volume mute & hover-expand state
    const lastNonZeroVolumeRef = useRef<number>(volume > 0 ? volume : 0.8);
    if (volume > 0.02) {
      lastNonZeroVolumeRef.current = volume;
    }

    // Overflow ("···") menu state for Pitch / Speed / Power toggles
    const [overflowOpen, setOverflowOpen] = useState<boolean>(false);
    const overflowWrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      return () => {
        if (djBrakeTimerRef.current !== null) {
          window.clearTimeout(djBrakeTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (!overflowOpen) return;
      const handlePointerDown = (e: PointerEvent) => {
        if (
          overflowWrapperRef.current &&
          !overflowWrapperRef.current.contains(e.target as Node)
        ) {
          setOverflowOpen(false);
        }
      };
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOverflowOpen(false);
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [overflowOpen]);

    const miniArtState = useMemo(() => resolveActiveArtworkState(track, 0), [track]);
    const [miniArtBroken, setMiniArtBroken] = useState(false);

    useEffect(() => {
      setMiniArtBroken(false);
    }, [track.id, miniArtState.activeUrl]);

    const resolveRatioFromPointer = (clientX: number): number => {
      const el = seekTrackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const handleSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isStandby) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsSeekingDrag(true);
      const ratio = resolveRatioFromPointer(e.clientX);
      const preview = computeSeekHoverPreview(ratio, safeDuration);
      setSeekHover({ active: true, ...preview });
      onSeek(clampSeekTime(preview.targetSec, safeDuration));
    };

    const handleSeekPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isStandby) return;
      const ratio = resolveRatioFromPointer(e.clientX);
      const preview = computeSeekHoverPreview(ratio, safeDuration);
      setSeekHover({ active: true, ...preview });
      if (isSeekingDrag) {
        onSeek(clampSeekTime(preview.targetSec, safeDuration));
      }
    };

    const handleSeekPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isSeekingDrag) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        setIsSeekingDrag(false);
      }
    };

    const handleTriggerDjBrake = () => {
      if (isStandby) return;
      triggerButtonHaptic(lowPowerMode);
      onScratch?.('classic');
      setDjBrakeActive(true);
      if (djBrakeTimerRef.current !== null) {
        window.clearTimeout(djBrakeTimerRef.current);
      }
      djBrakeTimerRef.current = window.setTimeout(() => {
        setDjBrakeActive(false);
        djBrakeTimerRef.current = null;
      }, 420);
    };

    const volumePct = Math.round(Math.max(0, Math.min(1, volume)) * 100);

    return (
      <footer
        id="streamline-player-bar"
        data-testid="streamline-player-bar"
        aria-label="Streamline Bottom Player Bar"
        className={`z-40 w-full bg-[#161A20]/95 backdrop-blur-xl border-t border-white/[0.08] shadow-[0_-8px_24px_rgba(0,0,0,0.45)] ${
          compact
            ? 'relative px-3 py-1.5'
            : 'sticky bottom-0 md:relative px-3 sm:px-5 py-2 sm:py-2.5'
        } shrink-0`}
      >
        <div className="w-full max-w-[1920px] mx-auto grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(280px,540px)_minmax(0,1fr)] items-center gap-2 sm:gap-4">
          {/* LEFT: Mini Album Art + Title / Artist */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-[8px] bg-[#1D232B] overflow-hidden shrink-0 border border-white/[0.07] flex items-center justify-center">
              {!isStandby && !miniArtState.isPlaceholder && miniArtState.activeUrl && !miniArtBroken ? (
                <img
                  src={miniArtState.activeUrl}
                  alt={`${track.title} mini art`}
                  referrerPolicy="no-referrer"
                  onError={() => setMiniArtBroken(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 strokeWidth={1.75} className="w-5 h-5 text-[#19C6A3]/75" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-sans text-[13px] sm:text-[14px] font-semibold text-[#FFFFFF] leading-tight truncate">
                {isStandby ? 'No Track Selected' : track.title}
              </p>
              <p className="font-sans text-[11.5px] sm:text-[12px] font-medium text-[#A7AFBC] leading-tight truncate mt-0.5">
                {isStandby ? 'Connect Spotify to stream' : track.artist}
              </p>
            </div>
          </div>

          {/* CENTER: Transport Cluster (Shuffle, Prev, 48px White Play/Pause, Next, Repeat, Scratch DJ-Brake, Stop) + 3px Teal Seek Bar */}
          <div className="col-span-2 md:col-span-1 order-3 md:order-2 flex flex-col items-center justify-center gap-1.5 min-w-0 w-full">
            {/* Transport Cluster */}
            <div className="flex items-center justify-center gap-2 sm:gap-3.5">
              <button
                id="btn-shuffle"
                type="button"
                aria-pressed={shuffleEnabled}
                data-pressed={shuffleEnabled ? 'true' : 'false'}
                aria-label={shuffleEnabled ? 'Disable Shuffle' : 'Enable Shuffle'}
                title="Shuffle"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onToggleShuffle();
                }}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  shuffleEnabled
                    ? 'text-[#19C6A3]'
                    : 'text-[#A7AFBC] hover:text-[#FFFFFF]'
                }`}
              >
                <Shuffle strokeWidth={2} className="w-4 h-4" />
              </button>

              <button
                id="btn-previous"
                type="button"
                disabled={isStandby}
                aria-label="Previous Track"
                title="Previous Track"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onPrevious();
                }}
                className="p-1.5 rounded-full text-[#A7AFBC] hover:text-[#FFFFFF] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <SkipBack strokeWidth={2} className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
              </button>

              {/* Big White Circular Play/Pause (48px, black glyph) */}
              <button
                id="btn-play-pause"
                type="button"
                disabled={isStandby}
                aria-pressed={isPlaying}
                data-pressed={isPlaying ? 'true' : 'false'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isPlaying ? 'Pause' : 'Play'}
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onTogglePlay();
                }}
                className={`${
                  compact ? 'w-10 h-10' : 'w-12 h-12'
                } rounded-full bg-[#FFFFFF] hover:bg-[#F3F4F6] text-[#0F1115] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.45)] transition-transform duration-150 hover:scale-[1.04] active:scale-[0.96] disabled:opacity-40 cursor-pointer shrink-0`}
              >
                {isPlaying ? (
                  <Pause strokeWidth={2.2} className="w-5 h-5 fill-current text-[#0F1115]" />
                ) : (
                  <Play strokeWidth={2.2} className="w-5 h-5 fill-current text-[#0F1115] ml-0.5" />
                )}
              </button>

              <button
                id="btn-next"
                type="button"
                disabled={isStandby}
                aria-label="Next Track"
                title="Next Track"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onNext();
                }}
                className="p-1.5 rounded-full text-[#A7AFBC] hover:text-[#FFFFFF] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <SkipForward strokeWidth={2} className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
              </button>

              <button
                id="btn-repeat"
                type="button"
                aria-pressed={repeatOne}
                data-pressed={repeatOne ? 'true' : 'false'}
                aria-label={repeatOne ? 'Disable Repeat One' : 'Enable Repeat One'}
                title="Repeat Track"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onToggleRepeatOne();
                }}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  repeatOne
                    ? 'text-[#19C6A3]'
                    : 'text-[#A7AFBC] hover:text-[#FFFFFF]'
                }`}
              >
                <Repeat1 strokeWidth={2} className="w-4 h-4" />
              </button>

              {/* Scratch DJ-Brake Button (Small Turntable Glyph) */}
              <button
                id="btn-scratch-turntable"
                type="button"
                disabled={isStandby}
                data-dj-brake={djBrakeActive ? 'active' : 'idle'}
                aria-label="DJ-Brake Effect"
                title="DJ-Brake Turntable Effect"
                onClick={handleTriggerDjBrake}
                className={`p-1.5 rounded-full border transition-all cursor-pointer disabled:opacity-40 ${
                  djBrakeActive
                    ? 'border-[#19C6A3] bg-[#19C6A3]/15 text-[#19C6A3] scale-95'
                    : 'border-white/10 bg-[#1D232B]/70 text-[#A7AFBC] hover:text-[#FFFFFF] hover:border-[#19C6A3]/60'
                }`}
              >
                <Disc3
                  strokeWidth={2}
                  className={`w-3.5 h-3.5 ${djBrakeActive && !prefersReducedMotion ? 'animate-spin' : ''}`}
                />
              </button>

              {/* Whisper-quiet Stop button */}
              <button
                id="btn-stop"
                type="button"
                disabled={isStandby}
                aria-label="Stop Playback"
                title="Stop"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onStop();
                }}
                className="p-1.5 rounded-full text-[#5E6673] hover:text-[#FFFFFF] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Square strokeWidth={2} className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* Seek Bar Row: Elapsed | 3px Teal Track with Hover Dot & Time Bubble | Total */}
            <div className="w-full flex items-center gap-2.5 px-1">
              <span
                id="streamline-elapsed-time"
                className="text-[11px] font-medium text-[#A7AFBC] tabular-nums w-9 text-right shrink-0"
              >
                {formatDuration(clampedCurrent)}
              </span>

              <div
                id="streamline-seek-track"
                ref={seekTrackRef}
                role="slider"
                tabIndex={isStandby ? -1 : 0}
                aria-label="Seek Track Timeline"
                aria-valuemin={0}
                aria-valuemax={safeDuration}
                aria-valuenow={clampedCurrent}
                onPointerDown={handleSeekPointerDown}
                onPointerMove={handleSeekPointerMove}
                onPointerLeave={() => {
                  if (!isSeekingDrag) {
                    setSeekHover((prev) => ({ ...prev, active: false }));
                  }
                }}
                onPointerUp={handleSeekPointerUp}
                onPointerCancel={handleSeekPointerUp}
                onKeyDown={(e) => {
                  if (isStandby) return;
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    onSeek(clampSeekTime(clampedCurrent + 5, safeDuration));
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    onSeek(clampSeekTime(clampedCurrent - 5, safeDuration));
                  }
                }}
                className="group/seek relative flex-1 h-5 flex items-center cursor-pointer select-none"
              >
                {/* Hover Time Bubble */}
                {seekHover.active && !isStandby && (
                  <div
                    id="streamline-seek-hover-bubble"
                    data-testid="streamline-seek-hover-bubble"
                    style={{ left: `${seekHover.percent}%` }}
                    className="pointer-events-none absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-[#161A20] border border-white/15 text-[#FFFFFF] text-[10.5px] font-medium tabular-nums shadow-[0_4px_12px_rgba(0,0,0,0.65)] whitespace-nowrap z-30"
                  >
                    {formatDuration(seekHover.targetSec)}
                  </div>
                )}

                {/* 3px Bar Track */}
                <div className="relative w-full h-[3px] rounded-full bg-[#5E6673]/40 overflow-hidden">
                  <div
                    style={{ width: `${progressPct}%` }}
                    className="h-full rounded-full bg-[#19C6A3] transition-[width] duration-75"
                  />
                </div>

                {/* Dot Thumb on Hover / Active Drag */}
                <div
                  aria-hidden="true"
                  style={{ left: `${progressPct}%` }}
                  className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#19C6A3] shadow-[0_0_8px_rgba(25,198,163,0.7)] transition-opacity duration-150 ${
                    isSeekingDrag
                      ? 'opacity-100 scale-110'
                      : 'opacity-0 group-hover/seek:opacity-100'
                  }`}
                />
              </div>

              <span
                id="streamline-total-time"
                className="text-[11px] font-medium text-[#5E6673] tabular-nums w-9 shrink-0"
              >
                {formatDuration(isStandby ? 0 : track.durationSec)}
              </span>
            </div>
          </div>

          {/* RIGHT: Clock/Date Tiny Above Volume (Hover-Expand) + "···" Overflow Menu (Pitch) */}
          <div className="order-2 md:order-3 flex flex-col items-end justify-center gap-1 min-w-0 shrink-0">
            <StreamlineTinyClock isDocumentHidden={isDocumentHidden} />

            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Volume Control (Hover-Expand Track) */}
              <div className="group/vol flex items-center gap-1.5">
                <button
                  id="streamline-mute-btn"
                  type="button"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    if (volume > 0.01) {
                      onChangeVolume(0);
                    } else {
                      onChangeVolume(lastNonZeroVolumeRef.current || 0.8);
                    }
                  }}
                  aria-label={volume <= 0.01 ? 'Unmute Audio' : 'Mute Audio'}
                  title={`Volume ${volumePct}%`}
                  className="p-1 text-[#A7AFBC] hover:text-[#FFFFFF] transition-colors cursor-pointer"
                >
                  {volume <= 0.01 ? (
                    <VolumeX strokeWidth={2} className="w-4 h-4 text-[#5E6673]" />
                  ) : (
                    <Volume2 strokeWidth={2} className="w-4 h-4" />
                  )}
                </button>

                <div className="relative w-16 sm:w-20 group-hover/vol:w-24 sm:group-hover/vol:w-28 focus-within:w-24 sm:focus-within:w-28 h-5 flex items-center transition-[width] duration-200">
                  <div className="w-full h-[3px] group-hover/vol:h-[5px] rounded-full bg-[#5E6673]/40 overflow-hidden transition-[height] duration-150">
                    <div
                      style={{ width: `${volumePct}%` }}
                      className="h-full rounded-full bg-[#19C6A3]"
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    style={{ left: `${volumePct}%` }}
                    className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#FFFFFF] shadow opacity-0 group-hover/vol:opacity-100 focus-within:opacity-100 transition-opacity duration-150"
                  />
                  <input
                    id="streamline-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumePct}
                    onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
                    aria-label="Volume Slider"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>
              </div>

              {/* "···" Overflow Menu for Pitch Control */}
              <div ref={overflowWrapperRef} className="relative shrink-0">
                <button
                  id="streamline-more-btn"
                  data-testid="streamline-more-btn"
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={overflowOpen}
                  aria-controls="streamline-overflow-menu"
                  aria-label="More Playback Controls (Pitch & Speed)"
                  title="Playback Options (Pitch)"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    setOverflowOpen((prev) => !prev);
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    overflowOpen || pitchPercent !== 0
                      ? 'bg-[#1D232B] text-[#19C6A3]'
                      : 'text-[#A7AFBC] hover:text-[#FFFFFF] hover:bg-[#1D232B]'
                  }`}
                >
                  <MoreHorizontal strokeWidth={2} className="w-4 h-4" />
                </button>

                {overflowOpen && (
                  <div
                    id="streamline-overflow-menu"
                    data-testid="streamline-overflow-menu"
                    role="dialog"
                    aria-label="Playback Pitch & Audio Menu"
                    className="absolute right-0 bottom-full mb-3 w-[236px] rounded-[16px] bg-[#161A20] border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.65)] p-3.5 space-y-3 z-[80]"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-[#FFFFFF]">Playback Pitch</span>
                        <span
                          id="streamline-pitch-value"
                          className="font-semibold text-[#19C6A3] tabular-nums"
                        >
                          {pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
                        </span>
                      </div>
                      <input
                        id="streamline-pitch-slider"
                        type="range"
                        min={-12}
                        max={12}
                        step={1}
                        value={pitchPercent}
                        onChange={(e) => onChangePitch(Number(e.target.value))}
                        aria-label="Playback Pitch Percent"
                        className="w-full accent-[#19C6A3] cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10.5px] text-[#5E6673] tabular-nums">
                        <span>-12%</span>
                        <button
                          type="button"
                          onClick={() => onChangePitch(0)}
                          className="inline-flex items-center gap-1 text-[#A7AFBC] hover:text-[#19C6A3] cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Reset</span>
                        </button>
                        <span>+12%</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[#A7AFBC]">Tempo Mode</span>
                      <div className="flex items-center gap-1 bg-[#0F1115] p-0.5 rounded-lg border border-white/[0.06]">
                        {([33, 45] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => onChangeRpm(r)}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                              rpm === r
                                ? 'bg-[#19C6A3] text-[#0F1115]'
                                : 'text-[#A7AFBC] hover:text-[#FFFFFF]'
                            }`}
                          >
                            {r === 33 ? '1.0×' : '1.35×'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11.5px]">
                      <button
                        type="button"
                        onClick={onToggleLowPowerMode}
                        className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                          lowPowerMode
                            ? 'border-[#19C6A3] text-[#19C6A3] bg-[#19C6A3]/10'
                            : 'border-white/[0.08] text-[#A7AFBC] hover:text-[#FFFFFF]'
                        }`}
                      >
                        Eco Mode
                      </button>
                      <button
                        type="button"
                        onClick={onToggleNightMode}
                        className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                          nightMode
                            ? 'border-[#19C6A3] text-[#19C6A3] bg-[#19C6A3]/10'
                            : 'border-white/[0.08] text-[#A7AFBC] hover:text-[#FFFFFF]'
                        }`}
                      >
                        Dim UI
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </footer>
    );
  }
);

StreamlinePlayerBar.displayName = 'StreamlinePlayerBar';
