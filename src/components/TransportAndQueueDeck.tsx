import React, { useMemo, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  Sparkles,
  Flag,
  Mic2,
  Flame,
  Zap,
  Smartphone,
} from 'lucide-react';
import {
  formatDuration,
  getUpNextQueue,
  stepVuMeterPhysics,
  type PlaylistPack,
  type TrackItem,
  type DominantThemePalette,
  type VuChannelPhysicsState,
} from '../utils/playerLogic';

interface TransportAndQueueDeckProps {
  playlists: PlaylistPack[];
  activePlaylist: PlaylistPack;
  activeTrack: TrackItem;
  currentTrackIndex: number;
  currentTimeSec: number;
  isPlaying: boolean;
  repeatOne: boolean;
  volume: number;
  crackleLevel: number;
  vuLevels: { left: number; right: number };
  themePalette: DominantThemePalette;
  spotifyConnected: boolean;
  spotifyUserLabel: string;
  onOpenSpotifyModal: () => void;
  onOpenAndroidModal: () => void;
  onSelectPlaylist: (playlistId: string) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: (forcePrevious?: boolean) => void;
  onNext: () => void;
  onSeek: (targetSec: number) => void;
  onToggleRepeatOne: () => void;
  onChangeVolume: (vol: number) => void;
  onChangeCrackle: (crackle: number) => void;
}

export const TransportAndQueueDeck: React.FC<TransportAndQueueDeckProps> = ({
  playlists,
  activePlaylist,
  activeTrack,
  currentTrackIndex,
  currentTimeSec,
  isPlaying,
  repeatOne,
  volume,
  crackleLevel,
  vuLevels,
  themePalette,
  spotifyConnected,
  spotifyUserLabel,
  onOpenSpotifyModal,
  onOpenAndroidModal,
  onSelectPlaylist,
  onTogglePlay,
  onStop,
  onPrevious,
  onNext,
  onSeek,
  onToggleRepeatOne,
  onChangeVolume,
  onChangeCrackle,
}) => {
  const upNextItems = getUpNextQueue(activePlaylist.tracks, currentTrackIndex);
  const immediateNext = upNextItems[0] || null;

  const progressRatio =
    activeTrack.durationSec > 0
      ? Math.min(1, Math.max(0, currentTimeSec / activeTrack.durationSec))
      : 0;

  // Direct DOM refs for physics-based VU meters so we don't trigger 60fps React VDOM re-renders
  const vuPanelRef = useRef<HTMLDivElement | null>(null);
  const leftBarRef = useRef<HTMLDivElement | null>(null);
  const rightBarRef = useRef<HTMLDivElement | null>(null);
  const leftPeakRef = useRef<HTMLDivElement | null>(null);
  const rightPeakRef = useRef<HTMLDivElement | null>(null);

  const physicsStateRef = useRef<{
    left: VuChannelPhysicsState;
    right: VuChannelPhysicsState;
  }>({
    left: { level: vuLevels.left, velocity: 0, peakHold: vuLevels.left, peakVelocity: 0 },
    right: { level: vuLevels.right, velocity: 0, peakHold: vuLevels.right, peakVelocity: 0 },
  });

  const targetVuRef = useRef<{ left: number; right: number }>(vuLevels);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const bpmRef = useRef<number>(activeTrack.bpm || 110);

  useEffect(() => {
    targetVuRef.current = vuLevels;
  }, [vuLevels]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    bpmRef.current = activeTrack.bpm || 110;
  }, [activeTrack.bpm]);

  // Lightweight direct-DOM physics loop: runs when playing or settling, pauses completely at rest
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const tickPhysics = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;

      let targetLeft = targetVuRef.current.left;
      let targetRight = targetVuRef.current.right;

      if (isPlayingRef.current) {
        const beatPeriodSec = 60 / Math.max(70, bpmRef.current);
        const beatPhase = ((now / 1000) % beatPeriodSec) / beatPeriodSec;
        const beatEnvelope = beatPhase < 0.18 ? 0.22 : -0.14;
        targetLeft = Math.max(0.08, Math.min(0.98, targetLeft + beatEnvelope));
        targetRight = Math.max(0.08, Math.min(0.98, targetRight + beatEnvelope * 0.92));
      } else {
        targetLeft = 0.12;
        targetRight = 0.12;
      }

      const nextLeft = stepVuMeterPhysics(physicsStateRef.current.left, targetLeft, dtSec);
      const nextRight = stepVuMeterPhysics(physicsStateRef.current.right, targetRight, dtSec);
      physicsStateRef.current = { left: nextLeft, right: nextRight };

      if (leftBarRef.current) {
        leftBarRef.current.style.width = `${Math.round(nextLeft.level * 100)}%`;
      }
      if (rightBarRef.current) {
        rightBarRef.current.style.width = `${Math.round(nextRight.level * 100)}%`;
      }
      if (leftPeakRef.current) {
        leftPeakRef.current.style.left = `${Math.min(98, Math.round(nextLeft.peakHold * 100))}%`;
      }
      if (rightPeakRef.current) {
        rightPeakRef.current.style.left = `${Math.min(98, Math.round(nextRight.peakHold * 100))}%`;
      }
      if (vuPanelRef.current) {
        vuPanelRef.current.dataset.vuLeft = String(nextLeft.level);
        vuPanelRef.current.dataset.vuRight = String(nextRight.level);
      }

      // Only continue RAF loop if playing or still settling toward idle rest
      const isSettled =
        !isPlayingRef.current &&
        Math.abs(nextLeft.level - targetLeft) < 0.005 &&
        Math.abs(nextLeft.velocity) < 0.01;

      if (!isSettled) {
        rafId = window.requestAnimationFrame(tickPhysics);
      }
    };

    rafId = window.requestAnimationFrame(tickPhysics);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, vuLevels]);

  // Deterministic acoustic waveform profile per track (32 bars for lightweight DOM)
  const baseWaveHeights = useMemo(() => {
    const seedStr = `${activeTrack.id}-${activeTrack.title}`;
    let hash = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      hash ^= seedStr.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const bars: number[] = [];
    const totalBars = 32;
    for (let i = 0; i < totalBars; i++) {
      const sinWave = Math.sin((i / totalBars) * Math.PI) * 0.55;
      const pseudoRand = (((hash >>> (i % 16)) & 0xff) / 255) * 0.45;
      bars.push(Math.max(0.2, Math.min(1, sinWave + pseudoRand)));
    }
    return bars;
  }, [activeTrack.id, activeTrack.title]);

  const cuePoints = [
    { aria: 'Jump to Intro 0:00', sec: 0, ratio: 0, Icon: Flag },
    { aria: 'Jump to 25% Verse', sec: Math.floor(activeTrack.durationSec * 0.25), ratio: 0.25, Icon: Mic2 },
    { aria: 'Jump to 50% Chorus', sec: Math.floor(activeTrack.durationSec * 0.5), ratio: 0.5, Icon: Flame },
    { aria: 'Jump to 75% Solo', sec: Math.floor(activeTrack.durationSec * 0.75), ratio: 0.75, Icon: Zap },
  ];

  const vuGradientStyle = `linear-gradient(90deg, ${themePalette.vuStartHex} 0%, ${themePalette.vuMidHex} 60%, ${themePalette.vuPeakHex} 100%)`;

  return (
    <section
      id="controls-panel"
      aria-label="Playback Controls and Soundwave Deck"
      className="glass-panel relative flex flex-col justify-between rounded-3xl px-4 sm:px-5 py-4 select-none w-full lg:h-full overflow-hidden gap-3 lg:gap-0"
    >
      {/* Top Row: Active Song Readout on Left + Time, Playlist Selector, Spotify Login & Android App Install on Right */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0 w-full">
        <div className="min-w-0 w-full sm:flex-1">
          <h2 className="font-display text-base lg:text-lg font-bold text-white truncate">
            {activeTrack.title}
          </h2>
          <p className="text-xs text-white/60 truncate">
            {activeTrack.artist}
            {immediateNext ? ` · Next: ${immediateNext.track.title}` : ''}
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 w-full sm:w-auto">
          <div
            style={{ color: themePalette.lightHex }}
            className="font-mono tabular-nums text-xs lg:text-sm"
          >
            {formatDuration(currentTimeSec)}{' '}
            <span className="text-white/40">/ {formatDuration(activeTrack.durationSec)}</span>
          </div>

          <label htmlFor="playlist-select" className="sr-only">
            Select Spotify Playlist
          </label>
          <select
            id="playlist-select"
            value={activePlaylist.id}
            onChange={(e) => onSelectPlaylist(e.target.value)}
            className="glass-button min-h-[36px] max-w-[145px] sm:max-w-[195px] text-xs font-medium text-white rounded-xl px-2.5 py-1.5 focus:outline-none truncate"
          >
            {playlists.map((pl) => (
              <option key={pl.id} value={pl.id} className="bg-[#181411] text-white">
                {pl.name}
              </option>
            ))}
          </select>

          {/* 1-Click Spotify Account Login & Playlist Browser Button */}
          <button
            id="spotify-connect-btn"
            type="button"
            onClick={onOpenSpotifyModal}
            aria-label="Connect Spotify Account and Select Playlist"
            title={
              spotifyConnected
                ? `Spotify Connected (${spotifyUserLabel}) — Click to switch playlist`
                : 'Log in to Spotify Account (1-Click)'
            }
            style={
              !spotifyConnected
                ? { color: themePalette.lightHex }
                : undefined
            }
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${
              spotifyConnected
                ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
                : 'glass-button hover:opacity-90'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.334.132-.67.469-.745 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.855zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
            </svg>
          </button>

          {/* Install Native Android App Button */}
          <button
            id="android-install-btn"
            type="button"
            onClick={onOpenAndroidModal}
            aria-label="Install Android App"
            title="Install Native Android App"
            style={{ color: themePalette.lightHex }}
            className="glass-button w-9 h-9 rounded-xl flex items-center justify-center hover:opacity-90 transition-all shrink-0"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Middle Stack: 100% Full-Width Timeline + Below-Timeline VU Meter & Soundwaves + Below-Timeline Jump-To Buttons */}
      <div className="flex flex-col justify-center gap-3 my-1 w-full">
        {/* 1. Full-Width Timeline Seek Scrubber Tinted with Dominant Album Art Color */}
        <div className="w-full">
          <label htmlFor="song-seek-slider" className="sr-only">
            Seek Song Position
          </label>
          <input
            id="song-seek-slider"
            type="range"
            min={0}
            max={activeTrack.durationSec}
            step={1}
            value={Math.min(activeTrack.durationSec, Math.floor(currentTimeSec))}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Seek to any position in the song"
            style={{ accentColor: themePalette.primaryHex }}
            className="w-full h-2 bg-white/15 rounded-lg cursor-pointer block"
          />
        </div>

        {/* 2. Below-Timeline VU Meter & Soundwave Area (Physics-Based Decay + Album Art Dominant Color) */}
        <div
          id="vu-meter-panel"
          ref={vuPanelRef}
          data-dominant-color={themePalette.primaryHex}
          data-vu-left={physicsStateRef.current.left.level}
          data-vu-right={physicsStateRef.current.right.level}
          aria-label="Interactive Song Soundwave and Physics VU Meter"
          className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2.5 flex flex-col gap-2.5"
        >
          {/* Multi-Bar Soundwave Spectrum Colored by Album Art Dominant Palette */}
          <div className="flex items-end justify-between gap-1 h-10 w-full">
            {baseWaveHeights.map((baseH, i) => {
              const barRatio = i / baseWaveHeights.length;
              const isPlayed = barRatio <= progressRatio;
              const isNearPlayhead = Math.abs(barRatio - progressRatio) < 0.04;
              const heightPct = Math.max(18, Math.min(100, Math.round(baseH * 100)));

              return (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => onSeek(Math.floor(barRatio * activeTrack.durationSec))}
                  style={{
                    height: `${heightPct}%`,
                    background: isNearPlayhead
                      ? themePalette.vuPeakHex
                      : isPlayed
                      ? `linear-gradient(to top, ${themePalette.vuStartHex}, ${themePalette.vuPeakHex})`
                      : undefined,
                    boxShadow: isNearPlayhead ? `0 0 8px ${themePalette.glowRgba}` : undefined,
                  }}
                  className={`flex-1 rounded-full cursor-pointer ${
                    !isNearPlayhead && !isPlayed ? 'bg-white/18 hover:bg-white/35' : ''
                  }`}
                />
              );
            })}
          </div>

          {/* Stereo L/R Ballistic Physics VU Meter Bars with Peak-Hold Bounce Needles */}
          <div className="grid grid-cols-2 gap-3 pt-0.5">
            {/* Left Channel VU Meter */}
            <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                id="vu-bar-left"
                ref={leftBarRef}
                style={{
                  width: `${Math.round(physicsStateRef.current.left.level * 100)}%`,
                  background: vuGradientStyle,
                  boxShadow: `0 0 10px ${themePalette.glowRgba}`,
                }}
                className="h-full rounded-full"
              />
              {/* Ballistic Peak-Hold Bounce Marker */}
              <div
                ref={leftPeakRef}
                aria-hidden="true"
                style={{
                  left: `${Math.min(98, Math.round(physicsStateRef.current.left.peakHold * 100))}%`,
                  backgroundColor: themePalette.vuPeakHex,
                }}
                className="pointer-events-none absolute top-0 bottom-0 w-1 rounded-full shadow"
              />
            </div>

            {/* Right Channel VU Meter */}
            <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                id="vu-bar-right"
                ref={rightBarRef}
                style={{
                  width: `${Math.round(physicsStateRef.current.right.level * 100)}%`,
                  background: vuGradientStyle,
                  boxShadow: `0 0 10px ${themePalette.glowRgba}`,
                }}
                className="h-full rounded-full"
              />
              {/* Ballistic Peak-Hold Bounce Marker */}
              <div
                ref={rightPeakRef}
                aria-hidden="true"
                style={{
                  left: `${Math.min(98, Math.round(physicsStateRef.current.right.peakHold * 100))}%`,
                  backgroundColor: themePalette.vuPeakHex,
                }}
                className="pointer-events-none absolute top-0 bottom-0 w-1 rounded-full shadow"
              />
            </div>
          </div>
        </div>

        {/* 3. Below-Timeline Jump-To Hot Cue Buttons with Dominant Album Art Highlight */}
        <div className="grid grid-cols-4 gap-3 w-full">
          {cuePoints.map((cue, idx) => {
            const nextRatio = idx < cuePoints.length - 1 ? cuePoints[idx + 1].ratio : 1.01;
            const isActiveSection = progressRatio >= cue.ratio && progressRatio < nextRatio;
            const CueIcon = cue.Icon;

            return (
              <button
                key={cue.aria}
                type="button"
                onClick={() => onSeek(cue.sec)}
                aria-label={cue.aria}
                title={cue.aria}
                style={
                  isActiveSection
                    ? {
                        backgroundColor: themePalette.softBgRgba,
                        borderColor: themePalette.borderRgba,
                        color: themePalette.lightHex,
                        boxShadow: `0 0 12px ${themePalette.glowRgba}`,
                      }
                    : undefined
                }
                className={`h-10 rounded-xl flex items-center justify-center border transition-all ${
                  isActiveSection
                    ? ''
                    : 'glass-button text-white/75 hover:text-white'
                }`}
              >
                <CueIcon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Row: Volume Aligned LEFT | Play / Pause / Stop Controls in the MIDDLE | Vinyl Warmth Aligned RIGHT */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 pt-2.5 border-t border-white/10 shrink-0 w-full">
        {/* LEFT: Master Volume Controller Aligned Left */}
        <div
          id="volume-controller-left"
          className="flex items-center justify-start gap-2 justify-self-start w-full max-w-[130px] sm:max-w-[165px]"
        >
          <Volume2
            style={{ color: themePalette.lightHex }}
            className="w-4 h-4 shrink-0"
          />
          <input
            id="master-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onChangeVolume(Number(e.target.value))}
            aria-label="Master Volume Gain"
            title="Master Volume"
            style={{ accentColor: themePalette.primaryHex }}
            className="w-full h-1.5 bg-white/15 rounded-lg cursor-pointer"
          />
        </div>

        {/* MIDDLE: Play / Pause / Stop & Track Transport Controls Centered in the Middle */}
        <div
          id="playback-controls-middle"
          className="flex items-center justify-center gap-1.5 sm:gap-2.5 justify-self-center shrink-0"
        >
          <button
            type="button"
            onClick={() => onPrevious(true)}
            aria-label="Previous Track"
            title="Previous Track"
            className="glass-button w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white transition-all"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause Playback' : 'Play Playback'}
            title={isPlaying ? 'Pause' : 'Play'}
            style={{
              backgroundColor: themePalette.primaryHex,
              boxShadow: `0 0 16px ${themePalette.glowRgba}`,
            }}
            className="w-11 h-9 sm:w-14 sm:h-11 rounded-2xl text-[#12100e] flex items-center justify-center transition-all hover:brightness-110"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onStop}
            aria-label="Stop Playback"
            title="Stop Playback (Reset to 0:00)"
            className="glass-button w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white transition-all"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Next Track"
            title="Next Track"
            className="glass-button w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white transition-all"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleRepeatOne}
            aria-label="Toggle Loop Current Song"
            aria-pressed={repeatOne}
            title="Loop Current Song"
            style={
              repeatOne
                ? {
                    backgroundColor: themePalette.softBgRgba,
                    borderColor: themePalette.borderRgba,
                    color: themePalette.lightHex,
                  }
                : undefined
            }
            className={`w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center border transition-all ${
              repeatOne ? '' : 'glass-button text-white/75'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* RIGHT: Vinyl Warmth Controller Aligned Right */}
        <div
          id="vinyl-warmth-right"
          className="flex items-center justify-end gap-2 justify-self-end w-full max-w-[130px] sm:max-w-[165px]"
        >
          <Sparkles
            style={{ color: themePalette.lightHex }}
            className="w-4 h-4 shrink-0"
          />
          <input
            id="vinyl-crackle"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={crackleLevel}
            onChange={(e) => onChangeCrackle(Number(e.target.value))}
            aria-label="Vinyl Crackle Ambience"
            title="Vinyl Warmth"
            style={{ accentColor: themePalette.primaryHex }}
            className="w-full h-1.5 bg-white/15 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </section>
  );
};
