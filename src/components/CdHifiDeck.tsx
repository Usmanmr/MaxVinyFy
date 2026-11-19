import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Repeat,
  Shuffle,
  Disc3,
  Volume2,
  Power,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  formatDuration,
  triggerButtonHaptic,
  resolveActiveArtworkState,
  type TrackItem,
  type DominantThemePalette,
} from '../utils/playerLogic';
import {
  CD_LOADING_TIMELINE_MS,
  CD_HIFI_SYSTEM_PROPORTIONS,
  getCdTrayStagePose,
  computeCdVfdSpectrumBars,
  computeCdSpeakerRgbGlow,
  getNextCdRgbPreset,
  getNextCdPresetEq,
  computeCdVfdFilamentState,
  CD_FULL_WIDTH_EQ_BANDS,
  getCdEqPresetBandGainsDb,
  clampCdEqBandGainDb,
  type CdRgbLightingPreset,
  type CdPresetEqMode,
  type CdVfdDisplayMode,
} from '../utils/cdHifiLogic';
import { usePlaybackSecond } from '../utils/playbackStore';
import { retroAudio } from '../utils/retroAudioEngine';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';

export interface CdHifiDeckProps {
  track: TrackItem;
  isPlaying: boolean;
  isDocumentHidden?: boolean;
  lowPowerMode?: boolean;
  nightMode?: boolean;
  prefersReducedMotion?: boolean;
  compactLandscape?: boolean;
  hideBoxArt?: boolean;
  rpm: 33 | 45;
  pitchPercent: number;
  volume: number;
  vinylCrackle: boolean;
  needleDropCrackle?: boolean;
  crossfadeSec: number;
  repeatOne: boolean;
  shuffleEnabled: boolean;
  themePalette: DominantThemePalette;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (timeSec: number) => void;
  onChangeRpm: (rpm: 33 | 45) => void;
  onChangePitch: (pitch: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleCrackle?: () => void;
  onToggleVinylCrackle?: () => void;
  onToggleNeedleDropCrackle?: () => void;
  onChangeCrossfade?: (sec: number) => void;
  onChangeCrossfadeSec?: (sec: number) => void;
  onToggleRepeatOne: () => void;
  onToggleShuffle: () => void;
  onToggleLowPowerMode?: () => void;
  onToggleNightMode?: () => void;
  onScratch: (intensity: 'light' | 'classic' | 'backspin') => void;
  onResolvedAlbumArt?: (url: string, samples: [number, number, number][]) => void;
  onAlbumArtUnavailable?: () => void;
}

/**
 * 2.2 Left & Right Full-Area Multi-Driver Acoustic Speaker Array:
 * - Main Speaker Enclosure scaled down by 30% (70% width of speaker stage) with thinned top rectangular tweeter housing (height: 12%),
 *   concentric lathed chrome woofer bezel, audio-reactive RGB rings, and dual lower bass-reflex ports.
 * - Flanking 30% Multi-Driver Auxiliary Speaker Tower packing the remaining side stage with dual mid-range RGB cones,
 *   auxiliary sub-bass driver, flared bass-reflex port hole, hex corner screws, stamped ventilation slots, and laser-etched dB markings.
 */
const BookshelfKevlarSpeaker = React.memo<{
  side: 'left' | 'right';
  coneScale: number;
  dustCapOffsetPx: number;
  ringRgbHex: string;
  portRgbHex: string;
  ringGlowOpacity: number;
  portGlowOpacity: number;
  grooveBassBoost: boolean;
  prefersReducedMotion: boolean;
  compact: boolean;
}>(
  ({
    side,
    coneScale,
    dustCapOffsetPx,
    ringRgbHex,
    portRgbHex,
    ringGlowOpacity,
    portGlowOpacity,
    grooveBassBoost,
    prefersReducedMotion,
    compact,
  }) => {
    const effectiveScale = prefersReducedMotion ? 1 : coneScale;
    const effectiveOffset = prefersReducedMotion ? 0 : dustCapOffsetPx;

    // Auxiliary Multi-Driver Speaker Tower (fills the 30% flanking space created by scaling the main speaker by 30%)
    const auxTowerElement = (
      <div
        id={`cd-aux-speaker-tower-${side}`}
        data-aux-speaker-tower={side}
        data-aux-drivers-count={CD_HIFI_SYSTEM_PROPORTIONS.auxDriversCountPerSide}
        className={`cd-aux-speaker-panel relative w-[30%] h-full min-h-0 ${
          side === 'left' ? 'rounded-l-[10px] rounded-r-[2px]' : 'rounded-r-[10px] rounded-l-[2px]'
        } px-1 py-1.5 sm:px-1.5 sm:py-2 flex flex-col items-center justify-between overflow-hidden`}
      >
        {/* Top Industrial Hex Corner Screws & Stamped Ventilation Slots */}
        <div className="w-full flex items-center justify-between px-0.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#334155] border border-[#0F172A] shadow-inner flex items-center justify-center">
            <span className="w-0.5 h-0.5 rounded-full bg-[#94A3B8]" />
          </span>
          <div className="flex items-center gap-[2px]">
            <span className="w-2 h-[2px] rounded-full bg-[#1E293B]" />
            <span className="w-2 h-[2px] rounded-full bg-[#1E293B]" />
            <span className="w-2 h-[2px] rounded-full bg-[#1E293B]" />
          </div>
          <span className="w-2 h-2 rounded-full bg-[#334155] border border-[#0F172A] shadow-inner flex items-center justify-center">
            <span className="w-0.5 h-0.5 rounded-full bg-[#94A3B8]" />
          </span>
        </div>

        {/* Laser-Etched Acoustic Telemetry Marking + Status LED Pip */}
        <div className="w-full flex items-center justify-between px-1 py-0.5 rounded-[2px] bg-[#0F172A]/85 border border-[#475569]/75 shrink-0">
          <span className="font-mono text-[4.5px] sm:text-[5.5px] font-bold tracking-wider text-[#CBD5E1] truncate">
            98dB·6Ω
          </span>
          <span
            style={{
              backgroundColor: ringRgbHex,
              boxShadow: `0 0 6px ${ringRgbHex}`,
            }}
            className="w-1.5 h-1.5 rounded-full shrink-0"
          />
        </div>

        {/* Auxiliary Driver 1: Upper Mid-Range Cone with Concentric Lathed Metallic Groove Ring & RGB Halo */}
        <div className="cd-concentric-lathed-ring relative w-[86%] max-w-[68px] aspect-square rounded-full p-[3px] sm:p-[4px] border border-[#334155] flex items-center justify-center shrink-0">
          <div
            aria-hidden="true"
            style={{
              opacity: ringGlowOpacity,
              borderColor: portRgbHex,
              boxShadow: `0 0 10px ${portRgbHex}, inset 0 0 8px ${portRgbHex}`,
            }}
            className="pointer-events-none absolute inset-[2px] rounded-full border-[1.5px] z-20"
          />
          <div
            style={{
              transform: `scale(${effectiveScale})`,
              transition: prefersReducedMotion ? 'none' : 'transform 75ms ease-out',
            }}
            className="cd-kevlar-cone w-full h-full rounded-full border border-white/25 flex items-center justify-center"
          >
            <div className="w-[38%] h-[38%] rounded-full bg-gradient-to-br from-[#E2E8F0] via-[#475569] to-[#0F172A] border border-white/50" />
          </div>
        </div>

        {/* Auxiliary Driver 2: Lower Mid-Woofer Cone with Concentric Lathed Metallic Groove Ring & RGB Halo */}
        <div className="cd-concentric-lathed-ring relative w-[90%] max-w-[74px] aspect-square rounded-full p-[3px] sm:p-[4px] border border-[#334155] flex items-center justify-center shrink-0">
          <div
            aria-hidden="true"
            style={{
              opacity: ringGlowOpacity,
              borderColor: ringRgbHex,
              boxShadow: `0 0 12px ${ringRgbHex}, inset 0 0 10px ${ringRgbHex}`,
            }}
            className="pointer-events-none absolute inset-[2px] rounded-full border-[1.5px] z-20"
          />
          <div
            style={{
              transform: `scale(${effectiveScale})`,
              transition: prefersReducedMotion ? 'none' : 'transform 75ms ease-out',
            }}
            className="cd-kevlar-cone w-full h-full rounded-full border border-white/25 flex items-center justify-center"
          >
            <div className="w-[40%] h-[40%] rounded-full bg-gradient-to-br from-[#94A3B8] via-[#1E293B] to-[#090D16] border border-white/45" />
          </div>
        </div>

        {/* Auxiliary Driver 3: Deep Recessed Circular Sub-Bass Reflex Port with Flared Metallic Collar */}
        <div className="cd-concentric-lathed-ring relative w-[64%] max-w-[46px] aspect-square rounded-full p-[2.5px] border border-[#334155] flex items-center justify-center shrink-0">
          <div className="w-full h-full rounded-full bg-[#04060A] shadow-[inset_0_4px_8px_rgba(0,0,0,0.98)] flex items-center justify-center overflow-hidden">
            <span
              aria-hidden="true"
              style={{
                opacity: portGlowOpacity,
                background: `radial-gradient(circle, ${ringRgbHex} 0%, transparent 72%)`,
              }}
              className="w-[82%] h-[82%] rounded-full"
            />
          </div>
        </div>

        {/* Bottom Hex Corner Screws & Laser-Etched Sub-Array Label */}
        <div className="w-full flex items-center justify-between px-0.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#334155] border border-[#0F172A] shadow-inner" />
          <span className="font-mono text-[4.5px] sm:text-[5px] font-extrabold tracking-widest text-[#1E293B] uppercase">
            SUB-ARRAY
          </span>
          <span className="w-2 h-2 rounded-full bg-[#334155] border border-[#0F172A] shadow-inner" />
        </div>
      </div>
    );

    return (
      <div
        id={`cd-speaker-${side}`}
        data-speaker-side={side}
        data-speaker-width-pct={CD_HIFI_SYSTEM_PROPORTIONS.leftSpeakerWidthPct}
        data-main-speaker-scale={CD_HIFI_SYSTEM_PROPORTIONS.mainSpeakerScaleFactor}
        data-rgb-ring-hex={ringRgbHex}
        data-rgb-port-hex={portRgbHex}
        aria-label={`Sony Hi-Fi ${side === 'left' ? 'Left' : 'Right'} Multi-Driver RGB Bass-Reflex Speaker Array`}
        className="relative h-full min-h-0 flex flex-col justify-between select-none"
      >
        {/* Full-Area Multi-Driver Speaker Stage: 70% Scaled Main Speaker + 30% Flanking Multi-Driver Tower */}
        <div className="relative flex-1 min-h-0 w-full flex items-stretch gap-[2px]">
          {side === 'left' && auxTowerElement}

          {/* 30% Smaller Main Speaker Unit (70% Width of Speaker Column) */}
          <div
            data-testid={`cd-main-speaker-cabinet-${side}`}
            className="cd-speaker-silver-baffle relative w-[70%] h-full min-h-0 rounded-[4px] flex flex-col items-center justify-between px-1.5 py-1.5 sm:px-2.5 sm:py-2 overflow-hidden"
          >
            {/* Top Hex Corner Screws & Stamped Acoustic Vent Slots */}
            <div className="relative z-20 w-full flex items-center justify-between px-0.5 pb-0.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#475569] border border-[#1E293B] shadow-inner" />
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-[2px] rounded-full bg-[#334155]" />
                <span className="font-mono text-[5px] font-bold tracking-[0.16em] text-[#1E293B] uppercase">
                  SS-RG440 · +6dB
                </span>
                <span className="w-2.5 h-[2px] rounded-full bg-[#334155]" />
              </div>
              <span className="w-2 h-2 rounded-full bg-[#475569] border border-[#1E293B] shadow-inner" />
            </div>

            {/* Vertical Architectural Side Pilasters (Left & Right Flanks) */}
            <div
              aria-hidden="true"
              className="cd-speaker-side-pilaster pointer-events-none absolute inset-y-2 left-0 w-[5px] sm:w-[6px] rounded-r-[3px] z-10"
            />
            <div
              aria-hidden="true"
              className="cd-speaker-side-pilaster pointer-events-none absolute inset-y-2 right-0 w-[5px] sm:w-[6px] rounded-l-[3px] z-10"
            />

            {/* THINNED Top Rectangular Horn-Loaded Tweeter Housing (Sleek & Thin height: ~12% of cabinet height) */}
            <div
              data-horn-waveguide-pct={CD_HIFI_SYSTEM_PROPORTIONS.hornWaveguideHeightPct}
              style={{ height: `${CD_HIFI_SYSTEM_PROPORTIONS.hornWaveguideHeightPct}%` }}
              className="cd-horn-waveguide relative z-20 w-[90%] min-h-[22px] sm:min-h-[28px] rounded-[4px] flex items-center justify-between px-2 overflow-hidden shrink-0"
            >
              {/* Sharp Chamfered Silver Inner Bezel */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[2px] rounded-[3px] border border-white/35 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]"
              />
              <span className="relative z-10 font-mono text-[4.5px] sm:text-[5px] font-bold tracking-widest text-[#94A3B8] uppercase">
                HORN TWEETER
              </span>
              {/* Deep Matte-Black Throat & Conical Tweeter Phase Dome with Radial Light Reflections */}
              <div className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-b from-[#090C12] to-[#161B24] border border-[#94A3B8] shadow-[inset_0_2px_6px_rgba(0,0,0,0.95)] flex items-center justify-center">
                <div
                  style={{
                    boxShadow: `0 0 10px ${ringRgbHex}88`,
                  }}
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[conic-gradient(from_45deg,#F8FAFC,#64748B,#E2E8F0,#1E293B,#F8FAFC)] border border-white/80"
                />
              </div>
              <span className="relative z-10 font-mono text-[4.5px] sm:text-[5px] font-bold tracking-widest text-[#00F0FF] uppercase">
                20kHz
              </span>
            </div>

            {/* Center-to-Lower Baffle Section: Main Woofer with Precision-Lathed Concentric Grooves + Dual Lower Bass-Reflex Ports */}
            <div className="relative z-20 flex-1 min-h-0 w-full flex flex-col items-center justify-center my-0.5">
              {/* Circular Main Woofer Assembly with Precision-Lathed Concentric Metallic Grooves */}
              <div
                data-woofer-diameter-pct={CD_HIFI_SYSTEM_PROPORTIONS.wooferDiameterPct}
                style={{
                  width: `${CD_HIFI_SYSTEM_PROPORTIONS.wooferDiameterPct}%`,
                  maxWidth: compact ? '114px' : '172px',
                }}
                className="cd-woofer-chrome-bezel cd-concentric-lathed-ring relative aspect-square rounded-full p-[5px] sm:p-[7px] flex items-center justify-center z-20"
              >
                {/* Stepped Precision-Lathed Concentric Chrome Inner Groove Rings */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[2px] rounded-full border border-white/65"
                />
                {/* Dynamic Addressable RGB LED Illumination Ring Tucked Under Inner Bezel Lip */}
                <div
                  aria-hidden="true"
                  data-testid={`cd-rgb-woofer-ring-${side}`}
                  style={{
                    opacity: ringGlowOpacity,
                    borderColor: ringRgbHex,
                    boxShadow: `0 0 18px ${ringRgbHex}, inset 0 0 16px ${ringRgbHex}`,
                  }}
                  className="pointer-events-none absolute inset-[4px] sm:inset-[6px] rounded-full border-[2.5px] z-30 transition-opacity duration-75"
                />

                {/* Thick Black Rubber Accordion Surround */}
                <div className="relative w-full h-full rounded-full bg-gradient-to-b from-[#0A0D12] via-[#171C24] to-[#090B0F] p-[5px] sm:p-[7px] border-[2.5px] border-[#1F242D] shadow-[inset_0_4px_10px_rgba(0,0,0,0.95)] flex items-center justify-center overflow-hidden">
                  {/* Textured Royal/Cobalt Woven-Cone Diaphragm with Real-Time Audio Excursion */}
                  <div
                    data-testid={`kevlar-woofer-cone-${side}`}
                    style={{
                      transform: `scale(${effectiveScale})`,
                      transition: prefersReducedMotion ? 'none' : 'transform 65ms ease-out',
                      boxShadow: `inset 0 0 24px ${ringRgbHex}55, inset 0 6px 16px rgba(0,0,0,0.82)`,
                    }}
                    className="cd-kevlar-cone relative w-full h-full rounded-full border border-[#60A5FA]/50 flex items-center justify-center"
                  >
                    {/* Concentric Cone Ribbing */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[15%] rounded-full border border-white/20"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[30%] rounded-full border border-black/40"
                    />

                    {/* Large Dark-Chrome Central Dust Cap */}
                    <div
                      style={{
                        transform: `translateY(${-effectiveOffset}px)`,
                        transition: prefersReducedMotion ? 'none' : 'transform 65ms ease-out',
                        boxShadow: grooveBassBoost
                          ? `0 0 16px ${ringRgbHex}, 0 4px 10px rgba(0,0,0,0.9)`
                          : '0 4px 10px rgba(0,0,0,0.9)',
                      }}
                      className="w-[38%] h-[38%] rounded-full bg-gradient-to-br from-[#64748B] via-[#1E293B] to-[#090D16] border border-white/50 flex items-center justify-center"
                    >
                      <div className="w-[45%] h-[45%] rounded-full bg-gradient-to-tr from-transparent via-white/25 to-white/50 opacity-65" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Dual Deeply Recessed Circular Lower Bass-Reflex Ports with Flared Metallic Collars */}
              <div className="relative z-10 w-[90%] -mt-1 sm:-mt-1.5 flex items-center justify-between px-0.5">
                {(['left-port', 'right-port'] as const).map((portKey) => (
                  <div
                    key={portKey}
                    data-bass-reflex-port={portKey}
                    data-port-diameter-pct={CD_HIFI_SYSTEM_PROPORTIONS.bassReflexPortDiameterPct}
                    style={{
                      width: `${CD_HIFI_SYSTEM_PROPORTIONS.bassReflexPortDiameterPct + 5}%`,
                      maxWidth: compact ? '30px' : '42px',
                    }}
                    className="cd-concentric-lathed-ring relative aspect-square rounded-full p-[2.5px] sm:p-[3px] border border-[#334155] shadow-[0_3px_8px_rgba(0,0,0,0.78)] flex items-center justify-center"
                  >
                    {/* Deep Circular Flared Black Port Tunnel with Internal RGB Illumination */}
                    <div className="relative w-full h-full rounded-full bg-[#05070B] shadow-[inset_0_4px_8px_rgba(0,0,0,0.98)] flex items-center justify-center overflow-hidden">
                      <span
                        aria-hidden="true"
                        style={{
                          opacity: portGlowOpacity,
                          background: `radial-gradient(circle, ${portRgbHex} 0%, transparent 72%)`,
                        }}
                        className="w-[84%] h-[84%] rounded-full transition-opacity duration-75"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lower Silver Bridge with Recessed Hex Corner Screw Ports & Embossed SONY Badge */}
            <div className="relative z-20 w-full pt-0.5 flex items-center justify-between px-1 shrink-0">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full bg-[#475569] border border-[#1E293B] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)] flex items-center justify-center"
              >
                <span className="w-1 h-1 rounded-full bg-[#0F172A]" />
              </span>

              <div className="px-2 py-0.5 rounded-[2px] bg-gradient-to-b from-[#E2E8F0] to-[#94A3B8] border border-[#64748B] shadow-xs">
                <span className="font-display text-[6.5px] sm:text-[7.5px] font-black tracking-[0.22em] text-[#0F172A]">
                  SONY
                </span>
              </div>

              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-full bg-[#475569] border border-[#1E293B] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)] flex items-center justify-center"
              >
                <span className="w-1 h-1 rounded-full bg-[#0F172A]" />
              </span>
            </div>
          </div>

          {side === 'right' && auxTowerElement}
        </div>

        {/* Short Stepped Silver/Charcoal Isolation Feet Along Level Bottom Baseline */}
        <div
          aria-hidden="true"
          className="w-full h-[8px] px-[10%] flex items-start justify-between shrink-0"
        >
          <span className="w-[24%] h-full rounded-b-[3px] bg-gradient-to-b from-[#94A3B8] via-[#334155] to-[#0F172A] border-x border-b border-[#1E293B] shadow-md" />
          <span className="w-[24%] h-full rounded-b-[3px] bg-gradient-to-b from-[#94A3B8] via-[#334155] to-[#0F172A] border-x border-b border-[#1E293B] shadow-md" />
        </div>
      </div>
    );
  }
);

export const CdHifiDeck: React.FC<CdHifiDeckProps> = React.memo(
  ({
    track,
    isPlaying,
    isDocumentHidden = false,
    lowPowerMode = false,
    nightMode = false,
    prefersReducedMotion = false,
    compactLandscape = false,
    hideBoxArt = false,
    pitchPercent,
    volume,
    repeatOne,
    shuffleEnabled,
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
    onToggleNightMode,
    onScratch,
  }) => {
    const isStandby = track.id === 'standby-empty';
    const currentSecond = usePlaybackSecond();

    // Receiver hardware states
    const [receiverPowered, setReceiverPowered] = useState<boolean>(true);
    const [activeDiscSlot, setActiveDiscSlot] = useState<1 | 2 | 3>(1);
    const [grooveBassBoost, setGrooveBassBoost] = useState<boolean>(true);
    const [presetEqMode, setPresetEqMode] = useState<CdPresetEqMode>('ROCK');
    const [eqBandGainsDb, setEqBandGainsDb] = useState<number[]>(() =>
      getCdEqPresetBandGainsDb('ROCK')
    );
    const [vfdDisplayMode, setVfdDisplayMode] = useState<CdVfdDisplayMode>('SPECTRUM');
    const [rgbPreset, setRgbPreset] = useState<CdRgbLightingPreset>('BEAT_SPECTRUM');
    const [tunerBandLabel, setTunerBandLabel] = useState<'CD' | 'FM 101.5' | 'AM 980'>('CD');
    const [isTrayManuallyOpen, setIsTrayManuallyOpen] = useState<boolean>(false);
    const [vfdFilamentDip, setVfdFilamentDip] = useState<boolean>(false);
    const vfdDipTimerRef = useRef<number | null>(null);

    // Live 60fps Beat-Reactive Frequency Analyzer State for 100% Full-Width Equalizer & RGB Speakers
    const [beatFrameState, setBeatFrameState] = useState<{
      phaseSec: number;
      leftVu: number;
      rightVu: number;
    }>({ phaseSec: 0, leftVu: 0, rightVu: 0 });

    useEffect(() => {
      if (!isPlaying || !receiverPowered || isStandby || isDocumentHidden || prefersReducedMotion) {
        return;
      }
      let rafId = 0;
      let lastUpdate = 0;
      const tick = (now: number) => {
        if (now - lastUpdate >= 45) {
          lastUpdate = now;
          const phaseSec = now / 1000;
          const volScale = Math.max(0.25, Math.min(1, volume));
          const liveVu = retroAudio.getVuLevels();
          const synthL =
            (0.62 +
              0.26 * Math.abs(Math.sin(phaseSec * 4.2 + 0.4)) +
              0.12 * Math.abs(Math.cos(phaseSec * 7.5))) *
            volScale;
          const synthR =
            (0.6 +
              0.28 * Math.abs(Math.cos(phaseSec * 3.9 + 0.8)) +
              0.12 * Math.abs(Math.sin(phaseSec * 6.8))) *
            volScale;
          setBeatFrameState({
            phaseSec,
            leftVu: Math.min(1, Math.max(liveVu.left * volScale, synthL)),
            rightVu: Math.min(1, Math.max(liveVu.right * volScale, synthR)),
          });
        }
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
      };
    }, [isPlaying, receiverPowered, isStandby, isDocumentHidden, prefersReducedMotion, volume]);

    const visualLevels = useMemo(() => {
      if (!isPlaying || !receiverPowered || isStandby || isDocumentHidden) {
        return { leftVu: 0, rightVu: 0, phaseSec: currentSecond };
      }
      if (beatFrameState.phaseSec > 0 && !prefersReducedMotion) {
        return beatFrameState;
      }
      const volScale = Math.max(0.25, Math.min(1, volume));
      const leftVu = Math.min(
        1,
        (0.62 + 0.28 * Math.abs(Math.sin(currentSecond * 2.1 + 0.4))) * volScale
      );
      const rightVu = Math.min(
        1,
        (0.6 + 0.3 * Math.abs(Math.cos(currentSecond * 1.9 + 0.8))) * volScale
      );
      return { leftVu, rightVu, phaseSec: currentSecond };
    }, [
      isPlaying,
      receiverPowered,
      isStandby,
      isDocumentHidden,
      volume,
      currentSecond,
      beatFrameState,
      prefersReducedMotion,
    ]);

    const handleSelectEqPreset = useCallback(
      (nextPreset: CdPresetEqMode) => {
        triggerButtonHaptic(lowPowerMode);
        setPresetEqMode(nextPreset);
        setEqBandGainsDb(getCdEqPresetBandGainsDb(nextPreset));
      },
      [lowPowerMode]
    );

    const handleAdjustEqBand = useCallback((bandIdx: number, nextDb: number) => {
      const clamped = clampCdEqBandGainDb(nextDb);
      setEqBandGainsDb((prev) => prev.map((v, idx) => (idx === bandIdx ? clamped : v)));
    }, []);

    // 4-Stage Mechanical CD Tray Loading Choreography (~1,600ms)
    const [loadingElapsedMs, setLoadingElapsedMs] = useState<number | null>(null);
    const prevTrackIdRef = useRef<string>(track.id);
    const loadingTimerRef = useRef<number | null>(null);

    const startMechanicalLoadingSequence = useCallback(() => {
      if (prefersReducedMotion || isDocumentHidden) {
        setLoadingElapsedMs(null);
        return;
      }
      if (loadingTimerRef.current !== null) {
        window.clearInterval(loadingTimerRef.current);
      }
      if (vfdDipTimerRef.current !== null) {
        window.clearTimeout(vfdDipTimerRef.current);
      }
      setVfdFilamentDip(true);
      vfdDipTimerRef.current = window.setTimeout(() => {
        setVfdFilamentDip(false);
        vfdDipTimerRef.current = null;
      }, 145);

      const startedAt = performance.now();
      setLoadingElapsedMs(0);
      loadingTimerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        if (elapsed >= CD_LOADING_TIMELINE_MS.laserReadEndMs + 80) {
          setLoadingElapsedMs(null);
          if (loadingTimerRef.current !== null) {
            window.clearInterval(loadingTimerRef.current);
            loadingTimerRef.current = null;
          }
        } else {
          setLoadingElapsedMs(Math.round(elapsed));
        }
      }, 32);
    }, [prefersReducedMotion, isDocumentHidden]);

    useEffect(() => {
      if (prevTrackIdRef.current !== track.id && !isStandby) {
        prevTrackIdRef.current = track.id;
        setIsTrayManuallyOpen(false);
        // Rotate active disc slot indicator (1 -> 2 -> 3) on track change
        setActiveDiscSlot((prev) => ((prev % 3) + 1) as 1 | 2 | 3);
        retroAudio.triggerCdTrackChangeCue();
        startMechanicalLoadingSequence();
      }
    }, [track.id, isStandby, startMechanicalLoadingSequence]);

    useEffect(() => {
      return () => {
        if (loadingTimerRef.current !== null) {
          window.clearInterval(loadingTimerRef.current);
        }
        if (vfdDipTimerRef.current !== null) {
          window.clearTimeout(vfdDipTimerRef.current);
        }
      };
    }, []);

    const stagePose = useMemo(() => {
      if (isTrayManuallyOpen) {
        return {
          phase: 'disc-loading' as const,
          trayExtension01: 1,
          trayTiltDeg: 18,
          discFlightProgress01: 1,
          discDropBouncePx: 0,
          discSeated01: 1,
          magneticClamper01: 0,
          laserFocusPulse01: 0,
          openCloseBtnDepressed: true,
          discSpinDurationSec: 0,
          vfdStatusLabel: 'TRAY OPEN',
        };
      }
      return getCdTrayStagePose(
        loadingElapsedMs,
        isPlaying && receiverPowered,
        isStandby || !receiverPowered
      );
    }, [isTrayManuallyOpen, loadingElapsedMs, isPlaying, receiverPowered, isStandby]);

    // VFD 11-band spectrum analyzer bars (driven at 60fps by visualLevels.phaseSec)
    const vfdSpectrumBars = useMemo(
      () =>
        computeCdVfdSpectrumBars(
          visualLevels.leftVu,
          visualLevels.rightVu,
          visualLevels.phaseSec,
          grooveBassBoost,
          isPlaying && receiverPowered && !isStandby && !isDocumentHidden
        ),
      [
        visualLevels.leftVu,
        visualLevels.rightVu,
        visualLevels.phaseSec,
        grooveBassBoost,
        isPlaying,
        receiverPowered,
        isStandby,
        isDocumentHidden,
      ]
    );

    // Dynamic RGB Speaker Lighting & Cone Excursion (scale 1.0 to 1.07)
    const rgbSpeakerState = useMemo(
      () =>
        computeCdSpeakerRgbGlow(
          visualLevels.leftVu,
          visualLevels.rightVu,
          visualLevels.phaseSec,
          rgbPreset,
          grooveBassBoost,
          isPlaying && receiverPowered && !isStandby && !isDocumentHidden
        ),
      [
        visualLevels.leftVu,
        visualLevels.rightVu,
        visualLevels.phaseSec,
        rgbPreset,
        grooveBassBoost,
        isPlaying,
        receiverPowered,
        isStandby,
        isDocumentHidden,
      ]
    );

    const vfdFilament = useMemo(
      () => computeCdVfdFilamentState(nightMode, vfdFilamentDip),
      [nightMode, vfdFilamentDip]
    );

    // Artwork resolution for the optical disc label and draggable jewel case sleeve
    const [failedArtCount, setFailedArtCount] = useState(0);
    useEffect(() => {
      setFailedArtCount(0);
    }, [track.id]);

    const artState = useMemo(
      () => resolveActiveArtworkState(track, failedArtCount),
      [track, failedArtCount]
    );

    // Draggable CD Jewel Case Holder Box (#album-art-holder-box)
    const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDraggingHolder, setIsDraggingHolder] = useState<boolean>(false);
    const holderDragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Interactive Master Volume Dial Dragging
    const volumeDialDragRef = useRef<{ active: boolean; startY: number; startVol: number }>({
      active: false,
      startY: 0,
      startVol: volume,
    });

    const handleToggleTrayEject = () => {
      triggerButtonHaptic(lowPowerMode);
      const nextOpen = !isTrayManuallyOpen;
      setIsTrayManuallyOpen(nextOpen);
      retroAudio.triggerCdTrayServoSound(nextOpen);
      if (!nextOpen && !isStandby) {
        startMechanicalLoadingSequence();
      }
    };

    const handleSelectDiscSlot = (slot: 1 | 2 | 3) => {
      triggerButtonHaptic(lowPowerMode);
      setActiveDiscSlot(slot);
      retroAudio.triggerCdLaserSpinUpSound();
      if (slot !== activeDiscSlot && !isStandby) {
        onNext();
      }
    };

    const handleCycleRgbPreset = () => {
      triggerButtonHaptic(lowPowerMode);
      setRgbPreset((prev) => getNextCdRgbPreset(prev));
      retroAudio.triggerCdLaserSpinUpSound();
    };

    const volumePct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
    const volumeDialAngleDeg = -135 + (volumePct / 100) * 270;
    const safeDuration = Math.max(1, track.durationSec || 1);
    const remainingSec = Math.max(0, safeDuration - currentSecond);

    return (
      <section
        id="turntable-console-root"
        aria-label="2000s Sony Mini Hi-Fi 3-Disc Component Audio System"
        className="panel-contain relative w-full h-full min-h-0 flex flex-col justify-between select-none overflow-hidden"
      >
        {/* =========================================================================
            1.1 EXACT THREE-COLUMN PROPORTIONS & FLUSH COMPONENT ALIGNMENT (34% | 32% | 34%)
            Left Speaker (34%) | Central Receiver/CD Unit (32%) | Right Speaker (34%)
            ========================================================================= */}
        <div
          id="cd-hifi-shelf-system"
          data-system-proportions="34-32-34"
          className="relative flex-1 min-h-0 w-full grid grid-cols-[34%_32%_34%] gap-0 items-stretch"
        >
          {/* LEFT BOOKSHELF SPEAKER (34% Width) */}
          <BookshelfKevlarSpeaker
            side="left"
            coneScale={rgbSpeakerState.leftConeScale}
            dustCapOffsetPx={rgbSpeakerState.leftDustCapOffsetPx}
            ringRgbHex={rgbSpeakerState.leftRingHex}
            portRgbHex={rgbSpeakerState.leftPortHex}
            ringGlowOpacity={rgbSpeakerState.ringGlowOpacity}
            portGlowOpacity={rgbSpeakerState.portGlowOpacity}
            grooveBassBoost={grooveBassBoost}
            prefersReducedMotion={prefersReducedMotion}
            compact={compactLandscape}
          />

          {/* =====================================================================
              1.3 CENTRAL RECEIVER UNIT (32% Width)
              - Top SONY Chrome Badge + Smoked-Acrylic VFD Window + 2x3 Silver Rocker Bars
              - Middle: Left & Right Vertical Utility Strips Flanking Dead-Center Master Volume Knob
              - Lower Half: Enlarged Smoked-Glass CD Playing Bay & 4-Stage Loading Animation
              ===================================================================== */}
          <div
            id="cd-receiver-unit"
            data-receiver-width-pct={CD_HIFI_SYSTEM_PROPORTIONS.centerReceiverWidthPct}
            className="h-full min-h-0 flex flex-col justify-between select-none"
          >
            <div className="cd-silver-fascia relative flex-1 min-h-0 w-full rounded-[4px] px-1.5 py-1.5 sm:px-2 sm:py-2 flex flex-col justify-between gap-1 overflow-hidden">
              {/* TOP SECTION: SONY Chrome Badge + Smoked-Acrylic VFD + 2 Rows of 3 Silver Rocker Buttons */}
              <div className="w-full flex flex-col gap-1 shrink-0">
                {/* Top Header Strip with SONY Chrome Emblem & Model Engraving */}
                <div className="flex items-center justify-between px-1">
                  <span className="font-mono text-[6px] sm:text-[6.5px] font-bold tracking-[0.14em] text-[#334155] uppercase truncate">
                    MHC-RG440S
                  </span>
                  <div className="px-2 py-[1px] rounded-[2px] bg-gradient-to-b from-[#F8FAFC] to-[#CBD5E1] border border-[#64748B] shadow-xs">
                    <span className="font-display text-[8px] sm:text-[9.5px] font-black tracking-[0.25em] text-[#0F172A]">
                      SONY
                    </span>
                  </div>
                  <span className="font-mono text-[6px] sm:text-[6.5px] font-bold tracking-[0.12em] text-[#1E3A8A] uppercase truncate">
                    3CD · MP3
                  </span>
                </div>

                {/* Smoked-Acrylic Vacuum Fluorescent Display (VFD) Window */}
                <div
                  id="cd-vfd-display"
                  data-vfd-mode={vfdDisplayMode}
                  data-vfd-dim-state={vfdFilament.dimLabel}
                  style={{
                    opacity: vfdFilament.filamentOpacity,
                    transition: prefersReducedMotion ? 'none' : 'opacity 120ms ease-out',
                  }}
                  className="cd-vfd-window relative rounded-[5px] px-2 py-1 flex flex-col justify-between gap-0.5 shrink-0 overflow-hidden"
                >
                  {/* Top Row: Disc Indicators (DISC 1/2/3) + Track / Time Counter (`13   54:34`) */}
                  <div className="flex items-center justify-between gap-1 border-b border-[#1E293B] pb-0.5">
                    <div className="flex items-center gap-0.5">
                      {([1, 2, 3] as const).map((slotNum) => {
                        const isActiveSlot = activeDiscSlot === slotNum;
                        return (
                          <span
                            key={slotNum}
                            className={`px-1 py-[0.5px] rounded-[2px] font-mono text-[6px] sm:text-[6.5px] font-bold tracking-wider border ${
                              isActiveSlot && receiverPowered
                                ? 'border-[#00F0FF] bg-[#00F0FF]/15 text-[#00F0FF]'
                                : 'border-[#334155]/60 text-[#475569]'
                            }`}
                          >
                            D{slotNum}
                          </span>
                        );
                      })}
                      <span className="ml-0.5 font-mono text-[6.5px] font-bold text-[#FF9F0A] uppercase truncate">
                        {tunerBandLabel}
                      </span>
                    </div>

                    {/* VFD Amber/Cyan Track & Elapsed Time Counter */}
                    <div
                      id="cd-vfd-time-readout"
                      className="font-mono text-[9.5px] sm:text-[11px] font-bold tracking-[0.12em] tabular-nums flex items-center gap-1"
                    >
                      <span className="cd-vfd-amber-glow">
                        {receiverPowered ? String(activeDiscSlot).padStart(2, '0') : '--'}
                      </span>
                      <span className="cd-vfd-cyan-glow">
                        {!receiverPowered
                          ? '--:--'
                          : stagePose.phase !== 'spinning-play' && stagePose.phase !== 'closed-idle'
                            ? stagePose.vfdStatusLabel
                            : vfdDisplayMode === 'TIME_REMAIN'
                              ? `-${formatDuration(remainingSec)}`
                              : formatDuration(currentSecond)}
                      </span>
                    </div>
                  </div>

                  {/* Live Bouncing VFD Spectrum Bars + Track Scroller */}
                  <div className="flex items-end justify-between gap-1.5 min-h-[24px] sm:min-h-[28px]">
                    <div className="min-w-0 flex-1 flex flex-col justify-between">
                      <div className="font-mono text-[7.5px] sm:text-[8.5px] font-bold uppercase tracking-wider truncate cd-vfd-cyan-glow">
                        {!receiverPowered
                          ? 'SYSTEM STANDBY'
                          : isStandby
                            ? 'NO DISC · CONNECT SPOTIFY'
                            : `${track.title} — ${track.artist}`}
                      </div>
                      {/* Optical Seek Scrubber inside VFD */}
                      <input
                        id="cd-vfd-seek-bar"
                        type="range"
                        min={0}
                        max={safeDuration}
                        step={1}
                        value={Math.min(currentSecond, safeDuration)}
                        disabled={isStandby || !receiverPowered}
                        onChange={(e) => onSeek(Number(e.target.value))}
                        aria-label="CD Optical Track Seek Bar"
                        className="w-full h-1 mt-0.5 accent-[#00F0FF] bg-[#0F172A] rounded cursor-pointer"
                      />
                    </div>

                    {/* 11-Band VFD Fluorescent Bar Matrix */}
                    <div
                      id="cd-vfd-spectrum-matrix"
                      aria-hidden="true"
                      className="flex items-end gap-[1.5px] h-[20px] sm:h-[24px] px-1 py-0.5 rounded bg-[#030508] border border-[#1E293B] shrink-0"
                    >
                      {vfdSpectrumBars.slice(0, 8).map((bar) => (
                        <div
                          key={bar.bandIndex}
                          className="w-[4px] sm:w-[5px] h-full flex flex-col-reverse justify-between gap-[1px]"
                        >
                          {Array.from({ length: 8 }, (_, segIdx) => {
                            const segNum = segIdx + 1;
                            const isLit = receiverPowered && segNum <= bar.litSegments;
                            const isPeak = receiverPowered && segNum === bar.peakSegment;
                            return (
                              <span
                                key={segIdx}
                                className={`w-full h-[1.5px] rounded-[0.5px] ${
                                  isPeak
                                    ? 'bg-[#FF3B30]'
                                    : isLit
                                      ? segNum >= 7
                                        ? 'bg-[#FF9F0A]'
                                        : 'bg-[#00F0FF]'
                                      : 'bg-[#0F172A]'
                                }`}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* TWO ROWS OF THREE HORIZONTAL BRUSHED-SILVER TACTILE ROCKER BUTTONS BELOW VFD */}
                <div
                  id="cd-vfd-rocker-bars"
                  className="grid grid-cols-3 gap-1 pt-0.5 shrink-0"
                >
                  {/* Row 1: TUNER/BAND | FUNCTION | GROOVE */}
                  <button
                    id="cd-rocker-tuner-band"
                    type="button"
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      setTunerBandLabel((prev) =>
                        prev === 'CD' ? 'FM 101.5' : prev === 'FM 101.5' ? 'AM 980' : 'CD'
                      );
                    }}
                    className="cd-silver-rocker-btn h-[16px] sm:h-[18px] rounded-[2px] font-mono text-[5.5px] sm:text-[6.5px] font-extrabold text-[#0F172A] tracking-tighter flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                  >
                    TUNER/BAND
                  </button>

                  <button
                    id="cd-rocker-function"
                    type="button"
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onScratch('classic');
                    }}
                    className="cd-silver-rocker-btn h-[16px] sm:h-[18px] rounded-[2px] font-mono text-[5.5px] sm:text-[6.5px] font-extrabold text-[#0F172A] tracking-tighter flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                  >
                    FUNCTION
                  </button>

                  <button
                    id="cd-groove-bass-btn"
                    type="button"
                    aria-pressed={grooveBassBoost}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      setGrooveBassBoost((prev) => !prev);
                    }}
                    className={`h-[16px] sm:h-[18px] rounded-[2px] border font-mono text-[5.5px] sm:text-[6.5px] font-extrabold tracking-tighter flex items-center justify-center gap-0.5 cursor-pointer active:translate-y-[1px] ${
                      grooveBassBoost
                        ? 'bg-[#0F172A] border-[#FF3B30] text-[#FF3B30] shadow-[0_0_6px_rgba(255,59,48,0.4)]'
                        : 'cd-silver-rocker-btn text-[#0F172A]'
                    }`}
                  >
                    <span>GROOVE</span>
                  </button>

                  {/* Row 2: PLAY MODE | REPEAT | DISPLAY */}
                  <button
                    id="cd-btn-shuffle"
                    type="button"
                    aria-pressed={shuffleEnabled}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onToggleShuffle();
                    }}
                    aria-label="Toggle Play Mode / Shuffle"
                    className={`h-[16px] sm:h-[18px] rounded-[2px] border font-mono text-[5.5px] sm:text-[6.5px] font-extrabold tracking-tighter flex items-center justify-center gap-0.5 cursor-pointer active:translate-y-[1px] ${
                      shuffleEnabled
                        ? 'bg-[#0F172A] border-[#00F0FF] text-[#00F0FF]'
                        : 'cd-silver-rocker-btn text-[#0F172A]'
                    }`}
                  >
                    <Shuffle className="w-2 h-2 hidden sm:inline" />
                    <span>PLAY MODE</span>
                  </button>

                  <button
                    id="cd-btn-repeat"
                    type="button"
                    aria-pressed={repeatOne}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onToggleRepeatOne();
                    }}
                    aria-label="Toggle Repeat Track"
                    className={`h-[16px] sm:h-[18px] rounded-[2px] border font-mono text-[5.5px] sm:text-[6.5px] font-extrabold tracking-tighter flex items-center justify-center gap-0.5 cursor-pointer active:translate-y-[1px] ${
                      repeatOne
                        ? 'bg-[#0F172A] border-[#FF9F0A] text-[#FF9F0A]'
                        : 'cd-silver-rocker-btn text-[#0F172A]'
                    }`}
                  >
                    <Repeat className="w-2 h-2 hidden sm:inline" />
                    <span>REPEAT</span>
                  </button>

                  <button
                    id="cd-vfd-display-mode-btn"
                    type="button"
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      const nextMode: CdVfdDisplayMode =
                        vfdDisplayMode === 'SPECTRUM'
                          ? 'TIME_REMAIN'
                          : vfdDisplayMode === 'TIME_REMAIN'
                            ? 'LYRICS_MATRIX'
                            : 'SPECTRUM';
                      setVfdDisplayMode(nextMode);
                    }}
                    aria-label={`VFD Display Mode (${vfdDisplayMode})`}
                    className="cd-silver-rocker-btn h-[16px] sm:h-[18px] rounded-[2px] font-mono text-[5.5px] sm:text-[6.5px] font-extrabold text-[#0F172A] tracking-tighter flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                  >
                    DISPLAY
                  </button>
                </div>

                {/* 2.3 100% FULL-WIDTH BEAT-SYNCHRONIZED MIDDLE EQUALIZER SCREEN */}
                <div
                  id="cd-full-width-equalizer"
                  data-eq-preset={presetEqMode}
                  data-full-width-eq="100pct"
                  aria-label="Full-Width 7-Band Graphic Equalizer"
                  className="cd-full-width-eq-deck -mx-1.5 sm:-mx-2 w-[calc(100%+12px)] sm:w-[calc(100%+16px)] rounded-none border-x-0 px-2 py-1 flex flex-col gap-1 shrink-0"
                >
                  {/* Top Bar: Full-Width EQ Header + Live Bass Pulse Readout + Preset Selector Pills */}
                  <div className="w-full flex items-center justify-between gap-1 border-b border-[#1E293B] pb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        style={{
                          backgroundColor: rgbSpeakerState.leftRingHex,
                          boxShadow: `0 0 6px ${rgbSpeakerState.leftRingHex}`,
                        }}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                      />
                      <span className="font-mono text-[5.5px] sm:text-[6px] font-extrabold tracking-[0.14em] text-[#00F0FF] uppercase truncate">
                        FULL-WIDTH BEAT EQ · {Math.round(rgbSpeakerState.bassEnergy01 * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {(['ROCK', 'POP', 'JAZZ', 'FLAT'] as const).map((preset) => {
                        const isActivePreset = presetEqMode === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleSelectEqPreset(preset)}
                            aria-pressed={isActivePreset}
                            className={`px-1 py-[0.5px] rounded-[2px] font-mono text-[5px] sm:text-[5.5px] font-extrabold cursor-pointer ${
                              isActivePreset
                                ? 'bg-[#00F0FF]/20 border border-[#00F0FF] text-[#00F0FF]'
                                : 'bg-[#141A26] border border-[#334155] text-[#94A3B8]'
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Full-Width 7-Band Interactive Equalizer Sliders + Live Beat-Reactive Multi-Segment Bars & Peak-Hold Caps */}
                  <div className="w-full grid grid-cols-7 gap-1 items-end pt-0.5">
                    {CD_FULL_WIDTH_EQ_BANDS.map((freqLabel, bandIdx) => {
                      const gainDb = eqBandGainsDb[bandIdx] ?? 0;
                      const fillPct = Math.round(((gainDb + 12) / 24) * 100);
                      const specBar = vfdSpectrumBars[bandIdx];
                      const litSegments = receiverPowered && specBar ? specBar.litSegments : 1;
                      const peakSegment = receiverPowered && specBar ? specBar.peakSegment : 1;

                      return (
                        <div
                          key={freqLabel}
                          data-eq-band={freqLabel}
                          data-eq-gain-db={gainDb}
                          data-eq-lit-segments={litSegments}
                          className="relative flex flex-col items-center gap-0.5 min-w-0"
                        >
                          {/* Vertical Fader Track + Live Beat-Synchronized 10-Segment Bar & Peak-Hold Cap */}
                          <div
                            role="slider"
                            tabIndex={0}
                            aria-label={`${freqLabel} Equalizer Band (${gainDb >= 0 ? `+${gainDb}` : gainDb} dB)`}
                            aria-valuemin={-12}
                            aria-valuemax={12}
                            aria-valuenow={gainDb}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              if (rect.height <= 0) return;
                              const ratio = 1 - (e.clientY - rect.top) / rect.height;
                              handleAdjustEqBand(bandIdx, -12 + ratio * 24);
                            }}
                            className="relative w-full h-[24px] sm:h-[28px] rounded-[2px] bg-[#04070C] border border-[#1E293B] p-[1.5px] flex flex-col-reverse justify-between gap-[1px] overflow-hidden cursor-ns-resize"
                          >
                            {Array.from({ length: 10 }, (_, segIdx) => {
                              const segNum = segIdx + 1;
                              const isLit = segNum <= litSegments;
                              const isPeakCap = segNum === peakSegment;
                              return (
                                <span
                                  key={segIdx}
                                  className={`w-full flex-1 rounded-[0.5px] transition-colors duration-75 ${
                                    isPeakCap
                                      ? 'bg-[#FF3B30] shadow-[0_0_4px_#FF3B30]'
                                      : isLit
                                        ? segNum >= 8
                                          ? 'bg-[#FF9F0A]'
                                          : 'bg-[#00F0FF]'
                                        : 'bg-[#0F172A]/80'
                                  }`}
                                />
                              );
                            })}
                            {/* 0dB Center Detent Line */}
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-white/25"
                            />
                            {/* Glowing LED Fader Cap */}
                            <span
                              style={{
                                bottom: `calc(${fillPct}% - 2.5px)`,
                                boxShadow: '0 0 6px #00F0FF',
                              }}
                              className="pointer-events-none absolute inset-x-[1.5px] h-[4.5px] rounded-[1px] bg-gradient-to-b from-[#F8FAFC] to-[#94A3B8] border border-[#00F0FF]"
                            />
                          </div>
                          <span className="font-mono text-[4.5px] sm:text-[5px] font-bold text-[#94A3B8] tracking-tighter leading-none truncate">
                            {freqLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* =================================================================
                  MIDDLE SECTION: DEAD-CENTER MASTER VOLUME ROTARY KNOB (36% in 56% Well)
                  Strictly Locked to Horizontal Dead-Center Axis via Symmetrical 21% Left/Right Strips
                  ================================================================= */}
              <div
                id="cd-center-volume-stage"
                data-volume-axis="dead-center"
                className="relative h-[28%] min-h-[104px] sm:min-h-[126px] w-full flex items-center justify-between gap-1 my-0.5 shrink-0"
              >
                {/* LEFT VERTICAL UTILITY STRIP (21% Width): 1/0 STANDBY, ILLUMINATION/RGB, Dual 3.5mm PHONES/MIC Jacks */}
                <div
                  id="cd-left-utility-strip"
                  className="w-[21%] h-full rounded-[4px] bg-gradient-to-b from-[#141821] to-[#0A0D12] border border-[#334155] p-1 flex flex-col items-center justify-between shrink-0 z-20"
                >
                  {/* 1/0 STANDBY Button with Glowing Red/Green LED */}
                  <button
                    id="cd-power-standby-btn"
                    type="button"
                    aria-pressed={receiverPowered}
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      setReceiverPowered((prev) => !prev);
                      onToggleNightMode?.();
                    }}
                    title="1/0 Power Standby"
                    className="w-full py-1 rounded-[3px] bg-[#1E2430] border border-[#475569] flex flex-col items-center justify-center gap-0.5 cursor-pointer active:translate-y-[1px]"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        receiverPowered
                          ? 'bg-[#22C55E] shadow-[0_0_5px_#22C55E]'
                          : 'bg-[#FF3B30] shadow-[0_0_5px_#FF3B30]'
                      }`}
                    />
                    <Power className="w-2.5 h-2.5 text-[#E2E8F0]" />
                    <span className="font-mono text-[5px] font-bold text-[#CBD5E1] leading-none">
                      1/0
                    </span>
                  </button>

                  {/* ILLUMINATION / RGB Speaker Lighting Preset Toggle */}
                  <button
                    id="cd-rgb-preset-btn"
                    type="button"
                    onClick={handleCycleRgbPreset}
                    title={`RGB Speaker Mode: ${rgbSpeakerState.presetLabel}`}
                    aria-label={`Cycle RGB Speaker Illumination (${rgbSpeakerState.presetLabel})`}
                    style={{
                      borderColor: rgbSpeakerState.leftRingHex,
                      boxShadow: `0 0 8px ${rgbSpeakerState.leftRingHex}44`,
                    }}
                    className="w-full py-1 rounded-[3px] bg-[#0F172A] border flex flex-col items-center justify-center gap-0.5 cursor-pointer active:translate-y-[1px]"
                  >
                    <Sparkles
                      style={{ color: rgbSpeakerState.leftRingHex }}
                      className="w-2.5 h-2.5"
                    />
                    <span className="font-mono text-[5px] font-extrabold text-[#F8FAFC] leading-none tracking-tighter">
                      RGB
                    </span>
                  </button>

                  {/* Dual 3.5mm PHONES & MIC Jacks */}
                  <div className="w-full flex flex-col items-center gap-1 pt-0.5 border-t border-[#1E293B]">
                    <div className="flex items-center justify-around w-full">
                      <span
                        title="3.5mm Stereo PHONES Jack"
                        className="w-2.5 h-2.5 rounded-full bg-black border border-[#F59E0B] flex items-center justify-center"
                      >
                        <span className="w-1 h-1 rounded-full bg-[#090D16]" />
                      </span>
                      <span
                        title="3.5mm MIC Input Jack"
                        className="w-2.5 h-2.5 rounded-full bg-black border border-[#94A3B8] flex items-center justify-center"
                      >
                        <span className="w-1 h-1 rounded-full bg-[#090D16]" />
                      </span>
                    </div>
                    <span className="font-mono text-[4.5px] font-bold uppercase text-[#94A3B8] leading-none">
                      PHONES/MIC
                    </span>
                  </div>
                </div>

                {/* DEAD-CENTER FOCAL POINT: Oversized Machined Master Volume Dial Surrounded by Concentric Lathed Rings & Radial Ticks */}
                <div className="relative flex-1 h-full flex flex-col items-center justify-center z-20">
                  <div
                    id="cd-master-volume-well"
                    data-center-aligned="true"
                    data-well-diameter-pct={CD_HIFI_SYSTEM_PROPORTIONS.masterVolumeWellDiameterPct}
                    data-knob-diameter-pct={CD_HIFI_SYSTEM_PROPORTIONS.masterVolumeKnobDiameterPct}
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY < 0 ? 0.04 : -0.04;
                      onChangeVolume(Number(Math.max(0, Math.min(1, volume + delta)).toFixed(2)));
                    }}
                    className="cd-master-volume-well cd-concentric-lathed-ring relative mx-auto w-[86px] h-[86px] sm:w-[114px] sm:h-[114px] rounded-full p-[5px] flex items-center justify-center"
                  >
                    {/* Deep Matte-Black Inner Well with Illuminated Radial Calibration Ticks & Laser-Etched dB Scale */}
                    <div className="relative w-full h-full rounded-full bg-[#06080C] border border-[#475569] shadow-[inset_0_5px_14px_rgba(0,0,0,0.96)] flex items-center justify-center">
                      {/* Illuminated Radial Calibration Ticks */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-[3px] rounded-full border border-dashed border-white/55"
                      />
                      <div
                        aria-hidden="true"
                        style={{
                          borderColor: `${rgbSpeakerState.leftRingHex}AA`,
                          boxShadow: `0 0 12px ${rgbSpeakerState.leftRingHex}55, inset 0 0 8px ${rgbSpeakerState.leftRingHex}33`,
                        }}
                        className="pointer-events-none absolute inset-[7px] rounded-full border-[1.5px]"
                      />
                      {/* Laser-Etched Decibel Markings Around Perimeter */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-1 left-2 font-mono text-[4px] font-bold text-[#94A3B8]"
                      >
                        -∞dB
                      </span>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 font-mono text-[4px] font-bold text-[#00F0FF]"
                      >
                        0dB
                      </span>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-1 right-1.5 font-mono text-[4px] font-bold text-[#FF3B30]"
                      >
                        +6dB
                      </span>

                      {/* Machined Brushed-Aluminum Master Volume Rotary Knob with Concentric Lathed Grooves */}
                      <div
                        id="cd-master-volume-dial"
                        role="slider"
                        tabIndex={0}
                        aria-label="Center Master Volume Rotary Knob"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={volumePct}
                        onPointerDown={(e) => {
                          volumeDialDragRef.current = {
                            active: true,
                            startY: e.clientY,
                            startVol: volume,
                          };
                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch {
                            // ignore
                          }
                        }}
                        onPointerMove={(e) => {
                          if (!volumeDialDragRef.current.active) return;
                          const dy = volumeDialDragRef.current.startY - e.clientY;
                          const nextVol = Math.max(
                            0,
                            Math.min(1, volumeDialDragRef.current.startVol + dy / 110)
                          );
                          onChangeVolume(Number(nextVol.toFixed(2)));
                        }}
                        onPointerUp={() => {
                          volumeDialDragRef.current.active = false;
                        }}
                        style={{
                          transform: `rotate(${volumeDialAngleDeg}deg)`,
                          transition: prefersReducedMotion ? 'none' : 'transform 75ms ease-out',
                        }}
                        className="cd-master-volume-knob cd-concentric-lathed-ring relative w-[66%] h-[66%] rounded-full border border-white/90 flex items-start justify-center pt-1.5 cursor-ns-resize"
                      >
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-[16%] rounded-full border border-black/30"
                        />
                        <span className="relative z-10 w-1.5 h-2.5 rounded-full bg-[#FF3B30] shadow-[0_0_6px_#FF3B30]" />
                      </div>
                    </div>
                  </div>

                  {/* Compact Volume + Pitch Trim Bar Directly Under Well */}
                  <div className="w-full flex items-center justify-center gap-1 mt-1 px-0.5">
                    <Volume2 className="w-2.5 h-2.5 text-[#0F172A] shrink-0" />
                    <input
                      id="vertical-volume-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={(e) => onChangeVolume(Number(e.target.value))}
                      aria-label="Master Volume Control"
                      className="w-14 sm:w-16 h-1 accent-[#FF3B30] cursor-pointer"
                    />
                    <span className="font-mono text-[6px] sm:text-[7px] font-extrabold text-[#0F172A] tabular-nums">
                      {volumePct}%
                    </span>
                    <Sliders className="w-2 h-2 text-[#1E293B] shrink-0 ml-0.5" />
                    <input
                      id="vertical-pitch-slider"
                      type="range"
                      min={-8}
                      max={8}
                      step={0.5}
                      value={pitchPercent}
                      onChange={(e) => onChangePitch(Number(e.target.value))}
                      aria-label="CD Pitch Tempo Trim"
                      className="w-10 sm:w-12 h-1 accent-[#1D4ED8] cursor-pointer"
                    />
                  </div>
                </div>

                {/* RIGHT VERTICAL UTILITY STRIP (21% Width — Symmetrical to Left Strip to Lock Volume Knob to Dead Center) */}
                <div
                  id="cd-right-utility-strip"
                  className="w-[21%] h-full rounded-[4px] bg-gradient-to-b from-[#141821] to-[#0A0D12] border border-[#334155] p-1 flex flex-col items-center justify-between shrink-0 z-20"
                >
                  {/* Play / Pause Primary Key */}
                  <button
                    id="cd-btn-play-pause"
                    type="button"
                    onClick={() => {
                      triggerButtonHaptic(lowPowerMode);
                      onTogglePlay();
                    }}
                    aria-label={isPlaying ? 'Pause CD Playback' : 'Play CD Playback'}
                    className="w-full py-1 rounded-[3px] bg-gradient-to-b from-[#1E293B] to-[#0F172A] border border-[#00F0FF]/75 text-[#00F0FF] font-mono text-[6px] font-extrabold flex items-center justify-center gap-0.5 cursor-pointer active:translate-y-[1px]"
                  >
                    {isPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                    <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                  </button>

                  {/* TUNING / PRESET +/- Skip Keys */}
                  <div className="w-full grid grid-cols-2 gap-0.5">
                    <button
                      id="cd-btn-prev"
                      type="button"
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        onPrevious();
                      }}
                      aria-label="Previous CD Track / Tuning -"
                      title="TUNING - / Previous Track"
                      className="h-[18px] rounded-[2px] bg-[#262D3B] border border-[#475569] text-[#E2E8F0] flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                    >
                      <SkipBack className="w-2.5 h-2.5" />
                    </button>
                    <button
                      id="cd-btn-next"
                      type="button"
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        onNext();
                      }}
                      aria-label="Next CD Track / Tuning +"
                      title="TUNING + / Next Track"
                      className="h-[18px] rounded-[2px] bg-[#262D3B] border border-[#475569] text-[#E2E8F0] flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                    >
                      <SkipForward className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Stop & EQ Selector Keys */}
                  <div className="w-full grid grid-cols-2 gap-0.5">
                    <button
                      id="cd-btn-stop"
                      type="button"
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        onStop();
                      }}
                      aria-label="Stop CD Playback"
                      className="h-[17px] rounded-[2px] bg-[#1E2430] border border-[#475569] text-[#CBD5E1] flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                    >
                      <Square className="w-2 h-2 fill-current" />
                    </button>
                    <button
                      id="cd-preset-eq-btn"
                      type="button"
                      onClick={() => {
                        const nextPreset = getNextCdPresetEq(presetEqMode);
                        handleSelectEqPreset(nextPreset);
                      }}
                      aria-label={`Preset EQ (${presetEqMode})`}
                      title={`EQ Preset: ${presetEqMode}`}
                      className="h-[17px] rounded-[2px] bg-[#1E2430] border border-[#38BDF8]/65 font-mono text-[5.5px] font-extrabold text-[#38BDF8] flex items-center justify-center cursor-pointer active:translate-y-[1px]"
                    >
                      {presetEqMode}
                    </button>
                  </div>
                </div>
              </div>

              {/* =================================================================
                  LOWER HALF: ENLARGED CD PLAYING AREA / DISC COMPARTMENT
                  & 4-STAGE MECHANICAL CD LOADING ANIMATION (~1,600ms)
                  ================================================================= */}
              <div
                id="cd-changer-drawer"
                data-tray-phase={stagePose.phase}
                data-tray-extension={stagePose.trayExtension01}
                data-tray-tilt-deg={stagePose.trayTiltDeg}
                className="relative flex-1 min-h-[146px] sm:min-h-[196px] w-full rounded-[7px] bg-gradient-to-b from-[#1D222B] via-[#101319] to-[#080A0E] border-2 border-[#475569] p-1.5 sm:p-2 flex flex-col gap-1.5 overflow-hidden shadow-[0_6px_16px_rgba(0,0,0,0.85)]"
              >
                {/* Top Quick-Select Buttons: DISC 1 | DISC 2 | DISC 3 | EX-CHANGE | OPEN/CLOSE ⏏ */}
                <div className="flex items-center justify-between gap-1 shrink-0">
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {([1, 2, 3] as const).map((slotNum) => {
                      const isActiveSlot = activeDiscSlot === slotNum;
                      return (
                        <button
                          key={slotNum}
                          id={`cd-changer-disc-${slotNum}`}
                          type="button"
                          aria-pressed={isActiveSlot}
                          onClick={() => handleSelectDiscSlot(slotNum)}
                          aria-label={`Select Changer Disc ${slotNum}`}
                          className={`h-[18px] sm:h-[20px] px-1.5 rounded-[3px] border font-mono text-[6.5px] sm:text-[7px] font-bold flex items-center gap-1 cursor-pointer active:translate-y-[1px] ${
                            isActiveSlot
                              ? 'bg-[#1E293B] border-[#22C55E] text-white shadow-[0_0_8px_rgba(34,197,94,0.35)]'
                              : 'cd-silver-rocker-btn text-[#0F172A]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActiveSlot
                                ? 'bg-[#22C55E] shadow-[0_0_5px_#22C55E]'
                                : 'bg-[#475569]'
                            }`}
                          />
                          <span>DISC {slotNum}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      id="cd-changer-exchange-btn"
                      type="button"
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        const nextSlot = ((activeDiscSlot % 3) + 1) as 1 | 2 | 3;
                        setActiveDiscSlot(nextSlot);
                        retroAudio.triggerCdLaserSpinUpSound();
                        startMechanicalLoadingSequence();
                      }}
                      aria-label="Disc Skip Ex-Change Carousel"
                      className="cd-silver-rocker-btn h-[18px] sm:h-[20px] px-1.5 rounded-[3px] font-mono text-[6px] sm:text-[6.5px] font-extrabold text-[#0F172A] cursor-pointer active:translate-y-[1px]"
                    >
                      EX-CHANGE
                    </button>

                    <button
                      id="cd-tray-eject-btn"
                      type="button"
                      aria-pressed={stagePose.openCloseBtnDepressed}
                      onClick={handleToggleTrayEject}
                      aria-label="Open or Close CD Changer Tray"
                      style={{
                        transform: stagePose.openCloseBtnDepressed ? 'translateY(1.5px)' : 'none',
                      }}
                      className="cd-silver-rocker-btn h-[18px] sm:h-[20px] px-1.5 sm:px-2 rounded-[3px] font-mono text-[6px] sm:text-[6.5px] font-extrabold text-[#0F172A] flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>OPEN/CLOSE ⏏</span>
                    </button>
                  </div>
                </div>

                {/* 2.1 ENLARGED SMOKED-GLASS ILLUMINATED TRANSPARENT CD VIEWING WINDOW & OVERSIZED DEAD-CENTER ROTATING COMPACT DISC */}
                <div
                  id="cd-enlarged-playing-window"
                  data-center-disc-diameter-pct={CD_HIFI_SYSTEM_PROPORTIONS.centerDiscDiameterPct}
                  style={{ perspective: '700px' }}
                  className="cd-smoked-disc-window relative flex-1 min-h-[124px] sm:min-h-[168px] w-full rounded-[6px] flex items-center justify-center px-2 sm:px-3 overflow-hidden"
                >
                  {/* Internal Ambient RGB + Cyan Bay Backlight */}
                  <div
                    aria-hidden="true"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, ${rgbSpeakerState.leftRingHex}38 0%, transparent 72%)`,
                    }}
                    className="pointer-events-none absolute inset-0 z-0"
                  />

                  {/* Left Stage 4 Crimson 780nm Laser Pickup Assembly & Clamping Indicator (Anchored Top-Left Corner) */}
                  <div
                    id="cd-optical-laser-pickup"
                    data-laser-pulse={stagePose.laserFocusPulse01}
                    className="pointer-events-none absolute top-1.5 left-1.5 z-10 flex flex-col items-start gap-0.5"
                  >
                    <div className="flex items-center gap-1">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#0D1118]/90 border border-[#334155] flex items-center justify-center shadow-inner">
                        <span
                          style={{
                            opacity: Math.max(0.25, stagePose.laserFocusPulse01),
                            transform: `scale(${0.85 + stagePose.laserFocusPulse01 * 0.5})`,
                          }}
                          className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FF1E27] shadow-[0_0_12px_#FF1E27,0_0_4px_#FFFFFF] transition-transform duration-100"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-mono text-[5px] sm:text-[5.5px] uppercase tracking-wider text-[#94A3B8] leading-none">
                          780nm LASER
                        </span>
                        <span className="font-mono text-[5.5px] sm:text-[6px] font-bold text-[#FF453A] leading-tight">
                          {stagePose.phase === 'tray-opening'
                            ? 'EJECTING…'
                            : stagePose.phase === 'disc-loading'
                              ? 'CENTER LOAD'
                              : stagePose.phase === 'tray-closing'
                                ? 'RETRACTING'
                                : stagePose.phase === 'laser-reading'
                                  ? 'FOCUS LOCK'
                                  : isPlaying
                                    ? 'HIGH-RPM PLAY'
                                    : 'OPTICAL READY'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* OVERSIZED DEAD-CENTER MOTORIZED CD DRAWER TRAY & SPINNING HOLOGRAPHIC COMPACT DISC */}
                  <div
                    id="cd-motorized-tray-assembly"
                    data-zero-offset-trajectory="true"
                    style={{
                      transform: prefersReducedMotion
                        ? 'translate3d(0px,0px,0px) rotateX(0deg)'
                        : `translate3d(0px, ${
                            stagePose.trayExtension01 * 12 + stagePose.discDropBouncePx
                          }px, ${stagePose.trayExtension01 * 26}px) rotateX(${
                            stagePose.trayTiltDeg
                          }deg) scale(${1 + stagePose.trayExtension01 * 0.06})`,
                      transition: prefersReducedMotion
                        ? 'none'
                        : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className="cd-concentric-lathed-ring relative z-10 mx-auto w-[124px] h-[124px] sm:w-[164px] sm:h-[164px] rounded-full p-[3px] border-2 border-[#64748B] shadow-[0_10px_24px_rgba(0,0,0,0.94)] flex items-center justify-center shrink-0"
                  >
                    <div className="relative w-full h-full rounded-full bg-[#0D1118] border border-[#334155] flex items-center justify-center">
                      {/* Molded Tray Guide Pins */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#94A3B8]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#94A3B8]"
                      />

                      {/* Oversized Holographic Rainbow Polycarbonate Compact Disc with Full-Bleed Printed Album Art Label */}
                      <div
                        id="cd-optical-disc"
                        data-spinning={stagePose.discSpinDurationSec > 0 ? 'true' : 'false'}
                        data-zero-offset-entry="true"
                        style={{
                          animationDuration:
                            stagePose.discSpinDurationSec > 0
                              ? `${stagePose.discSpinDurationSec}s`
                              : '0s',
                          animationPlayState:
                            stagePose.discSpinDurationSec > 0 && !prefersReducedMotion
                              ? 'running'
                              : 'paused',
                          opacity: 0.32 + stagePose.discSeated01 * 0.68,
                          transform:
                            stagePose.phase === 'disc-loading' && !prefersReducedMotion
                              ? `translate3d(0px, ${(1 - stagePose.discFlightProgress01) * -26 + stagePose.discDropBouncePx}px, 0px)`
                              : undefined,
                        }}
                        className="vinyl-platter-gpu-spin cd-optical-disc-rainbow relative w-[93%] h-[93%] rounded-full flex items-center justify-center overflow-hidden"
                      >
                        {/* Full-Bleed Printed Album Art Label Ring */}
                        {!artState.isPlaceholder && artState.activeUrl && (
                          <img
                            src={artState.activeUrl}
                            alt={track.title}
                            draggable={false}
                            referrerPolicy="no-referrer"
                            onError={() => setFailedArtCount((c) => c + 1)}
                            className="pointer-events-none absolute inset-[4%] w-[92%] h-[92%] rounded-full object-cover opacity-82 mix-blend-multiply"
                          />
                        )}
                        {/* Prismatic Rainbow Polycarbonate Ring Highlight */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-[2%] rounded-full border border-white/45"
                        />
                        {/* Transparent Inner Clamping Ring & Dead-Center Magnetic Spindle Hub */}
                        <div className="relative z-10 w-[28%] h-[28%] rounded-full bg-[#E2E8F0]/85 border border-white/95 flex items-center justify-center shadow-inner">
                          <div
                            style={{
                              transform: `scale(${0.82 + stagePose.magneticClamper01 * 0.18})`,
                            }}
                            className="w-[52%] h-[52%] rounded-full bg-[#090D16] border border-[#64748B]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2.5 PHOTOREALISTIC CD JEWEL CASE SLEEVE (#album-art-holder-box, docked bottom-right corner) */}
                  <div
                    id="album-art-holder-box"
                    role="button"
                    tabIndex={hideBoxArt ? -1 : 0}
                    aria-hidden={hideBoxArt ? 'true' : undefined}
                    aria-label={`Draggable Photorealistic CD Jewel Case for ${track.title}`}
                    title="Photorealistic CD Jewel Case · Click to Eject/Reload Disc"
                    onPointerDown={(e) => {
                      if (hideBoxArt) return;
                      setIsDraggingHolder(true);
                      holderDragStartRef.current = {
                        x: e.clientX - holderOffset.x,
                        y: e.clientY - holderOffset.y,
                      };
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // ignore
                      }
                    }}
                    onPointerMove={(e) => {
                      if (!isDraggingHolder) return;
                      const dx = Math.max(-40, Math.min(40, e.clientX - holderDragStartRef.current.x));
                      const dy = Math.max(-24, Math.min(24, e.clientY - holderDragStartRef.current.y));
                      setHolderOffset({ x: dx, y: dy });
                    }}
                    onPointerUp={() => {
                      setIsDraggingHolder(false);
                      setHolderOffset({ x: 0, y: 0 });
                    }}
                    onClick={() => {
                      if (!hideBoxArt && !isDraggingHolder) {
                        startMechanicalLoadingSequence();
                        retroAudio.triggerCdTrackChangeCue();
                      }
                    }}
                    style={{
                      opacity: hideBoxArt ? 0 : 1,
                      transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) scale(${
                        hideBoxArt ? 0.9 : 1
                      })`,
                      pointerEvents: hideBoxArt ? 'none' : 'auto',
                      transition: isDraggingHolder
                        ? 'none'
                        : prefersReducedMotion
                          ? 'none'
                          : 'transform 220ms ease-out, opacity 220ms ease-out',
                    }}
                    className="absolute bottom-1.5 right-1.5 z-20 w-[56px] h-[48px] sm:w-[66px] sm:h-[58px] rounded-[3px] bg-[#18202C] border border-white/55 shadow-[0_8px_18px_rgba(0,0,0,0.88)] flex items-stretch overflow-hidden cursor-grab active:cursor-grabbing shrink-0"
                  >
                    {/* Left Hinged Spine (width: 12px) with Top/Bottom Hinge Pins & Printed Spine Edge */}
                    <div
                      data-jewel-spine-width="12"
                      className="cd-jewel-ridged-spine w-[12px] h-full border-r border-white/35 flex flex-col items-center justify-between py-1 shrink-0"
                    >
                      <span className="w-[6px] h-[2px] rounded-full bg-white/65" />
                      <span className="w-[2px] flex-1 my-0.5 rounded-full bg-[#00F0FF]/45" />
                      <span className="w-[6px] h-[2px] rounded-full bg-white/65" />
                    </div>

                    {/* Clear Acrylic Front Cover + Corner Retention Tabs + Semi-Visible Silver Disc Edge */}
                    <div className="relative flex-1 h-full bg-[#0F172A] flex items-center justify-center overflow-hidden">
                      {/* Semi-Visible Silver Compact Disc Edge Peeking Behind Booklet */}
                      <div
                        aria-hidden="true"
                        className="cd-optical-disc-rainbow pointer-events-none absolute -right-2 w-10 h-10 rounded-full opacity-75"
                      />
                      {!artState.isPlaceholder && artState.activeUrl ? (
                        <img
                          src={artState.activeUrl}
                          alt={track.title}
                          draggable={false}
                          referrerPolicy="no-referrer"
                          className="relative z-10 w-[88%] h-full object-cover mr-auto border-r border-white/25"
                        />
                      ) : (
                        <Disc3 className="relative z-10 w-5 h-5 text-[#00F0FF]" />
                      )}
                      {/* Subtle Inner Corner Retention Tabs */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1 right-1.5 z-20 w-1.5 h-1.5 border-t border-r border-white/65"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-1 right-1.5 z-20 w-1.5 h-1.5 border-b border-r border-white/65"
                      />
                      {/* 125deg Clear Acrylic Glare Overlay */}
                      <div
                        aria-hidden="true"
                        className="cd-jewel-acrylic-glare pointer-events-none absolute inset-0 z-20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* INTEGRATED COMPACT VFD LYRICS READOUT STRIP */}
              <div className="w-full h-[46px] sm:h-[54px] shrink-0">
                <SyncedLyricsPanel
                  track={track}
                  isStandby={isStandby}
                  isPlaying={isPlaying && receiverPowered}
                  isDocumentHidden={isDocumentHidden}
                  lowPowerMode={lowPowerMode}
                  nightMode={nightMode}
                  playbackRate={1 + pitchPercent / 100}
                  prefersReducedMotion={prefersReducedMotion}
                  themePalette={themePalette}
                  themeId="cd-hifi"
                  onSeek={onSeek}
                  className="w-full h-full"
                />
              </div>
            </div>

            {/* Short Stepped Silver/Charcoal Isolation Feet Along Level Bottom Baseline */}
            <div
              aria-hidden="true"
              className="w-full h-[8px] px-[10%] flex items-start justify-between shrink-0"
            >
              <span className="w-[24%] h-full rounded-b-[3px] bg-gradient-to-b from-[#94A3B8] via-[#334155] to-[#0F172A] border-x border-b border-[#1E293B] shadow-md" />
              <span className="w-[24%] h-full rounded-b-[3px] bg-gradient-to-b from-[#94A3B8] via-[#334155] to-[#0F172A] border-x border-b border-[#1E293B] shadow-md" />
            </div>
          </div>

          {/* RIGHT BOOKSHELF SPEAKER (34% Width — Exact Mirror of Left Speaker) */}
          <BookshelfKevlarSpeaker
            side="right"
            coneScale={rgbSpeakerState.rightConeScale}
            dustCapOffsetPx={rgbSpeakerState.rightDustCapOffsetPx}
            ringRgbHex={rgbSpeakerState.rightRingHex}
            portRgbHex={rgbSpeakerState.rightPortHex}
            ringGlowOpacity={rgbSpeakerState.ringGlowOpacity}
            portGlowOpacity={rgbSpeakerState.portGlowOpacity}
            grooveBassBoost={grooveBassBoost}
            prefersReducedMotion={prefersReducedMotion}
            compact={compactLandscape}
          />
        </div>
      </section>
    );
  }
);
