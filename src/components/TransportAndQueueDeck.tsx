import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Volume2,
  Sparkles,
  Flag,
  Mic2,
  Flame,
  Zap,
  Smartphone,
  Pointer,
  BatteryCharging,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  formatDuration,
  getUpNextQueue,
  stepVuMeterPhysics,
  shouldRunActiveAnimationLoops,
  type PlaylistPack,
  type TrackItem,
  type DominantThemePalette,
  type VuChannelPhysicsState,
} from '../utils/playerLogic';
import { retroAudio } from '../utils/retroAudioEngine';
import {
  playbackClockStore,
  usePlaybackSecond,
  usePlaybackCueSection,
} from '../utils/playbackStore';

interface TransportAndQueueDeckProps {
  playlists: PlaylistPack[];
  activePlaylist: PlaylistPack;
  activeTrack: TrackItem;
  currentTrackIndex: number;
  isPlaying: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  repeatOne: boolean;
  shuffleEnabled: boolean;
  showInlineEffects: boolean;
  volume: number;
  crackleLevel: number;
  themePalette: DominantThemePalette;
  spotifyConnected: boolean;
  spotifyUserLabel: string;
  needsInitialSpotifyConnect: boolean;
  guidanceActive: boolean;
  onOpenSpotifyModal: () => void;
  onOpenAndroidModal: () => void;
  onToggleLowPowerMode: () => void;
  onSelectPlaylist: (playlistId: string) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: (forcePrevious?: boolean) => void;
  onNext: () => void;
  onSeek: (targetSec: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeatOne: () => void;
  onChangeVolume: (vol: number) => void;
  onChangeCrackle: (crackle: number) => void;
}

/** Leaf 1Hz playback clock label — updates once per second without re-rendering parent panels */
const PlaybackTimeLabel = React.memo<{ durationSec: number; lightHex: string }>(
  ({ durationSec, lightHex }) => {
    const currentSecond = usePlaybackSecond();
    return (
      <div
        style={{ color: lightHex }}
        className="font-mono tabular-nums text-xs sm:text-sm shrink-0"
      >
        {formatDuration(currentSecond)}{' '}
        <span className="text-white/45">/ {formatDuration(durationSec)}</span>
      </div>
    );
  }
);

/** Leaf 1Hz seek slider — updates input.value property directly (0 DOM attribute mutations per tick) */
const SongSeekSlider = React.memo<{
  trackId: string;
  durationSec: number;
  isStandby: boolean;
  primaryHex: string;
  onSeek: (targetSec: number) => void;
}>(({ trackId, durationSec, isStandby, primaryHex, onSeek }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const maxVal = durationSec || 100;

  useEffect(() => {
    const syncSliderValue = () => {
      const el = inputRef.current;
      if (!el) return;
      const nextVal = String(Math.min(maxVal, playbackClockStore.getCurrentSecond()));
      if (el.value !== nextVal) {
        el.value = nextVal;
      }
    };
    syncSliderValue();
    return playbackClockStore.subscribeSecond(syncSliderValue);
  }, [trackId, maxVal]);

  return (
    <div className="w-full">
      <label htmlFor="song-seek-slider" className="sr-only">
        Seek Song Position
      </label>
      <input
        ref={inputRef}
        id="song-seek-slider"
        type="range"
        min={0}
        max={maxVal}
        step={1}
        disabled={isStandby}
        defaultValue={0}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek to any position in the song"
        style={{ accentColor: primaryHex }}
        className="w-full h-2.5 bg-white/15 rounded-lg cursor-pointer block disabled:opacity-40"
      />
    </div>
  );
});

/** Leaf EQ / Soundwave bars: transform: scaleY() + transform-origin: bottom, no box-shadow, <= 10fps */
const SpectrumEqBars = React.memo<{
  trackId: string;
  trackTitle: string;
  durationSec: number;
  isStandby: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  vuStartHex: string;
  vuPeakHex: string;
  onSeek: (targetSec: number) => void;
}>(
  ({
    trackId,
    trackTitle,
    durationSec,
    isStandby,
    lowPowerMode,
    prefersReducedMotion,
    vuStartHex,
    vuPeakHex,
    onSeek,
  }) => {
    const barRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const lastPlayedIdxRef = useRef<number>(-1);
    const lastUpdateMsRef = useRef<number>(0);

    const baseWaveHeights = useMemo(() => {
      if (isStandby) {
        return Array.from({ length: 28 }, () => 0.22);
      }
      const seedStr = `${trackId}-${trackTitle}`;
      let hash = 2166136261;
      for (let i = 0; i < seedStr.length; i++) {
        hash ^= seedStr.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const bars: number[] = [];
      const totalBars = 28;
      for (let i = 0; i < totalBars; i++) {
        const sinWave = Math.sin((i / totalBars) * Math.PI) * 0.55;
        const pseudoRand = (((hash >>> (i % 16)) & 0xff) / 255) * 0.45;
        bars.push(Math.max(0.2, Math.min(1, Number((sinWave + pseudoRand).toFixed(3)))));
      }
      return bars;
    }, [trackId, trackTitle, isStandby]);

    useEffect(() => {
      const applyBars = () => {
        if (isStandby || lowPowerMode || prefersReducedMotion || durationSec <= 0) {
          if (lastPlayedIdxRef.current !== -1) {
            for (let i = 0; i < 28; i++) {
              const el = barRefs.current[i];
              if (el) el.style.opacity = '0.25';
            }
            lastPlayedIdxRef.current = -1;
          }
          return;
        }

        const now = performance.now();
        if (now - lastUpdateMsRef.current < 100) return;
        lastUpdateMsRef.current = now;

        const ratio = Math.min(
          1,
          Math.max(0, playbackClockStore.getCurrentTimeSec() / durationSec)
        );
        const nextPlayedIdx = Math.min(27, Math.floor(ratio * 28));
        const prevPlayedIdx = lastPlayedIdxRef.current;

        if (nextPlayedIdx === prevPlayedIdx) return;

        if (prevPlayedIdx < 0) {
          for (let i = 0; i < 28; i++) {
            const el = barRefs.current[i];
            if (el) {
              el.style.opacity = i <= nextPlayedIdx ? '0.92' : '0.26';
            }
          }
        } else {
          const minI = Math.min(prevPlayedIdx, nextPlayedIdx);
          const maxI = Math.max(prevPlayedIdx, nextPlayedIdx);
          for (let i = minI; i <= maxI; i++) {
            const el = barRefs.current[i];
            if (el) {
              el.style.opacity = i <= nextPlayedIdx ? '0.92' : '0.26';
            }
          }
        }
        lastPlayedIdxRef.current = nextPlayedIdx;
      };

      lastPlayedIdxRef.current = -1;
      applyBars();
      if (isStandby || lowPowerMode || prefersReducedMotion) return;
      return playbackClockStore.subscribeSecond(applyBars);
    }, [trackId, durationSec, isStandby, lowPowerMode, prefersReducedMotion]);

    const barGradient = `linear-gradient(to top, ${vuStartHex}, ${vuPeakHex})`;

    return (
      <div className="flex items-stretch justify-between gap-1 h-7 w-full">
        {baseWaveHeights.map((baseH, i) => (
          <button
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={isStandby}
            onClick={() => onSeek(Math.floor((i / 28) * durationSec))}
            style={{
              transform: `scaleY(${lowPowerMode ? 0.35 : baseH})`,
              background: isStandby || lowPowerMode ? 'rgba(255,255,255,0.22)' : barGradient,
              opacity: isStandby || lowPowerMode ? 0.25 : 0.26,
            }}
            className="eq-bar flex-1 h-full rounded-sm cursor-pointer"
          />
        ))}
      </div>
    );
  }
);

/** Leaf VU Meters: scaleX() + translateX() via 1 cssText mutation at 12 fps (83ms), 0 writes when paused/hidden/low-power */
const VuMetersPanel = React.memo<{
  isPlaying: boolean;
  isDocumentHidden: boolean;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  bpm: number;
  themePalette: DominantThemePalette;
}>(({ isPlaying, isDocumentHidden, lowPowerMode, prefersReducedMotion, bpm, themePalette }) => {
  const vuGridRef = useRef<HTMLDivElement | null>(null);
  const leftTrackRef = useRef<HTMLDivElement | null>(null);
  const trackWidthRef = useRef<number>(180);
  const lastCssTextRef = useRef<string>('');

  const physicsStateRef = useRef<{
    left: VuChannelPhysicsState;
    right: VuChannelPhysicsState;
  }>({
    left: { level: 0.08, velocity: 0, peakHold: 0.08, peakVelocity: 0 },
    right: { level: 0.08, velocity: 0, peakHold: 0.08, peakVelocity: 0 },
  });

  useEffect(() => {
    const track = leftTrackRef.current;
    if (!track) return;
    const measure = () => {
      const w = track.clientWidth;
      if (w > 20) trackWidthRef.current = w;
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const writeRestState = () => {
      physicsStateRef.current = {
        left: { level: 0.08, velocity: 0, peakHold: 0.08, peakVelocity: 0 },
        right: { level: 0.08, velocity: 0, peakHold: 0.08, peakVelocity: 0 },
      };
      if (vuGridRef.current) {
        const restPx = Math.round(0.08 * Math.max(40, trackWidthRef.current - 6));
        const nextCss = `--vu-l:0.08;--vu-r:0.08;--vu-pl:${restPx}px;--vu-pr:${restPx}px;`;
        if (lastCssTextRef.current !== nextCss) {
          lastCssTextRef.current = nextCss;
          vuGridRef.current.style.cssText = nextCss;
        }
      }
    };

    const canRun = shouldRunActiveAnimationLoops(
      isPlaying,
      isDocumentHidden,
      prefersReducedMotion,
      lowPowerMode
    );

    if (!canRun) {
      writeRestState();
      return;
    }

    const intervalMs = 83;
    let lastTick = performance.now();

    const timerId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const now = performance.now();
      const dtSec = Math.min(0.05, Math.max(0.02, (now - lastTick) / 1000));
      lastTick = now;

      const rawVu = retroAudio.getVuLevels();
      const beatPeriodSec = 60 / Math.max(70, bpm || 110);
      const beatPhase = ((now / 1000) % beatPeriodSec) / beatPeriodSec;
      const beatEnvelope = beatPhase < 0.2 ? 0.22 : -0.14;

      const targetLeft = Math.max(0.08, Math.min(0.98, rawVu.left + beatEnvelope));
      const targetRight = Math.max(0.08, Math.min(0.98, rawVu.right + beatEnvelope * 0.92));

      const nextLeft = stepVuMeterPhysics(physicsStateRef.current.left, targetLeft, dtSec);
      const nextRight = stepVuMeterPhysics(physicsStateRef.current.right, targetRight, dtSec);
      physicsStateRef.current = { left: nextLeft, right: nextRight };

      if (vuGridRef.current) {
        const usableW = Math.max(40, trackWidthRef.current - 6);
        const lScale = Number(nextLeft.level.toFixed(2));
        const rScale = Number(nextRight.level.toFixed(2));
        const plPx = Math.round(Math.min(1, nextLeft.peakHold) * usableW);
        const prPx = Math.round(Math.min(1, nextRight.peakHold) * usableW);
        const nextCss = `--vu-l:${lScale};--vu-r:${rScale};--vu-pl:${plPx}px;--vu-pr:${prPx}px;`;
        if (lastCssTextRef.current !== nextCss) {
          lastCssTextRef.current = nextCss;
          vuGridRef.current.style.cssText = nextCss;
        }
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isPlaying, isDocumentHidden, lowPowerMode, prefersReducedMotion, bpm]);

  const vuGradientStyle = `linear-gradient(90deg, ${themePalette.vuStartHex} 0%, ${themePalette.vuMidHex} 60%, ${themePalette.vuPeakHex} 100%)`;

  if (lowPowerMode) {
    return (
      <div className="grid grid-cols-2 gap-3 pt-0.5 opacity-45">
        <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full w-full rounded-full bg-white/15 scale-x-[0.08] origin-left" />
        </div>
        <div className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden">
          <div className="h-full w-full rounded-full bg-white/15 scale-x-[0.08] origin-left" />
        </div>
      </div>
    );
  }

  return (
    <div ref={vuGridRef} className="grid grid-cols-2 gap-3 pt-0.5">
      <div
        ref={leftTrackRef}
        style={{ boxShadow: `0 0 8px ${themePalette.glowRgba}` }}
        className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden"
      >
        <div
          id="vu-bar-left"
          style={{ background: vuGradientStyle }}
          className="vu-bar-fill vu-bar-left rounded-full"
        />
        <div
          aria-hidden="true"
          style={{ backgroundColor: themePalette.vuPeakHex }}
          className="vu-peak-marker vu-peak-left pointer-events-none absolute top-0 bottom-0 left-0 w-1 rounded-full"
        />
      </div>

      <div
        style={{ boxShadow: `0 0 8px ${themePalette.glowRgba}` }}
        className="relative h-2 w-full bg-white/10 rounded-full overflow-hidden"
      >
        <div
          id="vu-bar-right"
          style={{ background: vuGradientStyle }}
          className="vu-bar-fill vu-bar-right rounded-full"
        />
        <div
          aria-hidden="true"
          style={{ backgroundColor: themePalette.vuPeakHex }}
          className="vu-peak-marker vu-peak-right pointer-events-none absolute top-0 bottom-0 left-0 w-1 rounded-full"
        />
      </div>
    </div>
  );
});

/** Leaf Hot Cue Buttons: updates only 4 times per entire song */
const CuePointsBar = React.memo<{
  durationSec: number;
  isStandby: boolean;
  themePalette: DominantThemePalette;
  onSeek: (targetSec: number) => void;
}>(({ durationSec, isStandby, themePalette, onSeek }) => {
  const activeCueSection = usePlaybackCueSection();

  const cuePoints = useMemo(
    () => [
      { aria: 'Jump to Intro 0:00', sec: 0, Icon: Flag },
      { aria: 'Jump to 25% Verse', sec: Math.floor(durationSec * 0.25), Icon: Mic2 },
      { aria: 'Jump to 50% Chorus', sec: Math.floor(durationSec * 0.5), Icon: Flame },
      { aria: 'Jump to 75% Solo', sec: Math.floor(durationSec * 0.75), Icon: Zap },
    ],
    [durationSec]
  );

  return (
    <div className="grid grid-cols-4 gap-2 w-full">
      {cuePoints.map((cue, idx) => {
        const isActiveSection = !isStandby && activeCueSection === idx;
        const CueIcon = cue.Icon;

        return (
          <button
            key={cue.aria}
            type="button"
            disabled={isStandby}
            onClick={() => onSeek(cue.sec)}
            data-pressed={isActiveSection ? 'true' : 'false'}
            aria-label={cue.aria}
            title={cue.aria}
            style={
              isActiveSection
                ? {
                    borderColor: themePalette.borderRgba,
                    color: themePalette.lightHex,
                  }
                : undefined
            }
            className="hifi-btn text-white/80"
          >
            <CueIcon strokeWidth={1.75} className="hifi-icon" />
          </button>
        );
      })}
    </div>
  );
});

const VolumeSlider = React.memo<{
  volume: number;
  primaryHex: string;
  lightHex: string;
  onChangeVolume: (vol: number) => void;
}>(({ volume, primaryHex, lightHex, onChangeVolume }) => (
  <div
    id="volume-controller-left"
    className="flex items-center justify-start gap-2 w-full"
  >
    <Volume2 strokeWidth={1.75} style={{ color: lightHex }} className="hifi-icon" />
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
      style={{ accentColor: primaryHex }}
      className="w-full h-2 bg-white/15 rounded-lg cursor-pointer"
    />
  </div>
));

const CrackleSlider = React.memo<{
  crackleLevel: number;
  primaryHex: string;
  lightHex: string;
  onChangeCrackle: (crackle: number) => void;
}>(({ crackleLevel, primaryHex, lightHex, onChangeCrackle }) => (
  <div
    id="vinyl-warmth-right"
    className="flex items-center justify-end gap-2 w-full"
  >
    <Sparkles strokeWidth={1.75} style={{ color: lightHex }} className="hifi-icon" />
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
      style={{ accentColor: primaryHex }}
      className="w-full h-2 bg-white/15 rounded-lg cursor-pointer"
    />
  </div>
));

export const TransportAndQueueDeck = React.memo<TransportAndQueueDeckProps>(
  ({
    playlists,
    activePlaylist,
    activeTrack,
    currentTrackIndex,
    isPlaying,
    isDocumentHidden,
    lowPowerMode,
    prefersReducedMotion,
    repeatOne,
    shuffleEnabled,
    showInlineEffects,
    volume,
    crackleLevel,
    themePalette,
    spotifyConnected,
    spotifyUserLabel,
    needsInitialSpotifyConnect,
    guidanceActive,
    onOpenSpotifyModal,
    onOpenAndroidModal,
    onToggleLowPowerMode,
    onSelectPlaylist,
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    onSeek,
    onToggleShuffle,
    onToggleRepeatOne,
    onChangeVolume,
    onChangeCrackle,
  }) => {
    const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

    const isStandby = activeTrack.id === 'standby-empty' || activeTrack.durationSec <= 0;
    const upNextItems = useMemo(
      () => getUpNextQueue(activePlaylist.tracks, currentTrackIndex),
      [activePlaylist.tracks, currentTrackIndex]
    );
    const immediateNext = upNextItems[0] || null;

    const shouldAnimateGuidance =
      needsInitialSpotifyConnect && guidanceActive && !isDocumentHidden && !prefersReducedMotion;

    const secondaryEffectsBlock = (
      <div className="flex flex-col gap-2.5 w-full">
        {/* EQ Soundwaves & Physics VU Meter */}
        <div
          id="vu-meter-panel"
          data-dominant-color={themePalette.primaryHex}
          aria-label="Interactive Song Soundwave and Physics VU Meter"
          className="panel-contain w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 flex flex-col gap-1.5"
        >
          <SpectrumEqBars
            trackId={activeTrack.id}
            trackTitle={activeTrack.title}
            durationSec={activeTrack.durationSec}
            isStandby={isStandby}
            lowPowerMode={lowPowerMode}
            prefersReducedMotion={prefersReducedMotion}
            vuStartHex={themePalette.vuStartHex}
            vuPeakHex={themePalette.vuPeakHex}
            onSeek={onSeek}
          />

          <VuMetersPanel
            isPlaying={isPlaying}
            isDocumentHidden={isDocumentHidden}
            lowPowerMode={lowPowerMode}
            prefersReducedMotion={prefersReducedMotion}
            bpm={activeTrack.bpm}
            themePalette={themePalette}
          />
        </div>

        {/* Hot Cue Jump Buttons + Volume & Warmth Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
          <CuePointsBar
            durationSec={activeTrack.durationSec}
            isStandby={isStandby}
            themePalette={themePalette}
            onSeek={onSeek}
          />
          <div className="grid grid-cols-2 gap-3 items-center">
            <VolumeSlider
              volume={volume}
              primaryHex={themePalette.primaryHex}
              lightHex={themePalette.lightHex}
              onChangeVolume={onChangeVolume}
            />
            <CrackleSlider
              crackleLevel={crackleLevel}
              primaryHex={themePalette.primaryHex}
              lightHex={themePalette.lightHex}
              onChangeCrackle={onChangeCrackle}
            />
          </div>
        </div>
      </div>
    );

    return (
      <div
        id="playback-controls-bar"
        aria-label="Playback Controls"
        className="relative flex flex-col gap-2 pt-2 border-t border-white/10 shrink-0 w-full"
      >
        {/* Row A: Active Song Meta + Seek Time */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm sm:text-base font-bold text-white truncate leading-tight">
              {activeTrack.title}
            </h2>
            <p className="text-[11px] sm:text-xs text-white/60 truncate leading-tight">
              {activeTrack.artist}
              {immediateNext ? ` · Next: ${immediateNext.track.title}` : ''}
            </p>
          </div>
          <PlaybackTimeLabel
            durationSec={activeTrack.durationSec}
            lightHex={themePalette.lightHex}
          />
        </div>

        {/* Row B: Full-Width Seek Bar */}
        <SongSeekSlider
          trackId={activeTrack.id}
          durationSec={activeTrack.durationSec}
          isStandby={isStandby}
          primaryHex={themePalette.primaryHex}
          onSeek={onSeek}
        />

        {/* Row C: Primary Transport Controls (Prev, Play/Pause, Stop, Next, Shuffle, Repeat) + Spotify / Low Power / More Drawer */}
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div
            id="playback-controls-middle"
            className="flex items-center gap-2 shrink-0"
          >
            <button
              type="button"
              disabled={isStandby}
              onClick={() => onPrevious(true)}
              aria-label="Previous Track"
              title="Previous Track"
              className="hifi-btn text-white"
            >
              <SkipBack strokeWidth={1.75} className="hifi-icon" />
            </button>

            <button
              type="button"
              disabled={isStandby}
              onClick={onTogglePlay}
              data-pressed={isPlaying ? 'true' : 'false'}
              aria-label={isPlaying ? 'Pause Playback' : 'Play Playback'}
              title={isPlaying ? 'Pause' : 'Play'}
              style={{
                background: `linear-gradient(180deg, ${themePalette.lightHex} 0%, ${themePalette.primaryHex} 100%)`,
                borderColor: themePalette.lightHex,
                color: '#0b0a09',
              }}
              className="hifi-btn px-3"
            >
              {isPlaying ? (
                <Pause strokeWidth={2.25} className="hifi-icon fill-current" />
              ) : (
                <Play strokeWidth={2.25} className="hifi-icon fill-current" />
              )}
            </button>

            <button
              type="button"
              disabled={isStandby}
              onClick={onStop}
              aria-label="Stop Playback"
              title="Stop Playback"
              className="hifi-btn text-white"
            >
              <Square strokeWidth={1.75} className="hifi-icon fill-current" />
            </button>

            <button
              type="button"
              disabled={isStandby}
              onClick={onNext}
              aria-label="Next Track"
              title="Next Track"
              className="hifi-btn text-white"
            >
              <SkipForward strokeWidth={1.75} className="hifi-icon" />
            </button>

            <button
              type="button"
              disabled={isStandby}
              onClick={onToggleShuffle}
              data-pressed={shuffleEnabled ? 'true' : 'false'}
              aria-label="Shuffle Playlist"
              aria-pressed={shuffleEnabled}
              title={shuffleEnabled ? 'Shuffle On' : 'Shuffle Playlist'}
              style={
                shuffleEnabled
                  ? {
                      borderColor: themePalette.borderRgba,
                      color: themePalette.lightHex,
                    }
                  : undefined
              }
              className="hifi-btn text-white/80"
            >
              <Shuffle strokeWidth={1.75} className="hifi-icon" />
            </button>

            <button
              type="button"
              disabled={isStandby}
              onClick={onToggleRepeatOne}
              data-pressed={repeatOne ? 'true' : 'false'}
              aria-label="Toggle Loop Current Song"
              aria-pressed={repeatOne}
              title="Repeat Song"
              style={
                repeatOne
                  ? {
                      borderColor: themePalette.borderRgba,
                      color: themePalette.lightHex,
                    }
                  : undefined
              }
              className="hifi-btn text-white/80"
            >
              <Repeat strokeWidth={1.75} className="hifi-icon" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {needsInitialSpotifyConnect && shouldAnimateGuidance && (
              <button
                id="spotify-hand-pointer"
                type="button"
                aria-label="Click Connect Spotify"
                onClick={onOpenSpotifyModal}
                className="hand-pointer-nudge hifi-btn px-2.5 gap-1.5 border-[#1ed760] text-[#1ed760] font-bold text-xs whitespace-nowrap"
              >
                <Pointer strokeWidth={1.75} className="hifi-icon rotate-90" />
              </button>
            )}

            <button
              id="spotify-connect-btn"
              type="button"
              onClick={onOpenSpotifyModal}
              data-blinking={shouldAnimateGuidance ? 'true' : 'false'}
              aria-label="Connect Spotify Account and Select Playlist"
              title={
                spotifyConnected
                  ? `Spotify Connected (${spotifyUserLabel})`
                  : 'Connect Spotify'
              }
              style={
                !spotifyConnected && !needsInitialSpotifyConnect
                  ? { color: themePalette.lightHex }
                  : undefined
              }
              className={`hifi-btn shrink-0 ${
                needsInitialSpotifyConnect
                  ? `${
                      shouldAnimateGuidance ? 'spotify-connect-blink ' : ''
                    }px-3 gap-2 bg-[#1ed760] text-[#12100e] font-bold text-xs border-white whitespace-nowrap`
                  : spotifyConnected
                  ? 'text-emerald-300 border-emerald-400/50'
                  : ''
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="hifi-icon fill-current"
                aria-hidden="true"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.334.132-.67.469-.745 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.855zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
              </svg>
              {needsInitialSpotifyConnect && <span>Spotify</span>}
            </button>

            <button
              id="low-power-toggle-btn"
              type="button"
              onClick={onToggleLowPowerMode}
              data-pressed={lowPowerMode ? 'true' : 'false'}
              aria-label="Toggle Low Power Mode"
              aria-pressed={lowPowerMode}
              title={lowPowerMode ? 'Low Power Mode ON' : 'Low Power Mode OFF'}
              style={
                lowPowerMode
                  ? {
                      borderColor: themePalette.borderRgba,
                      color: themePalette.lightHex,
                    }
                  : undefined
              }
              className="hifi-btn text-white/75"
            >
              <BatteryCharging strokeWidth={1.75} className="hifi-icon" />
            </button>

            <button
              id="more-controls-btn"
              type="button"
              onClick={() => setMoreDrawerOpen((prev) => !prev)}
              data-pressed={moreDrawerOpen ? 'true' : 'false'}
              aria-label="More Controls and Audio Effects"
              aria-expanded={moreDrawerOpen}
              title="More Controls (Effects, Volume, Playlists, Settings)"
              style={
                moreDrawerOpen
                  ? {
                      borderColor: themePalette.borderRgba,
                      color: themePalette.lightHex,
                    }
                  : undefined
              }
              className="hifi-btn text-white/85"
            >
              <SlidersHorizontal strokeWidth={1.75} className="hifi-icon" />
            </button>
          </div>
        </div>

        {/* Inline Effects & Telemetry Strip on Tall Desktop */}
        {showInlineEffects && !moreDrawerOpen && secondaryEffectsBlock}

        {/* Single "More" Drawer for Secondary Controls (Effects, Volume, Warmth, Playlist Select, Android App) */}
        {moreDrawerOpen && (
          <div
            id="more-controls-drawer"
            role="region"
            aria-label="Secondary Audio Effects and Settings Drawer"
            className="glass-panel panel-contain absolute bottom-full right-0 left-0 mb-2 z-40 rounded-2xl p-3 flex flex-col gap-3 shadow-2xl max-h-[65dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
              <span className="font-display text-xs font-bold text-white">
                Effects &amp; Settings
              </span>
              <button
                type="button"
                onClick={() => setMoreDrawerOpen(false)}
                aria-label="Close Effects and Settings Drawer"
                className="hifi-btn text-white/80"
              >
                <X strokeWidth={1.75} className="hifi-icon" />
              </button>
            </div>

            {secondaryEffectsBlock}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
              <div className="flex-1 min-w-[160px]">
                <label htmlFor="playlist-select" className="sr-only">
                  Select Spotify Playlist
                </label>
                <select
                  id="playlist-select"
                  value={playlists.length > 0 ? activePlaylist.id : ''}
                  onChange={(e) => onSelectPlaylist(e.target.value)}
                  disabled={playlists.length === 0}
                  className="glass-button min-h-[44px] w-full text-xs font-medium text-white rounded-xl px-3 py-2 focus:outline-none disabled:opacity-50"
                >
                  {playlists.length === 0 ? (
                    <option value="" className="bg-[#181411] text-white/60">
                      No Playlist Loaded
                    </option>
                  ) : (
                    playlists.map((pl) => (
                      <option key={pl.id} value={pl.id} className="bg-[#181411] text-white">
                        {pl.name} ({pl.tracks.length})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <button
                id="android-install-btn"
                type="button"
                onClick={onOpenAndroidModal}
                aria-label="Install Android App"
                title="Install Android App"
                style={{ color: themePalette.lightHex }}
                className="hifi-btn px-3 gap-2 text-xs font-medium whitespace-nowrap"
              >
                <Smartphone strokeWidth={1.75} className="hifi-icon" />
                <span>App</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);
