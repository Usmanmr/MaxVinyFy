import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { retroAudio } from '../utils/retroAudioEngine';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import type { YouTubeGrabFrame } from '../utils/playerLogic';
import {
  WINAMP_DEFAULT_BANDS_DB,
  WIN98_BOOT_TIMINGS_MS,
  WIN98_SHUTDOWN_TIMINGS_MS,
  WIN98_BSOD_TIMINGS_MS,
  computeBsodTriggerDelayMs,
  dbToNormalized01,
  computeScatteredFloppyDeskItems,
  formatWin98SystemClock,
  type Win98BootStage,
  type Win98PcPowerPhase,
  type Win98BsodPhase,
} from '../utils/pcWinampLogic';
import { Dell1998Monitor, Dell1998CpuTower } from './pcwinamp/Dell1998Hardware';
import { FloppyDiskDeskItem } from './pcwinamp/FloppyDiskDeskItem';
import {
  WinampThingerModule,
  WinampMainDeckModule,
  WinampEqualizerModule,
  WinampAlbumArtModule,
  WinampCompactTransportBar,
  WinampPlaylistModule,
} from './pcwinamp/WinampSuiteModules';
import { useDoubleTapHideArt } from '../hooks/useDoubleTapHideArt';
import type { TurntableDeckProps } from './TurntableDeck';

export const PcWinampDeck: React.FC<TurntableDeckProps> = React.memo(
  ({
    track,
    isPlaying,
    isDocumentHidden,
    lowPowerMode,
    prefersReducedMotion,
    volume,
    repeatOne,
    shuffleEnabled,
    hideBoxArt = false,
    onToggleHideBoxArt,
    viewportLayout,
    playlistTracks = [],
    onTogglePlay,
    onStop,
    onPrevious,
    onNext,
    onSeek,
    onChangeVolume,
    onToggleRepeatOne,
    onToggleShuffle,
    onOpenSpotifyModal,
    onSelectTrack,
    onResolvedTrackMetadata,
    onPausePlayback,
    onResumePlaybackAt,
    onTvFullscreenChange,
  }) => {
    const { doubleTapHideArtBind } = useDoubleTapHideArt(onToggleHideBoxArt);
    const [eqPanelVisible, setEqPanelVisible] = useState(true);
    const [playlistPanelVisible, setPlaylistPanelVisible] = useState(true);
    const elapsedSec = usePlaybackSecond();
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;

    const [windowDims, setWindowDims] = useState(() => ({
      w: typeof window !== 'undefined' ? window.innerWidth : 1280,
      h: typeof window !== 'undefined' ? window.innerHeight : 800,
    }));

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const onResize = () => {
        setWindowDims({ w: window.innerWidth, h: window.innerHeight });
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, []);

    const isMobilePortrait =
      viewportLayout === 'mobile-portrait' ||
      (windowDims.w <= 767 && windowDims.h > windowDims.w);
    const isMobileLandscape =
      !isMobilePortrait &&
      (viewportLayout === 'mobile-landscape' ||
        (windowDims.w > windowDims.h && windowDims.h <= 580));

    // PART 3: Decoupled CRT Monitor Power vs. CPU Tower Power State Machines
    const [monitorPoweredOn, setMonitorPoweredOn] = useState(true);
    const [monitorPowerTransition, setMonitorPowerTransition] = useState<
      'idle' | 'collapsing' | 'expanding'
    >('idle');
    const [pcPowerPhase, setPcPowerPhase] = useState<Win98PcPowerPhase>('on');
    const [bootStage, setBootStage] = useState<Win98BootStage>(
      prefersReducedMotion ? 'desktop' : 'warmup'
    );
    const [bsodPhase, setBsodPhase] = useState<Win98BsodPhase>('none');
    const [hddBootFlicker, setHddBootFlicker] = useState(false);

    const [eqEnabled, setEqEnabled] = useState(true);
    const [eqAuto, setEqAuto] = useState(false);
    const [preampDb, setPreampDb] = useState(1);
    const [bandsDb, setBandsDb] = useState<number[]>(() => [...WINAMP_DEFAULT_BANDS_DB]);

    const [spectrumBars, setSpectrumBars] = useState<number[]>(() => new Array(19).fill(0));
    const [waveformSamples, setWaveformSamples] = useState<number[]>(() => new Array(38).fill(0));
    const [systemTime, setSystemTime] = useState<Date>(() => new Date());

    const [floppyLedActive, setFloppyLedActive] = useState(false);
    const [insertingTrackId, setInsertingTrackId] = useState<string | null>(null);
    const [ejectingTrackId, setEjectingTrackId] = useState<string | null>(null);

    const [mediaPlayerOpen, setMediaPlayerOpen] = useState(false);
    const [wmpVideoId, setWmpVideoId] = useState<string>(track.youtubeVideoId || '');
    const [isResolvingVideo, setIsResolvingVideo] = useState(false);
    const [playlistFlash, setPlaylistFlash] = useState(false);

    const prevTrackIdRef = useRef<string>(track.id);
    const trackIdRef = useRef<string>(track.id);
    trackIdRef.current = track.id;

    const flickerTimersRef = useRef<number[]>([]);
    const bootTimersRef = useRef<number[]>([]);
    const bootIntervalRef = useRef<number | null>(null);
    const monitorTimersRef = useRef<number[]>([]);
    const shutdownTimersRef = useRef<number[]>([]);
    const bsodScheduleTimerRef = useRef<number | null>(null);
    const bsodPhaseTimersRef = useRef<number[]>([]);
    const bsodFlickerIntervalRef = useRef<number | null>(null);
    const hasBsodTriggeredForTrackRef = useRef<boolean>(false);
    const bsodSavedPlaybackRef = useRef<{ wasPlaying: boolean; savedTimeSec: number }>({
      wasPlaying: false,
      savedTimeSec: 0,
    });

    const eqGainsRef = useRef<number[]>(bandsDb.map((db) => dbToNormalized01(db)));
    const videoCacheRef = useRef<Map<string, string>>(new Map());

    const isPlayingRef = useRef(isPlaying);
    isPlayingRef.current = isPlaying;

    useEffect(() => {
      eqGainsRef.current = eqEnabled
        ? bandsDb.map((db) => dbToNormalized01(db + preampDb * 0.25))
        : bandsDb.map(() => 0.5);
    }, [bandsDb, preampDb, eqEnabled]);

    const clearBootTimers = useCallback(() => {
      bootTimersRef.current.forEach((t) => window.clearTimeout(t));
      bootTimersRef.current = [];
      if (bootIntervalRef.current !== null) {
        window.clearInterval(bootIntervalRef.current);
        bootIntervalRef.current = null;
      }
      setHddBootFlicker(false);
    }, []);

    const clearShutdownTimers = useCallback(() => {
      shutdownTimersRef.current.forEach((t) => window.clearTimeout(t));
      shutdownTimersRef.current = [];
    }, []);

    const clearMonitorTimers = useCallback(() => {
      monitorTimersRef.current.forEach((t) => window.clearTimeout(t));
      monitorTimersRef.current = [];
    }, []);

    const clearBsodTimers = useCallback(() => {
      if (bsodScheduleTimerRef.current !== null) {
        window.clearTimeout(bsodScheduleTimerRef.current);
        bsodScheduleTimerRef.current = null;
      }
      bsodPhaseTimersRef.current.forEach((t) => window.clearTimeout(t));
      bsodPhaseTimersRef.current = [];
      if (bsodFlickerIntervalRef.current !== null) {
        window.clearInterval(bsodFlickerIntervalRef.current);
        bsodFlickerIntervalRef.current = null;
      }
      setHddBootFlicker(false);
    }, []);

    const runWin98BootSequence = useCallback(
      (accelerated = false) => {
        clearBootTimers();
        if (prefersReducedMotion) {
          setBootStage('desktop');
          return;
        }

        const scale = accelerated ? 0.52 : 1;
        setBootStage('warmup');

        bootTimersRef.current.push(
          window.setTimeout(() => {
            setBootStage('bios');
          }, Math.round(WIN98_BOOT_TIMINGS_MS.biosStartMs * scale))
        );

        bootTimersRef.current.push(
          window.setTimeout(() => {
            setBootStage('splash');
            bootIntervalRef.current = window.setInterval(() => {
              setHddBootFlicker((prev) => !prev);
            }, 95);
          }, Math.round(WIN98_BOOT_TIMINGS_MS.splashStartMs * scale))
        );

        bootTimersRef.current.push(
          window.setTimeout(() => {
            if (bootIntervalRef.current !== null) {
              window.clearInterval(bootIntervalRef.current);
              bootIntervalRef.current = null;
            }
            setHddBootFlicker(false);
            setBootStage('teal-wait');
          }, Math.round(WIN98_BOOT_TIMINGS_MS.tealStartMs * scale))
        );

        bootTimersRef.current.push(
          window.setTimeout(() => {
            setBootStage('desktop');
          }, Math.round(WIN98_BOOT_TIMINGS_MS.desktopStartMs * scale))
        );
      },
      [clearBootTimers, prefersReducedMotion]
    );

    // Boot once when entering PC / Winamp mode while PC power is ON
    useEffect(() => {
      runWin98BootSequence(false);
      return () => {
        clearBootTimers();
        clearMonitorTimers();
        clearShutdownTimers();
        clearBsodTimers();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSkipBoot = useCallback(() => {
      clearBootTimers();
      setBootStage('desktop');
    }, [clearBootTimers]);

    // PART 3.1: Decoupled CRT Monitor Power Button (Does NOT pause music or turn off CPU)
    const handleToggleMonitorPower = useCallback(() => {
      if (pcPowerPhase !== 'on') return;
      clearMonitorTimers();

      if (monitorPoweredOn) {
        if (prefersReducedMotion) {
          setMonitorPoweredOn(false);
          setMonitorPowerTransition('idle');
          return;
        }
        setMonitorPowerTransition('collapsing');
        monitorTimersRef.current.push(
          window.setTimeout(() => {
            setMonitorPoweredOn(false);
            setMonitorPowerTransition('idle');
          }, 240)
        );
      } else {
        setMonitorPoweredOn(true);
        if (prefersReducedMotion) {
          setMonitorPowerTransition('idle');
          return;
        }
        setMonitorPowerTransition('expanding');
        monitorTimersRef.current.push(
          window.setTimeout(() => {
            setMonitorPowerTransition('idle');
          }, 180)
        );
      }
    }, [pcPowerPhase, monitorPoweredOn, prefersReducedMotion, clearMonitorTimers]);

    // PART 3.2: CPU Tower Power Button & Start -> Shut Down... (~2.6s Windows 98 Shutdown Sequence)
    const triggerWin98Shutdown = useCallback(() => {
      if (pcPowerPhase !== 'on') return;
      clearBootTimers();
      clearShutdownTimers();
      clearBsodTimers();
      setBsodPhase('none');
      setMediaPlayerOpen(false);

      if (isPlayingRef.current) {
        if (onPausePlayback) {
          onPausePlayback();
        } else {
          onTogglePlay();
        }
      }
      retroAudio.triggerWin98ShutdownChime();

      if (prefersReducedMotion) {
        setPcPowerPhase('off');
        setBootStage('off');
        return;
      }

      setMonitorPoweredOn(true);
      setPcPowerPhase('shutting-down');

      shutdownTimersRef.current.push(
        window.setTimeout(() => {
          setPcPowerPhase('safe-to-turn-off');
        }, WIN98_SHUTDOWN_TIMINGS_MS.safeScreenStartMs)
      );

      shutdownTimersRef.current.push(
        window.setTimeout(() => {
          setPcPowerPhase('off');
          setBootStage('off');
        }, WIN98_SHUTDOWN_TIMINGS_MS.powerOffStartMs)
      );
    }, [
      pcPowerPhase,
      clearBootTimers,
      clearShutdownTimers,
      clearBsodTimers,
      onPausePlayback,
      onTogglePlay,
      prefersReducedMotion,
    ]);

    const handleToggleCpuPower = useCallback(() => {
      if (pcPowerPhase === 'off') {
        clearShutdownTimers();
        setPcPowerPhase('on');
        setMonitorPoweredOn(true);
        setMonitorPowerTransition(prefersReducedMotion ? 'idle' : 'expanding');
        if (!prefersReducedMotion) {
          monitorTimersRef.current.push(
            window.setTimeout(() => {
              setMonitorPowerTransition('idle');
            }, 180)
          );
        }
        runWin98BootSequence(false);
        return;
      }

      if (pcPowerPhase === 'on') {
        triggerWin98Shutdown();
      }
    }, [
      pcPowerPhase,
      clearShutdownTimers,
      prefersReducedMotion,
      runWin98BootSequence,
      triggerWin98Shutdown,
    ]);

    // PART 4: BSOD Recovery & Once-Per-Song Scheduler
    const startBsodRecoverySequence = useCallback(() => {
      clearBsodTimers();
      setBsodPhase('black-flash');

      bsodPhaseTimersRef.current.push(
        window.setTimeout(() => {
          setBsodPhase('recovery-boot');
          setBootStage('splash');
        }, WIN98_BSOD_TIMINGS_MS.blackFlashMs)
      );

      bsodPhaseTimersRef.current.push(
        window.setTimeout(() => {
          setBsodPhase('none');
          setBootStage('desktop');
          const { wasPlaying, savedTimeSec } = bsodSavedPlaybackRef.current;
          if (wasPlaying) {
            if (onResumePlaybackAt) {
              onResumePlaybackAt(savedTimeSec);
            } else {
              onTogglePlay();
            }
          }
        }, WIN98_BSOD_TIMINGS_MS.blackFlashMs + WIN98_BSOD_TIMINGS_MS.recoveryBootMs)
      );
    }, [clearBsodTimers, onResumePlaybackAt, onTogglePlay]);

    const triggerBsodGlitch = useCallback(() => {
      if (
        hasBsodTriggeredForTrackRef.current ||
        pcPowerPhase !== 'on' ||
        bootStage !== 'desktop' ||
        isStandby
      ) {
        return;
      }
      hasBsodTriggeredForTrackRef.current = true;
      clearBsodTimers();

      const savedTimeSec = playbackClockStore.getCurrentTimeSec();
      const wasPlaying = isPlayingRef.current;
      bsodSavedPlaybackRef.current = { wasPlaying, savedTimeSec };

      if (wasPlaying) {
        if (onPausePlayback) {
          onPausePlayback();
        } else {
          onTogglePlay();
        }
      }

      retroAudio.triggerWin98CriticalErrorChord();
      setBsodPhase('bsod');

      bsodFlickerIntervalRef.current = window.setInterval(() => {
        setHddBootFlicker((prev) => !prev);
      }, 65);

      bsodPhaseTimersRef.current.push(
        window.setTimeout(() => {
          startBsodRecoverySequence();
        }, WIN98_BSOD_TIMINGS_MS.bsodDisplayMs)
      );
    }, [
      pcPowerPhase,
      bootStage,
      isStandby,
      clearBsodTimers,
      onPausePlayback,
      onTogglePlay,
      startBsodRecoverySequence,
    ]);

    // Reset once-per-song BSOD guard whenever active track changes
    useEffect(() => {
      hasBsodTriggeredForTrackRef.current = false;
      clearBsodTimers();
      setBsodPhase((cur) => (cur === 'none' ? cur : 'none'));
    }, [track.id, clearBsodTimers]);

    // Schedule at most one random BSOD while a song is actively playing on desktop
    useEffect(() => {
      if (
        !isPlaying ||
        isStandby ||
        pcPowerPhase !== 'on' ||
        bootStage !== 'desktop' ||
        bsodPhase !== 'none' ||
        hasBsodTriggeredForTrackRef.current ||
        prefersReducedMotion
      ) {
        if (bsodScheduleTimerRef.current !== null) {
          window.clearTimeout(bsodScheduleTimerRef.current);
          bsodScheduleTimerRef.current = null;
        }
        return;
      }

      const delayMs = computeBsodTriggerDelayMs(track.durationSec);
      bsodScheduleTimerRef.current = window.setTimeout(() => {
        triggerBsodGlitch();
      }, delayMs);

      return () => {
        if (bsodScheduleTimerRef.current !== null) {
          window.clearTimeout(bsodScheduleTimerRef.current);
          bsodScheduleTimerRef.current = null;
        }
      };
    }, [
      isPlaying,
      isStandby,
      pcPowerPhase,
      bootStage,
      bsodPhase,
      track.id,
      track.durationSec,
      prefersReducedMotion,
      triggerBsodGlitch,
    ]);

    const clearFlickerTimers = useCallback(() => {
      flickerTimersRef.current.forEach((t) => window.clearTimeout(t));
      flickerTimersRef.current = [];
    }, []);

    const triggerFloppySeekBurst = useCallback(() => {
      clearFlickerTimers();
      retroAudio.triggerFloppySeekCue();
      const pattern = [0, 80, 160, 240, 320, 400, 480];
      pattern.forEach((delay, idx) => {
        const timerId = window.setTimeout(() => {
          setFloppyLedActive(idx % 2 === 0);
        }, delay);
        flickerTimersRef.current.push(timerId);
      });
      const endTimer = window.setTimeout(() => {
        setFloppyLedActive(false);
      }, 580);
      flickerTimersRef.current.push(endTimer);
    }, [clearFlickerTimers]);

    useEffect(() => {
      if (prevTrackIdRef.current !== track.id) {
        prevTrackIdRef.current = track.id;
        if (!isStandby) {
          triggerFloppySeekBurst();
        }
      }
    }, [track.id, isStandby, triggerFloppySeekBurst]);

    useEffect(() => {
      return () => {
        clearFlickerTimers();
      };
    }, [clearFlickerTimers]);

    // Resolve YouTube videoId dynamically whenever Media Player is open
    useEffect(() => {
      const cached = videoCacheRef.current.get(track.id);
      if (cached) {
        setWmpVideoId(cached);
        setIsResolvingVideo(false);
        return;
      }

      if (track.youtubeVideoId) {
        setWmpVideoId(track.youtubeVideoId);
        setIsResolvingVideo(false);
        return;
      }

      setWmpVideoId('');
      if (!mediaPlayerOpen || isStandby || !track.title) {
        setIsResolvingVideo(false);
        return;
      }

      let cancelled = false;
      const targetTrackId = track.id;
      setIsResolvingVideo(true);

      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist || '',
        trackId: targetTrackId,
        videoId: '',
      });

      fetch(`/api/youtube/search-grabs?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              videoId?: string;
              artworkUrl?: string;
              frames?: YouTubeGrabFrame[];
              channels?: Array<{ videoId: string; frames: YouTubeGrabFrame[] }>;
            } | null
          ) => {
            if (cancelled || trackIdRef.current !== targetTrackId) return;
            setIsResolvingVideo(false);
            const nextVideoId = data?.channels?.[0]?.videoId || data?.videoId || '';
            const nextFrames =
              data?.channels?.[0]?.frames && data.channels[0].frames.length > 0
                ? data.channels[0].frames
                : Array.isArray(data?.frames)
                  ? data.frames
                  : track.tvFrames || [];
            if (nextVideoId) {
              videoCacheRef.current.set(targetTrackId, nextVideoId);
              setWmpVideoId(nextVideoId);
              onResolvedTrackMetadata?.(
                targetTrackId,
                data?.artworkUrl || track.artworkUrl,
                nextVideoId,
                nextFrames
              );
            }
          }
        )
        .catch(() => {
          if (!cancelled) setIsResolvingVideo(false);
        });

      return () => {
        cancelled = true;
      };
    }, [
      mediaPlayerOpen,
      track.id,
      track.title,
      track.artist,
      track.youtubeVideoId,
      track.artworkUrl,
      track.tvFrames,
      isStandby,
      onResolvedTrackMetadata,
    ]);

    // Windows 98 System Tray Clock Interval
    useEffect(() => {
      const updateClock = () => {
        setSystemTime((prev) => {
          const next = new Date();
          return formatWin98SystemClock(prev) === formatWin98SystemClock(next) ? prev : next;
        });
      };
      updateClock();
      const clockInterval = window.setInterval(updateClock, 15000);
      return () => {
        window.clearInterval(clockInterval);
      };
    }, []);

    // Real-time Web Audio FFT Spectrum & Oscilloscope rAF loop (keeps running even when CRT monitor is off!)
    useEffect(() => {
      if (
        !isPlaying ||
        isStandby ||
        isDocumentHidden ||
        prefersReducedMotion ||
        pcPowerPhase !== 'on' ||
        bootStage !== 'desktop'
      ) {
        setSpectrumBars(new Array(19).fill(0));
        setWaveformSamples(new Array(38).fill(0));
        return;
      }

      let rafId = 0;
      let lastSampleMs = 0;
      const intervalMs = lowPowerMode ? 90 : 42;

      const tick = (nowMs: number) => {
        if (nowMs - lastSampleMs >= intervalMs) {
          lastSampleMs = nowMs;
          setSpectrumBars(retroAudio.getSpectrumBands(19, eqGainsRef.current));
          setWaveformSamples(retroAudio.getWaveformSamples(38));
        }
        rafId = window.requestAnimationFrame(tick);
      };

      rafId = window.requestAnimationFrame(tick);
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
      };
    }, [
      isPlaying,
      isStandby,
      isDocumentHidden,
      prefersReducedMotion,
      lowPowerMode,
      pcPowerPhase,
      bootStage,
    ]);

    const trackIndex = useMemo(() => {
      const idx = playlistTracks.findIndex((t) => t.id === track.id);
      return idx >= 0 ? idx : 0;
    }, [playlistTracks, track.id]);

    const floppyDeskItems = useMemo(
      () =>
        computeScatteredFloppyDeskItems(
          playlistTracks,
          track.id,
          isMobileLandscape ? 4 : 6
        ),
      [playlistTracks, track.id, isMobileLandscape]
    );

    const handleClickFloppy = useCallback(
      (targetTrackId: string) => {
        setEjectingTrackId(null);
        setInsertingTrackId(targetTrackId);
        triggerFloppySeekBurst();
        onSelectTrack?.(targetTrackId);
        const resetTimer = window.setTimeout(() => {
          setInsertingTrackId((cur) => (cur === targetTrackId ? null : cur));
        }, 480);
        flickerTimersRef.current.push(resetTimer);
      },
      [onSelectTrack, triggerFloppySeekBurst]
    );

    // Physical 3.5" Floppy Drive Eject Interaction on Dell CPU Tower
    const handleEjectActiveFloppy = useCallback(() => {
      triggerFloppySeekBurst();
      if (isStandby) return;

      const targetId = track.id;
      if (isPlaying) {
        onTogglePlay();
      }
      setInsertingTrackId(null);
      setEjectingTrackId(targetId);

      const resetTimer = window.setTimeout(() => {
        setEjectingTrackId((cur) => (cur === targetId ? null : cur));
      }, 580);
      flickerTimersRef.current.push(resetTimer);
    }, [isPlaying, isStandby, onTogglePlay, track.id, triggerFloppySeekBurst]);

    const handleFocusPlaylistModule = useCallback(() => {
      const el = document.getElementById('winamp-playlist-module');
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      setPlaylistFlash(true);
      window.setTimeout(() => setPlaylistFlash(false), 800);
    }, []);

    const handleChangeBandDb = useCallback((idx: number, nextDb: number) => {
      setBandsDb((prev) => prev.map((v, i) => (i === idx ? nextDb : v)));
    }, []);

    const handleApplyPreset = useCallback((nextPreamp: number, nextBands: number[]) => {
      setPreampDb(nextPreamp);
      setBandsDb(nextBands);
      setEqEnabled(true);
    }, []);

    const effectiveBootStage: Win98BootStage =
      bsodPhase === 'recovery-boot' ? 'splash' : bootStage;

    const sharedMonitorProps = {
      track,
      trackIndex,
      isPlaying,
      isStandby,
      elapsedSec,
      volume,
      repeatOne,
      shuffleEnabled,
      spectrumBars,
      waveformSamples,
      systemTime,
      monitorPoweredOn,
      monitorPowerTransition,
      pcPowerPhase,
      bootStage: effectiveBootStage,
      bsodPhase,
      mediaPlayerOpen,
      wmpVideoId,
      isResolvingVideo,
      onSkipBoot: handleSkipBoot,
      onSkipBsod: startBsodRecoverySequence,
      onOpenMediaPlayer: () => setMediaPlayerOpen(true),
      onCloseMediaPlayer: () => setMediaPlayerOpen(false),
      onFocusPlaylistModule: handleFocusPlaylistModule,
      onToggleMonitorPower: handleToggleMonitorPower,
      onTriggerPcShutdown: triggerWin98Shutdown,
      onTvFullscreenChange,
      onTogglePlay,
      onStop,
      onPrevious,
      onNext,
      onSeek,
      onChangeVolume,
      onToggleRepeatOne,
      onToggleShuffle,
      onOpenSpotifyModal,
    };

    const sharedPlaylistProps = {
      tracks: playlistTracks,
      activeTrackId: track.id,
      isPlaying,
      elapsedSec,
      poweredOff: pcPowerPhase !== 'on',
      highlightFlash: playlistFlash,
      onSelectTrack: (id: string) => onSelectTrack?.(id),
      onTogglePlay,
      onStop,
      onPrevious,
      onNext,
      onOpenSpotifyModal,
    };

    /* =========================================================================
       MOBILE PORTRAIT (< 768px & portrait): Clean 3-Row Stack
       Row 1 (clamp(210px, 34dvh, 290px)): Guaranteed-visible 4:3 CRT + CPU Tower
       Row 2 (76px, collapsed to 0px if hideBoxArt): Horizontal oak floppy shelf
       Row 3 (minmax(0, 1fr)): Thumb-sized Transport/Spectrum + Full-Width Library
       ========================================================================= */
    if (isMobilePortrait) {
      const showMobileFloppies = !hideBoxArt && floppyDeskItems.length > 0;
      return (
        <div
          id="pc-winamp-stage"
          data-testid="pc-winamp-stage"
          data-layout="mobile-portrait"
          style={{
            display: 'grid',
            gridTemplateRows: showMobileFloppies
              ? 'auto 76px minmax(0, 1fr)'
              : 'auto minmax(0, 1fr)',
            rowGap: '6px',
            padding:
              'calc(env(safe-area-inset-top, 0px) + 6px) 10px calc(env(safe-area-inset-bottom, 0px) + 6px)',
          }}
          className="w-full h-full min-h-0 overflow-hidden"
        >
          {/* Row 1: CRT Monitor + CPU Tower Rig Flush on Contained Tilted Desk Ledge */}
          <div
            style={{ height: 'clamp(210px, 34dvh, 290px)' }}
            className="relative w-full min-h-0 flex flex-col justify-end overflow-hidden"
          >
            <div className="pcw-hardware-rig relative z-20 h-[92%] w-full items-end justify-center gap-[8px]">
              <div
                style={{ aspectRatio: '1.05 / 1', maxWidth: '68vw' }}
                className="h-full min-w-[150px] min-h-0 flex items-end justify-center shrink-0"
              >
                <Dell1998Monitor {...sharedMonitorProps} compact={true} />
              </div>
              <div className="h-full max-w-[26vw] min-w-0 min-h-0 flex items-end justify-start shrink-0">
                <Dell1998CpuTower
                  isPlaying={isPlaying}
                  floppyLedActive={floppyLedActive}
                  hddBootFlicker={hddBootFlicker}
                  pcPoweredOn={pcPowerPhase !== 'off'}
                  monitorPoweredOn={monitorPoweredOn}
                  compact={true}
                  onTogglePower={handleToggleCpuPower}
                  onEjectCd={() => retroAudio.triggerFloppySeekCue()}
                  onPressFloppyEject={handleEjectActiveFloppy}
                />
              </div>
            </div>
            {/* Contained Tilted Desk Ledge */}
            <div
              aria-hidden="true"
              className="pcw-desk-surface-wrapper relative z-10 w-full -mt-[10px] shrink-0 pointer-events-none overflow-hidden"
            >
              <div className="pcw-tilted-desk-plane h-[14px] w-full rounded-[3px]" />
            </div>
          </div>

          {/* Row 2 (76px): Horizontal Scrollable Oak Shelf of 60x58px 3.5" Floppies */}
          {showMobileFloppies && (
            <div
              style={{
                opacity: hideBoxArt ? 0 : 1,
                transform: `scale(${hideBoxArt ? 0.94 : 1})`,
                transition: prefersReducedMotion
                  ? 'none'
                  : 'opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              className="pcw-desk-surface-wrapper h-[76px] w-full rounded-[4px] overflow-hidden"
            >
              <div
                id="pcw-mobile-floppy-strip"
                data-no-drawer-swipe="true"
                className="pcw-tilted-desk-plane h-full w-full px-1.5 py-[6px] flex items-center gap-[10px] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {floppyDeskItems.map((item) => (
                  <FloppyDiskDeskItem
                    key={item.track.id}
                    item={item}
                    isInserting={insertingTrackId === item.track.id}
                    isEjecting={ejectingTrackId === item.track.id}
                    sizeVariant="mobile-shelf"
                    onSelect={handleClickFloppy}
                    doubleTapHideArtBind={doubleTapHideArtBind}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Row 3 (minmax(0, 1fr)): Thumb-Sized Winamp Transport/Spectrum + Full-Width Library */}
          <div className="min-h-0 min-w-0 w-full flex flex-col gap-[6px] overflow-hidden">
            <WinampCompactTransportBar
              isPlaying={isPlaying}
              isStandby={isStandby}
              elapsedSec={elapsedSec}
              eqEnabled={eqEnabled}
              spectrumBars={spectrumBars}
              onTogglePlay={onTogglePlay}
              onStop={onStop}
              onPrevious={onPrevious}
              onNext={onNext}
              onToggleEqEnabled={() => setEqEnabled((e) => !e)}
            />
            <WinampPlaylistModule {...sharedPlaylistProps} compact={true} />
          </div>
        </div>
      );
    }

    /* =========================================================================
       UNIFIED HORIZONTAL 3-MODULE WORKSTATION (Desktop/Laptop + Mobile Landscape)
       Left: Beige Dell CPU Tower (Footless, flush on desk)
       Center: 1998 Dell 4:3 CRT Monitor (Footless, flush on desk)
       Right: Multi-Window Winamp 2.x Suite (THINGER | Main + EQ | ALBUM ART | LIBRARY)
       Bottom: Grounded Full-Width Oak/Ash Computer Desk w/ Chamfered Front Lip & Floppies
       ========================================================================= */
    const deskHeightCss = isMobileLandscape
      ? 'clamp(56px, 14dvh, 96px)'
      : 'clamp(110px, 18dvh, 175px)';
    const winampColumnWidthCss = isMobileLandscape
      ? 'clamp(275px, 37vw, 400px)'
      : 'clamp(360px, 31vw, 450px)';

    return (
      <div
        id="pc-winamp-stage"
        data-testid="pc-winamp-stage"
        data-layout={isMobileLandscape ? 'mobile-landscape' : 'desktop'}
        className="w-full h-full min-h-0 flex flex-col justify-end overflow-hidden"
      >
        {/* Top Row: Single-Row 3-Module Horizontal Stage (Far Left CPU | Center CRT | Right Full Winamp Suite) */}
        <div
          style={{
            padding: isMobileLandscape ? '6px 34px 0 6px' : '12px 34px 0 18px',
            gap: isMobileLandscape ? '8px' : 'clamp(12px, 1.8vw, 22px)',
          }}
          className="pcw-widescreen-top-stage relative z-20 flex-1 min-h-0 w-full mx-auto max-w-[1480px] flex items-end justify-between overflow-hidden"
        >
          {/* Left + Center Hardware Bay: Footless CPU Tower + 4:3 CRT Monitor Flush on Oak Desk */}
          <div
            style={
              isMobileLandscape
                ? undefined
                : { maxHeight: 'min(68dvh, 560px)' }
            }
            className="pcw-rig-bay pb-0"
          >
            <div className="pcw-rig-height-match">
              <Dell1998CpuTower
                isPlaying={isPlaying}
                floppyLedActive={floppyLedActive}
                hddBootFlicker={hddBootFlicker}
                pcPoweredOn={pcPowerPhase !== 'off'}
                monitorPoweredOn={monitorPoweredOn}
                compact={isMobileLandscape}
                onTogglePower={handleToggleCpuPower}
                onEjectCd={() => retroAudio.triggerFloppySeekCue()}
                onPressFloppyEject={handleEjectActiveFloppy}
              />
              <Dell1998Monitor {...sharedMonitorProps} compact={isMobileLandscape} />
            </div>
          </div>

          {/* Right Column: Classic Winamp 2.x Multi-Window Suite */}
          <div
            style={{
              width: winampColumnWidthCss,
              maxHeight: isMobileLandscape ? '100%' : 'min(74dvh, 620px)',
              gap: isMobileLandscape ? '3px' : '5px',
              paddingBottom: isMobileLandscape ? '4px' : '8px',
            }}
            className="h-full min-h-0 shrink-0 flex flex-col overflow-hidden"
          >
            {/* Top Utility Bar: THINGER */}
            <WinampThingerModule
              isPlaying={isPlaying}
              compact={isMobileLandscape}
              poweredOff={pcPowerPhase !== 'on'}
              eqVisible={eqPanelVisible}
              playlistVisible={playlistPanelVisible}
              onTogglePlay={onTogglePlay}
              onStop={onStop}
              onPrevious={onPrevious}
              onNext={onNext}
              onToggleEqVisible={() => setEqPanelVisible((v) => !v)}
              onTogglePlaylistVisible={() => setPlaylistPanelVisible((v) => !v)}
              onOpenSpotifyModal={onOpenSpotifyModal}
              onOpenMediaPlayer={() => setMediaPlayerOpen(true)}
            />

            {/* Upper 2-Column Cluster: Left (Main Deck + Equalizer) | Right (ALBUM ART) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: hideBoxArt ? 'minmax(0, 1fr)' : 'minmax(0, 1.55fr) minmax(0, 1fr)',
                gap: isMobileLandscape ? '3px' : '5px',
              }}
              className="w-full shrink-0 items-stretch"
            >
              <div className="min-w-0 flex flex-col gap-[4px]">
                <WinampMainDeckModule
                  track={track}
                  trackIndex={trackIndex}
                  isPlaying={isPlaying}
                  isStandby={isStandby}
                  elapsedSec={elapsedSec}
                  volume={volume}
                  repeatOne={repeatOne}
                  shuffleEnabled={shuffleEnabled}
                  spectrumBars={spectrumBars}
                  waveformSamples={waveformSamples}
                  compact={isMobileLandscape}
                  poweredOff={pcPowerPhase !== 'on'}
                  eqVisible={eqPanelVisible}
                  playlistVisible={playlistPanelVisible}
                  onToggleEqVisible={() => setEqPanelVisible((v) => !v)}
                  onTogglePlaylistVisible={() => setPlaylistPanelVisible((v) => !v)}
                  onTogglePlay={onTogglePlay}
                  onStop={onStop}
                  onPrevious={onPrevious}
                  onNext={onNext}
                  onSeek={onSeek}
                  onChangeVolume={onChangeVolume}
                  onToggleRepeatOne={onToggleRepeatOne}
                  onToggleShuffle={onToggleShuffle}
                  onOpenSpotifyModal={onOpenSpotifyModal}
                />

                {eqPanelVisible && (
                  <WinampEqualizerModule
                    eqEnabled={eqEnabled}
                    eqAuto={eqAuto}
                    preampDb={preampDb}
                    bandsDb={bandsDb}
                    spectrumBars={spectrumBars}
                    compact={isMobileLandscape}
                    poweredOff={pcPowerPhase !== 'on'}
                    className="shrink-0"
                    onToggleEqEnabled={() => setEqEnabled((e) => !e)}
                    onToggleEqAuto={() => setEqAuto((a) => !a)}
                    onChangePreampDb={setPreampDb}
                    onChangeBandDb={handleChangeBandDb}
                    onApplyPreset={handleApplyPreset}
                  />
                )}
              </div>

              {!hideBoxArt && (
                <div className="min-w-0 h-full">
                  <WinampAlbumArtModule
                    artworkUrl={track.artworkUrl}
                    trackTitle={track.title}
                    hideBoxArt={hideBoxArt}
                    prefersReducedMotion={prefersReducedMotion}
                    compact={isMobileLandscape}
                    poweredOff={pcPowerPhase !== 'on'}
                    doubleTapHideArtBind={doubleTapHideArtBind}
                  />
                </div>
              )}
            </div>

            {/* Bottom Full-Width Dock: WINAMP LIBRARY */}
            {playlistPanelVisible && (
              <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                <WinampPlaylistModule {...sharedPlaylistProps} compact={isMobileLandscape} />
              </div>
            )}
          </div>
        </div>

        {/* Bottom Grounded Full-Width Oak/Ash Computer Desk + Chamfered Front Lip + Scattered Floppies */}
        <div
          id="pcw-bottom-computer-desk"
          data-testid="pcw-bottom-computer-desk"
          style={{ height: deskHeightCss }}
          className="pcw-bottom-computer-desk relative z-10 mt-0"
        >
          <div className="pcw-desk-top-plank flex items-center justify-center px-6 pr-[44px] overflow-hidden">
            {!hideBoxArt && floppyDeskItems.length > 0 && (
              <div
                id="pcw-desktop-floppy-scatter"
                data-no-drawer-swipe="true"
                className="w-full max-w-[1280px] h-full flex items-center justify-around gap-3 overflow-hidden"
              >
                {floppyDeskItems.map((item) => (
                  <FloppyDiskDeskItem
                    key={item.track.id}
                    item={item}
                    isInserting={insertingTrackId === item.track.id}
                    isEjecting={ejectingTrackId === item.track.id}
                    compact={isMobileLandscape || windowDims.w < 1220}
                    sizeVariant={isMobileLandscape ? 'mobile-shelf' : 'desktop'}
                    onSelect={handleClickFloppy}
                    doubleTapHideArtBind={doubleTapHideArtBind}
                  />
                ))}
              </div>
            )}
          </div>
          <div aria-hidden="true" className="pcw-desk-front-lip" />
        </div>
      </div>
    );
  }
);
