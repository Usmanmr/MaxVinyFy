import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { Disc3 } from 'lucide-react';
import {
  formatDuration,
  triggerButtonHaptic,
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  calculateHolderBoxDragTiltDeg,
  calculateHolderBoxRestTiltDeg,
  generateDustParticles,
  stepDustParticles,
  stepVuMeterPhysics,
  type DustParticle,
  type VuChannelPhysicsState,
} from '../utils/playerLogic';
import {
  CASSETTE_TRACK_CHANGE_TIMELINE_MS,
  CASSETTE_5BAND_EQ_SPECS,
  BOOMBOX_FM_DIAL_MARKERS,
  BOOMBOX_AM_DIAL_MARKERS,
  BOOMBOX_DEFAULT_TUNER_FM_MHZ,
  fmFrequencyToNeedlePercent,
  getCassetteTrackChangeStagePose,
  resolveCassetteTransportKeyStates,
  computeBoomboxProportionalGeometry,
  computeExpandedBoomboxStageLayout,
  calculateCassetteTapePancakes,
  calculateCassetteHubSpeeds,
  levelTo12SegmentCount,
  levelTo4RedPeakDots,
  tunerDialRatioToSeekSec,
  stepSeekSecFromTuningKnobDelta,
  computeCassetteBoxDimensions,
  computeBassSpeakerPulseScale,
  computeEqBandPeakLevels,
  horizontalPointerRatioToPitch,
  calculatePitchThumbLeftPercent,
  horizontalPointerRatioToVolume,
  calculateVolumeThumbLeftPercent,
  getMirroredUpperAuxiliarySpeakers,
  computeUpperDualRoundSpeakerPairMetrics,
  CASSETTE_EQ_DB_TICKS,
  type CassetteTrackChangePhase,
} from '../utils/cassetteDeckLogic';
import { useCassetteSpinePalette } from '../utils/cassetteSpineColor';
import { retroAudio } from '../utils/retroAudioEngine';
import { usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';

/**
 * Recessed 12px Corner Screw Well Containing a Realistic Metallic Phillips/Slotted Screw
 */
const BoomboxScrewHead = React.memo<{
  type?: 'phillips' | 'torx';
  sizePx?: number;
  wellSizePx?: number;
  angleDeg?: number;
  className?: string;
}>(({ type = 'phillips', sizePx = 8, wellSizePx = 12, angleDeg = 28, className = '' }) => (
  <span
    aria-hidden="true"
    data-cas-screw={type}
    data-boombox-screw={type}
    style={{ width: `${wellSizePx}px`, height: `${wellSizePx}px` }}
    className={`pointer-events-none inline-flex items-center justify-center rounded-full bg-[#24272C] border border-[#565A62] shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.88),0_1px_0_rgba(255,255,255,0.75)] shrink-0 ${className}`}
  >
    <span
      style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
      className="inline-flex items-center justify-center rounded-full border border-[#45484E] bg-[radial-gradient(circle_at_30%_28%,#FFFFFF_0%,#C8CCD2_48%,#7E8288_88%,#484B50_100%)] shadow-[0_1px_1.5px_rgba(0,0,0,0.72),inset_0_0.5px_0_rgba(255,255,255,0.95)]"
    >
      <svg
        viewBox="0 0 16 16"
        style={{ transform: `rotate(${angleDeg}deg)` }}
        className="w-[78%] h-[78%] overflow-visible"
      >
        {type === 'torx' ? (
          <polygon
            points="8,2.2 9.5,5.3 12.9,4.9 11,8 12.9,11.1 9.5,10.7 8,13.8 6.5,10.7 3.1,11.1 5,8 3.1,4.9 6.5,5.3"
            fill="#23262A"
          />
        ) : (
          <>
            <rect x="2.6" y="6.9" width="10.8" height="2.2" rx="0.5" fill="#23262A" />
            <rect x="6.9" y="2.6" width="2.2" height="10.8" rx="0.5" fill="#23262A" />
            <circle cx="8" cy="8" r="1.3" fill="#141516" />
          </>
        )}
      </svg>
    </span>
  </span>
));

/**
 * Subtle Floating Lamp-Lit Dust Canvas inside the Cassette Bay (Pauses cleanly on stop/pause/hidden)
 */
const CassetteDustCanvas = React.memo<{
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
      ctx.fillStyle = `rgba(255, 255, 255, ${(p.alpha * 0.24).toFixed(3)})`;
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
      particlesRef.current = generateDustParticles(12, safeW, safeH);
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
      className="pointer-events-none absolute inset-0 w-full h-full z-[35]"
    />
  );
});

/**
 * Upper Fascia Corner Stereo Badge / Acoustic Diffuser Trim (Top-Left & Top-Right of Tuner Row)
 */
const SquarePiezoTweeterBay = React.memo<{
  side: 'left' | 'right';
  compact?: boolean;
}>(({ side, compact = false }) => (
  <div
    id={`cas-piezo-tweeter-${side}`}
    data-tweeter-side={side}
    aria-hidden="true"
    className={`cas-polished-chrome relative rounded-[2px] p-[2.5px] sm:p-[3px] flex items-center justify-center shrink-0 ${
      compact ? 'w-[34px] h-[36px]' : 'w-[42px] sm:w-[48px] h-[42px] sm:h-[48px]'
    }`}
  >
    <div className="w-full h-full rounded-[1px] border border-[#686C70] bg-[#18191B] shadow-[inset_0_2px_5px_rgba(0,0,0,0.92)] flex flex-col items-center justify-between p-1 overflow-hidden">
      <span className="cas-condensed-label text-[5px] sm:text-[5.5px] font-black tracking-widest text-[#E6E8EA] leading-none">
        {side === 'left' ? 'L · HI-FI' : 'R · HI-FI'}
      </span>
      <div className="w-full flex flex-col gap-[2px] my-auto">
        <span className="w-full h-[2px] bg-gradient-to-r from-[#8C9094] via-[#F4F6F8] to-[#8C9094]" />
        <span className="w-full h-[2px] bg-gradient-to-r from-[#8C9094] via-[#E61919] to-[#8C9094]" />
        <span className="w-full h-[2px] bg-gradient-to-r from-[#8C9094] via-[#F4F6F8] to-[#8C9094]" />
      </div>
      <span className="cas-technical-num text-[4.5px] font-bold text-[#9EA3A8] leading-none">
        2-WAY
      </span>
    </div>
  </div>
));

/**
 * Mirrored Dual Round Upper Auxiliary Speakers (Directly Above Lowered Main Woofer Grilles)
 * - Left Bay:  [Outer Larger Aux Driver] [Inner Exact 50% Tweeter] above Left Main Woofer
 * - Right Bay: [Inner Exact 50% Tweeter] [Outer Larger Aux Driver] above Right Main Woofer
 * - Outer auxiliary speaker aligns flush with the outer edge of the lowered main woofer below.
 * - Inner auxiliary speaker sits adjacent toward the cassette bay at exact 50% diameter of the outer speaker.
 */
const MirroredDualRoundUpperSpeakers = React.memo<{
  side: 'left' | 'right';
  mainWooferSizePx: number;
  isAnimating: boolean;
  dustCapScale: number;
  isMobilePortrait?: boolean;
}>(({ side, mainWooferSizePx, isAnimating, dustCapScale, isMobilePortrait = false }) => {
  const drivers = useMemo(() => getMirroredUpperAuxiliarySpeakers(side), [side]);
  const pairMetrics = useMemo(
    () => computeUpperDualRoundSpeakerPairMetrics(mainWooferSizePx, isMobilePortrait),
    [mainWooferSizePx, isMobilePortrait]
  );

  return (
    <div
      id={`cas-upper-aux-speakers-${side}`}
      data-testid={`cas-upper-aux-speakers-${side}`}
      data-aux-speaker-side={side}
      data-aux-speaker-order={drivers.map((d) => d.position).join('-')}
      data-inner-to-outer-ratio="0.5"
      aria-label={`${side === 'left' ? 'Left' : 'Right'} Mirrored Dual Round Upper Auxiliary Speakers`}
      style={{ width: `${mainWooferSizePx}px` }}
      className={`relative z-20 flex items-end ${
        side === 'left' ? 'justify-start gap-2' : 'justify-end gap-2'
      } px-0 py-0.5 shrink-0`}
    >
      {drivers.map((driver) => {
        const isInnerHalf = driver.position === 'inner';
        const diaPx = isInnerHalf ? pairMetrics.innerDiameterPx : pairMetrics.outerDiameterPx;
        const domePx = Math.max(6, Math.round(diaPx * 0.36));
        return (
          <div
            key={driver.id}
            id={`${driver.id}-${side}`}
            data-aux-driver-role={driver.role}
            data-aux-driver-position={driver.position}
            data-aux-driver-diameter={diaPx}
            data-aux-diameter-ratio={driver.diameterRatioToOuter}
            style={{
              width: `${diaPx}px`,
              height: `${diaPx}px`,
              borderRadius: '50%',
            }}
            className="cas-aux-round-bezel relative rounded-full p-[3px] sm:p-[4px] flex items-center justify-center shrink-0"
          >
            {/* Dark Recessed Inner Gasket & Perforated Hexagonal Mesh Grille */}
            <div className="cas-speaker-gasket relative w-full h-full rounded-full p-[1.5px] flex items-center justify-center overflow-hidden">
              <div className="cas-speaker-grille relative w-full h-full rounded-full flex items-center justify-center overflow-hidden">
                <div className="w-[82%] h-[82%] rounded-full border border-white/15 bg-[radial-gradient(circle_at_center,#26292D_0%,#16181B_68%,#0B0C0E_100%)] flex items-center justify-center">
                  {/* Reflective Chrome Center Phase Dome */}
                  <div
                    data-tweeter-dome="conical-sunburst"
                    style={{
                      width: `${domePx}px`,
                      height: `${domePx}px`,
                      transform: `scale(${isAnimating ? dustCapScale.toFixed(3) : '1'})`,
                      transition: isAnimating ? 'transform 65ms ease-out' : 'transform 150ms ease-out',
                    }}
                    className="cas-tweeter-phase-dome rounded-full flex items-center justify-center shrink-0"
                  >
                    <span className="w-[32%] h-[32%] rounded-full bg-white/85 blur-[0.2px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

/**
 * Single Recessed Analog VU Meter Module (Left "L" or Right "R")
 * Silver-trimmed recessed bezel, monochrome silver/white dial face (#E6E8EA),
 * black decibel arc (-20 to +3 dB), and fine black bottom-pivoted needle.
 */
const SingleRecessedVuMeter = React.memo<{
  channel: 'L' | 'R';
  meterId: string;
  needleId: string;
  level01: number;
  segCount: number;
  compact?: boolean;
}>(({ channel, meterId, needleId, level01, segCount, compact = false }) => {
  const safe = Number.isFinite(level01) ? Math.max(0, Math.min(1, level01)) : 0;
  const angleDeg = -40 + safe * 78;

  return (
    <div
      id={meterId}
      data-vu-channel={channel}
      data-lit-segments={segCount}
      data-vu-backlight="silver-black"
      className={`cas-cream-dial relative rounded-[1px] border border-[#565A62] overflow-hidden flex flex-col justify-between shrink-0 ${
        compact ? 'w-[54px] h-[30px] px-1 pt-0.5' : 'w-[64px] sm:w-[74px] h-[34px] sm:h-[36px] px-1 pt-0.5'
      }`}
    >
      <svg viewBox="0 0 100 46" aria-hidden="true" className="relative z-[2] w-full h-full overflow-visible">
        {/* -20 to 0 dB normal arc */}
        <path
          d="M 12 39 A 42 42 0 0 1 66 12"
          fill="none"
          stroke="#141516"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* 0 to +3 dB peak arc */}
        <path
          d="M 67 12 A 42 42 0 0 1 88 39"
          fill="none"
          stroke="#141516"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {[-40, -24, -8, 8, 24, 38].map((deg, idx) => (
          <line
            key={deg}
            x1="50"
            y1="5"
            x2="50"
            y2={idx % 2 === 0 ? '10' : '8.5'}
            stroke="#141516"
            strokeWidth={deg > 10 ? '1.5' : '1.1'}
            transform={`rotate(${deg} 50 44)`}
          />
        ))}
        <text x="13" y="21" fontSize="6.5" fontWeight="700" fill="#141516" fontFamily="sans-serif">
          -20
        </text>
        <text x="47" y="17" fontSize="6.5" fontWeight="700" fill="#141516" fontFamily="sans-serif">
          0
        </text>
        <text x="73" y="21" fontSize="6.5" fontWeight="800" fill="#141516" fontFamily="sans-serif">
          +3
        </text>
        <text
          x="50"
          y="31"
          textAnchor="middle"
          fontSize="6.8"
          fontWeight="800"
          fill="#141516"
          fontFamily="sans-serif"
        >
          VU {channel}
        </text>
      </svg>

      {/* Bottom-Anchored Physical Black Needle */}
      <div
        id={needleId}
        aria-hidden="true"
        style={{
          transform: `translateX(-50%) rotate(${angleDeg.toFixed(1)}deg)`,
          transformOrigin: '50% 100%',
          transition: 'transform 75ms linear',
        }}
        className="pointer-events-none absolute left-1/2 bottom-[2px] w-[1.5px] h-[78%] bg-[#141516] rounded-full z-10"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 bottom-[-4px] -translate-x-1/2 w-[9px] h-[7px] rounded-t-full bg-[#18191B] border border-[#8C9094] z-20"
      />
    </div>
  );
});

/**
 * Tactile Metallic Micro-Button for Shuffle & Repeat inside the Central Playback HUD Cluster
 */
const BoomboxHudMicroButton = React.memo<{
  id: string;
  label: string;
  isOn: boolean;
  disabled?: boolean;
  ariaLabel: string;
  title: string;
  onClick: () => void;
}>(({ id, label, isOn, disabled = false, ariaLabel, title, onClick }) => (
  <button
    id={id}
    type="button"
    disabled={disabled}
    aria-pressed={isOn}
    aria-label={ariaLabel}
    title={title}
    data-pressed={isOn ? 'true' : 'false'}
    onClick={onClick}
    style={{
      transform: isOn && !disabled ? 'translateY(1px)' : 'translateY(0px)',
      transition: 'transform 80ms linear',
    }}
    className={`relative flex-1 h-[14px] sm:h-[15px] px-1 rounded-[1px] border flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      isOn
        ? 'bg-gradient-to-b from-[#9EA3A8] to-[#B8BCC0] border-[#45484E] shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.55)]'
        : 'bg-gradient-to-b from-[#F4F6F8] via-[#D0D3D6] to-[#AEB2B8] border-[#5A5E62] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_1.5px_rgba(0,0,0,0.38)]'
    }`}
  >
    <span
      aria-hidden="true"
      style={{
        backgroundColor: isOn ? '#E61919' : '#2C2E33',
        boxShadow: isOn ? '0 0 4px rgba(230, 25, 25, 0.85)' : 'none',
      }}
      className="w-[3.5px] h-[3.5px] rounded-full border border-black/60 shrink-0"
    />
    <span className="cas-condensed-label text-[6.5px] font-black leading-none text-[#141516] tracking-wider">
      {label}
    </span>
  </button>
));

/**
 * Top-Deck Cylindrical Machined-Aluminum Rotary Post / Fluted Knob
 * - Post variant (Knob 1 Far Left): width 22px, height 16px, fine vertical knurled ridges
 * - Fluted variant (Knobs 2, 3, 4): width 34px, height 20px, deep vertical grip slots & polished top bevel
 */
const TopDeckMachinedRotaryKnob = React.memo<{
  id: string;
  label: string;
  variant: 'post-22x16' | 'fluted-34x20';
  value: number;
  disabled?: boolean;
  onChange: (nextVal: number) => void;
}>(({ id, label, variant, value, disabled = false, onChange }) => {
  const dragOriginRef = useRef<{ startY: number; startVal: number } | null>(null);
  const isPost = variant === 'post-22x16';

  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      title={`${label}: ${Math.round(value * 100)}% (Drag vertically or double-click to center)`}
      onPointerDown={(e) => {
        if (disabled) return;
        e.stopPropagation();
        dragOriginRef.current = { startY: e.clientY, startVal: value };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onPointerMove={(e) => {
        if (!dragOriginRef.current || disabled) return;
        const dy = dragOriginRef.current.startY - e.clientY;
        onChange(Math.max(0, Math.min(1, dragOriginRef.current.startVal + dy / 80)));
      }}
      onPointerUp={(e) => {
        if (!dragOriginRef.current) return;
        dragOriginRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onPointerCancel={() => {
        dragOriginRef.current = null;
      }}
      onDoubleClick={() => onChange(0.5)}
      style={{
        width: isPost ? '22px' : '34px',
        height: isPost ? '16px' : '20px',
      }}
      className="cas-knurled-knob relative rounded-t-[3px] flex flex-col items-center justify-between pt-[1px] pb-[2px] cursor-ns-resize touch-none shrink-0 disabled:opacity-50"
    >
      {/* Polished Top Bevel Highlight */}
      <span className="w-[88%] h-[2.5px] rounded-full bg-gradient-to-r from-white/95 via-[#E8ECEF] to-white/80" />
      {/* Position Indicator Notch */}
      <span
        style={{
          transform: `translateX(${((value - 0.5) * (isPost ? 8 : 14)).toFixed(1)}px)`,
        }}
        className="w-[2px] h-[7px] bg-[#18191B] rounded-[0.5px]"
      />
      <span className="w-full h-[2px] bg-[#3A3E42]" />
    </button>
  );
});

/**
 * Physical Bevel-Edged Satin-Silver Rectangular Piano Key (6-Key Bottom Transport Array)
 * Bright top chamfer, gently sloped silver front face, thick matte-black lower sub-skirt,
 * 2px dark gap between adjacent keys, and realistic mechanical latch animation (translateY(4px)).
 */
const BoomboxPianoKey = React.memo<{
  id: string;
  label: string;
  depth: 'up' | 'half' | 'full';
  travelPx: number;
  scaleY?: number;
  latched: boolean;
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
    depth,
    travelPx,
    scaleY = 1,
    latched,
    disabled = false,
    compact = false,
    ariaLabel,
    title,
    onClick,
    children,
  }) => {
    const [momentaryDown, setMomentaryDown] = useState(false);
    const activeTravelPx = disabled ? 0 : momentaryDown ? 4 : travelPx;
    const activeScaleY = disabled ? 1 : momentaryDown ? 0.96 : scaleY;
    const isDepressed = activeTravelPx > 0 || depth !== 'up';

    return (
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-pressed={latched ? true : undefined}
        aria-label={ariaLabel}
        title={title}
        data-key-depth={isDepressed ? 'full' : 'up'}
        data-travel-px={activeTravelPx}
        data-latched={latched ? 'true' : 'false'}
        data-pressed={isDepressed ? 'true' : 'false'}
        onPointerDown={() => {
          if (!disabled) setMomentaryDown(true);
        }}
        onPointerUp={() => setMomentaryDown(false)}
        onPointerLeave={() => {
          if (momentaryDown) setMomentaryDown(false);
        }}
        onClick={onClick}
        style={{
          transformOrigin: 'top center',
          transform: `translateY(${activeTravelPx}px) scaleY(${activeScaleY})`,
          transition: 'transform 110ms cubic-bezier(0.2, 0.9, 0.3, 1.0), box-shadow 110ms ease',
          boxShadow: isDepressed
            ? '0 1px 2px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.75)'
            : '0 4px 0 #111214, 0 6px 6px rgba(0,0,0,0.65), inset 0 1.5px 0 #FFFFFF',
        }}
        className={`relative flex-1 min-w-0 rounded-b-[2px] border border-[#5A5E62] flex flex-col items-center justify-between cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed overflow-hidden ${
          compact ? 'h-[24px] pt-[2px] pb-0' : 'h-[28px] sm:h-[30px] pt-[2px] pb-0'
        } ${
          isDepressed
            ? 'bg-gradient-to-b from-[#C8CCD0] via-[#B4B8BC] to-[#909498]'
            : 'bg-gradient-to-b from-[#F4F6F8] via-[#D4D7DA] to-[#AEB2B7]'
        }`}
      >
        {/* Top Bevel Specular Highlight Line */}
        <span aria-hidden="true" className="w-[92%] h-[1.5px] bg-white/90 shrink-0" />

        {/* Engraved Black Symbol / Red Record Dot */}
        <span className="flex items-center justify-center my-auto text-[#141516] shrink-0">
          {children}
        </span>

        {/* Thick Matte-Black Lower Sub-Skirt Beneath Silver Cap */}
        <span
          aria-hidden="true"
          title={label}
          className="w-full h-[5px] bg-gradient-to-b from-[#23262A] to-[#0D0E10] border-t border-[#5A5E62] shrink-0"
        />
      </button>
    );
  }
);

/**
 * Long, Heavy-Duty HORIZONTAL Physical Fader Track (VOLUME / PITCH) with Recessed Dark Metallic Slot,
 * Fine White Calibration Tick Marks Along Slot Edges, and Ribbed Brushed-Silver Rectangular Fader Knob
 */
const BoomboxHorizontalSlider = React.memo<{
  id: string;
  sliderId: string;
  valueReadoutId: string;
  label: string;
  valueText: string;
  thumbLeftPercent: number;
  ariaLabel: string;
  ariaMin: number;
  ariaMax: number;
  ariaNow: number;
  title: string;
  compact?: boolean;
  lowPowerMode: boolean;
  onPointerRatio: (ratioFromLeft: number) => void;
  onStepDelta: (delta: number) => void;
  onResetDefault: () => void;
}>(
  ({
    id,
    sliderId,
    valueReadoutId,
    label,
    valueText,
    thumbLeftPercent,
    ariaLabel,
    ariaMin,
    ariaMax,
    ariaNow,
    title,
    compact = false,
    lowPowerMode,
    onPointerRatio,
    onStepDelta,
    onResetDefault,
  }) => {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef<boolean>(false);

    const updateFromClientX = useCallback(
      (clientX: number) => {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 4) return;
        const pad = 6;
        const ratio = (clientX - (rect.left + pad)) / Math.max(12, rect.width - pad * 2);
        onPointerRatio(Math.max(0, Math.min(1, ratio)));
      },
      [onPointerRatio]
    );

    return (
      <div
        id={id}
        data-fader-orientation="horizontal"
        className="relative flex-1 min-w-[96px] flex flex-col justify-between select-none gap-[1px]"
      >
        <div className="w-full flex items-center justify-between px-0.5 leading-none">
          <span
            className={`cas-condensed-label font-black text-[#141516] leading-none tracking-wider ${
              compact ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            {label}
          </span>
          <span
            id={valueReadoutId}
            className={`cas-technical-num text-[#141516] font-extrabold leading-none tabular-nums whitespace-nowrap ${
              compact ? 'text-[8.5px]' : 'text-[9.5px] sm:text-[10.5px]'
            }`}
          >
            {valueText}
          </span>
        </div>

        {/* Enlarged Recessed Dark Metallic Fader Slot with Fine White Calibration Tick Marks Along Slot Edges */}
        <div
          id={sliderId}
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={ariaMin}
          aria-valuemax={ariaMax}
          aria-valuenow={ariaNow}
          aria-orientation="horizontal"
          data-fader-orientation="horizontal"
          title={title}
          onPointerDown={(e) => {
            e.stopPropagation();
            draggingRef.current = true;
            triggerButtonHaptic(lowPowerMode);
            updateFromClientX(e.clientX);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            updateFromClientX(e.clientX);
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
            onResetDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onStepDelta(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onStepDelta(-1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              onResetDefault();
            }
          }}
          className={`cas-fader-slot relative w-full rounded-[2px] cursor-ew-resize touch-none flex flex-col justify-between px-2.5 py-[1.5px] ${
            compact ? 'h-[16px]' : 'h-[18px] sm:h-[22px]'
          }`}
        >
          {/* Top White Calibration Ticks Along Slot Edge */}
          <div aria-hidden="true" className="w-full flex items-center justify-between pointer-events-none">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => (
              <span
                key={`wt-${t}`}
                className={`w-[1px] ${t === 5 ? 'h-[3px] bg-white' : 'h-[2px] bg-white/80'}`}
              />
            ))}
          </div>

          {/* Center Dark Track Guide Rail */}
          <div className="w-full h-[2.5px] sm:h-[3px] bg-[#040506] border-y border-white/20" />

          {/* Bottom White Calibration Ticks Along Slot Edge */}
          <div aria-hidden="true" className="w-full flex items-center justify-between pointer-events-none">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => (
              <span
                key={`wb-${t}`}
                className={`w-[1px] ${t === 5 ? 'h-[3px] bg-white' : 'h-[2px] bg-white/80'}`}
              />
            ))}
          </div>

          {/* Enlarged Ribbed Brushed-Silver Rectangular Fader Knob */}
          <div
            style={{ left: `calc(${thumbLeftPercent}% - 13px)` }}
            className={`cas-fader-ribbed-knob pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-[2px] flex items-center justify-between px-[3px] ${
              compact ? 'w-[22px] h-[14px]' : 'w-[26px] sm:w-[28px] h-[15px] sm:h-[18px]'
            }`}
          >
            <span className="w-[1px] h-[75%] bg-[#3A3E42]" />
            <span className="w-[2px] h-[88%] bg-[#141516]" />
            <span className="w-[1px] h-[75%] bg-[#3A3E42]" />
          </div>
        </div>
      </div>
    );
  }
);

/**
 * Recessed Black-Face AM/FM Radio Tuner Window (Section 3.2)
 * - Outward-standing 3px polished silver chamfered frame + deep 4px angled dark-grey inner bezel
 * - Left & Right Inner Vent Grilles (width: 11% of tuner bay width, 1px silver border, 3 flat silver louver bars over black slots)
 * - Three crisp horizontal white calibration lines across matte-black dial glass (#18191B):
 *   - Top line: FM markers 88, 90, 92, 96, 100, 104, 108 (with FM and MHz micro-labels)
 *   - Middle band: fine vertical white tick marks and geometric logotype dashes
 *   - Bottom line: AM markers 530, 600, 700, 800, 1000, 1200, 1400, 1600 (with AM and kHz micro-labels)
 * - Crimson-red physical pointer needle (width: 2px, #E61919) at 101.5 MHz (or active seek progress)
 * - Strictly NO mechanical 0000 tape counter!
 */
const BoomboxTunerDialSeekStrip = React.memo<{
  trackId: string;
  durationSec: number;
  isStandby: boolean;
  lowPowerMode: boolean;
  compact?: boolean;
  onSeek: (targetSec: number) => void;
}>(({ trackId, durationSec, isStandby, lowPowerMode, compact = false, onSeek }) => {
  const currentSec = usePlaybackSecond();
  const safeDur = Math.max(1, durationSec || 1);
  const clampedCur = isStandby ? 0 : Math.min(safeDur, Math.max(0, currentSec));
  const progressRatio = isStandby ? 0 : Math.max(0, Math.min(1, clampedCur / safeDur));

  // Default to 101.5 MHz (67.5%) when at 0s / standby so the red needle rests authentically at 101.5 MHz
  const needleLeftPct =
    isStandby || clampedCur <= 0
      ? fmFrequencyToNeedlePercent(BOOMBOX_DEFAULT_TUNER_FM_MHZ)
      : progressRatio * 100;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dialDraggingRef = useRef<boolean>(false);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (isStandby || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 4) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(tunerDialRatioToSeekSec(ratio, safeDur));
    },
    [isStandby, safeDur, onSeek]
  );

  const renderInnerVentGrille = (side: 'left' | 'right') => (
    <div
      data-tuner-inner-grille={side}
      aria-hidden="true"
      className="w-[11%] min-w-[24px] max-w-[46px] h-full border border-[#C2C6CA] bg-[#101113] p-[2px] flex flex-col justify-evenly shrink-0"
    >
      <span className="w-full h-[2.5px] bg-gradient-to-b from-[#FFFFFF] via-[#D0D3D6] to-[#8C9094] rounded-[0.5px]" />
      <span className="w-full h-[2.5px] bg-gradient-to-b from-[#FFFFFF] via-[#D0D3D6] to-[#8C9094] rounded-[0.5px]" />
      <span className="w-full h-[2.5px] bg-gradient-to-b from-[#FFFFFF] via-[#D0D3D6] to-[#8C9094] rounded-[0.5px]" />
    </div>
  );

  return (
    <div
      id="top-seek-timeline"
      data-track-id={trackId}
      data-tuner-model="AM-FM-STEREO"
      className="cas-polished-chrome relative flex-1 min-w-0 rounded-[2px] p-[3px] flex items-center justify-center"
    >
      {/* Deep 4px Angled Dark-Grey Inner Bezel Surrounding Matte-Black Tuner Cavity (#18191B) */}
      <div
        className={`w-full rounded-[1px] border-[3px] border-[#3A3E42] bg-[#18191B] shadow-[inset_0_3px_6px_rgba(0,0,0,0.9)] flex items-stretch justify-between gap-1.5 px-1.5 py-1 ${
          compact ? 'h-[36px]' : 'h-[42px] sm:h-[48px]'
        }`}
      >
        {/* Far-Left Symmetrical Inner Vent Grille (11% width, 3 silver louver bars) */}
        {renderInnerVentGrille('left')}

        {/* Central Matte-Black Dial Glass with 3 Horizontal White Calibration Lines & Red Needle */}
        <div
          id="console-seek-slider"
          ref={trackRef}
          role="slider"
          tabIndex={isStandby ? -1 : 0}
          aria-label="AM FM Radio Tuner Dial Seek Slider"
          aria-valuemin={0}
          aria-valuemax={safeDur}
          aria-valuenow={Math.round(clampedCur)}
          title="Drag crimson-red tuner needle across FM/AM frequency scale to scrub playback"
          onPointerDown={(e) => {
            if (isStandby) return;
            e.stopPropagation();
            dialDraggingRef.current = true;
            triggerButtonHaptic(lowPowerMode);
            seekFromClientX(e.clientX);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          onPointerMove={(e) => {
            if (!dialDraggingRef.current) return;
            seekFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            if (!dialDraggingRef.current) return;
            dialDraggingRef.current = false;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          onPointerCancel={() => {
            dialDraggingRef.current = false;
          }}
          onKeyDown={(e) => {
            if (isStandby) return;
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              onSeek(Math.min(safeDur, clampedCur + 5));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onSeek(Math.max(0, clampedCur - 5));
            }
          }}
          className={`relative flex-1 min-w-0 h-full bg-[#18191B] flex flex-col justify-between px-1.5 py-[1px] overflow-hidden select-none touch-none ${
            isStandby ? 'cursor-default' : 'cursor-ew-resize'
          }`}
        >
          {/* Top FM Row: FM 88, 90, 92, 96, 100, 104, 108 MHz */}
          <div
            data-tuner-band="FM"
            className="w-full flex items-center justify-between text-[6.5px] sm:text-[7.5px] font-sans font-bold text-white leading-none pointer-events-none"
          >
            <span className="text-[6px] font-extrabold tracking-wider text-white/90 mr-1">FM</span>
            <div className="flex-1 flex items-center justify-between px-1">
              {BOOMBOX_FM_DIAL_MARKERS.map((freq) => (
                <span key={freq} className="tabular-nums">
                  {freq}
                </span>
              ))}
            </div>
            <span className="text-[5.5px] font-bold text-white/85 ml-1">MHz</span>
          </div>

          {/* Horizontal Calibration Line 1 */}
          <div aria-hidden="true" className="w-full h-[1px] bg-white/85 pointer-events-none" />

          {/* Middle Calibration Band: Fine Vertical White Tick Marks & Geometric Logotype Dashes */}
          <div
            aria-hidden="true"
            className="w-full flex items-center justify-between px-1 pointer-events-none"
          >
            {Array.from({ length: 21 }).map((_, idx) => (
              <span
                key={idx}
                className={
                  idx % 4 === 0
                    ? 'w-[3px] h-[2px] bg-white'
                    : 'w-[1px] h-[3px] bg-white/75'
                }
              />
            ))}
          </div>

          {/* Horizontal Calibration Line 2 */}
          <div aria-hidden="true" className="w-full h-[1px] bg-white/70 pointer-events-none" />

          {/* Horizontal Calibration Line 3 */}
          <div aria-hidden="true" className="w-full h-[1px] bg-white/85 pointer-events-none" />

          {/* Bottom AM Row: AM 530, 600, 700, 800, 1000, 1200, 1400, 1600 kHz */}
          <div
            data-tuner-band="AM"
            className="w-full flex items-center justify-between text-[6px] sm:text-[7px] font-sans font-bold text-white/95 leading-none pointer-events-none"
          >
            <span className="text-[5.5px] font-extrabold tracking-wider text-white/85 mr-1">AM</span>
            <div className="flex-1 flex items-center justify-between px-1">
              {BOOMBOX_AM_DIAL_MARKERS.map((freq) => (
                <span key={freq} className="tabular-nums">
                  {freq}
                </span>
              ))}
            </div>
            <span className="text-[5.5px] font-bold text-white/85 ml-1">kHz</span>
          </div>

          {/* Vibrant Crimson-Red Physical Pointer Needle (width: 2px, #E61919, positioned at 101.5 MHz default) */}
          <div
            id="cas-tuner-needle"
            data-needle-mhz={BOOMBOX_DEFAULT_TUNER_FM_MHZ}
            aria-hidden="true"
            style={{
              left: `calc(${needleLeftPct}% - 1px)`,
              backgroundColor: '#E61919',
              boxShadow: '2px 0 4px rgba(0, 0, 0, 0.85), 0 0 4px rgba(230, 25, 25, 0.55)',
            }}
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] z-10"
          />
        </div>

        {/* Far-Right Symmetrical Inner Vent Grille (11% width, 3 silver louver bars) */}
        {renderInnerVentGrille('right')}
      </div>
    </div>
  );
});

/**
 * Cassette White Hub With 6 Visible Inward Sprocket Teeth & 12-Degree Stage 4 Spindle Lock Snap
 */
const CassetteSprocketHub = React.memo<{
  id: string;
  durationSec: number;
  timingFunction: string;
  shouldSpin: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  pancakePct: number;
  hubSnapDeg: number;
  sizePx: number;
}>(
  ({
    id,
    durationSec,
    timingFunction,
    shouldSpin,
    isDocumentHidden,
    prefersReducedMotion,
    pancakePct,
    hubSnapDeg,
    sizePx,
  }) => {
    const running = Boolean(shouldSpin && !isDocumentHidden && !prefersReducedMotion);
    const pancakeDiameterPx = Math.max(
      sizePx * 1.15,
      Math.round((sizePx * 2.02 * pancakePct) / 100)
    );

    return (
      <div
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          transform: hubSnapDeg !== 0 ? `rotate(${hubSnapDeg}deg)` : undefined,
          transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="relative flex items-center justify-center shrink-0"
      >
        {/* Dynamic Magnetic Tape Spool Pack */}
        <div
          data-cassette-pancake-pct={pancakePct}
          style={{
            width: `${pancakeDiameterPx}px`,
            height: `${pancakeDiameterPx}px`,
            background:
              'repeating-radial-gradient(circle at center, #251B14 0px, #251B14 2px, #17110C 3px, #34261D 4.5px)',
          }}
          className="pointer-events-none absolute rounded-full border border-black/80 shadow-[inset_0_0_8px_rgba(0,0,0,0.9)]"
        />

        {/* Rotating White 6-Tooth Sprocket Hub */}
        <div
          id={id}
          data-spinning={running ? 'true' : 'false'}
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            animationDuration: `${durationSec}s`,
            animationTimingFunction: timingFunction,
            animationPlayState: running ? 'running' : 'paused',
          }}
          className="cas-hub-spin relative z-10 rounded-full flex items-center justify-center"
        >
          <svg viewBox="0 0 60 60" className="w-full h-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">
            <circle cx="30" cy="30" r="28" fill="#F6F7F9" stroke="#9EA3A8" strokeWidth="1.5" />
            <circle cx="30" cy="30" r="19" fill="#18191B" stroke="#CFD3D6" strokeWidth="1.5" />
            {/* 6 Visible Inward Sprocket Teeth + Realistic Square Tape-Leader Locking Notch */}
            <rect
              data-hub-square-notch="true"
              x="26.5"
              y="2.5"
              width="7"
              height="5"
              rx="0.6"
              fill="#3A3E42"
              stroke="#9EA3A8"
              strokeWidth="0.8"
            />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <rect
                key={deg}
                x="28"
                y="11"
                width="4"
                height="6.8"
                rx="0.8"
                fill="#FFFFFF"
                transform={`rotate(${deg} 30 30)`}
              />
            ))}
            <circle cx="30" cy="30" r="6" fill="#2A2C30" stroke="#787C82" strokeWidth="0.9" />
          </svg>
        </div>
      </div>
    );
  }
);

/**
 * Circular Woofer Speaker Assembly + Directly-Above Mirrored Dual Round Auxiliary Speakers
 * - Main circular woofer is lowered toward the bottom edge with explicit bottom padding (50px).
 * - Two circular upper auxiliary speakers are always mounted directly ABOVE the lowered main woofer
 *   on both Desktop and Mobile Portrait (outer larger aligned flush with outer woofer edge; inner 50% diameter).
 */
const BoomboxSpeakerGrille = React.memo<{
  side: 'left' | 'right';
  sizePx: number;
  bottomPaddingPx: number;
  isAnimating: boolean;
  pulseScale: number;
  dustCapScale: number;
  isMobilePortrait?: boolean;
  showUpperAuxSpeakers?: boolean;
}>(
  ({
    side,
    sizePx,
    bottomPaddingPx,
    isAnimating,
    pulseScale,
    dustCapScale,
    isMobilePortrait = false,
    showUpperAuxSpeakers = true,
  }) => (
    <div
      data-speaker-mounting-panel={side}
      data-corner-anchor={side === 'left' ? 'bottom-left' : 'bottom-right'}
      style={{ paddingBottom: `${bottomPaddingPx}px` }}
      className={`relative w-full h-full flex flex-col justify-end ${
        side === 'left' ? 'items-start' : 'items-end'
      } gap-1.5 shrink-0`}
    >
      {/* Mirrored Dual Round Upper Auxiliary Speakers Mounted Directly ABOVE Lowered Main Woofer */}
      {showUpperAuxSpeakers && (
        <MirroredDualRoundUpperSpeakers
          side={side}
          mainWooferSizePx={sizePx}
          isAnimating={isAnimating}
          dustCapScale={dustCapScale}
          isMobilePortrait={isMobilePortrait}
        />
      )}

      {/* Lowered Circular Woofer Mounting Frame */}
      <div
        className={`relative flex items-center justify-center ${
          isMobilePortrait ? 'p-0' : 'p-0.5'
        }`}
      >
        {/* Horizontal Panel Score Lines Extending Outward From Left & Right Bezel Edges */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-b from-[#686C70] to-[#F4F6F8] z-0"
        />

        {/* 4 Circular Recessed Corner Screw Wells (12px diameter) Outside Circular Speaker Bezel */}
        <BoomboxScrewHead
          type="phillips"
          sizePx={7.5}
          wellSizePx={12}
          angleDeg={25}
          className="absolute top-0.5 left-0.5 z-20"
        />
        <BoomboxScrewHead
          type="phillips"
          sizePx={7.5}
          wellSizePx={12}
          angleDeg={115}
          className="absolute top-0.5 right-0.5 z-20"
        />
        <BoomboxScrewHead
          type="phillips"
          sizePx={7.5}
          wellSizePx={12}
          angleDeg={205}
          className="absolute bottom-0.5 left-0.5 z-20"
        />
        <BoomboxScrewHead
          type="phillips"
          sizePx={7.5}
          wellSizePx={12}
          angleDeg={295}
          className="absolute bottom-0.5 right-0.5 z-20"
        />

        {/* Circular Woofer Bezel (Strict 1:1 Aspect Ratio, 14px Grooved Metallic Ring) */}
        <div
          id={`cas-speaker-${side}`}
          data-cas-speaker={side}
          data-speaker-placement="lowered-50px-pad"
          data-pulsing={isAnimating ? 'true' : 'false'}
          data-bass-scale={pulseScale.toFixed(3)}
          style={{
            width: `${sizePx}px`,
            height: `${sizePx}px`,
            borderRadius: '50%',
          }}
          className="cas-speaker-trim-ring relative z-10 rounded-full p-[11px] sm:p-[13px] flex items-center justify-center shrink-0"
        >
          {/* Deep Inner Shadow Lip Where Metal Ring Meets Black Mesh */}
          <div
            data-cas-speaker-gasket="true"
            className="cas-speaker-gasket relative w-full h-full rounded-full p-[2px] flex items-center justify-center overflow-hidden"
          >
            {/* Perforated Hexagonal Black Metal Mesh Grille */}
            <div className="cas-speaker-grille relative w-full h-full rounded-full flex items-center justify-center overflow-hidden">
              {/* Dark Ribbed Acoustic Woofer Cone (#1E2022) */}
              <div
                data-cas-woofer-cone={side}
                style={{
                  transform: `scale(${isAnimating ? pulseScale.toFixed(3) : '1'})`,
                  transition: isAnimating ? 'transform 70ms ease-out' : 'transform 160ms ease-out',
                }}
                className="w-[84%] h-[84%] rounded-full border-[3px] border-[#111214] bg-[radial-gradient(circle_at_center,#282B2E_0%,#1E2022_58%,#0D0E10_100%)] shadow-[inset_0_0_12px_rgba(0,0,0,0.95)] flex items-center justify-center"
              >
                {/* Concentric Ribbed Woofer Cone Rings */}
                <div className="w-[74%] h-[74%] rounded-full border border-white/10 flex items-center justify-center">
                  <div className="w-[72%] h-[72%] rounded-full border border-black/70 flex items-center justify-center">
                    {/* Convex Mirror-Chrome Center Dust Cap (diameter: 28% of speaker width, pulses 1.0 to 1.08) */}
                    <div
                      data-cas-dust-cap={side}
                      style={{
                        width: `${Math.round(sizePx * 0.28)}px`,
                        height: `${Math.round(sizePx * 0.28)}px`,
                        transform: `scale(${isAnimating ? dustCapScale.toFixed(3) : '1'})`,
                        transition: isAnimating ? 'transform 65ms ease-out' : 'transform 150ms ease-out',
                      }}
                      className="rounded-full bg-[radial-gradient(circle_at_32%_28%,#FFFFFF_0%,#DCE0E6_28%,#6E7278_62%,#18191B_95%)] border border-[#AEB2B8] shadow-[0_3px_8px_rgba(0,0,0,0.88),inset_0_1px_2px_#FFFFFF] shrink-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
);

export const CassetteDeck = React.memo<TurntableDeckProps>(
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
    const isMobilePortrait = viewportLayout === 'mobile-portrait';
    const isCompactLandscape = viewportLayout === 'mobile-landscape';
    const currentSecond = usePlaybackSecond();

    // Artwork resolution
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

    const activeSpinePalette = useCassetteSpinePalette(
      artworkState.isPlaceholder ? '' : artworkState.activeUrl,
      true
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
    }, [
      isStandby,
      track.id,
      track.title,
      track.artist,
      artworkState.isPlaceholder,
      onResolvedPerTrackArtwork,
    ]);

    // Top-Deck Knobs + 5-Band Graphic EQ + 5 Function Push-Switches
    const [bassLevel, setBassLevel] = useState<number>(0.65);
    const [trebleLevel, setTrebleLevel] = useState<number>(0.62);
    const [balanceLevel, setBalanceLevel] = useState<number>(0.5);
    const [eqBands, setEqBands] = useState<number[]>([0.74, 0.64, 0.52, 0.68, 0.78]);
    const [activeTopSwitchIdx, setActiveTopSwitchIdx] = useState<number>(0);
    const [isRecordingLatched, setIsRecordingLatched] = useState<boolean>(false);

    // Momentary piano-key feedback state
    const [activeMomentaryKey, setActiveMomentaryKey] = useState<
      'record' | 'rew' | 'ff' | 'stop' | 'eject' | null
    >(null);
    const momentaryTimerRef = useRef<number | null>(null);
    const flashMomentaryKey = useCallback(
      (key: 'record' | 'rew' | 'ff' | 'stop' | 'eject') => {
        setActiveMomentaryKey(key);
        if (momentaryTimerRef.current !== null) window.clearTimeout(momentaryTimerRef.current);
        momentaryTimerRef.current = window.setTimeout(() => {
          setActiveMomentaryKey(null);
          momentaryTimerRef.current = null;
        }, 180);
      },
      []
    );

    useEffect(() => {
      return () => {
        if (momentaryTimerRef.current !== null) window.clearTimeout(momentaryTimerRef.current);
      };
    }, []);

    // Measure Lower Acoustic/Cassette Stage Dimensions
    const topSurfaceRef = useRef<HTMLDivElement | null>(null);
    const mediaStageRef = useRef<HTMLDivElement | null>(null);
    const holderHomeSlotRef = useRef<HTMLDivElement | null>(null);
    const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
      width: isMobilePortrait ? 356 : 680,
      height: isMobilePortrait ? 340 : isCompactLandscape ? 165 : 265,
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

    // Strict Geometric Proportions & PART 3 Expanded Bay Geometry:
    // ~1.58:1 cassette ratio, full-width center cassette holder, and enlarged 2x corner speakers
    const baselineGeo = useMemo(
      () =>
        computeBoomboxProportionalGeometry(
          stageSize.width,
          stageSize.height,
          isMobilePortrait,
          isCompactLandscape
        ),
      [stageSize.width, stageSize.height, isMobilePortrait, isCompactLandscape]
    );

    const geo = useMemo(
      () =>
        computeExpandedBoomboxStageLayout(
          stageSize.width,
          stageSize.height,
          isMobilePortrait,
          isCompactLandscape
        ),
      [stageSize.width, stageSize.height, isMobilePortrait, isCompactLandscape]
    );

    const cassetteDims = useMemo(
      () => ({
        width: geo.cassetteTapeWidthPx,
        height: geo.cassetteTapeHeightPx,
      }),
      [geo.cassetteTapeWidthPx, geo.cassetteTapeHeightPx]
    );

    const cassetteBoxDims = useMemo(
      () =>
        computeCassetteBoxDimensions(
          Math.min(165, cassetteDims.width),
          Math.min(105, cassetteDims.height)
        ),
      [cassetteDims.width, cassetteDims.height]
    );

    // Draggable Norelco Sleeve Case State
    const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [holderTiltDeg, setHolderTiltDeg] = useState<number>(-1.8);
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
          : 10 + cassetteBoxDims.width / 2;
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
        boxSize: Math.min(cassetteBoxDims.width, cassetteBoxDims.height),
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

    // =========================================================================
    // 4-STAGE CHOREOGRAPHED CASSETTE EJECTION, VERTICAL LOADING & DOOR MECHANICS
    // (~1,350ms total on track change; standalone Eject leaves door open at -32deg)
    // =========================================================================
    const [trackChangePhase, setTrackChangePhase] = useState<CassetteTrackChangePhase>('idle');
    const prevTrackIdRef = useRef<string>(track.id);
    const ejectTimersRef = useRef<number[]>([]);

    const clearAllEjectTimers = useCallback(() => {
      for (const id of ejectTimersRef.current) {
        window.clearTimeout(id);
      }
      ejectTimersRef.current = [];
    }, []);

    useEffect(() => {
      return () => clearAllEjectTimers();
    }, [clearAllEjectTimers]);

    useEffect(() => {
      if (prevTrackIdRef.current === track.id) return;
      prevTrackIdRef.current = track.id;
      clearAllEjectTimers();

      if (isDocumentHidden || lowPowerMode || prefersReducedMotion || isStandby) {
        setTrackChangePhase('idle');
        return;
      }

      // Stage 1 (0ms – 250ms): Eject key press, head retraction (8px), door swing-open (-32deg)
      retroAudio.triggerCassetteLatchClick(true);
      retroAudio.triggerCassetteDoorSpringBoing();
      setTrackChangePhase('stage1-door-open');

      // Stage 2a (250ms – 380ms): Outgoing cassette initial spring pop (-18px)
      const t1 = window.setTimeout(() => {
        setTrackChangePhase('stage2-spring-pop');
      }, CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage1DoorOpenEndMs);

      // Stage 2b (380ms – 600ms): Outgoing cassette vertical extraction slide (-140%, opacity 0)
      const t2 = window.setTimeout(() => {
        setTrackChangePhase('stage2-extract-up');
      }, CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage2SpringPopEndMs);

      // Stage 3a (600ms – 950ms): Incoming cassette vertical slide-down into open door pocket
      const t3 = window.setTimeout(() => {
        setTrackChangePhase('stage3-insert-down');
      }, CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage2ExtractUpEndMs);

      // Stage 3b (950ms – 980ms): Bottom stopper micro-impact (2px settling bump)
      const t4 = window.setTimeout(() => {
        setTrackChangePhase('stage3-bottom-impact');
      }, CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage3InsertDownEndMs);

      // Stage 4 (980ms – 1,350ms): Door swing-close (0deg, 1px compression), 12deg hub snap & spindle lock
      const t5 = window.setTimeout(() => {
        retroAudio.triggerCassetteLatchClick(false);
        setTrackChangePhase('stage4-door-close');
      }, CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage3BottomImpactEndMs);

      const t6 = window.setTimeout(() => {
        setTrackChangePhase('idle');
      }, CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage4DoorCloseEndMs);

      ejectTimersRef.current = [t1, t2, t3, t4, t5, t6];
    }, [track.id, isDocumentHidden, lowPowerMode, prefersReducedMotion, isStandby, clearAllEjectTimers]);

    /**
     * Standalone Eject Toggle Behavior (Section 3 of Animation Spec):
     * Clicking Eject (⏏) manually without selecting a next song executes Stages 1 and 2
     * (door tilts open to rotateX(-32deg) and cassette slides straight upward out of the deck),
     * leaving the door resting in its open rotateX(-32deg) position revealing the empty dark
     * metallic tape well, visible drive spindles, and retracted silver head assembly until
     * the user selects a track or clicks the door/Play/Eject button to close it.
     */
    const handleStandaloneEjectToggle = useCallback(() => {
      clearAllEjectTimers();
      triggerButtonHaptic(lowPowerMode);

      if (trackChangePhase === 'ejected-empty') {
        // Reload cassette vertically & close door (Stages 3 and 4)
        retroAudio.triggerCassetteLatchClick(false);
        if (prefersReducedMotion || lowPowerMode) {
          setTrackChangePhase('idle');
          return;
        }
        setTrackChangePhase('stage3-insert-down');
        const t1 = window.setTimeout(() => {
          setTrackChangePhase('stage3-bottom-impact');
        }, 320);
        const t2 = window.setTimeout(() => {
          retroAudio.triggerCassetteLatchClick(false);
          setTrackChangePhase('stage4-door-close');
        }, 360);
        const t3 = window.setTimeout(() => {
          setTrackChangePhase('idle');
        }, 680);
        ejectTimersRef.current = [t1, t2, t3];
        return;
      }

      // Execute Stages 1 and 2 -> rest in 'ejected-empty'
      flashMomentaryKey('eject');
      if (isPlaying) {
        onStop();
      }
      retroAudio.triggerCassetteLatchClick(true);
      retroAudio.triggerCassetteDoorSpringBoing();

      if (prefersReducedMotion || lowPowerMode) {
        setTrackChangePhase('ejected-empty');
        return;
      }

      setTrackChangePhase('stage1-door-open');
      const t1 = window.setTimeout(() => {
        setTrackChangePhase('stage2-spring-pop');
      }, 250);
      const t2 = window.setTimeout(() => {
        setTrackChangePhase('stage2-extract-up');
      }, 380);
      const t3 = window.setTimeout(() => {
        setTrackChangePhase('ejected-empty');
      }, 650);
      ejectTimersRef.current = [t1, t2, t3];
    }, [
      clearAllEjectTimers,
      lowPowerMode,
      trackChangePhase,
      prefersReducedMotion,
      flashMomentaryKey,
      isPlaying,
      onStop,
    ]);

    const stagePose = useMemo(
      () => getCassetteTrackChangeStagePose(trackChangePhase),
      [trackChangePhase]
    );

    const progressRatio = useMemo(() => {
      if (isStandby || track.durationSec <= 0) return 0;
      if (!stagePose.showFreshTapeState) return 0;
      return Math.max(0, Math.min(1, currentSecond / track.durationSec));
    }, [isStandby, track.durationSec, currentSecond, stagePose.showFreshTapeState]);

    const pancakes = useMemo(
      () => calculateCassetteTapePancakes(progressRatio),
      [progressRatio]
    );
    const hubSpeeds = useMemo(
      () => calculateCassetteHubSpeeds(rpm, pitchPercent, lowPowerMode),
      [rpm, pitchPercent, lowPowerMode]
    );

    const isSwappingOrEjected =
      trackChangePhase !== 'idle' &&
      trackChangePhase !== 'stage4-door-close' &&
      trackChangePhase !== 'door-closing';
    const shouldSpin = Boolean(
      isPlaying &&
        !isStandby &&
        !isDocumentHidden &&
        !prefersReducedMotion &&
        !isSwappingOrEjected
    );
    const speakerCanPulse = Boolean(shouldSpin && !lowPowerMode);

    // Analog VU Meters (spring-damped; resting flat when paused/standby/hidden)
    const [vuLevels, setVuLevels] = useState<{
      left01: number;
      right01: number;
      leftSeg: number;
      rightSeg: number;
    }>({
      left01: 0,
      right01: 0,
      leftSeg: 0,
      rightSeg: 0,
    });
    const vuPhysicsRef = useRef<{ left: VuChannelPhysicsState; right: VuChannelPhysicsState }>({
      left: { level: 0.02, velocity: 0, peakHold: 0.02, peakVelocity: 0 },
      right: { level: 0.02, velocity: 0, peakHold: 0.02, peakVelocity: 0 },
    });

    useEffect(() => {
      const canDisplayMeters = Boolean(
        isPlaying && !isStandby && !isDocumentHidden && !isSwappingOrEjected
      );

      if (!canDisplayMeters) {
        vuPhysicsRef.current = {
          left: { level: 0.02, velocity: 0, peakHold: 0.02, peakVelocity: 0 },
          right: { level: 0.02, velocity: 0, peakHold: 0.02, peakVelocity: 0 },
        };
        setVuLevels({ left01: 0, right01: 0, leftSeg: 0, rightSeg: 0 });
        return;
      }

      const beatHz = Math.max(1.2, Math.min(3.2, (track.bpm || 116) / 60));
      const intervalMs = lowPowerMode || prefersReducedMotion ? 220 : 85;
      let lastTick = performance.now();

      const updateMeters = () => {
        if (document.visibilityState === 'hidden') return;
        const now = performance.now();
        const dtSec = Math.min(0.08, Math.max(0.02, (now - lastTick) / 1000));
        lastTick = now;

        const audioRaw = retroAudio.getVuLevels();
        let targetLeft = audioRaw.left;
        let targetRight = audioRaw.right;

        if (targetLeft <= 0.1 && targetRight <= 0.1) {
          const t = now * 0.001;
          const volScale = Math.max(0.35, Math.min(1, Number.isFinite(volume) ? volume : 0.8));
          const beatL = Math.abs(Math.sin(t * Math.PI * beatHz));
          const beatR = Math.abs(Math.cos(t * Math.PI * beatHz * 1.17 + 0.4));
          const groove = 0.5 + 0.5 * Math.sin(t * 2.1);
          targetLeft = Math.min(0.95, (0.34 + beatL * 0.44 + groove * 0.16) * volScale);
          targetRight = Math.min(0.95, (0.32 + beatR * 0.46 + (1 - groove) * 0.15) * volScale);
        }

        const nextL = stepVuMeterPhysics(vuPhysicsRef.current.left, targetLeft, dtSec);
        const nextR = stepVuMeterPhysics(vuPhysicsRef.current.right, targetRight, dtSec);
        vuPhysicsRef.current = { left: nextL, right: nextR };
        setVuLevels({
          left01: nextL.level,
          right01: nextR.level,
          leftSeg: levelTo12SegmentCount(nextL.level, true),
          rightSeg: levelTo12SegmentCount(nextR.level, true),
        });
      };

      updateMeters();
      const timerId = window.setInterval(updateMeters, intervalMs);
      return () => window.clearInterval(timerId);
    }, [
      isPlaying,
      isStandby,
      isDocumentHidden,
      isSwappingOrEjected,
      prefersReducedMotion,
      lowPowerMode,
      track.bpm,
      volume,
    ]);

    const bassPulseMetrics = useMemo(
      () =>
        computeBassSpeakerPulseScale(
          vuLevels.left01,
          vuLevels.right01,
          bassLevel,
          eqBands[0] ?? 0.74,
          eqBands[1] ?? 0.64,
          speakerCanPulse
        ),
      [vuLevels.left01, vuLevels.right01, bassLevel, eqBands, speakerCanPulse]
    );

    const eqBandPeaks = useMemo(
      () =>
        computeEqBandPeakLevels(
          vuLevels.left01,
          vuLevels.right01,
          eqBands,
          currentSecond,
          Boolean(isPlaying && !isStandby && !isDocumentHidden && !isSwappingOrEjected)
        ),
      [
        vuLevels.left01,
        vuLevels.right01,
        eqBands,
        currentSecond,
        isPlaying,
        isStandby,
        isDocumentHidden,
        isSwappingOrEjected,
      ]
    );

    const redPeakDotCount = useMemo(
      () =>
        levelTo4RedPeakDots(
          Math.max(vuLevels.left01, vuLevels.right01),
          Boolean(isPlaying && !isStandby && !isDocumentHidden && !isSwappingOrEjected)
        ),
      [vuLevels.left01, vuLevels.right01, isPlaying, isStandby, isDocumentHidden, isSwappingOrEjected]
    );

    const handleTriggerRecordTapeChew = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      flashMomentaryKey('record');
      setIsRecordingLatched((prev) => !prev);
      onScratch('classic');
    }, [lowPowerMode, flashMomentaryKey, onScratch]);

    const handleStopClick = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      flashMomentaryKey('stop');
      setIsRecordingLatched(false);
      retroAudio.triggerCassetteStopCue();
      onStop();
    }, [lowPowerMode, flashMomentaryKey, onStop]);

    const handlePlayKeyClick = useCallback(() => {
      triggerButtonHaptic(lowPowerMode);
      if (trackChangePhase === 'ejected-empty') {
        // Close door & engage Play
        clearAllEjectTimers();
        retroAudio.triggerCassetteLatchClick(false);
        setTrackChangePhase('stage4-door-close');
        const t = window.setTimeout(() => {
          setTrackChangePhase('idle');
          if (!isPlaying && !isStandby) {
            onTogglePlay();
          }
        }, 260);
        ejectTimersRef.current = [t];
        return;
      }
      retroAudio.triggerCassetteLatchClick(isPlaying);
      onTogglePlay();
    }, [lowPowerMode, trackChangePhase, clearAllEjectTimers, isPlaying, isStandby, onTogglePlay]);

    const keyStates = useMemo(
      () =>
        resolveCassetteTransportKeyStates({
          isPlaying,
          isStandby,
          currentSecond,
          trackChangePhase,
          isRecordingLatched,
          activeMomentaryKey,
        }),
      [isPlaying, isStandby, currentSecond, trackChangePhase, isRecordingLatched, activeMomentaryKey]
    );

    const clampedVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
    const volumePctInt = Math.round(clampedVolume * 100);
    const pitchThumbLeftPct = calculatePitchThumbLeftPercent(pitchPercent);
    const volumeThumbLeftPct = calculateVolumeThumbLeftPercent(clampedVolume);
    const safeDur = Math.max(1, track.durationSec || 1);
    const clampedCur = isStandby ? 0 : Math.min(safeDur, Math.max(0, currentSecond));
    const fineTuneRatio = isStandby ? 0.675 : Math.max(0, Math.min(1, clampedCur / safeDur));

    const renderTrackArtwork = (imgId: string, attachRef = false) => (
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
            className="w-full h-full bg-[#E6E8EA] flex flex-col items-center justify-center p-1 text-center select-none pointer-events-none"
          >
            <Disc3 className="w-4 h-4 text-[#141516]/65 shrink-0" />
          </div>
        )}
      </>
    );

    const sprocketSizePx = Math.max(16, Math.round(cassetteDims.height * 0.25));
    const useCompactControls = isCompactLandscape || isMobilePortrait;

    // Reusable Central Playback HUD Bar: [ Left VU (L) ] — [ Time (MM:SS) + Shuffle/Repeat ] — [ Right VU (R) ]
    const renderCentralPlaybackHudBar = () => (
      <div
        id="cas-central-hud-bar"
        data-testid="cas-central-hud-bar"
        className="cas-panel-break relative z-20 w-full rounded-[2px] px-1.5 py-1 flex items-center justify-between gap-1 shrink-0"
      >
        <div
          id="cassette-led-meters"
          data-vu-left={vuLevels.leftSeg}
          data-vu-right={vuLevels.rightSeg}
          data-vu-backlight="silver-black"
          className="w-full flex items-center justify-between gap-1"
        >
          {/* Left Channel VU Meter (L) */}
          <SingleRecessedVuMeter
            channel="L"
            meterId="cas-led-meter-left"
            needleId="cas-vu-needle-left"
            level01={vuLevels.left01}
            segCount={vuLevels.leftSeg}
            compact={useCompactControls}
          />

          {/* Dead-Center Track Time Display (MM:SS) Stacked Above Tactile Metallic Shuffle & Repeat Micro-Buttons */}
          <div
            id="cas-time-and-mode-stack"
            className="flex-1 min-w-[76px] max-w-[126px] flex flex-col items-stretch justify-between gap-[2px]"
          >
            <div
              id="console-time-display"
              aria-label="Track Time Display"
              className="w-full h-[16px] sm:h-[18px] rounded-[1px] border border-[#45484E] bg-[#E6E8EA] px-1.5 flex items-center justify-center shadow-inner"
            >
              <span
                id="cas-track-time-readout"
                className="cas-technical-num text-[8.5px] sm:text-[9.5px] font-extrabold text-[#141516] tabular-nums leading-none tracking-tight"
              >
                {formatDuration(clampedCur)} / {formatDuration(isStandby ? 0 : safeDur)}
              </span>
            </div>

            <div id="shuffle-repeat-stack" className="w-full flex items-center gap-1">
              <BoomboxHudMicroButton
                id="toggle-shuffle"
                label="SHF"
                isOn={shuffleEnabled}
                disabled={isStandby}
                ariaLabel="Toggle Shuffle"
                title={`Shuffle: ${shuffleEnabled ? 'ON' : 'OFF'}`}
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  retroAudio.triggerCassetteLatchClick(!shuffleEnabled);
                  onToggleShuffle();
                }}
              />
              <BoomboxHudMicroButton
                id="toggle-repeat"
                label="RPT"
                isOn={repeatOne}
                disabled={isStandby}
                ariaLabel="Toggle Repeat Current Song"
                title={`Repeat One: ${repeatOne ? 'ON' : 'OFF'}`}
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  retroAudio.triggerCassetteLatchClick(!repeatOne);
                  onToggleRepeatOne();
                }}
              />
            </div>
          </div>

          {/* Right Channel VU Meter (R) */}
          <SingleRecessedVuMeter
            channel="R"
            meterId="cas-led-meter-right"
            needleId="cas-vu-needle-right"
            level01={vuLevels.right01}
            segCount={vuLevels.rightSeg}
            compact={useCompactControls}
          />
        </div>
      </div>
    );

    // Section 2.3 & Part 4.1: Taller Center-Locked 5-Band Analogue Graphic Equalizer Flanked Symmetrically by Left & Right Square Piezo Tweeters
    const renderGraphicEqualizerModule = (isCenterColumnLocked: boolean) => (
      <div
        id="cas-graphic-eq-row"
        data-eq-flanking-tweeters="true"
        style={
          isCenterColumnLocked
            ? { width: `${geo.cassetteDoorWidthPx + geo.auxPanelWidthPx * 2 + 8}px`, maxWidth: '100%' }
            : { marginTop: '4px' }
        }
        className="w-full flex items-center justify-center gap-1.5 shrink-0"
      >
        <SquarePiezoTweeterBay side="left" compact={true} />
        <div
          id="cas-graphic-eq"
          data-testid="cas-graphic-eq"
          aria-label="5-Band Analogue Graphic Equalizer"
          data-peak-meter-palette="black-on-silver"
          data-eq-placement={isCenterColumnLocked ? 'center-above-cassette' : 'mobile-fascia'}
          className={`cas-panel-break flex-1 min-w-0 rounded-[2px] px-1.5 py-1 flex items-center justify-between gap-1 shrink-0 ${
            isCenterColumnLocked
              ? isCompactLandscape
                ? 'h-[42px]'
                : 'h-[48px] sm:h-[52px]'
              : 'h-[40px]'
          }`}
        >
          {/* Left EQ Legend & +12dB to -12dB Scale */}
          <div className="flex flex-col items-start justify-between h-full py-[1px] shrink-0 border-r border-[#707478] pr-1">
            <span className="cas-condensed-label text-[6px] sm:text-[6.5px] font-black text-[#141516] tracking-wider block leading-none">
              5-BAND EQ
            </span>
            <div className="flex flex-col items-end justify-between flex-1 py-[1px] text-[4.5px] sm:text-[5px] font-mono font-extrabold text-[#141516] leading-none">
              {CASSETTE_EQ_DB_TICKS.map((tickLabel) => (
                <span key={tickLabel}>{tickLabel}</span>
              ))}
            </div>
          </div>

          {/* 5 Vertical Fader Tracks (60Hz, 250Hz, 1kHz, 4kHz, 12kHz) with Taller Throw & Larger Machined-Silver Caps */}
          <div className="flex-1 h-full flex items-center justify-around gap-0.5">
            {CASSETTE_5BAND_EQ_SPECS.map((spec, bandIdx) => {
              const level = eqBands[bandIdx] ?? 0.5;
              const peak01 = eqBandPeaks[bandIdx] ?? 0;
              const thumbTopPct = Math.round((1 - level) * 100);
              const dbVal = Math.round((level - 0.5) * 24);
              return (
                <button
                  key={spec.id}
                  id={`cas-eq-band-${spec.id}`}
                  data-eq-band-slider={spec.id}
                  type="button"
                  role="slider"
                  aria-label={`${spec.roleLabel} (${spec.freqLabel}) Equalizer Band`}
                  aria-valuemin={-12}
                  aria-valuemax={12}
                  aria-valuenow={dbVal}
                  title={`${spec.freqLabel} (${spec.roleLabel}): ${dbVal >= 0 ? '+' : ''}${dbVal} dB`}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    setEqBands((prev) =>
                      prev.map((v, i) =>
                        i === bandIdx ? (v > 0.78 ? 0.25 : Number((v + 0.18).toFixed(2))) : v
                      )
                    );
                  }}
                  className="flex-1 h-full flex flex-col items-center justify-between py-[1px] cursor-pointer min-w-0"
                >
                  <div className="flex items-center gap-[2px] flex-1 min-h-0 w-full justify-center py-[1px]">
                    {/* Vertical Recessed Dark Fader Slot with Tick Marks & Larger Machined-Silver Slider Cap */}
                    <div className="cas-fader-slot relative w-[8px] sm:w-[9px] h-full rounded-[1.5px] flex items-center justify-center">
                      {/* Left/Right dB Calibration Tick Marks Along Vertical Slot */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-[2px] inset-x-[1px] flex flex-col justify-between"
                      >
                        {[0, 1, 2, 3, 4].map((tIdx) => (
                          <span
                            key={tIdx}
                            className={`w-full h-[1px] ${
                              tIdx === 2 ? 'bg-white/90' : 'bg-white/45'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="w-[2px] h-[88%] bg-[#050607] z-[1]" />
                      <span
                        style={{ top: `calc(${thumbTopPct}% - 4px)` }}
                        className="cas-fader-ribbed-knob absolute left-1/2 -translate-x-1/2 w-[11px] sm:w-[12px] h-[7px] rounded-[1.5px] flex items-center justify-center z-[2]"
                      >
                        <span className="w-[8px] h-[1.5px] bg-[#141516]" />
                      </span>
                    </div>

                    {/* Black-on-Silver Peak Indicator Column (+12dB / 0dB / -12dB) */}
                    <div
                      data-eq-peak-level={peak01.toFixed(2)}
                      data-eq-peak-color="black-on-silver"
                      className="relative w-[4px] h-full rounded-[1px] bg-[#E6E8EA] border border-[#5A5E62] overflow-hidden flex flex-col justify-end"
                    >
                      <div
                        style={{
                          height: `${Math.round(peak01 * 100)}%`,
                          backgroundColor: '#141516',
                          transition: 'height 80ms linear',
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Bottom Frequency & dB Readout */}
                  <span className="cas-condensed-label text-[5px] sm:text-[5.5px] font-extrabold text-[#141516] leading-none pt-[1px]">
                    {spec.freqLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <SquarePiezoTweeterBay side="right" compact={true} />
      </div>
    );

    // Reusable Central Cassette Bay with Finger-Pull Lip, Flanking Left/Right Auxiliary Sub-Panels,
    // 8px Stepped Door Bezel, Z-Index 10/20/30 Layering, and Hyper-Accurate Inner Deck & 5-Screw Cassette Shell (Section 2.4)
    const renderCentralCassetteBayAssembly = () => (
      <div
        id="cas-central-cassette-assembly"
        className="relative z-20 w-full flex flex-col items-center justify-center shrink-0"
      >
        {/* Protruding Horizontal Brushed-Silver Finger-Pull Overhang Bar with Center Grip Indentation */}
        <div
          id="cas-finger-pull-overhang"
          style={{ width: `${geo.cassetteDoorWidthPx + geo.auxPanelWidthPx * 2 + 8}px`, maxWidth: '100%' }}
          className="h-[8px] rounded-t-[2px] bg-gradient-to-b from-[#FFFFFF] via-[#D0D3D6] to-[#8C9094] border-x border-t border-[#5A5E62] shadow-[0_2px_4px_rgba(0,0,0,0.45)] flex items-center justify-center shrink-0 z-30"
        >
          <span className="w-[38%] h-[4px] rounded-[1px] bg-[#686C70] border border-[#45484E] shadow-inner" />
        </div>

        {/* Horizontal Row: [Left Aux Sub-Panel] + [Full-Width Stepped 8px Cassette Door Frame] + [Right Aux Sub-Panel] */}
        <div className="relative w-full flex items-stretch justify-center gap-1 max-w-full">
          {/* LEFT AUXILIARY SUB-PANEL (Badge w/ 3 Silver + 1 Red Stripe | 3 Stamped Vent Slots | 4px Mic Pinhole) */}
          <div
            id="cas-aux-subpanel-left"
            data-testid="cas-aux-subpanel-left"
            aria-hidden="true"
            style={{ width: `${geo.auxPanelWidthPx}px`, height: `${geo.cassetteDoorHeightPx}px` }}
            className="cas-brushed-steel rounded-l-[2px] px-[3px] py-1.5 flex flex-col items-center justify-between shrink-0"
          >
            {/* Top: Recessed Black Rectangular Emblem Badge (3 Horizontal Silver Stripes Above 1 Bright Red Stripe) */}
            <div className="w-full h-[16px] rounded-[1px] bg-[#18191B] border border-[#565A62] p-[2px] flex flex-col justify-between shadow-inner">
              <span className="w-full h-[1.5px] bg-[#E6E8EA]" />
              <span className="w-full h-[1.5px] bg-[#E6E8EA]" />
              <span className="w-full h-[1.5px] bg-[#E6E8EA]" />
              <span className="w-full h-[2px] bg-[#E61919]" />
            </div>

            {/* Middle: Three Narrow Horizontal Stamped Ventilation Slots Cut Into Silver Metal */}
            <div className="w-full flex flex-col gap-[2.5px] my-auto">
              <span className="w-full h-[2px] rounded-[0.5px] bg-[#18191B] shadow-[0_1px_0_rgba(255,255,255,0.85)]" />
              <span className="w-full h-[2px] rounded-[0.5px] bg-[#18191B] shadow-[0_1px_0_rgba(255,255,255,0.85)]" />
              <span className="w-full h-[2px] rounded-[0.5px] bg-[#18191B] shadow-[0_1px_0_rgba(255,255,255,0.85)]" />
            </div>

            {/* Bottom: Tiny Recessed Circular Pinhole (diameter: 4px) Representing Built-In Condenser Microphone */}
            <div className="flex flex-col items-center gap-[1px]">
              <span
                data-condenser-mic="true"
                className="w-[4px] h-[4px] rounded-full bg-[#090A0B] border border-[#565A62] shadow-inner"
              />
              <span className="cas-condensed-label text-[4.5px] font-bold text-[#141516] leading-none">
                MIC
              </span>
            </div>
          </div>

          {/* CENTER STEPPED METALLIC SILVER-AND-CHARCOAL CASSETTE DOOR BEZEL
              Strict +10px interior clearance around #oversized-cassette-shell on all 4 sides */}
          <div
            id="cassette-compartment-well"
            data-cassette-aspect={geo.cassetteAspectRatio}
            data-cassette-margin-px={geo.cassetteMarginAllSidesPx}
            style={{
              boxSizing: 'content-box',
              width: `${cassetteDims.width + geo.cassetteMarginAllSidesPx * 2}px`,
              height: `${cassetteDims.height + geo.cassetteMarginAllSidesPx * 2}px`,
            }}
            className="relative rounded-[2px] border-[6px] sm:border-[8px] border-[#B8BCC0] bg-[#18191B] shadow-[inset_0_3px_8px_rgba(0,0,0,0.92),0_0_0_1px_#5A5E62,2px_6px_8px_rgba(0,0,0,0.45)] flex items-center justify-center overflow-visible shrink-0"
          >
            {/* Z-INDEX 10: HYPER-ACCURATE DARK BRUSHED-GUNMETAL RECESSED INNER DECK BACKPLATE (Section 2.4)
                Dual rotating 6-spline drive spindles with metal hub shafts, illuminated rear tape-pack viewing window slot,
                guide rollers, and visible bottom magnetic read/write head block with brass/copper azimuth adjustment screws & rubber pinch roller */}
            <div
              id="cas-rear-tape-well"
              data-backplate-finish="brushed-gunmetal"
              style={{ zIndex: stagePose.wellZIndex }}
              className="pointer-events-none absolute inset-0 rounded-[1px] bg-[linear-gradient(180deg,#1B1E23_0%,#121418_52%,#0B0C0E_100%)] shadow-[inset_0_4px_10px_rgba(0,0,0,0.95)] flex flex-col justify-between p-1.5 overflow-hidden"
            >
              {/* Top Corner Guide Rollers & Illuminated Rear Tape-Pack Viewing Window Slot */}
              <div className="w-full flex items-center justify-between px-1.5 pt-0.5">
                <span
                  data-guide-roller="left"
                  className="w-[7px] h-[7px] rounded-full bg-[#2A2D32] border border-[#8C9094] flex items-center justify-center"
                >
                  <span className="w-[2.5px] h-[2.5px] rounded-full bg-[#E6E8EA]" />
                </span>
                <div
                  data-rear-viewing-slot="true"
                  className="w-[56%] h-[6px] rounded-[1px] bg-gradient-to-r from-[#23272E] via-[#4A525D] to-[#23272E] border border-[#565A62] shadow-[inset_0_1px_2px_rgba(0,0,0,0.85),0_0_4px_rgba(230,232,234,0.2)] flex items-center justify-center"
                >
                  <span className="w-[75%] h-[1.5px] bg-[#E6E8EA]/55 rounded-full" />
                </div>
                <span
                  data-guide-roller="right"
                  className="w-[7px] h-[7px] rounded-full bg-[#2A2D32] border border-[#8C9094] flex items-center justify-center"
                >
                  <span className="w-[2.5px] h-[2.5px] rounded-full bg-[#E6E8EA]" />
                </span>
              </div>

              {/* Dual Rotating 6-Spline Drive Spindles with Metal Hub Shafts */}
              <div className="my-auto w-full flex items-center justify-around px-2.5 opacity-85">
                {['left', 'right'].map((spindleSide) => (
                  <div
                    key={spindleSide}
                    data-spindle-side={spindleSide}
                    data-spindle-splines="6"
                    className="relative w-[20px] h-[20px] rounded-full border border-[#787C82] bg-[#0B0C0E] flex items-center justify-center shadow-inner"
                  >
                    {[0, 60, 120].map((deg) => (
                      <span
                        key={deg}
                        style={{ transform: `rotate(${deg}deg)` }}
                        className="absolute w-[15px] h-[2px] bg-[#9EA3A8] rounded-[0.5px]"
                      />
                    ))}
                    <span className="relative z-10 w-[7px] h-[7px] rounded-full bg-gradient-to-b from-[#FFFFFF] to-[#8C9094] border border-[#23262A]" />
                  </div>
                ))}
              </div>

              {/* Bottom Magnetic Read/Write Head Block with Brass/Copper Azimuth Adjustment Screws & Rubber Pinch Roller */}
              <div
                id="cas-tape-head-assembly"
                data-head-retract-y={stagePose.headRetractY}
                data-azimuth-screws="brass-copper"
                style={{
                  transform: `translateY(${stagePose.headRetractY}px)`,
                  transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className="mx-auto w-[74%] h-[10px] rounded-t-[2px] bg-gradient-to-b from-[#D0D3D6] via-[#8C9094] to-[#565A62] border border-[#3A3E42] flex items-center justify-between px-1.5 shadow-[0_-1px_3px_rgba(0,0,0,0.75)]"
              >
                {/* Left Brass/Copper Azimuth Adjustment Screw + Tape Guide */}
                <div className="flex items-center gap-[2px]">
                  <span
                    data-azimuth-screw="left"
                    className="w-[4px] h-[4px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#FFE082_0%,#D99B26_55%,#8C5811_100%)] border border-black/70"
                  />
                  <span className="w-[2.5px] h-[5px] bg-[#F4F6F8]" />
                </div>

                {/* Center Polished Permalloy Magnetic Read/Write Head with Brass Azimuth Screw */}
                <div className="flex items-center gap-[2px]">
                  <span className="w-[15px] h-[6.5px] rounded-t-[1px] bg-gradient-to-b from-[#FFFFFF] via-[#CFD3D6] to-[#787C82] border border-[#23262A] flex items-center justify-center">
                    <span className="w-[2px] h-full bg-[#18191B]" />
                  </span>
                  <span
                    data-azimuth-screw="right"
                    className="w-[4px] h-[4px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#FFCC80_0%,#C87D32_55%,#7A4414_100%)] border border-black/70"
                  />
                </div>

                {/* Right Black Rubber Pinch Roller & Steel Capstan Shaft */}
                <span
                  data-pinch-roller="true"
                  className="w-[7px] h-[7px] rounded-full bg-[#101113] border border-[#787C82] flex items-center justify-center"
                >
                  <span className="w-[2.5px] h-[2.5px] rounded-full bg-[#D0D3D6]" />
                </span>
              </div>
            </div>

            {/* Z-INDEX 20: TRANSLUCENT SMOKED-BROWN CHF90 CASSETTE SHELL
                Warm translucent smoked-brown polycarbonate with waffle grid perimeter, 5 recessed matte-black screws,
                internal corner tape-guide rollers, visible right tape spool, and 3-zone cream/orange CHF90 label */}
            <div
              id="oversized-cassette-shell"
              data-cassette-shell-style="translucent-smoked-brown-chf90"
              data-cassette-screw-count="5"
              data-ultrasonic-weld="true"
              style={{
                width: `${cassetteDims.width}px`,
                height: `${cassetteDims.height}px`,
                zIndex: stagePose.cassetteZIndex,
                transform: stagePose.cassetteTransform,
                opacity: stagePose.cassetteOpacity,
                transition:
                  isDocumentHidden || lowPowerMode || prefersReducedMotion
                    ? 'none'
                    : `transform 260ms ${stagePose.cassetteEasing}, opacity 210ms linear`,
              }}
              className="cas-smoked-acrylic-shell relative rounded-[4px] border border-[#8E7054]/80 flex flex-col justify-between p-[3px] sm:p-1 overflow-hidden"
            >
              {/* Precision Ultrasonic Weld Seam & Acrylic Edge Refraction Rim */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[2px] rounded-[2.5px] border border-[#FFEAD6]/20 z-[5]"
              />

              {/* Top Left & Right Translucent Write-Protect / Alignment Notch Cutouts */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-[14%] w-[9px] h-[3.5px] rounded-b-[1.5px] bg-[#0B0C0E]/85 border-x border-b border-[#A68466]/45 z-20"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-[14%] w-[9px] h-[3.5px] rounded-b-[1.5px] bg-[#0B0C0E]/85 border-x border-b border-[#A68466]/45 z-20"
              />

              {/* Lower Perimeter Molded Cross-Hatched Waffle Grid Visible Inside Smoked Shell */}
              <div
                aria-hidden="true"
                className="cas-chf-waffle-grid pointer-events-none absolute inset-x-[3px] bottom-[3px] h-[24%] rounded-b-[2.5px] opacity-85 z-[1]"
              />

              {/* Visible Dark Circular Magnetic Tape Spool in Lower-Right Translucent Corner */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-[8%] bottom-[16%] w-[28%] aspect-square rounded-full bg-[radial-gradient(circle,#1F140E_0%,#120B08_68%,transparent_74%)] opacity-80 z-[2]"
              />

              {/* Visible Inner Corner Translucent Tape-Guide Rollers (Bottom-Left & Bottom-Right) */}
              <span
                aria-hidden="true"
                data-chf-roller="left"
                className="pointer-events-none absolute left-[10px] bottom-[8px] w-[7px] h-[7px] rounded-full bg-[#D8C6B4]/35 border border-[#FFEAD6]/50 shadow-inner z-[6]"
              />
              <span
                aria-hidden="true"
                data-chf-roller="right"
                className="pointer-events-none absolute right-[10px] bottom-[8px] w-[7px] h-[7px] rounded-full bg-[#D8C6B4]/35 border border-[#FFEAD6]/50 shadow-inner z-[6]"
              />

              {/* 4 Recessed Matte-Black Corner Phillips Screws Seated Inside Molded Circular Bosses */}
              {[
                { key: 'tl', pos: 'top-[2px] left-[2px]' },
                { key: 'tr', pos: 'top-[2px] right-[2px]' },
                { key: 'bl', pos: 'bottom-[2px] left-[2px]' },
                { key: 'br', pos: 'bottom-[2px] right-[2px]' },
              ].map((screw) => (
                <span
                  key={screw.key}
                  data-cassette-screw={screw.key}
                  className={`pointer-events-none absolute ${screw.pos} w-[6.5px] h-[6.5px] rounded-full bg-[#3A2B1E]/90 border border-[#FFEAD6]/25 flex items-center justify-center z-30`}
                >
                  <span className="w-[4px] h-[4px] rounded-full bg-[#141414] border border-black flex items-center justify-center">
                    <span className="w-[2.5px] h-[0.6px] bg-[#4A4C50] rotate-45" />
                  </span>
                </span>
              ))}

              {/* CLASSIC THREE-ZONE MATTE CREAM & BRIGHT ORANGE CHF90 PAPER LABEL */}
              <div
                id="vinyl-center-label-art"
                data-testid="vinyl-center-label-art"
                className="relative z-10 mx-auto w-[92%] flex-1 min-h-0 mt-[2px] mb-[1px] rounded-[2px] border border-[#D4CFC2] bg-[#ECECE6] overflow-hidden flex flex-col justify-between shadow-sm"
              >
                {/* ZONE 1: Upper Cream Ruled Writing Area (INDEX + Horizontal Guide Lines + Handwritten Track Title) */}
                <div className="relative w-full h-[35%] min-h-[16px] px-1.5 pt-[1.5px] pb-[1px] flex flex-col justify-between overflow-hidden bg-[#ECECE6]">
                  {/* Thin Horizontal Ruled Guide Lines */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1.5 bottom-[6px] h-[0.6px] bg-[#1A1A1A]/30"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1.5 bottom-[2px] h-[0.6px] bg-[#1A1A1A]/30"
                  />
                  <div className="relative z-10 flex items-center justify-between gap-1">
                    <span className="font-sans text-[5px] sm:text-[5.5px] font-bold tracking-[0.14em] uppercase text-[#1A1A1A] leading-none">
                      INDEX
                    </span>
                    <span
                      id="cassette-label-handwritten-artist"
                      className="font-sans text-[4.5px] sm:text-[5px] font-medium uppercase tracking-wider text-[#4A4A45] truncate leading-none"
                    >
                      {isStandby ? 'LOW NOISE HIGH OUTPUT' : track.artist}
                    </span>
                  </div>
                  <p
                    id="cassette-label-handwritten-title"
                    style={{
                      fontFamily: "'Permanent Marker', 'Caveat', 'Kalam', cursive",
                      color: '#161618',
                      transform: 'rotate(-0.5deg)',
                    }}
                    className="cas-handwritten relative z-10 font-normal text-[7.5px] sm:text-[8.5px] leading-none truncate pl-2"
                  >
                    {isStandby ? 'CHF 90 MIXTAPE' : track.title}
                  </p>
                </div>

                {/* ZONE 2: Center Vibrant Orange Band (#F25C05) + Side 'A' + Recessed Matte-Black Window */}
                <div
                  style={{ backgroundColor: '#F25C05' }}
                  className="relative w-full flex-1 min-h-[22px] px-1.5 py-[2px] flex items-center justify-between gap-1"
                >
                  {/* Side 'A' Bold Black Mark on Left Edge of Orange Band */}
                  <span className="font-sans font-black text-[9px] sm:text-[10.5px] text-[#1A1A1A] leading-none shrink-0 pl-0.5">
                    A
                  </span>

                  {/* Wide Recessed Matte-Black Viewing Window Frame (#141414) */}
                  <div
                    style={{ backgroundColor: '#141414' }}
                    className="relative flex-1 h-full rounded-[2px] border border-black/90 shadow-[inset_0_2px_5px_rgba(0,0,0,0.95)] flex items-center justify-between px-1.5 sm:px-2 overflow-hidden"
                  >
                    <CassetteSprocketHub
                      id="cassette-left-hub"
                      durationSec={hubSpeeds.supplyDurationSec}
                      timingFunction={hubSpeeds.timingFunction}
                      shouldSpin={shouldSpin}
                      isDocumentHidden={isDocumentHidden}
                      lowPowerMode={lowPowerMode}
                      prefersReducedMotion={prefersReducedMotion}
                      pancakePct={pancakes.leftPancakePct}
                      hubSnapDeg={stagePose.hubSnapDeg}
                      sizePx={sprocketSizePx}
                    />
                    {/* Central Transparent Slit & White Measuring Ticks (100 · 50 · 0) */}
                    <div
                      aria-hidden="true"
                      data-window-calibration-ticks="true"
                      className="pointer-events-none flex flex-col items-center justify-center gap-[1px] px-1 z-20"
                    >
                      <div className="flex items-center gap-[2px]">
                        {[0, 1, 2, 3, 4, 5, 6].map((tick) => (
                          <span
                            key={tick}
                            className={`w-[1px] ${
                              tick % 3 === 0 ? 'h-[4.5px] bg-white/95' : 'h-[2.5px] bg-white/65'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="w-full flex items-center justify-between text-[3.8px] font-mono font-bold text-white/90 leading-none">
                        <span>100</span>
                        <span>50</span>
                        <span>0</span>
                      </div>
                    </div>
                    <CassetteSprocketHub
                      id="cassette-right-hub"
                      durationSec={hubSpeeds.takeupDurationSec}
                      timingFunction={hubSpeeds.timingFunction}
                      shouldSpin={shouldSpin}
                      isDocumentHidden={isDocumentHidden}
                      lowPowerMode={lowPowerMode}
                      prefersReducedMotion={prefersReducedMotion}
                      pancakePct={pancakes.rightPancakePct}
                      hubSnapDeg={stagePose.hubSnapDeg}
                      sizePx={sprocketSizePx}
                    />
                  </div>
                </div>

                {/* ZONE 3: Lower Cream Technical Footer Strip */}
                <div className="w-full h-[22%] min-h-[10px] px-1.5 flex items-center justify-between bg-[#ECECE6] border-t border-[#D8D4C8] shrink-0">
                  <span className="font-sans text-[4px] sm:text-[4.5px] font-bold tracking-[0.06em] uppercase text-[#1A1A1A] leading-none truncate">
                    TYPE I (NORMAL) POSITION
                  </span>
                  <span
                    aria-hidden="true"
                    style={{ color: '#F25C05' }}
                    className="text-[7px] font-black leading-none mx-1 shrink-0"
                  >
                    ➜
                  </span>
                  <div className="flex items-baseline gap-[1.5px] leading-none shrink-0">
                    <span
                      style={{ color: '#F25C05' }}
                      className="font-sans text-[6.5px] sm:text-[7.5px] font-black tracking-tight"
                    >
                      CHF
                    </span>
                    <span className="font-sans text-[6.5px] sm:text-[7.5px] font-black text-[#1A1A1A]">
                      90
                    </span>
                  </div>
                </div>
              </div>

              {/* Lower Raised Smoked Translucent Trapezoid Bridge with Square Grid Texture, 5th Center Black Screw & Oval Cutouts */}
              <div
                id="cassette-tape-bridge"
                data-cassette-embossed-grid="true"
                className="cas-embossed-bridge-grid relative z-10 mx-auto w-[80%] h-[9px] sm:h-[11px] rounded-t-[2px] border border-[#A88868]/45 flex items-center justify-between px-2 shrink-0"
              >
                {/* Left Oval Alignment Cutout + Capstan Pin Hole */}
                <div className="flex items-center gap-1.5">
                  <span className="w-[5px] h-[2.5px] rounded-full bg-[#090A0B] border border-[#9E8268]/60" />
                  <span className="w-[3.5px] h-[3.5px] rounded-full bg-[#090A0B] border border-[#9E8268]/60" />
                </div>

                {/* 5th Recessed Matte-Black Phillips Screw (Bottom-Center Bridge Screw) */}
                <span
                  data-cassette-screw="center-bridge"
                  className="w-[4.5px] h-[4.5px] rounded-full bg-[#141414] border border-black flex items-center justify-center"
                >
                  <span className="w-[2.5px] h-[0.6px] bg-[#505256] rotate-45" />
                </span>

                {/* Right Capstan Pin Hole + Oval Alignment Cutout */}
                <div className="flex items-center gap-1.5">
                  <span className="w-[3.5px] h-[3.5px] rounded-full bg-[#090A0B] border border-[#9E8268]/60" />
                  <span className="w-[5px] h-[2.5px] rounded-full bg-[#090A0B] border border-[#9E8268]/60" />
                </div>
              </div>
            </div>

            {/* Z-INDEX 30: BOTTOM-HINGED CLEAR TINTED ACRYLIC DOOR (transform-origin: bottom center, rotateX(-32deg)) */}
            <div
              id="cassette-smoked-door"
              role="button"
              tabIndex={0}
              aria-label={
                stagePose.doorLatchEngaged
                  ? 'Eject Cassette Door'
                  : 'Close Cassette Door and Reload Tape'
              }
              data-door-latched={stagePose.doorLatchEngaged ? 'true' : 'false'}
              data-door-angle={stagePose.doorAngleDeg}
              data-door-compression={stagePose.doorCompressionPx}
              onClick={handleStandaloneEjectToggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleStandaloneEjectToggle();
                }
              }}
              style={{
                zIndex: stagePose.doorZIndex,
                transformOrigin: 'bottom center',
                transform: stagePose.doorTransform,
                boxShadow: stagePose.doorLatchEngaged
                  ? 'inset 0 2px 4px rgba(0,0,0,0.6), inset 1px 1px 0 rgba(255,255,255,0.65)'
                  : '0 12px 20px rgba(0,0,0,0.65), inset 1px 1px 0 rgba(255,255,255,0.82)',
                transition:
                  isDocumentHidden || lowPowerMode || prefersReducedMotion
                    ? 'none'
                    : `transform 260ms ${stagePose.doorEasing}, box-shadow 240ms ease`,
              }}
              className="cas-smoked-door absolute inset-0 rounded-[1px] flex flex-col justify-between overflow-hidden cursor-pointer"
            >
              {/* Diagonal Specular Glass Reflection Streak That Shifts When Tilted Open */}
              <div
                aria-hidden="true"
                style={{
                  transform: stagePose.doorLatchEngaged
                    ? 'translateX(0%) skewX(-24deg)'
                    : 'translateX(14%) skewX(-16deg)',
                  transition: 'transform 260ms ease',
                }}
                className="pointer-events-none absolute -inset-x-6 top-0 bottom-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              />

              {/* Top Metallic Trim Bar on Door Window */}
              <div className="relative z-10 w-full h-[6px] bg-gradient-to-b from-[#FFFFFF] via-[#D0D3D6] to-[#8C9094] border-b border-[#5A5E62]" />

              {/* Center Window Sight Crosshair */}
              <div className="pointer-events-none my-auto mx-auto px-2 py-[1px] border border-white/40 rounded-[1px]">
                <span className="cas-condensed-label text-[5.5px] font-bold text-white/85 tracking-widest">
                  ◀ AUTO STOP ▶
                </span>
              </div>

              {/* Bottom Hinge Axis Bar */}
              <div className="relative z-10 w-full h-[3px] bg-[#686C70] border-t border-[#3A3E42]" />
            </div>
          </div>

          {/* RIGHT AUXILIARY SUB-PANEL (Deeply Recessed Vertical Black Stadium Channel w/ 4 Red LED Peak Dots Beneath Battery/Level Symbol) */}
          <div
            id="cas-aux-subpanel-right"
            data-testid="cas-aux-subpanel-right"
            aria-hidden="true"
            style={{ width: `${geo.auxPanelWidthPx}px`, height: `${geo.cassetteDoorHeightPx}px` }}
            className="cas-brushed-steel rounded-r-[2px] px-[3px] py-1.5 flex flex-col items-center justify-between shrink-0"
          >
            {/* Tiny Engraved Battery / Level Symbol */}
            <div className="flex flex-col items-center gap-[1px]">
              <div className="w-[10px] h-[5px] border border-[#141516] relative flex items-center p-[0.5px]">
                <span className="w-[65%] h-full bg-[#141516]" />
                <span className="absolute -right-[2px] top-1/2 -translate-y-1/2 w-[1.5px] h-[2.5px] bg-[#141516]" />
              </div>
              <span className="cas-condensed-label text-[4.5px] font-extrabold text-[#141516] leading-none">
                BATT
              </span>
            </div>

            {/* Deeply Recessed Vertical Black Stadium-Shaped Channel Housing 4 Vertical Red LED Peak-Level Dots */}
            <div
              data-peak-led-dots={redPeakDotCount}
              className="w-[9px] flex-1 my-1 rounded-full bg-[#18191B] border border-[#565A62] shadow-[inset_0_2px_4px_rgba(0,0,0,0.92)] py-1.5 flex flex-col items-center justify-between"
            >
              {[4, 3, 2, 1].map((dotIdx) => {
                const isLit = redPeakDotCount >= dotIdx;
                return (
                  <span
                    key={dotIdx}
                    style={{
                      backgroundColor: isLit ? '#E61919' : '#3A1212',
                      boxShadow: isLit ? '0 0 5px rgba(230, 25, 25, 0.95)' : 'none',
                    }}
                    className="w-[4.5px] h-[4.5px] rounded-full border border-black/70"
                  />
                );
              })}
            </div>

            <span className="cas-condensed-label text-[4.5px] font-bold text-[#141516] leading-none">
              PEAK
            </span>
          </div>
        </div>
      </div>
    );

    // Reusable 6-Button Mechanical Piano-Key Transport Array + 3 Horizontal Base Trim Grooves (Section 7)
    const renderBottomPianoKeyTransportArray = () => (
      <div
        id="cas-bottom-transport-well"
        className="relative z-20 w-full flex flex-col items-stretch gap-1 shrink-0"
      >
        {/* Dark Recessed Well Housing 6 Bevel-Edged Satin-Silver Piano Keys (2px dark gap between adjacent keys) */}
        <div
          id="transport-buttons-group"
          className="w-full rounded-[2px] bg-[#18191B] p-[3px] border border-[#565A62] shadow-[inset_0_3px_6px_rgba(0,0,0,0.92)] flex items-start gap-[2px]"
        >
          {/* 1. RECORD (Crisp circular red dot in the center) */}
          <BoomboxPianoKey
            id="btn-scratch-vinyl"
            label="REC"
            depth={keyStates.record.depth}
            travelPx={keyStates.record.travelPx}
            scaleY={keyStates.record.scaleY}
            latched={keyStates.record.latched}
            disabled={isStandby}
            compact={useCompactControls}
            ariaLabel="Record / Tape Flutter Effect"
            title="Record Key (Triggers Analog Tape Flutter FX)"
            onClick={handleTriggerRecordTapeChew}
          >
            <span className="w-[7px] h-[7px] rounded-full bg-[#E61919] border border-black/40 shadow-[0_0_3px_rgba(230,25,25,0.65)]" />
          </BoomboxPianoKey>

          {/* 2. REWIND (◀◀ double left-pointing black triangles) */}
          <BoomboxPianoKey
            id="btn-prev-track"
            label="REW"
            depth={keyStates.rew.depth}
            travelPx={keyStates.rew.travelPx}
            scaleY={keyStates.rew.scaleY}
            latched={keyStates.rew.latched}
            disabled={isStandby}
            compact={useCompactControls}
            ariaLabel="Rewind / Previous Track"
            title="Rewind / Previous Track (◀◀)"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              flashMomentaryKey('rew');
              retroAudio.triggerCassetteLatchClick(false);
              onPrevious();
            }}
          >
            <span className="text-[8px] font-black tracking-tighter leading-none text-[#141516]">
              ◀◀
            </span>
          </BoomboxPianoKey>

          {/* 3. PLAY (▶ single right-pointing black triangle) */}
          <BoomboxPianoKey
            id="btn-play-pause"
            label="PLAY"
            depth={keyStates.play.depth}
            travelPx={keyStates.play.travelPx}
            scaleY={keyStates.play.scaleY}
            latched={keyStates.play.latched}
            disabled={isStandby}
            compact={useCompactControls}
            ariaLabel={isPlaying ? 'Pause Playback' : 'Play Cassette'}
            title="Play Cassette (▶)"
            onClick={handlePlayKeyClick}
          >
            <span className="text-[8.5px] font-black leading-none text-[#141516]">▶</span>
          </BoomboxPianoKey>

          {/* 4. FAST FORWARD (▶▶ double right-pointing black triangles) */}
          <BoomboxPianoKey
            id="btn-next-track"
            label="FF"
            depth={keyStates.ff.depth}
            travelPx={keyStates.ff.travelPx}
            scaleY={keyStates.ff.scaleY}
            latched={keyStates.ff.latched}
            disabled={isStandby}
            compact={useCompactControls}
            ariaLabel="Fast Forward / Next Track"
            title="Fast Forward / Next Track (▶▶)"
            onClick={() => {
              triggerButtonHaptic(lowPowerMode);
              flashMomentaryKey('ff');
              retroAudio.triggerCassetteLatchClick(false);
              onNext();
            }}
          >
            <span className="text-[8px] font-black tracking-tighter leading-none text-[#141516]">
              ▶▶
            </span>
          </BoomboxPianoKey>

          {/* 5. STOP (■ solid black square) */}
          <BoomboxPianoKey
            id="btn-stop-playback"
            label="STOP"
            depth={keyStates.stop.depth}
            travelPx={keyStates.stop.travelPx}
            scaleY={keyStates.stop.scaleY}
            latched={false}
            disabled={isStandby}
            compact={useCompactControls}
            ariaLabel="Stop Cassette Playback"
            title="Stop Cassette Playback (■)"
            onClick={handleStopClick}
          >
            <span className="w-[6.5px] h-[6.5px] bg-[#141516] inline-block" />
          </BoomboxPianoKey>

          {/* 6. EJECT (⏏ upward triangle over horizontal bar) */}
          <BoomboxPianoKey
            id="btn-cassette-eject"
            label="EJECT"
            depth={keyStates.eject.depth}
            travelPx={keyStates.eject.travelPx}
            scaleY={keyStates.eject.scaleY}
            latched={keyStates.eject.latched}
            disabled={false}
            compact={useCompactControls}
            ariaLabel="Eject or Reload Cassette"
            title="Eject / Reload Cassette (⏏)"
            onClick={handleStandaloneEjectToggle}
          >
            <span className="text-[9px] font-black leading-none text-[#141516]">⏏</span>
          </BoomboxPianoKey>
        </div>

        {/* Three Horizontal Black-and-Silver Base Trim Grooves Running Across Bottom Lip of Center Bay */}
        <div
          aria-hidden="true"
          className="w-full flex flex-col gap-[2px] pt-[1px] shrink-0"
        >
          <span className="w-full h-[1.5px] bg-[#18191B] shadow-[0_1px_0_#F4F6F8]" />
          <span className="w-full h-[1.5px] bg-[#18191B] shadow-[0_1px_0_#F4F6F8]" />
          <span className="w-full h-[1.5px] bg-[#18191B] shadow-[0_1px_0_#F4F6F8]" />
        </div>
      </div>
    );

    return (
      <section
        id="turntable-console-root"
        aria-label="Vintage Brushed Aluminum Stereo Boombox Cassette Recorder"
        data-track-change-phase={trackChangePhase}
        className="panel-contain relative w-full h-full min-h-0 flex flex-col justify-between overflow-visible select-none p-0 bg-transparent border-0 shadow-none"
      >
        {/* ===================================================================
            (1) TOP CARRYING HANDLE ASSEMBLY (72% Width) & TOP DECK HARDWARE
                - Chrome Pivot Arms (22px width) + Beveled Mounting Blocks (36x14px)
                - Fluted Black ABS Grip Bar (28px height, 4 horizontal finger-grip flutes)
                - Left Cluster: 4 Cylindrical Machined-Aluminum Rotary Knobs
                  (Knob 1: 22x16px post; Knobs 2, 3, 4: 34x20px fluted spaced 14px apart)
                - Center Cluster: 5 Rectangular Matte-Black Push-Switches (18x8px, spaced 12px)
                - Top-Right Deck Surface: Completely Flush Brushed Aluminum (NO Top-Right Rotary Dial!)
            =================================================================== */}
        <div
          id="cas-top-reserve-zone"
          className={`relative z-30 w-full shrink-0 flex flex-col justify-end ${
            isCompactLandscape ? 'h-[24px]' : isMobilePortrait ? 'h-[30px]' : 'h-[48px]'
          }`}
        >
          {/* Collapsible Carrying Handle Spanning 72% of Top Chassis Width */}
          <div
            id="cas-boombox-carry-handle"
            aria-hidden="true"
            className="pointer-events-none relative mx-auto w-[72%] h-full flex items-start justify-between z-20"
          >
            {/* Left Mirror-Polished Chrome Pivot Arm (22px) + Stepped 90-deg Elbow + Beveled Mounting Block (36x14px) */}
            <div className="relative h-full flex flex-col items-start justify-between shrink-0">
              <div className="cas-polished-chrome w-[22px] flex-1 rounded-tl-[4px] flex flex-col items-center justify-start pt-0.5">
                <span className="w-[5px] h-[5px] rounded-full bg-[#18191B] border border-white/70" />
              </div>
              <div
                className={`cas-brushed-steel w-[36px] ${
                  isCompactLandscape || isMobilePortrait ? 'h-[8px]' : 'h-[14px]'
                } -ml-[4px] rounded-t-[2px] border-b-0 flex items-center justify-center`}
              >
                <span className="w-[18px] h-[1.5px] bg-[#5A5E62]" />
              </div>
            </div>

            {/* Thick Horizontal Matte-Black ABS Grip Bar (height: 28px, 4 continuous horizontal finger-grip flutes) */}
            <div
              className={`cas-fluted-grip-bar flex-1 mx-[-1px] flex flex-col justify-evenly px-3 ${
                isCompactLandscape || isMobilePortrait ? 'h-[14px]' : 'h-[26px] sm:h-[28px]'
              }`}
            >
              <span className="w-full h-[2px] bg-black/85 shadow-[0_1px_0_rgba(255,255,255,0.22)]" />
              <span className="w-full h-[2px] bg-black/85 shadow-[0_1px_0_rgba(255,255,255,0.22)]" />
              <span className="w-full h-[2px] bg-black/85 shadow-[0_1px_0_rgba(255,255,255,0.22)]" />
              <span className="w-full h-[2px] bg-black/85 shadow-[0_1px_0_rgba(255,255,255,0.22)]" />
            </div>

            {/* Right Mirror-Polished Chrome Pivot Arm (22px) + Stepped 90-deg Elbow + Beveled Mounting Block (36x14px) */}
            <div className="relative h-full flex flex-col items-end justify-between shrink-0">
              <div className="cas-polished-chrome w-[22px] flex-1 rounded-tr-[4px] flex flex-col items-center justify-start pt-0.5">
                <span className="w-[5px] h-[5px] rounded-full bg-[#18191B] border border-white/70" />
              </div>
              <div
                className={`cas-brushed-steel w-[36px] ${
                  isCompactLandscape || isMobilePortrait ? 'h-[8px]' : 'h-[14px]'
                } -mr-[4px] rounded-t-[2px] border-b-0 flex items-center justify-center`}
              >
                <span className="w-[18px] h-[1.5px] bg-[#5A5E62]" />
              </div>
            </div>
          </div>

          {/* Section 2.2: Top Deck Center-Aligned Dials & Ordered Control Array Beneath Handle */}
          <div
            id="console-front-face"
            data-top-deck-alignment="center-symmetrical"
            className="absolute inset-x-0 bottom-0 z-30 mx-auto w-[72%] px-4 sm:px-6 flex items-end justify-center gap-3 sm:gap-5 pointer-events-auto"
          >
            {/* Center-Aligned Rotary Knobs Cluster */}
            <div
              id="cas-top-left-knob-cluster"
              className="flex items-end justify-center gap-[10px] sm:gap-[14px] shrink-0"
            >
              {/* Knob 1: Fine-tuning/AFC rotary post (22x16px) */}
              <TopDeckMachinedRotaryKnob
                id="cas-tuning-knob"
                label="Fine Tuning / AFC Rotary Post"
                variant="post-22x16"
                value={fineTuneRatio}
                disabled={isStandby}
                onChange={(ratio) => onSeek(tunerDialRatioToSeekSec(ratio, safeDur))}
              />
              {/* Knobs 2, 3, and 4: Three identical fluted aluminum rotary knobs (34x20px) */}
              <TopDeckMachinedRotaryKnob
                id="cas-tone-bass-knob"
                label="Bass Tone Knob"
                variant="fluted-34x20"
                value={bassLevel}
                onChange={setBassLevel}
              />
              <TopDeckMachinedRotaryKnob
                id="cas-tone-treble-knob"
                label="Treble Tone Knob"
                variant="fluted-34x20"
                value={trebleLevel}
                onChange={setTrebleLevel}
              />
              <TopDeckMachinedRotaryKnob
                id="cas-tone-balance-knob"
                label="Stereo Balance Knob"
                variant="fluted-34x20"
                value={balanceLevel}
                onChange={setBalanceLevel}
              />
            </div>

            {/* Symmetrical Center Divider Post */}
            <span aria-hidden="true" className="hidden sm:inline-block w-[2px] h-[12px] bg-[#686C70] rounded-t-[1px] shrink-0" />

            {/* Center-Aligned 5 Low-Profile Rectangular Matte-Black Mechanical Push-Switches (18x8px, evenly spaced) */}
            <div
              id="cas-top-center-switch-cluster"
              role="group"
              aria-label="Top Deck Function Push-Switches"
              className="hidden sm:flex items-end justify-center gap-[10px] sm:gap-[12px] shrink-0"
            >
              {['TAPE', 'RADIO', 'LINE', 'STEREO', 'AFC'].map((swLabel, idx) => {
                const isDepressed = activeTopSwitchIdx === idx;
                return (
                  <div
                    key={swLabel}
                    className="px-[2px] pt-[2px] rounded-t-[2px] bg-[#D0D3D6] border border-b-0 border-[#686C70] flex items-end"
                  >
                    <button
                      type="button"
                      aria-label={`${swLabel} Function Push-Switch`}
                      aria-pressed={isDepressed}
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        retroAudio.triggerCassetteLatchClick(true);
                        setActiveTopSwitchIdx(idx);
                      }}
                      style={{
                        width: '18px',
                        height: isDepressed ? '6px' : '8px',
                      }}
                      className="rounded-t-[1px] bg-[#18191B] border border-black shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] cursor-pointer transition-all duration-75"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ===================================================================
            (2) PRIMARY BOOMBOX CHASSIS (#cas-wtb732-main-body)
                6px outer chamfered silver perimeter lip, Upper Tuner/Control Tier,
                2px horizontal structural parting line, Lower Acoustic/Cassette Tier.
            =================================================================== */}
        <div
          id="cas-wtb732-main-body"
          className="cas-body-cabinet walnut-furniture-cabinet relative flex-1 min-h-0 w-full flex flex-col justify-between overflow-hidden p-0"
        >
          {/* Global Top-Left 65-Degree Elevation / -15-Degree Azimuth Directional Light Overlay */}
          <div
            aria-hidden="true"
            style={{
              background:
                'linear-gradient(165deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0.02) 68%, rgba(0,0,0,0.18) 100%)',
            }}
            className="pointer-events-none absolute inset-0 z-[5]"
          />

          {/* ===================================================================
              (2A) UPPER TUNER / CONTROL TIER:
                   - Row 1: Full-Width AM/FM Radio Tuner Window (Square Piezo Tweeters detached and relocated to flank the 5-Band EQ bar)
                   - Row 2: Horizontal Volume & Pitch Faders
                   - Row 3 (Mobile Portrait): 5-Band Analogue Graphic Equalizer Flanked by Square Piezo Tweeters
              =================================================================== */}
          <div
            id="cas-upper-fascia-tier"
            className={`relative z-20 w-full ${
              isCompactLandscape ? 'px-2 py-0.5' : isMobilePortrait ? 'px-1.5 py-1' : 'px-2 sm:px-3 pt-1.5 pb-1.5'
            } flex flex-col justify-between shrink-0`}
          >
            {/* Row 1: Full-Width Wide AM/FM Radio Tuner Window */}
            <div className="w-full flex items-center justify-between">
              <BoomboxTunerDialSeekStrip
                trackId={track.id}
                durationSec={track.durationSec}
                isStandby={isStandby}
                lowPowerMode={lowPowerMode}
                compact={useCompactControls}
                onSeek={onSeek}
              />
            </div>

            {/* Row 2: Long Heavy-Duty Horizontal Volume & Pitch Faders Directly Below Tuner Window */}
            <div
              id="turntable-control-row"
              className={`cas-panel-break w-full ${
                isCompactLandscape ? 'mt-0.5 px-2 py-0.5' : 'mt-1 px-2 sm:px-3 py-1'
              } rounded-[2px] flex items-center justify-between gap-3 sm:gap-5`}
            >
              <BoomboxHorizontalSlider
                id="vertical-volume-control"
                sliderId="vertical-volume-slider"
                valueReadoutId="vertical-volume-value"
                label="VOLUME"
                valueText={`${volumePctInt}%`}
                thumbLeftPercent={volumeThumbLeftPct}
                ariaLabel="Output Horizontal Volume Fader"
                ariaMin={0}
                ariaMax={100}
                ariaNow={volumePctInt}
                title={`Volume: ${volumePctInt}% (Double-click to reset)`}
                compact={useCompactControls}
                lowPowerMode={lowPowerMode}
                onPointerRatio={(r) => onChangeVolume(horizontalPointerRatioToVolume(r))}
                onStepDelta={(d) =>
                  onChangeVolume(Number(Math.max(0, Math.min(1, clampedVolume + d * 0.05)).toFixed(2)))
                }
                onResetDefault={() => onChangeVolume(0.8)}
              />
              <div aria-hidden="true" className="w-[1.5px] h-[22px] bg-[#707478] shrink-0" />
              <BoomboxHorizontalSlider
                id="vertical-pitch-control"
                sliderId="vertical-pitch-slider"
                valueReadoutId="vertical-pitch-value"
                label="PITCH"
                valueText={pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
                thumbLeftPercent={pitchThumbLeftPct}
                ariaLabel="Tape Speed Horizontal Pitch Fader"
                ariaMin={-12}
                ariaMax={12}
                ariaNow={pitchPercent}
                title={`Pitch: ${pitchPercent >= 0 ? '+' : ''}${pitchPercent}% (Double-click to reset)`}
                compact={useCompactControls}
                lowPowerMode={lowPowerMode}
                onPointerRatio={(r) => onChangePitch(horizontalPointerRatioToPitch(r))}
                onStepDelta={(d) => onChangePitch(Math.max(-12, Math.min(12, pitchPercent + d)))}
                onResetDefault={() => onChangePitch(0)}
              />
            </div>

            {/* Mobile Portrait Only: Render Equalizer Flanked by Square Piezo Tweeters in Upper Fascia */}
            {isMobilePortrait && renderGraphicEqualizerModule(false)}
          </div>

          {/* ===================================================================
              SHARP HORIZONTAL STRUCTURAL PARTING LINE (height: 2px, #686C70 / #F4F6F8)
              =================================================================== */}
          <div aria-hidden="true" className="cas-horizontal-parting-seam shrink-0 z-20" />

          {/* ===================================================================
              (2B) LOWER ACOUSTIC / CASSETTE TIER:
                   - Desktop & Mobile Horizontal: Three-Column Classic Layout (35% | 30% | 35%)
                     separated by two 2px vertical panel seams.
                   - Mobile Vertical (Portrait): Edge-Aligned Multi-Driver Geometry & Centered Cassette Loader:
                     Row 2 (Upper-Middle): Central HUD + Horizontally Centered Cassette Loader (`left: 50%; transform: translateX(-50%)`)
                     Row 3 (Lower-Middle): Left Big Woofer anchored flush left & Right Big Woofer anchored flush right (`justify-between`)
                       with Medium Round Speakers tangent-aligned to outer edges and Smallest Round Speakers angled inward
                     Row 4 (Absolute Bottom): 6-key Piano Transport Array across bottom
              =================================================================== */}
          <div
            ref={topSurfaceRef}
            id="console-top-surface"
            className="relative z-30 flex-1 min-h-0 flex flex-col justify-between"
          >
            <div
              ref={mediaStageRef}
              id="cassette-media-stage"
              data-track-change-phase={trackChangePhase}
              data-speaker-cassette-ratio={baselineGeo.speakerToCassetteRatio}
              className="relative z-40 flex-1 min-h-0 w-full flex flex-col justify-between overflow-visible"
            >
              <CassetteDustCanvas
                width={stageSize.width}
                height={stageSize.height}
                isAnimating={Boolean(shouldSpin)}
              />

              {isMobilePortrait ? (
                /* ===============================================================
                   MOBILE VERTICAL (PORTRAIT) STACKED ARCHITECTURE
                   - Full-Width Centered Cassette Compartment Bay
                   - Dual Enlarged Speakers Anchored Flush Top-Left & Top-Right of Speaker Row
                   - 6-Key Piano Transport Array anchored at bottom
                   =============================================================== */
                <div className="relative z-20 flex-1 min-h-0 w-full px-0 py-0.5 flex flex-col items-center justify-between gap-0.5">
                  {/* Row 2: Central HUD + Full-Width Horizontally Centered Cassette Compartment Door */}
                  <div className="w-full px-1.5 flex flex-col items-center gap-0.5 shrink-0">
                    {renderCentralPlaybackHudBar()}
                    <div className="w-full flex items-center justify-center">
                      {renderCentralCassetteBayAssembly()}
                    </div>
                  </div>

                  {/* Row 3: Lowered Dual Circular Woofer Speakers + Mirrored Upper Auxiliary Speakers Directly Above */}
                  <div
                    id="cas-mobile-dual-speaker-row"
                    className="w-full flex-1 min-h-0 px-0.5 pt-0.5 flex items-end justify-between gap-2"
                  >
                    <div className="w-1/2 h-full flex items-end justify-start">
                      <BoomboxSpeakerGrille
                        side="left"
                        sizePx={geo.speakerDiameterPx}
                        bottomPaddingPx={geo.speakerBottomPaddingPx}
                        isAnimating={speakerCanPulse}
                        pulseScale={bassPulseMetrics.coneScale}
                        dustCapScale={bassPulseMetrics.dustCapScale}
                        isMobilePortrait={true}
                        showUpperAuxSpeakers={true}
                      />
                    </div>
                    <div className="w-1/2 h-full flex items-end justify-end">
                      <BoomboxSpeakerGrille
                        side="right"
                        sizePx={geo.speakerDiameterPx}
                        bottomPaddingPx={geo.speakerBottomPaddingPx}
                        isAnimating={speakerCanPulse}
                        pulseScale={bassPulseMetrics.coneScale}
                        dustCapScale={bassPulseMetrics.dustCapScale}
                        isMobilePortrait={true}
                        showUpperAuxSpeakers={true}
                      />
                    </div>
                  </div>

                  {/* Row 4: 6-Key Piano Transport Array Anchored Across Absolute Bottom */}
                  <div className="w-full px-1 shrink-0">{renderBottomPianoKeyTransportArray()}</div>
                </div>
              ) : (
                /* ===============================================================
                   DESKTOP & MOBILE HORIZONTAL THREE-COLUMN LAYOUT (28% | 44% | 28%)
                   Left Lowered Woofer + Upper Aux Pair | 2px Seam | Center Cassette Bay | 2px Seam | Right Lowered Woofer + Upper Aux Pair
                   =============================================================== */
                <div className="relative z-20 flex-1 min-h-0 w-full flex items-stretch justify-between">
                  {/* LEFT COLUMN (28% width): Lowered Left Woofer (50px bottom pad) + Upper Aux Pair + Base Skirt Indents */}
                  <div
                    style={{ width: `${geo.leftColumnPct}%` }}
                    className="h-full flex flex-col items-start justify-end pl-0.5 pr-1 pt-0.5 pb-1 shrink-0"
                  >
                    <div className="flex-1 min-h-0 w-full flex items-end justify-start">
                      <BoomboxSpeakerGrille
                        side="left"
                        sizePx={geo.speakerDiameterPx}
                        bottomPaddingPx={geo.speakerBottomPaddingPx}
                        isAnimating={speakerCanPulse}
                        pulseScale={bassPulseMetrics.coneScale}
                        dustCapScale={bassPulseMetrics.dustCapScale}
                        showUpperAuxSpeakers={!isCompactLandscape}
                      />
                    </div>
                    {/* Molded Rectangular Base Trim Indents Matching Reference Photo */}
                    <div aria-hidden="true" className="w-full flex items-center justify-around px-2 pt-1 shrink-0">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="w-[18%] h-[5px] rounded-[1px] border border-[#707478] bg-[#B8BCC0] shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_1px_0_#F4F6F8]"
                        />
                      ))}
                    </div>
                  </div>

                  {/* LEFT VERTICAL PANEL SEAM (width: 2px, #707478 / #F0F2F4) */}
                  <div aria-hidden="true" className="cas-vertical-parting-seam h-full shrink-0" />

                  {/* CENTER COLUMN (44% width): Full-Width Cassette Compartment Bay + HUD + Taller EQ + Piano Transport */}
                  <div
                    style={{ width: `${geo.centerColumnPct}%` }}
                    className={`${
                      isCompactLandscape ? 'min-w-[180px] py-0.5' : 'min-w-[230px] py-1'
                    } h-full flex flex-col items-center justify-between px-1.5 shrink-0`}
                  >
                    <div
                      className={`my-auto w-full flex flex-col items-center ${
                        isCompactLandscape ? 'gap-[2px]' : 'gap-[4px] sm:gap-[6px]'
                      }`}
                    >
                      {renderCentralPlaybackHudBar()}
                      {/* Taller 5-Band Graphic Equalizer Directly Above Cassette Holder on Desktop; Completely Hidden in Mobile Landscape */}
                      {!isCompactLandscape && renderGraphicEqualizerModule(true)}
                      <div className="w-full flex items-center justify-center">
                        {renderCentralCassetteBayAssembly()}
                      </div>
                    </div>
                    {renderBottomPianoKeyTransportArray()}
                  </div>

                  {/* RIGHT VERTICAL PANEL SEAM (width: 2px, #707478 / #F0F2F4) */}
                  <div aria-hidden="true" className="cas-vertical-parting-seam h-full shrink-0" />

                  {/* RIGHT COLUMN (28% width): Lowered Right Woofer (50px bottom pad) + Upper Aux Pair + Base Skirt Indents */}
                  <div
                    style={{ width: `${geo.rightColumnPct}%` }}
                    className="h-full flex flex-col items-end justify-end pr-0.5 pl-1 pt-0.5 pb-1 shrink-0"
                  >
                    <div className="flex-1 min-h-0 w-full flex items-end justify-end">
                      <BoomboxSpeakerGrille
                        side="right"
                        sizePx={geo.speakerDiameterPx}
                        bottomPaddingPx={geo.speakerBottomPaddingPx}
                        isAnimating={speakerCanPulse}
                        pulseScale={bassPulseMetrics.coneScale}
                        dustCapScale={bassPulseMetrics.dustCapScale}
                        showUpperAuxSpeakers={!isCompactLandscape}
                      />
                    </div>
                    <div aria-hidden="true" className="w-full flex items-center justify-around px-2 pt-1 shrink-0">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="w-[18%] h-[5px] rounded-[1px] border border-[#707478] bg-[#B8BCC0] shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_1px_0_#F4F6F8]"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ===================================================================
                  SEPARATE PLASTIC CASSETTE STORAGE CASE / SLEEVE (#album-art-holder-box)
                  Strictly +50px larger in all dimensions than #oversized-cassette-shell;
                  collapses and hides cleanly when Global "Hide Box Art / Case" is active.
                  =================================================================== */}
              {!hideBoxArt && (
                <div
                  ref={holderHomeSlotRef}
                  id="album-art-holder-home-slot"
                  style={{
                    right: isMobilePortrait ? '6px' : '10px',
                    bottom: isMobilePortrait ? '54px' : '8px',
                    width: `${cassetteBoxDims.width}px`,
                    height: `${cassetteBoxDims.height}px`,
                    transform: isMobilePortrait ? 'scale(0.68)' : undefined,
                    transformOrigin: isMobilePortrait ? 'bottom right' : undefined,
                  }}
                  className="pointer-events-none absolute z-45 flex items-center justify-center select-none"
                >
                  <div
                    id="album-art-holder-box"
                    data-testid="album-art-holder-box"
                    data-dragging={isDraggingHolder ? 'true' : 'false'}
                    data-holder-tilt={holderTiltDeg.toFixed(2)}
                    data-spine-base-hex={activeSpinePalette.baseHex}
                    data-box-clearance-px={cassetteBoxDims.paddingPx}
                    data-box-depth-px={cassetteBoxDims.depthPx}
                    onPointerDown={handleHolderPointerDown}
                    onPointerMove={handleHolderPointerMove}
                    onPointerUp={handleHolderPointerUp}
                    onPointerCancel={handleHolderPointerUp}
                    onDoubleClick={() => {
                      setHolderOffset({ x: 0, y: 0 });
                      setHolderTiltDeg(-1.8);
                    }}
                    title="Drag plastic cassette storage case across boombox (double-click to re-dock)"
                    style={{
                      width: `${cassetteBoxDims.width}px`,
                      height: `${cassetteBoxDims.height}px`,
                      padding: `${Math.round(cassetteBoxDims.paddingPx / 5)}px`,
                      transformOrigin: '50% 15%',
                      transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) rotate(${holderTiltDeg}deg)`,
                      transition:
                        isDraggingHolder || isDocumentHidden || lowPowerMode || prefersReducedMotion
                          ? 'none'
                          : 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className={`cas-norelco-case pointer-events-auto relative rounded-[4px] ${
                      isDraggingHolder ? 'cursor-grabbing' : 'cursor-grab'
                    } touch-none select-none z-45 flex overflow-hidden`}
                  >
                    {/* Left Molded J-Card Spine Colored From Album Art */}
                    <div
                      id="cas-norelco-spine"
                      style={{
                        backgroundColor: activeSpinePalette.baseHex,
                        color: activeSpinePalette.inkHex,
                        borderColor: activeSpinePalette.borderHex,
                      }}
                      className="relative z-10 w-[16px] h-full border-r flex flex-col items-center justify-center px-[1px] overflow-hidden shrink-0"
                    >
                      <span
                        style={{ writingMode: 'vertical-rl' }}
                        className="rotate-180 cas-condensed-label font-extrabold text-[6.5px] leading-none truncate max-h-[88%]"
                      >
                        C-90 CrO₂
                      </span>
                    </div>

                    {/* Inner Flap & Full-Bleed Front Cover Art */}
                    <div className="relative z-10 flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-[#18191B] border border-white/60">
                      <div className="w-full bg-[#E6E8EA] border-b border-[#9EA3A8] px-1.5 py-[1px] flex items-center justify-between gap-0.5 shrink-0">
                        <span className="cas-condensed-label text-[6px] font-extrabold text-[#141516] truncate">
                          STEREO CASSETTE
                        </span>
                        <span className="cas-condensed-label text-[5.5px] font-bold text-[#141516] shrink-0">
                          C-90 · CrO₂
                        </span>
                      </div>

                      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                        {!artworkLoaded && !artworkState.isPlaceholder && (
                          <div
                            data-testid="album-art-skeleton"
                            className="absolute inset-0 bg-[#2A2C30] flex items-center justify-center z-10"
                          >
                            <Disc3 className="w-4 h-4 text-[#C6C8CB]/60" />
                          </div>
                        )}
                        {renderTrackArtwork('album-art-cover', true)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2.5: Centered 80s Aesthetic Lyrics Bar (Directly Below Cassette Player) */}
          <div
            id="lyrics-strip-slot"
            data-lyrics-alignment="center-below-cassette"
            className={`relative z-20 mx-auto w-full rounded-none ${
              isCompactLandscape ? 'h-[26px] max-h-[26px]' : 'h-[40px] sm:h-[44px] max-h-[44px]'
            } border-t-2 border-[#565A62] bg-[#101215] flex items-center justify-center overflow-hidden shrink-0`}
          >
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
              themeId="cassette-deck"
              onSeek={onSeek}
              className={`mx-auto w-full h-full ${
                isCompactLandscape ? 'max-h-[26px]' : 'max-h-[44px]'
              } !rounded-none rounded-none`}
            />
          </div>
        </div>

        {/* ===================================================================
            (3) BASE ISOLATION FEET (Section 2.2)
                Two low-profile rectangular matte-black rubber isolation feet
                (width: 12% of chassis width, height: 10px, border-radius: 0 0 4px 4px)
                inset 6% from the left and right outer corners, casting a grounded shadow.
            =================================================================== */}
        <div
          id="cas-base-isolation-feet"
          aria-hidden="true"
          className={`relative z-20 w-full ${
            isCompactLandscape ? 'h-[5px]' : 'h-[10px]'
          } px-[6%] flex items-start justify-between shrink-0 pointer-events-none`}
        >
          <span
            data-isolation-foot="left"
            style={{
              width: '12%',
              height: isCompactLandscape ? '5px' : '10px',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)',
            }}
            className="bg-gradient-to-b from-[#23262A] to-[#0D0E10] border-x border-b border-[#3A3E42]"
          />
          <span
            data-isolation-foot="right"
            style={{
              width: '12%',
              height: isCompactLandscape ? '5px' : '10px',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)',
            }}
            className="bg-gradient-to-b from-[#23262A] to-[#0D0E10] border-x border-b border-[#3A3E42]"
          />
        </div>
      </section>
    );
  }
);
