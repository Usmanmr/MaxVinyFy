import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat1,
  Sparkles,
  Disc3,
} from 'lucide-react';
import {
  formatDuration,
  formatConsoleClockAndDate,
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  shouldRunActiveAnimationLoops,
  triggerButtonHaptic,
} from '../utils/playerLogic';
import { useDoubleTapHideArt } from '../hooks/useDoubleTapHideArt';
import {
  AURORA_PALETTE,
  AURORA_TRACK_CHANGE_TIMELINE_MS,
  AURORA_TIME_SHEAR_MS,
  auroraHexToRgba,
  extractTwoAuroraAccentsFromRgbSamples,
  generateAuroraDiscRings,
  computeAuroraParallaxTilt,
  generateAuroraParticles,
  stepAuroraParticles,
  calculateAuroraShardDragTilt,
  getAuroraTrackChangePhase,
  computeAuroraBeamBend,
  computeAuroraColumnDragValue,
  computePixelDancerBeatState,
  type AuroraDualAccents,
  type AuroraParticle,
  type AuroraTrackChangePhase,
  type AuroraPixelDancerBeatState,
} from '../utils/auroraLogic';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import { retroAudio } from '../utils/retroAudioEngine';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';

export interface AuroraDeckProps extends TurntableDeckProps {
  auroraAccents?: AuroraDualAccents;
}

function getSafeClockSnapshot(): { timeText: string; dateText: string } {
  const now = new Date();
  const formatted = formatConsoleClockAndDate(now);
  return {
    timeText: formatted.timeText,
    dateText: formatted.dateText,
  };
}

export const AuroraDeck: React.FC<AuroraDeckProps> = ({
  track,
  isPlaying,
  isDocumentHidden,
  lowPowerMode,
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
  auroraAccents,
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
  onScratch,
  onResolvedPerTrackArtwork,
}) => {
  const doubleTapHideHandlers = useDoubleTapHideArt({
    enabled: !hideBoxArt,
    onHide: onToggleHideBoxArt,
  });
  const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
  const activeLoopsEnabled = shouldRunActiveAnimationLoops(
    isPlaying,
    isDocumentHidden,
    prefersReducedMotion,
    lowPowerMode
  );
  const currentSec = usePlaybackSecond();
  const safeDuration = Math.max(1, track.durationSec || 1);
  const clampedSec = isStandby ? 0 : Math.min(safeDuration, Math.max(0, currentSec));

  // Dual art-extracted accents (passed from App canvas pass, or seed fallback)
  const resolvedAccents = useMemo<AuroraDualAccents>(() => {
    if (auroraAccents) return auroraAccents;
    return extractTwoAuroraAccentsFromRgbSamples(
      [],
      isStandby ? 'standby-empty' : `${track.id}-${track.title}`
    );
  }, [auroraAccents, isStandby, track.id, track.title]);

  const primaryHex = resolvedAccents.primaryHex;
  const secondaryHex = resolvedAccents.secondaryHex;
  const discRings = useMemo(
    () => generateAuroraDiscRings(primaryHex, secondaryHex),
    [primaryHex, secondaryHex]
  );

  // Subtle mount initialization shimmer cue
  useEffect(() => {
    retroAudio.triggerAuroraLoadCue();
  }, []);

  // Artwork resolution + fallback
  const [artworkAttempt, setArtworkAttempt] = useState<number>(0);
  const [artworkBroken, setArtworkBroken] = useState<boolean>(false);
  const artworkState = useMemo(
    () => resolveActiveArtworkState(track, artworkAttempt),
    [track, artworkAttempt]
  );
  const resolvedArtworkUrl = artworkState.activeUrl || '';
  const hasMoreFallbackCandidates = artworkAttempt + 1 < artworkState.candidates.length;

  useEffect(() => {
    setArtworkAttempt(0);
    setArtworkBroken(false);
  }, [track.id, track.artworkUrl]);

  useEffect(() => {
    if (!isStandby && !resolvedArtworkUrl && onResolvedPerTrackArtwork) {
      let cancelled = false;
      const params = new URLSearchParams({
        trackId: track.id,
        title: track.title,
        artist: track.artist || '',
      });
      fetch(`/api/spotify/track-artwork?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.artworkUrl) {
            onResolvedPerTrackArtwork(track.id, data.artworkUrl);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [
    isStandby,
    resolvedArtworkUrl,
    track.id,
    track.title,
    track.artist,
    onResolvedPerTrackArtwork,
  ]);

  // Clock / date updates at 60s cadence, halted when hidden
  const [clockSnapshot, setClockSnapshot] = useState(getSafeClockSnapshot);
  useEffect(() => {
    if (isDocumentHidden) return;
    setClockSnapshot(getSafeClockSnapshot());
    const id = window.setInterval(() => {
      setClockSnapshot(getSafeClockSnapshot());
    }, 15000);
    return () => window.clearInterval(id);
  }, [isDocumentHidden]);

  const timeParts = clockSnapshot.timeText.split(':');
  const clockHours = timeParts[0] || clockSnapshot.timeText;
  const clockMinutesAndAmPm = timeParts.slice(1).join(':');

  // Track-change <= 1.5s choreography: collapse -> split -> bloom + synth riser/bloom SFX
  const prevTrackIdRef = useRef<string>(track.id);
  const [trackChangePhase, setTrackChangePhase] = useState<AuroraTrackChangePhase>('idle');

  useEffect(() => {
    if (prevTrackIdRef.current === track.id) return;
    prevTrackIdRef.current = track.id;

    if (prefersReducedMotion || lowPowerMode || isDocumentHidden) {
      setTrackChangePhase('idle');
      return;
    }

    retroAudio.triggerAuroraTrackChangeCue(AURORA_TRACK_CHANGE_TIMELINE_MS.splitMs);
    setTrackChangePhase('collapse');
    const splitTimer = window.setTimeout(() => {
      setTrackChangePhase(getAuroraTrackChangePhase(AURORA_TRACK_CHANGE_TIMELINE_MS.collapseMs));
    }, AURORA_TRACK_CHANGE_TIMELINE_MS.collapseMs);
    const bloomTimer = window.setTimeout(() => {
      setTrackChangePhase(getAuroraTrackChangePhase(AURORA_TRACK_CHANGE_TIMELINE_MS.splitMs));
    }, AURORA_TRACK_CHANGE_TIMELINE_MS.splitMs);
    const doneTimer = window.setTimeout(() => {
      setTrackChangePhase('idle');
    }, AURORA_TRACK_CHANGE_TIMELINE_MS.totalMs);

    return () => {
      window.clearTimeout(splitTimer);
      window.clearTimeout(bloomTimer);
      window.clearTimeout(doneTimer);
    };
  }, [track.id, prefersReducedMotion, lowPowerMode, isDocumentHidden]);

  // 3D Parallax tilt for levitating holo-disc (±6° spring-damped)
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [parallaxTilt, setParallaxTilt] = useState<{ rotateXDeg: number; rotateYDeg: number }>({
    rotateXDeg: 0,
    rotateYDeg: 0,
  });

  const handleStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || lowPowerMode) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      setParallaxTilt(computeAuroraParallaxTilt(nx, ny));
    },
    [prefersReducedMotion, lowPowerMode]
  );

  const handleStagePointerLeave = useCallback(() => {
    setParallaxTilt({ rotateXDeg: 0, rotateYDeg: 0 });
  }, []);

  // Drifting particles emitted from vertical light-beam needle (max 24, transform+opacity only, halted when paused/hidden)
  // + Interactive Beat-Reactive Pixel Neon Dancer state synchronized in real time to audio/BPM
  const [particles, setParticles] = useState<AuroraParticle[]>(() =>
    generateAuroraParticles(AURORA_PALETTE.maxParticles)
  );
  const [dancerBoostActive, setDancerBoostActive] = useState<boolean>(false);
  const dancerBoostTimerRef = useRef<number | null>(null);
  const [dancerBeatState, setDancerBeatState] = useState<AuroraPixelDancerBeatState>(() =>
    computePixelDancerBeatState(0, track.bpm || 122, 0.55, false, false)
  );

  useEffect(() => {
    return () => {
      if (dancerBoostTimerRef.current !== null) {
        window.clearTimeout(dancerBoostTimerRef.current);
      }
    };
  }, []);

  const handleTriggerDancerBoost = useCallback(() => {
    triggerButtonHaptic(lowPowerMode);
    if (dancerBoostTimerRef.current !== null) {
      window.clearTimeout(dancerBoostTimerRef.current);
    }
    setDancerBoostActive(true);
    setDancerBeatState((prev: AuroraPixelDancerBeatState) => ({
      ...prev,
      pose: 'art-highfive',
      artReachXPx: -14,
      glowAlpha: 1,
    }));
    dancerBoostTimerRef.current = window.setTimeout(() => {
      setDancerBoostActive(false);
      dancerBoostTimerRef.current = null;
    }, 900);
  }, [lowPowerMode]);

  useEffect(() => {
    if (!activeLoopsEnabled) {
      setDancerBeatState(
        computePixelDancerBeatState(0, track.bpm || 122, 0, false, dancerBoostActive)
      );
      return;
    }
    let rafId = 0;
    let lastTs = performance.now();
    const tick = (now: number) => {
      const dtSec = Math.max(0.008, (now - lastTs) / 1000);
      lastTs = now;
      setParticles((prev) => stepAuroraParticles(prev, dtSec, true));
      const syntheticEnergy =
        0.52 + 0.38 * Math.abs(Math.sin(now * 0.0055)) + 0.1 * Math.cos(now * 0.013);
      setDancerBeatState(
        computePixelDancerBeatState(
          now,
          track.bpm || 122,
          syntheticEnergy,
          true,
          dancerBoostActive
        )
      );
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeLoopsEnabled, track.bpm, dancerBoostActive]);

  // Time-Shear scratch counter-rotation burst
  const [isTimeShearActive, setIsTimeShearActive] = useState<boolean>(false);
  const timeShearTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timeShearTimerRef.current !== null) {
        window.clearTimeout(timeShearTimerRef.current);
      }
    };
  }, []);

  const handleTimeShear = () => {
    triggerButtonHaptic(lowPowerMode);
    onScratch('classic');
    if (prefersReducedMotion || lowPowerMode) return;
    if (timeShearTimerRef.current !== null) {
      window.clearTimeout(timeShearTimerRef.current);
    }
    setIsTimeShearActive(true);
    timeShearTimerRef.current = window.setTimeout(() => {
      setIsTimeShearActive(false);
      timeShearTimerRef.current = null;
    }, AURORA_TIME_SHEAR_MS);
  };

  // Draggable Glass Shard Holder (#album-art-holder-box)
  const [shardOffset, setShardOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isShardDragging, setIsShardDragging] = useState<boolean>(false);
  const [shardDragDelta, setShardDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const shardDragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const handleShardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsShardDragging(true);
    setShardDragDelta({ x: 0, y: 0 });
    shardDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: shardOffset.x,
      startY: shardOffset.y,
    };
  };

  const handleShardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!shardDragStartRef.current) return;
    const dx = e.clientX - shardDragStartRef.current.clientX;
    const dy = e.clientY - shardDragStartRef.current.clientY;
    setShardDragDelta({ x: dx, y: dy });
    const clamped = clampHolderBoxDragOffset({
      offsetX: shardDragStartRef.current.startX + dx,
      offsetY: shardDragStartRef.current.startY + dy,
      boardWidth: 260,
      boardHeight: 210,
      boxSize: 120,
      homeCenterX: 168,
      homeCenterY: 105,
      snapRadiusPx: 10,
    });
    setShardOffset({ x: clamped.offsetX, y: clamped.offsetY });
  };

  const handleShardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!shardDragStartRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    shardDragStartRef.current = null;
    setIsShardDragging(false);
    setShardDragDelta({ x: 0, y: 0 });
  };

  const shardMagneticTiltDeg = isShardDragging
    ? calculateAuroraShardDragTilt(shardDragDelta.x, shardDragDelta.y, true)
    : 0;

  // Horizontal Light-Beam Seek Scrubbing + Beam Bend
  const seekTrackRef = useRef<HTMLDivElement | null>(null);
  const [isSeekScrubbing, setIsSeekScrubbing] = useState<boolean>(false);
  const [scrubPreviewPct, setScrubPreviewPct] = useState<number | null>(null);
  const [beamBendDyPx, setBeamBendDyPx] = useState<number>(0);

  const progressPct = isStandby
    ? 0
    : scrubPreviewPct !== null
      ? scrubPreviewPct
      : Math.min(100, Math.max(0, (clampedSec / safeDuration) * 100));

  const updateSeekFromPointer = (clientX: number, clientY: number, commit: boolean) => {
    const el = seekTrackRef.current;
    if (!el || isStandby) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const dy = clientY - (rect.top + rect.height / 2);
    const bent = computeAuroraBeamBend(ratio, dy, true);
    setScrubPreviewPct(bent.percent);
    setBeamBendDyPx(bent.bendDyPx);
    if (commit) {
      const targetSec = Math.round(ratio * safeDuration);
      playbackClockStore.setTime(targetSec, true);
      onSeek(targetSec);
    }
  };

  // Vertical Light-Column Pointer Dragging (Volume + Pitch)
  const volumeColRef = useRef<HTMLDivElement | null>(null);
  const pitchColRef = useRef<HTMLDivElement | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<'volume' | 'pitch' | null>(null);

  const handleColumnPointer = (
    kind: 'volume' | 'pitch',
    clientY: number,
    el: HTMLDivElement | null
  ) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    if (kind === 'volume') {
      const nextPct = computeAuroraColumnDragValue(ratio, 0, 100, 1);
      onChangeVolume(Number((nextPct / 100).toFixed(2)));
    } else {
      const nextPitch = computeAuroraColumnDragValue(ratio, -8, 8, 0.5);
      onChangePitch(nextPitch);
    }
  };

  const volumeFillPct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
  const pitchFillPct = Math.round(((Math.max(-8, Math.min(8, pitchPercent)) + 8) / 16) * 100);

  // Track-change disc collapse / split / bloom transform + opacity
  const discStageTransform =
    trackChangePhase === 'collapse'
      ? 'scale(0.06)'
      : trackChangePhase === 'split'
        ? 'scale(0.22)'
        : 'scale(1)';

  const discDimOpacity =
    trackChangePhase === 'collapse'
      ? 0.92
      : trackChangePhase === 'split'
        ? 0.96
        : isPlaying || isStandby
          ? 1
          : AURORA_PALETTE.pausedDiscDimOpacity; // paused = dims 40% (0.6)

  const isCompactLandscape = viewportLayout === 'mobile-landscape';
  const playbackRateFactor = Math.max(0.6, (rpm === 45 ? 45 / 33.3333 : 1) * (1 + pitchPercent / 100));

  return (
    <section
      id="turntable-console-card"
      data-aurora-active={activeLoopsEnabled ? 'true' : 'false'}
      data-aurora-reduced={prefersReducedMotion || lowPowerMode ? 'true' : 'false'}
      data-aurora-track-phase={trackChangePhase}
      data-aurora-accent-1={primaryHex}
      data-aurora-accent-2={secondaryHex}
      aria-label="Aurora Deck Holographic Instrument Console"
      className="aurora-glass-panel panel-contain relative w-full h-full min-h-0 rounded-[20px] px-3 sm:px-5 py-2.5 sm:py-3.5 flex flex-col justify-between gap-1.5 sm:gap-2.5 overflow-hidden text-[#EAF2FF]"
    >
      {/* Subtle Ambient Chromatic Framing Highlight + 3D Perspective Holographic Grid Floor + Scanning Laser Beam */}
      <div
        aria-hidden="true"
        style={{
          background: `radial-gradient(ellipse at 26% 36%, ${auroraHexToRgba(
            primaryHex,
            0.16
          )} 0%, transparent 56%), radial-gradient(ellipse at 76% 64%, ${auroraHexToRgba(
            secondaryHex,
            0.14
          )} 0%, transparent 58%)`,
        }}
        className="pointer-events-none absolute inset-0 z-0"
      />
      <div
        id="aurora-holo-grid"
        aria-hidden="true"
        className="aurora-holo-grid-floor pointer-events-none absolute inset-x-0 bottom-0 h-[56%] z-0 opacity-75"
      />
      {!prefersReducedMotion && !lowPowerMode && (
        <div
          id="aurora-laser-scanline"
          aria-hidden="true"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${auroraHexToRgba(
              primaryHex,
              0.42
            )} 35%, ${auroraHexToRgba(secondaryHex, 0.48)} 65%, transparent 100%)`,
            boxShadow: `0 0 12px ${auroraHexToRgba(primaryHex, 0.35)}`,
          }}
          className="aurora-laser-scanline pointer-events-none absolute inset-x-4 top-0 h-[1.5px] z-[5]"
        />
      )}

      {/* Top Holographic Header: Wide-Tracked Shimmer Title + Telemetry Clock */}
      <header className="relative z-20 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="relative inline-block max-w-full overflow-hidden rounded">
            <h2
              id="console-song-title"
              style={{
                textShadow: `0 0 12px ${auroraHexToRgba(primaryHex, 0.35)}`,
              }}
              className={`font-display font-light tracking-[0.08em] text-[#EAF2FF] truncate ${
                isCompactLandscape
                  ? 'text-[16px] leading-tight'
                  : 'text-[19px] sm:text-[24px] leading-tight'
              }`}
            >
              {isStandby ? 'Awaiting Signal Input' : track.title}
            </h2>
            {!prefersReducedMotion && !lowPowerMode && (
              <span
                id="aurora-title-shimmer"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(105deg, transparent 20%, ${auroraHexToRgba(
                    primaryHex,
                    0.42
                  )} 50%, transparent 80%)`,
                }}
                className="aurora-title-shimmer-beam pointer-events-none absolute inset-y-0 -left-1/2 w-1/2"
              />
            )}
          </div>
          <p
            id="console-song-artist"
            className="font-sans text-[12px] sm:text-[13px] tracking-[0.04em] text-[#8E9AB8] truncate mt-0.5"
          >
            {isStandby ? 'Load a playlist to illuminate field' : `${track.artist} · ${track.album}`}
          </p>
        </div>

        {/* Thin-Mono Clock & Date Telemetry Display */}
        <div className="flex flex-col items-end shrink-0 text-right">
          <div
            id="console-clock-readout"
            style={{
              textShadow: `0 0 12px ${auroraHexToRgba(AURORA_PALETTE.cyan, 0.35)}`,
            }}
            className="font-mono font-extralight text-[13px] sm:text-[16px] tracking-wider text-[#EAF2FF] leading-none flex items-center"
          >
            <span>{clockHours}</span>
            <span className="aurora-clock-colon-pulse mx-[1px] text-[#4DE1FF]">:</span>
            <span>{clockMinutesAndAmPm}</span>
          </div>
          <span
            id="console-date-readout"
            className="font-mono font-extralight text-[9.5px] sm:text-[10.5px] tracking-[0.14em] text-[#8E9AB8] uppercase mt-1 leading-none"
          >
            {clockSnapshot.dateText}
          </span>
        </div>
      </header>

      {/* Center Stage: Levitating 9-Ring Holo-Disc + Glass Shard Card + Light-Columns */}
      <div
        ref={stageRef}
        onPointerMove={handleStagePointerMove}
        onPointerLeave={handleStagePointerLeave}
        className="relative z-10 flex-1 min-h-0 flex items-center justify-between gap-2 sm:gap-4"
      >
        {/* Left/Center Holographic Disc & Draggable Shard Field */}
        <div className="relative flex-1 min-w-0 h-full min-h-0 flex items-center justify-center sm:justify-start sm:pl-1 lg:pl-2">
          {/* Perspective Stage Holding the 9 Concentric Light Rings + Upright Center Card */}
          <div
            id="aurora-holo-stage"
            data-parallax-x={parallaxTilt.rotateXDeg}
            data-parallax-y={parallaxTilt.rotateYDeg}
            style={{
              perspective: '900px',
            }}
            className={`relative flex items-center justify-center ${
              isCompactLandscape
                ? 'w-[140px] h-[140px]'
                : 'w-[184px] h-[184px] sm:w-[190px] sm:h-[190px] lg:w-[238px] lg:h-[238px] xl:w-[268px] xl:h-[268px]'
            } shrink-0`}
          >
            <div
              id="aurora-holo-disc"
              data-ring-count={discRings.length}
              data-dimmed-paused={!isPlaying && !isStandby ? 'true' : 'false'}
              style={{
                opacity: discDimOpacity,
                transform: `rotateX(${parallaxTilt.rotateXDeg}deg) rotateY(${parallaxTilt.rotateYDeg}deg) ${discStageTransform}`,
                transition: prefersReducedMotion
                  ? 'none'
                  : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease',
              }}
              className="aurora-disc-transition relative w-full h-full flex items-center justify-center"
            >
              {/* Split Chromatic Light Core Visible During Track-Change Split Phase */}
              {trackChangePhase === 'split' && (
                <div
                  id="aurora-track-split-core"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 z-30"
                >
                  <span
                    style={{
                      backgroundColor: primaryHex,
                      boxShadow: `0 0 28px ${primaryHex}`,
                    }}
                    className="w-4 h-4 rounded-full"
                  />
                  <span
                    style={{
                      backgroundColor: secondaryHex,
                      boxShadow: `0 0 28px ${secondaryHex}`,
                    }}
                    className="w-4 h-4 rounded-full"
                  />
                </div>
              )}

              {/* 9 Concentric Rotating Light Rings (2 Extracted Art Colors Alternating, Inner Brighter & Faster) */}
              <div
                id="aurora-rings-orbit-wrap"
                className={`relative w-full h-full flex items-center justify-center ${
                  isTimeShearActive ? 'aurora-time-shear-burst' : ''
                }`}
              >
                {discRings.map((ring) => (
                  <div
                    key={ring.index}
                    data-aurora-ring={ring.index}
                    aria-hidden="true"
                    style={{
                      width: `${ring.diameterPct}%`,
                      height: `${ring.diameterPct}%`,
                      opacity: ring.opacity,
                      borderColor: auroraHexToRgba(ring.colorHex, Math.min(0.9, ring.opacity + 0.08)),
                      boxShadow: `0 0 12px ${ring.glowRgba}, inset 0 0 8px ${auroraHexToRgba(
                        ring.colorHex,
                        0.18
                      )}`,
                      animationDuration: `${(ring.spinDurationSec / playbackRateFactor).toFixed(2)}s`,
                      animationPlayState: activeLoopsEnabled ? 'running' : 'paused',
                    }}
                    className={`pointer-events-none absolute rounded-full border border-dashed ${
                      ring.directionSign === 1 ? 'aurora-ring-spin-cw' : 'aurora-ring-spin-ccw'
                    }`}
                  >
                    {/* Tiny Photon Node on Ring Perimeter (staggered azimuth so paused constellation stays balanced) */}
                    <span
                      style={{
                        transform: `rotate(${ring.index * 47}deg)`,
                      }}
                      className="absolute inset-0 pointer-events-none"
                    >
                      <span
                        style={{
                          backgroundColor: ring.colorHex,
                          boxShadow: `0 0 8px ${ring.colorHex}`,
                        }}
                        className="absolute -top-[2.5px] left-1/2 -translate-x-1/2 w-[4.5px] h-[4.5px] rounded-full"
                      />
                    </span>
                  </div>
                ))}
              </div>

              {/* Translucent Center Album Art Floating Upright at Disc Center + Interactive Beat-Reactive Pixel Neon Dancer */}
              <div
                id="vinyl-record-spinner"
                data-aurora-upright="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
              >
                <div
                  id="vinyl-center-artwork"
                  style={{
                    borderColor: auroraHexToRgba(primaryHex, 0.62),
                    boxShadow: `0 0 26px ${auroraHexToRgba(primaryHex, 0.38)}, inset 0 0 14px ${auroraHexToRgba(
                      secondaryHex,
                      0.28
                    )}`,
                    transform: `translate3d(${(dancerBeatState.artReachXPx * 0.18).toFixed(1)}px, 0, 0)`,
                  }}
                  className="w-[34%] h-[34%] rounded-xl overflow-hidden border bg-[#06070C]/55 backdrop-blur-md flex items-center justify-center opacity-92 transition-transform duration-150"
                >
                  {!isStandby && resolvedArtworkUrl && !artworkBroken ? (
                    <img
                      src={resolvedArtworkUrl}
                      alt={`${track.title} holographic center`}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onError={() => {
                        if (hasMoreFallbackCandidates) setArtworkAttempt((a) => a + 1);
                        else setArtworkBroken(true);
                      }}
                      className="w-full h-full object-cover opacity-85"
                    />
                  ) : (
                    <Disc3 strokeWidth={1.3} className="w-7 h-7 text-[#4DE1FF]/75" />
                  )}
                </div>

                {/* Interactive Beat-Reactive Pixel Neon Dancer Character Dancing Alongside & Touching the Floating Album Art */}
                <button
                  id="aurora-pixel-neon-dancer"
                  type="button"
                  aria-label="Interactive Pixel Neon Dancer (Click to boost dance move)"
                  title="Pixel Neon Holo-Dancer · Synchronized to Track BPM (Click for Art High-Five!)"
                  data-dancer-pose={dancerBeatState.pose}
                  data-dancer-active={activeLoopsEnabled ? 'true' : 'false'}
                  data-dancer-boost={dancerBoostActive ? 'true' : 'false'}
                  data-art-reach-px={Math.abs(dancerBeatState.artReachXPx)}
                  onClick={handleTriggerDancerBoost}
                  style={{
                    transform: `translate3d(${dancerBeatState.artReachXPx}px, ${dancerBeatState.bounceYPx}px, 0) rotate(${dancerBeatState.tiltDeg}deg) scale(${
                      dancerBoostActive ? 1.12 : 1
                    })`,
                    filter: `drop-shadow(0 0 ${Math.round(
                      8 + dancerBeatState.glowAlpha * 8
                    )}px ${primaryHex}) drop-shadow(0 0 12px ${secondaryHex})`,
                  }}
                  className="pointer-events-auto absolute right-[6%] bottom-[13%] w-[54px] h-[64px] sm:w-[62px] sm:h-[74px] flex flex-col items-center justify-center bg-transparent border-0 p-0 cursor-pointer select-none z-30 transition-transform duration-75"
                >
                  {/* Holographic Energy Tether Connecting Dancer Hand to Floating Album Art on Beat Peaks */}
                  {Math.abs(dancerBeatState.artReachXPx) >= 6 && (
                    <span
                      aria-hidden="true"
                      style={{
                        background: `linear-gradient(90deg, ${primaryHex} 0%, ${secondaryHex} 60%, transparent 100%)`,
                        boxShadow: `0 0 10px ${primaryHex}`,
                        opacity: dancerBeatState.glowAlpha,
                      }}
                      className="pointer-events-none absolute right-[76%] top-[36%] w-[24px] h-[2.5px] rounded-full"
                    />
                  )}

                  {/* Crisp 16x20 Pixel-Art Neon Cyber Dancer SVG */}
                  <svg
                    viewBox="0 0 16 20"
                    shapeRendering="crispEdges"
                    className="w-full h-full overflow-visible"
                    aria-hidden="true"
                  >
                    {/* Hologram Pedestal Ring Under Dancer Feet */}
                    <rect
                      x="2"
                      y="18"
                      width="12"
                      height="1"
                      fill={primaryHex}
                      opacity={0.75}
                    />
                    <rect
                      x="4"
                      y="19"
                      width="8"
                      height="1"
                      fill={secondaryHex}
                      opacity={0.55}
                    />

                    {/* Neon Headphones & Visor Head */}
                    <rect x="5" y="1" width="6" height="1" fill={secondaryHex} />
                    <rect x="4" y="2" width="1" height="3" fill={secondaryHex} />
                    <rect x="11" y="2" width="1" height="3" fill={secondaryHex} />
                    <rect x="5" y="2" width="6" height="4" fill="#101524" />
                    {/* Glowing Cyber Visor */}
                    <rect x="5" y="3" width="5" height="2" fill={primaryHex} />
                    <rect x="6" y="3" width="2" height="1" fill="#FFFFFF" />

                    {/* Neon Cyber Jacket Torso + Equalizer Core */}
                    <rect x="5" y="6" width="6" height="6" fill={secondaryHex} />
                    <rect x="6" y="7" width="4" height="4" fill="#0B1020" />
                    <rect
                      x="7"
                      y="8"
                      width="2"
                      height={dancerBeatState.pose === 'beat-bop' ? '3' : '2'}
                      fill={primaryHex}
                    />

                    {/* Left Arm (Reaches toward Floating Album Cover to High-Five / Spin It) */}
                    {dancerBeatState.pose === 'art-highfive' ||
                    dancerBeatState.pose === 'spin-groove' ? (
                      <>
                        <rect x="1" y="5" width="4" height="2" fill={primaryHex} />
                        <rect x="0" y="4" width="2" height="2" fill="#FFFFFF" />
                      </>
                    ) : dancerBeatState.pose === 'neon-wave' ? (
                      <>
                        <rect x="2" y="6" width="3" height="2" fill={primaryHex} />
                        <rect x="2" y="8" width="2" height="2" fill="#EAF2FF" />
                      </>
                    ) : (
                      <>
                        <rect x="3" y="7" width="2" height="3" fill={primaryHex} />
                        <rect x="2" y="9" width="2" height="2" fill="#EAF2FF" />
                      </>
                    )}

                    {/* Right Arm (Waves to the Beat) */}
                    {dancerBeatState.pose === 'neon-wave' ||
                    dancerBeatState.pose === 'spin-groove' ? (
                      <>
                        <rect x="11" y="5" width="3" height="2" fill={primaryHex} />
                        <rect x="13" y="3" width="2" height="2" fill="#EAF2FF" />
                      </>
                    ) : dancerBeatState.pose === 'beat-bop' ? (
                      <>
                        <rect x="11" y="8" width="3" height="2" fill={primaryHex} />
                        <rect x="13" y="10" width="2" height="2" fill="#EAF2FF" />
                      </>
                    ) : (
                      <>
                        <rect x="11" y="7" width="2" height="3" fill={primaryHex} />
                        <rect x="12" y="9" width="2" height="2" fill="#EAF2FF" />
                      </>
                    )}

                    {/* Articulated Pixel Legs & Neon High-Top Kicks */}
                    {dancerBeatState.pose === 'neon-wave' ? (
                      <>
                        <rect x="4" y="12" width="2" height="4" fill={primaryHex} />
                        <rect x="3" y="16" width="3" height="2" fill="#FFFFFF" />
                        <rect x="9" y="12" width="2" height="5" fill={secondaryHex} />
                        <rect x="9" y="17" width="3" height="1" fill={primaryHex} />
                      </>
                    ) : dancerBeatState.pose === 'spin-groove' ||
                      dancerBeatState.pose === 'art-highfive' ? (
                      <>
                        <rect x="5" y="12" width="2" height="5" fill={secondaryHex} />
                        <rect x="4" y="17" width="3" height="1" fill={primaryHex} />
                        <rect x="10" y="12" width="2" height="4" fill={primaryHex} />
                        <rect x="10" y="16" width="3" height="2" fill="#FFFFFF" />
                      </>
                    ) : dancerBeatState.pose === 'beat-bop' ? (
                      <>
                        <rect x="4" y="12" width="3" height="3" fill={primaryHex} />
                        <rect x="3" y="15" width="3" height="2" fill="#FFFFFF" />
                        <rect x="9" y="12" width="3" height="3" fill={primaryHex} />
                        <rect x="10" y="15" width="3" height="2" fill="#FFFFFF" />
                      </>
                    ) : (
                      <>
                        <rect x="5" y="12" width="2" height="5" fill={primaryHex} />
                        <rect x="4" y="17" width="3" height="1" fill="#FFFFFF" />
                        <rect x="9" y="12" width="2" height="5" fill={primaryHex} />
                        <rect x="9" y="17" width="3" height="1" fill="#FFFFFF" />
                      </>
                    )}
                  </svg>
                </button>
              </div>

              {/* Vertical Light-Beam Tonearm "Needle" Touching the Outer Ring */}
              <div
                id="aurora-light-needle"
                aria-hidden="true"
                style={{
                  opacity: isPlaying && !isStandby ? 0.95 : 0.35,
                  transition: prefersReducedMotion ? 'none' : 'opacity 260ms ease',
                }}
                className="pointer-events-none absolute top-1 right-[12%] h-[39%] flex flex-col items-center z-20"
              >
                <span className="w-2 h-2 rounded-full bg-[#4DE1FF] shadow-[0_0_10px_#4DE1FF]" />
                <span
                  style={{
                    background: `linear-gradient(180deg, #4DE1FF 0%, ${primaryHex} 85%, #FFFFFF 100%)`,
                    boxShadow: `0 0 10px ${primaryHex}`,
                  }}
                  className="w-[2px] flex-1"
                />
                {/* Contact Spark + Recycled Drifting Particles (<= 24) */}
                <div id="aurora-needle-particles" className="relative w-0 h-0">
                  <span
                    style={{
                      backgroundColor: '#FFFFFF',
                      boxShadow: `0 0 14px ${primaryHex}, 0 0 24px ${secondaryHex}`,
                    }}
                    className="absolute -left-[3px] -top-[3px] w-[6px] h-[6px] rounded-full"
                  />
                  {particles.map((p) => (
                    <span
                      key={p.id}
                      data-aurora-particle={p.id}
                      style={{
                        backgroundColor: p.accentSlot === 0 ? primaryHex : secondaryHex,
                        opacity: activeLoopsEnabled ? p.opacity : 0,
                        transform: `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})`,
                        transition: activeLoopsEnabled ? undefined : 'opacity 260ms ease',
                      }}
                      className="absolute left-0 top-0 w-[3.5px] h-[3.5px] rounded-full pointer-events-none"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Draggable Glass Shard Holder (#album-art-holder-box) with Chromatic Edge & Magnetic Tilt */}
          <div
            aria-hidden={hideBoxArt ? 'true' : undefined}
            style={{
              opacity: hideBoxArt ? 0 : 1,
              width: hideBoxArt ? '0px' : undefined,
              marginLeft: hideBoxArt ? '0px' : undefined,
              overflow: hideBoxArt ? 'hidden' : undefined,
              pointerEvents: hideBoxArt ? 'none' : 'auto',
              transform: `translate3d(${shardOffset.x}px, ${shardOffset.y}px, 0) rotate(${
                isShardDragging ? shardMagneticTiltDeg : 0
              }deg) scale(${hideBoxArt ? 0.94 : 1})`,
              transition: isShardDragging
                ? 'none'
                : prefersReducedMotion
                  ? 'none'
                  : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
            }}
            className={`hidden sm:block relative z-30 ml-1.5 lg:ml-4 shrink-0`}
          >
            <div
              id="album-art-holder-box"
              role="region"
              aria-label="Draggable Album Art Glass Shard"
              title="Drag glass shard · Double-click to hide album art"
              data-dragging={isShardDragging ? 'true' : 'false'}
              data-magnetic-tilt={shardMagneticTiltDeg}
              onPointerDown={handleShardPointerDown}
              onPointerDownCapture={doubleTapHideHandlers.onPointerDownCapture}
              onPointerMove={handleShardPointerMove}
              onPointerUp={handleShardPointerUp}
              onPointerUpCapture={doubleTapHideHandlers.onPointerUpCapture}
              onPointerCancel={handleShardPointerUp}
              onDoubleClick={doubleTapHideHandlers.onDoubleClick}
              className={`aurora-glass-panel aurora-chromatic-edge ${
                activeLoopsEnabled && !isShardDragging ? 'aurora-shard-sway' : ''
              } relative w-[86px] h-[86px] lg:w-[116px] lg:h-[116px] xl:w-[136px] xl:h-[136px] rounded-[14px] p-1.5 cursor-grab active:cursor-grabbing touch-none flex flex-col justify-between overflow-hidden`}
            >
              <div className="relative w-full h-full rounded-[9px] overflow-hidden border border-white/15 bg-[#06070C]/65 flex items-center justify-center">
                {!isStandby && resolvedArtworkUrl && !artworkBroken ? (
                  <img
                    src={resolvedArtworkUrl}
                    alt={`${track.title} album shard`}
                    draggable={false}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Disc3 strokeWidth={1.3} className="w-8 h-8 text-[#9D7CFF]/80" />
                )}
                <div
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 45%, ${auroraHexToRgba(
                      secondaryHex,
                      0.14
                    )} 100%)`,
                  }}
                  className="pointer-events-none absolute inset-0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Vertical Light-Columns (Pitch & Volume) with Floating Thin-Mono Numerals */}
        <div
          id="aurora-columns-dock"
          className="relative z-20 flex items-center gap-2.5 lg:gap-4 h-full min-h-[126px] sm:min-h-[150px] max-h-[210px] py-1 shrink-0"
        >
          {/* Pitch Light-Column */}
          <div className="flex flex-col items-center h-full justify-between gap-1.5">
            <span
              id="aurora-pitch-readout"
              style={{
                textShadow: `0 0 12px ${auroraHexToRgba(secondaryHex, 0.35)}`,
              }}
              className="font-mono font-extralight text-[10px] tracking-wider text-[#EAF2FF] tabular-nums"
            >
              {pitchPercent >= 0 ? `+${pitchPercent.toFixed(1)}` : pitchPercent.toFixed(1)}%
            </span>
            <div
              id="aurora-pitch-column"
              ref={pitchColRef}
              role="slider"
              tabIndex={0}
              aria-label="Pitch Control"
              aria-valuemin={-8}
              aria-valuemax={8}
              aria-valuenow={pitchPercent}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDraggingColumn('pitch');
                handleColumnPointer('pitch', e.clientY, pitchColRef.current);
              }}
              onPointerMove={(e) => {
                if (draggingColumn === 'pitch') {
                  handleColumnPointer('pitch', e.clientY, pitchColRef.current);
                }
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                setDraggingColumn(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  onChangePitch(Math.min(8, pitchPercent + 0.5));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  onChangePitch(Math.max(-8, pitchPercent - 0.5));
                }
              }}
              className="relative w-3.5 sm:w-4 h-[98px] sm:h-auto sm:flex-1 sm:min-h-[112px] rounded-full bg-white/[0.06] border border-white/[0.14] overflow-hidden cursor-ns-resize touch-none"
            >
              <div
                style={{
                  height: `${pitchFillPct}%`,
                  background: `linear-gradient(180deg, #EAF2FF 0%, ${secondaryHex} 100%)`,
                  boxShadow: `0 0 12px ${secondaryHex}`,
                }}
                className="absolute inset-x-[2px] bottom-[2px] rounded-full transition-[height] duration-75"
              />
            </div>
            <span className="font-mono font-extralight text-[8.5px] uppercase tracking-[0.14em] text-[#8E9AB8]">
              PITCH
            </span>
          </div>

          {/* Volume Light-Column */}
          <div className="flex flex-col items-center h-full justify-between gap-1.5">
            <span
              id="aurora-volume-readout"
              style={{
                textShadow: `0 0 12px ${auroraHexToRgba(primaryHex, 0.35)}`,
              }}
              className="font-mono font-extralight text-[10px] tracking-wider text-[#EAF2FF] tabular-nums"
            >
              {volumeFillPct}%
            </span>
            <div
              id="aurora-volume-column"
              ref={volumeColRef}
              role="slider"
              tabIndex={0}
              aria-label="Volume Control"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={volumeFillPct}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDraggingColumn('volume');
                handleColumnPointer('volume', e.clientY, volumeColRef.current);
              }}
              onPointerMove={(e) => {
                if (draggingColumn === 'volume') {
                  handleColumnPointer('volume', e.clientY, volumeColRef.current);
                }
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                setDraggingColumn(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  onChangeVolume(Math.min(1, Number((volume + 0.05).toFixed(2))));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  onChangeVolume(Math.max(0, Number((volume - 0.05).toFixed(2))));
                }
              }}
              className="relative w-3.5 sm:w-4 h-[98px] sm:h-auto sm:flex-1 sm:min-h-[112px] rounded-full bg-white/[0.06] border border-white/[0.14] overflow-hidden cursor-ns-resize touch-none"
            >
              <div
                style={{
                  height: `${volumeFillPct}%`,
                  background: `linear-gradient(180deg, #EAF2FF 0%, ${primaryHex} 100%)`,
                  boxShadow: `0 0 12px ${primaryHex}`,
                }}
                className="absolute inset-x-[2px] bottom-[2px] rounded-full transition-[height] duration-75"
              />
            </div>
            <span className="font-mono font-extralight text-[8.5px] uppercase tracking-[0.14em] text-[#8E9AB8]">
              VOL
            </span>
          </div>
        </div>
      </div>

      {/* Materializing Word-by-Word Holographic Lyrics Strip */}
      <div className={`relative z-20 shrink-0 ${isCompactLandscape ? 'h-[60px]' : 'h-[78px] sm:h-[94px]'}`}>
        <SyncedLyricsPanel
          track={track}
          isStandby={isStandby}
          isPlaying={isPlaying}
          isDocumentHidden={isDocumentHidden}
          lowPowerMode={lowPowerMode}
          playbackRate={playbackRateFactor}
          prefersReducedMotion={prefersReducedMotion}
          themePalette={themePalette}
          themeId="aurora-deck"
          auroraPrimaryHex={primaryHex}
          auroraSecondaryHex={secondaryHex}
          onSeek={onSeek}
          className="h-full"
        />
      </div>

      {/* Horizontal Light-Beam Seek Timeline (Solid Elapsed, Dotted Trail, Orb Thumb, Scrub Bend) */}
      <div className="relative z-20 flex items-center gap-2.5 shrink-0">
        <span
          id="console-elapsed-time"
          className="font-mono font-extralight text-[11px] text-[#EAF2FF] tabular-nums w-10 text-right shrink-0"
        >
          {formatDuration(clampedSec)}
        </span>

        <div
          id="aurora-seek-bar"
          ref={seekTrackRef}
          role="slider"
          tabIndex={0}
          aria-label="Holographic Light-Beam Seek"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={Math.round(clampedSec)}
          data-scrubbing={isSeekScrubbing ? 'true' : 'false'}
          data-beam-bend-px={beamBendDyPx}
          onPointerDown={(e) => {
            if (isStandby) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setIsSeekScrubbing(true);
            updateSeekFromPointer(e.clientX, e.clientY, true);
          }}
          onPointerMove={(e) => {
            if (!isSeekScrubbing) return;
            updateSeekFromPointer(e.clientX, e.clientY, true);
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture?.(e.pointerId);
            setIsSeekScrubbing(false);
            setScrubPreviewPct(null);
            setBeamBendDyPx(0);
          }}
          onKeyDown={(e) => {
            if (isStandby) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              onSeek(Math.min(safeDuration, clampedSec + 5));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onSeek(Math.max(0, clampedSec - 5));
            }
          }}
          className="relative flex-1 h-6 flex items-center cursor-pointer touch-none"
        >
          {/* Remaining Dotted Particle Trail */}
          <div
            aria-hidden="true"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(142, 154, 184, 0.55) 1.2px, transparent 1.2px)`,
              backgroundSize: '8px 4px',
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'center',
              transform: `translate3d(0, ${beamBendDyPx * 0.4}px, 0)`,
            }}
            className="w-full h-[3px] rounded-full opacity-80"
          />

          {/* Solid Accent Elapsed Beam */}
          <div
            aria-hidden="true"
            style={{
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${secondaryHex} 0%, ${primaryHex} 100%)`,
              boxShadow: `0 0 12px ${primaryHex}`,
              transform: `translate3d(0, ${beamBendDyPx}px, 0)`,
            }}
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
          />

          {/* Glowing Orb Thumb */}
          <span
            aria-hidden="true"
            style={{
              left: `${progressPct}%`,
              backgroundColor: '#EAF2FF',
              boxShadow: `0 0 14px ${primaryHex}, 0 0 6px #FFFFFF`,
              transform: `translate3d(-50%, calc(-50% + ${beamBendDyPx}px), 0) scale(${
                isSeekScrubbing ? 1.28 : 1
              })`,
            }}
            className="pointer-events-none absolute top-1/2 w-3 h-3 rounded-full transition-transform duration-100"
          />
        </div>

        <span
          id="console-duration-time"
          className="font-mono font-extralight text-[11px] text-[#8E9AB8] tabular-nums w-10 shrink-0"
        >
          {formatDuration(isStandby ? 0 : track.durationSec)}
        </span>
      </div>

      {/* Floating Frosted-Glass Transport Dock */}
      <div
        id="aurora-transport-dock"
        role="toolbar"
        aria-label="Aurora Deck Transport Controls"
        className="relative z-20 mx-auto w-full max-w-[540px] px-2.5 sm:px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.14] backdrop-blur-xl flex items-center justify-between gap-1.5 sm:gap-2.5 shrink-0 shadow-[0_8px_28px_rgba(0,0,0,0.48)]"
      >
        {/* Left: Shuffle Pill with 2s Orbiting Dot + Prev */}
        <div className="flex items-center gap-1.5">
          <button
            id="btn-shuffle"
            type="button"
            aria-pressed={shuffleEnabled}
            data-pressed={shuffleEnabled ? 'true' : 'false'}
            aria-label="Shuffle"
            title="Toggle Shuffle"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              onToggleShuffle();
            }}
            className={`relative w-8 h-8 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
              shuffleEnabled
                ? 'bg-white/[0.12] border-[#4DE1FF]/70 text-[#4DE1FF]'
                : 'bg-white/[0.04] border-white/[0.12] text-[#8E9AB8] hover:text-[#EAF2FF]'
            }`}
          >
            <Shuffle strokeWidth={1.75} className="w-3.5 h-3.5" />
            {shuffleEnabled && (
              <span
                aria-hidden="true"
                className="aurora-orbit-ring pointer-events-none absolute inset-[-2px] rounded-full"
              >
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#4DE1FF] shadow-[0_0_8px_#4DE1FF]" />
              </span>
            )}
          </button>

          <button
            id="btn-prev"
            type="button"
            aria-label="Previous Track"
            title="Previous Track"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              onPrevious();
            }}
            className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.12] text-[#EAF2FF] hover:border-[#4DE1FF]/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <SkipBack strokeWidth={1.75} className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Time-Shear + Morphing Play/Pause + Stop + Next */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            id="btn-scratch-turntable"
            type="button"
            aria-label="Time-Shear"
            title="Time-Shear (brief holo-ring counter-rotation + audio stutter)"
            data-time-shear-active={isTimeShearActive ? 'true' : 'false'}
            onClick={handleTimeShear}
            className={`h-8 px-2.5 rounded-full border flex items-center gap-1 font-mono font-extralight text-[10px] tracking-[0.08em] uppercase transition-colors cursor-pointer ${
              isTimeShearActive
                ? 'bg-[#9D7CFF]/25 border-[#9D7CFF] text-[#EAF2FF]'
                : 'bg-white/[0.05] border-white/[0.14] text-[#9D7CFF] hover:border-[#9D7CFF]/70 hover:text-[#EAF2FF]'
            }`}
          >
            <Sparkles strokeWidth={1.75} className="w-3 h-3" />
            <span className="hidden sm:inline">Shear</span>
          </button>

          <button
            id="btn-play-pause"
            type="button"
            aria-pressed={isPlaying}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              if (!isPlaying) {
                retroAudio.triggerAuroraStartCue();
              }
              onTogglePlay();
            }}
            style={{
              boxShadow: isPlaying ? `0 0 18px ${auroraHexToRgba(primaryHex, 0.45)}` : undefined,
              borderColor: isPlaying ? primaryHex : 'rgba(255,255,255,0.28)',
            }}
            className="relative w-10 h-10 rounded-full bg-white/[0.12] border text-[#EAF2FF] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          >
            <Play
              strokeWidth={1.75}
              className={`absolute w-4 h-4 fill-current translate-x-[1px] transition-[opacity,transform] duration-200 ${
                isPlaying ? 'opacity-0 scale-50' : 'opacity-100 scale-100'
              }`}
            />
            <Pause
              strokeWidth={1.75}
              className={`absolute w-4 h-4 fill-current transition-[opacity,transform] duration-200 ${
                isPlaying ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              }`}
            />
          </button>

          <button
            id="btn-stop"
            type="button"
            aria-label="Stop Playback"
            title="Stop"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              retroAudio.triggerAuroraStopCue();
              onStop();
            }}
            className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.12] text-[#EAF2FF] hover:border-[#FFB24D]/70 hover:text-[#FFB24D] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Square strokeWidth={1.75} className="w-3.5 h-3.5" />
          </button>

          <button
            id="btn-next"
            type="button"
            aria-label="Next Track"
            title="Next Track"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              onNext();
            }}
            className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.12] text-[#EAF2FF] hover:border-[#4DE1FF]/60 flex items-center justify-center transition-colors cursor-pointer"
          >
            <SkipForward strokeWidth={1.75} className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Repeat Pill with 2s Orbiting Dot + RPM Harmonic Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            id="btn-repeat"
            type="button"
            aria-pressed={repeatOne}
            data-pressed={repeatOne ? 'true' : 'false'}
            aria-label="Repeat Track"
            title="Toggle Repeat"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              onToggleRepeatOne();
            }}
            className={`relative w-8 h-8 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
              repeatOne
                ? 'bg-white/[0.12] border-[#9D7CFF]/70 text-[#9D7CFF]'
                : 'bg-white/[0.04] border-white/[0.12] text-[#8E9AB8] hover:text-[#EAF2FF]'
            }`}
          >
            <Repeat1 strokeWidth={1.75} className="w-3.5 h-3.5" />
            {repeatOne && (
              <span
                aria-hidden="true"
                className="aurora-orbit-ring pointer-events-none absolute inset-[-2px] rounded-full"
              >
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#9D7CFF] shadow-[0_0_8px_#9D7CFF]" />
              </span>
            )}
          </button>

          <button
            id="btn-rpm-toggle"
            type="button"
            aria-label={`Speed ${rpm} RPM`}
            title={`Toggle Hologram Spin (${rpm} / ${rpm === 33 ? 45 : 33})`}
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              onChangeRpm(rpm === 33 ? 45 : 33);
            }}
            className="h-8 px-2 rounded-full bg-white/[0.05] border border-white/[0.14] font-mono font-extralight text-[10px] tabular-nums text-[#8E9AB8] hover:text-[#4DE1FF] hover:border-[#4DE1FF]/50 transition-colors cursor-pointer"
          >
            {rpm}
          </button>
        </div>
      </div>
    </section>
  );
};
