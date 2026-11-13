import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Disc3,
  AudioWaveform,
  Zap,
  Orbit,
  RotateCcw,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  calculateTonearmTracking,
  verticalSliderToPitch,
  calculatePitchThumbTopPercent,
  buildSyncedLyricsForTrack,
  getActiveLyricIndex,
  type TrackItem,
  type DominantThemePalette,
} from '../utils/playerLogic';

interface TurntableDeckProps {
  track: TrackItem;
  currentTimeSec: number;
  isPlaying: boolean;
  pitchPercent: number;
  isFullScreen: boolean;
  themePalette: DominantThemePalette;
  onTogglePlay: () => void;
  onChangePitch: (pitch: number) => void;
  onScratch: (intensity: 'light' | 'classic' | 'backspin') => void;
  onSeek: (targetSec: number) => void;
  onToggleFullScreen: () => void;
}

export const TurntableDeck: React.FC<TurntableDeckProps> = ({
  track,
  currentTimeSec,
  isPlaying,
  pitchPercent,
  isFullScreen,
  themePalette,
  onTogglePlay,
  onChangePitch,
  onScratch,
  onSeek,
  onToggleFullScreen,
}) => {
  const [scratchAngleOffset, setScratchAngleOffset] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const [scratchFlash, setScratchFlash] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [rawLrcLyrics, setRawLrcLyrics] = useState<string | null>(null);

  const scratchStartAngleRef = useRef<number>(0);
  const platterRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setImgError(false);
  }, [track.artworkUrl]);

  // Fetch real time-synced LRC lyrics for the active song
  useEffect(() => {
    let cancelled = false;
    setRawLrcLyrics(null);
    const loadLyrics = async () => {
      try {
        const params = new URLSearchParams({
          title: track.title,
          artist: track.artist,
        });
        const res = await fetch(`/api/lyrics?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { syncedLyrics?: string | null };
        if (!cancelled && data.syncedLyrics) {
          setRawLrcLyrics(data.syncedLyrics);
        }
      } catch {
        // Fallback verses generated automatically
      }
    };
    loadLyrics();
    return () => {
      cancelled = true;
    };
  }, [track.id, track.title, track.artist]);

  const syncedLyrics = useMemo(
    () => buildSyncedLyricsForTrack(track, rawLrcLyrics),
    [track, rawLrcLyrics]
  );

  const activeLyricIndex = useMemo(
    () => getActiveLyricIndex(syncedLyrics, currentTimeSec),
    [syncedLyrics, currentTimeSec]
  );

  // Smoothly scroll the active verse into the center of the lyrics panel next to the rotating vinyl
  useEffect(() => {
    if (activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLyricIndex]);

  // Hardware-accelerated CSS spin duration adjusted by pitch (zero 60fps React re-renders)
  const spinDurationSec = useMemo(() => {
    const speedMultiplier = Math.max(0.5, 1 + pitchPercent / 100);
    return Number((1.8 / speedMultiplier).toFixed(2));
  }, [pitchPercent]);

  const handleTriggerScratch = (intensity: 'light' | 'classic' | 'backspin') => {
    onScratch(intensity);
    setScratchFlash(true);
    const delta = intensity === 'backspin' ? -145 : intensity === 'classic' ? -68 : 42;
    setScratchAngleOffset((prev) => (prev + delta) % 360);
    window.setTimeout(() => setScratchFlash(false), 320);
  };

  const handlePlatterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!platterRef.current) return;
    const rect = platterRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    scratchStartAngleRef.current = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    setIsScratching(true);
    onScratch('light');
    e.currentTarget.setPointerCapture(e.pointerId);
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

  // Precise tonearm angle & groove radius tracking driven by currentTimeSec / track.durationSec
  const { tonearmAngleDeg, grooveRadiusPercent } = calculateTonearmTracking(
    currentTimeSec,
    track.durationSec
  );
  const activeGrooveInsetPercent = Number((50 - grooveRadiusPercent).toFixed(2));
  const pitchThumbTopPercent = calculatePitchThumbTopPercent(pitchPercent);

  return (
    <section
      aria-label="Analog Turntable Deck"
      className="relative flex flex-col lg:flex-row items-stretch justify-between gap-4 lg:gap-2.5 select-none w-full lg:h-full overflow-visible"
    >
      {/* Left + Center Assembly: Big Square Album Art Overlaying the Rotating Turntable with Dust Particles */}
      <div className="relative flex items-center justify-start w-full lg:w-[545px] xl:w-[575px] h-[280px] sm:h-[320px] lg:h-full shrink-0">
        {/* Big Square Album Art Sleeve — Top-Aligned with TV, Same Roundness (rounded-3xl), 50% Shadow Opacity, Overlaying Turntable (z-20) */}
        <div
          id="album-art-cover"
          className="relative z-20 h-full aspect-square rounded-3xl overflow-hidden shadow-[24px_10px_50px_rgba(0,0,0,0.46)] border border-white/20 bg-black/50 shrink-0 group"
        >
          {!imgError && track.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt={`${track.title} square album cover`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-700/60 via-[#1b1612] to-black flex items-center justify-center">
              <Disc3 className="w-16 h-16 text-amber-300/80" />
            </div>
          )}

          {/* Glass Glossy Diagonal Sheen & Sleeve Spine Highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.03)_38%,transparent_58%,rgba(0,0,0,0.35)_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-white/25 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black/45 to-transparent"
          />
        </div>

        {/* Borderless BIG Rotating Vinyl Platter Positioned Underneath the Album Art (z-10) */}
        <div className="absolute right-2 lg:right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center h-[94%] aspect-square">
          <div
            className={`relative w-full h-full rounded-full p-2.5 bg-gradient-to-b from-[#2e2d32] via-[#151518] to-[#0a0a0c] shadow-[0_24px_60px_rgba(0,0,0,0.44),0_0_0_1px_rgba(255,255,255,0.14)] flex items-center justify-center transition-transform duration-150 ${
              scratchFlash ? 'scale-[0.985] ring-2 ring-amber-400/60' : ''
            }`}
          >
            {/* Outer Scratch Wrapper + Inner GPU-Composited Vinyl Disc */}
            <div
              style={{
                transform: `rotate(${scratchAngleOffset}deg)`,
                transition: isScratching ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              className="w-full h-full rounded-full"
            >
              <div
                ref={platterRef}
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
                  animationPlayState: isPlaying && !isScratching ? 'running' : 'paused',
                }}
                className="vinyl-grooves vinyl-platter-gpu-spin relative w-full h-full rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center shadow-lg overflow-hidden"
              >
                {/* Anisotropic Vinyl Specular Light Sheen */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full bg-[conic-gradient(from_35deg,transparent_0deg,rgba(255,255,255,0.15)_35deg,transparent_75deg,transparent_180deg,rgba(255,255,255,0.13)_215deg,transparent_255deg)]"
                />

                {/* Subtle CSS Particle & Texture Overlay Simulating Vintage Vinyl Dust Accumulation */}
                <div
                  aria-hidden="true"
                  className="vinyl-dust-particles pointer-events-none absolute inset-0 rounded-full"
                />
                <div
                  aria-hidden="true"
                  className="vinyl-dust-motes pointer-events-none absolute inset-0 rounded-full"
                />

                {/* Concentric Groove Track Rings */}
                <div className="pointer-events-none absolute inset-[6%] rounded-full border border-white/10" />
                <div className="pointer-events-none absolute inset-[14%] rounded-full border border-white/10" />
                <div className="pointer-events-none absolute inset-[22%] rounded-full border border-white/10" />
                <div className="pointer-events-none absolute inset-[28%] rounded-full border border-white/5" />

                {/* Dynamic Stylus Landing Groove Ring — Shows Exact Vinyl Radius Where the Needle Tracks Song Duration */}
                <div
                  aria-hidden="true"
                  style={{
                    inset: `${activeGrooveInsetPercent}%`,
                    borderColor: themePalette.borderRgba,
                    boxShadow: `0 0 10px ${themePalette.glowRgba}`,
                  }}
                  className="pointer-events-none absolute rounded-full border transition-all duration-200"
                />

                {/* Center Vinyl Record Label with Spotify Artwork */}
                <div className="relative z-10 w-[34%] h-[34%] rounded-full overflow-hidden border-4 border-[#1c1a18] shadow-inner bg-[#181512] flex items-center justify-center">
                  {!imgError && track.artworkUrl ? (
                    <img
                      src={track.artworkUrl}
                      alt={`${track.title} vinyl center artwork`}
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  ) : (
                    <div
                      style={{ background: themePalette.tvCabinetGradient }}
                      className="w-full h-full flex items-center justify-center"
                    >
                      <Disc3 style={{ color: themePalette.lightHex }} className="w-6 h-6" />
                    </div>
                  )}

                  {/* Machined Chrome Center Spindle */}
                  <div className="absolute w-3.5 h-3.5 lg:w-4 lg:h-4 rounded-full bg-gradient-to-br from-white via-[#d4d4d8] to-[#52525b] border border-black/80 shadow" />
                </div>
              </div>
            </div>

            {/* Realistic Precision S-Shaped Tonearm Assembly Tracking Precisely Across the Vinyl Grooves by Song Duration */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 -right-6 lg:-right-8 w-28 sm:w-32 lg:w-36 h-60 sm:h-64 lg:h-76 z-30"
            >
              <svg
                viewBox="0 0 140 300"
                className="w-full h-full overflow-visible drop-shadow-[0_12px_16px_rgba(0,0,0,0.42)]"
              >
                <defs>
                  <linearGradient id="chromeTube" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#71717a" />
                    <stop offset="35%" stopColor="#f4f4f5" />
                    <stop offset="65%" stopColor="#a1a1aa" />
                    <stop offset="100%" stopColor="#3f3f46" />
                  </linearGradient>
                  <linearGradient id="counterWeight" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#52525b" />
                    <stop offset="50%" stopColor="#27272a" />
                    <stop offset="100%" stopColor="#09090b" />
                  </linearGradient>
                  <radialGradient id="gimbalBase" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3f3f46" />
                    <stop offset="70%" stopColor="#18181b" />
                    <stop offset="100%" stopColor="#09090b" />
                  </radialGradient>
                </defs>

                {/* Fixed Machined Gimbal Base & Anti-Skate Dial */}
                <circle cx="92" cy="58" r="30" fill="url(#gimbalBase)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
                <circle cx="92" cy="58" r="20" fill="#121215" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <circle cx="116" cy="48" r="5.5" fill="#27272a" stroke="#a1a1aa" strokeWidth="1" />
                <rect x="78" y="108" width="10" height="6" rx="2" fill="#3f3f46" />

                {/* Pivoting S-Shaped Tonearm Group Rotating Around Gimbal Center (92, 58) Precisely by Song Duration */}
                <g
                  id="turntable-tonearm-pivot"
                  data-tonearm-angle={tonearmAngleDeg}
                  style={{
                    transform: `rotate(${tonearmAngleDeg}deg)`,
                    transformOrigin: '92px 58px',
                    transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {/* Rear Counterweight Stub & Graduated Cylinder */}
                  <line x1="92" y1="58" x2="96" y2="18" stroke="url(#chromeTube)" strokeWidth="6" strokeLinecap="round" />
                  <rect x="82" y="10" width="26" height="18" rx="4" fill="url(#counterWeight)" stroke="#a1a1aa" strokeWidth="1" />
                  <line x1="84" y1="24" x2="106" y2="24" stroke={themePalette.primaryHex} strokeWidth="1.5" />

                  {/* Gimbal Housing Bridge */}
                  <rect x="81" y="44" width="22" height="28" rx="5" fill="#27272a" stroke="#d4d4d8" strokeWidth="1.2" />
                  <circle cx="92" cy="58" r="5" fill={themePalette.primaryHex} />

                  {/* Classic S-Curved Tubular Metallic Arm */}
                  <path
                    d="M 92 72 C 92 115, 104 148, 86 190 C 72 222, 58 242, 48 262"
                    fill="none"
                    stroke="url(#chromeTube)"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                  />

                  {/* Collar Joint */}
                  <rect
                    x="43"
                    y="256"
                    width="9"
                    height="7"
                    rx="1.5"
                    transform="rotate(26 48 260)"
                    fill="#d4d4d8"
                  />

                  {/* Die-Cast Slotted Headshell & Cartridge Landing on the Vinyl Groove */}
                  <g transform="translate(46, 262) rotate(28)">
                    <path
                      d="M -7 0 L 7 0 L 9 26 L -9 26 Z"
                      fill="#18181b"
                      stroke="#a1a1aa"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M 8 16 Q 16 14 18 22"
                      fill="none"
                      stroke="#e4e4e7"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <rect x="-4" y="5" width="8" height="12" rx="1" fill="#27272a" stroke={themePalette.primaryHex} strokeWidth="0.8" />
                    {/* Glowing Diamond Stylus Contact Point */}
                    <circle cx="0" cy="23" r="3" fill={themePalette.lightHex} />
                  </g>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Synced Song Lyrics Stage Next to Rotating Vinyl — Highlights the Exact Verse Being Sung */}
      <div
        id="vinyl-lyrics-panel"
        aria-label="Live Synced Song Lyrics"
        className={`${
          isFullScreen ? 'flex' : 'hidden lg:flex'
        } glass-panel rounded-3xl px-3.5 py-3 w-full lg:w-auto lg:flex-1 min-w-0 h-44 lg:h-full shrink-0 lg:shrink flex-col justify-between overflow-hidden z-20`}
      >
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-2 scroll-smooth">
          {syncedLyrics.map((line, idx) => {
            const isActiveVerse = idx === activeLyricIndex;
            const isPastVerse = idx < activeLyricIndex;
            return (
              <button
                key={`${line.index}-${line.startTimeSec}`}
                ref={isActiveVerse ? activeLyricRef : null}
                type="button"
                onClick={() => onSeek(line.startTimeSec)}
                data-active-verse={isActiveVerse ? 'true' : 'false'}
                style={
                  isActiveVerse
                    ? {
                        backgroundColor: themePalette.softBgRgba,
                        borderColor: themePalette.borderRgba,
                        color: themePalette.lightHex,
                      }
                    : undefined
                }
                className={`w-full text-left px-2.5 py-1.5 rounded-xl border transition-all duration-300 ${
                  isActiveVerse
                    ? 'font-semibold text-xs xl:text-sm scale-[1.01] shadow-sm'
                    : isPastVerse
                    ? 'border-transparent text-white/35 text-xs hover:text-white/65'
                    : 'border-transparent text-white/65 text-xs hover:text-white/90'
                }`}
              >
                {line.text}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Side Dual Tall Cards: 1) Control Buttons Card (No RPM Button) + 2) Swapped Tall Pitch Slider Card */}
      <div className="flex flex-row lg:flex-row items-stretch justify-between lg:justify-end gap-2.5 w-full lg:w-auto h-14 lg:h-full z-30 shrink-0">
        {/* Card 1: Tall Vertical Control Buttons Card (Same Height as Vinyl Box Cover on Desktop, Compact Row on Mobile) */}
        <div
          id="turntable-buttons-card"
          className="glass-panel rounded-3xl p-2 flex flex-row lg:flex-col items-center justify-around lg:justify-between flex-1 lg:flex-none h-full shrink-0"
        >
          {/* 1. Spin / Stop Deck Button */}
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Stop Deck' : 'Spin Deck'}
            title={isPlaying ? 'Stop Deck' : 'Spin Deck'}
            style={
              isPlaying
                ? {
                    backgroundColor: themePalette.primaryHex,
                    boxShadow: `0 0 16px ${themePalette.glowRgba}`,
                  }
                : undefined
            }
            className={`w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all shrink-0 ${
              isPlaying
                ? 'text-[#12100e]'
                : 'glass-button text-white'
            }`}
          >
            <Disc3 className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} />
          </button>

          {/* 2. Scratch Icon #1: Classic Vinyl Waveform Scratch */}
          <button
            type="button"
            onClick={() => handleTriggerScratch('classic')}
            aria-label="Vinyl Scratch"
            title="Vinyl Waveform Scratch"
            style={{ color: themePalette.lightHex }}
            className="glass-button w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
          >
            <AudioWaveform className="w-4 h-4" />
          </button>

          {/* 3. Scratch Icon #2: High-Frequency Transient Chirp Scratch */}
          <button
            type="button"
            onClick={() => handleTriggerScratch('light')}
            aria-label="Scratch Chirp"
            title="Transient Chirp Scratch"
            style={{ color: themePalette.lightHex }}
            className="glass-button w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
          >
            <Zap className="w-4 h-4" />
          </button>

          {/* 4. Scratch Icon #3: Orbital Platter Backspin */}
          <button
            type="button"
            onClick={() => handleTriggerScratch('backspin')}
            aria-label="Backspin"
            title="Orbital Platter Backspin"
            style={{ color: themePalette.lightHex }}
            className="glass-button w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0"
          >
            <Orbit className="w-4 h-4" />
          </button>

          {/* 5. Reset Pitch to Default (0%) Button */}
          <button
            type="button"
            onClick={() => onChangePitch(0)}
            aria-label="Reset Pitch to Default"
            title={`Reset Pitch to Default (Current: ${pitchPercent > 0 ? `+${pitchPercent}` : pitchPercent}%)`}
            style={
              pitchPercent !== 0
                ? {
                    backgroundColor: themePalette.softBgRgba,
                    borderColor: themePalette.borderRgba,
                    color: themePalette.lightHex,
                  }
                : undefined
            }
            className={`w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center border transition-all shrink-0 ${
              pitchPercent !== 0
                ? 'shadow-sm'
                : 'glass-button text-white/60'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* 6. Full Screen Mode Toggle Button */}
          <button
            type="button"
            onClick={onToggleFullScreen}
            aria-label={isFullScreen ? 'Exit Full Screen Mode' : 'Enter Full Screen Mode'}
            title={isFullScreen ? 'Exit Full Screen Mode' : 'Full Screen Lyrics & Vinyl Mode'}
            style={
              isFullScreen
                ? {
                    backgroundColor: themePalette.softBgRgba,
                    borderColor: themePalette.borderRgba,
                    color: themePalette.lightHex,
                  }
                : undefined
            }
            className={`w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center border transition-all shrink-0 ${
              isFullScreen
                ? ''
                : 'glass-button text-white/75'
            }`}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Card 2: Swapped Tall Vertical Pitch Slider Card (Moving UP Increases Pitch, Moving DOWN Decreases Pitch) */}
        <div
          id="pitch-slider-card"
          data-pitch-percent={pitchPercent}
          className="glass-panel relative overflow-hidden rounded-3xl px-3 py-1.5 lg:py-4 flex flex-col items-center justify-between h-full w-16 lg:w-12 shrink-0"
        >
          {/* Quartz-Lock 0% LED Indicator Dot */}
          <div
            aria-hidden="true"
            style={
              pitchPercent !== 0
                ? {
                    backgroundColor: themePalette.primaryHex,
                    boxShadow: `0 0 8px ${themePalette.glowRgba}`,
                  }
                : undefined
            }
            className={`w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full transition-all shrink-0 ${
              pitchPercent === 0
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]'
                : ''
            }`}
          />

          {/* Full-Height Precision Vertical Pitch Fader: UP = Increase Pitch (+12%), DOWN = Decrease Pitch (-12%) */}
          <div className="relative flex-1 w-full my-0.5 lg:my-2 flex items-center justify-center overflow-hidden">
            {/* Graduated Scale Tick Marks */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1 lg:inset-y-2 inset-x-0 flex flex-col justify-between items-center"
            >
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  style={idx === 4 ? { backgroundColor: themePalette.lightHex } : undefined}
                  className={`h-[1.5px] rounded-full ${
                    idx === 4 ? 'w-6 opacity-80' : 'w-3.5 bg-white/20'
                  }`}
                />
              ))}
            </div>

            {/* Center Vertical Fader Slot (Upper Half Fills When Pitch > 0, Lower Half Fills When Pitch < 0) */}
            <div
              aria-hidden="true"
              className="pointer-events-none relative w-1.5 h-[88%] rounded-full bg-black/60 border border-white/15 overflow-hidden"
            >
              <div
                className="w-full transition-all duration-75"
                style={{
                  position: 'absolute',
                  top: pitchPercent > 0 ? `${50 - (pitchPercent / 12) * 50}%` : '50%',
                  height: `${(Math.abs(pitchPercent) / 12) * 50}%`,
                  backgroundColor: themePalette.primaryHex,
                }}
              />
            </div>

            {/* Precision Machined Fader Cap Thumb: Moves UP when pitch > 0, Moves DOWN when pitch < 0 */}
            <div
              id="pitch-fader-thumb"
              aria-hidden="true"
              data-thumb-top={pitchThumbTopPercent}
              style={{
                top: `${pitchThumbTopPercent}%`,
                background: `linear-gradient(180deg, ${themePalette.lightHex} 0%, ${themePalette.primaryHex} 100%)`,
                boxShadow: `0 2px 8px ${themePalette.glowRgba}`,
              }}
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-3.5 rounded-md border border-white/40 flex items-center justify-center transition-all duration-75"
            >
              <div className="w-3 h-[1.5px] bg-[#12100e] rounded-full" />
            </div>

            {/* Interactive Range Input Inverted so Dragging UP Increases Pitch and Dragging DOWN Decreases Pitch */}
            <input
              id="pitch-fader"
              type="range"
              min={-12}
              max={12}
              step={1}
              value={-pitchPercent}
              onChange={(e) => onChangePitch(verticalSliderToPitch(Number(e.target.value)))}
              aria-label="Turntable Pitch Adjustment (Up to Increase, Down to Decrease)"
              title={`Pitch: ${pitchPercent > 0 ? `+${pitchPercent}` : pitchPercent}% (Move Up to Increase, Down to Decrease)`}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer [writing-mode:vertical-lr] z-20"
            />
          </div>

          {/* Subtle Bottom Pivot Indicator */}
          <div aria-hidden="true" className="w-4 h-1 rounded-full bg-white/20 shrink-0" />
        </div>
      </div>
    </section>
  );
};
