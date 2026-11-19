import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  Rewind,
  FastForward,
  Disc3,
  AudioLines,
} from 'lucide-react';
import {
  formatDuration,
  triggerButtonHaptic,
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  calculateHolderBoxDragTiltDeg,
  calculateHolderBoxRestTiltDeg,
  formatConsoleClockAndDate,
  generateDustParticles,
  stepDustParticles,
  stepVuMeterPhysics,
  shouldRunActiveAnimationLoops,
  type DustParticle,
  type VuChannelPhysicsState,
} from '../utils/playerLogic';
import {
  calculateReelTapeRadii,
  calculateReelRotationSpeeds,
  getReelTrackChangeStagePose,
  REEL_TRACK_CHANGE_TIMELINE_MS,
  vuLevelToNeedleAngleDeg,
  rotaryValueToAngleDeg,
  pitchPercentToNormalized,
  normalizedToPitchPercent,
  computeRotaryDragValue,
  type ReelTrackChangePhase,
} from '../utils/reelToReelLogic';
import { retroAudio } from '../utils/retroAudioEngine';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';

/**
 * Corner Slot-Head Machine Screw Graphic
 */
const CornerScrew = React.memo<{ className?: string }>(({ className = '' }) => (
  <svg
    viewBox="0 0 12 12"
    aria-hidden="true"
    className={`pointer-events-none ${className}`}
  >
    <circle cx="6" cy="6" r="5.2" fill="#b4b8bc" stroke="#36383a" strokeWidth="1" />
    <circle cx="6" cy="6" r="3.6" fill="#d9dcde" />
    <line x1="2.4" y1="8.2" x2="9.6" y2="3.8" stroke="#3c3f42" strokeWidth="1.35" strokeLinecap="round" />
  </svg>
));

/**
 * Floating Subtle Warm Dust Overlay Canvas (Paused cleanly when transport stopped/hidden)
 */
const ReelDustCanvas = React.memo<{
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
      ctx.fillStyle = `rgba(255, 224, 178, ${(p.alpha * 0.78).toFixed(3)})`;
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
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dimsRef.current = { width: safeW, height: safeH };
    if (particlesRef.current.length === 0) {
      particlesRef.current = generateDustParticles(20, safeW, safeH);
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

    let lastMs = performance.now();
    const tick = (nowMs: number) => {
      const dt = Math.min(0.08, Math.max(0.001, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      particlesRef.current = stepDustParticles(
        particlesRef.current,
        dimsRef.current.width,
        dimsRef.current.height,
        dt,
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
 * Screwed-In Engraved Aluminum Nameplate Label Below Rotary Knobs
 */
const EngravedKnobPlate = React.memo<{
  label: string;
  valueText: string;
  compact?: boolean;
}>(({ label, valueText, compact = false }) => (
  <div
    data-label-plate="true"
    className={`r2r-aluminum-fascia relative rounded-[2px] flex items-center justify-center gap-1 overflow-hidden ${
      compact ? 'px-2.5 py-[2px] min-w-[50px]' : 'px-3 py-[3px] min-w-[60px] sm:min-w-[68px]'
    }`}
  >
    <CornerScrew className="absolute left-[2px] top-[2px] w-[5px] h-[5px]" />
    <CornerScrew className="absolute right-[2px] top-[2px] w-[5px] h-[5px]" />
    <CornerScrew className="absolute left-[2px] bottom-[2px] w-[5px] h-[5px]" />
    <CornerScrew className="absolute right-[2px] bottom-[2px] w-[5px] h-[5px]" />
    <span
      className={`r2r-engraved-label relative z-10 font-bold leading-none whitespace-nowrap ${
        compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
      }`}
    >
      {label}
    </span>
    <span
      className={`relative z-10 font-mono font-bold text-[#3b2312] leading-none tabular-nums whitespace-nowrap ${
        compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
      }`}
    >
      {valueText}
    </span>
  </div>
));

/**
 * Large Knurled Brushed Aluminum Rotary Knob (Supports vertical drag AND circular arc drag)
 */
const KnurledRotaryKnob = React.memo<{
  id: string;
  label: string;
  valueText: string;
  normalizedValue: number;
  ariaLabel: string;
  ariaMin: number;
  ariaMax: number;
  ariaNow: number;
  compact?: boolean;
  lowPowerMode: boolean;
  onChangeNormalized: (next01: number) => void;
  onResetDefault: () => void;
  onStepDelta: (delta: number) => void;
}>(
  ({
    id,
    label,
    valueText,
    normalizedValue,
    ariaLabel,
    ariaMin,
    ariaMax,
    ariaNow,
    compact = false,
    lowPowerMode,
    onChangeNormalized,
    onResetDefault,
    onStepDelta,
  }) => {
    const knobRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{
      start01: number;
      startX: number;
      startY: number;
      centerX: number;
      centerY: number;
    } | null>(null);

    const angleDeg = rotaryValueToAngleDeg(normalizedValue);
    const knobSizeClass = compact
      ? 'w-[34px] h-[34px]'
      : 'w-[40px] h-[40px] sm:w-[46px] sm:h-[46px] lg:w-[50px] lg:h-[50px]';

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const el = knobRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      triggerButtonHaptic(lowPowerMode);
      dragRef.current = {
        start01: normalizedValue,
        startX: e.clientX,
        startY: e.clientY,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next01 = computeRotaryDragValue({
        startValue01: drag.start01,
        startClientX: drag.startX,
        startClientY: drag.startY,
        clientX: e.clientX,
        clientY: e.clientY,
        centerX: drag.centerX,
        centerY: drag.centerY,
      });
      onChangeNormalized(next01);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    return (
      <div className="flex flex-col items-center justify-center gap-1 shrink-0 select-none">
        {/* Calibrated Scale Ring + Knurled Aluminum Knob */}
        <div className="relative flex items-center justify-center p-1">
          <svg
            viewBox="0 0 64 64"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 w-full h-full"
          >
            {[-135, -90, -45, 0, 45, 90, 135].map((tickDeg) => (
              <line
                key={tickDeg}
                x1="32"
                y1="2.5"
                x2="32"
                y2={tickDeg === 0 ? '6.5' : '5.2'}
                stroke={tickDeg === 0 ? '#FF9F43' : '#EFE9DC'}
                strokeOpacity={tickDeg === 0 ? '0.95' : '0.55'}
                strokeWidth={tickDeg === 0 ? '1.6' : '1'}
                transform={`rotate(${tickDeg} 32 32)`}
              />
            ))}
          </svg>

          <div
            id={id}
            ref={knobRef}
            role="slider"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-valuemin={ariaMin}
            aria-valuemax={ariaMax}
            aria-valuenow={ariaNow}
            data-knob-angle={angleDeg}
            title={`${label}: ${valueText} (Drag vertically or around dial; double-click to reset)`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              triggerButtonHaptic(lowPowerMode);
              onResetDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                e.preventDefault();
                onStepDelta(1);
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                e.preventDefault();
                onStepDelta(-1);
              }
            }}
            className={`relative ${knobSizeClass} rounded-full cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F43] flex items-center justify-center`}
          >
            {/* Outer Knurled Collar */}
            <div
              style={{
                transform: `rotate(${angleDeg}deg)`,
                background:
                  'conic-gradient(from 0deg, #b8bcbf 0deg, #eff2f4 35deg, #8b9094 90deg, #dfe3e6 145deg, #989ca0 205deg, #f2f5f7 265deg, #858a8e 320deg, #b8bcbf 360deg)',
                boxShadow:
                  '0 5px 10px rgba(0,0,0,0.72), inset 0 1px 1px rgba(255,255,255,0.85), inset 0 -2px 3px rgba(0,0,0,0.45)',
              }}
              className="relative w-full h-full rounded-full border-2 border-[#46494c] flex items-center justify-center"
            >
              {/* Machined Inner Aluminum Cap */}
              <div
                style={{
                  background: 'radial-gradient(circle at 35% 32%, #f1f4f6 0%, #C9CCCE 55%, #8f9397 100%)',
                }}
                className="relative w-[76%] h-[76%] rounded-full border border-[#6e7275] shadow-inner flex items-start justify-center"
              >
                {/* Orange-Red Engraved Indicator Marker */}
                <span className="mt-[3px] w-[3px] h-[28%] rounded-full bg-[#E8590C] shadow-[0_0_2px_rgba(232,89,12,0.75)]" />
              </div>
            </div>
          </div>
        </div>

        <EngravedKnobPlate label={label} valueText={valueText} compact={compact} />
      </div>
    );
  }
);

/**
 * Analog Backlit Amber VU Meter with Classic Tiny Serif "VU" Label & Spring-Damped Needle
 */
const AnalogVuMeter = React.memo<{
  id: string;
  channelLabel: 'L' | 'R';
  angleDeg: number;
  compact?: boolean;
}>(({ id, channelLabel, angleDeg, compact = false }) => (
  <div
    id={id}
    data-vu-angle={angleDeg.toFixed(1)}
    className={`r2r-backlit-amber relative rounded-[4px] border-2 border-[#4b3827] overflow-hidden shrink-0 flex flex-col justify-between ${
      compact ? 'w-[54px] h-[34px]' : 'w-[64px] sm:w-[76px] lg:w-[88px] h-[40px] sm:h-[46px]'
    }`}
  >
    <div aria-hidden="true" className="r2r-glass-reflection pointer-events-none absolute inset-0 z-20" />
    <svg viewBox="0 0 100 58" className="relative z-10 w-full h-full" aria-hidden="true">
      {/* Main Scale Arc (-20 to 0 dB dark ink, 0 to +3 dB red overload zone) */}
      <path
        d="M 16 44 A 40 40 0 0 1 66 22"
        fill="none"
        stroke="#2b190b"
        strokeWidth="1.6"
      />
      <path
        d="M 66 22 A 40 40 0 0 1 84 44"
        fill="none"
        stroke="#c92a2a"
        strokeWidth="2.4"
      />
      {/* Scale Ticks */}
      {[-36, -24, -12, 0, 14, 26, 36].map((deg, idx) => (
        <line
          key={deg}
          x1="50"
          y1="14"
          x2="50"
          y2={idx % 2 === 0 ? '20' : '18'}
          stroke={deg > 0 ? '#c92a2a' : '#2b190b'}
          strokeWidth={deg === 0 ? '1.6' : '1.1'}
          transform={`rotate(${deg} 50 56)`}
        />
      ))}

      {/* Tiny Classic Serif VU Label */}
      <text
        x="50"
        y="36"
        textAnchor="middle"
        fill="#2b190b"
        fontSize="10.5"
        fontWeight="600"
        fontFamily="'Source Serif 4', serif"
      >
        VU
      </text>
      <text
        x="16"
        y="50"
        textAnchor="start"
        fill="#3e2613"
        fontSize="7"
        fontFamily="'Share Tech Mono', monospace"
      >
        -20
      </text>
      <text
        x="85"
        y="50"
        textAnchor="end"
        fill="#b02222"
        fontSize="7"
        fontWeight="700"
        fontFamily="'Share Tech Mono', monospace"
      >
        +3
      </text>
      <text
        x="14"
        y="17"
        fill="#2b190b"
        fontSize="7"
        fontWeight="700"
        fontFamily="'Archivo Narrow', sans-serif"
      >
        {channelLabel}
      </text>

      {/* Spring-Damped Orange-Red Needle */}
      <g
        style={{
          transformOrigin: '50px 56px',
          transform: `rotate(${angleDeg}deg)`,
          transition: 'transform 85ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <line
          x1="50"
          y1="56"
          x2="50"
          y2="13"
          stroke="#E8590C"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </g>

      {/* Center Pivot Hood */}
      <circle cx="50" cy="54" r="6" fill="#231c17" stroke="#c9ccce" strokeWidth="1" />
    </svg>
  </div>
));

/**
 * Chrome Toggle Lever Switch with Red Indicator Light
 */
const ChromeToggleWithRedLed = React.memo<{
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
    className={`r2r-aluminum-fascia relative flex items-center justify-between gap-1 rounded-[3px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed select-none focus:outline-none ${
      compact ? 'px-1.5 py-[3px]' : 'px-2 py-1'
    }`}
  >
    {/* Red Jewel Indicator Light */}
    <span
      aria-hidden="true"
      className={`w-2 h-2 rounded-full border border-black/60 shrink-0 transition-colors ${
        isOn
          ? 'bg-[#ef4444] shadow-[0_0_7px_#ef4444,inset_0_1px_1px_rgba(255,220,220,0.8)]'
          : 'bg-[#3d1717] shadow-inner'
      }`}
    />
    <span
      className={`r2r-engraved-label font-bold leading-none whitespace-nowrap ${
        compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
      }`}
    >
      {label}
    </span>
    {/* Chrome Bat Toggle Lever Bushing + Lever Shaft */}
    <span className="relative w-3.5 h-3.5 rounded-full bg-gradient-to-b from-[#f1f4f6] to-[#7c8185] border border-[#34373a] shadow-inner flex items-center justify-center shrink-0">
      <span
        data-toggle-lever="true"
        style={{
          transform: isOn ? 'translateY(-3px)' : 'translateY(3px)',
          transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="w-1.5 h-2.5 rounded-full bg-gradient-to-r from-[#8b9094] via-[#ffffff] to-[#72767a] border border-black/45 shadow"
      />
    </span>
  </button>
));

/**
 * Mechanical Piano-Key Transport Lever (Physically Depresses Downward with Inner Shadow)
 */
const PianoKeyLever = React.memo<{
  id: string;
  label: string;
  isDepressed: boolean;
  disabled?: boolean;
  compact?: boolean;
  ariaLabel: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}>(
  ({
    id,
    label,
    isDepressed,
    disabled = false,
    compact = false,
    ariaLabel,
    title,
    onClick,
    children,
  }) => {
    const [momentaryDown, setMomentaryDown] = useState(false);
    const down = isDepressed || momentaryDown;

    return (
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={isDepressed}
        data-depressed={down ? 'true' : 'false'}
        title={title}
        onPointerDown={() => {
          if (!disabled) setMomentaryDown(true);
        }}
        onPointerUp={() => setMomentaryDown(false)}
        onPointerLeave={() => {
          if (momentaryDown) setMomentaryDown(false);
        }}
        onClick={onClick}
        style={{
          transform: down && !disabled ? 'translateY(3px)' : 'translateY(0px)',
          transition: 'transform 90ms cubic-bezier(0.22, 1, 0.36, 1)',
          background: down
            ? 'linear-gradient(180deg, #989ca0 0%, #b4b8bc 45%, #84888c 100%)'
            : 'linear-gradient(180deg, #f3f5f6 0%, #C9CCCE 58%, #9EA2A6 100%)',
          boxShadow: down
            ? 'inset 0 3px 6px rgba(0,0,0,0.62), inset 0 -1px 0 rgba(255,255,255,0.35), 0 1px 1px rgba(0,0,0,0.45)'
            : 'inset 0 1.5px 0 rgba(255,255,255,0.9), 0 4px 6px rgba(0,0,0,0.58), 0 2px 0 #5f6368',
        }}
        className={`relative flex-1 min-w-0 ${
          compact ? 'h-[30px]' : 'h-[36px] sm:h-[40px]'
        } rounded-b-[4px] rounded-t-[2px] border border-[#56595d] flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F43]`}
      >
        <span className={down ? 'text-[#E8590C]' : 'text-[#201d1a]'}>{children}</span>
        <span
          className={`font-display font-bold uppercase tracking-wider leading-none ${
            compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
          } ${down ? 'text-[#2a170a]' : 'text-[#24211e]'}`}
        >
          {label}
        </span>
      </button>
    );
  }
);

/**
 * Full-Width Backlit Amber Tuner-Dial Seek Bar with Tick Marks & Orange-Red Needle
 */
const AmberTunerSeekBar = React.memo<{
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
      className="r2r-aluminum-fascia relative w-full rounded-[4px] px-2 py-1 flex items-center gap-2 shrink-0 select-none"
    >
      <span className="font-mono text-[9.5px] sm:text-[10.5px] font-bold text-[#2b1a0e] tabular-nums w-10 text-right shrink-0">
        {formatDuration(currentSecond)}
      </span>

      {/* Backlit Amber Tuner Dial Track */}
      <div className="r2r-backlit-amber relative flex-1 h-[20px] rounded-[3px] border border-[#5a3b20] overflow-hidden flex items-center">
        <div aria-hidden="true" className="r2r-glass-reflection pointer-events-none absolute inset-0 z-10" />
        {/* Tuner Dial Scale Tick Marks */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1.5 inset-y-0 flex items-end justify-between pb-[2px] opacity-75 z-[5]"
        >
          {Array.from({ length: 25 }, (_, i) => (
            <span
              key={i}
              className={`w-[1px] bg-[#2b190b] ${i % 4 === 0 ? 'h-[9px] opacity-90' : 'h-[5px] opacity-55'}`}
            />
          ))}
        </div>

        {/* Center Tuning Datum Line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[7px] h-[1px] bg-[#2b190b]/45 z-[5]"
        />

        {/* Crisp Orange-Red Moving Tuner Needle (#E8590C) */}
        <div
          aria-hidden="true"
          style={{ left: `calc(${progressPct}% - 1.5px)` }}
          className="pointer-events-none absolute top-0.5 bottom-0.5 w-[3px] rounded-full bg-[#E8590C] shadow-[0_0_6px_rgba(232,89,12,0.85)] z-20"
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
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-30"
        />
      </div>

      <span className="font-mono text-[9.5px] sm:text-[10.5px] font-bold text-[#3f2715] tabular-nums w-10 shrink-0">
        {formatDuration(safeDuration)}
      </span>
    </div>
  );
});

/**
 * Center Cream-Colored Clock / Date Card (#EFE9DC) Flanked by Dual VU Meters
 */
const CreamClockDateCard = React.memo<{
  compact: boolean;
  isDocumentHidden: boolean;
}>(({ compact, isDocumentHidden }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    setNow(new Date());
    if (isDocumentHidden) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isDocumentHidden]);

  const { timeText, dateText } = formatConsoleClockAndDate(now, false);

  return (
    <div
      id="console-time-display"
      data-testid="console-clock-date-display"
      data-clock-date="true"
      className={`relative rounded-[3px] bg-[#EFE9DC] border border-[#6e5c45] shadow-[inset_0_1px_2px_rgba(0,0,0,0.28),0_1px_0_rgba(255,255,255,0.65)] px-2 py-0.5 flex flex-col items-center justify-center shrink-0 overflow-hidden ${
        compact ? 'min-w-[66px] h-[34px]' : 'min-w-[82px] sm:min-w-[96px] h-[40px] sm:h-[46px]'
      }`}
    >
      <span
        id="console-live-time"
        className={`font-mono ${
          compact ? 'text-[10.5px]' : 'text-[12.5px] sm:text-[14px]'
        } font-bold text-[#1f160f] tabular-nums leading-none tracking-tight whitespace-nowrap`}
      >
        {timeText}
      </span>
      <span
        id="console-live-date"
        className={`font-mono ${
          compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
        } text-[#4b3827] tabular-nums leading-none tracking-tight whitespace-nowrap mt-0.5`}
      >
        {dateText}
      </span>
    </div>
  );
});

/**
 * Single Open Aluminum Tape Reel with Dynamic Tape Ring Radius + 3 Curved Spokes + Optional Hub Artwork
 */
const OpenAluminumReel = React.memo<{
  id: string;
  spinId: string;
  diameterPx: number;
  tapeOuterPct: number;
  durationSec: number;
  timingFunction: string;
  shouldSpin: boolean;
  stageTransform: string;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  roleLabel: string;
  hubArtwork?: React.ReactNode;
}>(
  ({
    id,
    spinId,
    diameterPx,
    tapeOuterPct,
    durationSec,
    timingFunction,
    shouldSpin,
    stageTransform,
    isDocumentHidden,
    lowPowerMode,
    prefersReducedMotion,
    roleLabel,
    hubArtwork,
  }) => {
    const hubDiameterPct = 34;
    const tapeRadiusPx = ((tapeOuterPct / 100) * diameterPx) / 2;
    const hubRadiusPx = ((hubDiameterPct / 100) * diameterPx) / 2;

    return (
      <div
        id={id}
        aria-label={roleLabel}
        style={{
          width: `${diameterPx}px`,
          height: `${diameterPx}px`,
          transform: stageTransform,
          transition:
            isDocumentHidden || lowPowerMode || prefersReducedMotion
              ? 'none'
              : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="relative flex items-center justify-center shrink-0 select-none"
      >
        {/* Recessed Dark Walnut Tape Well + Cast Shadow */}
        <div
          aria-hidden="true"
          style={{ inset: '-4px' }}
          className="pointer-events-none absolute rounded-full bg-[#2a1b10]/70 border border-[#8B6A45]/45 shadow-[inset_0_4px_12px_rgba(0,0,0,0.85),0_8px_18px_rgba(0,0,0,0.65)]"
        />

        {/* Rotating Reel Assembly */}
        <div
          id={spinId}
          data-spinning={shouldSpin ? 'true' : 'false'}
          style={{
            animationDuration: `${durationSec}s`,
            animationTimingFunction: timingFunction,
            animationPlayState: shouldSpin ? 'running' : 'paused',
          }}
          className="r2r-reel-spin relative w-full h-full rounded-full flex items-center justify-center"
        >
          {/* Dynamic Wound Magnetic Tape Spool Layer (#3B2A1E + Concentric Tape Sheen Rings) */}
          <div
            data-reel-tape-pct={tapeOuterPct}
            style={{
              width: `${tapeOuterPct}%`,
              height: `${tapeOuterPct}%`,
              background:
                'repeating-radial-gradient(circle at center, #3B2A1E 0px, #3B2A1E 2px, #291c13 3px, #4d3726 4.5px)',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.65)',
            }}
            className="pointer-events-none absolute rounded-full border border-[#1a110b]"
          />

          {/* Machined Brushed Aluminum Flange Rim + 3 Curved Spokes (SVG) */}
          <svg
            viewBox="0 0 200 200"
            className="pointer-events-none relative z-10 w-full h-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.65)]"
          >
            <defs>
              <linearGradient id={`${id}-rim-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#eff2f4" />
                <stop offset="38%" stopColor="#C9CCCE" />
                <stop offset="72%" stopColor="#9EA2A6" />
                <stop offset="100%" stopColor="#dfe3e6" />
              </linearGradient>
              <mask id={`${id}-flange-mask`}>
                <rect width="200" height="200" fill="black" />
                <circle cx="100" cy="100" r="98" fill="white" />
                {/* 3 Classic Mid-Century Curved Precision Cutout Windows */}
                {[0, 120, 240].map((rot) => (
                  <path
                    key={rot}
                    d="M 100 54 A 46 46 0 0 1 139 76 L 161 60 A 74 74 0 0 0 100 26 Z"
                    fill="black"
                    transform={`rotate(${rot} 100 100)`}
                  />
                ))}
              </mask>
            </defs>

            {/* Flange Plate with 3 Cutout Windows & 3 Curved Spokes */}
            <circle
              cx="100"
              cy="100"
              r="98"
              fill={`url(#${id}-rim-grad)`}
              fillOpacity="0.93"
              mask={`url(#${id}-flange-mask)`}
              stroke="#767a7e"
              strokeWidth="2"
            />
            <circle
              cx="100"
              cy="100"
              r="94"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.55"
              strokeWidth="1.2"
            />

            {/* Precision Spoke Rivets */}
            {[35, 155, 275].map((ang) => {
              const rad = (ang * Math.PI) / 180;
              const rx = 100 + Math.cos(rad) * 44;
              const ry = 100 + Math.sin(rad) * 44;
              return (
                <circle
                  key={ang}
                  cx={rx}
                  cy={ry}
                  r="3.2"
                  fill="#E8ECEF"
                  stroke="#575b5e"
                  strokeWidth="1"
                />
              );
            })}

            {/* Polished Chrome Center Hub Boss */}
            <circle
              cx="100"
              cy="100"
              r="34"
              fill="#d5d9dc"
              stroke="#6c7074"
              strokeWidth="2"
            />
            <circle cx="100" cy="100" r="14" fill="#E8ECEF" stroke="#45484b" strokeWidth="1.8" />
            {/* 3-Prong NAB Spindle Lock */}
            {[0, 120, 240].map((ang) => (
              <rect
                key={ang}
                x="98"
                y="84"
                width="4"
                height="9"
                rx="1"
                fill="#4a4d50"
                transform={`rotate(${ang} 100 100)`}
              />
            ))}
            <circle cx="100" cy="100" r="5" fill="#232527" stroke="#E8ECEF" strokeWidth="1" />
          </svg>

          {/* Optional Rotating Small Square Album-Art Hub Label on Left Supply Reel */}
          {hubArtwork && (
            <div
              id="vinyl-center-label-art"
              data-testid="vinyl-center-label-art"
              style={{
                width: `${Math.max(26, Math.round(hubRadiusPx * 1.48))}px`,
                height: `${Math.max(26, Math.round(hubRadiusPx * 1.48))}px`,
              }}
              className="pointer-events-none absolute z-20 rounded-[3px] overflow-hidden border-2 border-[#EFE9DC] bg-[#1d140d] shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            >
              {hubArtwork}
            </div>
          )}

          {/* Chrome Spindle Center Pin */}
          <span
            aria-hidden="true"
            style={{
              width: `${Math.max(7, Math.round(tapeRadiusPx * 0.14))}px`,
              height: `${Math.max(7, Math.round(tapeRadiusPx * 0.14))}px`,
            }}
            className="pointer-events-none absolute z-30 rounded-full bg-gradient-to-br from-[#ffffff] via-[#C9CCCE] to-[#5d6165] border border-black/60 shadow"
          />
        </div>
      </div>
    );
  }
);

/**
 * Spinning Chrome Guide Roller Flanking the Magnetic Head Block
 */
const ChromeGuideRoller = React.memo<{
  durationSec: number;
  spinMode: 'normal' | 'reverse-fast' | 'paused';
  compact?: boolean;
}>(({ durationSec, spinMode, compact = false }) => {
  const isReverse = spinMode === 'reverse-fast';
  const effectiveDuration = isReverse ? '0.16s' : `${durationSec}s`;
  const running = spinMode !== 'paused';

  return (
    <div
      data-guide-roller-mode={spinMode}
      style={{
        animationDuration: effectiveDuration,
        animationPlayState: running ? 'running' : 'paused',
      }}
      className={`${
        isReverse ? 'r2r-reel-reverse-spin' : 'r2r-reel-spin'
      } relative rounded-full bg-gradient-to-br from-[#ffffff] via-[#C9CCCE] to-[#686d71] border-2 border-[#393c3f] shadow-[0_3px_6px_rgba(0,0,0,0.72)] flex items-center justify-center shrink-0 ${
        compact ? 'w-[16px] h-[16px]' : 'w-[20px] h-[20px] sm:w-[22px] sm:h-[22px]'
      }`}
    >
      <span className="w-[45%] h-[1.5px] bg-[#2a2c2e]/75 rounded-full" />
      <span className="w-1.5 h-1.5 rounded-full bg-[#1e2022] border border-white/60 absolute" />
    </div>
  );
});

export const ReelToReelDeck = React.memo<TurntableDeckProps>(
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
    parentPlaylistCoverUrl,
    onResolvedPerTrackArtwork,
  }) => {
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
    const isCompactLandscape = viewportLayout === 'mobile-landscape';
    const currentSecond = usePlaybackSecond();

    const [isStoppedAtRest, setIsStoppedAtRest] = useState<boolean>(false);
    useEffect(() => {
      if (isPlaying) {
        setIsStoppedAtRest(false);
      }
    }, [isPlaying, track.id]);

    // Artwork resolution (100% shared song-specific fallback)
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

    useEffect(() => {
      if (isStandby || !track.id || !track.title || !artworkState.isPlaceholder) return;
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
            onResolvedPerTrackArtwork?.(track.id, data.artworkUrl);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [isStandby, track.id, track.title, track.artist, artworkState.isPlaceholder, onResolvedPerTrackArtwork]);

    // Measure Media Stage for perfectly fitted dual reels & cardboard sleeve holder
    const topSurfaceRef = useRef<HTMLDivElement | null>(null);
    const mediaStageRef = useRef<HTMLDivElement | null>(null);
    const holderHomeSlotRef = useRef<HTMLDivElement | null>(null);
    const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
      width: 560,
      height: isCompactLandscape ? 130 : 250,
    });

    const measureStage = useCallback(() => {
      const el = mediaStageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        setStageSize((prev) =>
          Math.abs(prev.width - w) >= 2 || Math.abs(prev.height - h) >= 2
            ? { width: w, height: h }
            : prev
        );
      }
    }, []);

    useLayoutEffect(() => {
      measureStage();
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureStage) : null;
      if (ro && mediaStageRef.current) ro.observe(mediaStageRef.current);
      window.addEventListener('resize', measureStage);
      return () => {
        ro?.disconnect();
        window.removeEventListener('resize', measureStage);
      };
    }, [measureStage, viewportLayout]);

    const isNarrowDeck = stageSize.width < 560;
    const isUltraNarrowDeck = stageSize.width < 430;

    // Two large side-by-side reels sized cleanly to available media-stage height & width
    const reelDiameterPx = useMemo(() => {
      const maxByWidth = Math.floor((stageSize.width - (isUltraNarrowDeck ? 24 : 36)) / 2);
      const maxByHeight = Math.floor(stageSize.height - (isCompactLandscape ? 20 : 34));
      return Math.max(76, Math.min(maxByWidth, maxByHeight, 250));
    }, [stageSize.width, stageSize.height, isCompactLandscape, isUltraNarrowDeck]);

    // Tape-box cardboard sleeve holder size
    const holderBoxSizePx = useMemo(
      () => Math.max(66, Math.min(Math.round(reelDiameterPx * 0.7), 132)),
      [reelDiameterPx]
    );

    // Draggable Tape-Box Holder State (freely draggable across #console-top-surface + double-click re-dock)
    const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [holderTiltDeg, setHolderTiltDeg] = useState<number>(-2.5);
    const [isDraggingHolder, setIsDraggingHolder] = useState<boolean>(false);
    const holderDragRef = useRef<{
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
        mediaStageRef.current?.getBoundingClientRect();
      const homeRect = holderHomeSlotRef.current?.getBoundingClientRect();
      const surfaceW = surfaceRect ? surfaceRect.width : 560;
      const surfaceH = surfaceRect ? surfaceRect.height : 420;
      const homeCenterX =
        surfaceRect && homeRect
          ? homeRect.left - surfaceRect.left + homeRect.width / 2
          : 10 + holderBoxSizePx / 2;
      const homeCenterY =
        surfaceRect && homeRect
          ? homeRect.top - surfaceRect.top + homeRect.height / 2
          : surfaceH / 2;

      holderDragRef.current = {
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
      const origin = holderDragRef.current;
      if (!origin) return;
      const stepDeltaX = e.clientX - origin.lastPointerX;
      origin.lastPointerX = e.clientX;
      if (Math.abs(stepDeltaX) >= 0.5) origin.lastDeltaX = stepDeltaX;
      const clamped = clampHolderBoxDragOffset({
        offsetX: origin.startX + (e.clientX - origin.pointerX),
        offsetY: origin.startY + (e.clientY - origin.pointerY),
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
      const origin = holderDragRef.current;
      if (!origin) return;
      const finalRestTilt = calculateHolderBoxRestTiltDeg(
        holderOffset.x,
        origin.lastDeltaX,
        Math.hypot(holderOffset.x, holderOffset.y) < 1
      );
      holderDragRef.current = null;
      setIsDraggingHolder(false);
      setHolderTiltDeg(finalRestTilt);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    // Track-change rewind & reel-swap sequence (< 2 seconds total)
    const [trackChangePhase, setTrackChangePhase] = useState<ReelTrackChangePhase>('idle');
    const prevTrackIdRef = useRef<string>(track.id);

    useEffect(() => {
      if (prevTrackIdRef.current === track.id) return;
      prevTrackIdRef.current = track.id;

      if (isDocumentHidden || lowPowerMode || prefersReducedMotion || isStandby) {
        setTrackChangePhase('idle');
        return;
      }

      setTrackChangePhase('braking-wobble');
      const t1 = window.setTimeout(
        () => setTrackChangePhase('rewinding-tape'),
        REEL_TRACK_CHANGE_TIMELINE_MS.brakeWobbleEndMs
      );
      const t2 = window.setTimeout(
        () => setTrackChangePhase('swapping-reels'),
        REEL_TRACK_CHANGE_TIMELINE_MS.rewindTapeEndMs
      );
      const t3 = window.setTimeout(
        () => setTrackChangePhase('resuming-play'),
        REEL_TRACK_CHANGE_TIMELINE_MS.swapReelsEndMs
      );
      const t4 = window.setTimeout(
        () => setTrackChangePhase('idle'),
        REEL_TRACK_CHANGE_TIMELINE_MS.resumePlayEndMs
      );

      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
        window.clearTimeout(t4);
      };
    }, [track.id, isDocumentHidden, lowPowerMode, prefersReducedMotion, isStandby]);

    const stagePose = useMemo(
      () => getReelTrackChangeStagePose(trackChangePhase),
      [trackChangePhase]
    );

    const progressRatio = useMemo(() => {
      if (isStandby || track.durationSec <= 0) return 0;
      if (trackChangePhase === 'swapping-reels' || trackChangePhase === 'resuming-play') return 0;
      return Math.max(0, Math.min(1, currentSecond / track.durationSec));
    }, [isStandby, track.durationSec, currentSecond, trackChangePhase]);

    const tapeRadii = useMemo(() => calculateReelTapeRadii(progressRatio), [progressRatio]);
    const reelSpeeds = useMemo(
      () => calculateReelRotationSpeeds(rpm, pitchPercent, lowPowerMode),
      [rpm, pitchPercent, lowPowerMode]
    );

    const isActivelyRewinding = trackChangePhase === 'braking-wobble' || trackChangePhase === 'rewinding-tape';
    const shouldSpin = Boolean(
      isPlaying &&
        !isStandby &&
        !isDocumentHidden &&
        !prefersReducedMotion &&
        !isActivelyRewinding
    );

    // Guide roller mode: paused during stop/brake, reverse-fast during rewind, normal during play
    const rollerSpinMode: 'normal' | 'reverse-fast' | 'paused' = useMemo(() => {
      if (isDocumentHidden || prefersReducedMotion) return 'paused';
      if (stagePose.rollerSpinMode === 'reverse-fast') return 'reverse-fast';
      if (shouldSpin) return 'normal';
      return 'paused';
    }, [isDocumentHidden, prefersReducedMotion, stagePose.rollerSpinMode, shouldSpin]);

    // Spring-damped Dual Analog VU Meters (L & R) — centered/idle when paused/hidden
    const [vuAngles, setVuAngles] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
    const vuPhysicsRef = useRef<{ left: VuChannelPhysicsState; right: VuChannelPhysicsState }>({
      left: { level: 0.48, velocity: 0, peakHold: 0.48, peakVelocity: 0 },
      right: { level: 0.48, velocity: 0, peakHold: 0.48, peakVelocity: 0 },
    });

    useEffect(() => {
      const canRun = shouldRunActiveAnimationLoops(
        isPlaying && !isStandby,
        isDocumentHidden,
        prefersReducedMotion,
        lowPowerMode
      );

      if (!canRun) {
        vuPhysicsRef.current = {
          left: { level: 0.48, velocity: 0, peakHold: 0.48, peakVelocity: 0 },
          right: { level: 0.48, velocity: 0, peakHold: 0.48, peakVelocity: 0 },
        };
        setVuAngles({ left: 0, right: 0 });
        return;
      }

      let lastTick = performance.now();
      const timerId = window.setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        const now = performance.now();
        const dtSec = Math.min(0.05, Math.max(0.02, (now - lastTick) / 1000));
        lastTick = now;
        const raw = retroAudio.getVuLevels();
        const nextL = stepVuMeterPhysics(vuPhysicsRef.current.left, raw.left, dtSec);
        const nextR = stepVuMeterPhysics(vuPhysicsRef.current.right, raw.right, dtSec);
        vuPhysicsRef.current = { left: nextL, right: nextR };
        setVuAngles({
          left: vuLevelToNeedleAngleDeg(nextL.level, true),
          right: vuLevelToNeedleAngleDeg(nextR.level, true),
        });
      }, 85);

      return () => window.clearInterval(timerId);
    }, [isPlaying, isStandby, isDocumentHidden, prefersReducedMotion, lowPowerMode]);

    // Tape Nudge momentary visual state
    const [nudgePulseActive, setNudgePulseActive] = useState<boolean>(false);
    const nudgeTimerRef = useRef<number | null>(null);
    useEffect(() => {
      return () => {
        if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
      };
    }, []);

    const handleTriggerNudge = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      onScratch('classic');
      setNudgePulseActive(true);
      if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = window.setTimeout(() => {
        setNudgePulseActive(false);
        nudgeTimerRef.current = null;
      }, 220);
    }, [lowPowerMode, onScratch]);

    const handleStopClick = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      setIsStoppedAtRest(true);
      retroAudio.triggerReelStopCue();
      onStop();
    }, [lowPowerMode, onStop]);

    const clampedVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
    const volumePctInt = Math.round(clampedVolume * 100);
    const pitchNormalized = pitchPercentToNormalized(pitchPercent);

    const renderTrackArtwork = (imgId: string, attachRef = false, hubVariant = false) => (
      <>
        {!artworkState.isPlaceholder && artworkState.activeUrl ? (
          <img
            id={imgId}
            src={artworkState.activeUrl}
            alt={`${track.title} by ${track.artist} artwork`}
            referrerPolicy="no-referrer"
            onLoad={() => attachRef && setArtworkLoaded(true)}
            onError={() => setArtworkFailedCount((prev) => prev + 1)}
            className="w-full h-full object-cover select-none pointer-events-none"
            draggable={false}
          />
        ) : (
          <div
            id={imgId}
            data-fallback-artwork="true"
            className="w-full h-full bg-[#EFE9DC] flex flex-col items-center justify-center p-1 text-center select-none pointer-events-none"
          >
            <Disc3 className={`${hubVariant ? 'w-3.5 h-3.5' : 'w-4 h-4 mb-0.5'} text-[#6B4A2F] shrink-0`} />
            {!hubVariant && (
              <span className="font-mono text-[7px] font-bold uppercase tracking-tight text-[#2b1a0e] truncate max-w-full">
                {track.title}
              </span>
            )}
          </div>
        )}
      </>
    );

    return (
      <section
        id="turntable-console-root"
        aria-label="1965-1975 Brushed Aluminum & Walnut Open-Reel Tape Deck"
        data-track-change-phase={trackChangePhase}
        className="r2r-walnut-cabinet walnut-furniture-cabinet panel-contain relative w-full h-full min-h-0 flex flex-col justify-between overflow-hidden select-none p-2 sm:p-2.5 lg:p-3 gap-1.5"
      >
        <CornerScrew className="absolute top-1 left-1 w-2.5 h-2.5 z-40" />
        <CornerScrew className="absolute top-1 right-1 w-2.5 h-2.5 z-40" />
        <CornerScrew className="absolute bottom-1 left-1 w-2.5 h-2.5 z-40" />
        <CornerScrew className="absolute bottom-1 right-1 w-2.5 h-2.5 z-40" />

        {/* ===================================================================
            1. UPPER WALNUT TRANSPORT DECK: Title Plate + Dual Reels + Tuner Seek + Lyrics
            =================================================================== */}
        <div
          ref={topSurfaceRef}
          id="console-top-surface"
          className="relative z-20 flex-1 min-h-0 flex flex-col justify-between gap-1"
        >
          {/* Upper Engraved Aluminum / Cream Song-Title Nameplate */}
          <div
            id="console-title-plate"
            className={`r2r-aluminum-fascia relative z-10 w-full rounded-[4px] overflow-hidden shrink-0 ${
              isCompactLandscape ? 'px-4 py-1' : 'px-5 py-1.5'
            }`}
          >
            <CornerScrew className="absolute top-1 left-1 w-2 h-2 z-20" />
            <CornerScrew className="absolute top-1 right-1 w-2 h-2 z-20" />
            <CornerScrew className="absolute bottom-1 left-1 w-2 h-2 z-20" />
            <CornerScrew className="absolute bottom-1 right-1 w-2 h-2 z-20" />

            <div className="relative z-10 mx-auto max-w-[92%] rounded-[2px] bg-[#EFE9DC]/90 border border-[#8e8575] px-3 py-0.5 shadow-inner text-center">
              <h2
                id="console-track-title"
                className={`font-display ${
                  isCompactLandscape ? 'text-[11px]' : 'text-xs sm:text-sm'
                } font-bold uppercase tracking-wider text-[#1e150e] truncate leading-tight`}
              >
                {track.title}
              </h2>
              <p
                id="console-track-artist"
                className={`font-mono ${
                  isCompactLandscape ? 'text-[8.5px]' : 'text-[9.5px] sm:text-[10.5px]'
                } uppercase tracking-wider text-[#5b3d24] truncate leading-tight`}
              >
                {track.artist}
              </p>
            </div>
          </div>

          {/* Open-Reel Deck Bed: Dual Aluminum Reels + Magnetic Tape Transport + Cardboard Tape-Box Holder */}
          <div
            ref={mediaStageRef}
            id="reel-media-stage"
            className="relative z-40 flex-1 min-h-0 w-full rounded-[4px] border border-[#3e2817] bg-gradient-to-b from-[#7a5537]/50 via-[#5a3b24]/60 to-[#392414]/85 shadow-[inset_0_4px_14px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center overflow-visible px-2 py-1"
          >
            <ReelDustCanvas
              width={stageSize.width}
              height={stageSize.height}
              isAnimating={Boolean(shouldSpin)}
            />

            {/* Top Center Micro Spec Plate */}
            <div className="pointer-events-none relative z-10 flex items-center justify-center gap-2 mb-0.5">
              <span className="r2r-engraved-label text-[7px] sm:text-[8px] px-2 py-[1px] rounded-[2px] bg-[#C9CCCE]/90 border border-[#7c8084]">
                2-TRACK STEREO · 7½ IPS
              </span>
            </div>

            {/* Dual Side-by-Side Reels */}
            <div className="relative z-20 flex items-center justify-center gap-4 sm:gap-7 w-full">
              <OpenAluminumReel
                id="r2r-supply-reel"
                spinId="r2r-supply-spin-layer"
                diameterPx={reelDiameterPx}
                tapeOuterPct={tapeRadii.supplyOuterPct}
                durationSec={reelSpeeds.supplyDurationSec}
                timingFunction={reelSpeeds.timingFunction}
                shouldSpin={shouldSpin}
                stageTransform={stagePose.supplyTransform}
                isDocumentHidden={isDocumentHidden}
                lowPowerMode={lowPowerMode}
                prefersReducedMotion={prefersReducedMotion}
                roleLabel="Left Supply Tape Reel"
                hubArtwork={renderTrackArtwork('reel-hub-artwork-img', true, true)}
              />

              <OpenAluminumReel
                id="r2r-takeup-reel"
                spinId="r2r-takeup-spin-layer"
                diameterPx={reelDiameterPx}
                tapeOuterPct={tapeRadii.takeupOuterPct}
                durationSec={reelSpeeds.takeupDurationSec}
                timingFunction={reelSpeeds.timingFunction}
                shouldSpin={shouldSpin}
                stageTransform={stagePose.takeupTransform}
                isDocumentHidden={isDocumentHidden}
                lowPowerMode={lowPowerMode}
                prefersReducedMotion={prefersReducedMotion}
                roleLabel="Right Take-Up Tape Reel"
              />
            </div>

            {/* Lower Tape Path Overlay: Left Chrome Roller -> Center Head Block -> Right Chrome Roller */}
            <div
              style={{ opacity: stagePose.tapePathOpacity }}
              className="relative z-30 w-full max-w-[340px] flex items-center justify-between px-4 sm:px-6 -mt-2"
            >
              {/* Thin Dark Magnetic Tape Line Running Across Transport Guides */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-5 top-1/2 -translate-y-1/2 h-[2px] bg-[#3B2A1E] shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                  stagePose.tapeRewindShimmer ? 'opacity-65' : 'opacity-95'
                }`}
              />

              <ChromeGuideRoller
                durationSec={reelSpeeds.guideRollerDurationSec}
                spinMode={rollerSpinMode}
                compact={isCompactLandscape}
              />

              {/* Central Brushed-Metal Erase / Record / Play Magnetic Head Block */}
              <div
                id="r2r-magnetic-head-block"
                className={`r2r-aluminum-fascia relative z-10 rounded-t-[4px] rounded-b-[2px] border border-[#4f5357] flex flex-col items-center justify-center ${
                  isCompactLandscape ? 'px-2.5 py-[2px]' : 'px-4 py-1'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2.5 rounded-[1px] bg-[#2a2b2d] border border-[#E8ECEF]/65" />
                  <span className="w-2.5 h-2.5 rounded-[1px] bg-[#1e1f21] border border-[#FF9F43]/50" />
                  <span className="w-2 h-2.5 rounded-[1px] bg-[#2a2b2d] border border-[#E8ECEF]/65" />
                </div>
                <span className="r2r-engraved-label text-[6px] font-bold leading-none mt-[1px]">
                  HEAD BLOCK
                </span>
              </div>

              <ChromeGuideRoller
                durationSec={reelSpeeds.guideRollerDurationSec}
                spinMode={rollerSpinMode}
                compact={isCompactLandscape}
              />
            </div>

            {/* Draggable Cardboard Open-Reel Tape-Box Sleeve Holding Album Art */}
            <div
              ref={holderHomeSlotRef}
              id="album-art-holder-home-slot"
              aria-hidden={hideBoxArt ? 'true' : undefined}
              style={{
                left: '8px',
                bottom: '6px',
                width: `${holderBoxSizePx}px`,
                height: `${holderBoxSizePx}px`,
                opacity: hideBoxArt ? 0 : 1,
                transform: hideBoxArt ? 'scale(0.92)' : 'scale(1)',
                transition: prefersReducedMotion ? 'none' : 'opacity 240ms ease, transform 240ms ease',
              }}
              className="pointer-events-none absolute z-50 flex items-center justify-center select-none"
            >
              <div
                id="album-art-holder-box"
                data-testid="album-art-holder-box"
                data-dragging={isDraggingHolder ? 'true' : 'false'}
                data-holder-tilt={holderTiltDeg.toFixed(2)}
                onPointerDown={handleHolderPointerDown}
                onPointerMove={handleHolderPointerMove}
                onPointerUp={handleHolderPointerUp}
                onPointerCancel={handleHolderPointerUp}
                onDoubleClick={() => {
                  setHolderOffset({ x: 0, y: 0 });
                  setHolderTiltDeg(-2.5);
                }}
                title="Drag cardboard tape-box sleeve anywhere across the deck (double-click to re-dock)"
                style={{
                  width: `${holderBoxSizePx}px`,
                  height: `${holderBoxSizePx}px`,
                  transformOrigin: '50% 15%',
                  transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) rotate(${holderTiltDeg}deg)`,
                  transition:
                    isDraggingHolder || isDocumentHidden || lowPowerMode || prefersReducedMotion
                      ? 'none'
                      : 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className={`${
                  hideBoxArt ? 'pointer-events-none' : 'pointer-events-auto'
                } relative rounded-[4px] p-[4px] bg-gradient-to-br from-[#d9ccb2] via-[#baa583] to-[#8f7755] border border-[#6b5336] shadow-[0_12px_24px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,250,240,0.65)] ${
                  isDraggingHolder ? 'cursor-grabbing' : 'cursor-grab'
                } touch-none select-none z-50 flex flex-col overflow-hidden`}
              >
                {/* Worn Tape-Box Spine Crease */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-r from-[#594329]/60 to-transparent z-20"
                />
                {/* Typed Cream Index Header Strip */}
                <div className="relative z-10 w-full bg-[#EFE9DC] border-b border-[#8e7b60] px-1 py-[1px] flex items-center justify-between gap-1 shrink-0">
                  <span className="font-mono text-[6px] font-bold text-[#2b1a0e] truncate uppercase">
                    {track.title}
                  </span>
                  <span className="font-mono text-[5.5px] text-[#6b4a2f] shrink-0">R2R</span>
                </div>
                <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-[#1e150e] border border-[#6b5336]/60">
                  {!artworkLoaded && !artworkState.isPlaceholder && (
                    <div
                      data-testid="album-art-skeleton"
                      className="absolute inset-0 bg-[#3a2718] flex items-center justify-center z-10"
                    >
                      <Disc3 className="w-4 h-4 text-[#EFE9DC]/50" />
                    </div>
                  )}
                  {renderTrackArtwork('album-art-cover', true)}
                </div>
              </div>
            </div>
          </div>

          {/* Amber Tuner-Dial Seek Bar Above Backlit Amber Glass Lyrics Window */}
          <div id="lyrics-strip-slot" className="relative z-10 w-full shrink-0 flex flex-col gap-1">
            <AmberTunerSeekBar
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
              playbackRate={rpm === 45 ? 1.35 * (1 + pitchPercent / 100) : 1 + pitchPercent / 100}
              prefersReducedMotion={prefersReducedMotion}
              themePalette={themePalette}
              themeId="reel-to-reel"
              onSeek={onSeek}
              className={isCompactLandscape ? 'h-[44px]' : 'h-[58px] sm:h-[64px]'}
            />
          </div>
        </div>

        {/* ===================================================================
            2. LOWER BRUSHED ALUMINUM TRANSPORT FASCIA + FLANKING WALNUT KNOBS
            =================================================================== */}
        {isUltraNarrowDeck ? (
          <div
            id="console-front-face"
            className="relative z-10 flex flex-col gap-1.5 shrink-0"
          >
            {/* Mobile Portrait Top Fascia: Dual VU Meters + Cream Clock + 6 Piano Keys */}
            <div className="r2r-aluminum-fascia relative w-full rounded-[4px] p-1.5 flex flex-col gap-1.5">
              <div
                id="turntable-control-row"
                className="w-full flex items-center justify-center gap-2"
              >
                <AnalogVuMeter
                  id="r2r-vu-left"
                  channelLabel="L"
                  angleDeg={vuAngles.left}
                  compact
                />
                <CreamClockDateCard
                  compact
                  isDocumentHidden={isDocumentHidden}
                />
                <AnalogVuMeter
                  id="r2r-vu-right"
                  channelLabel="R"
                  angleDeg={vuAngles.right}
                  compact
                />
              </div>

              <div
                id="transport-buttons-group"
                className="w-full flex items-end gap-1 rounded-[3px] bg-[#2a2724] p-[3px] border border-[#524e49] shadow-inner"
              >
                <PianoKeyLever
                  id="btn-prev-track"
                  label="REW"
                  isDepressed={false}
                  disabled={isStandby}
                  compact
                  ariaLabel="Rewind / Previous Track"
                  title="Rewind / Previous Track"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onPrevious();
                  }}
                >
                  <Rewind className="w-3 h-3 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-scratch-vinyl"
                  label="CUE"
                  isDepressed={nudgePulseActive}
                  disabled={isStandby}
                  compact
                  ariaLabel="Tape Nudge Cue Effect"
                  title="Tape Nudge / Cue FX"
                  onClick={handleTriggerNudge}
                >
                  <AudioLines className="w-3 h-3" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-play-pause"
                  label="PLAY"
                  isDepressed={isPlaying && !isStandby}
                  disabled={isStandby}
                  compact
                  ariaLabel={isPlaying ? 'Pause Playback' : 'Play Tape Transport'}
                  title="Play Tape Transport"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onTogglePlay();
                  }}
                >
                  <Play className="w-3 h-3 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-pause-track"
                  label="PAUSE"
                  isDepressed={!isPlaying && !isStoppedAtRest && !isStandby}
                  disabled={isStandby}
                  compact
                  ariaLabel="Pause Tape Transport"
                  title="Pause Tape Transport"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    if (isPlaying) {
                      onTogglePlay();
                    }
                  }}
                >
                  <Pause className="w-3 h-3 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-stop-playback"
                  label="STOP"
                  isDepressed={isStoppedAtRest && !isPlaying}
                  disabled={isStandby}
                  compact
                  ariaLabel="Stop Tape Transport"
                  title="Stop Tape Transport"
                  onClick={handleStopClick}
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-next-track"
                  label="FF"
                  isDepressed={false}
                  disabled={isStandby}
                  compact
                  ariaLabel="Fast-Forward / Next Track"
                  title="Fast-Forward / Next Track"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onNext();
                  }}
                >
                  <FastForward className="w-3 h-3 fill-current" />
                </PianoKeyLever>
              </div>
            </div>

            {/* Mobile Portrait Bottom Walnut Sub-Strip: PITCH Knob | SHF & RPT Switches | LEVEL Knob */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5">
              <div className="rounded-[4px] bg-gradient-to-b from-[#7a5637] to-[#4e341f] border border-[#3a2515] shadow-[inset_0_1px_0_rgba(255,228,192,0.28),0_3px_8px_rgba(0,0,0,0.65)] px-2 py-1 flex items-center justify-center">
                <KnurledRotaryKnob
                  id="r2r-pitch-knob"
                  label="PITCH"
                  valueText={pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
                  normalizedValue={pitchNormalized}
                  ariaLabel="Tape Speed Pitch Rotary Control"
                  ariaMin={-12}
                  ariaMax={12}
                  ariaNow={pitchPercent}
                  compact
                  lowPowerMode={lowPowerMode}
                  onChangeNormalized={(next01) => onChangePitch(normalizedToPitchPercent(next01))}
                  onResetDefault={() => onChangePitch(0)}
                  onStepDelta={(d) => onChangePitch(Math.max(-12, Math.min(12, pitchPercent + d)))}
                />
              </div>

              <div
                id="shuffle-repeat-stack"
                className="r2r-aluminum-fascia rounded-[4px] px-2 py-1 flex flex-col items-stretch justify-center gap-1.5 shrink-0"
              >
                <ChromeToggleWithRedLed
                  id="toggle-shuffle"
                  label="SHF"
                  isOn={shuffleEnabled}
                  disabled={isStandby}
                  compact
                  ariaLabel="Toggle Shuffle"
                  title={`Shuffle: ${shuffleEnabled ? 'ON' : 'OFF'}`}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleShuffle();
                  }}
                />
                <ChromeToggleWithRedLed
                  id="toggle-repeat"
                  label="RPT"
                  isOn={repeatOne}
                  disabled={isStandby}
                  compact
                  ariaLabel="Toggle Repeat Current Song"
                  title={`Repeat One: ${repeatOne ? 'ON' : 'OFF'}`}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onToggleRepeatOne();
                  }}
                />
              </div>

              <div className="rounded-[4px] bg-gradient-to-b from-[#7a5637] to-[#4e341f] border border-[#3a2515] shadow-[inset_0_1px_0_rgba(255,228,192,0.28),0_3px_8px_rgba(0,0,0,0.65)] px-2 py-1 flex items-center justify-center">
                <KnurledRotaryKnob
                  id="r2r-level-knob"
                  label="LEVEL"
                  valueText={`${volumePctInt}%`}
                  normalizedValue={clampedVolume}
                  ariaLabel="Output Level Volume Rotary Control"
                  ariaMin={0}
                  ariaMax={100}
                  ariaNow={volumePctInt}
                  compact
                  lowPowerMode={lowPowerMode}
                  onChangeNormalized={(next01) => onChangeVolume(Number(next01.toFixed(2)))}
                  onResetDefault={() => onChangeVolume(0.8)}
                  onStepDelta={(d) =>
                    onChangeVolume(Number(Math.max(0, Math.min(1, clampedVolume + d * 0.05)).toFixed(2)))
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            id="console-front-face"
            className="relative z-10 flex items-stretch gap-1.5 sm:gap-2 shrink-0"
          >
            {/* LEFT WALNUT END-CAP: Knurled PITCH Rotary Knob + Screwed Engraved Metal Plate */}
            <div className="rounded-[4px] bg-gradient-to-b from-[#7a5637] to-[#4e341f] border border-[#3a2515] shadow-[inset_0_1px_0_rgba(255,228,192,0.28),0_3px_8px_rgba(0,0,0,0.65)] px-1.5 sm:px-2 py-1 flex items-center justify-center shrink-0">
              <KnurledRotaryKnob
                id="r2r-pitch-knob"
                label="PITCH"
                valueText={pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
                normalizedValue={pitchNormalized}
                ariaLabel="Tape Speed Pitch Rotary Control"
                ariaMin={-12}
                ariaMax={12}
                ariaNow={pitchPercent}
                compact={isCompactLandscape || isNarrowDeck}
                lowPowerMode={lowPowerMode}
                onChangeNormalized={(next01) => onChangePitch(normalizedToPitchPercent(next01))}
                onResetDefault={() => onChangePitch(0)}
                onStepDelta={(d) => onChangePitch(Math.max(-12, Math.min(12, pitchPercent + d)))}
              />
            </div>

            {/* CENTER BRUSHED ALUMINUM FASCIA: VU Meters + Clock + Chrome Toggles + 6 Piano Keys */}
            <div className="r2r-aluminum-fascia relative flex-1 min-w-0 rounded-[4px] p-1.5 sm:p-2 flex flex-col justify-between gap-1.5 overflow-hidden">
              {/* Row A: Left VU Meter + Cream Clock Card + Right VU Meter + Chrome Toggle Switches */}
              <div
                id="turntable-control-row"
                className="w-full flex items-center justify-between gap-1 sm:gap-2 min-w-0"
              >
                {/* Dual Flanking VU Meters + Center Cream Clock Card */}
                <div className="flex items-center justify-center gap-1 sm:gap-2 mx-auto min-w-0">
                  <AnalogVuMeter
                    id="r2r-vu-left"
                    channelLabel="L"
                    angleDeg={vuAngles.left}
                    compact={isCompactLandscape || isNarrowDeck}
                  />
                  <CreamClockDateCard
                    compact={isCompactLandscape || isNarrowDeck}
                    isDocumentHidden={isDocumentHidden}
                  />
                  <AnalogVuMeter
                    id="r2r-vu-right"
                    channelLabel="R"
                    angleDeg={vuAngles.right}
                    compact={isCompactLandscape || isNarrowDeck}
                  />
                </div>

                {/* Two Chrome Toggle Levers with Red Indicator Lights */}
                <div
                  id="shuffle-repeat-stack"
                  className="flex flex-col gap-1 shrink-0"
                >
                  <ChromeToggleWithRedLed
                    id="toggle-shuffle"
                    label="SHF"
                    isOn={shuffleEnabled}
                    disabled={isStandby}
                    compact={isCompactLandscape || isNarrowDeck}
                    ariaLabel="Toggle Shuffle"
                    title={`Shuffle: ${shuffleEnabled ? 'ON' : 'OFF'}`}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onToggleShuffle();
                    }}
                  />
                  <ChromeToggleWithRedLed
                    id="toggle-repeat"
                    label="RPT"
                    isOn={repeatOne}
                    disabled={isStandby}
                    compact={isCompactLandscape || isNarrowDeck}
                    ariaLabel="Toggle Repeat Current Song"
                    title={`Repeat One: ${repeatOne ? 'ON' : 'OFF'}`}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onToggleRepeatOne();
                    }}
                  />
                </div>
              </div>

              {/* Row B: Six Mechanical Piano-Key Transport Levers (REW / CUE / PLAY / PAUSE / STOP / FF) */}
              <div
                id="transport-buttons-group"
                className="w-full flex items-end gap-1 rounded-[3px] bg-[#2a2724] p-[3px] border border-[#524e49] shadow-inner"
              >
                <PianoKeyLever
                  id="btn-prev-track"
                  label="REW"
                  isDepressed={false}
                  disabled={isStandby}
                  compact={isCompactLandscape || isNarrowDeck}
                  ariaLabel="Rewind / Previous Track"
                  title="Rewind / Previous Track"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onPrevious();
                  }}
                >
                  <Rewind className="w-3.5 h-3.5 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-scratch-vinyl"
                  label="CUE"
                  isDepressed={nudgePulseActive}
                  disabled={isStandby}
                  compact={isCompactLandscape || isNarrowDeck}
                  ariaLabel="Tape Nudge Cue Effect"
                  title="Tape Nudge / Cue FX"
                  onClick={handleTriggerNudge}
                >
                  <AudioLines className="w-3.5 h-3.5" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-play-pause"
                  label="PLAY"
                  isDepressed={isPlaying && !isStandby}
                  disabled={isStandby}
                  compact={isCompactLandscape || isNarrowDeck}
                  ariaLabel={isPlaying ? 'Pause Playback' : 'Play Tape Transport'}
                  title="Play Tape Transport"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onTogglePlay();
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-pause-track"
                  label="PAUSE"
                  isDepressed={!isPlaying && !isStoppedAtRest && !isStandby}
                  disabled={isStandby}
                  compact={isCompactLandscape || isNarrowDeck}
                  ariaLabel="Pause Tape Transport"
                  title="Pause Tape Transport"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    if (isPlaying) {
                      onTogglePlay();
                    }
                  }}
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-stop-playback"
                  label="STOP"
                  isDepressed={isStoppedAtRest && !isPlaying}
                  disabled={isStandby}
                  compact={isCompactLandscape || isNarrowDeck}
                  ariaLabel="Stop Tape Transport"
                  title="Stop Tape Transport"
                  onClick={handleStopClick}
                >
                  <Square className="w-3 h-3 fill-current" />
                </PianoKeyLever>

                <PianoKeyLever
                  id="btn-next-track"
                  label="FF"
                  isDepressed={false}
                  disabled={isStandby}
                  compact={isCompactLandscape || isNarrowDeck}
                  ariaLabel="Fast-Forward / Next Track"
                  title="Fast-Forward / Next Track"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onNext();
                  }}
                >
                  <FastForward className="w-3.5 h-3.5 fill-current" />
                </PianoKeyLever>
              </div>
            </div>

            {/* RIGHT WALNUT END-CAP: Knurled LEVEL Rotary Knob + Screwed Engraved Metal Plate */}
            <div className="rounded-[4px] bg-gradient-to-b from-[#7a5637] to-[#4e341f] border border-[#3a2515] shadow-[inset_0_1px_0_rgba(255,228,192,0.28),0_3px_8px_rgba(0,0,0,0.65)] px-1.5 sm:px-2 py-1 flex items-center justify-center shrink-0">
              <KnurledRotaryKnob
                id="r2r-level-knob"
                label="LEVEL"
                valueText={`${volumePctInt}%`}
                normalizedValue={clampedVolume}
                ariaLabel="Output Level Volume Rotary Control"
                ariaMin={0}
                ariaMax={100}
                ariaNow={volumePctInt}
                compact={isCompactLandscape || isNarrowDeck}
                lowPowerMode={lowPowerMode}
                onChangeNormalized={(next01) => onChangeVolume(Number(next01.toFixed(2)))}
                onResetDefault={() => onChangeVolume(0.8)}
                onStepDelta={(d) =>
                  onChangeVolume(Number(Math.max(0, Math.min(1, clampedVolume + d * 0.05)).toFixed(2)))
                }
              />
            </div>
          </div>
        )}
      </section>
    );
  }
);
