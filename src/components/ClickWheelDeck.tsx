import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Disc3,
  Shuffle,
  Repeat1,
  ChevronRight,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import {
  triggerButtonHaptic,
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  calculateHolderBoxDragTiltDeg,
  formatConsoleClockAndDate,
  shouldRunActiveAnimationLoops,
} from '../utils/playerLogic';
import {
  CLICK_WHEEL_PANE_ORDER,
  CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS,
  CLICK_WHEEL_TICK_DEGREES,
  CLASSIC_COLOR_SPLIT_MENU,
  GEN1_SCROLL_ROOT_MENU,
  GEN2_CLICK_ROOT_MENU,
  IPOD_MUSIC_HUB_MENU,
  CLICK_WHEEL_GENERATIONS,
  CLICK_WHEEL_GENERATION_ORDER,
  IPOD_NANO_7_COLORS,
  APPLE_AQUA_ACTIVE_BLUE_HEX,
  IPOD_REAL_LIFE_ASPECT_RATIO,
  IPOD_NANO_ASPECT_RATIO,
  normalizeClickWheelAngleDeltaDeg,
  accumulateClickWheelTickSteps,
  computeClickWheelListIndexStep,
  computeClickWheelSeekTargetSec,
  formatRemainingTrackTime,
  getNextClickWheelMenuBackPane,
  detectDoubleCenterPress,
  getClickWheelTrackChangePose,
  loadSavedClickWheelGeneration,
  saveClickWheelGeneration,
  cycleClickWheelGeneration,
  getClickWheelGenerationSpec,
  loadSavedGen3Finish,
  saveGen3Finish,
  loadSavedNanoColor,
  saveNanoColor,
  getNanoColorSpec,
  computeMechanicalWheelDetentSnapDeg,
  stepMechanicalWheelInertia,
  ditherRgbPixelsTo1BitRgba,
  getClickWheelUnitSwapPose,
  buildAmbientFloatingCardSlots,
  computeCardParallaxPose,
  cycleNowPlayingCenterMode,
  computeAsymmetricDesktopWorkspaceLayout,
  computeMobileZeroScrollStackedLayout,
  toggleIpodScaleMode,
  computeIpodScaledDimensions,
  computeFloatingVerticalCardBouncePose,
  computeOrbitingVerticalCard3DPose,
  VERTICAL_PLAYLIST_CARD_SPEC,
  type ClickWheelPaneId,
  type ClickWheelTrackChangePhase,
  type ClickWheelGenerationId,
  type ClickWheelGen3Finish,
  type NanoColorwayId,
  type ClickWheelUnitSwapPhase,
  type ClickWheelMusicMenuLevel,
  type ClickWheelNowPlayingMode,
  type IpodScaleMode,
} from '../utils/clickWheelLogic';
import { Smartphone } from 'lucide-react';
import { retroAudio } from '../utils/retroAudioEngine';
import { playbackClockStore, usePlaybackSecond } from '../utils/playbackStore';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import {
  ClickWheelImacBackdrop,
  type ImacOpenAppId,
} from './clickwheel/ClickWheelImacBackdrop';
import { ClickWheelHifiDock } from './clickwheel/ClickWheelHifiDock';
import { ClickWheelEarbuds } from './clickwheel/ClickWheelEarbuds';
import { useDoubleTapHideArt } from '../hooks/useDoubleTapHideArt';
import type { TurntableDeckProps } from './TurntableDeck';

export interface ClickWheelDeckProps extends TurntableDeckProps {
  renderImacLibraryWindow?: () => React.ReactNode;
  renderImacVideoWindow?: () => React.ReactNode;
}

const CW_PANE_LABELS: Record<ClickWheelPaneId, string> = {
  music: 'iPod',
  'now-playing': 'Now Playing',
  lyrics: 'Lyrics',
  settings: 'Settings',
};

const CW_MUSIC_LEVEL_LABELS: Record<ClickWheelMusicMenuLevel, string> = {
  root: 'iPod',
  'music-hub': 'Music',
  playlists: 'Playlists',
  artists: 'Artists',
  songs: 'Songs',
};

/**
 * Loads an artwork URL onto a small offscreen canvas and applies true 1-bit Bayer ordered dithering
 * for the Gen 1 (2001 Acrylic) grey-green monochrome LCD thumbnail. Falls back gracefully if CORS blocks canvas readback.
 */
function useOneBitDitheredArtwork(artworkUrl: string, enabled: boolean): string | null {
  const [ditheredDataUrl, setDitheredDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !artworkUrl) {
      setDitheredDataUrl(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 52;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const dithered = ditherRgbPixelsTo1BitRgba(
          imageData.data,
          size,
          size,
          [22, 31, 19, 255],
          [199, 212, 182, 255]
        );
        const outImg = ctx.createImageData(size, size);
        outImg.data.set(dithered);
        ctx.putImageData(outImg, 0, 0);
        const uri = canvas.toDataURL('image/png');
        canvas.width = 0;
        canvas.height = 0;
        if (!cancelled) {
          setDitheredDataUrl(uri);
        }
      } catch {
        if (!cancelled) {
          setDitheredDataUrl(null);
        }
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setDitheredDataUrl(null);
      }
    };
    img.src = artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [artworkUrl, enabled]);

  return ditheredDataUrl;
}

/**
 * Crisp Live Clock, Date & Battery Status Strip inside Click Wheel Screen
 */
const ClickWheelClockStatus = React.memo<{
  isDocumentHidden: boolean;
  isGen1Pixel: boolean;
  compactDate?: boolean;
  inkColor: string;
  subInkColor: string;
}>(({ isDocumentHidden, isGen1Pixel, compactDate = false, inkColor, subInkColor }) => {
  const [clockText, setClockText] = useState<{ timeText: string; dateText: string }>(() =>
    formatConsoleClockAndDate(new Date())
  );

  useEffect(() => {
    const syncNow = () => {
      setClockText(formatConsoleClockAndDate(new Date()));
    };
    syncNow();
    if (isDocumentHidden) return;
    return playbackClockStore.subscribeSecond(syncNow);
  }, [isDocumentHidden]);

  return (
    <div
      id="console-time-display"
      aria-label="Current Time and Date"
      className="flex items-center gap-1.5 min-w-0 shrink-0"
    >
      <div className="flex flex-col items-end leading-none">
        <span
          id="console-clock-time"
          style={{ fontSize: 'clamp(8px, 2.2cqh, 11.5px)', lineHeight: 1, color: inkColor }}
          className={`${
            isGen1Pixel ? "font-['Silkscreen',monospace]" : 'font-sans'
          } font-semibold tracking-tight tabular-nums`}
        >
          {clockText.timeText}
        </span>
        {!compactDate && (
          <span
            id="console-clock-date"
            style={{ fontSize: 'clamp(6.2px, 1.35cqh, 8.2px)', lineHeight: 1.1, color: subInkColor }}
            className={`${
              isGen1Pixel ? "font-['Silkscreen',monospace]" : 'font-sans'
            } font-medium truncate max-w-[100px]`}
          >
            {clockText.dateText}
          </span>
        )}
      </div>
    </div>
  );
});

ClickWheelClockStatus.displayName = 'ClickWheelClockStatus';

export const ClickWheelDeck: React.FC<ClickWheelDeckProps> = ({
  track,
  isPlaying,
  isDocumentHidden,
  lowPowerMode,
  nightMode,
  prefersReducedMotion,
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
  onToggleLowPowerMode,
  onToggleNightMode,
  onOpenSpotifyModal,
  onScratch,
  onResolvedPerTrackArtwork,
  playlistTracks,
  playlistName,
  onSelectTrack,
  renderImacLibraryWindow,
  renderImacVideoWindow,
  isDeviceOnlyMode = false,
  onToggleDeviceOnlyMode,
}) => {
  const { doubleTapHideArtBind } = useDoubleTapHideArt(onToggleHideBoxArt);
  const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
  const activeLoopsEnabled = shouldRunActiveAnimationLoops(
    isPlaying,
    isDocumentHidden,
    prefersReducedMotion,
    lowPowerMode
  );
  const currentTimeSec = usePlaybackSecond();
  const safeDuration = Math.max(0, track.durationSec || 0);
  const progressPct =
    safeDuration > 0 ? Math.max(0, Math.min(100, (currentTimeSec / safeDuration) * 100)) : 0;

  const tracks = useMemo(
    () => (playlistTracks && playlistTracks.length > 0 ? playlistTracks : isStandby ? [] : [track]),
    [playlistTracks, isStandby, track]
  );

  // Generation, Classic finish & Nano 7-color colorway persisted in localStorage
  const [generation, setGeneration] = useState<ClickWheelGenerationId>(() =>
    loadSavedClickWheelGeneration()
  );
  const [gen3Finish, setGen3Finish] = useState<ClickWheelGen3Finish>(() =>
    loadSavedGen3Finish()
  );
  const [nanoColor, setNanoColor] = useState<NanoColorwayId>(() => loadSavedNanoColor());
  const [openImacApp, setOpenImacApp] = useState<ImacOpenAppId>('none');
  const [ipodScaleMode, setIpodScaleMode] = useState<IpodScaleMode>('actual');
  const [imacYoutubeCandidates, setImacYoutubeCandidates] = useState<string[]>([]);
  const imacVideoCacheRef = useRef<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (openImacApp !== 'video' || isStandby || !track.title) {
      return;
    }
    const cached = imacVideoCacheRef.current.get(track.id);
    if (cached) {
      setImacYoutubeCandidates(cached);
      return;
    }

    let cancelled = false;
    const targetTrackId = track.id;
    const debounceId = window.setTimeout(() => {
      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist || '',
        trackId: targetTrackId,
        videoId: track.youtubeVideoId || '',
      });
      fetch(`/api/youtube/search-grabs?${params.toString()}`)
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              videoId?: string;
              channels?: Array<{ videoId?: string }>;
            } | null
          ) => {
            if (cancelled) return;
            const collected: string[] = [];
            if (data?.videoId) collected.push(data.videoId);
            if (Array.isArray(data?.channels)) {
              for (const ch of data.channels) {
                if (ch?.videoId) collected.push(ch.videoId);
              }
            }
            imacVideoCacheRef.current.set(targetTrackId, collected);
            setImacYoutubeCandidates(collected);
          }
        )
        .catch(() => {
          // Safe fallback handled inside ClickWheelImacBackdrop candidate queue
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
    };
  }, [openImacApp, isStandby, track.id, track.title, track.artist, track.youtubeVideoId]);

  const generationSpec = useMemo(() => getClickWheelGenerationSpec(generation), [generation]);
  const nanoColorSpec = useMemo(() => getNanoColorSpec(nanoColor), [nanoColor]);

  const handleToggleScaleMode = useCallback(() => {
    triggerButtonHaptic(lowPowerMode);
    retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);
    setIpodScaleMode((prev) => toggleIpodScaleMode(prev));
  }, [lowPowerMode, generationSpec.soundProfile]);

  const isGen1 = generation === 'gen1';
  const isGen2 = generation === 'gen2';
  const isGen3 = generation === 'gen3';
  const isNano = generation === 'nano';
  const isColorSplit = isGen3 || isNano;
  const isDarkAnodized = isNano
    ? nanoColorSpec.isDarkChassis
    : generationSpec.supportsFinishToggle && gen3Finish === 'black';
  const isOfficialWhite =
    !isNano && generationSpec.supportsFinishToggle && gen3Finish === 'official-white';
  const isMonoLcd = isGen1 || isGen2;
  const isMobilePortrait = viewportLayout === 'mobile-portrait';

  // Screen palette per generation
  const screenPalette = useMemo(() => {
    if (isGen1) {
      return {
        ink: '#161F13',
        subInk: '#3F4D37',
        faintInk: '#5B6C50',
        borderHex: '#7D8B74',
        cardBgHex: '#B6C5A4',
        highlightBgHex: '#161F13',
        highlightInkHex: '#C7D4B6',
      };
    }
    if (isGen2) {
      return {
        ink: '#122033',
        subInk: '#3B5270',
        faintInk: '#627B9B',
        borderHex: '#9EB1C9',
        cardBgHex: '#D0DFF3',
        highlightBgHex: '#1F3F7A',
        highlightInkHex: '#F3F8FF',
      };
    }
    return {
      ink: '#1D1D1F',
      subInk: '#6E6E73',
      faintInk: '#8A8F98',
      borderHex: '#D8DADE',
      cardBgHex: '#FFFFFF',
      highlightBgHex: '#007AFF',
      highlightInkHex: '#FFFFFF',
    };
  }, [isGen1, isGen2]);

  const screenTypeClass = isGen1
    ? "font-['Silkscreen',monospace] tracking-tight"
    : 'font-sans';

  // Unit-swap animation state (replays on mount & generation switch)
  const [dockDropping, setDockDropping] = useState<boolean>(false);
  const [dockAnimKey, setDockAnimKey] = useState<number>(0);
  const [unitSwapPhase, setUnitSwapPhase] = useState<ClickWheelUnitSwapPhase>('docked');
  const dockAnimTimerRef = useRef<number | null>(null);
  const swapStageTimerRef = useRef<number | null>(null);
  const initialMountDockRef = useRef<boolean>(false);

  const triggerDockAnimation = useCallback(
    (playAudioCue: boolean, withEjectCycle = false) => {
      if (dockAnimTimerRef.current !== null) {
        window.clearTimeout(dockAnimTimerRef.current);
        dockAnimTimerRef.current = null;
      }
      if (swapStageTimerRef.current !== null) {
        window.clearTimeout(swapStageTimerRef.current);
        swapStageTimerRef.current = null;
      }
      if (playAudioCue) {
        retroAudio.triggerClickWheelDockCue();
      }
      if (prefersReducedMotion || lowPowerMode || isDocumentHidden) {
        setDockDropping(false);
        setUnitSwapPhase('docked');
        return;
      }
      if (withEjectCycle) {
        setUnitSwapPhase('ejecting-up');
        swapStageTimerRef.current = window.setTimeout(() => {
          setUnitSwapPhase('docking-down');
          setDockAnimKey((k) => k + 1);
          setDockDropping(true);
          dockAnimTimerRef.current = window.setTimeout(() => {
            setDockDropping(false);
            setUnitSwapPhase('docked');
            dockAnimTimerRef.current = null;
          }, 340);
        }, 150);
      } else {
        setUnitSwapPhase('docking-down');
        setDockAnimKey((k) => k + 1);
        setDockDropping(true);
        dockAnimTimerRef.current = window.setTimeout(() => {
          setDockDropping(false);
          setUnitSwapPhase('docked');
          dockAnimTimerRef.current = null;
        }, 420);
      }
    },
    [prefersReducedMotion, lowPowerMode, isDocumentHidden]
  );

  useEffect(() => {
    if (!initialMountDockRef.current) {
      initialMountDockRef.current = true;
      triggerDockAnimation(true, false);
    }
    return () => {
      if (dockAnimTimerRef.current !== null) {
        window.clearTimeout(dockAnimTimerRef.current);
      }
      if (swapStageTimerRef.current !== null) {
        window.clearTimeout(swapStageTimerRef.current);
      }
    };
  }, [triggerDockAnimation]);

  const handleSelectGeneration = useCallback(
    (nextGen: ClickWheelGenerationId) => {
      if (nextGen === generation) return;
      triggerButtonHaptic(lowPowerMode);
      saveClickWheelGeneration(nextGen);
      const nextSpec = getClickWheelGenerationSpec(nextGen);
      retroAudio.triggerClickWheelTick(true, nextSpec.soundProfile);
      setGeneration(nextGen);
      triggerDockAnimation(true, true);
    },
    [generation, lowPowerMode, triggerDockAnimation]
  );

  const handleCycleGeneration = useCallback(() => {
    triggerButtonHaptic(lowPowerMode);
    setGeneration((prev) => {
      const next = cycleClickWheelGeneration(prev);
      saveClickWheelGeneration(next);
      const nextSpec = getClickWheelGenerationSpec(next);
      retroAudio.triggerClickWheelTick(true, nextSpec.soundProfile);
      return next;
    });
    triggerDockAnimation(true, true);
  }, [lowPowerMode, triggerDockAnimation]);

  // Mobile Vertical horizontal swipe across iPod stage cycles generation cleanly (220ms directional slide)
  const mobileSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [genSwipeShiftPx, setGenSwipeShiftPx] = useState<number>(0);
  const genSwipeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (genSwipeTimerRef.current !== null) {
        window.clearTimeout(genSwipeTimerRef.current);
      }
    };
  }, []);

  const stepGenerationBySwipe = useCallback(
    (direction: 'next' | 'prev') => {
      const curIdx = CLICK_WHEEL_GENERATION_ORDER.indexOf(generation);
      const nextIdx =
        direction === 'next'
          ? (curIdx + 1) % CLICK_WHEEL_GENERATION_ORDER.length
          : (curIdx - 1 + CLICK_WHEEL_GENERATION_ORDER.length) %
            CLICK_WHEEL_GENERATION_ORDER.length;
      const nextGen = CLICK_WHEEL_GENERATION_ORDER[nextIdx];
      if (!nextGen || nextGen === generation) return;

      if (!prefersReducedMotion && !lowPowerMode) {
        setGenSwipeShiftPx(direction === 'next' ? 28 : -28);
        if (genSwipeTimerRef.current !== null) {
          window.clearTimeout(genSwipeTimerRef.current);
        }
        window.requestAnimationFrame(() => {
          setGenSwipeShiftPx(0);
        });
        genSwipeTimerRef.current = window.setTimeout(() => {
          setGenSwipeShiftPx(0);
          genSwipeTimerRef.current = null;
        }, 230);
      }
      handleSelectGeneration(nextGen);
    },
    [generation, prefersReducedMotion, lowPowerMode, handleSelectGeneration]
  );

  const handleMobileStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as Element | null;
    if (target && (target.closest('#cw-wheel-ring') || target.closest('button'))) {
      mobileSwipeStartRef.current = null;
      return;
    }
    mobileSwipeStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMobileStagePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = mobileSwipeStartRef.current;
      mobileSwipeStartRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.stopPropagation();
        stepGenerationBySwipe(dx < 0 ? 'next' : 'prev');
      }
    },
    [stepGenerationBySwipe]
  );

  const handleMobileStagePointerCancel = useCallback(() => {
    mobileSwipeStartRef.current = null;
  }, []);

  const handleSelectFinish = useCallback(
    (nextFinish: ClickWheelGen3Finish) => {
      triggerButtonHaptic(lowPowerMode);
      retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
      if (isNano || !generationSpec.supportsFinishToggle) {
        saveClickWheelGeneration('gen3');
        setGeneration('gen3');
      }
      if (nextFinish !== gen3Finish || isNano || !generationSpec.supportsFinishToggle) {
        saveGen3Finish(nextFinish);
        setGen3Finish(nextFinish);
        triggerDockAnimation(false, true);
      }
    },
    [
      lowPowerMode,
      generationSpec.soundProfile,
      generationSpec.supportsFinishToggle,
      isNano,
      gen3Finish,
      triggerDockAnimation,
    ]
  );

  const handleSelectNanoColor = useCallback(
    (nextColor: NanoColorwayId) => {
      triggerButtonHaptic(lowPowerMode);
      retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
      if (!isNano) {
        saveClickWheelGeneration('nano');
        setGeneration('nano');
      }
      if (nextColor !== nanoColor || !isNano) {
        saveNanoColor(nextColor);
        setNanoColor(nextColor);
        triggerDockAnimation(false, false);
      }
    },
    [lowPowerMode, generationSpec.soundProfile, isNano, nanoColor, triggerDockAnimation]
  );

  const unitSwapPose = useMemo(() => getClickWheelUnitSwapPose(unitSwapPhase), [unitSwapPhase]);

  // Hierarchical iPod OS Menu State Machine + 240ms Horizontal Push/Pop Transition Direction
  const [activePane, setActivePane] = useState<ClickWheelPaneId>('music');
  const [musicMenuLevel, setMusicMenuLevelState] = useState<ClickWheelMusicMenuLevel>('root');
  const [menuPushPopClass, setMenuPushPopClass] = useState<string>('');
  const setMusicMenuLevel = useCallback(
    (
      nextOrUpdater:
        | ClickWheelMusicMenuLevel
        | ((prev: ClickWheelMusicMenuLevel) => ClickWheelMusicMenuLevel)
    ) => {
      setMusicMenuLevelState((prev) => {
        const next =
          typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
        if (next !== prev && !prefersReducedMotion && !lowPowerMode) {
          const depthOrder: Record<ClickWheelMusicMenuLevel, number> = {
            root: 0,
            'music-hub': 1,
            playlists: 2,
            artists: 2,
            songs: 3,
          };
          setMenuPushPopClass(
            depthOrder[next] >= depthOrder[prev] ? 'cw-os-menu-push' : 'cw-os-menu-pop'
          );
        }
        return next;
      });
    },
    [prefersReducedMotion, lowPowerMode]
  );
  const [rootMenuFocusedIdx, setRootMenuFocusedIdx] = useState<number>(0);
  const [musicHubFocusedIdx, setMusicHubFocusedIdx] = useState<number>(0);
  const [artistFocusedIdx, setArtistFocusedIdx] = useState<number>(0);
  const [paneHistory, setPaneHistory] = useState<ClickWheelPaneId[]>([]);
  const [focusedTrackIndex, setFocusedTrackIndex] = useState<number>(() => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    return idx >= 0 ? idx : 0;
  });

  // Now Playing Center-Button Mode ('default' | 'scrub' | 'volume' | 'rating') & Star Rating (1..5)
  const [nowPlayingMode, setNowPlayingMode] = useState<ClickWheelNowPlayingMode>('default');
  const [starRating, setStarRating] = useState<number>(5);

  const uniqueArtists = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of tracks) {
      const a = (t.artist || 'Unknown Artist').trim();
      if (!seen.has(a)) {
        seen.add(a);
        list.push(a);
      }
    }
    return list.length > 0 ? list : ['All Artists'];
  }, [tracks]);

  useEffect(() => {
    const idx = tracks.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      setFocusedTrackIndex(idx);
    }
  }, [track.id, tracks]);

  const activeRootMenu = useMemo(
    () =>
      isGen1
        ? GEN1_SCROLL_ROOT_MENU
        : isGen2
          ? GEN2_CLICK_ROOT_MENU
          : CLASSIC_COLOR_SPLIT_MENU,
    [isGen1, isGen2]
  );

  useEffect(() => {
    setRootMenuFocusedIdx((prev) => Math.max(0, Math.min(activeRootMenu.length - 1, prev)));
  }, [activeRootMenu.length]);

  // Subtle micro-drive loading cue on mount
  const mountCuePlayedRef = useRef(false);
  useEffect(() => {
    if (!mountCuePlayedRef.current && !isStandby) {
      mountCuePlayedRef.current = true;
      retroAudio.triggerClickWheelLoadingCue();
    }
  }, [isStandby]);

  // Artwork resolution & caching
  const [artworkAttempt, setArtworkAttempt] = useState<number>(0);
  const [artworkBroken, setArtworkBroken] = useState<boolean>(false);

  const artworkState = useMemo(
    () => resolveActiveArtworkState(track, artworkAttempt),
    [track, artworkAttempt]
  );
  const resolvedArtworkUrl = artworkState.activeUrl || '';
  const hasMoreFallbackCandidates = artworkAttempt + 1 < artworkState.candidates.length;
  const gen1DitheredDataUrl = useOneBitDitheredArtwork(resolvedArtworkUrl, isGen1);

  useEffect(() => {
    setArtworkAttempt(0);
    setArtworkBroken(false);
  }, [track.id, track.artworkUrl]);

  useEffect(() => {
    if (!isStandby && !resolvedArtworkUrl && onResolvedPerTrackArtwork) {
      let cancelled = false;
      const q = encodeURIComponent(`${track.title} ${track.artist}`.trim());
      fetch(`/api/spotify/track-artwork?q=${q}`)
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
  }, [isStandby, resolvedArtworkUrl, track.id, track.title, track.artist, onResolvedPerTrackArtwork]);

  // Sub-1-second horizontal album-art slide choreography + earbud pulse on track change
  const prevTrackIdRef = useRef<string>(track.id);
  const prevArtSnapRef = useRef<{ url: string; title: string }>({
    url: resolvedArtworkUrl,
    title: track.title,
  });
  const [outgoingArtSnap, setOutgoingArtSnap] = useState<{ url: string; title: string } | null>(
    null
  );
  const [trackSlidePhase, setTrackSlidePhase] = useState<ClickWheelTrackChangePhase>('idle');
  const [trackPulseKey, setTrackPulseKey] = useState<number>(0);

  useEffect(() => {
    const prevId = prevTrackIdRef.current;
    const prevSnap = prevArtSnapRef.current;
    if (prevId !== track.id) {
      prevTrackIdRef.current = track.id;
      setTrackPulseKey((k) => k + 1);
      if (prefersReducedMotion || lowPowerMode || isDocumentHidden) {
        setOutgoingArtSnap(null);
        setTrackSlidePhase('idle');
      } else {
        setOutgoingArtSnap(prevSnap);
        setTrackSlidePhase('idle');
        const raf1 = window.requestAnimationFrame(() => {
          setTrackSlidePhase('sliding');
        });
        const timerId = window.setTimeout(() => {
          setOutgoingArtSnap(null);
          setTrackSlidePhase('idle');
        }, CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS.slideDurationMs);
        retroAudio.triggerClickWheelTrackChangeCue();
        return () => {
          window.cancelAnimationFrame(raf1);
          window.clearTimeout(timerId);
        };
      }
    }
  }, [track.id, prefersReducedMotion, lowPowerMode, isDocumentHidden]);

  useEffect(() => {
    prevArtSnapRef.current = { url: resolvedArtworkUrl, title: track.title };
  }, [resolvedArtworkUrl, track.title]);

  // Stage container measurement
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState<{ width: number; height: number }>({
    width: 1440,
    height: 900,
  });

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setStageDims({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(480, Math.round(rect.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const desktopLayout = useMemo(
    () => computeAsymmetricDesktopWorkspaceLayout(stageDims.width, stageDims.height, generation),
    [stageDims.width, stageDims.height, generation]
  );

  const mobileLayout = useMemo(
    () =>
      computeMobileZeroScrollStackedLayout(stageDims.width, stageDims.height, hideBoxArt, generation),
    [stageDims.width, stageDims.height, hideBoxArt, generation]
  );

  const scaledIpodDims = useMemo(
    () =>
      computeIpodScaledDimensions(
        ipodScaleMode,
        stageDims.width,
        stageDims.height,
        isMobilePortrait,
        generation,
        hideBoxArt
      ),
    [ipodScaleMode, stageDims.width, stageDims.height, isMobilePortrait, generation, hideBoxArt]
  );

  const deviceOnlyDims = useMemo(() => {
    const ratio = isNano ? IPOD_NANO_ASPECT_RATIO : IPOD_REAL_LIFE_ASPECT_RATIO;
    const maxH = Math.min(Math.round(stageDims.height * 0.86), 720);
    const maxW = Math.max(240, stageDims.width - 32);
    const heightPx = Math.max(260, Math.min(maxH, Math.floor(maxW / ratio)));
    const widthPx = Math.round(heightPx * ratio);
    const screenWidthPx = Math.floor((widthPx * (isNano ? 0.90 : 0.875)) / 2) * 2;
    return { widthPx, heightPx, screenWidthPx };
  }, [isNano, stageDims.height, stageDims.width]);

  const activeChassisW = isDeviceOnlyMode ? deviceOnlyDims.widthPx : scaledIpodDims.widthPx;
  const activeChassisH = isDeviceOnlyMode ? deviceOnlyDims.heightPx : scaledIpodDims.heightPx;
  const activeScreenW = isDeviceOnlyMode ? deviceOnlyDims.screenWidthPx : scaledIpodDims.screenWidthPx;

  const ambientCardSlots = useMemo(
    () => buildAmbientFloatingCardSlots(tracks, track.id),
    [tracks, track.id]
  );

  // Bass-reactive woofer cone excursion
  const grilleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const grilleEl = grilleRef.current;
    if (!grilleEl) return;
    if (!activeLoopsEnabled) {
      grilleEl.style.setProperty('--cw-bass-excursion', '1');
      return;
    }

    let rafId = 0;
    const stepWooferExcursion = () => {
      const vu = retroAudio.getVuLevels();
      const energy = Math.max(0, Math.min(1, Math.max(vu.left, vu.right)));
      const excursion = 1 + energy * 0.068;
      grilleEl.style.setProperty('--cw-bass-excursion', excursion.toFixed(4));
      rafId = window.requestAnimationFrame(stepWooferExcursion);
    };
    rafId = window.requestAnimationFrame(stepWooferExcursion);

    return () => {
      window.cancelAnimationFrame(rafId);
      grilleEl.style.setProperty('--cw-bass-excursion', '1');
    };
  }, [activeLoopsEnabled]);

  // Slow 3D Elliptical Orbits + cursor-reactive parallax for vertical portrait song cards (Zero Collision / No Bounce)
  const cardParallaxRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ambientCardSlotsRef = useRef(ambientCardSlots);
  ambientCardSlotsRef.current = ambientCardSlots;

  useEffect(() => {
    const stageEl = stageRef.current;
    const slots = ambientCardSlotsRef.current;

    const applyOrbitPoseAtTime = (elapsedSec: number, normX: number, normY: number) => {
      for (let i = 0; i < slots.length; i++) {
        const el = cardParallaxRefs.current[i];
        if (!el) continue;
        const orbit = computeOrbitingVerticalCard3DPose(i, elapsedSec, slots.length);
        const par = computeCardParallaxPose(normX, normY, slots[i].depthFactor, 4);
        el.style.setProperty('--cw-orb-x', `${(orbit.translateXPx + par.translateXPx).toFixed(2)}px`);
        el.style.setProperty('--cw-orb-y', `${(orbit.translateYPx + par.translateYPx).toFixed(2)}px`);
        el.style.setProperty('--cw-orb-z', `${orbit.translateZPx.toFixed(2)}px`);
        el.style.setProperty('--cw-orb-rx', `${(orbit.rotateXDeg + par.rotateXDeg).toFixed(2)}deg`);
        el.style.setProperty('--cw-orb-ry', `${(orbit.rotateYDeg + par.rotateYDeg).toFixed(2)}deg`);
        el.style.setProperty('--cw-orb-rz', `${orbit.rotateZDeg.toFixed(2)}deg`);
        el.style.setProperty('--cw-orb-scale', `${orbit.scale.toFixed(3)}`);
        el.style.zIndex = String(orbit.zIndex);
      }
    };

    const physicsActive =
      !prefersReducedMotion &&
      !lowPowerMode &&
      !isDocumentHidden &&
      !hideBoxArt &&
      !isDeviceOnlyMode &&
      !isMobilePortrait;

    if (!stageEl || !physicsActive) {
      applyOrbitPoseAtTime(0, 0, 0);
      return;
    }

    let rafId = 0;
    let targetNormX = 0;
    let targetNormY = 0;
    const startMs = performance.now();

    const stepCardOrbit = (nowMs: number) => {
      const elapsedSec = (nowMs - startMs) / 1000;
      applyOrbitPoseAtTime(elapsedSec, targetNormX, targetNormY);
      rafId = window.requestAnimationFrame(stepCardOrbit);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = stageEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      targetNormX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      targetNormY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const handleMouseLeave = () => {
      targetNormX = 0;
      targetNormY = 0;
    };

    stageEl.addEventListener('mousemove', handleMouseMove, { passive: true });
    stageEl.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    rafId = window.requestAnimationFrame(stepCardOrbit);

    return () => {
      stageEl.removeEventListener('mousemove', handleMouseMove);
      stageEl.removeEventListener('mouseleave', handleMouseLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, [prefersReducedMotion, lowPowerMode, isDocumentHidden, hideBoxArt, isDeviceOnlyMode, isMobilePortrait]);

  // Draggable active track card (Slot 0)
  const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [holderDragDeltaX, setHolderDragDeltaX] = useState<number>(0);
  const [isDraggingHolder, setIsDraggingHolder] = useState<boolean>(false);
  const holderDragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    lastClientX: number;
  } | null>(null);

  const handleHolderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    holderDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: holderOffset.x,
      origY: holderOffset.y,
      lastClientX: e.clientX,
    };
    setHolderDragDeltaX(0);
    setIsDraggingHolder(true);
  };

  const handleHolderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!holderDragRef.current) return;
    const dx = e.clientX - holderDragRef.current.startX;
    const dy = e.clientY - holderDragRef.current.startY;
    const stepDx = e.clientX - holderDragRef.current.lastClientX;
    holderDragRef.current.lastClientX = e.clientX;
    setHolderDragDeltaX(stepDx);

    const clamped = clampHolderBoxDragOffset({
      offsetX: holderDragRef.current.origX + dx,
      offsetY: holderDragRef.current.origY + dy,
      boardWidth: stageDims.width,
      boardHeight: stageDims.height,
      boxSize: 160,
      homeCenterX: 120,
      homeCenterY: stageDims.height - 140,
    });
    setHolderOffset({ x: clamped.offsetX, y: clamped.offsetY });
  };

  const handleHolderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!holderDragRef.current) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    holderDragRef.current = null;
    setHolderDragDeltaX(0);
    setIsDraggingHolder(false);
  };

  const holderTiltDeg = useMemo(() => {
    if (isDraggingHolder) {
      return Number((calculateHolderBoxDragTiltDeg(holderDragDeltaX, true) * 0.45).toFixed(2));
    }
    return 0;
  }, [isDraggingHolder, holderDragDeltaX]);

  // Pane switching helper maintaining clean history for MENU back navigation
  const navigateToPane = useCallback(
    (nextPane: ClickWheelPaneId) => {
      if (nextPane === activePane) return;
      setPaneHistory((prev) => [...prev.slice(-6), activePane]);
      setActivePane(nextPane);
    },
    [activePane]
  );

  const handleDockUtilitySelect = useCallback(
    (pane: ClickWheelPaneId) => {
      triggerButtonHaptic(lowPowerMode);
      retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
      if (pane === 'music' && activePane === 'music') {
        setMusicMenuLevel((prev) => (prev === 'root' ? 'songs' : 'root'));
        return;
      }
      navigateToPane(pane);
    },
    [lowPowerMode, generationSpec.soundProfile, activePane, navigateToPane]
  );

  // Auto-scroll focused music row inside #cw-music-list ONLY
  const musicListRef = useRef<HTMLDivElement | null>(null);
  const musicRowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  useEffect(() => {
    if (activePane !== 'music' || musicMenuLevel !== 'songs') return;
    const container = musicListRef.current;
    const rowEl = musicRowRefs.current.get(focusedTrackIndex);
    if (!container || !rowEl) return;
    const rowTop = rowEl.offsetTop;
    const rowBot = rowTop + rowEl.offsetHeight;
    if (rowTop < container.scrollTop) {
      container.scrollTo({ top: rowTop, behavior: 'auto' });
    } else if (rowBot > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: rowBot - container.clientHeight, behavior: 'auto' });
    }
  }, [activePane, musicMenuLevel, focusedTrackIndex]);

  // Center button double-press detection for Skip-Stutter effect
  const lastCenterPressMsRef = useRef<number | null>(null);
  const [stutterPulseActive, setStutterPulseActive] = useState<boolean>(false);

  const executeRootMenuSelection = useCallback(
    (entryIdx: number) => {
      const entry = activeRootMenu[entryIdx];
      if (!entry) return;
      if (entry.triggersShuffle) {
        onToggleShuffle();
        navigateToPane('now-playing');
        return;
      }
      if (entry.id === 'music') {
        setMusicMenuLevel('music-hub');
        setMusicHubFocusedIdx(0);
        return;
      }
      if (entry.id === 'playlists') {
        setMusicMenuLevel('playlists');
        return;
      }
      if (entry.id === 'artists') {
        setMusicMenuLevel('artists');
        return;
      }
      if (entry.opensSongsSubmenu) {
        setMusicMenuLevel('songs');
        return;
      }
      if (entry.targetPane) {
        navigateToPane(entry.targetPane);
      }
    },
    [activeRootMenu, navigateToPane, onToggleShuffle]
  );

  const executeMusicHubSelection = useCallback(
    (hubIdx: number) => {
      const item = IPOD_MUSIC_HUB_MENU[hubIdx];
      if (!item) return;
      if (item.id === 'now-playing') {
        navigateToPane('now-playing');
        return;
      }
      setMusicMenuLevel(item.id);
    },
    [navigateToPane]
  );

  const stutterPulseTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (stutterPulseTimerRef.current !== null) {
        window.clearTimeout(stutterPulseTimerRef.current);
      }
    };
  }, []);

  const handleCenterSelectClick = useCallback(() => {
    triggerButtonHaptic(lowPowerMode);
    const now = performance.now();
    const { isDoublePress, nextLastPressMs } = detectDoubleCenterPress(
      lastCenterPressMsRef.current,
      now
    );
    lastCenterPressMsRef.current = nextLastPressMs;

    if (isDoublePress) {
      retroAudio.triggerClickWheelSkipStutter('classic');
      onScratch('classic');
      setStutterPulseActive(true);
      if (stutterPulseTimerRef.current !== null) {
        window.clearTimeout(stutterPulseTimerRef.current);
      }
      stutterPulseTimerRef.current = window.setTimeout(() => {
        setStutterPulseActive(false);
        stutterPulseTimerRef.current = null;
      }, 320);
      return;
    }

    retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);

    if (activePane === 'music') {
      if (musicMenuLevel === 'root') {
        executeRootMenuSelection(rootMenuFocusedIdx);
        return;
      }
      if (musicMenuLevel === 'music-hub') {
        executeMusicHubSelection(musicHubFocusedIdx);
        return;
      }
      if (musicMenuLevel === 'playlists' || musicMenuLevel === 'artists') {
        setMusicMenuLevel('songs');
        return;
      }
      const target = tracks[focusedTrackIndex];
      if (target && onSelectTrack) {
        onSelectTrack(target.id);
        navigateToPane('now-playing');
      } else if (isStandby) {
        onOpenSpotifyModal();
      } else {
        onTogglePlay();
      }
      return;
    }

    if (isStandby) {
      onOpenSpotifyModal();
      return;
    }

    if (activePane === 'now-playing') {
      setNowPlayingMode((prev) => cycleNowPlayingCenterMode(prev));
      return;
    }

    if (activePane === 'lyrics') {
      navigateToPane('now-playing');
      return;
    }

    onTogglePlay();
  }, [
    activePane,
    musicMenuLevel,
    rootMenuFocusedIdx,
    musicHubFocusedIdx,
    executeRootMenuSelection,
    executeMusicHubSelection,
    tracks,
    focusedTrackIndex,
    onSelectTrack,
    navigateToPane,
    isStandby,
    onOpenSpotifyModal,
    onTogglePlay,
    onScratch,
    lowPowerMode,
    generationSpec.soundProfile,
  ]);

  const handleMenuBackClick = useCallback(() => {
    triggerButtonHaptic(lowPowerMode);
    retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
    if (activePane === 'now-playing' && nowPlayingMode !== 'default') {
      setNowPlayingMode('default');
      return;
    }
    if (activePane === 'music') {
      if (musicMenuLevel === 'songs' || musicMenuLevel === 'playlists' || musicMenuLevel === 'artists') {
        setMusicMenuLevel(isGen1 ? 'root' : 'music-hub');
        return;
      }
      if (musicMenuLevel === 'music-hub') {
        setMusicMenuLevel('root');
        return;
      }
    }
    const { nextPane, nextHistory } = getNextClickWheelMenuBackPane(activePane, paneHistory);
    setPaneHistory(nextHistory);
    setActivePane(nextPane);
  }, [
    activePane,
    nowPlayingMode,
    musicMenuLevel,
    isGen1,
    paneHistory,
    lowPowerMode,
    generationSpec.soundProfile,
  ]);

  // Continuous circumferential rotary wheel gesture (`atan2` angle delta calculation) + Gen 1 mechanical inertia
  const wheelRingRef = useRef<HTMLDivElement | null>(null);
  const centerBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mechanicalWheelDeg, setMechanicalWheelDeg] = useState<number>(0);
  const mechanicalWheelDegRef = useRef<number>(0);
  const inertiaRafRef = useRef<number | null>(null);

  const stopWheelInertia = useCallback(() => {
    if (inertiaRafRef.current !== null) {
      window.cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isGen1 || isDocumentHidden || prefersReducedMotion || lowPowerMode) {
      stopWheelInertia();
    }
    return stopWheelInertia;
  }, [isGen1, isDocumentHidden, prefersReducedMotion, lowPowerMode, stopWheelInertia]);

  const wheelDragRef = useRef<{
    pointerId: number;
    prevAngleDeg: number;
    accumulatedDeg: number;
    movedSteps: number;
    startX: number;
    startY: number;
    lastTimeMs: number;
    velocityDegPerSec: number;
  } | null>(null);

  const getPointerWheelAngleDeg = (clientX: number, clientY: number): number => {
    const el = wheelRingRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
  };

  const applyWheelStepDelta = useCallback(
    (steps: number) => {
      if (steps === 0) return;
      const tickCount = Math.min(3, Math.abs(steps));
      for (let i = 0; i < tickCount; i++) {
        retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
      }
      triggerButtonHaptic(lowPowerMode);

      if (activePane === 'music') {
        if (musicMenuLevel === 'root') {
          setRootMenuFocusedIdx((prev) =>
            computeClickWheelListIndexStep(prev, steps, activeRootMenu.length)
          );
        } else if (musicMenuLevel === 'music-hub') {
          setMusicHubFocusedIdx((prev) =>
            computeClickWheelListIndexStep(prev, steps, IPOD_MUSIC_HUB_MENU.length)
          );
        } else if (musicMenuLevel === 'artists') {
          setArtistFocusedIdx((prev) =>
            computeClickWheelListIndexStep(prev, steps, uniqueArtists.length)
          );
        } else if (musicMenuLevel === 'songs') {
          setFocusedTrackIndex((prev) =>
            computeClickWheelListIndexStep(prev, steps, tracks.length)
          );
        }
      } else if (activePane === 'now-playing') {
        if (nowPlayingMode === 'volume') {
          const nextVol = Math.max(0, Math.min(1, Number((volume + steps * 0.05).toFixed(2))));
          onChangeVolume(nextVol);
        } else if (nowPlayingMode === 'rating') {
          setStarRating((prev) => Math.max(1, Math.min(5, prev + steps)));
        } else if (!isStandby && safeDuration > 0) {
          const cur = playbackClockStore.getCurrentTimeSec();
          const target = computeClickWheelSeekTargetSec(cur, steps, safeDuration, 3);
          onSeek(target);
        }
      } else if (activePane === 'settings') {
        const nextVol = Math.max(0, Math.min(1, Number((volume + steps * 0.04).toFixed(2))));
        onChangeVolume(nextVol);
      } else if (activePane === 'lyrics') {
        if (!isStandby && safeDuration > 0) {
          const cur = playbackClockStore.getCurrentTimeSec();
          const target = computeClickWheelSeekTargetSec(cur, steps, safeDuration, 2);
          onSeek(target);
        }
      }
    },
    [
      activePane,
      musicMenuLevel,
      activeRootMenu.length,
      uniqueArtists.length,
      tracks.length,
      nowPlayingMode,
      isStandby,
      safeDuration,
      onSeek,
      volume,
      onChangeVolume,
      lowPowerMode,
      generationSpec.soundProfile,
    ]
  );

  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const targetNode = e.target as HTMLElement | null;
    if (
      targetNode &&
      (targetNode.closest('button') ||
        (centerBtnRef.current &&
          (targetNode === centerBtnRef.current || centerBtnRef.current.contains(targetNode))))
    ) {
      return;
    }
    stopWheelInertia();
    const angle = getPointerWheelAngleDeg(e.clientX, e.clientY);
    wheelDragRef.current = {
      pointerId: e.pointerId,
      prevAngleDeg: angle,
      accumulatedDeg: 0,
      movedSteps: 0,
      startX: e.clientX,
      startY: e.clientY,
      lastTimeMs: performance.now(),
      velocityDegPerSec: 0,
    };
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = wheelDragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
    if (dist < 6 && st.movedSteps === 0) return;

    if (st.movedSteps === 0) {
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    const nowMs = performance.now();
    const dtSec = Math.max(0.004, (nowMs - st.lastTimeMs) / 1000);
    st.lastTimeMs = nowMs;

    const nextAngle = getPointerWheelAngleDeg(e.clientX, e.clientY);
    const delta = normalizeClickWheelAngleDeltaDeg(st.prevAngleDeg, nextAngle);
    st.prevAngleDeg = nextAngle;
    st.velocityDegPerSec = (delta / dtSec) * 0.65 + st.velocityDegPerSec * 0.35;

    if (isGen1) {
      const nextMechDeg = mechanicalWheelDegRef.current + delta;
      mechanicalWheelDegRef.current = nextMechDeg;
      setMechanicalWheelDeg(nextMechDeg);
    }

    const { steps, remainderDeg } = accumulateClickWheelTickSteps(st.accumulatedDeg, delta);
    st.accumulatedDeg = remainderDeg;
    if (steps !== 0) {
      st.movedSteps += Math.abs(steps);
      applyWheelStepDelta(steps);
    }
  };

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = wheelDragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    try {
      if ((e.currentTarget as HTMLDivElement).hasPointerCapture?.(e.pointerId)) {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    const didRotateWheel = st.movedSteps > 0;
    const releaseVel = st.velocityDegPerSec;
    let accumRem = st.accumulatedDeg;
    wheelDragRef.current = null;

    if (isGen1) {
      if (
        !prefersReducedMotion &&
        !lowPowerMode &&
        !isDocumentHidden &&
        Math.abs(releaseVel) >= 45
      ) {
        let curVel = releaseVel;
        let lastFrameMs = performance.now();
        const stepInertia = (frameMs: number) => {
          const dt = (frameMs - lastFrameMs) / 1000;
          lastFrameMs = frameMs;
          const res = stepMechanicalWheelInertia(curVel, dt);
          curVel = res.nextVelocityDegPerSec;
          const nextDeg = mechanicalWheelDegRef.current + res.deltaDeg;
          mechanicalWheelDegRef.current = nextDeg;
          setMechanicalWheelDeg(nextDeg);

          const { steps, remainderDeg } = accumulateClickWheelTickSteps(accumRem, res.deltaDeg);
          accumRem = remainderDeg;
          if (steps !== 0) {
            applyWheelStepDelta(steps);
          }

          if (res.settled) {
            const snapped = computeMechanicalWheelDetentSnapDeg(nextDeg, CLICK_WHEEL_TICK_DEGREES);
            mechanicalWheelDegRef.current = snapped;
            setMechanicalWheelDeg(snapped);
            inertiaRafRef.current = null;
          } else {
            inertiaRafRef.current = window.requestAnimationFrame(stepInertia);
          }
        };
        inertiaRafRef.current = window.requestAnimationFrame(stepInertia);
      } else {
        const snapped = computeMechanicalWheelDetentSnapDeg(
          mechanicalWheelDegRef.current,
          CLICK_WHEEL_TICK_DEGREES
        );
        mechanicalWheelDegRef.current = snapped;
        setMechanicalWheelDeg(snapped);
      }
    }

    if (didRotateWheel) {
      e.stopPropagation();
    }
  };

  // Horizontal progress bar & Settings sliders
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const handleScrubBarPointer = useCallback(
    (clientX: number) => {
      if (isStandby || safeDuration <= 0 || !progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(Math.round(ratio * safeDuration));
    },
    [isStandby, safeDuration, onSeek]
  );

  const pitchTrackRef = useRef<HTMLDivElement | null>(null);
  const volumeTrackRef = useRef<HTMLDivElement | null>(null);

  const handlePitchPointer = useCallback(
    (clientX: number) => {
      if (!pitchTrackRef.current) return;
      const rect = pitchTrackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const nextPitch = Number((-12 + ratio * 24).toFixed(1));
      onChangePitch(Math.abs(nextPitch) < 0.35 ? 0 : nextPitch);
    },
    [onChangePitch]
  );

  const handleVolumePointer = useCallback(
    (clientX: number) => {
      if (!volumeTrackRef.current) return;
      const rect = volumeTrackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChangeVolume(Number(ratio.toFixed(2)));
    },
    [onChangeVolume]
  );

  const stepDockVolume = useCallback(
    (delta: number) => {
      triggerButtonHaptic(lowPowerMode);
      retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
      const next = Math.max(0, Math.min(1, Number((volume + delta).toFixed(2))));
      onChangeVolume(next);
    },
    [lowPowerMode, generationSpec.soundProfile, volume, onChangeVolume]
  );

  const { elapsedLabel, remainingLabel } = useMemo(
    () => formatRemainingTrackTime(currentTimeSec, safeDuration),
    [currentTimeSec, safeDuration]
  );

  const slidePose = getClickWheelTrackChangePose(trackSlidePhase);
  const activePaneIdx = Math.max(0, CLICK_WHEEL_PANE_ORDER.indexOf(activePane));
  const paneTransitionCss =
    prefersReducedMotion || lowPowerMode
      ? 'none'
      : 'transform 250ms cubic-bezier(0.25, 1, 0.5, 1)';

  const activeTrackIndex = tracks.findIndex((t) => t.id === track.id);
  const trackPositionLabel =
    tracks.length > 0 && activeTrackIndex >= 0
      ? `${activeTrackIndex + 1} of ${tracks.length}`
      : isStandby
        ? 'No track loaded'
        : '1 of 1';

  const pitchFillPct = ((pitchPercent + 12) / 24) * 100;
  const volumeFillPct = volume * 100;

  const displayArtSrc = isGen1 && gen1DitheredDataUrl ? gen1DitheredDataUrl : resolvedArtworkUrl;
  const artFilterStyle: React.CSSProperties | undefined = isGen1
    ? gen1DitheredDataUrl
      ? { imageRendering: 'pixelated' }
      : { filter: 'url(#cw-gen1-1bit-filter)', imageRendering: 'pixelated' }
    : isGen2
      ? { filter: 'grayscale(1) contrast(1.38) brightness(1.06)', mixBlendMode: 'multiply' }
      : undefined;

  const cardinalGlyphColor = isDarkAnodized
    ? '#F1F3F6'
    : isGen1
      ? '#7B8089'
      : isGen2
        ? '#FFFFFF'
        : '#8A8F98';
  const cardinalGlyphHoverClass =
    isDarkAnodized || isGen2 ? 'hover:text-white' : 'hover:text-[#1D1D1F]';
  const gen1DebossStyle: React.CSSProperties | undefined = isGen1
    ? { textShadow: '0 1px 0 rgba(255,255,255,0.92)' }
    : undefined;

  const renderWheelCardinalButtons = () => (
    <>
      <button
        id="btn-cw-menu"
        type="button"
        aria-label="Menu Back"
        onClick={(e) => {
          e.stopPropagation();
          handleMenuBackClick();
        }}
        style={{
          color: cardinalGlyphColor,
          fontSize: isNano ? 'clamp(6.8px, 1.65cqh, 9px)' : 'clamp(7.5px, 1.85cqh, 10.5px)',
          ...gen1DebossStyle,
        }}
        className={`cw-wheel-pad-btn absolute top-[5.2%] left-1/2 -translate-x-1/2 px-2 py-0.5 font-sans font-bold tracking-[0.08em] ${cardinalGlyphHoverClass} cursor-pointer z-20`}
      >
        {isGen1 ? 'menu' : 'MENU'}
      </button>

      <button
        id="btn-prev-track"
        type="button"
        aria-label="Previous Track"
        onClick={(e) => {
          e.stopPropagation();
          triggerButtonHaptic(lowPowerMode);
          retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);
          onPrevious();
        }}
        style={{ color: cardinalGlyphColor }}
        className={`cw-wheel-pad-btn absolute left-[4.4%] top-1/2 -translate-y-1/2 p-1 ${cardinalGlyphHoverClass} cursor-pointer z-20`}
      >
        <SkipBack className="w-[clamp(9.5px,2.1cqh,13.5px)] h-[clamp(9.5px,2.1cqh,13.5px)] fill-current" />
      </button>

      <button
        id="btn-next-track"
        type="button"
        aria-label="Next Track"
        onClick={(e) => {
          e.stopPropagation();
          triggerButtonHaptic(lowPowerMode);
          retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);
          onNext();
        }}
        style={{ color: cardinalGlyphColor }}
        className={`cw-wheel-pad-btn absolute right-[4.4%] top-1/2 -translate-y-1/2 p-1 ${cardinalGlyphHoverClass} cursor-pointer z-20`}
      >
        <SkipForward className="w-[clamp(9.5px,2.1cqh,13.5px)] h-[clamp(9.5px,2.1cqh,13.5px)] fill-current" />
      </button>

      <button
        id="btn-play-pause"
        type="button"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={(e) => {
          e.stopPropagation();
          triggerButtonHaptic(lowPowerMode);
          retroAudio.triggerClickWheelStartCue(generationSpec.soundProfile);
          onTogglePlay();
        }}
        style={{ color: cardinalGlyphColor }}
        className={`cw-wheel-pad-btn absolute bottom-[5.2%] left-1/2 -translate-x-1/2 px-2 py-0.5 flex items-center gap-0.5 ${cardinalGlyphHoverClass} cursor-pointer z-20`}
      >
        <Play className="w-[clamp(8.5px,1.75cqh,11.5px)] h-[clamp(8.5px,1.75cqh,11.5px)] fill-current" />
        <Pause className="w-[clamp(8.5px,1.75cqh,11.5px)] h-[clamp(8.5px,1.75cqh,11.5px)] fill-current" />
      </button>
    </>
  );

  const renderSplitRightArtPreview = () => (
    <div
      id="cw-split-art-preview"
      onClick={() => {
        triggerButtonHaptic(lowPowerMode);
        navigateToPane('now-playing');
      }}
      className="relative h-full w-full overflow-hidden bg-[#14171D] cursor-pointer"
    >
      {resolvedArtworkUrl && !artworkBroken ? (
        <img
          src={resolvedArtworkUrl}
          alt={isStandby ? 'Preview Cover' : `${track.title} Cover`}
          draggable={false}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#232934] to-[#111419] text-[#8E96A4]">
          <Disc3 className="w-7 h-7 opacity-75" />
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 shadow-[inset_7px_0_14px_rgba(0,0,0,0.28)]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <p className="font-sans text-[7.5px] font-bold text-white truncate leading-tight">
          {isStandby ? 'Standby' : track.title}
        </p>
        <p className="font-sans text-[6.5px] font-medium text-white/80 truncate leading-tight">
          {isStandby ? 'Select Music' : track.artist}
        </p>
      </div>
    </div>
  );

  const renderIpodHardwareUnit = () => (
    <div
      key={`cw-dock-drop-${dockAnimKey}`}
      data-unit-swap-phase={unitSwapPhase}
      onClick={(e) => {
        if (isDeviceOnlyMode) {
          e.stopPropagation();
        }
      }}
      style={{
        zIndex: 25,
        transform:
          unitSwapPhase !== 'docked'
            ? `translate3d(${genSwipeShiftPx}px, ${unitSwapPose.translateYPx}px, 0) scale(${unitSwapPose.scale})`
            : genSwipeShiftPx !== 0
              ? `translate3d(${genSwipeShiftPx}px, 0, 0)`
              : undefined,
        opacity: unitSwapPose.opacity,
        transition: prefersReducedMotion
          ? 'none'
          : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className={`relative flex items-center justify-center shrink-0 ${
        dockDropping ? 'cw-docked-dropping' : 'cw-docked-lean'
      }`}
    >
      <div
        id="cw-player-chassis"
        data-active-pane={activePane}
        data-music-level={musicMenuLevel}
        data-now-playing-mode={nowPlayingMode}
        data-cw-gen={generation}
        data-cw-finish={isNano ? nanoColor : generationSpec.supportsFinishToggle ? gen3Finish : 'white'}
        data-cw-nano-color={isNano ? nanoColor : undefined}
        data-ipod-scale-mode={ipodScaleMode}
        data-stutter-active={stutterPulseActive ? 'true' : 'false'}
        style={{
          width: `${activeChassisW}px`,
          height: `${activeChassisH}px`,
          aspectRatio: isNano ? '0.43 / 1' : '0.608 / 1',
          margin: '0 auto',
          containerType: 'size',
          borderRadius: generationSpec.chassisCornerRadiusCss,
          backgroundImage: isNano ? nanoColorSpec.chassisGradient : undefined,
          borderColor: isNano ? nanoColorSpec.borderHex : undefined,
          transition: prefersReducedMotion
            ? 'none'
            : 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), height 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: isNano
            ? `0 20px 40px rgba(0, 0, 0, 0.22), 0 0 0 1.5px ${nanoColorSpec.borderHex}, inset 0 1.5px 0 rgba(255,255,255,0.55)`
            : '0 20px 40px rgba(0, 0, 0, 0.18), 0 0 0 2px #D5DAE2, 0 0 0 3px #8B929D, inset 0 1.5px 0 #FFFFFF',
        }}
        className={`cw-player-chassis ${
          isGen1
            ? 'cw-chassis-gen1'
            : isGen2
              ? 'cw-chassis-gen2'
              : isNano
                ? nanoColorSpec.isDarkChassis
                  ? 'cw-chassis-gen3-black'
                  : 'cw-chassis-gen3'
                : isDarkAnodized
                  ? 'cw-chassis-gen3-black'
                  : isOfficialWhite
                    ? 'cw-chassis-official-white'
                    : 'cw-chassis-gen3'
        } relative flex flex-col items-center justify-between overflow-hidden shrink-0 ${
          isNano ? 'pt-[2.8cqw]' : 'pt-[3.2cqw]'
        }`}
      >
        {/* Outer Mirror-Polished Stainless Steel Perimeter Rim */}
        <div
          aria-hidden="true"
          style={{ borderRadius: 'inherit' }}
          className="cw-stainless-rim pointer-events-none absolute inset-0 z-30"
        />

        {/* 1st Gen & Official iPod White 2mm Clear Acrylic Outer Layer */}
        {(isGen1 || isOfficialWhite) && (
          <div
            id="cw-acrylic-front-layer"
            aria-hidden="true"
            style={{ borderRadius: 'inherit' }}
            className="cw-acrylic-front-layer pointer-events-none absolute inset-0 z-40"
          />
        )}

        {/* Ambient Top-Third Glossy Lens Reflection */}
        <div
          aria-hidden="true"
          className="cw-top-gloss-sheet pointer-events-none absolute top-0 inset-x-0 h-[34%] z-30"
        />

        {/* Screen Aperture (Strictly Locked to Reference Hardware Proportions: 42% portrait LCD for Nano, 48% for Classic) */}
        <div
          style={{
            width: `${activeScreenW}px`,
            height: isNano ? '42%' : '48%',
            borderRadius: isColorSplit ? 'clamp(4px, 1.5cqw, 7px)' : '3px',
            transition: prefersReducedMotion
              ? 'none'
              : 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className={`relative z-20 flex flex-col overflow-hidden ${
            isColorSplit
              ? isDarkAnodized
                ? 'cw-glass-bezel-dark'
                : 'cw-glass-bezel-silver'
              : ''
          }`}
        >
          <div
            id="cw-screen-frame"
            data-screen-mode={generationSpec.screenMode}
            style={{ borderRadius: generationSpec.screenCornerRadiusCss }}
            className={`relative w-full h-full border flex flex-col overflow-hidden ${
              isGen1 ? 'cw-screen-gen1' : isGen2 ? 'cw-screen-gen2' : 'cw-screen-gen3'
            }`}
          >
            {/* Authentic iPod OS Header Bar (Locked 20px height: Left Play/Pause Indicator, Centered Bold Menu Title, Right Segmented Battery Meter) */}
            <header
              id="cw-status-bar"
              style={{
                height: '20px',
                minHeight: '20px',
                maxHeight: '20px',
                borderColor: screenPalette.borderHex,
                background: isGen1
                  ? 'linear-gradient(180deg, #C7D4B6 0%, #B4C3A2 100%)'
                  : isGen2
                    ? 'linear-gradient(180deg, #E8F1FC 0%, #D2E1F4 100%)'
                    : 'linear-gradient(180deg, #FFFFFF 0%, #EBEEF3 100%)',
              }}
              className="relative z-20 w-full px-[2.8cqw] border-b flex items-center justify-between gap-1 shrink-0"
            >
              <div className="flex items-center gap-1 min-w-0 z-10">
                <button
                  id="cw-tab-now-playing"
                  type="button"
                  aria-label={isPlaying ? 'Now Playing (Playing)' : 'Now Playing (Paused)'}
                  title="Jump to Now Playing"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
                    navigateToPane('now-playing');
                  }}
                  style={{ color: isColorSplit ? '#007AFF' : screenPalette.ink }}
                  className="inline-flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80"
                >
                  {isPlaying ? (
                    <Play className="w-[9.5px] h-[9.5px] fill-current" />
                  ) : isStandby ? (
                    <Square className="w-[8.5px] h-[8.5px] fill-current" />
                  ) : (
                    <Pause className="w-[9.5px] h-[9.5px] fill-current" />
                  )}
                </button>
              </div>

              <span
                id="cw-screen-pane-title"
                style={{
                  fontSize: isNano ? 'clamp(8px, 2cqh, 10.5px)' : 'clamp(8.5px, 2.2cqh, 11.5px)',
                  color: screenPalette.ink,
                }}
                className={`${screenTypeClass} pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[46%] font-bold truncate text-center`}
              >
                {activePane === 'music'
                  ? CW_MUSIC_LEVEL_LABELS[musicMenuLevel]
                  : CW_PANE_LABELS[activePane]}
              </span>

              <div className="flex items-center gap-1 shrink-0 z-10">
                <ClickWheelClockStatus
                  isDocumentHidden={isDocumentHidden}
                  isGen1Pixel={isGen1}
                  compactDate={true}
                  inkColor={screenPalette.ink}
                  subInkColor={screenPalette.subInk}
                />
                <button
                  id="btn-stop-playback"
                  type="button"
                  title="Stop Playback"
                  aria-label="Stop"
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    retroAudio.triggerClickWheelStopCue();
                    onStop();
                  }}
                  style={{
                    borderColor: screenPalette.borderHex,
                    backgroundColor: screenPalette.cardBgHex,
                    color: screenPalette.ink,
                  }}
                  className="w-[14px] h-[14px] rounded-[3px] border active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Square className="w-[6px] h-[6px] fill-current" />
                </button>

                {isGen1 ? (
                  <svg
                    id="cw-battery-icon"
                    viewBox="0 0 24 12"
                    aria-label="Battery Full"
                    className="w-[18px] h-[9.5px] shrink-0"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="19"
                      height="10"
                      fill="none"
                      stroke="#161F13"
                      strokeWidth="1.8"
                    />
                    <rect x="3.5" y="3.5" width="3.5" height="5" fill="#161F13" />
                    <rect x="8.5" y="3.5" width="3.5" height="5" fill="#161F13" />
                    <rect x="13.5" y="3.5" width="3.5" height="5" fill="#161F13" />
                    <rect x="20" y="3.5" width="2.5" height="5" fill="#161F13" />
                  </svg>
                ) : (
                  <svg
                    id="cw-battery-icon"
                    viewBox="0 0 22 11"
                    aria-label="Battery Full"
                    className="w-[17px] h-[8.5px] shrink-0"
                  >
                    <rect
                      x="0.75"
                      y="1"
                      width="18"
                      height="9"
                      rx="1.8"
                      fill={isGen2 ? '#E8F1FC' : '#FFFFFF'}
                      stroke={isGen2 ? '#1F3F7A' : '#8E9399'}
                      strokeWidth="1.1"
                    />
                    <rect
                      x="2.2"
                      y="2.4"
                      width="14.8"
                      height="6.2"
                      rx="0.8"
                      fill={isGen2 ? '#1F3F7A' : '#34C759'}
                    />
                    <path
                      d="M19.5 3.6 H21 V7.4 H19.5 Z"
                      fill={isGen2 ? '#1F3F7A' : '#8E9399'}
                    />
                  </svg>
                )}
              </div>
            </header>

            {/* 250ms Horizontal Slide Viewport Across All 4 Panes */}
            <div className="relative flex-1 min-h-0 w-full overflow-hidden">
              <div
                id="cw-pane-slider"
                className="cw-pane-slider flex w-full h-full"
                style={{
                  transform: `translate3d(-${activePaneIdx * 100}%, 0, 0)`,
                  transition: paneTransitionCss,
                }}
              >
                {/* PANE 0: HIERARCHICAL iPOD OS NAVIGATION (Main Menu -> Music Hub -> Playlists / Artists / Songs) */}
                <div
                  id="cw-pane-music"
                  key={`cw-music-level-${musicMenuLevel}`}
                  className={`w-full min-w-full shrink-0 h-full flex flex-col min-h-0 overflow-hidden ${menuPushPopClass}`}
                >
                  {musicMenuLevel === 'root' ? (
                    isMonoLcd ? (
                      <div
                        id="cw-mono-root-menu"
                        className="flex-1 min-h-0 flex flex-col py-0.5 px-1 justify-evenly overflow-y-auto"
                      >
                        {activeRootMenu.map((entry, idx) => {
                          const isFocused = idx === rootMenuFocusedIdx;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              data-cw-menu-row={entry.id}
                              onClick={() => {
                                triggerButtonHaptic(lowPowerMode);
                                retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);
                                setRootMenuFocusedIdx(idx);
                                executeRootMenuSelection(idx);
                              }}
                              style={
                                isFocused
                                  ? {
                                      backgroundColor: screenPalette.highlightBgHex,
                                      color: screenPalette.highlightInkHex,
                                    }
                                  : { color: screenPalette.ink }
                              }
                              className="w-full px-2 py-[0.55cqh] rounded-[2px] flex items-center justify-between text-left cursor-pointer"
                            >
                              <span
                                style={{ fontSize: 'clamp(8.5px, 2.05cqh, 11.5px)' }}
                                className={`${screenTypeClass} font-bold truncate`}
                              >
                                {entry.label}
                              </span>
                              <ChevronRight
                                style={{
                                  color: isFocused
                                    ? screenPalette.highlightInkHex
                                    : screenPalette.ink,
                                }}
                                className="w-3.5 h-3.5 shrink-0"
                              />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* CLASSIC & NANO: QVGA SPLIT-SCREEN OS (LEFT MENU + RIGHT ALBUM ART) */
                      <div
                        id="cw-classic-split-view"
                        className="flex-1 min-h-0 w-full grid grid-cols-2 overflow-hidden"
                      >
                        <div
                          style={{ borderColor: screenPalette.borderHex }}
                          className="h-full border-r flex flex-col justify-evenly py-0.5 overflow-hidden bg-white"
                        >
                          {CLASSIC_COLOR_SPLIT_MENU.map((entry, idx) => {
                            const isFocused = idx === rootMenuFocusedIdx;
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                data-cw-menu-row={entry.id}
                                onClick={() => {
                                  triggerButtonHaptic(lowPowerMode);
                                  retroAudio.triggerClickWheelTick(
                                    true,
                                    generationSpec.soundProfile
                                  );
                                  setRootMenuFocusedIdx(idx);
                                  executeRootMenuSelection(idx);
                                }}
                                style={isFocused ? undefined : { color: screenPalette.ink }}
                                className={`w-full ${
                                  isNano ? 'px-1 py-[1px]' : 'px-1.5 py-[0.35cqh]'
                                } flex items-center justify-between text-left cursor-pointer ${
                                  isFocused
                                    ? 'cw-active-row-gradient text-white'
                                    : 'hover:bg-[#F3F5F8]'
                                }`}
                              >
                                <span
                                  style={{
                                    fontSize: isNano
                                      ? 'clamp(6.5px, 1.4cqh, 8px)'
                                      : 'clamp(8px, 1.85cqh, 10.5px)',
                                  }}
                                  className="font-sans font-bold truncate leading-none"
                                >
                                  {entry.label}
                                </span>
                                <ChevronRight
                                  className={`${
                                    isNano ? 'w-2 h-2' : 'w-2.5 h-2.5'
                                  } shrink-0 ${
                                    isFocused ? 'text-white' : 'text-[#A0A5AE]'
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>

                        {renderSplitRightArtPreview()}
                      </div>
                    )
                  ) : musicMenuLevel === 'music-hub' ? (
                    /* HIERARCHICAL MUSIC SUBMENU: Playlists, Artists, Songs, Now Playing */
                    <div
                      id="cw-music-hub-submenu"
                      className={`flex-1 min-h-0 w-full ${
                        isColorSplit ? 'grid grid-cols-2' : 'flex flex-col'
                      } overflow-hidden`}
                    >
                      <div
                        style={{ borderColor: screenPalette.borderHex }}
                        className={`h-full ${
                          isColorSplit ? 'border-r bg-white' : ''
                        } flex flex-col justify-evenly py-1 overflow-hidden`}
                      >
                        {IPOD_MUSIC_HUB_MENU.map((item, idx) => {
                          const isFocused = idx === musicHubFocusedIdx;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              data-cw-music-hub-row={item.id}
                              onClick={() => {
                                triggerButtonHaptic(lowPowerMode);
                                retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);
                                setMusicHubFocusedIdx(idx);
                                executeMusicHubSelection(idx);
                              }}
                              style={
                                isFocused && !isColorSplit
                                  ? {
                                      backgroundColor: screenPalette.highlightBgHex,
                                      color: screenPalette.highlightInkHex,
                                    }
                                  : isFocused
                                    ? undefined
                                    : { color: screenPalette.ink }
                              }
                              className={`w-full px-2 py-1 flex items-center justify-between text-left cursor-pointer ${
                                isFocused && isColorSplit ? 'cw-active-row-gradient text-white' : ''
                              }`}
                            >
                              <span
                                style={{ fontSize: 'clamp(8px, 1.9cqh, 10.5px)' }}
                                className={`${screenTypeClass} font-bold truncate`}
                              >
                                {item.label}
                              </span>
                              <ChevronRight
                                className={`w-3 h-3 shrink-0 ${
                                  isFocused ? 'text-current' : 'opacity-65'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                      {isColorSplit && renderSplitRightArtPreview()}
                    </div>
                  ) : musicMenuLevel === 'playlists' || musicMenuLevel === 'artists' ? (
                    /* PLAYLISTS OR ARTISTS SUB-LIST */
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                      <div
                        style={{
                          borderColor: screenPalette.borderHex,
                          backgroundColor: isGen1 ? '#B2C1A0' : isGen2 ? '#CDDCF0' : '#F4F5F7',
                        }}
                        className="px-2 py-0.5 border-b flex items-center justify-between shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => setMusicMenuLevel(isGen1 ? 'root' : 'music-hub')}
                          style={{ color: screenPalette.ink }}
                          className={`${screenTypeClass} text-[8px] font-bold uppercase cursor-pointer`}
                        >
                          ‹ Back
                        </button>
                        <span
                          style={{ color: screenPalette.ink }}
                          className={`${screenTypeClass} text-[8.5px] font-semibold truncate`}
                        >
                          {musicMenuLevel === 'playlists' ? 'Playlists' : 'Artists'}
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0.5">
                        {(musicMenuLevel === 'playlists'
                          ? [playlistName || (isStandby ? 'Spotify Playlists' : track.album)]
                          : uniqueArtists
                        ).map((label, idx) => {
                          const isFocused =
                            musicMenuLevel === 'playlists' ? idx === 0 : idx === artistFocusedIdx;
                          return (
                            <button
                              key={`${label}-${idx}`}
                              type="button"
                              onClick={() => {
                                triggerButtonHaptic(lowPowerMode);
                                retroAudio.triggerClickWheelTick(true, generationSpec.soundProfile);
                                setArtistFocusedIdx(idx);
                                setMusicMenuLevel('songs');
                              }}
                              style={
                                isFocused && !isColorSplit
                                  ? {
                                      backgroundColor: screenPalette.highlightBgHex,
                                      color: screenPalette.highlightInkHex,
                                    }
                                  : isFocused
                                    ? undefined
                                    : { color: screenPalette.ink }
                              }
                              className={`w-full px-2 py-1 rounded-[3px] flex items-center justify-between text-left cursor-pointer ${
                                isFocused && isColorSplit ? 'cw-active-row-gradient text-white' : ''
                              }`}
                            >
                              <span
                                style={{ fontSize: 'clamp(8px, 1.85cqh, 10.5px)' }}
                                className={`${screenTypeClass} font-semibold truncate`}
                              >
                                {label}
                              </span>
                              <ChevronRight className="w-3 h-3 shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* SONGS SUB-VIEW TRACKLIST */
                    <>
                      <div
                        style={{
                          borderColor: screenPalette.borderHex,
                          backgroundColor: isGen1 ? '#B2C1A0' : isGen2 ? '#CDDCF0' : '#F4F5F7',
                        }}
                        className="px-[2.4cqw] py-[0.65cqh] border-b flex items-center justify-between gap-1 shrink-0"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            triggerButtonHaptic(lowPowerMode);
                            setMusicMenuLevel(isGen1 ? 'root' : 'music-hub');
                          }}
                          style={{ color: screenPalette.ink }}
                          className={`${screenTypeClass} text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-[3px] hover:bg-black/10 cursor-pointer shrink-0`}
                        >
                          ‹ Menu
                        </button>
                        <span
                          style={{
                            fontSize: 'clamp(7.5px, 1.75cqh, 9.5px)',
                            color: screenPalette.ink,
                          }}
                          className={`${screenTypeClass} font-semibold truncate`}
                        >
                          {playlistName || (isStandby ? 'Music Library' : track.album)}
                        </span>
                        <span
                          style={{
                            fontSize: 'clamp(7px, 1.6cqh, 9px)',
                            color: screenPalette.subInk,
                          }}
                          className={`${screenTypeClass} tabular-nums shrink-0`}
                        >
                          {tracks.length}
                        </span>
                      </div>

                      {tracks.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-3 text-center gap-2">
                          <p
                            style={{ color: screenPalette.ink }}
                            className={`${screenTypeClass} text-[10px] font-semibold`}
                          >
                            Connect Spotify to Browse Tracks
                          </p>
                          <button
                            type="button"
                            onClick={onOpenSpotifyModal}
                            style={{
                              backgroundColor: screenPalette.highlightBgHex,
                              color: screenPalette.highlightInkHex,
                            }}
                            className={`${screenTypeClass} px-3 py-1 rounded-[4px] text-[9.5px] font-semibold cursor-pointer ${
                              isColorSplit ? 'cw-active-row-gradient' : ''
                            }`}
                          >
                            Sign In to Load Music
                          </button>
                        </div>
                      ) : (
                        <div
                          id="cw-music-list"
                          ref={musicListRef}
                          className="flex-1 min-h-0 overflow-y-auto px-1 py-1 space-y-0.5"
                        >
                          {tracks.map((item, idx) => {
                            const isFocused = idx === focusedTrackIndex;
                            const isActivePlaying = item.id === track.id;
                            const itemArt = resolveActiveArtworkState(item, 0).activeUrl;
                            return (
                              <button
                                key={item.id}
                                ref={(node) => {
                                  if (node) musicRowRefs.current.set(idx, node);
                                  else musicRowRefs.current.delete(idx);
                                }}
                                type="button"
                                data-cw-focused={isFocused ? 'true' : 'false'}
                                onClick={() => {
                                  triggerButtonHaptic(lowPowerMode);
                                  retroAudio.triggerClickWheelTick(
                                    true,
                                    generationSpec.soundProfile
                                  );
                                  setFocusedTrackIndex(idx);
                                  if (onSelectTrack) {
                                    onSelectTrack(item.id);
                                  }
                                  navigateToPane('now-playing');
                                }}
                                style={
                                  isFocused
                                    ? {
                                        backgroundColor: screenPalette.highlightBgHex,
                                        color: screenPalette.highlightInkHex,
                                      }
                                    : { color: screenPalette.ink }
                                }
                                className={`w-full px-1.5 py-[0.7cqh] rounded-[3px] flex items-center justify-between gap-1.5 text-left cursor-pointer ${
                                  isFocused && isColorSplit ? 'cw-active-row-gradient' : ''
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <div
                                    style={{ borderColor: screenPalette.borderHex }}
                                    className="w-[18px] h-[18px] rounded-[2px] overflow-hidden bg-black/10 shrink-0 border"
                                  >
                                    {itemArt ? (
                                      <img
                                        src={itemArt}
                                        alt=""
                                        draggable={false}
                                        style={artFilterStyle}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center opacity-70">
                                        <Disc3 className="w-3 h-3" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span
                                      style={{
                                        fontSize: 'clamp(8px, 1.85cqh, 10.5px)',
                                        color: isFocused
                                          ? screenPalette.highlightInkHex
                                          : screenPalette.ink,
                                      }}
                                      className={`${screenTypeClass} font-semibold truncate leading-tight`}
                                    >
                                      {item.title}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 'clamp(6.8px, 1.5cqh, 8.5px)',
                                        color: isFocused
                                          ? screenPalette.highlightInkHex
                                          : screenPalette.subInk,
                                        opacity: isFocused ? 0.85 : 1,
                                      }}
                                      className={`${screenTypeClass} truncate leading-tight`}
                                    >
                                      {item.artist}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {isActivePlaying && (
                                    <span
                                      style={{
                                        color: isFocused
                                          ? screenPalette.highlightInkHex
                                          : screenPalette.highlightBgHex,
                                      }}
                                      className={`${screenTypeClass} text-[8px] font-bold uppercase`}
                                    >
                                      {isPlaying ? '♪' : '❚❚'}
                                    </span>
                                  )}
                                  <ChevronRight
                                    style={{
                                      color: isFocused
                                        ? screenPalette.highlightInkHex
                                        : screenPalette.faintInk,
                                    }}
                                    className="w-3 h-3"
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* PANE 1: AUTHENTIC NOW PLAYING SCREEN (Track Counter, Square Album Art + LCD Reflection, Track/Artist/Album, Diamond-Cursor Glossy Blue Scrubber Bar + Center-Select Scrub/Volume/Rating Modes) */}
                <div
                  id="cw-pane-now-playing"
                  className="w-full min-w-full shrink-0 h-full flex flex-col justify-between px-[3cqw] py-[1.4cqh] min-h-0 overflow-hidden"
                >
                  <div className="flex-1 min-h-0 flex items-center gap-[3cqw]">
                    <div className="flex flex-col items-center shrink-0" style={{ width: '36%' }}>
                      <div
                        id="cw-now-playing-art"
                        data-cw-art-mode={generationSpec.screenMode}
                        style={{
                          borderColor: screenPalette.borderHex,
                          backgroundColor: screenPalette.cardBgHex,
                        }}
                        className="relative w-full aspect-square rounded-[4px] overflow-hidden border shadow-[0_4px_10px_rgba(15,23,42,0.16)]"
                      >
                        {outgoingArtSnap && (
                          <div
                            aria-hidden="true"
                            style={{
                              transform: `translate3d(${slidePose.outgoingTranslatePct}%, 0, 0)`,
                              opacity: slidePose.outgoingOpacity,
                              backgroundColor: screenPalette.cardBgHex,
                              transition:
                                prefersReducedMotion || lowPowerMode
                                  ? 'none'
                                  : `transform ${CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS.slideDurationMs}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS.slideDurationMs}ms ease-out`,
                            }}
                            className="absolute inset-0 z-10"
                          >
                            {outgoingArtSnap.url ? (
                              <img
                                src={outgoingArtSnap.url}
                                alt=""
                                draggable={false}
                                style={artFilterStyle}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-60">
                                <Disc3 className="w-6 h-6" />
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          style={{
                            transform: `translate3d(${
                              outgoingArtSnap && trackSlidePhase === 'idle'
                                ? 108
                                : slidePose.incomingTranslatePct
                            }%, 0, 0)`,
                            opacity: slidePose.incomingOpacity,
                            transition: outgoingArtSnap
                              ? prefersReducedMotion || lowPowerMode
                                ? 'none'
                                : `transform ${CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS.slideDurationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`
                              : 'none',
                          }}
                          className="relative w-full h-full"
                        >
                          <div
                            data-art-breathing={
                              activeLoopsEnabled && !isStandby ? 'true' : 'false'
                            }
                            style={{
                              animationPlayState:
                                activeLoopsEnabled && !isStandby ? 'running' : 'paused',
                            }}
                            className="cw-art-breathe w-full h-full"
                          >
                            {displayArtSrc && !artworkBroken ? (
                              <img
                                src={displayArtSrc}
                                alt={isStandby ? 'No Track Selected' : `${track.title} Artwork`}
                                draggable={false}
                                style={artFilterStyle}
                                onError={() => {
                                  if (hasMoreFallbackCandidates) {
                                    setArtworkAttempt((n) => n + 1);
                                  } else {
                                    setArtworkBroken(true);
                                  }
                                }}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                style={{ color: screenPalette.subInk }}
                                className="w-full h-full flex flex-col items-center justify-center"
                              >
                                <Disc3 className="w-6 h-6 opacity-75" />
                              </div>
                            )}
                          </div>
                          {/* Subtle Diagonal LCD Glass Reflection Over Square Album Art */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/15"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                      <span
                        id="cw-track-counter"
                        style={{
                          fontSize: 'clamp(7px, 1.55cqh, 9px)',
                          color: screenPalette.subInk,
                        }}
                        className={`${screenTypeClass} font-semibold tabular-nums`}
                      >
                        {trackPositionLabel}
                      </span>

                      <p
                        id="vinyl-track-title"
                        style={{
                          fontSize: 'clamp(9.5px, 2.35cqh, 13px)',
                          color: screenPalette.ink,
                        }}
                        className={`${screenTypeClass} font-bold truncate leading-tight`}
                      >
                        {isStandby ? 'Standby Mode' : track.title}
                      </p>

                      <p
                        id="vinyl-track-artist"
                        style={{
                          fontSize: 'clamp(8px, 1.95cqh, 11px)',
                          color: screenPalette.subInk,
                        }}
                        className={`${screenTypeClass} font-semibold truncate leading-tight`}
                      >
                        {isStandby ? 'Your playlists appear here' : track.artist}
                      </p>

                      <p
                        id="cw-track-album"
                        style={{
                          fontSize: 'clamp(7px, 1.55cqh, 9px)',
                          color: screenPalette.faintInk,
                        }}
                        className={`${screenTypeClass} truncate leading-tight`}
                      >
                        {isStandby ? 'Click Wheel Ready' : track.album}
                      </p>

                      {isStandby && (
                        <button
                          type="button"
                          onClick={onOpenSpotifyModal}
                          style={{
                            backgroundColor: screenPalette.highlightBgHex,
                            color: screenPalette.highlightInkHex,
                          }}
                          className={`${screenTypeClass} mt-1 self-start px-2 py-0.5 rounded-[4px] text-[9px] font-semibold cursor-pointer ${
                            isColorSplit ? 'cw-active-row-gradient' : ''
                          }`}
                        >
                          Open Spotify
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Diamond-Cursor Glossy Blue Progress Scrubber / Volume / Rating Bar */}
                  <div className="w-full pt-[0.6cqh] shrink-0 flex flex-col gap-0.5">
                    {nowPlayingMode === 'rating' ? (
                      <div
                        id="cw-rating-bar"
                        className="w-full h-[14px] flex items-center justify-center gap-1"
                      >
                        {[1, 2, 3, 4, 5].map((starIdx) => (
                          <button
                            key={starIdx}
                            type="button"
                            onClick={() => setStarRating(starIdx)}
                            className="cursor-pointer"
                          >
                            <Star
                              className={`w-3 h-3 ${
                                starIdx <= starRating
                                  ? 'fill-[#007AFF] text-[#007AFF]'
                                  : 'text-[#B0B4BC]'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div
                        id="cw-progress-track"
                        ref={progressBarRef}
                        role="slider"
                        tabIndex={0}
                        aria-label={
                          nowPlayingMode === 'volume' ? 'Now Playing Volume' : 'Seek Track Timeline'
                        }
                        aria-valuemin={0}
                        aria-valuemax={nowPlayingMode === 'volume' ? 100 : safeDuration}
                        aria-valuenow={
                          nowPlayingMode === 'volume'
                            ? Math.round(volume * 100)
                            : Math.round(currentTimeSec)
                        }
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                          if (nowPlayingMode === 'volume') {
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (rect.width > 0) {
                              onChangeVolume(
                                Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                              );
                            }
                          } else {
                            handleScrubBarPointer(e.clientX);
                          }
                        }}
                        onPointerMove={(e) => {
                          if (e.buttons !== 1) return;
                          if (nowPlayingMode === 'volume') {
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (rect.width > 0) {
                              onChangeVolume(
                                Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                              );
                            }
                          } else {
                            handleScrubBarPointer(e.clientX);
                          }
                        }}
                        className="relative w-full h-[12px] flex items-center cursor-pointer touch-none"
                      >
                        <div
                          style={{
                            borderColor: screenPalette.borderHex,
                            backgroundColor: screenPalette.cardBgHex,
                          }}
                          className="relative w-full h-[6px] rounded-[3px] border overflow-hidden shadow-inner"
                        >
                          <div
                            className={`h-full ${isColorSplit ? 'cw-active-row-gradient' : ''}`}
                            style={{
                              width: `${
                                nowPlayingMode === 'volume' ? volumeFillPct : progressPct
                              }%`,
                              backgroundColor: screenPalette.highlightBgHex,
                            }}
                          />
                        </div>
                        {/* Iconic Diamond Cursor on Scrubber Bar */}
                        <div
                          id="cw-diamond-scrubber-cursor"
                          aria-hidden="true"
                          style={{
                            left: `clamp(5px, ${
                              nowPlayingMode === 'volume' ? volumeFillPct : progressPct
                            }%, calc(100% - 5px))`,
                            borderColor: screenPalette.highlightBgHex,
                            backgroundColor: screenPalette.highlightInkHex,
                          }}
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                            nowPlayingMode === 'scrub' ? 'w-[9px] h-[9px]' : 'w-[7.5px] h-[7.5px]'
                          } rotate-45 border shadow-[0_1px_2px_rgba(0,0,0,0.28)] pointer-events-none transition-transform`}
                        />
                      </div>
                    )}

                    <div
                      style={{ color: screenPalette.subInk }}
                      className={`${screenTypeClass} flex items-center justify-between font-semibold tabular-nums`}
                    >
                      <span id="cw-elapsed-time" style={{ fontSize: 'clamp(7px, 1.65cqh, 9.5px)' }}>
                        {elapsedLabel}
                      </span>
                      <span
                        style={{
                          fontSize: 'clamp(6.5px, 1.45cqh, 8.5px)',
                          color:
                            nowPlayingMode !== 'default'
                              ? screenPalette.highlightBgHex
                              : screenPalette.faintInk,
                        }}
                        className="font-semibold"
                      >
                        {nowPlayingMode === 'scrub'
                          ? '◆ Scrubbing'
                          : nowPlayingMode === 'volume'
                            ? `Volume ${Math.round(volume * 100)}%`
                            : nowPlayingMode === 'rating'
                              ? `Rating ${starRating}/5`
                              : shuffleEnabled || repeatOne
                                ? `${shuffleEnabled ? 'Shuffle' : ''}${
                                    shuffleEnabled && repeatOne ? ' · ' : ''
                                  }${repeatOne ? 'Repeat 1' : ''}`
                                : 'Center: Mode'}
                      </span>
                      <span id="cw-remaining-time" style={{ fontSize: 'clamp(7px, 1.65cqh, 9.5px)' }}>
                        {remainingLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PANE 2: SYNCED LYRICS */}
                <div
                  id="cw-pane-lyrics"
                  className="w-full min-w-full shrink-0 h-full flex flex-col min-h-0 overflow-hidden"
                >
                  <SyncedLyricsPanel
                    track={track}
                    isStandby={isStandby}
                    isPlaying={isPlaying}
                    isDocumentHidden={isDocumentHidden}
                    lowPowerMode={lowPowerMode}
                    nightMode={nightMode}
                    prefersReducedMotion={prefersReducedMotion}
                    themePalette={themePalette}
                    themeId="click-wheel"
                    clickWheelGen={generation}
                    onSeek={onSeek}
                    className="flex-1 min-h-0 h-full"
                  />
                </div>

                {/* PANE 3: SETTINGS */}
                <div
                  id="cw-pane-settings"
                  className="w-full min-w-full shrink-0 h-full flex flex-col justify-evenly px-[3cqw] py-[1cqh] min-h-0 overflow-y-auto gap-1"
                >
                  <button
                    id="btn-cw-settings-gen"
                    type="button"
                    onClick={handleCycleGeneration}
                    style={{
                      borderColor: screenPalette.borderHex,
                      backgroundColor: screenPalette.cardBgHex,
                      color: screenPalette.ink,
                    }}
                    className={`${screenTypeClass} w-full px-2 py-1 rounded-[4px] border flex items-center justify-between gap-1 font-semibold cursor-pointer shrink-0`}
                  >
                    <span style={{ fontSize: 'clamp(7.5px, 1.7cqh, 9.5px)' }}>Model</span>
                    <span
                      style={{
                        fontSize: 'clamp(7.5px, 1.65cqh, 9px)',
                        color: isColorSplit ? '#007AFF' : screenPalette.subInk,
                      }}
                      className="inline-flex items-center gap-0.5 truncate"
                    >
                      {generationSpec.shortLabel} ›
                    </span>
                  </button>

                  <div className="grid grid-cols-2 gap-1 shrink-0">
                    <button
                      id="toggle-shuffle"
                      type="button"
                      aria-pressed={shuffleEnabled}
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
                        onToggleShuffle();
                      }}
                      style={
                        shuffleEnabled
                          ? {
                              backgroundColor: screenPalette.highlightBgHex,
                              borderColor: screenPalette.highlightBgHex,
                              color: screenPalette.highlightInkHex,
                            }
                          : {
                              backgroundColor: screenPalette.cardBgHex,
                              borderColor: screenPalette.borderHex,
                              color: screenPalette.ink,
                            }
                      }
                      className={`${screenTypeClass} px-1.5 py-0.5 rounded-[4px] border flex items-center justify-between gap-1 font-semibold cursor-pointer ${
                        shuffleEnabled && isColorSplit ? 'cw-active-row-gradient' : ''
                      }`}
                    >
                      <span
                        className="inline-flex items-center gap-0.5 truncate"
                        style={{ fontSize: 'clamp(7px, 1.6cqh, 9px)' }}
                      >
                        <Shuffle className="w-2.5 h-2.5 shrink-0" />
                        Shuf
                      </span>
                      <span style={{ fontSize: 'clamp(7px, 1.6cqh, 9px)' }}>
                        {shuffleEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    <button
                      id="toggle-repeat"
                      type="button"
                      aria-pressed={repeatOne}
                      onClick={() => {
                        triggerButtonHaptic(lowPowerMode);
                        retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
                        onToggleRepeatOne();
                      }}
                      style={
                        repeatOne
                          ? {
                              backgroundColor: screenPalette.highlightBgHex,
                              borderColor: screenPalette.highlightBgHex,
                              color: screenPalette.highlightInkHex,
                            }
                          : {
                              backgroundColor: screenPalette.cardBgHex,
                              borderColor: screenPalette.borderHex,
                              color: screenPalette.ink,
                            }
                      }
                      className={`${screenTypeClass} px-1.5 py-0.5 rounded-[4px] border flex items-center justify-between gap-1 font-semibold cursor-pointer ${
                        repeatOne && isColorSplit ? 'cw-active-row-gradient' : ''
                      }`}
                    >
                      <span
                        className="inline-flex items-center gap-0.5 truncate"
                        style={{ fontSize: 'clamp(7px, 1.6cqh, 9px)' }}
                      >
                        <Repeat1 className="w-2.5 h-2.5 shrink-0" />
                        Rep
                      </span>
                      <span style={{ fontSize: 'clamp(7px, 1.6cqh, 9px)' }}>
                        {repeatOne ? '1' : 'OFF'}
                      </span>
                    </button>
                  </div>

                  <div
                    style={{
                      backgroundColor: screenPalette.cardBgHex,
                      borderColor: screenPalette.borderHex,
                    }}
                    className="flex flex-col gap-1 rounded-[5px] border px-2 py-1 shrink-0"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div
                        style={{ color: screenPalette.ink }}
                        className={`${screenTypeClass} flex items-center justify-between font-semibold`}
                      >
                        <span style={{ fontSize: 'clamp(7px, 1.65cqh, 9px)' }}>Volume</span>
                        <span
                          style={{
                            fontSize: 'clamp(7px, 1.65cqh, 9px)',
                            color: isColorSplit ? '#007AFF' : screenPalette.ink,
                          }}
                          className="tabular-nums"
                        >
                          {Math.round(volume * 100)}%
                        </span>
                      </div>
                      <div
                        id="vertical-volume-slider"
                        ref={volumeTrackRef}
                        role="slider"
                        tabIndex={0}
                        aria-label="Volume Level"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(volume * 100)}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                          handleVolumePointer(e.clientX);
                        }}
                        onPointerMove={(e) => {
                          if (e.buttons !== 1) return;
                          handleVolumePointer(e.clientX);
                        }}
                        className="relative w-full h-[11px] flex items-center cursor-pointer touch-none"
                      >
                        <div className="w-full h-[4px] rounded-full bg-black/15 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isColorSplit ? 'cw-active-row-gradient' : ''
                            }`}
                            style={{
                              width: `${volumeFillPct}%`,
                              backgroundColor: screenPalette.highlightBgHex,
                            }}
                          />
                        </div>
                        <div
                          aria-hidden="true"
                          style={{
                            left: `clamp(5px, ${volumeFillPct}%, calc(100% - 5px))`,
                            borderColor: screenPalette.borderHex,
                          }}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[8.5px] h-[8.5px] rounded-full bg-white border shadow-sm pointer-events-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <div
                        style={{ color: screenPalette.ink }}
                        className={`${screenTypeClass} flex items-center justify-between font-semibold`}
                      >
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ fontSize: 'clamp(7px, 1.65cqh, 9px)' }}
                        >
                          <SlidersHorizontal className="w-2.5 h-2.5 opacity-70" />
                          Pitch
                        </span>
                        <span
                          style={{
                            fontSize: 'clamp(7px, 1.65cqh, 9px)',
                            color: isColorSplit ? '#007AFF' : screenPalette.ink,
                          }}
                          className="tabular-nums"
                        >
                          {pitchPercent > 0 ? `+${pitchPercent}%` : `${pitchPercent}%`}
                        </span>
                      </div>
                      <div
                        id="vertical-pitch-slider"
                        ref={pitchTrackRef}
                        role="slider"
                        tabIndex={0}
                        aria-label="Playback Pitch"
                        aria-valuemin={-12}
                        aria-valuemax={12}
                        aria-valuenow={pitchPercent}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                          handlePitchPointer(e.clientX);
                        }}
                        onPointerMove={(e) => {
                          if (e.buttons !== 1) return;
                          handlePitchPointer(e.clientX);
                        }}
                        onDoubleClick={() => onChangePitch(0)}
                        className="relative w-full h-[11px] flex items-center cursor-pointer touch-none"
                      >
                        <div className="w-full h-[4px] rounded-full bg-black/15 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isColorSplit ? 'cw-active-row-gradient' : ''
                            }`}
                            style={{
                              width: `${pitchFillPct}%`,
                              backgroundColor: screenPalette.highlightBgHex,
                            }}
                          />
                        </div>
                        <div
                          aria-hidden="true"
                          style={{
                            left: `clamp(5px, ${pitchFillPct}%, calc(100% - 5px))`,
                            borderColor: screenPalette.borderHex,
                          }}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[8.5px] h-[8.5px] rounded-full bg-white border shadow-sm pointer-events-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 shrink-0">
                    <button
                      type="button"
                      aria-pressed={nightMode}
                      onClick={() => {
                        retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
                        onToggleNightMode();
                      }}
                      style={
                        nightMode
                          ? {
                              backgroundColor: screenPalette.highlightBgHex,
                              borderColor: screenPalette.highlightBgHex,
                              color: screenPalette.highlightInkHex,
                            }
                          : {
                              backgroundColor: screenPalette.cardBgHex,
                              borderColor: screenPalette.borderHex,
                              color: screenPalette.subInk,
                            }
                      }
                      className={`${screenTypeClass} flex-1 px-1.5 py-0.5 rounded-[4px] border font-semibold cursor-pointer ${
                        nightMode && isColorSplit ? 'cw-active-row-gradient' : ''
                      }`}
                    >
                      <span style={{ fontSize: 'clamp(7px, 1.55cqh, 9px)' }}>
                        Night {nightMode ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    <button
                      id="toggle-eco"
                      type="button"
                      aria-pressed={lowPowerMode}
                      onClick={() => {
                        retroAudio.triggerClickWheelTick(false, generationSpec.soundProfile);
                        onToggleLowPowerMode();
                      }}
                      style={
                        lowPowerMode
                          ? {
                              backgroundColor: screenPalette.highlightBgHex,
                              borderColor: screenPalette.highlightBgHex,
                              color: screenPalette.highlightInkHex,
                            }
                          : {
                              backgroundColor: screenPalette.cardBgHex,
                              borderColor: screenPalette.borderHex,
                              color: screenPalette.subInk,
                            }
                      }
                      className={`${screenTypeClass} flex-1 px-1.5 py-0.5 rounded-[4px] border font-semibold cursor-pointer ${
                        lowPowerMode && isColorSplit ? 'cw-active-row-gradient' : ''
                      }`}
                    >
                      <span style={{ fontSize: 'clamp(7px, 1.55cqh, 9px)' }}>
                        Eco {lowPowerMode ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lower Half: Mechanical Grooved Wheel + 4 Crescent Buttons (Gen 1) OR Capacitive Wheel (Gen 2 / Classic / Nano) */}
        <div className="relative z-20 flex-1 w-full flex items-center justify-center py-[1cqh] px-[5cqw]">
          {isGen1 ? (
            <div
              id="cw-gen1-static-ring"
              role="region"
              aria-label="Gen 1 Crescent Control Ring with Rotating Mechanical Scroll Wheel"
              style={{
                width: 'min(78cqw, 40cqh)',
                height: 'min(78cqw, 40cqh)',
              }}
              className="cw-gen1-crescent-ring relative rounded-full flex items-center justify-center select-none"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                className="pointer-events-none absolute inset-0 w-full h-full z-10"
              >
                {[45, 135, 225, 315].map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  const x1 = 50 + Math.cos(rad) * 31.2;
                  const y1 = 50 + Math.sin(rad) * 31.2;
                  const x2 = 50 + Math.cos(rad) * 49.6;
                  const y2 = 50 + Math.sin(rad) * 49.6;
                  return (
                    <g key={deg}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#B0B6C0"
                        strokeWidth="0.9"
                        strokeLinecap="round"
                      />
                      <line
                        x1={x1 + 0.45}
                        y1={y1 + 0.45}
                        x2={x2 + 0.45}
                        y2={y2 + 0.45}
                        stroke="rgba(255,255,255,0.88)"
                        strokeWidth="0.65"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}
              </svg>

              {renderWheelCardinalButtons()}

              <div
                id="cw-wheel-ring"
                ref={wheelRingRef}
                data-wheel-mode="mechanical"
                data-wheel-angle={Math.round(mechanicalWheelDeg)}
                data-no-drawer-swipe="true"
                role="region"
                aria-label="Mechanical Rotating Scroll Wheel — Drag circularly with 15-degree detents"
                onPointerDown={handleWheelPointerDown}
                onPointerMove={handleWheelPointerMove}
                onPointerUp={handleWheelPointerUp}
                style={{
                  width: '62%',
                  height: '62%',
                  touchAction: 'none',
                  transform: `rotate(${mechanicalWheelDeg}deg)`,
                }}
                className="cw-wheel-ring cw-mech-wheel-grooves relative z-10 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-[9%] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-[#6E747D]/60 shadow-[inset_0_1px_1px_rgba(0,0,0,0.3)]"
                />
              </div>

              <button
                id="btn-center-select"
                ref={centerBtnRef}
                type="button"
                data-pressed={stutterPulseActive ? 'true' : 'false'}
                title="Click to select or switch view · Double-click for Skip-Stutter"
                aria-label="Center Select (Double-press for Skip-Stutter)"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCenterSelectClick();
                }}
                style={{ width: '32%', height: '32%' }}
                className="cw-center-select-btn absolute z-20 rounded-full flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
              >
                <span className="sr-only">Select</span>
              </button>
            </div>
          ) : (
            <div
              id="cw-wheel-ring"
              ref={wheelRingRef}
              data-wheel-mode="touch"
              data-wheel-angle={0}
              data-no-drawer-swipe="true"
              role="region"
              aria-label="Touch Click Wheel — Drag circularly to scroll or scrub, tap cardinal directions"
              onPointerDown={handleWheelPointerDown}
              onPointerMove={handleWheelPointerMove}
              onPointerUp={handleWheelPointerUp}
              style={{
                width: isNano ? 'min(84cqw, 36cqh)' : 'min(74cqw, 38cqh)',
                height: isNano ? 'min(84cqw, 36cqh)' : 'min(74cqw, 38cqh)',
                touchAction: 'none',
              }}
              className={`${
                isDarkAnodized
                  ? 'cw-wheel-ring-dark'
                  : isGen2
                    ? 'cw-wheel-ring-gen2'
                    : 'cw-wheel-ring'
              } relative rounded-full flex items-center justify-center select-none`}
            >
              {renderWheelCardinalButtons()}

              <button
                id="btn-center-select"
                ref={centerBtnRef}
                type="button"
                data-pressed={stutterPulseActive ? 'true' : 'false'}
                title="Click to select or switch view · Double-click for Skip-Stutter"
                aria-label="Center Select (Double-press for Skip-Stutter)"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCenterSelectClick();
                }}
                style={{ width: '36%', height: '36%' }}
                className={`${
                  isDarkAnodized
                    ? 'cw-center-select-btn cw-center-select-btn-dark'
                    : 'cw-center-select-btn'
                } relative z-10 rounded-full flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]`}
              >
                <span className="sr-only">Select</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <section
      aria-label="Interactive iPod Hi-Fi Workspace"
      data-viewport-layout={viewportLayout}
      data-cw-generation={generation}
      data-cw-finish={generationSpec.supportsFinishToggle ? gen3Finish : 'white'}
      className="relative w-full h-full flex-1 min-h-0 flex flex-col justify-between overflow-hidden"
    >
      {/* Hidden SVG Filter providing true 1-bit discrete thresholding on remote/CORS artwork for Gen 1 */}
      <svg aria-hidden="true" className="absolute w-0 h-0 overflow-hidden">
        <defs>
          <filter id="cw-gen1-1bit-filter" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="discrete" tableValues="0.09 0.78" />
              <feFuncG type="discrete" tableValues="0.13 0.83" />
              <feFuncB type="discrete" tableValues="0.08 0.71" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      {/* Apple Studio Diffused Radial Gradient Backdrop + Ambient Floor Grounding Shadow */}
      <div
        id="cw-stage-environment"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden select-none z-0"
      >
        <div className="cw-studio-wall absolute inset-0" />
        <div className="cw-studio-floor-shadow absolute inset-x-0 bottom-0 h-[36%]" />
      </div>

      <div
        id="cw-player-stage"
        ref={stageRef}
        data-device-only={isDeviceOnlyMode ? 'true' : 'false'}
        onClick={() => {
          if (isDeviceOnlyMode && onToggleDeviceOnlyMode) {
            onToggleDeviceOnlyMode();
          }
        }}
        className="relative z-10 w-full h-full flex-1 min-h-0 overflow-hidden"
      >
        {isDeviceOnlyMode ? (
          /* =================================================================
             UNIVERSAL DEVICE-ONLY PURE FOCUS MODE (Desktop, Landscape & Mobile)
             ================================================================= */
          <div
            id="cw-device-only-stage"
            data-testid="cw-device-only-stage"
            className="cw-device-only-stage"
          >
            {renderIpodHardwareUnit()}
          </div>
        ) : isMobilePortrait ? (
          /* =================================================================
             MOBILE VERTICAL PORTRAIT (`max-width: 767px AND orientation: portrait`)
             1. Top: Enlarged 94%-Width 2011 Apple iMac Display
             2. Middle: Horizontally Centered Aspect-Locked iPod (`0.608:1` / `0.43:1`) + Horizontal Swipe Switching
             3. Bottom: Flush Single-Row Generation Pills + Finish/Nano Color Swatches
             ================================================================= */
          <div
            id="cw-mobile-stacked-stage"
            className="relative w-full h-full flex flex-col items-center justify-between pt-[calc(env(safe-area-inset-top,0px)+8px)] px-2.5 gap-1.5 overflow-hidden"
          >
            {/* 1. Top Section: Enlarged 94%-Width 2011 Apple iMac Display */}
            <ClickWheelImacBackdrop
              metrics={mobileLayout}
              isMobilePortrait={true}
              isPlaying={isPlaying}
              isDocumentHidden={isDocumentHidden}
              trackTitle={isStandby ? 'Standby' : track.title}
              trackArtist={isStandby ? 'Spotify' : track.artist}
              trackArtworkUrl={track.artworkUrl}
              youtubeVideoId={track.youtubeVideoId}
              youtubeCandidateIds={imacYoutubeCandidates}
              tracks={tracks}
              activeTrackId={track.id}
              playlistName={playlistName}
              onSelectTrack={onSelectTrack}
              openApp={openImacApp}
              onToggleApp={setOpenImacApp}
              onOpenSettingsPane={() => setOpenImacApp((cur) => (cur === 'prefs' ? 'none' : 'prefs'))}
              onCycleGeneration={handleCycleGeneration}
              renderLibraryWindowContent={renderImacLibraryWindow}
              renderVideoWindowContent={renderImacVideoWindow}
              volume={volume}
              onChangeVolume={onChangeVolume}
              shuffleEnabled={shuffleEnabled}
              onToggleShuffle={onToggleShuffle}
              repeatOne={repeatOne}
              onToggleRepeatOne={onToggleRepeatOne}
              lowPowerMode={lowPowerMode}
              onToggleLowPowerMode={onToggleLowPowerMode}
              nightMode={nightMode}
              onToggleNightMode={onToggleNightMode}
              hideBoxArt={hideBoxArt}
              onToggleHideBoxArt={onToggleHideBoxArt}
              onToggleDeviceOnlyMode={onToggleDeviceOnlyMode}
            />

            {/* 2. Centered Aspect-Locked iPod Hardware Unit (Swipe Left/Right to Cycle Generations) */}
            <div
              id="cw-mobile-lower-stage"
              data-no-drawer-swipe="true"
              onPointerDown={handleMobileStagePointerDown}
              onPointerUp={handleMobileStagePointerUp}
              onPointerCancel={handleMobileStagePointerCancel}
              style={{ touchAction: 'pan-y' }}
              className="relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden"
            >
              {onToggleDeviceOnlyMode && (
                <button
                  id="cw-device-only-btn"
                  type="button"
                  aria-label="Enter Device-Only Pure Focus Mode"
                  title="Device-Only Mode"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDeviceOnlyMode();
                  }}
                  className="cw-dock-recessed-btn absolute top-1 right-1 z-30 h-[24px] px-2 rounded-full inline-flex items-center gap-1 text-[9px] font-semibold text-[#6E6E73] hover:text-[#1D1D1F] cursor-pointer"
                >
                  <Smartphone className="w-2.5 h-2.5 shrink-0" />
                  <span>Focus</span>
                </button>
              )}
              <div className="mx-auto flex items-center justify-center">
                {renderIpodHardwareUnit()}
              </div>
            </div>

            {/* 3. Flush Single-Row Bottom Switcher (Generation Pills Left + Color Swatches Right) */}
            <div
              id="cw-mobile-bottom-controls"
              data-testid="cw-mobile-bottom-controls"
              data-no-drawer-swipe="true"
              aria-label="iPod Mobile Switcher & Colorway Controls"
              style={{
                padding: '8px 12px calc(env(safe-area-inset-bottom, 0px) + 6px)',
              }}
              className="cw-mobile-bottom-controls w-full max-w-[430px] shrink-0 bg-white/88 border border-[#C8CDD5] rounded-[14px] shadow-[0_3px_10px_rgba(15,23,42,0.08)] flex items-center justify-between gap-1.5 flex-nowrap whitespace-nowrap overflow-x-auto"
            >
              {/* Left Side: 4 Generation Pills */}
              <div className="flex items-center gap-1 flex-nowrap shrink-0">
                {CLICK_WHEEL_GENERATION_ORDER.map((genId) => {
                  const spec = CLICK_WHEEL_GENERATIONS[genId];
                  const active = generation === genId;
                  return (
                    <button
                      key={genId}
                      id={`btn-cw-gen-${genId}`}
                      type="button"
                      data-cw-gen-btn={genId}
                      data-active={active ? 'true' : 'false'}
                      aria-pressed={active}
                      onClick={() => handleSelectGeneration(genId)}
                      className="cw-dock-recessed-btn h-[23px] px-1.5 rounded-full flex items-center gap-1 text-[8px] font-semibold text-[#1D1D1F] shrink-0 cursor-pointer whitespace-nowrap"
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          backgroundColor: active ? APPLE_AQUA_ACTIVE_BLUE_HEX : '#CBD5E1',
                        }}
                        className="w-[4.5px] h-[4.5px] rounded-full shrink-0"
                      />
                      <span>{spec.dockButtonLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right Side (Same Row): Finish / 7 Nano Colorway Swatches */}
              {isNano ? (
                <div
                  id="cw-nano-color-selector"
                  data-testid="cw-nano-color-selector"
                  role="group"
                  aria-label="iPod Nano 7-Color Palette"
                  className="flex items-center gap-1 flex-nowrap shrink-0"
                >
                  {IPOD_NANO_7_COLORS.map((swatch) => {
                    const active = nanoColor === swatch.id;
                    return (
                      <button
                        key={swatch.id}
                        id={`btn-cw-nano-color-${swatch.id}`}
                        data-nano-color={swatch.id}
                        data-active={active ? 'true' : 'false'}
                        type="button"
                        aria-label={`Nano ${swatch.label}`}
                        title={swatch.label}
                        aria-pressed={active}
                        onClick={() => handleSelectNanoColor(swatch.id)}
                        style={{
                          backgroundColor: swatch.swatchHex,
                          boxShadow: active
                            ? `0 0 0 1px #FFFFFF, 0 0 0 2px ${APPLE_AQUA_ACTIVE_BLUE_HEX}`
                            : 'inset 0 1px 1px rgba(255,255,255,0.45), 0 1px 2px rgba(0,0,0,0.2)',
                        }}
                        className="w-[13px] h-[13px] rounded-full border border-black/25 cursor-pointer shrink-0"
                      />
                    );
                  })}
                </div>
              ) : generationSpec.supportsFinishToggle ? (
                <div
                  id="cw-dock-finish-ordered-row"
                  className="flex items-center gap-1 flex-nowrap shrink-0"
                >
                  <button
                    id="btn-cw-finish-official-white"
                    type="button"
                    aria-label="Classic White finish"
                    title="White"
                    data-active={gen3Finish === 'official-white' ? 'true' : 'false'}
                    onClick={() => handleSelectFinish('official-white')}
                    style={{
                      boxShadow:
                        gen3Finish === 'official-white'
                          ? `0 0 0 1px #FFFFFF, 0 0 0 2px ${APPLE_AQUA_ACTIVE_BLUE_HEX}`
                          : undefined,
                    }}
                    className="w-[15px] h-[15px] rounded-full bg-[#FFFFFF] border border-[#CBD5E1] cursor-pointer shrink-0"
                  />
                  <button
                    id="btn-cw-finish-white"
                    type="button"
                    aria-label="Classic Silver finish"
                    title="Silver"
                    data-active={gen3Finish === 'white' ? 'true' : 'false'}
                    onClick={() => handleSelectFinish('white')}
                    style={{
                      boxShadow:
                        gen3Finish === 'white'
                          ? `0 0 0 1px #FFFFFF, 0 0 0 2px ${APPLE_AQUA_ACTIVE_BLUE_HEX}`
                          : undefined,
                    }}
                    className="w-[15px] h-[15px] rounded-full bg-[#E5E7EB] border border-[#9CA3AF] cursor-pointer shrink-0"
                  />
                  <button
                    id="btn-cw-finish-black"
                    type="button"
                    aria-label="Classic Dark Grey finish"
                    title="Dark Grey"
                    data-active={gen3Finish === 'black' ? 'true' : 'false'}
                    onClick={() => handleSelectFinish('black')}
                    style={{
                      boxShadow:
                        gen3Finish === 'black'
                          ? `0 0 0 1px #FFFFFF, 0 0 0 2px ${APPLE_AQUA_ACTIVE_BLUE_HEX}`
                          : undefined,
                    }}
                    className="w-[15px] h-[15px] rounded-full bg-[#33363E] border border-black/50 cursor-pointer shrink-0"
                  />
                </div>
              ) : (
                <span className="text-[8px] font-semibold text-[#6E6E73] px-1 shrink-0 whitespace-nowrap">
                  {generationSpec.dockButtonLabel}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* =================================================================
             DESKTOP & LANDSCAPE: SWAPPED SPLIT-STAGE WORKSPACE ARCHITECTURE
             - Left Stage (`width: ~65%`): 2011 Apple iMac + Enlarged Hi-Fi Speaker Dock
             - Right Stage (`width: ~35%`): Active iPod (`0.608` or `0.43` Nano) + 14 Half-Size iPod-Shaped Playlist Cards
             ================================================================= */
          <div
            id="cw-desktop-asymmetric-stage"
            className="relative w-full h-full flex items-stretch justify-between overflow-hidden"
          >
            {/* Optional Minimal Monochrome Focus Toggle Button (Hidden when Device-Only is Active) */}
            {onToggleDeviceOnlyMode && (
              <button
                id="cw-device-only-btn"
                type="button"
                aria-label="Enter Device-Only Pure Focus Mode"
                title="Device-Only Mode"
                onClick={onToggleDeviceOnlyMode}
                className="cw-dock-recessed-btn absolute top-3 right-3 z-40 px-2.5 py-1 rounded-full inline-flex items-center gap-1 text-[10px] font-semibold text-[#6E6E73] hover:text-[#1D1D1F] cursor-pointer"
              >
                <Smartphone className="w-3 h-3" />
                <span>Device Only</span>
              </button>
            )}

            {/* LEFT STAGE (`width: ~65%` of viewport) */}
            <div
              id="cw-left-stage-column"
              style={{
                width: `${desktopLayout.leftStageWidthPx}px`,
                paddingTop: `${desktopLayout.imacTopPx}px`,
              }}
              className="relative z-20 h-full pl-5 pr-3 pb-3 flex flex-col items-center justify-between shrink-0"
            >
              {/* Left-Stage Full-Height 2011 Apple iMac Display */}
              <ClickWheelImacBackdrop
                metrics={desktopLayout}
                isMobilePortrait={false}
                isPlaying={isPlaying}
                isDocumentHidden={isDocumentHidden}
                trackTitle={isStandby ? 'Standby' : track.title}
                trackArtist={isStandby ? 'Spotify' : track.artist}
                trackArtworkUrl={track.artworkUrl}
                youtubeVideoId={track.youtubeVideoId}
                youtubeCandidateIds={imacYoutubeCandidates}
                tracks={tracks}
                activeTrackId={track.id}
                playlistName={playlistName}
                onSelectTrack={onSelectTrack}
                openApp={openImacApp}
                onToggleApp={setOpenImacApp}
                onOpenSettingsPane={() => setOpenImacApp((cur) => (cur === 'prefs' ? 'none' : 'prefs'))}
                onCycleGeneration={handleCycleGeneration}
                renderLibraryWindowContent={renderImacLibraryWindow}
                renderVideoWindowContent={renderImacVideoWindow}
                volume={volume}
                onChangeVolume={onChangeVolume}
                shuffleEnabled={shuffleEnabled}
                onToggleShuffle={onToggleShuffle}
                repeatOne={repeatOne}
                onToggleRepeatOne={onToggleRepeatOne}
                lowPowerMode={lowPowerMode}
                onToggleLowPowerMode={onToggleLowPowerMode}
                nightMode={nightMode}
                onToggleNightMode={onToggleNightMode}
                hideBoxArt={hideBoxArt}
                onToggleHideBoxArt={onToggleHideBoxArt}
                onToggleDeviceOnlyMode={onToggleDeviceOnlyMode}
              />

              {/* Apple iPod Hi-Fi Speaker Dock Directly Below iMac + Wired EarPods */}
              <div className="relative w-full flex flex-col items-center justify-end shrink-0">
                <ClickWheelHifiDock
                  dockW={desktopLayout.dockW}
                  dockH={desktopLayout.dockH}
                  dockScale={desktopLayout.dockScale}
                  adapterCollarWidthPx={desktopLayout.adapterCollarWidthPx}
                  isMobilePortrait={false}
                  isPlaying={isPlaying}
                  activeLoopsEnabled={activeLoopsEnabled}
                  isStandby={isStandby}
                  prefersReducedMotion={prefersReducedMotion}
                  generation={generation}
                  gen3Finish={gen3Finish}
                  nanoColor={nanoColor}
                  activePane={activePane}
                  volumePct={Math.round(volume * 100)}
                  unitEjecting={unitSwapPhase === 'ejecting-up'}
                  ipodScaleMode={ipodScaleMode}
                  grilleRef={grilleRef}
                  onSelectGeneration={handleSelectGeneration}
                  onSelectFinish={handleSelectFinish}
                  onSelectNanoColor={handleSelectNanoColor}
                  onSelectUtilityPane={handleDockUtilitySelect}
                  onStepVolume={stepDockVolume}
                  onToggleScaleMode={handleToggleScaleMode}
                />

                <ClickWheelEarbuds
                  isPlaying={isPlaying}
                  activeLoopsEnabled={activeLoopsEnabled}
                  prefersReducedMotion={prefersReducedMotion}
                  trackPulseKey={trackPulseKey}
                  dockWidthScaledPx={Math.round(desktopLayout.dockW * desktopLayout.dockScale)}
                  dockHeightPx={desktopLayout.dockH}
                  isMobilePortrait={false}
                />
              </div>
            </div>

            {/* RIGHT STAGE (`width: ~35%` of viewport): Active iPod + 14 Half-Size iPod-Shaped Playlist Cards */}
            <div
              id="cw-right-ipod-column"
              style={{
                width: `${desktopLayout.rightStageWidthPx}px`,
                perspective: '1200px',
                transformStyle: 'preserve-3d',
              }}
              className="relative z-20 h-full pt-[20px] pb-3 pr-4 pl-1 flex items-center justify-center shrink-0 overflow-visible"
            >
              {/* Active iPod Hardware Unit Centered Vertically & Horizontally (Strictly Uncovered at z-30) */}
              <div
                id="cw-right-ipod-slot"
                style={{ zIndex: 30 }}
                className="relative z-30 flex items-center justify-center mx-auto shrink-0"
              >
                {renderIpodHardwareUnit()}
              </div>

              {/* 14 Half-Size (34x56, 0.608:1) Solid-Surface iPod-Shaped Floating Playlist Cards */}
              <div
                id="cw-ambient-playlist-field"
                aria-label="Orbiting Half-Size iPod-Shaped Playlist Cards"
                aria-hidden={hideBoxArt ? 'true' : undefined}
                style={{
                  opacity: hideBoxArt ? 0 : 1,
                  transform: `scale(${hideBoxArt ? 0.94 : 1})`,
                  perspective: '1200px',
                  transformStyle: 'preserve-3d',
                  transition: prefersReducedMotion
                    ? 'none'
                    : 'opacity 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                {ambientCardSlots.map((slot) => {
                  const slotTrack = slot.track;
                  const isHolderSlot = slot.slotIndex === 0;
                  const slotArt = slotTrack
                    ? resolveActiveArtworkState(slotTrack, 0).activeUrl
                    : '';
                  const slotTitle = slotTrack
                    ? slotTrack.title
                    : isStandby
                      ? 'No Playlist'
                      : track.title;
                  const slotArtist = slotTrack
                    ? slotTrack.artist
                    : isStandby
                      ? 'Connect Spotify'
                      : track.artist;
                  const isSlotActive = Boolean(slotTrack && slotTrack.id === track.id);
                  const initPose = computeOrbitingVerticalCard3DPose(
                    slot.slotIndex,
                    0,
                    ambientCardSlots.length
                  );

                  const cardTransform = isHolderSlot
                    ? `translate3d(calc(${holderOffset.x}px + var(--cw-orb-x, ${initPose.translateXPx}px)), calc(${holderOffset.y}px + var(--cw-orb-y, ${initPose.translateYPx}px)), var(--cw-orb-z, ${initPose.translateZPx}px)) rotateX(var(--cw-orb-rx, ${initPose.rotateXDeg}deg)) rotateY(var(--cw-orb-ry, ${initPose.rotateYDeg}deg)) rotateZ(${
                        isDraggingHolder
                          ? `${holderTiltDeg}deg`
                          : `var(--cw-orb-rz, ${initPose.rotateZDeg}deg)`
                      }) scale(var(--cw-orb-scale, ${initPose.scale}))`
                    : `translate3d(var(--cw-orb-x, ${initPose.translateXPx}px), var(--cw-orb-y, ${initPose.translateYPx}px), var(--cw-orb-z, ${initPose.translateZPx}px)) rotateX(var(--cw-orb-rx, ${initPose.rotateXDeg}deg)) rotateY(var(--cw-orb-ry, ${initPose.rotateYDeg}deg)) rotateZ(var(--cw-orb-rz, ${initPose.rotateZDeg}deg)) scale(var(--cw-orb-scale, ${initPose.scale}))`;

                  return (
                    <div
                      key={`ambient-card-slot-${slot.slotIndex}`}
                      ref={(node) => {
                        cardParallaxRefs.current[slot.slotIndex] = node;
                      }}
                      id={
                        isHolderSlot
                          ? 'album-art-holder-box'
                          : `cw-ambient-card-${slot.slotIndex}`
                      }
                      data-ambient-card-side={slot.side}
                      data-ambient-card-slot={slot.slotIndex}
                      data-card-orientation="vertical-portrait"
                      data-card-aspect-ratio={VERTICAL_PLAYLIST_CARD_SPEC.aspectRatioCss}
                      data-card-orbit-mode="elliptical-3d"
                      data-card-shape="ipod-silhouette"
                      data-card-scale="0.5"
                      role={isHolderSlot ? 'region' : 'button'}
                      tabIndex={isHolderSlot ? undefined : 0}
                      aria-label={
                        isHolderSlot
                          ? 'Draggable Active Playlist Card'
                          : `Select ${slotTitle} by ${slotArtist}`
                      }
                      title={
                        isHolderSlot
                          ? 'Drag playlist card (double-click to hide artwork)'
                          : `Play ${slotTitle} — ${slotArtist} (double-click to hide artwork)`
                      }
                      onPointerDown={isHolderSlot ? handleHolderPointerDown : undefined}
                      onPointerMove={isHolderSlot ? handleHolderPointerMove : undefined}
                      onPointerUp={isHolderSlot ? handleHolderPointerUp : undefined}
                      onPointerDownCapture={doubleTapHideArtBind.onPointerDownCapture}
                      onPointerUpCapture={doubleTapHideArtBind.onPointerUpCapture}
                      onDoubleClick={doubleTapHideArtBind.onDoubleClick}
                      onClick={
                        !isHolderSlot && slotTrack && onSelectTrack
                          ? () => {
                              triggerButtonHaptic(lowPowerMode);
                              retroAudio.triggerClickWheelTick(
                                true,
                                generationSpec.soundProfile
                              );
                              onSelectTrack(slotTrack.id);
                            }
                          : undefined
                      }
                      style={{
                        zIndex: initPose.zIndex,
                        transform: cardTransform,
                        opacity: 1,
                        marginLeft: `-${Math.round(VERTICAL_PLAYLIST_CARD_SPEC.cardWidthPx / 2)}px`,
                        marginTop: `-${Math.round(VERTICAL_PLAYLIST_CARD_SPEC.cardHeightPx / 2)}px`,
                        touchAction: isHolderSlot ? 'none' : undefined,
                      }}
                      className={`absolute left-1/2 top-1/2 ${
                        hideBoxArt ? 'pointer-events-none' : 'pointer-events-auto'
                      } select-none ${
                        isHolderSlot
                          ? 'cursor-grab active:cursor-grabbing'
                          : 'cursor-pointer'
                      }`}
                    >
                      {/* Sleek 50%-Scale Solid iPod-Silhouette Playlist Card (NO Click Wheel, NO Bezel) */}
                      <div
                        style={{
                          width: `${VERTICAL_PLAYLIST_CARD_SPEC.cardWidthPx}px`,
                          height: `${VERTICAL_PLAYLIST_CARD_SPEC.cardHeightPx}px`,
                          aspectRatio: VERTICAL_PLAYLIST_CARD_SPEC.aspectRatioCss,
                          borderRadius: `${VERTICAL_PLAYLIST_CARD_SPEC.borderRadiusPx}px`,
                          borderColor: isSlotActive ? '#007AFF' : '#D3D8E0',
                          backgroundColor: '#FFFFFF',
                          opacity: 1,
                        }}
                        className="cw-solid-mini-ipod-card p-[2.5px] flex flex-col justify-between overflow-hidden"
                      >
                        {/* Upper Portion: Clean Album Artwork */}
                        <div
                          style={{
                            borderRadius: `${VERTICAL_PLAYLIST_CARD_SPEC.artworkBorderRadiusPx}px`,
                          }}
                          className="relative w-full h-[30px] bg-[#ECEEF2] border border-[#D4D9E2]/80 overflow-hidden shrink-0"
                        >
                          {slotArt && !(isHolderSlot && artworkBroken) ? (
                            <img
                              src={slotArt}
                              alt=""
                              draggable={false}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#F2F4F8] text-[#8A8F98]">
                              <Disc3 className="w-3 h-3 opacity-80" />
                            </div>
                          )}
                        </div>

                        {/* Lower Portion: Crisp Song Title & Artist Name (No Mini Hardware Wheel) */}
                        <div className="flex-1 px-[2px] pt-[2px] pb-[1px] flex flex-col justify-center min-w-0 text-left">
                          <span className="font-sans text-[5.5px] font-bold text-[#1D1D1F] truncate leading-tight">
                            {slotTitle}
                          </span>
                          <span className="font-sans text-[4.8px] font-medium text-[#5B606B] truncate leading-tight">
                            {slotArtist}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
