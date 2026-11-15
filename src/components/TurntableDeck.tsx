import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Disc3,
  SkipBack,
  Play,
  Pause,
  Square,
  SkipForward,
  Shuffle,
  Repeat,
  Move,
} from 'lucide-react';
import {
  TONEARM_REST_ANGLE_DEG,
  getTonearmShadowPose,
  calculateTonearmTracking,
  calculateSeekTimeFromTonearmAngle,
  calculateVinylSpinTiming,
  triggerScratchHaptic,
  triggerButtonHaptic,
  formatDuration,
  clampSeekTime,
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  TRACK_CHANGE_TIMELINE_MS,
  getTrackChangeStagePose,
  type TrackChangePhase,
  type TonearmMotionPhase,
  type TrackItem,
  type DominantThemePalette,
  type ViewportLayoutMode,
} from '../utils/playerLogic';
import { usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';

const HOLDER_BOX_POS_STORAGE_KEY = 'mvf_holder_box_pos_v2';

export interface TurntableDeckProps {
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
  onChangeVolume: (vol: number) => void;
  onChangeCrossfadeSec: (sec: number) => void;
  onToggleRepeatOne: () => void;
  onToggleShuffle: () => void;
  onToggleVinylCrackle: () => void;
  onToggleNeedleDropCrackle: () => void;
  onToggleLowPowerMode: () => void;
  onToggleNightMode: () => void;
  onToggleFullScreen: () => void;
  onOpenSpotifyModal: () => void;
  onScratch: (intensity: 'light' | 'classic' | 'backspin') => void;
  onDragTonearmToTime: (targetSec: number) => void;
}

const FLOATING_DUST_MOTES = [
  { id: 0, left: '14%', top: '18%', size: 3, delay: '0s', duration: '11s' },
  { id: 1, left: '26%', top: '34%', size: 2.5, delay: '-2.4s', duration: '13s' },
  { id: 2, left: '38%', top: '14%', size: 3.5, delay: '-5.1s', duration: '12s' },
  { id: 3, left: '49%', top: '28%', size: 2.5, delay: '-1.7s', duration: '14s' },
  { id: 4, left: '62%', top: '22%', size: 3, delay: '-4.2s', duration: '10.5s' },
  { id: 5, left: '74%', top: '36%', size: 2.5, delay: '-6.8s', duration: '13.5s' },
  { id: 6, left: '21%', top: '52%', size: 3, delay: '-3.3s', duration: '12.5s' },
  { id: 7, left: '55%', top: '48%', size: 2.5, delay: '-7.5s', duration: '11.5s' },
  { id: 8, left: '82%', top: '19%', size: 3, delay: '-1.1s', duration: '14.5s' },
  { id: 9, left: '33%', top: '64%', size: 2.5, delay: '-4.9s', duration: '12s' },
] as const;

/**
 * Screwed-in Brushed Metal Song Title Plate at the Top Edge of the Wooden Console.
 */
const ScrewedSongTitlePlate = React.memo<{
  title: string;
  artist: string;
  isStandby: boolean;
  compactLandscape?: boolean;
}>(({ title, artist, isStandby, compactLandscape = false }) => {
  return (
    <div
      id="console-title-plate"
      className={`relative w-full ${
        compactLandscape ? 'h-8 px-7' : 'h-10 sm:h-11 [@media(max-height:640px)]:h-9 px-8 sm:px-10'
      } rounded-[3px] overflow-hidden border border-[#d6c7b2]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_7px_rgba(0,0,0,0.6)] flex flex-col items-center justify-center shrink-0`}
    >
      <img
        src="/console/metal-plate.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 w-full h-full object-cover"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-1.5 left-2 w-2 h-2 z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-1.5 right-2 w-2 h-2 z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-1.5 left-2 w-2 h-2 z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-1.5 right-2 w-2 h-2 z-20"
      />

      <div className="relative z-10 flex flex-col items-center justify-center w-full min-w-0 text-center leading-tight">
        <span className="w-full font-display text-xs sm:text-sm font-extrabold tracking-wide uppercase text-[#17130f] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] truncate">
          {isStandby ? 'MAXVINYFY STEREO CONSOLE' : title}
        </span>
        <span className="w-full font-mono text-[9.5px] sm:text-[10.5px] font-bold text-[#2b241d]/90 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] truncate">
          {isStandby ? 'Connect Spotify to Load LP' : artist}
        </span>
      </div>
    </div>
  );
});

/**
 * Embossed Metal Label Plate Screwed into the Console Wood Below Transport Push-Buttons.
 */
const EmbossedLabelPlate = React.memo<{
  label: string;
  compact?: boolean;
  fixedWidthClass?: string;
}>(({ label, compact = false, fixedWidthClass = 'w-full max-w-[50px] sm:max-w-[56px]' }) => (
  <div
    className={`relative rounded-[2px] overflow-hidden border border-[#d6c7b2]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_1px_3px_rgba(0,0,0,0.65)] flex items-center justify-center shrink-0 ${fixedWidthClass} ${
      compact ? 'px-[6px] h-[12px]' : 'px-2 h-[14px]'
    }`}
  >
    <img
      src="/console/metal-plate.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute inset-0 w-full h-full object-cover"
    />
    <img
      src="/console/screw-head.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute left-[2px] top-1/2 -translate-y-1/2 w-[3.5px] h-[3.5px] z-10"
    />
    <img
      src="/console/screw-head.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute right-[2px] top-1/2 -translate-y-1/2 w-[3.5px] h-[3.5px] z-10"
    />
    <span className="relative z-10 font-mono text-[5.5px] sm:text-[6.5px] font-extrabold uppercase tracking-tighter text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] leading-none whitespace-nowrap">
      {label}
    </span>
  </div>
));

/**
 * Photorealistic Round Machined Metal Push-Button on the Front Face.
 * Supports primary central sizing (`isPrimaryCenter`) for Play/Pause and press/hold (`onPointerDownHold`) for Scratch.
 */
const HardwarePushButton = React.memo<{
  id?: string;
  label: string;
  ariaLabel: string;
  title: string;
  disabled?: boolean;
  isPressed?: boolean;
  isPrimaryCenter?: boolean;
  compactLandscape?: boolean;
  onClick: () => void;
  onPointerHoldStart?: () => void;
  onPointerHoldEnd?: () => void;
  children: React.ReactNode;
}>(
  ({
    id,
    label,
    ariaLabel,
    title,
    disabled = false,
    isPressed = false,
    isPrimaryCenter = false,
    compactLandscape = false,
    onClick,
    onPointerHoldStart,
    onPointerHoldEnd,
    children,
  }) => {
    const [momentaryDown, setMomentaryDown] = useState(false);
    const depressed = isPressed || momentaryDown;

    const btnSizeClass = isPrimaryCenter
      ? compactLandscape
        ? 'w-[32px] h-[32px]'
        : 'w-[38px] h-[38px] xl:w-[46px] xl:h-[46px]'
      : compactLandscape
      ? 'w-[24px] h-[24px]'
      : 'w-[28px] h-[28px] xl:w-[34px] xl:h-[34px]';

    const imgSizeClass = isPrimaryCenter
      ? compactLandscape
        ? 'w-[30px] h-[30px]'
        : 'w-[36px] h-[36px] xl:w-[44px] xl:h-[44px]'
      : compactLandscape
      ? 'w-[22px] h-[22px]'
      : 'w-[26px] h-[26px] xl:w-[32px] xl:h-[32px]';

    return (
      <div className="flex flex-col items-center justify-end gap-0.5 shrink-0">
        <div className="flex items-center justify-center">
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            title={title}
            data-pressed={depressed ? 'true' : 'false'}
            onPointerDown={() => {
              if (!disabled) {
                setMomentaryDown(true);
                onPointerHoldStart?.();
              }
            }}
            onPointerUp={() => {
              setMomentaryDown(false);
              onPointerHoldEnd?.();
            }}
            onPointerLeave={() => {
              if (momentaryDown) {
                setMomentaryDown(false);
                onPointerHoldEnd?.();
              }
            }}
            onClick={onClick}
            style={{
              transform: depressed && !disabled ? 'translateY(1.5px)' : 'translateY(0px)',
              transition: 'transform 80ms linear, opacity 120ms linear',
            }}
            className={`relative ${btnSizeClass} flex items-center justify-center rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
              isPrimaryCenter
                ? 'ring-2 ring-amber-400/55 shadow-[0_3px_10px_rgba(0,0,0,0.8)]'
                : ''
            }`}
          >
            <img
              src={depressed ? '/console/pushbutton-down.webp' : '/console/pushbutton-up.webp'}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={`pointer-events-none ${imgSizeClass} object-contain`}
            />
            <span
              className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
                depressed ? 'text-amber-300' : 'text-[#18130e]'
              }`}
            >
              {children}
            </span>
          </button>
        </div>
        <EmbossedLabelPlate
          label={label}
          compact={compactLandscape}
          fixedWidthClass={
            isPrimaryCenter
              ? 'w-[38px] xl:w-[50px]'
              : 'w-[34px] xl:w-[44px]'
          }
        />
      </div>
    );
  }
);

/**
 * Horizontal Recessed Slot-Type Seek Control Placed With the Lyrics Screen in the Top Section.
 */
const FrontFaceSeekSlot = React.memo<{
  durationSec: number;
  isStandby: boolean;
  nightMode: boolean;
  lowPowerMode: boolean;
  compactLandscape?: boolean;
  onSeek: (targetSec: number) => void;
}>(({ durationSec, isStandby, nightMode, lowPowerMode, compactLandscape = false, onSeek }) => {
  const currentSecond = usePlaybackSecond();
  const safeDuration = Math.max(1, durationSec);
  const progressPercent = isStandby
    ? 0
    : Math.min(100, Math.max(0, (currentSecond / safeDuration) * 100));

  const phosphorBright = nightMode ? '#f59e0b' : '#fbbf24';

  return (
    <div
      id="console-seek-slot"
      className={`relative w-full ${
        compactLandscape ? 'h-[16px] px-3.5' : 'h-[20px] [@media(max-height:640px)]:h-[17px] px-4'
      } rounded-[3px] overflow-hidden border border-[#d6c7b2]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_3px_8px_rgba(0,0,0,0.65)] flex items-center gap-2 shrink-0`}
    >
      <img
        src="/console/metal-plate.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute left-[4px] top-1/2 -translate-y-1/2 w-[5.5px] h-[5.5px] z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute right-[4px] top-1/2 -translate-y-1/2 w-[5.5px] h-[5.5px] z-20"
      />

      <span className="relative z-10 font-mono text-[7.5px] sm:text-[8.5px] font-extrabold uppercase tracking-wider text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] shrink-0">
        SEEK
      </span>

      <div className="relative z-10 flex-1 h-full flex items-center min-w-0">
        <div className="relative w-full h-1.5 rounded-full bg-[#090705] border border-white/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.95)] overflow-hidden">
          <div
            style={{
              transformOrigin: 'left center',
              transform: `scaleX(${progressPercent / 100})`,
              backgroundColor: phosphorBright,
            }}
            className="w-full h-full transition-transform duration-150"
          />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center"
        >
          <div
            style={{
              transform: `translateX(${progressPercent}%)`,
            }}
            className="w-full flex items-center transition-transform duration-150"
          >
            <img
              src="/console/fader-cap.webp"
              alt=""
              draggable={false}
              className="w-3.5 h-5 -ml-[7px] object-contain"
            />
          </div>
        </div>

        <input
          id="Front-seek-slider"
          type="range"
          min={0}
          max={safeDuration}
          step={1}
          disabled={isStandby}
          value={isStandby ? 0 : Math.floor(currentSecond)}
          onChange={(e) => {
            triggerButtonHaptic(lowPowerMode);
            onSeek(clampSeekTime(Number(e.target.value), durationSec));
          }}
          aria-label="Seek Track Position"
          className="absolute -inset-y-1 inset-x-0 w-full h-8 opacity-0 cursor-pointer disabled:cursor-not-allowed z-30"
        />
      </div>
    </div>
  );
});

/**
 * Vertically Stacked Shuffle + Repeat Module (Leftmost in Control Row).
 * Has NO separate title/label plates under the buttons, and uses the EXACT same
 * width & height dimensions as `FrontFaceTimeDisplay` (`#console-time-display`).
 */
const StackedShuffleRepeatControl = React.memo<{
  shuffleEnabled: boolean;
  repeatOne: boolean;
  lowPowerMode: boolean;
  dimensionClass: string;
  onToggleShuffle: () => void;
  onToggleRepeatOne: () => void;
}>(({
  shuffleEnabled,
  repeatOne,
  lowPowerMode,
  dimensionClass,
  onToggleShuffle,
  onToggleRepeatOne,
}) => (
  <div
    id="shuffle-repeat-stack"
    role="group"
    aria-label="Stacked Shuffle and Repeat Controls"
    className={`relative ${dimensionClass} box-border rounded-[3px] overflow-hidden border border-[#d6c7b2]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_5px_rgba(0,0,0,0.75)] flex flex-col items-stretch justify-between p-[2px] gap-[2px] shrink-0`}
  >
    <img
      src="/console/metal-plate.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute inset-0 w-full h-full object-cover"
    />

    {/* Top Stacked Button: Shuffle */}
    <button
      id="toggle-shuffle"
      type="button"
      onClick={() => {
        triggerButtonHaptic(lowPowerMode);
        onToggleShuffle();
      }}
      aria-label="Shuffle Queue"
      aria-pressed={shuffleEnabled}
      data-pressed={shuffleEnabled ? 'true' : 'false'}
      title={shuffleEnabled ? 'Shuffle: ON' : 'Shuffle: OFF'}
      className={`relative z-10 flex-1 w-full rounded-[2px] border border-black/75 flex items-center justify-center gap-1 px-1.5 cursor-pointer transition-transform duration-75 active:translate-y-[0.5px] ${
        shuffleEnabled
          ? 'bg-amber-300 text-[#14100c] font-extrabold'
          : 'bg-[#1a140f]/90 text-[#e8dccb] hover:bg-[#261d16]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          shuffleEnabled ? 'bg-[#14100c]' : 'bg-amber-400/35'
        }`}
      />
      <Shuffle strokeWidth={2.2} className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
      <span className="font-mono text-[6.5px] sm:text-[7.5px] font-bold uppercase tracking-tighter leading-none">
        SHUF
      </span>
    </button>

    {/* Bottom Stacked Button: Repeat */}
    <button
      id="toggle-repeat"
      type="button"
      onClick={() => {
        triggerButtonHaptic(lowPowerMode);
        onToggleRepeatOne();
      }}
      aria-label="Repeat Current Track"
      aria-pressed={repeatOne}
      data-pressed={repeatOne ? 'true' : 'false'}
      title={repeatOne ? 'Repeat One: ON' : 'Repeat One: OFF'}
      className={`relative z-10 flex-1 w-full rounded-[2px] border border-black/75 flex items-center justify-center gap-1 px-1.5 cursor-pointer transition-transform duration-75 active:translate-y-[0.5px] ${
        repeatOne
          ? 'bg-amber-300 text-[#14100c] font-extrabold'
          : 'bg-[#1a140f]/90 text-[#e8dccb] hover:bg-[#261d16]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          repeatOne ? 'bg-[#14100c]' : 'bg-amber-400/35'
        }`}
      />
      <Repeat strokeWidth={2.2} className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
      <span className="font-mono text-[6.5px] sm:text-[7.5px] font-bold uppercase tracking-tighter leading-none">
        REPT
      </span>
    </button>
  </div>
));

/**
 * Rightmost Taller Screwed-In Front-Face Retro Segment Time Display (elapsed / total).
 * Shares the EXACT same `dimensionClass` (width & height) as `#shuffle-repeat-stack`.
 */
const FrontFaceTimeDisplay = React.memo<{
  durationSec: number;
  isStandby: boolean;
  nightMode: boolean;
  compactLandscape?: boolean;
  dimensionClass: string;
}>(({ durationSec, isStandby, nightMode, compactLandscape = false, dimensionClass }) => {
  const currentSecond = usePlaybackSecond();
  const phosphorBright = nightMode ? '#f59e0b' : '#fbbf24';

  return (
    <div
      id="console-time-display"
      aria-label="Track Elapsed and Total Time"
      className={`relative ${dimensionClass} box-border rounded-[3px] overflow-hidden border border-[#d6c7b2]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_5px_rgba(0,0,0,0.75)] flex flex-col items-stretch justify-center p-1 shrink-0`}
    >
      <img
        src="/console/metal-plate.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 w-full h-full object-cover"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-[2px] left-[2px] w-1 h-1 z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-[2px] right-[2px] w-1 h-1 z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-[2px] left-[2px] w-1 h-1 z-20"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-[2px] right-[2px] w-1 h-1 z-20"
      />
      <div
        style={{ backgroundColor: nightMode ? '#080502' : '#050705' }}
        className="relative z-10 w-full h-full rounded-[2px] border border-black/90 flex flex-col items-center justify-center px-1"
      >
        <span className="font-mono text-[5.5px] sm:text-[6px] uppercase tracking-widest text-amber-200/55 leading-none mb-0.5">
          TIME / DUR
        </span>
        <span
          style={{ color: phosphorBright }}
          className={`font-mono ${
            compactLandscape ? 'text-[7.5px]' : 'text-[8.5px] sm:text-[9.5px]'
          } font-bold tracking-tighter vfd-phosphor-text whitespace-nowrap leading-none`}
        >
          {isStandby ? '00:00' : formatDuration(currentSecond)}/
          {isStandby ? '00:00' : formatDuration(durationSec)}
        </span>
      </div>
    </div>
  );
});

interface RasterTonearmProps {
  trackId: string;
  durationSec: number;
  isPlaying: boolean;
  isStandby: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  forceTonearmRest?: boolean;
  chassisRef: React.RefObject<HTMLDivElement | null>;
  draggedTonearmAngle: number | null;
  onDragAngleChange: (angle: number | null) => void;
  onDragTonearmToTime: (targetSec: number) => void;
}

const RasterTonearm = React.memo<RasterTonearmProps>(
  ({
    trackId,
    durationSec,
    isPlaying,
    isStandby,
    isDocumentHidden,
    lowPowerMode,
    prefersReducedMotion,
    forceTonearmRest = false,
    chassisRef,
    draggedTonearmAngle,
    onDragAngleChange,
    onDragTonearmToTime,
  }) => {
    const currentSecond = usePlaybackSecond();
    const immediateSnap = lowPowerMode || prefersReducedMotion;

    const [tonearmPhase, setTonearmPhase] = useState<TonearmMotionPhase>(() =>
      isPlaying && !isStandby && !forceTonearmRest ? 'playing' : 'rest'
    );

    const prevPlayingRef = useRef<boolean>(isPlaying && !isStandby && !forceTonearmRest);
    const prevTrackIdRef = useRef<string>(trackId);
    const timersRef = useRef<number[]>([]);

    const clearCueTimers = () => {
      for (const id of timersRef.current) {
        window.clearTimeout(id);
      }
      timersRef.current = [];
    };

    useEffect(() => {
      const shouldBeActive = isPlaying && !isStandby && !forceTonearmRest;
      const wasActive = prevPlayingRef.current;
      const trackChanged = prevTrackIdRef.current !== trackId;

      prevPlayingRef.current = shouldBeActive;
      prevTrackIdRef.current = trackId;

      clearCueTimers();

      if (immediateSnap) {
        setTonearmPhase(shouldBeActive ? 'playing' : 'rest');
        return;
      }

      if (forceTonearmRest) {
        // Step d: Tonearm lifts and swings out of the way to rest while vinyl swap happens
        setTonearmPhase('returning-to-rest');
        return clearCueTimers;
      }

      if (shouldBeActive && (!wasActive || trackChanged)) {
        // Step f: Tonearm swings back in and lowers onto the record
        setTonearmPhase('swinging-to-groove');
        const t1 = window.setTimeout(() => {
          setTonearmPhase('dropping-to-groove');
        }, 180);
        const t2 = window.setTimeout(() => {
          setTonearmPhase('playing');
        }, 320);
        timersRef.current.push(t1, t2);
      } else if (!shouldBeActive && wasActive) {
        setTonearmPhase('lifting-to-rest');
        const t1 = window.setTimeout(() => {
          setTonearmPhase('returning-to-rest');
        }, 200);
        const t2 = window.setTimeout(() => {
          setTonearmPhase('rest');
        }, 560);
        timersRef.current.push(t1, t2);
      } else if (!shouldBeActive) {
        setTonearmPhase('rest');
      }

      return clearCueTimers;
    }, [isPlaying, isStandby, trackId, forceTonearmRest, immediateSnap]);

    useEffect(() => {
      if (
        isPlaying &&
        !isStandby &&
        !forceTonearmRest &&
        currentSecond > 1 &&
        tonearmPhase !== 'playing'
      ) {
        clearCueTimers();
        setTonearmPhase('playing');
      }
    }, [currentSecond, isPlaying, isStandby, forceTonearmRest, tonearmPhase]);

    const effectivePhase: TonearmMotionPhase =
      draggedTonearmAngle !== null
        ? 'dragging'
        : forceTonearmRest
        ? 'returning-to-rest'
        : tonearmPhase;

    const grooveTracking = calculateTonearmTracking(currentSecond, durationSec);
    let activeTonearmAngleDeg = grooveTracking.tonearmAngleDeg;
    if (draggedTonearmAngle !== null) {
      activeTonearmAngleDeg = draggedTonearmAngle;
    } else if (
      forceTonearmRest ||
      (effectivePhase === 'rest' && currentSecond <= 0) ||
      (effectivePhase === 'lifting-to-play' && currentSecond <= 0) ||
      effectivePhase === 'returning-to-rest'
    ) {
      activeTonearmAngleDeg = TONEARM_REST_ANGLE_DEG;
    }

    const shadowPose = getTonearmShadowPose(effectivePhase);

    let armTransition = 'transform 1000ms linear';
    let shadowTransition = 'transform 1000ms linear, opacity 260ms ease';
    if (effectivePhase === 'dragging' || immediateSnap) {
      armTransition = 'none';
      shadowTransition = immediateSnap ? 'none' : 'transform 120ms ease-out, opacity 120ms ease';
    } else if (effectivePhase === 'lifting-to-play' || effectivePhase === 'lifting-to-rest') {
      armTransition = 'transform 220ms ease-out';
      shadowTransition = 'transform 220ms ease-out, opacity 220ms ease-out';
    } else if (effectivePhase === 'swinging-to-groove') {
      armTransition = 'transform 260ms cubic-bezier(0.32, 0.08, 0.24, 1)';
      shadowTransition = 'transform 260ms cubic-bezier(0.32, 0.08, 0.24, 1), opacity 200ms ease';
    } else if (effectivePhase === 'returning-to-rest') {
      armTransition = 'transform 260ms cubic-bezier(0.32, 0.08, 0.24, 1)';
      shadowTransition = 'transform 260ms cubic-bezier(0.32, 0.08, 0.24, 1), opacity 200ms ease';
    } else if (effectivePhase === 'dropping-to-groove') {
      armTransition = 'transform 180ms ease-in';
      shadowTransition = 'transform 180ms ease-in, opacity 180ms ease-in';
    }

    const dragActiveRef = useRef<boolean>(false);

    const computeAngleFromChassisPivot = (clientX: number, clientY: number): number => {
      if (!chassisRef.current) return grooveTracking.tonearmAngleDeg;
      const rect = chassisRef.current.getBoundingClientRect();
      const pivotX = rect.left + rect.width * 0.885;
      const pivotY = rect.top + rect.height * 0.14;
      const dx = pivotX - clientX;
      const dy = Math.max(20, clientY - pivotY);
      const pointerDegFromVertical = (Math.atan2(dx, dy) * 180) / Math.PI;
      const calibratedDeg = pointerDegFromVertical - 1.42;
      return Number(Math.max(6, Math.min(25, calibratedDeg)).toFixed(2));
    };

    const handleTonearmPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (isStandby) return;
      dragActiveRef.current = true;
      triggerButtonHaptic(lowPowerMode);
      const nextAngle = computeAngleFromChassisPivot(e.clientX, e.clientY);
      onDragAngleChange(nextAngle);
      const { targetTimeSec } = calculateSeekTimeFromTonearmAngle(nextAngle, durationSec);
      onDragTonearmToTime(targetTimeSec);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleTonearmPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragActiveRef.current || isStandby) return;
      e.stopPropagation();
      const nextAngle = computeAngleFromChassisPivot(e.clientX, e.clientY);
      onDragAngleChange(nextAngle);
      const { targetTimeSec } = calculateSeekTimeFromTonearmAngle(nextAngle, durationSec);
      onDragTonearmToTime(targetTimeSec);
    };

    const handleTonearmPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragActiveRef.current) return;
      e.stopPropagation();
      const finalAngle = computeAngleFromChassisPivot(e.clientX, e.clientY);
      dragActiveRef.current = false;
      onDragAngleChange(null);
      if (!isStandby) {
        const { targetTimeSec } = calculateSeekTimeFromTonearmAngle(finalAngle, durationSec);
        onDragTonearmToTime(targetTimeSec);
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const microBobActive =
      effectivePhase === 'playing' &&
      !isStandby &&
      !isDocumentHidden &&
      !lowPowerMode &&
      !prefersReducedMotion;

    return (
      <div
        aria-hidden={isStandby ? undefined : false}
        className="pointer-events-none absolute inset-0 z-30"
      >
        <img
          src="/turntable/tonearm-rest.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            left: '90%',
            top: '57%',
            width: '8.5%',
            height: '10%',
          }}
          className="pointer-events-none absolute object-contain"
        />

        <img
          src="/turntable/tonearm-base.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            left: '77.5%',
            top: '3%',
            width: '22%',
            height: '22%',
          }}
          className="pointer-events-none absolute object-contain"
        />

        <div
          aria-hidden="true"
          style={{
            left: '62.06%',
            top: '-5.03%',
            width: '53.0%',
            height: '79%',
            transformOrigin: '49.88% 24.09%',
            transform: `translate(${shadowPose.offsetXpx}px, ${shadowPose.offsetYpx}px) rotate(${activeTonearmAngleDeg}deg)`,
            opacity: shadowPose.opacity,
            transition: shadowTransition,
          }}
          className="pointer-events-none absolute"
        >
          <img
            src="/turntable/tonearm-shadow.webp"
            alt=""
            draggable={false}
            className="pointer-events-none w-full h-full object-contain"
          />
        </div>

        <div
          id="turntable-tonearm-pivot"
          data-tonearm-phase={effectivePhase}
          data-tonearm-angle={activeTonearmAngleDeg}
          style={{
            left: '62.06%',
            top: '-5.03%',
            width: '53.0%',
            height: '79%',
            transformOrigin: '49.88% 24.09%',
            transform: `rotate(${activeTonearmAngleDeg}deg) scale(${shadowPose.armScale})`,
            transition: armTransition,
          }}
          className="pointer-events-none absolute"
        >
          <div className={`w-full h-full ${microBobActive ? 'tonearm-micro-bob' : ''}`}>
            <img
              src="/turntable/tonearm-arm.webp"
              alt="Turntable Tonearm and Cartridge"
              draggable={false}
              className="pointer-events-none w-full h-full object-contain"
            />
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Draggable Turntable Playing Head — Drag across vinyl record to seek track"
            aria-valuemin={0}
            aria-valuemax={durationSec || 180}
            aria-valuenow={
              draggedTonearmAngle !== null
                ? calculateSeekTimeFromTonearmAngle(draggedTonearmAngle, durationSec).targetTimeSec
                : Math.floor(currentSecond)
            }
            title="Click and drag the tonearm headshell across the record to seek"
            onPointerDown={handleTonearmPointerDown}
            onPointerMove={handleTonearmPointerMove}
            onPointerUp={handleTonearmPointerUp}
            style={{
              left: '34%',
              top: '22%',
              width: '32%',
              height: '74%',
              touchAction: 'none',
            }}
            className={`absolute rounded-full ${
              isStandby
                ? 'pointer-events-none'
                : 'pointer-events-auto cursor-grab active:cursor-grabbing'
            }`}
          />
        </div>
      </div>
    );
  }
);

export const TurntableDeck = React.memo<TurntableDeckProps>(
  ({
    track,
    isPlaying,
    isDocumentHidden,
    lowPowerMode,
    nightMode,
    prefersReducedMotion,
    rpm,
    pitchPercent,
    repeatOne,
    shuffleEnabled,
    viewportLayout,
    themePalette,
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    onSeek,
    onToggleRepeatOne,
    onToggleShuffle,
    onScratch,
    onDragTonearmToTime,
  }) => {
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
    const isLandscapeMobile = viewportLayout === 'mobile-landscape';

    const [scratchAngleOffset, setScratchAngleOffset] = useState(0);
    const [isScratching, setIsScratching] = useState(false);
    const [scratchFlash, setScratchFlash] = useState(false);

    // 6-Step Track-Change Animation Sequence State Machine (a -> f)
    const [trackChangePhase, setTrackChangePhase] = useState<TrackChangePhase>('idle');
    const [displayedBoxTrack, setDisplayedBoxTrack] = useState<TrackItem>(track);
    const prevAnimatedTrackRef = useRef<TrackItem>(track);
    const trackChangeTimersRef = useRef<number[]>([]);
    const trackChangePhaseRef = useRef<TrackChangePhase>('idle');
    trackChangePhaseRef.current = trackChangePhase;

    const clearTrackChangeTimers = () => {
      for (const timerId of trackChangeTimersRef.current) {
        window.clearTimeout(timerId);
      }
      trackChangeTimersRef.current = [];
    };

    useEffect(() => {
      return clearTrackChangeTimers;
    }, []);

    // Trigger snappy (~1.56s) 6-step track-change animation when a different song is selected
    // Skippable / non-blocking if user clicks another track mid-animation!
    useEffect(() => {
      const prevTrack = prevAnimatedTrackRef.current;
      if (prevTrack.id === track.id) {
        setDisplayedBoxTrack(track);
        return;
      }
      prevAnimatedTrackRef.current = track;

      // Cancel any in-flight animation immediately so rapid clicks never queue up
      clearTrackChangeTimers();

      if (
        prefersReducedMotion ||
        prevTrack.id === 'standby-empty' ||
        track.id === 'standby-empty'
      ) {
        setDisplayedBoxTrack(track);
        setTrackChangePhase('idle');
        return;
      }

      const wasMidAnimation = trackChangePhaseRef.current !== 'idle';

      if (wasMidAnimation) {
        // User clicked another track mid-animation: cut immediately to bringing the new track's box in!
        setDisplayedBoxTrack(track);
        setTrackChangePhase('bringing-new-box-from-playlist');

        const tSlide = window.setTimeout(() => {
          setTrackChangePhase('sliding-vinyl-to-spindle');
        }, 280);
        const tLower = window.setTimeout(() => {
          setTrackChangePhase('lowering-tonearm');
        }, 580);
        const tIdle = window.setTimeout(() => {
          setTrackChangePhase('idle');
        }, 860);
        trackChangeTimersRef.current.push(tSlide, tLower, tIdle);
        return;
      }

      // Full 6-step sequence (a -> b -> c -> d -> e -> f):
      // Step a & d (0ms): Vinyl lifts/slides off spindle into holder box above it; tonearm lifts & swings to rest
      setDisplayedBoxTrack(prevTrack);
      setTrackChangePhase('lifting-vinyl-to-box');

      // Step b (260ms): Old track's holder box animates/shrinks toward its playlist position
      const tReturnBox = window.setTimeout(() => {
        setTrackChangePhase('returning-box-to-playlist');
      }, TRACK_CHANGE_TIMELINE_MS.liftVinylEndMs);

      // Step c (580ms): Newly selected track's holder box animates out from playlist onto wooden board above turntable
      const tBringNewBox = window.setTimeout(() => {
        setDisplayedBoxTrack(track);
        setTrackChangePhase('bringing-new-box-from-playlist');
      }, TRACK_CHANGE_TIMELINE_MS.returnBoxEndMs);

      // Step e (920ms): New box opens and vinyl record slides out of holder box onto turntable spindle
      const tSlideVinyl = window.setTimeout(() => {
        setTrackChangePhase('sliding-vinyl-to-spindle');
      }, TRACK_CHANGE_TIMELINE_MS.bringNewBoxEndMs);

      // Step f (1260ms): Tonearm swings back in and lowers onto record
      const tLowerArm = window.setTimeout(() => {
        setTrackChangePhase('lowering-tonearm');
      }, TRACK_CHANGE_TIMELINE_MS.slideVinylToSpindleEndMs);

      // Complete (1560ms): Settle back to idle
      const tIdle = window.setTimeout(() => {
        setTrackChangePhase('idle');
      }, TRACK_CHANGE_TIMELINE_MS.lowerTonearmEndMs);

      trackChangeTimersRef.current.push(
        tReturnBox,
        tBringNewBox,
        tSlideVinyl,
        tLowerArm,
        tIdle
      );
    }, [track, lowPowerMode, prefersReducedMotion]);

    const stagePose = useMemo(
      () => getTrackChangeStagePose(trackChangePhase),
      [trackChangePhase]
    );

    const activeBoxTrack = stagePose.showOutgoingTrackInBox ? displayedBoxTrack : track;

    // Multi-URL album art resolution & fallback state for the active holder box track
    const [failedAttemptCount, setFailedAttemptCount] = useState<number>(0);
    const [imgLoaded, setImgLoaded] = useState<boolean>(false);

    // Draggable square album-art holder box position state (offset in px from home position above the vinyl)
    const [holderBoxOffset, setHolderBoxOffset] = useState<{ offsetX: number; offsetY: number }>(() => {
      if (typeof window === 'undefined') return { offsetX: 0, offsetY: 0 };
      try {
        const raw = window.localStorage.getItem(HOLDER_BOX_POS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.offsetX === 'number' && typeof parsed.offsetY === 'number') {
            return { offsetX: parsed.offsetX, offsetY: parsed.offsetY };
          }
        }
      } catch {
        // ignore
      }
      return { offsetX: 0, offsetY: 0 };
    });
    const [isDraggingHolderBox, setIsDraggingHolderBox] = useState<boolean>(false);

    const [draggedTonearmAngle, setDraggedTonearmAngle] = useState<number | null>(null);

    const scratchStartAngleRef = useRef<number>(0);
    const scratchHoldIntervalRef = useRef<number | null>(null);
    const lastDragHapticMsRef = useRef<number>(0);
    const platterRef = useRef<HTMLDivElement | null>(null);
    const chassisRef = useRef<HTMLDivElement | null>(null);
    const plinthBedRef = useRef<HTMLDivElement | null>(null);
    const holderBoxSlotRef = useRef<HTMLDivElement | null>(null);
    const holderBoxRef = useRef<HTMLDivElement | null>(null);
    const holderDragStartRef = useRef<{
      startX: number;
      startY: number;
      initialOffsetX: number;
      initialOffsetY: number;
    } | null>(null);

    // Reset artwork error attempts and loading skeleton when holder box track changes
    const candidateSignature = useMemo(
      () =>
        `${activeBoxTrack.id}|${activeBoxTrack.artworkUrl}|${
          activeBoxTrack.images ? activeBoxTrack.images.map((i) => i.url).join(',') : ''
        }`,
      [activeBoxTrack.id, activeBoxTrack.artworkUrl, activeBoxTrack.images]
    );

    useEffect(() => {
      setFailedAttemptCount(0);
      setImgLoaded(false);
    }, [candidateSignature]);

    const artworkState = useMemo(
      () => resolveActiveArtworkState(activeBoxTrack, failedAttemptCount),
      [activeBoxTrack, failedAttemptCount]
    );

    const isHolderAtHome =
      Math.hypot(holderBoxOffset.offsetX, holderBoxOffset.offsetY) <= 12;

    const persistHolderBoxOffset = (next: { offsetX: number; offsetY: number }) => {
      setHolderBoxOffset(next);
      try {
        window.localStorage.setItem(HOLDER_BOX_POS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    };

    const effectiveRate = useMemo(() => {
      const base = rpm === 45 ? 45 / 33.333 : 1;
      return Number((base * Math.max(0.5, 1 + pitchPercent / 100)).toFixed(3));
    }, [rpm, pitchPercent]);

    const spinDurationSec = useMemo(() => {
      return Number((1.8 / effectiveRate).toFixed(2));
    }, [effectiveRate]);

    const spinTimingFunction = useMemo(
      () => calculateVinylSpinTiming(spinDurationSec, lowPowerMode),
      [spinDurationSec, lowPowerMode]
    );

    const shouldSpin =
      isPlaying && !isScratching && !isStandby && !isDocumentHidden && !prefersReducedMotion;

    const shouldAnimateDustMotes =
      isPlaying && !isDocumentHidden && !lowPowerMode && !prefersReducedMotion;

    const handleTriggerScratch = (intensity: 'light' | 'classic' | 'backspin') => {
      onScratch(intensity);
      triggerScratchHaptic(lowPowerMode, intensity);
      setScratchFlash(true);
      const delta = intensity === 'backspin' ? -145 : intensity === 'classic' ? -68 : 42;
      setScratchAngleOffset((prev) => (prev + delta) % 360);
      window.setTimeout(() => setScratchFlash(false), 320);
    };

    const handleScratchButtonHoldStart = () => {
      handleTriggerScratch('classic');
      if (scratchHoldIntervalRef.current !== null) {
        window.clearInterval(scratchHoldIntervalRef.current);
      }
      scratchHoldIntervalRef.current = window.setInterval(() => {
        handleTriggerScratch('light');
      }, 220);
    };

    const handleScratchButtonHoldEnd = () => {
      if (scratchHoldIntervalRef.current !== null) {
        window.clearInterval(scratchHoldIntervalRef.current);
        scratchHoldIntervalRef.current = null;
      }
    };

    useEffect(() => {
      return () => {
        if (scratchHoldIntervalRef.current !== null) {
          window.clearInterval(scratchHoldIntervalRef.current);
        }
      };
    }, []);

    // Pointer drag handlers for the SQUARE Album-Art Holder Box sitting above the vinyl
    const computeClampedHolderOffset = (rawOffsetX: number, rawOffsetY: number) => {
      const boardEl = plinthBedRef.current;
      const slotEl = holderBoxSlotRef.current;
      const boxEl = holderBoxRef.current;
      if (!boardEl || !slotEl) {
        return {
          offsetX: Math.round(rawOffsetX),
          offsetY: Math.round(rawOffsetY),
          isAtHomePosition: Math.hypot(rawOffsetX, rawOffsetY) <= 12,
        };
      }
      const boardRect = boardEl.getBoundingClientRect();
      const slotRect = slotEl.getBoundingClientRect();
      const boxSize = boxEl ? boxEl.getBoundingClientRect().width : slotRect.width;
      const homeCenterX = slotRect.left - boardRect.left + slotRect.width / 2;
      const homeCenterY = slotRect.top - boardRect.top + slotRect.height / 2;

      return clampHolderBoxDragOffset({
        offsetX: rawOffsetX,
        offsetY: rawOffsetY,
        boardWidth: boardRect.width,
        boardHeight: boardRect.height,
        boxSize,
        homeCenterX,
        homeCenterY,
      });
    };

    const handleHolderBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      triggerButtonHaptic(lowPowerMode);
      setIsDraggingHolderBox(true);
      holderDragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialOffsetX: holderBoxOffset.offsetX,
        initialOffsetY: holderBoxOffset.offsetY,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleHolderBoxPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingHolderBox || !holderDragStartRef.current) return;
      e.stopPropagation();
      const dx = e.clientX - holderDragStartRef.current.startX;
      const dy = e.clientY - holderDragStartRef.current.startY;
      const clamped = computeClampedHolderOffset(
        holderDragStartRef.current.initialOffsetX + dx,
        holderDragStartRef.current.initialOffsetY + dy
      );
      setHolderBoxOffset({ offsetX: clamped.offsetX, offsetY: clamped.offsetY });
    };

    const handleHolderBoxPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingHolderBox || !holderDragStartRef.current) return;
      e.stopPropagation();
      const dx = e.clientX - holderDragStartRef.current.startX;
      const dy = e.clientY - holderDragStartRef.current.startY;
      const clamped = computeClampedHolderOffset(
        holderDragStartRef.current.initialOffsetX + dx,
        holderDragStartRef.current.initialOffsetY + dy
      );
      setIsDraggingHolderBox(false);
      holderDragStartRef.current = null;
      persistHolderBoxOffset({ offsetX: clamped.offsetX, offsetY: clamped.offsetY });
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    // Rotational scratch handlers on the plain vinyl record (vinyl stays fixed on spindle, never translates on drag)
    const handlePlatterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!platterRef.current) return;
      const rect = platterRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      scratchStartAngleRef.current =
        Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      setIsScratching(true);
      onScratch('light');
      triggerScratchHaptic(lowPowerMode, 'light');
      lastDragHapticMsRef.current = performance.now();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handlePlatterPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isScratching || !platterRef.current) return;
      const rect = platterRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      const delta = currentAngle - scratchStartAngleRef.current;
      scratchStartAngleRef.current = currentAngle;
      setScratchAngleOffset((prev) => (prev + delta) % 360);
      if (Math.abs(delta) > 14) {
        onScratch('classic');
        const now = performance.now();
        if (now - lastDragHapticMsRef.current >= 140) {
          lastDragHapticMsRef.current = now;
          triggerScratchHaptic(lowPowerMode, 'classic');
        }
      }
    };

    const handlePlatterPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isScratching) return;
      setIsScratching(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    // Shared exact dimensions for leftmost Stacked Shuffle/Repeat and rightmost Time Display
    const matchedEndModuleDimensionClass = isLandscapeMobile
      ? 'w-[66px] h-[36px]'
      : 'w-[70px] xl:w-[92px] h-[40px] xl:h-[46px]';

    const stageAnimTransition =
      lowPowerMode || prefersReducedMotion
        ? 'none'
        : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease';

    return (
      <section
        id="turntable-stage-panel"
        data-track-change-phase={trackChangePhase}
        aria-label="Unified 3D Wooden Turntable Console"
        className="walnut-furniture-cabinet panel-contain relative flex flex-col justify-between select-none w-full h-full min-h-0 overflow-hidden"
      >
        {/* Four Corner Slot-Head Screws on the Raised Walnut Frame (Matching TV & Playlist) */}
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 left-1 w-2.5 h-2.5 z-50 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 right-1 w-2.5 h-2.5 z-50 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 left-1 w-2.5 h-2.5 z-50 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 right-1 w-2.5 h-2.5 z-50 opacity-85"
        />

        {/* Static Warm Top-Left Studio Lamp Light Gradient Over the Whole Scene */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 bg-[radial-gradient(circle_at_14%_10%,rgba(255,214,153,0.16)_0%,rgba(255,190,110,0.05)_42%,transparent_75%)]"
        />

        {/* Floating Dust Motes Lit by the Lamp */}
        {!lowPowerMode && (
          <div
            id="console-dust-motes"
            aria-hidden="true"
            data-motes-running={shouldAnimateDustMotes ? 'true' : 'false'}
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
          >
            {FLOATING_DUST_MOTES.map((mote) => (
              <span
                key={mote.id}
                style={{
                  left: mote.left,
                  top: mote.top,
                  width: `${mote.size}px`,
                  height: `${mote.size}px`,
                  animationDelay: mote.delay,
                  animationDuration: mote.duration,
                  animationPlayState: shouldAnimateDustMotes ? 'running' : 'paused',
                }}
                className="console-dust-mote absolute rounded-full bg-amber-100/60"
              />
            ))}
          </div>
        )}

        {/* =====================================================================
            UPPER WOODEN TOP DECK SURFACE (Matching TV Walnut Grain & Bevel Frame)
           ===================================================================== */}
        <div
          id="console-top-surface"
          className={`relative flex-1 min-h-0 w-full flex flex-col justify-between ${
            isLandscapeMobile ? 'p-1.5 gap-1' : 'p-2 sm:p-2.5 gap-1'
          } overflow-hidden`}
        >
          {/* Photorealistic Walnut Top Deck Texture */}
          <img
            src="/console/console-top-wood.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
          />

          {/* Subtle Static Dust-and-Wear Overlay on the Wood (~9% Opacity) */}
          <img
            src="/turntable/vinyl-dust-overlay.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ opacity: 0.09 }}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
          />

          {/* Mitered Walnut Frame Inner Bevel Shadow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 shadow-[inset_2px_2px_6px_rgba(255,220,175,0.22),inset_-3px_-4px_12px_rgba(0,0,0,0.72)]"
          />

          {/* 1. TOP EDGE: Full-Width Two-Line Screwed-In Brushed-Metal Song Title Plate */}
          <div className="relative z-20 shrink-0 w-full">
            <ScrewedSongTitlePlate
              title={track.title}
              artist={track.artist}
              isStandby={isStandby}
              compactLandscape={isLandscapeMobile}
            />
          </div>

          {/* 2. MIDDLE: Separate Square Album-Art Vinyl Box Holder (Directly Above) + Plain Spinning Vinyl Record (Below) */}
          <div className="relative z-20 flex-1 min-h-0 w-full flex flex-col justify-between gap-1">
            <div
              id="turntable-plinth-bed"
              ref={plinthBedRef}
              style={
                {
                  containerType: 'size',
                  '--holder-box-size': 'clamp(42px, min(21cqw, 25cqh), 124px)',
                  '--chassis-size': 'clamp(104px, min(76cqw, 71cqh), 410px)',
                } as React.CSSProperties
              }
              className="relative flex-1 min-h-0 min-w-0 flex flex-col items-center justify-evenly overflow-hidden"
            >
              {/* =====================================================================
                  SEPARATE SQUARE ALBUM-ART VINYL BOX HOLDER SITTING ABOVE THE VINYL RECORD
                  - Draggable square holder box itself (#album-art-holder-box / #album-art-cover)
                  - Animates back to playlist & brings new track's box out during track changes
                 ===================================================================== */}
              <div
                id="album-art-holder-home-slot"
                ref={holderBoxSlotRef}
                style={{
                  width: 'var(--holder-box-size)',
                  height: 'var(--holder-box-size)',
                }}
                className="relative z-30 flex items-center justify-center shrink-0"
              >
                <div
                  id="album-art-holder-box"
                  ref={holderBoxRef}
                  data-holder-box="true"
                  data-at-home={isHolderAtHome ? 'true' : 'false'}
                  data-offset-x={holderBoxOffset.offsetX}
                  data-offset-y={holderBoxOffset.offsetY}
                  data-track-change-phase={trackChangePhase}
                  onPointerDown={handleHolderBoxPointerDown}
                  onPointerMove={handleHolderBoxPointerMove}
                  onPointerUp={handleHolderBoxPointerUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    triggerButtonHaptic(lowPowerMode);
                    persistHolderBoxOffset({ offsetX: 0, offsetY: 0 });
                  }}
                  title="Drag the square vinyl box holder anywhere on the wooden board (Double-click to snap back above turntable)"
                  style={{
                    transform: `translate3d(${holderBoxOffset.offsetX}px, ${holderBoxOffset.offsetY}px, 0)`,
                    touchAction: 'none',
                  }}
                  className="group relative w-full h-full cursor-grab active:cursor-grabbing select-none"
                >
                  {/* Track-Change Stage Pose Wrapper (Animates holder box to/from playlist on song change) */}
                  <div
                    id="album-art-cover"
                    data-offset-x={holderBoxOffset.offsetX}
                    data-offset-y={holderBoxOffset.offsetY}
                    data-artwork-url={artworkState.activeUrl || ''}
                    data-artwork-attempt={artworkState.attemptIndex}
                    data-slot-open={stagePose.holderSlotOpen ? 'true' : 'false'}
                    style={{
                      transform: stagePose.holderBoxTransform,
                      opacity: stagePose.holderBoxOpacity,
                      transition: isDraggingHolderBox ? 'none' : stageAnimTransition,
                    }}
                    className="relative w-full h-full rounded-[4px] p-[3px] bg-gradient-to-b from-[#6e4726] via-[#3d2412] to-[#1f1209] border-2 border-[#b88958] shadow-[0_8px_20px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,228,190,0.45)] flex flex-col items-center justify-center overflow-visible"
                  >
                    {/* Four Corner Brass Rivet Screws on the Square Vinyl Box Holder Frame */}
                    <img
                      src="/console/screw-head.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute top-[2px] left-[2px] w-1.5 h-1.5 z-30 opacity-90"
                    />
                    <img
                      src="/console/screw-head.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute top-[2px] right-[2px] w-1.5 h-1.5 z-30 opacity-90"
                    />
                    <img
                      src="/console/screw-head.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute bottom-[2px] left-[2px] w-1.5 h-1.5 z-30 opacity-90"
                    />
                    <img
                      src="/console/screw-head.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute bottom-[2px] right-[2px] w-1.5 h-1.5 z-30 opacity-90"
                    />

                    {/* Bottom LP Sleeve Opening Slot (Opens When Vinyl Slides In/Out of Holder Box) */}
                    <div
                      id="holder-box-open-slot"
                      aria-hidden="true"
                      style={{
                        transform: stagePose.holderSlotOpen ? 'scaleY(1.8)' : 'scaleY(1)',
                        opacity: stagePose.holderSlotOpen ? 1 : 0.45,
                        transition: stageAnimTransition,
                      }}
                      className="pointer-events-none absolute -bottom-[3px] inset-x-[12%] h-[4px] rounded-full bg-[#090604] border border-amber-300/55 z-30"
                    />

                    {/* Inner Square Album Sleeve Window */}
                    <div className="relative w-full h-full rounded-[2px] overflow-hidden border border-black/85 bg-[#14100d] flex items-center justify-center">
                      {/* Loading Skeleton While Artwork Loads */}
                      {!artworkState.isPlaceholder && !imgLoaded && (
                        <div
                          id="album-art-skeleton"
                          aria-hidden="true"
                          className="absolute inset-0 z-10 bg-gradient-to-br from-[#2a221b] via-[#1c1612] to-[#120e0b] flex items-center justify-center"
                        >
                          <Disc3 strokeWidth={1.5} className="w-5 h-5 text-amber-300/45" />
                        </div>
                      )}

                      {/* Resolved Track Artwork with Multi-Candidate onError Fallback */}
                      {!artworkState.isPlaceholder && artworkState.activeUrl ? (
                        <img
                          id="album-art-img"
                          key={`${activeBoxTrack.id}-${artworkState.attemptIndex}-${artworkState.activeUrl}`}
                          ref={(el) => {
                            if (el && el.complete && el.naturalWidth > 0 && !imgLoaded) {
                              setImgLoaded(true);
                            }
                          }}
                          src={artworkState.activeUrl}
                          alt={`${activeBoxTrack.title} album art`}
                          referrerPolicy="no-referrer"
                          draggable={false}
                          onLoad={() => setImgLoaded(true)}
                          onError={() => {
                            setImgLoaded(false);
                            setFailedAttemptCount((prev) => prev + 1);
                          }}
                          className="relative z-10 w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        /* Generic Vinyl-Sleeve Placeholder Graphic When All Image Candidates Fail or Standby */
                        <div
                          id="album-art-vinyl-placeholder"
                          style={{ background: themePalette.tvCabinetGradient }}
                          className="relative z-10 w-full h-full flex flex-col items-center justify-center p-1.5 text-center"
                        >
                          <Disc3
                            strokeWidth={1.75}
                            style={{ color: themePalette.lightHex }}
                            className="w-4 h-4 mb-0.5 opacity-85"
                          />
                          <p className="font-display text-[7.5px] sm:text-[9px] font-bold text-white/90 leading-tight line-clamp-1 px-1">
                            {isStandby ? 'MaxVinyFy' : activeBoxTrack.title}
                          </p>
                          <p className="font-mono text-[6.5px] sm:text-[7.5px] text-white/65 leading-tight line-clamp-1 px-1">
                            {isStandby ? 'LP Holder' : activeBoxTrack.artist}
                          </p>
                        </div>
                      )}

                      {/* Subtle Sleeve Gloss & Texture Overlay */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(135deg,rgba(255,255,255,0.16)_0%,transparent_42%,rgba(0,0,0,0.38)_100%)]"
                      />
                    </div>

                    {/* Hover / Active Drag Affordance Badge on the Square Holder Box */}
                    <div
                      id="album-art-drag-handle"
                      aria-hidden="true"
                      className={`pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 z-40 px-1.5 py-[1px] rounded-[2px] bg-black/90 border border-amber-300/65 text-amber-200 font-mono text-[6.5px] font-bold uppercase tracking-wider flex items-center gap-0.5 shadow-md whitespace-nowrap transition-opacity duration-150 ${
                        isDraggingHolderBox ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Move className="w-2.5 h-2.5 text-amber-300" />
                      <span>{isHolderAtHome ? 'DRAG BOX' : 'LP BOX'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* =====================================================================
                  FIXED TURNTABLE PLATTER + PLAIN SPINNING VINYL RECORD BELOW THE HOLDER BOX
                  - Vinyl record has NO album art on it (just record grooves, plain label, and spindle hole)
                  - Vinyl spindle position is fixed/non-draggable; during track change, vinyl slides into/out of holder box above it
                 ===================================================================== */}
              <div
                id="turntable-chassis-square"
                ref={chassisRef}
                style={{
                  width: 'var(--chassis-size)',
                  height: 'var(--chassis-size)',
                }}
                className={`relative z-20 shrink-0 transition-transform duration-150 ${
                  scratchFlash ? 'scale-[0.99]' : ''
                }`}
              >
                {/* Static Platter + Metallic Strobe Rim */}
                <img
                  src="/turntable/platter-mat.webp"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  style={{
                    left: '0%',
                    top: '2%',
                    width: '96%',
                    height: '96%',
                  }}
                  className="pointer-events-none absolute object-contain"
                />

                {/* PLAIN ROTATING VINYL RECORD LAYER (Slides into/out of the Holder Box Above on Track Change) */}
                <div
                  id="vinyl-record-transition-wrapper"
                  data-track-change-phase={trackChangePhase}
                  style={{
                    left: '3%',
                    top: '5%',
                    width: '90%',
                    height: '90%',
                    transform: stagePose.vinylTransform,
                    opacity: stagePose.vinylOpacity,
                    transition: stageAnimTransition,
                  }}
                  className="absolute z-10"
                >
                  <div
                    style={{
                      transform: `rotate(${scratchAngleOffset}deg)`,
                      transition: isScratching
                        ? 'none'
                        : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className="w-full h-full rounded-full"
                  >
                    <div
                      id="vinyl-record-spin-layer"
                      ref={platterRef}
                      data-plain-vinyl="true"
                      onPointerDown={handlePlatterPointerDown}
                      onPointerMove={handlePlatterPointerMove}
                      onPointerUp={handlePlatterPointerUp}
                      role="slider"
                      aria-label="Interactive Vinyl Platter — Drag to Scratch Record"
                      aria-valuenow={Math.round(scratchAngleOffset)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleTriggerScratch('classic');
                        }
                      }}
                      style={{
                        animationDuration: `${spinDurationSec}s`,
                        animationTimingFunction: spinTimingFunction,
                        animationPlayState: shouldSpin ? 'running' : 'paused',
                        touchAction: 'none',
                      }}
                      className="vinyl-platter-gpu-spin relative w-full h-full rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden"
                    >
                      <img
                        src="/turntable/vinyl-record.webp"
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                      />

                      {/* Plain Vintage Record Center Label & Spindle Hole (No Album Art Overlaid on the Vinyl) */}
                      <div
                        id="vinyl-plain-center-label"
                        style={{ background: themePalette.tvCabinetGradient }}
                        className="relative z-10 w-[34%] h-[34%] rounded-full overflow-hidden border border-black/80 flex items-center justify-center"
                      >
                        <span className="font-display font-bold text-[8.5px] sm:text-[10px] text-white/85 -translate-y-2.5 sm:-translate-y-3">
                          MVF
                        </span>
                        <img
                          src="/turntable/vinyl-label-paper.webp"
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                          style={{ opacity: 0.32 }}
                          className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gradient-to-br from-zinc-200 via-zinc-400 to-zinc-700 border border-black/85 flex items-center justify-center">
                          <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[#090807]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* STATIC Anisotropic Lamp Light Reflection Overlay */}
                <img
                  id="vinyl-static-light-overlay"
                  src="/turntable/vinyl-light-overlay.png"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  style={{
                    left: '3%',
                    top: '5%',
                    width: '90%',
                    height: '90%',
                    opacity: stagePose.vinylOpacity,
                    transition: 'opacity 200ms ease',
                  }}
                  className="pointer-events-none absolute object-contain z-20"
                />

                {/* STATIC Dust Specks, Hairline Scratches & Fingerprints Overlay (~10% Opacity) */}
                <img
                  id="vinyl-static-dust-overlay"
                  src="/turntable/vinyl-dust-overlay.png"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  style={{
                    left: '3%',
                    top: '5%',
                    width: '90%',
                    height: '90%',
                    opacity: 0.1 * stagePose.vinylOpacity,
                  }}
                  className="pointer-events-none absolute object-contain z-20"
                />

                {/* Photoreal Top-Down Tonearm (Lifts & swings to rest during track-change swap, then lowers onto record) */}
                <RasterTonearm
                  trackId={track.id}
                  durationSec={track.durationSec}
                  isPlaying={isPlaying}
                  isStandby={isStandby}
                  isDocumentHidden={isDocumentHidden}
                  lowPowerMode={lowPowerMode}
                  prefersReducedMotion={prefersReducedMotion}
                  forceTonearmRest={stagePose.forceTonearmRest}
                  chassisRef={chassisRef}
                  draggedTonearmAngle={draggedTonearmAngle}
                  onDragAngleChange={setDraggedTonearmAngle}
                  onDragTonearmToTime={onDragTonearmToTime}
                />
              </div>
            </div>

            {/* Full-Width VFD Lyrics Strip + Matching-Width Slot Seek Control */}
            <div
              id="lyrics-and-seek-slot"
              className="relative z-20 w-full flex flex-col items-stretch gap-1 shrink-0"
            >
              <div
                id="lyrics-strip-slot"
                className={`w-full ${
                  isLandscapeMobile
                    ? 'h-[76px]'
                    : 'h-[92px] sm:h-[98px] [@media(max-height:640px)]:h-[82px]'
                } shrink-0`}
              >
                <SyncedLyricsPanel
                  track={track}
                  isStandby={isStandby}
                  isPlaying={isPlaying}
                  isDocumentHidden={isDocumentHidden}
                  lowPowerMode={lowPowerMode}
                  nightMode={nightMode}
                  playbackRate={effectiveRate}
                  prefersReducedMotion={prefersReducedMotion}
                  themePalette={themePalette}
                  onSeek={onSeek}
                  className="w-full h-full"
                />
              </div>

              <FrontFaceSeekSlot
                durationSec={track.durationSec}
                isStandby={isStandby}
                nightMode={nightMode}
                lowPowerMode={lowPowerMode}
                compactLandscape={isLandscapeMobile}
                onSeek={onSeek}
              />
            </div>
          </div>
        </div>

        {/* =====================================================================
            RAISED WALNUT CHAMFER DIVIDER BETWEEN TOP BOARD AND FRONT CONTROL ROW
           ===================================================================== */}
        <div
          aria-hidden="true"
          className="relative z-20 h-2 w-full bg-[linear-gradient(180deg,rgba(255,214,165,0.28)_0%,rgba(122,78,44,0.88)_48%,rgba(28,16,9,0.96)_100%)] border-t border-amber-100/25 shrink-0"
        />

        {/* =====================================================================
            REBUILT SINGLE TURNTABLE CONTROL ROW (Left-to-Right, Bottom-Aligned):
            1. Leftmost: Stacked Shuffle + Repeat (#shuffle-repeat-stack, bottom-aligned with playback titles)
            2. Next: Previous-track button (#btn-prev-track)
            3. Next: Scratch disc button (#btn-scratch-disc — press/hold DJ scratch effect)
            4. Center: Large Play/Pause primary toggle button (#btn-play-pause)
            5. Next: Stop button (#btn-stop-playback) & Next-track button (#btn-next-track)
            6. Rightmost: Taller Time/Duration display (#console-time-display, bottom-aligned with playback titles)
           ===================================================================== */}
        <div
          id="console-front-apron"
          aria-label="Console Front Face Playback Hardware"
          className={`relative z-20 w-full ${
            isLandscapeMobile ? 'px-2 py-1' : 'px-2.5 sm:px-4 py-1.5 sm:py-2'
          } shrink-0 overflow-hidden`}
        >
          <img
            src="/console/console-front-wood.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.25)_0%,rgba(0,0,0,0.62)_100%)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.75)]"
          />

          <div
            id="turntable-control-row"
            className="relative z-10 w-full flex items-end justify-between gap-1 xl:gap-2"
          >
            {/* 1. Leftmost: Vertically Stacked Shuffle + Repeat (Bottom-Aligned with Playback Control Titles) */}
            <StackedShuffleRepeatControl
              shuffleEnabled={shuffleEnabled}
              repeatOne={repeatOne}
              lowPowerMode={lowPowerMode}
              dimensionClass={matchedEndModuleDimensionClass}
              onToggleShuffle={onToggleShuffle}
              onToggleRepeatOne={onToggleRepeatOne}
            />

            {/* Center Transport Cluster: Prev -> Scratch -> Large Center Play/Pause -> Stop + Next */}
            <div className="flex-1 flex items-end justify-center gap-1 xl:gap-2.5 min-w-0">
              {/* 2. Previous Track Button */}
              <HardwarePushButton
                id="btn-prev-track"
                label="PREV"
                disabled={isStandby}
                compactLandscape={isLandscapeMobile}
                ariaLabel="Previous Track"
                title="Previous Track"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onPrevious();
                }}
              >
                <SkipBack strokeWidth={2.2} className="w-3.5 h-3.5" />
              </HardwarePushButton>

              {/* 3. Scratch Disc Button (Manual DJ Scratch/Stutter Effect on Press/Hold or Click) */}
              <HardwarePushButton
                id="btn-scratch-disc"
                label="SCRATCH"
                disabled={isStandby}
                compactLandscape={isLandscapeMobile}
                ariaLabel="Scratch Vinyl Disc (Press or Hold for DJ Scratch Effect)"
                title="Press or Hold to Scratch Vinyl Record"
                onPointerHoldStart={handleScratchButtonHoldStart}
                onPointerHoldEnd={handleScratchButtonHoldEnd}
                onClick={() => {
                  handleTriggerScratch('classic');
                }}
              >
                <Disc3 strokeWidth={2.2} className="w-3.5 h-3.5" />
              </HardwarePushButton>

              {/* 4. Center Primary Control: Large Single Play/Pause Button */}
              <HardwarePushButton
                id="btn-play-pause"
                label={isPlaying ? 'PAUSE' : 'PLAY'}
                disabled={isStandby}
                isPressed={isPlaying}
                isPrimaryCenter
                compactLandscape={isLandscapeMobile}
                ariaLabel={isPlaying ? 'Pause Playback' : 'Start Playback'}
                title={isPlaying ? 'Pause' : 'Play'}
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onTogglePlay();
                }}
              >
                {isPlaying ? (
                  <Pause strokeWidth={2.5} className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                ) : (
                  <Play strokeWidth={2.5} className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
                )}
              </HardwarePushButton>

              {/* 5. Stop Button & Next-Track Button Placed Together to the Right of Play/Pause */}
              <div className="flex items-end gap-1 sm:gap-2">
                <HardwarePushButton
                  id="btn-stop-playback"
                  label="STOP"
                  disabled={isStandby}
                  compactLandscape={isLandscapeMobile}
                  ariaLabel="Stop Playback and Return Tonearm"
                  title="Stop Playback"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onStop();
                  }}
                >
                  <Square strokeWidth={2.2} className="w-3 h-3 fill-current" />
                </HardwarePushButton>

                <HardwarePushButton
                  id="btn-next-track"
                  label="NEXT"
                  disabled={isStandby}
                  compactLandscape={isLandscapeMobile}
                  ariaLabel="Next Track"
                  title="Next Track"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onNext();
                  }}
                >
                  <SkipForward strokeWidth={2.2} className="w-3.5 h-3.5" />
                </HardwarePushButton>
              </div>
            </div>

            {/* 6. Rightmost: Taller Time/Duration Display (Bottom-Aligned with Playback Control Titles) */}
            <FrontFaceTimeDisplay
              durationSec={track.durationSec}
              isStandby={isStandby}
              nightMode={nightMode}
              compactLandscape={isLandscapeMobile}
              dimensionClass={matchedEndModuleDimensionClass}
            />
          </div>
        </div>
      </section>
    );
  }
);

