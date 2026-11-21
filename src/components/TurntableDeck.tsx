import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Disc3,
} from 'lucide-react';
import {
  formatDuration,
  calculateSeekTimeFromTonearmAngle,
  calculateResponsiveTonearmGeometry,
  getTonearmShadowPose,
  calculateVinylSpinTiming,
  triggerButtonHaptic,
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  calculateHolderBoxDragTiltDeg,
  calculateHolderBoxRestTiltDeg,
  calculatePitchThumbTopPercent,
  verticalPointerRatioToPitch,
  calculateVolumeThumbTopPercent,
  verticalPointerRatioToVolume,
  calculateRightDockedVinylCenterX,
  getTrackChangeStagePose,
  TRACK_CHANGE_TIMELINE_MS,
  TONEARM_ASSET_METRICS,
  TONEARM_ASSEMBLY_OFFSET_X_PX,
  TONEARM_ASSEMBLY_OFFSET_Y_PX,
  applyTonearmAssemblyOffset,
  calculateVinylDiameterFromBounds,
  calculateHolderBoxSizeFromVinyl,
  resolveTonearmMotionOnPlayStateChange,
  formatConsoleClockAndDate,
  generateDustParticles,
  stepDustParticles,
  type DustParticle,
  type TrackItem,
  type YouTubeGrabFrame,
  type DominantThemePalette,
  type ViewportLayoutMode,
  type TonearmMotionPhase,
  type TrackChangePhase,
} from '../utils/playerLogic';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import { useDoubleTapHideArt } from '../hooks/useDoubleTapHideArt';

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
  hideBoxArt?: boolean;
  onToggleHideBoxArt?: () => void;
  isDeviceOnlyMode?: boolean;
  onToggleDeviceOnlyMode?: () => void;
  isTvFullscreen?: boolean;
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
  parentPlaylistCoverUrl?: string;
  onResolvedPerTrackArtwork?: (trackId: string, artworkUrl: string) => void;
  onResolvedTrackMetadata?: (
    trackId: string,
    artworkUrl: string,
    videoId: string,
    frames: YouTubeGrabFrame[]
  ) => void;
  playlistTracks?: TrackItem[];
  playlistName?: string;
  playlists?: Array<{
    id: string;
    name: string;
    coverArtUrl?: string;
    tracks: TrackItem[];
  }>;
  activePlaylistId?: string;
  onSelectPlaylist?: (playlistId: string) => void;
  onSelectTrack?: (trackId: string) => void;
  seekEvent?: { timeSec: number; nonce: number };
  onPausePlayback?: () => void;
  onResumePlaybackAt?: (timeSec: number) => void;
  onTvFullscreenChange?: (entering: boolean) => void;
}

const PRE_RENDERED_GROOVE_RINGS = Array.from({ length: 14 }, (_, idx) => {
  const pct = 18 + idx * 2.1;
  const isTrackGap = idx % 4 === 2;
  return {
    id: idx,
    insetPct: pct,
    opacity: isTrackGap ? 0.32 : idx % 2 === 0 ? 0.14 : 0.07,
    widthPx: isTrackGap ? 1.5 : 1,
  };
});

/**
 * Screwed-in Brushed-Metal Label Plate Under Front-Apron Controls
 */
const HardwareEngravedPlate = React.memo<{ label: string; compact?: boolean }>(
  ({ label, compact = false }) => (
    <div
      data-label-plate="true"
      className={`relative ${
        compact ? 'w-[34px] h-[10px]' : 'w-[38px] lg:w-[46px] h-[12px]'
      } rounded-[2px] overflow-hidden border border-[#d6c7b2]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.75)] flex items-center justify-center shrink-0`}
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
        className="pointer-events-none absolute left-[2px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] z-10"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute right-[2px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] z-10"
      />
      <span
        className={`relative z-10 font-mono ${
          compact ? 'text-[4.5px]' : 'text-[5.5px] sm:text-[6px]'
        } font-extrabold uppercase tracking-tighter text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] leading-none whitespace-nowrap`}
      >
        {label}
      </span>
    </div>
  )
);


/**
 * Vertical Pitch Controller Styled as a Recessed Metal Fader Plate (Matching #top-seek-timeline Slot)
 * Sliding UP increases pitch (+12%); sliding DOWN decreases pitch (-12%). Double-click resets to 0%.
 */
const VerticalPitchFader = React.memo<{
  pitchPercent: number;
  compact?: boolean;
  lowPowerMode: boolean;
  onChangePitch: (pitch: number) => void;
}>(({ pitchPercent, compact = false, lowPowerMode, onChangePitch }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);
  const thumbTopPct = calculatePitchThumbTopPercent(pitchPercent);
  const absDeltaPct = Math.abs(pitchPercent / 12) * 42;
  const fillTopPct = pitchPercent >= 0 ? 50 - absDeltaPct : 50;

  const updatePitchFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 4) return;
      const usablePad = 6;
      const ratioFromTop =
        (clientY - (rect.top + usablePad)) / Math.max(12, rect.height - usablePad * 2);
      const nextPitch = verticalPointerRatioToPitch(ratioFromTop);
      onChangePitch(nextPitch);
    },
    [onChangePitch]
  );

  return (
    <div
      id="vertical-pitch-control"
      className={`relative h-full ${
        compact ? 'w-[28px] py-1 px-0.5' : 'w-[34px] lg:w-[38px] py-1.5 px-1'
      } rounded-[4px] overflow-hidden border border-[#d6c7b2]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_6px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between gap-1 select-none shrink-0`}
    >
      <img
        src="/console/metal-plate.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-95"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-[2px] left-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-[2px] right-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-[2px] left-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-[2px] right-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />

      {/* Top Value Pill-free Engraved Readout */}
      <span
        id="vertical-pitch-value"
        className={`relative z-10 px-1 font-mono ${
          compact ? 'text-[5.5px]' : 'text-[6.5px] lg:text-[7.5px]'
        } font-black tabular-nums leading-none text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] whitespace-nowrap`}
      >
        {pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
      </span>

      {/* Interactive Recessed Vertical Slider Slot */}
      <div
        id="vertical-pitch-slider"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Vertical Pitch Control Fader"
        aria-orientation="vertical"
        aria-valuemin={-12}
        aria-valuemax={12}
        aria-valuenow={pitchPercent}
        data-pitch-percent={pitchPercent}
        title={`Pitch Fader: ${pitchPercent >= 0 ? '+' : ''}${pitchPercent}% (Drag UP to increase pitch, DOWN to decrease, double-click to reset)`}
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
          triggerButtonHaptic(lowPowerMode);
          updatePitchFromClientY(e.clientY);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          updatePitchFromClientY(e.clientY);
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          triggerButtonHaptic(lowPowerMode);
          onChangePitch(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChangePitch(Math.min(12, pitchPercent + 1));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChangePitch(Math.max(-12, pitchPercent - 1));
          } else if (e.key === 'Home') {
            e.preventDefault();
            onChangePitch(12);
          } else if (e.key === 'End') {
            e.preventDefault();
            onChangePitch(-12);
          }
        }}
        className="relative z-10 flex-1 w-full min-h-[54px] flex items-center justify-center cursor-ns-resize touch-none focus:outline-none"
      >
        {/* Side Calibration Hash Marks (+12 / 0 / -12) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[6px] inset-x-[2px] flex flex-col justify-between items-stretch opacity-70"
        >
          <span className="h-[1px] w-full bg-[#38291b]" />
          <span className="h-[1px] w-2/3 mx-auto bg-[#5c4530]" />
          <span className="h-[1.5px] w-full bg-[#92400e]" />
          <span className="h-[1px] w-2/3 mx-auto bg-[#5c4530]" />
          <span className="h-[1px] w-full bg-[#38291b]" />
        </div>

        {/* Recessed Vertical Mechanical Groove Track */}
        <div className="relative w-[5px] h-full rounded-full bg-[#060402] border border-[#5c3c20]/95 shadow-[inset_0_2px_4px_rgba(0,0,0,0.98),1px_0_0_rgba(255,235,205,0.28)] overflow-hidden">
          {pitchPercent !== 0 && (
            <div
              style={{
                top: `${fillTopPct}%`,
                height: `${absDeltaPct}%`,
              }}
              className="absolute inset-x-0 bg-gradient-to-b from-[#fde68a] via-[#f59e0b] to-[#b45309] rounded-full"
            />
          )}
        </div>

        {/* Tactile Brushed-Metal Sliding Fader Cap (Rotated 90deg to cross the vertical groove) */}
        <img
          src="/console/fader-cap.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            top: `calc(${thumbTopPct}% - 8px)`,
          }}
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rotate-90 ${
            compact ? 'w-[14px] h-[16px]' : 'w-[17px] h-[16px]'
          } object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] z-20`}
        />
      </div>

      {/* Bottom Label */}
      <span
        className={`relative z-10 font-mono ${
          compact ? 'text-[5px]' : 'text-[6px] lg:text-[6.5px]'
        } font-black uppercase tracking-tighter text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] leading-none whitespace-nowrap`}
      >
        PITCH
      </span>
    </div>
  );
});

/**
 * Vertical Volume Controller matching VerticalPitchFader's recessed metal plate & fader-cap design.
 * Sliding UP increases volume (100%); sliding DOWN decreases volume (0%). Double-click resets to 80%.
 */
const VerticalVolumeFader = React.memo<{
  volume: number;
  compact?: boolean;
  lowPowerMode: boolean;
  onChangeVolume: (vol: number) => void;
}>(({ volume, compact = false, lowPowerMode, onChangeVolume }) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);
  const clampedVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
  const volumePctInt = Math.round(clampedVolume * 100);
  const thumbTopPct = calculateVolumeThumbTopPercent(clampedVolume);
  const fillHeightPct = Math.max(0, 92 - thumbTopPct);

  const updateVolumeFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 4) return;
      const usablePad = 6;
      const ratioFromTop =
        (clientY - (rect.top + usablePad)) / Math.max(12, rect.height - usablePad * 2);
      const nextVol = verticalPointerRatioToVolume(ratioFromTop);
      onChangeVolume(nextVol);
    },
    [onChangeVolume]
  );

  return (
    <div
      id="vertical-volume-control"
      className={`relative h-full ${
        compact ? 'w-[28px] py-1 px-0.5' : 'w-[34px] lg:w-[38px] py-1.5 px-1'
      } rounded-[4px] overflow-hidden border border-[#d6c7b2]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_6px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between gap-1 select-none shrink-0`}
    >
      <img
        src="/console/metal-plate.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-95"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-[2px] left-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute top-[2px] right-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-[2px] left-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />
      <img
        src="/console/screw-head.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-[2px] right-[2px] w-[3.5px] h-[3.5px] z-10 opacity-90"
      />

      {/* Top Percentage Readout */}
      <span
        id="vertical-volume-value"
        className={`relative z-10 px-1 font-mono ${
          compact ? 'text-[5.5px]' : 'text-[6.5px] lg:text-[7.5px]'
        } font-black tabular-nums leading-none text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] whitespace-nowrap`}
      >
        {volumePctInt}%
      </span>

      {/* Interactive Recessed Vertical Volume Slot */}
      <div
        id="vertical-volume-slider"
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Vertical Volume Control Fader"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={volumePctInt}
        data-volume-percent={volumePctInt}
        title={`Volume Fader: ${volumePctInt}% (Drag UP to increase volume, DOWN to decrease, double-click to reset to 80%)`}
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
          triggerButtonHaptic(lowPowerMode);
          updateVolumeFromClientY(e.clientY);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          updateVolumeFromClientY(e.clientY);
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          triggerButtonHaptic(lowPowerMode);
          onChangeVolume(0.8);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChangeVolume(Number(Math.min(1, clampedVolume + 0.05).toFixed(2)));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChangeVolume(Number(Math.max(0, clampedVolume - 0.05).toFixed(2)));
          } else if (e.key === 'Home') {
            e.preventDefault();
            onChangeVolume(1);
          } else if (e.key === 'End') {
            e.preventDefault();
            onChangeVolume(0);
          }
        }}
        className="relative z-10 flex-1 w-full min-h-[54px] flex items-center justify-center cursor-ns-resize touch-none focus:outline-none"
      >
        {/* Side Calibration Hash Marks (100 / 50 / 0) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[6px] inset-x-[2px] flex flex-col justify-between items-stretch opacity-70"
        >
          <span className="h-[1px] w-full bg-[#38291b]" />
          <span className="h-[1px] w-2/3 mx-auto bg-[#5c4530]" />
          <span className="h-[1.5px] w-full bg-[#92400e]" />
          <span className="h-[1px] w-2/3 mx-auto bg-[#5c4530]" />
          <span className="h-[1px] w-full bg-[#38291b]" />
        </div>

        {/* Recessed Vertical Mechanical Groove Track */}
        <div className="relative w-[5px] h-full rounded-full bg-[#060402] border border-[#5c3c20]/95 shadow-[inset_0_2px_4px_rgba(0,0,0,0.98),1px_0_0_rgba(255,235,205,0.28)] overflow-hidden">
          {clampedVolume > 0 && (
            <div
              style={{
                top: `${thumbTopPct}%`,
                height: `${fillHeightPct}%`,
              }}
              className="absolute inset-x-0 bg-gradient-to-b from-[#fde68a] via-[#f59e0b] to-[#b45309] rounded-full"
            />
          )}
        </div>

        {/* Tactile Brushed-Metal Sliding Fader Cap */}
        <img
          src="/console/fader-cap.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            top: `calc(${thumbTopPct}% - 8px)`,
          }}
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rotate-90 ${
            compact ? 'w-[14px] h-[16px]' : 'w-[17px] h-[16px]'
          } object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] z-20`}
        />
      </div>

      {/* Bottom Label */}
      <span
        className={`relative z-10 font-mono ${
          compact ? 'text-[5px]' : 'text-[6px] lg:text-[6.5px]'
        } font-black uppercase tracking-tighter text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] leading-none whitespace-nowrap`}
      >
        VOL
      </span>
    </div>
  );
});

/**
 * Requirement 6: Classic Analog Toggle Switch (left/right throw metal toggle lever)
 * Mounted inside the left Shuffle/Repeat stack in the control bar.
 */
const ClassicAnalogToggleSwitch = React.memo<{
  id: string;
  label: string;
  isOn: boolean;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel: string;
  title: string;
  onClick: () => void;
}>(({ id, label, isOn, disabled = false, compact = false, ariaLabel, title, onClick }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={isOn}
    aria-label={ariaLabel}
    disabled={disabled}
    data-analog-toggle="true"
    data-toggle-state={isOn ? 'on' : 'off'}
    onClick={onClick}
    title={title}
    className={`relative w-full flex-1 min-h-0 flex items-center justify-between px-1 lg:px-1.5 rounded-[3px] border transition-opacity duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed select-none focus:outline-none overflow-hidden ${
      isOn
        ? 'bg-gradient-to-b from-[#2e1e11] to-[#170e07] border-[#d99b38]/85 text-[#fbbf24] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]'
        : 'bg-gradient-to-b from-[#1a1109] to-[#0d0804] border-[#4a2f19]/85 text-[#c5a684]'
    }`}
  >
    {/* Left status LED + engraved label */}
    <span className="flex items-center gap-0.5 lg:gap-1 min-w-0 z-10">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isOn ? 'bg-amber-400 shadow-[0_0_5px_#f59e0b]' : 'bg-[#3d2918]'
        }`}
      />
      <span
        className={`font-mono ${
          compact ? 'text-[6.5px]' : 'text-[6.5px] lg:text-[7.5px] xl:text-[8px]'
        } font-extrabold uppercase tracking-tight lg:tracking-wider leading-none whitespace-nowrap`}
      >
        {label}
      </span>
    </span>

    {/* Classic horizontal machined toggle slot + left/right metal toggle bat lever */}
    <span
      className={`relative ${
        compact ? 'w-[18px] h-2.5' : 'w-[20px] lg:w-6 xl:w-7 h-3 xl:h-3.5'
      } rounded-full bg-[#060402] border border-[#5e3d21]/90 shadow-[inset_0_1px_3px_rgba(0,0,0,0.98)] flex items-center px-0.5 shrink-0 z-10`}
    >
      <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-[2px] bg-[#26170b] rounded-full pointer-events-none" />
      <span
        data-toggle-lever="true"
        style={{
          transform: isOn
            ? `translateX(${compact ? 6 : 8}px) translateZ(0)`
            : 'translateX(0px) translateZ(0)',
          transition: 'transform 140ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative ${
          compact ? 'w-2 h-2' : 'w-2 lg:w-2.5 xl:w-3 h-2 xl:h-2.5'
        } rounded-full border ${
          isOn
            ? 'border-[#fde68a] bg-gradient-to-b from-[#fffbeb] via-[#eab308] to-[#92400e] shadow-[0_1px_3px_rgba(0,0,0,0.95)]'
            : 'border-[#d6c7b2]/75 bg-gradient-to-b from-[#f5efe6] via-[#a89886] to-[#4a3e33] shadow-[0_1px_3px_rgba(0,0,0,0.95)]'
        }`}
      />
    </span>
  </button>
));

/**
 * Requirement 5: Reverted Classic Analog Fader-Slot Timeline / Seek Bar
 * Matches the exact full width of #console-title-plate above it.
 */
const TopSeekTimelineBar = React.memo<{
  trackId: string;
  durationSec: number;
  isStandby: boolean;
  lowPowerMode: boolean;
  onSeek: (targetSec: number) => void;
}>(({ trackId, durationSec, isStandby, lowPowerMode, onSeek }) => {
  const currentSecond = usePlaybackSecond();
  const safeDuration = Math.max(0, durationSec);
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentSecond / safeDuration) * 100)) : 0;

  return (
    <div
      id="top-seek-timeline"
      data-track-id={trackId}
      className="relative w-full px-1 py-0.5 flex items-center gap-2 shrink-0 select-none"
    >
      <span className="font-mono text-[8.5px] sm:text-[9.5px] font-bold text-[#fbbf24] tabular-nums w-9 text-right shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
        {formatDuration(currentSecond)}
      </span>
      <div className="relative flex-1 h-4 flex items-center">
        {/* Recessed mechanical fader groove track */}
        <div className="relative w-full h-[5px] rounded-full bg-[#060402] border border-[#5c3c20]/90 shadow-[inset_0_2px_4px_rgba(0,0,0,0.98),0_1px_0_rgba(255,218,175,0.16)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#b45309] via-[#f59e0b] to-[#fde68a] rounded-full origin-left"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {/* Tactile brushed-metal sliding fader cap */}
        <img
          src="/console/fader-cap.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            left: `calc(${progressPct}% - 7px)`,
          }}
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-[14px] h-[16px] object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] z-10"
        />
        <input
          id="console-seek-slider"
          type="range"
          min={0}
          max={Math.max(1, safeDuration)}
          step={1}
          value={Math.min(Math.max(1, safeDuration), currentSecond)}
          disabled={isStandby}
          onChange={(e) => {
            triggerButtonHaptic(lowPowerMode);
            onSeek(Number(e.target.value));
          }}
          aria-label="Seek Song Timeline"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
        />
      </div>
      <span className="font-mono text-[8.5px] sm:text-[9.5px] font-bold text-[#d4b692] tabular-nums w-9 shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
        {formatDuration(safeDuration)}
      </span>
    </div>
  );
});

/**
 * Isolated Live Local Clock (Larger Font) + Date with Day of Week (Smaller Font) Box
 * on the Right End of #turntable-control-row — replaces duplicate song elapsed timestamp.
 * Both bottom AND top edges align with Play/Pause button plate and #shuffle-repeat-stack.
 */
const ConsoleClockDateBox = React.memo<{
  heightPx: number;
  compact: boolean;
  isDocumentHidden: boolean;
}>(({ heightPx, compact, isDocumentHidden }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    setNow(new Date());
    if (isDocumentHidden) return;
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isDocumentHidden]);

  const { timeText, dateText } = formatConsoleClockAndDate(now, false);

  return (
    <div
      id="console-time-display"
      data-testid="console-clock-date-display"
      data-clock-date="true"
      style={{ height: `${heightPx}px` }}
      className={`relative ${
        compact ? 'w-[74px]' : 'w-[80px] sm:w-[92px] lg:w-[106px] xl:w-[120px]'
      } rounded-[4px] bg-[#080503] border border-[#5e3e22]/90 shadow-[inset_0_2px_6px_rgba(0,0,0,0.98),0_1px_0_rgba(255,214,165,0.16)] px-1.5 sm:px-2 py-1 flex flex-col items-center justify-center gap-0.5 shrink-0 overflow-hidden`}
    >
      <span
        id="console-live-time"
        className={`font-mono ${
          compact ? 'text-[10.5px]' : 'text-[12px] sm:text-[13px] xl:text-[14.5px]'
        } font-bold text-[#fbbf24] tabular-nums leading-none tracking-tight whitespace-nowrap vfd-phosphor-text`}
      >
        {timeText}
      </span>
      <span
        id="console-live-date"
        className={`font-mono ${
          compact ? 'text-[6.5px]' : 'text-[7.5px] sm:text-[8px] xl:text-[9px]'
        } font-semibold text-[#c9a985] tabular-nums leading-none tracking-tight whitespace-nowrap`}
      >
        {dateText}
      </span>
    </div>
  );
});

/**
 * Subtle Floating Dust Canvas Overlay over the Turntable Area (#turntable-plinth-bed).
 * Renders randomized slow-moving warm ambient dust motes while the turntable is spinning,
 * and pauses animation cleanly when turntable playback is stopped or hidden.
 */
const TurntableDustCanvas = React.memo<{
  width: number;
  height: number;
  isAnimating: boolean;
}>(({ width, height, isAnimating }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<DustParticle[]>([]);
  const dimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = dimsRef.current.width;
    const h = dimsRef.current.height;
    ctx.clearRect(0, 0, w, h);

    for (const p of particlesRef.current) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 232, 194, ${p.alpha.toFixed(3)})`;
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    const safeW = Math.max(40, Math.round(width));
    const safeH = Math.max(40, Math.round(height));
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(safeW * dpr);
    canvas.height = Math.round(safeH * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const prevW = dimsRef.current.width;
    const prevH = dimsRef.current.height;
    dimsRef.current = { width: safeW, height: safeH };

    if (particlesRef.current.length === 0) {
      particlesRef.current = generateDustParticles(28, safeW, safeH);
    } else if (prevW > 0 && prevH > 0 && (prevW !== safeW || prevH !== safeH)) {
      const sx = safeW / prevW;
      const sy = safeH / prevH;
      particlesRef.current = particlesRef.current.map((p) => ({
        ...p,
        x: Math.max(0, Math.min(safeW, p.x * sx)),
        y: Math.max(0, Math.min(safeH, p.y * sy)),
      }));
    }
    drawFrame();
  }, [width, height, drawFrame]);

  useEffect(() => {
    if (!isAnimating) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      drawFrame();
      return;
    }

    let lastTimeMs = performance.now();
    const tick = (nowMs: number) => {
      const dtSec = Math.min(0.08, Math.max(0.001, (nowMs - lastTimeMs) / 1000));
      lastTimeMs = nowMs;
      particlesRef.current = stepDustParticles(
        particlesRef.current,
        dimsRef.current.width,
        dimsRef.current.height,
        dtSec,
        true
      );
      drawFrame();
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isAnimating, drawFrame]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      particlesRef.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="turntable-dust-canvas"
      data-testid="turntable-dust-canvas"
      data-dust-running={isAnimating ? 'true' : 'false'}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full z-[38]"
    />
  );
});

/**
 * Isolated Tonearm Subcomponent (Requirement 7):
 * - Pivot anchored at the top-right of #turntable-plinth-bed just below #console-title-plate.
 * - Aspect-locked to tonearm-arm.webp (848x1264) and dynamically sized/angled from the measured
 *   turntable bed & vinyl record diameter so the stylus tip visually rests cleanly on the vinyl's
 *   groove band across every desktop, tablet, car, and mobile viewport (idle/paused and playing).
 * - Only lifts to rest on explicit Stop (#btn-stop-playback) or track-change transitions.
 */
const RasterTonearmAssembly = React.memo<{
  trackId: string;
  durationSec: number;
  bedWidth: number;
  bedHeight: number;
  vinylDiameterPx: number;
  vinylCenterXPct: number;
  rightReservedPx: number;
  isPlaying: boolean;
  isStandby: boolean;
  isStoppedAtRest: boolean;
  forceTonearmRest: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  onDragTonearmToTime: (targetSec: number) => void;
}>(
  ({
    trackId,
    durationSec,
    bedWidth,
    bedHeight,
    vinylDiameterPx,
    vinylCenterXPct,
    rightReservedPx,
    isPlaying,
    isStandby,
    isStoppedAtRest,
    forceTonearmRest,
    isDocumentHidden,
    lowPowerMode,
    prefersReducedMotion,
    onDragTonearmToTime,
  }) => {
    const currentSecond = usePlaybackSecond();
    const [tonearmPhase, setTonearmPhase] = useState<TonearmMotionPhase>(() =>
      !isStandby && !isStoppedAtRest && !forceTonearmRest ? 'playing' : 'rest'
    );
    const [dragAngleDeg, setDragAngleDeg] = useState<number | null>(null);

    const prevPlayRef = useRef<boolean>(isPlaying);
    const prevTrackIdRef = useRef<string>(trackId);
    const timersRef = useRef<number[]>([]);
    const pivotContainerRef = useRef<HTMLDivElement | null>(null);

    const clearTimers = useCallback(() => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    }, []);

    useEffect(() => {
      return clearTimers;
    }, [clearTimers]);

    useEffect(() => {
      const wasPlaying = prevPlayRef.current;
      const prevTrack = prevTrackIdRef.current;
      const trackChanged = prevTrack !== trackId;

      prevPlayRef.current = isPlaying;
      prevTrackIdRef.current = trackId;

      const immediateSnap = isDocumentHidden || lowPowerMode || prefersReducedMotion;

      const decision = resolveTonearmMotionOnPlayStateChange({
        isPlaying,
        wasPlaying,
        isStandby,
        isStoppedAtRest,
        trackChanged,
        forceTonearmRest,
        currentTonearmPhase: tonearmPhase,
        immediateSnap,
      });

      clearTimers();
      setTonearmPhase(decision.nextPhase);

      if (decision.shouldScheduleDropToGroove) {
        const t1 = window.setTimeout(() => {
          setTonearmPhase('dropping-to-groove');
        }, 320);
        const t2 = window.setTimeout(() => {
          setTonearmPhase('playing');
        }, 520);
        timersRef.current.push(t1, t2);
      } else if (decision.shouldScheduleLiftToRest) {
        const t1 = window.setTimeout(() => {
          setTonearmPhase('returning-to-rest');
        }, 160);
        const t2 = window.setTimeout(() => {
          setTonearmPhase('rest');
        }, 480);
        timersRef.current.push(t1, t2);
      }
    }, [
      isPlaying,
      isStandby,
      isStoppedAtRest,
      forceTonearmRest,
      trackId,
      isDocumentHidden,
      lowPowerMode,
      prefersReducedMotion,
      clearTimers,
    ]);

    const tonearmGeom = useMemo(
      () =>
        applyTonearmAssemblyOffset(
          calculateResponsiveTonearmGeometry({
            bedWidth,
            bedHeight,
            vinylCenterX: bedWidth * vinylCenterXPct,
            vinylCenterY: bedHeight / 2,
            vinylDiameterPx,
            rightReservedPx,
          })
        ),
      [bedWidth, bedHeight, vinylCenterXPct, vinylDiameterPx, rightReservedPx]
    );

    const trackingAngleDeg = useMemo(() => {
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return tonearmGeom.outerAngleDeg;
      }
      const ratio = Math.max(0, Math.min(1, currentSecond / durationSec));
      return Number(
        (
          tonearmGeom.outerAngleDeg +
          ratio * (tonearmGeom.innerAngleDeg - tonearmGeom.outerAngleDeg)
        ).toFixed(2)
      );
    }, [currentSecond, durationSec, tonearmGeom.outerAngleDeg, tonearmGeom.innerAngleDeg]);

    const effectiveAngleDeg = useMemo(() => {
      if (dragAngleDeg !== null) return dragAngleDeg;
      if (
        tonearmPhase === 'rest' ||
        tonearmPhase === 'returning-to-rest' ||
        forceTonearmRest ||
        isStandby ||
        isStoppedAtRest
      ) {
        return tonearmGeom.restAngleDeg;
      }
      return trackingAngleDeg;
    }, [
      dragAngleDeg,
      tonearmPhase,
      forceTonearmRest,
      isStandby,
      isStoppedAtRest,
      tonearmGeom.restAngleDeg,
      trackingAngleDeg,
    ]);

    const shadowPose = useMemo(() => getTonearmShadowPose(tonearmPhase), [tonearmPhase]);

    const handleTonearmPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isStandby || durationSec <= 0) return;
      e.stopPropagation();
      setTonearmPhase('dragging');
      setDragAngleDeg(effectiveAngleDeg);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleTonearmPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragAngleDeg === null || !pivotContainerRef.current) return;
      const rect = pivotContainerRef.current.getBoundingClientRect();
      const pivotX = rect.left + rect.width * TONEARM_ASSET_METRICS.pivotXPct;
      const pivotY = rect.top + rect.height * TONEARM_ASSET_METRICS.pivotYPct;
      const dx = pivotX - e.clientX;
      const dy = e.clientY - pivotY;
      if (dy <= 4) return;
      const rawDeg = (Math.atan2(dx, dy) * 180) / Math.PI - TONEARM_ASSET_METRICS.intrinsicTipTiltDeg;
      const clamped = Math.max(
        tonearmGeom.outerAngleDeg,
        Math.min(tonearmGeom.innerAngleDeg, rawDeg)
      );
      setDragAngleDeg(Number(clamped.toFixed(2)));
    };

    const handleTonearmPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragAngleDeg === null) return;
      const finalAngle = dragAngleDeg;
      setDragAngleDeg(null);
      setTonearmPhase('playing');
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const seekResult = calculateSeekTimeFromTonearmAngle(
        finalAngle,
        durationSec,
        tonearmGeom.outerAngleDeg,
        tonearmGeom.innerAngleDeg
      );
      onDragTonearmToTime(seekResult.targetTimeSec);
    };

    const transitionCss =
      dragAngleDeg !== null || isDocumentHidden || lowPowerMode || prefersReducedMotion
        ? 'none'
        : tonearmPhase === 'playing'
          ? 'transform 950ms linear'
          : 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)';

    return (
      <div
        id="turntable-tonearm-assembly"
        ref={pivotContainerRef}
        data-tonearm-phase={tonearmPhase}
        data-tonearm-angle={effectiveAngleDeg.toFixed(2)}
        data-offset-x={TONEARM_ASSEMBLY_OFFSET_X_PX}
        data-offset-y={TONEARM_ASSEMBLY_OFFSET_Y_PX}
        data-pivot-x={tonearmGeom.pivotX}
        data-pivot-y={tonearmGeom.pivotY}
        onPointerDown={handleTonearmPointerDown}
        onPointerMove={handleTonearmPointerMove}
        onPointerUp={handleTonearmPointerUp}
        onPointerCancel={handleTonearmPointerUp}
        title="Tonearm Assembly (drag needle across vinyl grooves to seek)"
        style={{
          left: `${tonearmGeom.armLeftPx}px`,
          top: `${tonearmGeom.armTopPx}px`,
          width: `${tonearmGeom.armWidthPx}px`,
          height: `${tonearmGeom.armHeightPx}px`,
        }}
        className="absolute z-30 select-none cursor-grab active:cursor-grabbing touch-none"
      >
        {/* Static Machined Tonearm Gimbal Base Concentrically Aligned Under Tonearm Pivot Cap */}
        <img
          src="/turntable/tonearm-base.webp"
          alt="Tonearm Gimbal Base"
          draggable={false}
          style={{
            left: '50%',
            top: '23.5%',
            transform: 'translate(-50%, -50%)',
            width: '46%',
          }}
          className="pointer-events-none absolute object-contain z-10"
        />

        {/* Static Tonearm Rest Clip */}
        <img
          src="/turntable/tonearm-rest.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            left: '55%',
            top: '46%',
            transform: 'translate(-50%, -50%)',
            width: '15%',
          }}
          className="pointer-events-none absolute object-contain z-10"
        />

        {/* Pre-rendered Tonearm Drop Shadow */}
        <div
          aria-hidden="true"
          style={{
            transformOrigin: '50% 23.5%',
            transform: `translate3d(${shadowPose.offsetXpx}px, ${shadowPose.offsetYpx}px, 0) rotate(${effectiveAngleDeg}deg)`,
            opacity: shadowPose.opacity,
            transition: transitionCss,
          }}
          className="pointer-events-none absolute inset-0 z-10"
        >
          <img
            src="/turntable/tonearm-shadow.webp"
            alt=""
            draggable={false}
            className="w-full h-full object-fill"
          />
        </div>

        {/* Pivoting Tonearm Tube + Headshell */}
        <div
          id="turntable-tonearm-pivot"
          style={{
            transformOrigin: '50% 23.5%',
            transform: `rotate(${effectiveAngleDeg}deg) scale(${shadowPose.armScale}) translateZ(0)`,
            transition: transitionCss,
          }}
          className="pointer-events-none relative w-full h-full z-20"
        >
          <img
            src="/turntable/tonearm-arm.webp"
            alt="Turntable Tonearm"
            draggable={false}
            className="w-full h-full object-fill select-none"
          />
          {/* Exact Stylus Needle-Tip Child Coordinate Marker */}
          <span
            id="tonearm-stylus-tip"
            data-testid="tonearm-stylus-tip"
            aria-hidden="true"
            style={{
              left: '46.9%',
              top: '92.64%',
            }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
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
    volume,
    repeatOne,
    shuffleEnabled,
    hideBoxArt = false,
    onToggleHideBoxArt,
    viewportLayout,
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
    onScratch,
    onDragTonearmToTime,
    parentPlaylistCoverUrl,
    onResolvedPerTrackArtwork,
  }) => {
    const doubleTapHideHandlers = useDoubleTapHideArt({
      enabled: !hideBoxArt,
      onHide: onToggleHideBoxArt,
    });
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
    const isCompactLandscape = viewportLayout === 'mobile-landscape';

    // Requirement 7: Track whether playback was explicitly stopped (Pause keeps tonearm on groove; Stop returns to rest)
    const [isStoppedAtRest, setIsStoppedAtRest] = useState<boolean>(false);

    useEffect(() => {
      if (isPlaying) {
        setIsStoppedAtRest(false);
      }
    }, [isPlaying, track.id]);

    // --- Requirement 1 & 9: Song-Specific Album Art Resolution, Retry/Fallback & Skeleton State ---
    const [artworkFailedCount, setArtworkFailedCount] = useState<number>(0);
    const [artworkLoaded, setArtworkLoaded] = useState<boolean>(false);

    useEffect(() => {
      setArtworkFailedCount(0);
      setArtworkLoaded(false);
    }, [track.id, track.artworkUrl]);

    const artworkState = useMemo(
      () => resolveActiveArtworkState(track, artworkFailedCount, parentPlaylistCoverUrl),
      [track, artworkFailedCount, parentPlaylistCoverUrl]
    );

    // Requirement 9: If a track lacks song-specific artwork (or only had parent playlist cover), fetch individual song artwork from server
    useEffect(() => {
      if (isStandby || !track.id || !track.title) return;
      if (!artworkState.isPlaceholder) return;

      let cancelled = false;
      const params = new URLSearchParams({
        trackId: track.id,
        title: track.title,
        artist: track.artist || '',
      });

      fetch(`/api/spotify/track-artwork?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { artworkUrl?: string | null } | null) => {
          if (cancelled || !data?.artworkUrl) return;
          onResolvedPerTrackArtwork?.(track.id, data.artworkUrl);
        })
        .catch(() => {
          // placeholder remains active if offline
        });

      return () => {
        cancelled = true;
      };
    }, [isStandby, track.id, track.title, track.artist, artworkState.isPlaceholder, onResolvedPerTrackArtwork]);

    const albumArtImgRef = useRef<HTMLImageElement | null>(null);
    useEffect(() => {
      const imgEl = albumArtImgRef.current;
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        setArtworkLoaded(true);
      }
    }, [artworkState.activeUrl, track.id]);

    const handleArtworkError = useCallback(() => {
      setArtworkLoaded(false);
      setArtworkFailedCount((prev) => prev + 1);
    }, []);

    const handleArtworkLoad = useCallback(() => {
      setArtworkLoaded(true);
    }, []);

    // --- Dynamic Vinyl Diameter + Turntable Bed Measurements for Tonearm Geometry & Holder Box Dragging ---
    const topSurfaceRef = useRef<HTMLDivElement | null>(null);
    const plinthBedRef = useRef<HTMLDivElement | null>(null);
    const titlePlateRef = useRef<HTMLDivElement | null>(null);
    const lyricsStripRef = useRef<HTMLDivElement | null>(null);
    const holderHomeSlotRef = useRef<HTMLDivElement | null>(null);
    const rightControlsRef = useRef<HTMLDivElement | null>(null);
    const [vinylDiameterPx, setVinylDiameterPx] = useState<number>(
      isCompactLandscape ? 120 : 210
    );
    const [plinthBedSize, setPlinthBedSize] = useState<{ width: number; height: number }>({
      width: 560,
      height: isCompactLandscape ? 140 : 260,
    });
    const [rightControlsWidthPx, setRightControlsWidthPx] = useState<number>(
      isCompactLandscape ? 64 : 84
    );

    const measureVinylSpace = useCallback(() => {
      const titleEl = titlePlateRef.current;
      const lyricsEl = lyricsStripRef.current;
      const bedEl = plinthBedRef.current;
      const rightEl = rightControlsRef.current;
      const rightReservedEstimate =
        rightEl && rightEl.getBoundingClientRect().width > 20
          ? Math.round(rightEl.getBoundingClientRect().width + 6)
          : rightControlsWidthPx;
      if (titleEl && lyricsEl) {
        const titleRect = titleEl.getBoundingClientRect();
        const lyricsRect = lyricsEl.getBoundingClientRect();
        if (lyricsRect.top > titleRect.bottom) {
          // 19px vinyl margin leaves ~8px visible wooden gap between #console-title-plate and #turntable-raised-platter-plinth (inset: -11px)
          const heightBoundedDiameter = calculateVinylDiameterFromBounds(
            titleRect.bottom,
            lyricsRect.top,
            19
          );
          const bedWidthNow = bedEl ? bedEl.getBoundingClientRect().width : 0;
          const widthBoundedDiameter =
            bedWidthNow > 120
              ? Math.max(84, Math.floor(bedWidthNow - rightReservedEstimate - 28))
              : heightBoundedDiameter;
          const nextDiameter = Math.min(heightBoundedDiameter, widthBoundedDiameter);
          setVinylDiameterPx((prev) => (Math.abs(prev - nextDiameter) >= 1 ? nextDiameter : prev));
        }
      }
      if (bedEl) {
        const bedRect = bedEl.getBoundingClientRect();
        if (bedRect.width > 50 && bedRect.height > 50) {
          const nextW = Math.round(bedRect.width);
          const nextH = Math.round(bedRect.height);
          setPlinthBedSize((prev) =>
            Math.abs(prev.width - nextW) >= 1 || Math.abs(prev.height - nextH) >= 1
              ? { width: nextW, height: nextH }
              : prev
          );
        }
      }
      if (rightEl) {
        const rightRect = rightEl.getBoundingClientRect();
        if (rightRect.width > 20) {
          const nextRW = Math.round(rightRect.width + 6);
          setRightControlsWidthPx((prev) => (Math.abs(prev - nextRW) >= 1 ? nextRW : prev));
        }
      }
    }, []);

    useLayoutEffect(() => {
      measureVinylSpace();
      const observer =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(() => {
              measureVinylSpace();
            })
          : null;

      if (observer) {
        if (topSurfaceRef.current) observer.observe(topSurfaceRef.current);
        if (plinthBedRef.current) observer.observe(plinthBedRef.current);
        if (titlePlateRef.current) observer.observe(titlePlateRef.current);
        if (lyricsStripRef.current) observer.observe(lyricsStripRef.current);
        if (rightControlsRef.current) observer.observe(rightControlsRef.current);
      }
      window.addEventListener('resize', measureVinylSpace);
      return () => {
        observer?.disconnect();
        window.removeEventListener('resize', measureVinylSpace);
      };
    }, [measureVinylSpace, viewportLayout]);

    // Album art holder box is exactly 5px larger (in width and height) than the vinyl record's current diameter
    const holderBoxSizePx = useMemo(
      () => calculateHolderBoxSizeFromVinyl(vinylDiameterPx),
      [vinylDiameterPx]
    );

    // Position entire turntable assembly (platter plinth + vinyl + tonearm) on the right side
    // immediately adjacent to #turntable-right-controls-column
    const vinylCenterXPct = useMemo(() => {
      const targetX = calculateRightDockedVinylCenterX({
        bedWidth: plinthBedSize.width,
        rightReservedPx: rightControlsWidthPx,
        vinylDiameterPx,
      });
      return Number((targetX / Math.max(1, plinthBedSize.width)).toFixed(4));
    }, [plinthBedSize.width, rightControlsWidthPx, vinylDiameterPx]);

    // Measure Play/Pause button top to plate bottom so #shuffle-repeat-stack & #console-time-display align at BOTH top & bottom
    const playPausePlateRef = useRef<HTMLDivElement | null>(null);
    const playPauseBtnRef = useRef<HTMLButtonElement | null>(null);
    const [endModuleHeightPx, setEndModuleHeightPx] = useState<number>(
      isCompactLandscape ? 42 : 52
    );

    const measureControlBarAlignment = useCallback(() => {
      const plateEl = playPausePlateRef.current;
      const btnEl = playPauseBtnRef.current;
      if (!plateEl || !btnEl) return;
      const plateRect = plateEl.getBoundingClientRect();
      const btnRect = btnEl.getBoundingClientRect();
      const totalH = Math.round(plateRect.bottom - btnRect.top);
      if (totalH >= 32) {
        setEndModuleHeightPx((prev) => (prev !== totalH ? totalH : prev));
      }
    }, []);

    useLayoutEffect(() => {
      measureControlBarAlignment();
      const ro =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(measureControlBarAlignment)
          : null;
      if (ro && playPausePlateRef.current) {
        ro.observe(playPausePlateRef.current);
      }
      window.addEventListener('resize', measureControlBarAlignment);
      return () => {
        ro?.disconnect();
        window.removeEventListener('resize', measureControlBarAlignment);
      };
    }, [measureControlBarAlignment, viewportLayout]);

    // --- Requirement 6 & 10: Freely Draggable Holder Box with Counterweight Tilt Physics ---
    const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [holderTiltDeg, setHolderTiltDeg] = useState<number>(0);
    const [isDraggingHolder, setIsDraggingHolder] = useState<boolean>(false);
    const holderDragOriginRef = useRef<{
      pointerX: number;
      pointerY: number;
      lastPointerX: number;
      lastDeltaX: number;
      startX: number;
      startY: number;
      surfaceWidth: number;
      surfaceHeight: number;
      homeCenterX: number;
      homeCenterY: number;
    } | null>(null);

    const handleHolderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const surfaceRect =
        topSurfaceRef.current?.getBoundingClientRect() ||
        plinthBedRef.current?.getBoundingClientRect();
      const homeRect = holderHomeSlotRef.current?.getBoundingClientRect();
      const surfaceW = surfaceRect ? surfaceRect.width : 560;
      const surfaceH = surfaceRect ? surfaceRect.height : 460;
      const homeCenterX =
        surfaceRect && homeRect
          ? homeRect.left - surfaceRect.left + homeRect.width / 2
          : 6 + holderBoxSizePx / 2;
      const homeCenterY =
        surfaceRect && homeRect
          ? homeRect.top - surfaceRect.top + homeRect.height / 2
          : surfaceH / 2;

      holderDragOriginRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        lastPointerX: e.clientX,
        lastDeltaX: 0,
        startX: holderOffset.x,
        startY: holderOffset.y,
        surfaceWidth: surfaceW,
        surfaceHeight: surfaceH,
        homeCenterX,
        homeCenterY,
      };
      setIsDraggingHolder(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handleHolderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const origin = holderDragOriginRef.current;
      if (!origin) return;
      const stepDeltaX = e.clientX - origin.lastPointerX;
      origin.lastPointerX = e.clientX;
      if (Math.abs(stepDeltaX) >= 0.5) {
        origin.lastDeltaX = stepDeltaX;
      }
      const rawX = origin.startX + (e.clientX - origin.pointerX);
      const rawY = origin.startY + (e.clientY - origin.pointerY);
      const clamped = clampHolderBoxDragOffset({
        offsetX: rawX,
        offsetY: rawY,
        boardWidth: origin.surfaceWidth,
        boardHeight: origin.surfaceHeight,
        boxSize: holderBoxSizePx,
        homeCenterX: origin.homeCenterX,
        homeCenterY: origin.homeCenterY,
        snapRadiusPx: 8,
      });
      setHolderOffset({ x: clamped.offsetX, y: clamped.offsetY });
      setHolderTiltDeg(calculateHolderBoxDragTiltDeg(stepDeltaX, true));
    };

    const handleHolderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      const origin = holderDragOriginRef.current;
      if (!origin) return;
      const finalRestTilt = calculateHolderBoxRestTiltDeg(
        holderOffset.x,
        origin.lastDeltaX,
        Math.hypot(holderOffset.x, holderOffset.y) < 1
      );
      holderDragOriginRef.current = null;
      setIsDraggingHolder(false);
      setHolderTiltDeg(finalRestTilt);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    // --- 6-Step Choreographed Track-Change Animation ---
    const [trackChangePhase, setTrackChangePhase] = useState<TrackChangePhase>('idle');
    const prevTrackIdForStageRef = useRef<string>(track.id);

    useEffect(() => {
      if (prevTrackIdForStageRef.current === track.id) return;
      prevTrackIdForStageRef.current = track.id;

      if (isDocumentHidden || lowPowerMode || prefersReducedMotion || isStandby) {
        setTrackChangePhase('idle');
        return;
      }

      setTrackChangePhase('lifting-vinyl-to-box');
      const t1 = window.setTimeout(
        () => setTrackChangePhase('returning-box-to-playlist'),
        TRACK_CHANGE_TIMELINE_MS.liftVinylEndMs
      );
      const t2 = window.setTimeout(
        () => setTrackChangePhase('bringing-new-box-from-playlist'),
        TRACK_CHANGE_TIMELINE_MS.returnBoxEndMs
      );
      const t3 = window.setTimeout(
        () => setTrackChangePhase('sliding-vinyl-to-spindle'),
        TRACK_CHANGE_TIMELINE_MS.bringNewBoxEndMs
      );
      const t4 = window.setTimeout(
        () => setTrackChangePhase('lowering-tonearm'),
        TRACK_CHANGE_TIMELINE_MS.slideVinylToSpindleEndMs
      );
      const t5 = window.setTimeout(
        () => setTrackChangePhase('idle'),
        TRACK_CHANGE_TIMELINE_MS.lowerTonearmEndMs
      );

      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        window.clearTimeout(t4);
        window.clearTimeout(t5);
      };
    }, [track.id, isDocumentHidden, lowPowerMode, prefersReducedMotion, isStandby]);

    const stagePose = useMemo(
      () => getTrackChangeStagePose(trackChangePhase),
      [trackChangePhase]
    );

    const spinDurationSec = useMemo(() => {
      const baseRpm = rpm === 45 ? 45 : 33.333;
      const effectiveRpm = Math.max(12, baseRpm * (1 + pitchPercent / 100));
      return Number((60 / effectiveRpm).toFixed(3));
    }, [rpm, pitchPercent]);

    const spinTimingFunction = useMemo(
      () => calculateVinylSpinTiming(spinDurationSec, lowPowerMode),
      [spinDurationSec, lowPowerMode]
    );

    const shouldSpin = Boolean(
      isPlaying && !isStandby && !isDocumentHidden && !prefersReducedMotion
    );

    const [scratchPulseActive, setScratchPulseActive] = useState<boolean>(false);
    const scratchTimerRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (scratchTimerRef.current !== null) {
          window.clearTimeout(scratchTimerRef.current);
        }
      };
    }, []);

    const handleTriggerScratch = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      onScratch('classic');
      setScratchPulseActive(true);
      if (scratchTimerRef.current !== null) {
        window.clearTimeout(scratchTimerRef.current);
      }
      scratchTimerRef.current = window.setTimeout(() => {
        setScratchPulseActive(false);
        scratchTimerRef.current = null;
      }, 220);
    }, [lowPowerMode, onScratch]);


    const handleStopClick = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      setIsStoppedAtRest(true);
      onStop();
    }, [lowPowerMode, onStop]);

    // Shared song-specific artwork node for both Left Holder Box and Spinning Vinyl Center Label
    const renderSongArtworkContent = (
      imgId: string,
      skeletonTestId?: string,
      attachRef = false
    ) => (
      <>
        {!artworkLoaded && !artworkState.isPlaceholder && (
          <div
            data-testid={skeletonTestId}
            data-artwork-skeleton="true"
            className="absolute inset-0 bg-gradient-to-br from-[#2a1a0e] via-[#3d2514] to-[#140c06] flex items-center justify-center z-10"
          >
            <Disc3 className="w-5 h-5 text-amber-200/45" />
          </div>
        )}

        {!artworkState.isPlaceholder && artworkState.activeUrl ? (
          <img
            ref={attachRef ? albumArtImgRef : undefined}
            id={imgId}
            src={artworkState.activeUrl}
            alt={`${track.title} by ${track.artist} artwork`}
            referrerPolicy="no-referrer"
            onLoad={handleArtworkLoad}
            onError={handleArtworkError}
            className={`w-full h-full object-cover select-none pointer-events-none transition-opacity duration-200 ${
              artworkLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            draggable={false}
          />
        ) : (
          <div
            id={imgId}
            data-fallback-artwork="true"
            style={{
              backgroundImage: 'url(/turntable/vinyl-label-paper.webp)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            className="w-full h-full bg-[#24150b] flex flex-col items-center justify-center p-1.5 text-center select-none pointer-events-none"
          >
            <Disc3 className="w-4 h-4 text-amber-300/85 mb-0.5 shrink-0" />
            <span className="font-display text-[7px] font-bold uppercase tracking-wider text-[#1c130b] bg-amber-100/80 px-1 rounded truncate max-w-full">
              {track.title}
            </span>
          </div>
        )}
      </>
    );

    return (
      <section
        id="turntable-console-root"
        aria-label="Unified 3D Walnut Turntable Console"
        data-track-change-phase={trackChangePhase}
        className="walnut-furniture-cabinet panel-contain relative w-full h-full min-h-0 flex flex-col justify-between overflow-hidden select-none p-2 sm:p-2.5 lg:p-3"
      >
        {/* Four Corner Slot-Head Screws on the Raised Walnut Frame */}
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-40 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-40 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-40 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-40 opacity-85"
        />

        {/* ===================================================================
            1. WOODEN TOP SURFACE
            Note: gap-0 so #turntable-plinth-bed spans the exact vertical space
            between #console-title-plate bottom and #lyrics-strip-slot top.
            =================================================================== */}
        <div
          ref={topSurfaceRef}
          id="console-top-surface"
          className="relative z-20 flex-1 min-h-0 flex flex-col justify-between gap-0"
        >
          {/* --- REQUIREMENT 1: REVERTED SIMPLE EMBOSSED BRUSHED-METAL SONG-TITLE PLATE --- */}
          <div
            ref={titlePlateRef}
            id="console-title-plate"
            className={`relative z-10 w-full rounded-[6px] overflow-hidden border border-[#d6c7b2]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_3px_8px_rgba(0,0,0,0.75)] ${
              isCompactLandscape ? 'px-4 py-1' : 'px-5 py-1.5'
            } shrink-0`}
          >
            <img
              src="/console/metal-plate.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-95"
            />
            <div
              aria-hidden="true"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.02) 48%, rgba(0,0,0,0.18) 100%)',
              }}
              className="pointer-events-none absolute inset-0"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-20"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-20"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-20"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-20"
            />

            <div className="relative z-10 w-full flex flex-row items-center justify-between gap-3 sm:gap-4 min-w-0">
              <h2
                id="console-track-title"
                className={`font-display ${
                  isCompactLandscape ? 'text-xs sm:text-sm' : 'text-sm sm:text-base lg:text-lg'
                } font-black tracking-wide text-[#17120d] drop-shadow-[0_1px_0_rgba(255,255,255,0.55)] text-left truncate min-w-0 flex-1 leading-tight`}
              >
                {track.title}
              </h2>
              <p
                id="console-track-artist"
                className={`font-mono ${
                  isCompactLandscape ? 'text-[9.5px]' : 'text-[10.5px] sm:text-xs'
                } font-bold uppercase tracking-wider text-[#2f2419] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.45)] text-right truncate shrink-0 max-w-[44%] leading-tight`}
              >
                {track.artist}
              </p>
            </div>
          </div>

          {/* --- CENTER TURNTABLE AREA (#turntable-plinth-bed) ---
              Spans the exact vertical space between #console-title-plate bottom and #lyrics-strip-slot top.
              z-40 with overflow-visible lets the z-50 draggable album-art holder box layer freely above
              #console-title-plate, #lyrics-strip-slot, #top-seek-timeline, vinyl, and tonearm. */}
          <div
            ref={plinthBedRef}
            id="turntable-plinth-bed"
            className="relative z-40 flex-1 min-h-0 w-full flex items-center justify-center overflow-visible"
          >
            {/* Subtle Floating Dust Particle Canvas Overlay (Pauses cleanly when turntable is stopped) */}
            <TurntableDustCanvas
              width={plinthBedSize.width}
              height={plinthBedSize.height}
              isAnimating={Boolean(shouldSpin)}
            />

            {/* ===============================================================
                REQUIREMENT 6: FREELY DRAGGABLE LEFT-DOCKED ALBUM-ART HOLDER BOX
                - Sized at (vinylDiameterPx + 5px) in both width and height
                - Positioned by default on the LEFT side of the wooden board
                - Free dragging across the ENTIRE #console-top-surface above all panels
                =============================================================== */}
            <div
              ref={holderHomeSlotRef}
              id="album-art-holder-home-slot"
              aria-hidden={hideBoxArt ? 'true' : undefined}
              style={{
                left: '6px',
                top: '50%',
                transform: hideBoxArt ? 'translateY(-50%) scale(0.94)' : 'translateY(-50%) scale(1)',
                opacity: hideBoxArt ? 0 : 1,
                transition: prefersReducedMotion ? 'none' : 'opacity 220ms ease, transform 220ms ease',
                width: `${holderBoxSizePx}px`,
                height: `${holderBoxSizePx}px`,
              }}
              className="pointer-events-none absolute z-50 flex items-center justify-center select-none"
            >
              {/* Wooden Record-Sleeve Holder Cradle Pocket */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1 inset-x-3 h-2.5 rounded-b-md bg-gradient-to-b from-[#452814] to-[#1a0e06] border border-[#8c5d34]/75 shadow-[0_4px_10px_rgba(0,0,0,0.9)] z-30"
              />

              <div
                id="album-art-holder-box"
                data-testid="album-art-holder-box"
                data-dragging={isDraggingHolder ? 'true' : 'false'}
                data-holder-tilt={holderTiltDeg.toFixed(2)}
                data-slot-open={stagePose.holderSlotOpen ? 'true' : 'false'}
                onPointerDown={handleHolderPointerDown}
                onPointerDownCapture={doubleTapHideHandlers.onPointerDownCapture}
                onPointerMove={handleHolderPointerMove}
                onPointerUp={handleHolderPointerUp}
                onPointerUpCapture={doubleTapHideHandlers.onPointerUpCapture}
                onPointerCancel={handleHolderPointerUp}
                onDoubleClick={doubleTapHideHandlers.onDoubleClick}
                title="Drag album sleeve holder box anywhere on the wooden board (double-click to hide album art)"
                style={{
                  width: `${holderBoxSizePx}px`,
                  height: `${holderBoxSizePx}px`,
                  transformOrigin: '50% 10%',
                  transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) rotate(${holderTiltDeg}deg) ${stagePose.holderBoxTransform}`,
                  opacity: stagePose.holderBoxOpacity,
                  transition:
                    isDraggingHolder || isDocumentHidden || lowPowerMode || prefersReducedMotion
                      ? 'none'
                      : 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out',
                }}
                className={`${
                  hideBoxArt ? 'pointer-events-none' : 'pointer-events-auto'
                } relative rounded-[8px] p-[3px] bg-gradient-to-br from-[#6b4426] via-[#331e0f] to-[#170c05] border-2 border-[#b88655]/85 shadow-[0_14px_30px_rgba(0,0,0,0.92),inset_0_1px_1px_rgba(255,225,185,0.4)] ${
                  isDraggingHolder ? 'cursor-grabbing' : 'cursor-grab'
                } touch-none select-none z-50`}
              >
                <div className="relative w-full h-full rounded-[5px] overflow-hidden bg-[#0c0704] border border-[#4a3019]">
                  {renderSongArtworkContent('album-art-cover', 'album-art-skeleton', true)}
                  {/* Laminated record-sleeve sheen */}
                  <div
                    aria-hidden="true"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.38) 100%)',
                    }}
                    className="pointer-events-none absolute inset-0"
                  />
                </div>
              </div>
            </div>

            {/* ===============================================================
                REQUIREMENTS 1, 2, 3, 4: DYNAMICALLY SIZED SPINNING VINYL RECORD
                - Top & bottom edge cleared cleanly from #console-title-plate and #lyrics-strip-slot
                - Centered vertically in #turntable-plinth-bed, right-docked adjacent to controls
                - Static lighting highlight overlay stays fixed while only the vinyl rotates
                =============================================================== */}
            <div
              id="turntable-chassis-square"
              data-scratching={scratchPulseActive ? 'true' : 'false'}
              style={{
                top: '50%',
                left: `${(vinylCenterXPct * 100).toFixed(2)}%`,
                width: `${vinylDiameterPx}px`,
                height: `${vinylDiameterPx}px`,
              }}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            >
              {/* Requirement 3: Raised Circular Platter Plinth with Visible Beveled Edge & Groove-Ring Perimeter */}
              <div
                id="turntable-raised-platter-plinth"
                data-platter-plinth="true"
                style={{
                  inset: '-11px',
                  background:
                    'radial-gradient(circle at 32% 28%, #6d4726 0%, #3a2110 56%, #180d06 88%, #070402 100%)',
                  boxShadow:
                    '0 12px 26px rgba(0,0,0,0.94), 0 0 0 1px rgba(0,0,0,0.9), inset 0 2px 3px rgba(255,224,180,0.42), inset 0 -3px 6px rgba(0,0,0,0.95)',
                  border: '2px solid rgba(206, 152, 95, 0.72)',
                }}
                className="pointer-events-none absolute rounded-full flex items-center justify-center select-none"
              >
                {/* Chamfered Brass Strobe Bevel Rim */}
                <div className="pointer-events-none absolute inset-[2px] rounded-full border border-dashed border-amber-300/45" />
                <div className="pointer-events-none absolute inset-[5px] rounded-full border border-[#8e6239]/75 shadow-[inset_0_3px_8px_rgba(0,0,0,0.95)]" />

                {/* Concentric Platter Groove-Ring Texture Extending Beyond & Under the Vinyl */}
                <div
                  id="turntable-under-record-grooves"
                  data-under-record-grooves="true"
                  style={{
                    backgroundImage:
                      'repeating-radial-gradient(circle at center, rgba(240, 200, 148, 0.22) 0px, rgba(240, 200, 148, 0.22) 1px, rgba(16, 9, 4, 0.55) 2px, rgba(16, 9, 4, 0.55) 4.5px)',
                  }}
                  className="pointer-events-none absolute inset-[5px] rounded-full"
                />

                {/* Recessed Rubber Platter Mat */}
                <img
                  src="/turntable/platter-mat.webp"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="pointer-events-none relative w-[93%] h-[93%] rounded-full object-contain opacity-92"
                />
              </div>

              {/* Track-change slide wrapper (only animates during track change) */}
              <div
                id="vinyl-record-transition-wrapper"
                style={{
                  transform: stagePose.vinylTransform,
                  opacity: stagePose.vinylOpacity,
                  transition:
                    isDocumentHidden || lowPowerMode || prefersReducedMotion
                      ? 'none'
                      : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out',
                }}
                className="relative w-full h-full rounded-full"
              >
                {/* LAYER 2: THE ONLY CONTINUOUSLY ROTATING ELEMENT IN THE TURNTABLE */}
                <div
                  id="vinyl-record-spin-layer"
                  data-spinning={shouldSpin ? 'true' : 'false'}
                  style={{
                    animationDuration: `${spinDurationSec}s`,
                    animationTimingFunction: spinTimingFunction,
                    animationPlayState: shouldSpin ? 'running' : 'paused',
                  }}
                  className="vinyl-platter-gpu-spin relative w-full h-full rounded-full overflow-hidden shadow-[0_6px_16px_rgba(0,0,0,0.92)]"
                >
                  <img
                    src="/turntable/vinyl-record.webp"
                    alt="Spinning Vinyl Record"
                    draggable={false}
                    className="pointer-events-none w-full h-full object-contain select-none"
                  />

                  {/* Concentric micro-groove rings */}
                  <div className="pointer-events-none absolute inset-0">
                    {PRE_RENDERED_GROOVE_RINGS.map((ring) => (
                      <div
                        key={ring.id}
                        style={{
                          inset: `${ring.insetPct}%`,
                          opacity: ring.opacity,
                          borderWidth: `${ring.widthPx}px`,
                        }}
                        className="pointer-events-none absolute rounded-full border border-white"
                      />
                    ))}
                  </div>

                  {/* ===========================================================
                      REQUIREMENT 4: CIRCULAR ALBUM-ART OVERLAY CENTERED ON THE SPINNING VINYL
                      Visible simultaneously alongside the left-side square holder box
                      =========================================================== */}
                  <div
                    id="vinyl-center-label-art"
                    data-testid="vinyl-center-label-art"
                    className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34%] h-[34%] rounded-full overflow-hidden border-2 border-[#d4af37]/70 shadow-[0_0_10px_rgba(0,0,0,0.9),inset_0_0_6px_rgba(0,0,0,0.85)] z-10"
                  >
                    {renderSongArtworkContent('vinyl-label-artwork-img', 'vinyl-label-art-skeleton')}
                    <div className="pointer-events-none absolute inset-1 rounded-full border border-white/20" />
                  </div>

                  {/* Center Spindle Pin */}
                  <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#120d09] border border-zinc-400/80 shadow-inner z-20" />
                </div>

                {/* ===========================================================
                    REQUIREMENT 11: STATIC VINYL LIGHTING HIGHLIGHT OVERLAY
                    Fixed non-rotating sibling above #vinyl-record-spin-layer so the
                    light source/shine stays static in a fixed position while only the
                    vinyl record and its center label rotate underneath it.
                    =========================================================== */}
                <div
                  id="vinyl-static-light-overlay"
                  data-static-light="true"
                  className="pointer-events-none absolute inset-0 rounded-full overflow-hidden select-none z-20"
                >
                  <img
                    src="/turntable/vinyl-light-overlay.png"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="pointer-events-none w-full h-full object-contain opacity-85 mix-blend-screen select-none"
                  />
                  <img
                    src="/turntable/vinyl-dust-overlay.png"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 w-full h-full object-contain opacity-30 select-none"
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      background:
                        'conic-gradient(from 315deg at 50% 50%, rgba(255,248,230,0.22) 0deg, rgba(255,248,230,0.0) 38deg, rgba(0,0,0,0.0) 145deg, rgba(255,245,225,0.14) 180deg, rgba(255,245,225,0.0) 220deg, rgba(0,0,0,0.0) 325deg, rgba(255,248,230,0.22) 360deg)',
                    }}
                    className="pointer-events-none absolute inset-0 rounded-full"
                  />
                </div>
              </div>
            </div>

            {/* ===============================================================
                REQUIREMENTS 7 & 8: RESPONSIVE TOP-RIGHT TONEARM ASSEMBLY
                Anchored higher at top-right of #turntable-plinth-bed just below
                #console-title-plate, clear of the right-side vertical controls column.
                =============================================================== */}
            <RasterTonearmAssembly
              trackId={track.id}
              durationSec={track.durationSec}
              bedWidth={plinthBedSize.width}
              bedHeight={plinthBedSize.height}
              vinylDiameterPx={vinylDiameterPx}
              vinylCenterXPct={vinylCenterXPct}
              rightReservedPx={rightControlsWidthPx}
              isPlaying={isPlaying}
              isStandby={isStandby}
              isStoppedAtRest={isStoppedAtRest}
              forceTonearmRest={stagePose.forceTonearmRest}
              isDocumentHidden={isDocumentHidden}
              lowPowerMode={lowPowerMode}
              prefersReducedMotion={prefersReducedMotion}
              onDragTonearmToTime={onDragTonearmToTime}
            />

            {/* ===============================================================
                REQUIREMENTS 1 & 2: SIMPLIFIED RIGHT-SIDE VERTICAL CONTROLS COLUMN
                - ONLY the Vertical Pitch Fader and Vertical Volume Fader (matching metal style)
                =============================================================== */}
            <div
              ref={rightControlsRef}
              id="turntable-right-controls-column"
              data-testid="turntable-right-controls-column"
              className={`absolute right-1 inset-y-1 z-35 flex items-stretch gap-1 rounded-[5px] bg-[#120a05]/85 border border-[#5e3e22]/85 shadow-[inset_0_2px_6px_rgba(0,0,0,0.92),0_3px_10px_rgba(0,0,0,0.75)] ${
                isCompactLandscape ? 'p-[3px]' : 'p-1'
              }`}
            >
              <VerticalPitchFader
                pitchPercent={pitchPercent}
                compact={isCompactLandscape}
                lowPowerMode={lowPowerMode}
                onChangePitch={onChangePitch}
              />
              <VerticalVolumeFader
                volume={volume}
                compact={isCompactLandscape}
                lowPowerMode={lowPowerMode}
                onChangeVolume={onChangeVolume}
              />
            </div>
          </div>

          {/* --- SEEK TIMELINE ABOVE FULL-WIDTH VFD LYRICS SCREEN --- */}
          <div
            ref={lyricsStripRef}
            id="lyrics-strip-slot"
            className="relative z-10 w-full shrink-0 flex flex-col gap-1"
          >
            <TopSeekTimelineBar
              trackId={track.id}
              durationSec={track.durationSec}
              isStandby={isStandby}
              lowPowerMode={lowPowerMode}
              onSeek={onSeek}
            />

            <SyncedLyricsPanel
              track={track}
              isStandby={isStandby}
              isPlaying={isPlaying}
              isDocumentHidden={isDocumentHidden}
              lowPowerMode={lowPowerMode}
              nightMode={nightMode}
              playbackRate={rpm === 45 ? (45 / 33.333) * (1 + pitchPercent / 100) : 1 + pitchPercent / 100}
              prefersReducedMotion={prefersReducedMotion}
              themePalette={themePalette}
              onSeek={onSeek}
              className={isCompactLandscape ? 'h-[44px]' : 'h-[58px] sm:h-[64px]'}
            />
          </div>
        </div>

        {/* ===================================================================
            CHAMFERED WALNUT BEVEL EDGE BETWEEN TOP SURFACE & FRONT APRON
            =================================================================== */}
        <div
          id="console-chamfer-edge"
          aria-hidden="true"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,220,175,0.28) 0%, rgba(138,82,41,0.55) 35%, rgba(42,22,10,0.9) 85%, rgba(12,6,3,0.98) 100%)',
          }}
          className={`relative z-10 ${
            isCompactLandscape ? 'my-0.5 h-1.5' : 'my-1 h-2'
          } -mx-2 sm:-mx-3 shadow-[0_3px_8px_rgba(0,0,0,0.75)] shrink-0`}
        />

        {/* ===================================================================
            2. WOODEN FRONT APRON FACE:
               Control Bar (Requirements 5 & 6) + Front Rotary Dials
            =================================================================== */}
        <div
          id="console-front-face"
          style={{
            backgroundImage: 'url(/console/console-front-wood.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          className={`relative z-10 rounded-lg border border-[#6e4626]/85 shadow-[inset_0_2px_6px_rgba(255,215,170,0.12),0_4px_12px_rgba(0,0,0,0.9)] px-2 sm:px-3 ${
            isCompactLandscape ? 'py-1' : 'py-1.5'
          } shrink-0`}
        >
          <div
            aria-hidden="true"
            style={{
              background:
                'linear-gradient(180deg, rgba(20,10,5,0.52) 0%, rgba(12,6,3,0.78) 100%)',
            }}
            className="pointer-events-none absolute inset-0 rounded-lg"
          />

          <div className="relative z-10 flex flex-col items-center">
            {/* --- CONTROL BAR ROW (Anchored Flush at Bottom of #console-front-face) --- */}
            <div
              id="turntable-control-row"
              className="w-full flex items-end justify-between gap-1 sm:gap-2 px-0.5"
            >
              {/* LEFT END: Vertically Stacked Classic Analog Toggle Switches (Shuffle + Repeat)
                  Top & Bottom edges match Play/Pause button plate (Requirements 5 & 6) */}
              <div
                id="shuffle-repeat-stack"
                style={{ height: `${endModuleHeightPx}px` }}
                className={`flex flex-col justify-between gap-[2px] p-[3px] rounded-[4px] bg-[#0c0704]/95 border border-[#5e3e22]/90 shadow-[inset_0_2px_5px_rgba(0,0,0,0.95),0_1px_0_rgba(255,214,165,0.16)] shrink-0 ${
                  isCompactLandscape ? 'w-[58px]' : 'w-[60px] lg:w-[86px] xl:w-[100px]'
                }`}
              >
                <ClassicAnalogToggleSwitch
                  id="toggle-shuffle"
                  label="SHF"
                  isOn={shuffleEnabled}
                  disabled={isStandby}
                  compact={isCompactLandscape}
                  ariaLabel="Toggle Shuffle"
                  title={`Shuffle: ${shuffleEnabled ? 'ON' : 'OFF'}`}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleShuffle();
                  }}
                />
                <ClassicAnalogToggleSwitch
                  id="toggle-repeat"
                  label="RPT"
                  isOn={repeatOne}
                  disabled={isStandby}
                  compact={isCompactLandscape}
                  ariaLabel="Toggle Repeat Current Song"
                  title={`Repeat One: ${repeatOne ? 'ON' : 'OFF'}`}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleRepeatOne();
                  }}
                />
              </div>

              {/* CENTER: Hardware Transport Push-Buttons (Prev / Scratch / Play-Pause / Stop / Next) */}
              <div
                id="transport-buttons-group"
                className="flex items-end justify-center gap-0.5 sm:gap-1.5 lg:gap-2"
              >
                {/* Prev */}
                <div className="flex flex-col items-center justify-end gap-0.5">
                  <button
                    id="btn-prev-track"
                    type="button"
                    disabled={isStandby}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onPrevious();
                    }}
                    aria-label="Previous Track"
                    title="Previous Track"
                    className={`relative ${
                      isCompactLandscape ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8 xl:w-9 xl:h-9'
                    } rounded-full flex items-center justify-center cursor-pointer active:translate-y-[1px] disabled:opacity-40`}
                  >
                    <img
                      src="/console/pushbutton-up.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                    />
                    <SkipBack className="relative z-10 w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#18130e] fill-current" />
                  </button>
                  <HardwareEngravedPlate label="PREV" compact={isCompactLandscape} />
                </div>

                {/* Scratch Pushbutton — Positioned Immediately to the LEFT of Play/Pause (Requirement 9) */}
                <div className="flex flex-col items-center justify-end gap-0.5">
                  <button
                    id="btn-scratch-vinyl"
                    type="button"
                    disabled={isStandby}
                    onClick={handleTriggerScratch}
                    aria-label="Scratch Vinyl"
                    title="Vinyl Scratch FX"
                    className={`relative ${
                      isCompactLandscape ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8 xl:w-9 xl:h-9'
                    } rounded-full flex items-center justify-center cursor-pointer active:translate-y-[1px] disabled:opacity-40`}
                  >
                    <img
                      src={
                        scratchPulseActive
                          ? '/console/pushbutton-down.webp'
                          : '/console/pushbutton-up.webp'
                      }
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                    />
                    <Disc3
                      className={`relative z-10 w-3 h-3 sm:w-3.5 sm:h-3.5 ${
                        scratchPulseActive ? 'text-amber-300' : 'text-[#18130e]'
                      }`}
                    />
                  </button>
                  <HardwareEngravedPlate label="SCRATCH" compact={isCompactLandscape} />
                </div>

                {/* Primary Play / Pause Hardware Key (Reference height for #shuffle-repeat-stack & #console-time-display) */}
                <div
                  id="play-pause-plate"
                  ref={playPausePlateRef}
                  className="flex flex-col items-center justify-end gap-0.5"
                >
                  <button
                    id="btn-play-pause"
                    ref={playPauseBtnRef}
                    type="button"
                    disabled={isStandby}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onTogglePlay();
                    }}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    title={isPlaying ? 'Pause Turntable' : 'Play Turntable'}
                    className={`relative ${
                      isCompactLandscape
                        ? 'w-[28px] h-[28px]'
                        : 'w-[36px] h-[36px] sm:w-[38px] sm:h-[38px] xl:w-[44px] xl:h-[44px]'
                    } rounded-full flex items-center justify-center cursor-pointer active:translate-y-[1px] disabled:opacity-40`}
                  >
                    <img
                      src={isPlaying ? '/console/pushbutton-down.webp' : '/console/pushbutton-up.webp'}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                    />
                    {isPlaying ? (
                      <Pause className="relative z-10 w-4 h-4 xl:w-5 xl:h-5 text-amber-300 fill-current" />
                    ) : (
                      <Play className="relative z-10 w-4 h-4 xl:w-5 xl:h-5 text-[#18130e] fill-current ml-0.5" />
                    )}
                  </button>
                  <HardwareEngravedPlate
                    label={isPlaying ? 'PAUSE' : 'PLAY'}
                    compact={isCompactLandscape}
                  />
                </div>

                {/* Stop */}
                <div className="flex flex-col items-center justify-end gap-0.5">
                  <button
                    id="btn-stop-playback"
                    type="button"
                    disabled={isStandby}
                    onClick={handleStopClick}
                    aria-label="Stop Playback and Return Tonearm"
                    title="Stop & Return Tonearm to Rest"
                    className={`relative ${
                      isCompactLandscape ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8 xl:w-9 xl:h-9'
                    } rounded-full flex items-center justify-center cursor-pointer active:translate-y-[1px] disabled:opacity-40`}
                  >
                    <img
                      src="/console/pushbutton-up.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                    />
                    <Square className="relative z-10 w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#18130e] fill-current" />
                  </button>
                  <HardwareEngravedPlate label="STOP" compact={isCompactLandscape} />
                </div>

                {/* Next */}
                <div className="flex flex-col items-center justify-end gap-0.5">
                  <button
                    id="btn-next-track"
                    type="button"
                    disabled={isStandby}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onNext();
                    }}
                    aria-label="Next Track"
                    title="Next Track"
                    className={`relative ${
                      isCompactLandscape ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8 xl:w-9 xl:h-9'
                    } rounded-full flex items-center justify-center cursor-pointer active:translate-y-[1px] disabled:opacity-40`}
                  >
                    <img
                      src="/console/pushbutton-up.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                    />
                    <SkipForward className="relative z-10 w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#18130e] fill-current" />
                  </button>
                  <HardwareEngravedPlate label="NEXT" compact={isCompactLandscape} />
                </div>
              </div>

              {/* RIGHT END: Live Current Time (Larger Font) + Date with Weekday (Smaller Font)
                  Top & Bottom edges match #shuffle-repeat-stack and Play/Pause button plate */}
              <ConsoleClockDateBox
                heightPx={endModuleHeightPx}
                compact={isCompactLandscape}
                isDocumentHidden={isDocumentHidden}
              />
            </div>
          </div>
        </div>
      </section>
    );
  }
);
