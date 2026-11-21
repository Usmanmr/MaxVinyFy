import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Disc3,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Power,
  X,
} from 'lucide-react';
import { buildCleanYouTubeEmbedUrl, type TrackItem } from '../../utils/playerLogic';
import {
  formatWinampLcdTime,
  formatWin98SystemClock,
  buildWinampMarqueeText,
  formatWmp64StatusLabel,
  type Win98BootStage,
  type Win98PcPowerPhase,
  type Win98BsodPhase,
} from '../../utils/pcWinampLogic';

/* ============================================================================
   16-Color Crisp Pixel-Art Inline SVGs (1998 Windows 98 & WMP 6.4 Iconography)
   ============================================================================ */

const PixelMyComputerIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="w-full h-full">
    {/* Monitor Back & Bezel */}
    <rect x="2" y="1" width="12" height="9" fill="#808080" />
    <rect x="2" y="1" width="11" height="8" fill="#E2DDD0" />
    <rect x="3" y="2" width="9" height="6" fill="#000000" />
    <rect x="4" y="3" width="7" height="4" fill="#008080" />
    <rect x="4" y="3" width="2" height="1" fill="#80FFFF" />
    {/* Stand Neck */}
    <rect x="6" y="10" width="4" height="1" fill="#808080" />
    {/* Horizontal Desktop PC Case */}
    <rect x="1" y="11" width="14" height="4" fill="#808080" />
    <rect x="1" y="11" width="13" height="3" fill="#D4CEC0" />
    <rect x="9" y="12" width="4" height="1" fill="#404040" />
    <rect x="3" y="12" width="1" height="1" fill="#00E640" />
  </svg>
);

const PixelRecycleBinIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="w-full h-full">
    {/* Rim */}
    <rect x="3" y="2" width="10" height="2" fill="#E5E7EB" />
    <rect x="4" y="2" width="8" height="1" fill="#808080" />
    {/* Wire Mesh Basket */}
    <rect x="4" y="4" width="8" height="10" fill="#9CA3AF" />
    <rect x="5" y="4" width="6" height="9" fill="#D1D5DB" />
    <rect x="5" y="5" width="1" height="7" fill="#6B7280" />
    <rect x="7" y="5" width="1" height="7" fill="#6B7280" />
    <rect x="10" y="5" width="1" height="7" fill="#6B7280" />
    {/* Green Recycling Triangle */}
    <rect x="6" y="7" width="4" height="1" fill="#00A000" />
    <rect x="5" y="9" width="2" height="2" fill="#00C83C" />
    <rect x="9" y="9" width="2" height="2" fill="#00C83C" />
    <rect x="6" y="11" width="4" height="1" fill="#008000" />
  </svg>
);

const PixelWinampIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="w-full h-full">
    {/* Beveled Dark Metallic Badge */}
    <rect x="1" y="1" width="14" height="14" fill="#11131B" />
    <rect x="1" y="1" width="13" height="13" fill="#2A2D3D" />
    <rect x="2" y="2" width="12" height="12" fill="#1C1E29" />
    {/* Golden Jagged Lightning Bolt */}
    <rect x="8" y="3" width="3" height="2" fill="#FACC15" />
    <rect x="6" y="5" width="4" height="2" fill="#FACC15" />
    <rect x="5" y="7" width="6" height="2" fill="#FDE047" />
    <rect x="7" y="9" width="3" height="2" fill="#F59E0B" />
    <rect x="6" y="11" width="2" height="2" fill="#F59E0B" />
  </svg>
);

const PixelMediaPlayerIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="w-full h-full">
    {/* Perforated Dark Grey Filmstrip Reel (Left) */}
    <rect x="1" y="2" width="7" height="12" fill="#1F2937" />
    <rect x="2" y="3" width="1" height="1" fill="#F9FAFB" />
    <rect x="2" y="6" width="1" height="1" fill="#F9FAFB" />
    <rect x="2" y="9" width="1" height="1" fill="#F9FAFB" />
    <rect x="2" y="12" width="1" height="1" fill="#F9FAFB" />
    <rect x="6" y="3" width="1" height="1" fill="#F9FAFB" />
    <rect x="6" y="12" width="1" height="1" fill="#F9FAFB" />
    <rect x="4" y="4" width="2" height="3" fill="#4B5563" />
    <rect x="4" y="9" width="2" height="3" fill="#4B5563" />
    {/* Overlapping Silver CD Disc (Top-Right) */}
    <rect x="7" y="1" width="6" height="6" fill="#9CA3AF" />
    <rect x="8" y="2" width="5" height="5" fill="#E5E7EB" />
    <rect x="9" y="2" width="2" height="2" fill="#93C5FD" />
    <rect x="10" y="4" width="1" height="1" fill="#1E293B" />
    {/* Speaker Cone + Blue Play Triangle (Bottom-Right) */}
    <rect x="7" y="8" width="4" height="5" fill="#D1D5DB" />
    <rect x="9" y="7" width="4" height="7" fill="#6B7280" />
    <rect x="10" y="8" width="3" height="5" fill="#FACC15" />
    <rect x="11" y="9" width="2" height="3" fill="#2563EB" />
    <rect x="13" y="10" width="1" height="1" fill="#2563EB" />
  </svg>
);

const PixelLoadSpotifyShortcutIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="w-full h-full">
    {/* Beveled Dark Green & Black Spotify Badge */}
    <rect x="2" y="1" width="12" height="13" fill="#0B0F0D" />
    <rect x="2" y="1" width="11" height="12" fill="#1ED760" />
    <rect x="3" y="2" width="10" height="10" fill="#15803D" />
    <rect x="4" y="4" width="8" height="1.5" fill="#052E16" />
    <rect x="4.5" y="6.5" width="7" height="1.5" fill="#052E16" />
    <rect x="5" y="9" width="5.5" height="1.2" fill="#052E16" />
    {/* Classic Win98 White Bottom-Left Shortcut Arrow Box */}
    <rect x="1" y="10" width="6" height="5" fill="#FFFFFF" />
    <rect x="1" y="10" width="6" height="1" fill="#808080" />
    <rect x="2" y="12" width="3" height="1" fill="#000000" />
    <rect x="4" y="11" width="1" height="3" fill="#000000" />
  </svg>
);

const PixelMyMusicFolderIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="w-full h-full">
    {/* Manila Folder Tab & Back */}
    <rect x="1" y="2" width="6" height="2" fill="#D97706" />
    <rect x="1" y="4" width="14" height="10" fill="#B45309" />
    <rect x="2" y="4" width="12" height="9" fill="#FACC15" />
    <rect x="2" y="5" width="12" height="1" fill="#FEF08A" />
    {/* Stamped Musical Eighth Note */}
    <rect x="8" y="6" width="1" height="5" fill="#1E3A8A" />
    <rect x="9" y="6" width="2" height="1" fill="#1E3A8A" />
    <rect x="6" y="10" width="3" height="2" fill="#1E3A8A" />
  </svg>
);

const Win98HourglassCursor: React.FC = () => (
  <svg viewBox="0 0 20 20" shapeRendering="crispEdges" className="w-[22px] h-[22px]">
    {/* Classic Arrow Pointer */}
    <polygon points="2,1 2,13 5,10 7,14 9,13 7,9 11,9" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
    {/* Tiny Hourglass */}
    <rect x="12" y="9" width="6" height="1" fill="#000000" />
    <rect x="13" y="10" width="4" height="2" fill="#E5E7EB" />
    <rect x="14" y="12" width="2" height="1" fill="#FACC15" />
    <rect x="13" y="13" width="4" height="2" fill="#E5E7EB" />
    <rect x="12" y="15" width="6" height="1" fill="#000000" />
  </svg>
);

/* ============================================================================
   Props Interfaces
   ============================================================================ */

interface Dell1998MonitorProps {
  track: TrackItem;
  trackIndex: number;
  isPlaying: boolean;
  isStandby: boolean;
  elapsedSec: number;
  volume: number;
  repeatOne: boolean;
  shuffleEnabled: boolean;
  spectrumBars: number[];
  waveformSamples: number[];
  systemTime: Date;
  monitorPoweredOn: boolean;
  monitorPowerTransition?: 'idle' | 'collapsing' | 'expanding';
  pcPowerPhase?: Win98PcPowerPhase;
  bootStage: Win98BootStage;
  bsodPhase?: Win98BsodPhase;
  mediaPlayerOpen: boolean;
  wmpVideoId: string;
  isResolvingVideo: boolean;
  compact?: boolean;
  onSkipBoot: () => void;
  onSkipBsod?: () => void;
  onOpenMediaPlayer: () => void;
  onCloseMediaPlayer: () => void;
  onFocusPlaylistModule: () => void;
  onToggleMonitorPower: () => void;
  onTriggerPcShutdown?: () => void;
  onTvFullscreenChange?: (entering: boolean) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (targetSec: number) => void;
  onChangeVolume: (nextVol: number) => void;
  onToggleRepeatOne: () => void;
  onToggleShuffle: () => void;
  onOpenSpotifyModal: () => void;
}

export const Dell1998Monitor: React.FC<Dell1998MonitorProps> = ({
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
  monitorPowerTransition = 'idle',
  pcPowerPhase = 'on',
  bootStage,
  bsodPhase = 'none',
  mediaPlayerOpen,
  wmpVideoId,
  isResolvingVideo,
  compact = false,
  onSkipBoot,
  onSkipBsod,
  onOpenMediaPlayer,
  onCloseMediaPlayer,
  onFocusPlaylistModule,
  onToggleMonitorPower,
  onTriggerPcShutdown,
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
}) => {
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(false);
  const [accessoriesOpen, setAccessoriesOpen] = useState(false);
  const [entertainmentOpen, setEntertainmentOpen] = useState(false);
  const [winampOpen, setWinampOpen] = useState(false);
  const [winampMinimized, setWinampMinimized] = useState(false);
  const [cursorGuideDismissed, setCursorGuideDismissed] = useState(false);
  const [cursorStopIdx, setCursorStopIdx] = useState(0);
  const cursorArmTimeRef = useRef<number>(Date.now() + 450);
  const [mediaPlayerMinimized, setMediaPlayerMinimized] = useState(false);
  const [mediaPlayerMaximized, setMediaPlayerMaximized] = useState(false);
  const [activeCrtWindow, setActiveCrtWindow] = useState<'winamp' | 'media-player'>('winamp');
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  const [analyzerMode, setAnalyzerMode] = useState<'spectrum' | 'oscilloscope'>('spectrum');
  const [remainingTimeMode, setRemainingTimeMode] = useState(false);
  const [balanceVal, setBalanceVal] = useState(0);
  const [mutedVolBackup, setMutedVolBackup] = useState(0.75);
  const [osdBanner, setOsdBanner] = useState<string | null>(null);
  const [iframeUnavailable, setIframeUnavailable] = useState(false);
  const [isWmpFullscreen, setIsWmpFullscreen] = useState(false);
  const [fsOverlayControlsVisible, setFsOverlayControlsVisible] = useState(true);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const fsIframeRef = useRef<HTMLIFrameElement | null>(null);
  const fsOverlayRef = useRef<HTMLDivElement | null>(null);
  const fsHideTimerRef = useRef<number | null>(null);
  const lastWmpTapMsRef = useRef<number>(0);
  const lastFsTapMsRef = useRef<number>(0);
  const fsStartSecRef = useRef<number>(0);

  useEffect(() => {
    if (
      cursorGuideDismissed ||
      bootStage !== 'desktop' ||
      pcPowerPhase !== 'on' ||
      !monitorPoweredOn ||
      winampOpen ||
      mediaPlayerOpen
    ) {
      return;
    }
    cursorArmTimeRef.current = Date.now() + 450;
    const timer = window.setInterval(() => {
      setCursorStopIdx((prev) => (prev + 1) % 4);
    }, 1850);
    return () => window.clearInterval(timer);
  }, [
    cursorGuideDismissed,
    bootStage,
    pcPowerPhase,
    monitorPoweredOn,
    winampOpen,
    mediaPlayerOpen,
  ]);

  const marqueeText = buildWinampMarqueeText(track, trackIndex);
  const progressPct =
    track.durationSec > 0
      ? Math.max(0, Math.min(100, (elapsedSec / track.durationSec) * 100))
      : 0;
  const windowOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const windowHref = typeof window !== 'undefined' ? window.location.href : '';

  const buildWmpEmbedUrl = useCallback(
    (unmuted: boolean, startSec: number): string => {
      const base = buildCleanYouTubeEmbedUrl(
        wmpVideoId,
        unmuted ? true : isPlaying,
        startSec,
        windowOrigin,
        !unmuted
      );
      if (!base) return '';
      const sep = base.includes('?') ? '&' : '?';
      return windowHref ? `${base}${sep}widget_referrer=${encodeURIComponent(windowHref)}` : base;
    },
    [wmpVideoId, isPlaying, windowOrigin, windowHref]
  );

  const resetFsControlsTimer = useCallback(() => {
    setFsOverlayControlsVisible(true);
    if (fsHideTimerRef.current !== null) {
      window.clearTimeout(fsHideTimerRef.current);
    }
    fsHideTimerRef.current = window.setTimeout(() => {
      setFsOverlayControlsVisible(false);
    }, 2500);
  }, []);

  const enterWmpFullscreen = useCallback(() => {
    if (isStandby || !wmpVideoId || iframeUnavailable || !monitorPoweredOn || pcPowerPhase !== 'on') {
      return;
    }
    fsStartSecRef.current = Math.max(0, Math.floor(elapsedSec));
    setIsWmpFullscreen(true);
    setFsOverlayControlsVisible(true);
    onTvFullscreenChange?.(true);
    resetFsControlsTimer();

    window.setTimeout(() => {
      const el = fsOverlayRef.current;
      if (el && typeof el.requestFullscreen === 'function') {
        el.requestFullscreen().catch(() => {
          // Graceful iOS / embedded fallback uses fixed 100vw x 100dvh portal
        });
      }
    }, 20);
  }, [
    isStandby,
    wmpVideoId,
    iframeUnavailable,
    monitorPoweredOn,
    pcPowerPhase,
    elapsedSec,
    onTvFullscreenChange,
    resetFsControlsTimer,
  ]);

  const exitWmpFullscreen = useCallback(() => {
    if (fsHideTimerRef.current !== null) {
      window.clearTimeout(fsHideTimerRef.current);
      fsHideTimerRef.current = null;
    }
    try {
      const fsWin = fsIframeRef.current?.contentWindow;
      if (fsWin) {
        fsWin.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: '' }), '*');
        fsWin.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }), '*');
        fsWin.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*');
      }
      const inlineWin = ytIframeRef.current?.contentWindow;
      if (inlineWin) {
        inlineWin.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: '' }), '*');
        inlineWin.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }), '*');
      }
    } catch {
      // ignore iframe postMessage errors
    }

    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }

    setIsWmpFullscreen((wasFs) => {
      if (wasFs) {
        onTvFullscreenChange?.(false);
      }
      return false;
    });
  }, [onTvFullscreenChange]);

  useEffect(() => {
    setIframeUnavailable(false);
  }, [track.id, wmpVideoId, mediaPlayerOpen]);

  useEffect(() => {
    if ((!monitorPoweredOn || pcPowerPhase !== 'on' || bsodPhase !== 'none' || !mediaPlayerOpen) && isWmpFullscreen) {
      exitWmpFullscreen();
    }
  }, [monitorPoweredOn, pcPowerPhase, bsodPhase, mediaPlayerOpen, isWmpFullscreen, exitWmpFullscreen]);

  useEffect(() => {
    if (!isWmpFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitWmpFullscreen();
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        exitWmpFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [isWmpFullscreen, exitWmpFullscreen]);

  useEffect(() => {
    return () => {
      if (fsHideTimerRef.current !== null) {
        window.clearTimeout(fsHideTimerRef.current);
      }
    };
  }, []);

  // Keep embedded YouTube player playback synced when Media Player is visible
  useEffect(() => {
    if (!mediaPlayerOpen || mediaPlayerMinimized || !wmpVideoId || iframeUnavailable) return;
    const win = ytIframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func: isPlaying ? 'playVideo' : 'pauseVideo',
          args: '',
        }),
        '*'
      );
    } catch {
      // Ignore initial iframe load timing
    }
  }, [isPlaying, mediaPlayerOpen, mediaPlayerMinimized, wmpVideoId, iframeUnavailable]);

  // Detect unavailable YouTube embeds gracefully
  useEffect(() => {
    if (!mediaPlayerOpen) return;
    const handleMessage = (event: MessageEvent) => {
      if (
        typeof event.origin === 'string' &&
        !event.origin.includes('youtube.com') &&
        !event.origin.includes('youtube-nocookie.com')
      ) {
        return;
      }
      if (
        ytIframeRef.current?.contentWindow &&
        event.source &&
        event.source !== ytIframeRef.current.contentWindow &&
        event.source !== fsIframeRef.current?.contentWindow
      ) {
        return;
      }
      let payload: { event?: string; info?: unknown } | null = null;
      if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
      } else if (event.data && typeof event.data === 'object') {
        payload = event.data as { event?: string; info?: unknown };
      }
      if (!payload) return;
      const infoObj =
        payload.info && typeof payload.info === 'object'
          ? (payload.info as { videoData?: { isPlayable?: boolean } })
          : null;
      if (
        payload.event === 'onError' ||
        (payload.event === 'initialDelivery' && infoObj?.videoData?.isPlayable === false)
      ) {
        setIframeUnavailable(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mediaPlayerOpen]);

  const triggerOsdToast = (msg: string) => {
    setOsdBanner(msg);
    window.setTimeout(() => {
      setOsdBanner((cur) => (cur === msg ? null : cur));
    }, 1700);
  };

  const handleToggleMute = () => {
    if (volume > 0.01) {
      setMutedVolBackup(volume);
      onChangeVolume(0);
    } else {
      onChangeVolume(mutedVolBackup > 0.05 ? mutedVolBackup : 0.75);
    }
  };

  const launchMediaPlayer = () => {
    setMediaPlayerMinimized(false);
    setActiveCrtWindow('media-player');
    onOpenMediaPlayer();
  };

  const closeAllMenus = () => {
    setStartMenuOpen(false);
    setProgramsOpen(false);
    setAccessoriesOpen(false);
    setEntertainmentOpen(false);
  };

  const desktopIcons = [
    {
      id: 'my-computer',
      label: 'My Computer',
      svg: <PixelMyComputerIcon />,
      action: () => triggerOsdToast('A:\\ 3.5" Floppy  ·  C:\\MUSIC (FAT32)'),
    },
    {
      id: 'recycle-bin',
      label: 'Recycle Bin',
      svg: <PixelRecycleBinIcon />,
      action: () => triggerOsdToast('Recycle Bin (0 objects)'),
    },
    {
      id: 'winamp-icon',
      label: 'Winamp',
      svg: <PixelWinampIcon />,
      action: () => {
        setWinampOpen(true);
        setWinampMinimized(false);
        setActiveCrtWindow('winamp');
      },
    },
    {
      id: 'media-player',
      label: 'Media Player',
      svg: <PixelMediaPlayerIcon />,
      action: launchMediaPlayer,
    },
    {
      id: 'load-spotify',
      label: 'Load Spotify',
      svg: <PixelLoadSpotifyShortcutIcon />,
      action: () => onOpenSpotifyModal(),
    },
    {
      id: 'my-music',
      label: 'My Music',
      svg: <PixelMyMusicFolderIcon />,
      action: () => onFocusPlaylistModule(),
    },
  ];

  const isBooting =
    monitorPoweredOn &&
    bootStage !== 'desktop' &&
    bootStage !== 'off';

  return (
    <div
      id="dell-1998-crt-assembly"
      data-testid="dell-1998-crt-assembly"
      className="pcw-crt-monitor-housing relative flex flex-col items-center justify-end"
    >
      {/* Main Putty-Beige CRT Housing */}
      <div
        className={`pcw-beige-abs-shell w-full flex-1 min-h-0 ${
          compact ? 'p-[6px] pb-[5px] rounded-[7px]' : 'p-[11px] sm:p-[13px] pb-[8px] rounded-[10px]'
        } flex flex-col justify-between overflow-hidden`}
      >
        <div className="pcw-beige-abs-grain absolute inset-0 rounded-[inherit]" />

        {/* Stepped Inward-Sloping Bezel + Dark Charcoal Tube Gasket */}
        <div
          className={`pcw-crt-bezel-step relative z-10 flex-1 min-h-0 w-full ${
            compact ? 'p-[4px] rounded-[5px]' : 'p-[6px] rounded-[6px]'
          } flex flex-col items-center justify-center`}
        >
          <div className="pcw-crt-gasket relative w-full h-full min-h-0 p-[3px] rounded-[6px] overflow-hidden flex items-center justify-center">
            {/* Strictly Locked 4:3 CRT Glass Screen with Container Queries */}
            <div
              data-testid="pcw-crt-glass-screen"
              data-boot-stage={bootStage}
              data-monitor-powered={monitorPoweredOn ? 'true' : 'false'}
              data-pc-power-phase={pcPowerPhase}
              data-bsod-phase={bsodPhase}
              onPointerDown={() => setCursorGuideDismissed(true)}
              onMouseMove={() => {
                if (Date.now() > cursorArmTimeRef.current) {
                  setCursorGuideDismissed(true);
                }
              }}
              onClick={() => {
                setCursorGuideDismissed(true);
                if (bsodPhase === 'bsod') {
                  onSkipBsod?.();
                  return;
                }
                if (isBooting) {
                  onSkipBoot();
                  return;
                }
                setSelectedIconId(null);
                if (startMenuOpen) {
                  closeAllMenus();
                }
              }}
              className="pcw-crt-glass-screen bg-[#101214] flex flex-col justify-between"
            >
              <div
                className={`w-full h-full flex flex-col justify-between ${
                  monitorPowerTransition === 'collapsing'
                    ? 'pcw-crt-power-collapse'
                    : monitorPowerTransition === 'expanding'
                      ? 'pcw-crt-power-expand'
                      : ''
                }`}
              >
              {!monitorPoweredOn || pcPowerPhase === 'off' ? (
                <div
                  aria-label="Monitor Standby"
                  style={{
                    background:
                      'radial-gradient(ellipse 90% 80% at 45% 35%, #1A1E22 0%, #101214 68%, #0A0C0D 100%)',
                  }}
                  className="w-full h-full"
                />
              ) : bsodPhase === 'bsod' ? (
                /* Authentic Windows 98 #0000AA Blue Screen of Death inside 4:3 CRT */
                <div
                  data-testid="win98-bsod-screen"
                  style={{
                    backgroundColor: '#0000AA',
                    fontFamily: "'Lucida Console', 'Courier New', monospace",
                  }}
                  className="w-full h-full p-[6%] flex flex-col items-center justify-center text-white cursor-pointer select-none"
                  title="Click screen or press any key to restart Windows 98"
                >
                  <div className="bg-[#AAAAAA] text-[#0000AA] px-2 py-[1px] font-bold text-[clamp(7.5px,3.2cqh,11px)] mb-[4cqh]">
                    Windows
                  </div>
                  <div className="w-full text-[clamp(6.8px,2.8cqh,10px)] leading-[1.35] space-y-[2.5cqh] text-left">
                    <p>
                      A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) +
                      00010E36. The current application will be terminated.
                    </p>
                    <ul className="space-y-[1.2cqh] pl-1">
                      <li>* Press any key to terminate the current application.</li>
                      <li>
                        * Press CTRL+ALT+DEL again to restart your computer. You will lose
                        any unsaved information in all applications.
                      </li>
                    </ul>
                    <p className="pt-[2cqh] text-center">
                      Press any key or click screen to restart
                      <span className="animate-pulse">_</span>
                    </p>
                  </div>
                </div>
              ) : bsodPhase === 'black-flash' ? (
                <div data-testid="win98-bsod-black-flash" className="w-full h-full bg-[#000000]" />
              ) : pcPowerPhase === 'shutting-down' ? (
                /* Classic Windows 98 Shutdown Cloud Screen */
                <div
                  data-testid="win98-shutdown-cloud"
                  style={{
                    background: 'linear-gradient(180deg, #5B9BD5 0%, #83B8E8 52%, #A7D3F5 100%)',
                  }}
                  className="relative w-full h-full flex flex-col justify-between overflow-hidden select-none"
                >
                  <div
                    aria-hidden="true"
                    style={{
                      background:
                        'radial-gradient(ellipse 65% 42% at 22% 72%, rgba(255,255,255,0.68), transparent 72%), radial-gradient(ellipse 75% 48% at 74% 66%, rgba(255,255,255,0.75), transparent 70%)',
                    }}
                    className="absolute inset-0 pointer-events-none"
                  />
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-[8%] text-center">
                    <p
                      style={{ textShadow: '1px 1px 0 rgba(255,255,255,0.65)' }}
                      className="font-sans text-[clamp(13px,6.5cqh,22px)] font-black tracking-tight text-[#0F172A] leading-tight mb-[2cqh]"
                    >
                      Windows<span className="text-[#1D4ED8] ml-[0.12em]">98</span>
                    </p>
                    <p className="font-sans text-[clamp(8.5px,3.6cqh,12.5px)] font-bold text-[#0F172A]">
                      Windows is shutting down...
                    </p>
                  </div>
                </div>
              ) : pcPowerPhase === 'safe-to-turn-off' ? (
                /* Classic Black & Amber Windows 98 Safe-to-Turn-Off Screen */
                <div
                  data-testid="win98-safe-to-turn-off"
                  className="w-full h-full bg-[#000000] flex items-center justify-center px-[10%] text-center select-none"
                >
                  <p className="font-sans text-[clamp(10px,4.5cqh,16px)] font-bold text-[#E67E22] leading-snug">
                    It is now safe to turn off
                    <br />
                    your computer.
                  </p>
                </div>
              ) : bootStage === 'warmup' ? (
                /* Stage 1 (0-280ms): Horizontal CRT Cathode-Ray Expansion */
                <div
                  data-testid="win98-boot-warmup"
                  className="w-full h-full bg-[#000000] flex items-center justify-center cursor-pointer"
                  title="Click to skip Windows 98 startup"
                >
                  <div className="pcw-crt-warmup-beam w-full h-full bg-gradient-to-b from-black via-white/90 to-black" />
                </div>
              ) : bootStage === 'bios' ? (
                /* Stage 2 (280-650ms): Monochrome Dell BIOS / DOS Flash */
                <div
                  data-testid="win98-boot-bios"
                  className="w-full h-full bg-[#000000] p-[5%] font-mono text-[clamp(7.5px,3.2cqh,11.5px)] leading-[1.38] text-[#E5E7EB] cursor-pointer"
                  title="Click to skip Windows 98 startup"
                >
                  <p className="text-white font-bold">Dell System BIOS vA09 (1998)</p>
                  <p>Pentium(R) II Processor 350MHz</p>
                  <p>64MB System RAM ......... OK</p>
                  <p className="mt-[2cqh]">Detecting Pri Master ... QUANTUM 6.4GB</p>
                  <p className="mt-[3cqh] text-[#D1D5DB]">
                    Starting Windows 98<span className="animate-pulse">_</span>
                  </p>
                </div>
              ) : bootStage === 'splash' ? (
                /* Stage 3 (650-2250ms): Classic Windows 98 Cloud Splash Screen */
                <div
                  data-testid="win98-boot-splash"
                  style={{
                    background: 'linear-gradient(180deg, #5B9BD5 0%, #83B8E8 52%, #A7D3F5 100%)',
                  }}
                  className="relative w-full h-full flex flex-col justify-between overflow-hidden cursor-pointer select-none"
                  title="Click to skip Windows 98 startup"
                >
                  {/* Soft Horizon Cloud Layers */}
                  <div
                    aria-hidden="true"
                    style={{
                      background:
                        'radial-gradient(ellipse 65% 42% at 22% 72%, rgba(255,255,255,0.68), transparent 72%), radial-gradient(ellipse 75% 48% at 74% 66%, rgba(255,255,255,0.75), transparent 70%), radial-gradient(ellipse 55% 35% at 48% 30%, rgba(255,255,255,0.38), transparent 70%)',
                    }}
                    className="absolute inset-0 pointer-events-none"
                  />

                  {/* Center Windows 98 Flag + Wordmark */}
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-[8%]">
                    <div className="flex items-center gap-[3cqw] mb-[2.5cqh]">
                      {/* Trailing Pixel Blocks */}
                      <div className="grid grid-cols-3 gap-[1.5px] opacity-85" aria-hidden="true">
                        <span className="w-[3px] h-[3px] bg-white/80" />
                        <span className="w-[3px] h-[3px] bg-[#EF4444]" />
                        <span className="w-[3px] h-[3px] bg-[#22C55E]" />
                        <span className="w-[3px] h-[3px] bg-transparent" />
                        <span className="w-[3px] h-[3px] bg-[#3B82F6]" />
                        <span className="w-[3px] h-[3px] bg-[#FACC15]" />
                      </div>
                      {/* Classic 4-Pane Waving Flag */}
                      <svg viewBox="0 0 28 24" className="w-[14cqw] h-auto drop-shadow-[1px_2px_0_rgba(0,0,0,0.3)]">
                        <path d="M2,4 Q8,1 13,4 L11,11 Q6,9 1,11 Z" fill="#E63946" stroke="#111" strokeWidth="1" />
                        <path d="M15,4 Q21,6 26,3 L24,10 Q19,12 13,11 Z" fill="#2ECC71" stroke="#111" strokeWidth="1" />
                        <path d="M1,13 Q6,11 11,13 L9,20 Q4,18 0,20 Z" fill="#3B82F6" stroke="#111" strokeWidth="1" />
                        <path d="M13,13 Q19,14 24,12 L22,19 Q17,21 11,20 Z" fill="#FACC15" stroke="#111" strokeWidth="1" />
                      </svg>
                    </div>
                    <p className="font-sans text-[clamp(8px,3.2cqh,11px)] font-semibold text-[#111827] tracking-tight leading-none">
                      Microsoft<sup className="text-[0.65em]">®</sup>
                    </p>
                    <p
                      style={{ textShadow: '1px 1px 0 rgba(255,255,255,0.65)' }}
                      className="font-sans text-[clamp(14px,7.5cqh,26px)] font-black tracking-tight text-[#0F172A] leading-[1.05]"
                    >
                      Windows<span className="text-[#1D4ED8] ml-[0.12em]">98</span>
                    </p>
                  </div>

                  {/* Scrolling Bottom Blue Gradient Progress Strip */}
                  <div className="relative z-10 w-full h-[5cqh] min-h-[7px] max-h-[12px] border-t border-white/60 pcw-win98-boot-bar shrink-0" />
                </div>
              ) : bootStage === 'teal-wait' ? (
                /* Stage 4 (2250-2450ms): Teal Desktop + Arrow/Hourglass Wait Cursor */
                <div
                  data-testid="win98-boot-teal-wait"
                  className="w-full h-full bg-[#008080] flex items-center justify-center cursor-wait"
                  title="Click to finish loading"
                >
                  <Win98HourglassCursor />
                </div>
              ) : (
                /* Windows 98 #008080 Teal Desktop */
                <div className="relative flex-1 min-h-0 w-full bg-[#008080] flex flex-col justify-between overflow-hidden">
                  {/* Desktop Work Area Above Taskbar */}
                  <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                    {/* Left-Rail Pixel-Art Desktop Icon Grid (Never overlapped by floating windows) */}
                    <div
                      id="win98-desktop-icons"
                      data-testid="win98-desktop-icons"
                      className="pcw-win98-icon-grid"
                    >
                      {desktopIcons.map((deskIcon) => {
                        const isSelected = selectedIconId === deskIcon.id;
                        return (
                          <button
                            key={deskIcon.id}
                            type="button"
                            data-testid={`win98-icon-${deskIcon.id}`}
                            data-selected={isSelected ? 'true' : 'false'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIconId(deskIcon.id);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setSelectedIconId(deskIcon.id);
                              deskIcon.action();
                            }}
                            onPointerUp={(e) => {
                              if (e.pointerType === 'touch') {
                                e.stopPropagation();
                                setSelectedIconId(deskIcon.id);
                                deskIcon.action();
                              }
                            }}
                            className="pcw-win98-icon-tile focus:outline-none"
                            title={`${deskIcon.label} (Double-click to open)`}
                          >
                            <span className="pcw-win98-icon-glyph">{deskIcon.svg}</span>
                            <span className="pcw-win98-icon-label">{deskIcon.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Winamp 2.x Main Player Window Inside CRT (Closed by default; launches from icon/Start) */}
                    {winampOpen && !winampMinimized && !(mediaPlayerOpen && !mediaPlayerMinimized && mediaPlayerMaximized) && (
                      <div
                        id="crt-winamp-main-window"
                        data-testid="crt-winamp-main-window"
                        data-no-drawer-swipe="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCrtWindow('winamp');
                        }}
                        style={{
                          left: '24%',
                          right: '2.5%',
                          top: '7%',
                          zIndex: activeCrtWindow === 'winamp' ? 24 : 18,
                        }}
                        className="pcw-winamp-chassis absolute p-[1.5cqh] rounded-[1px]"
                      >
                        {/* Classic Winamp Titlebar */}
                        <div className="flex items-center gap-1 h-[4.5cqh] min-h-[10px] mb-[1.2cqh]">
                          <span className="w-[5px] h-[5px] bg-[#E6C245] border border-[#0E1016]" />
                          <span className="flex-1 h-[5px] pcw-winamp-ridges" />
                          <span className="font-mono text-[clamp(6.5px,2.8cqh,8.5px)] font-bold tracking-[0.14em] text-[#E6C245]">
                            WINAMP
                          </span>
                          <span className="flex-1 h-[5px] pcw-winamp-ridges" />
                          <div className="flex items-center gap-[2px]">
                            <button
                              type="button"
                              aria-label="Minimize Winamp"
                              onClick={() => setWinampMinimized(true)}
                              className="w-[9px] h-[9px] bg-[#3A3D4D] border border-[#65697D] text-[7px] leading-none text-white flex items-center justify-center cursor-pointer"
                            >
                              _
                            </button>
                            <button
                              type="button"
                              aria-label="Toggle Visualizer"
                              onClick={() => setVisualizerOpen((v) => !v)}
                              className="w-[9px] h-[9px] bg-[#3A3D4D] border border-[#65697D] text-[7px] leading-none text-white flex items-center justify-center cursor-pointer"
                            >
                              =
                            </button>
                            <button
                              type="button"
                              aria-label="Close Winamp"
                              onClick={() => {
                                setWinampOpen(false);
                                setWinampMinimized(false);
                              }}
                              className="w-[9px] h-[9px] bg-[#3A3D4D] border border-[#65697D] text-[7px] leading-none text-white flex items-center justify-center cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* LCD Readout Bay */}
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-[1.5cqw] mb-[1.4cqh]">
                          <div className="flex flex-col gap-[2px]">
                            <button
                              type="button"
                              onClick={() => setRemainingTimeMode((r) => !r)}
                              title="Click to toggle elapsed/remaining time"
                              className="bg-[#000000] border border-[#0E1016] px-1 py-[1.5px] flex items-center gap-1 cursor-pointer"
                            >
                              <span className="font-mono text-[clamp(6px,2.5cqh,8px)] text-[#00FF00] leading-none">
                                {isPlaying ? '▶' : isStandby ? '■' : '❚❚'}
                              </span>
                              <span
                                data-testid="winamp-lcd-timer"
                                className="font-mono text-[clamp(9.5px,4.5cqh,13px)] font-bold leading-none text-[#00FF00] tabular-nums tracking-wider"
                              >
                                {formatWinampLcdTime(
                                  elapsedSec,
                                  remainingTimeMode,
                                  track.durationSec
                                )}
                              </span>
                            </button>

                            <button
                              type="button"
                              data-testid="winamp-spectrum-box"
                              onClick={() =>
                                setAnalyzerMode((m) =>
                                  m === 'spectrum' ? 'oscilloscope' : 'spectrum'
                                )
                              }
                              title="Click to toggle Spectrum / Oscilloscope"
                              className="w-[21cqw] max-w-[82px] h-[7.5cqh] min-h-[15px] max-h-[22px] bg-[#000000] border border-[#0D0F14] px-[2px] py-[2px] flex items-end justify-between gap-[1px] cursor-pointer overflow-hidden"
                            >
                              {analyzerMode === 'spectrum' ? (
                                spectrumBars.slice(0, 19).map((val, idx) => {
                                  const barPct = Math.max(8, Math.round(val * 100));
                                  return (
                                    <span key={idx} className="relative flex-1 h-full flex items-end">
                                      <span
                                        style={{
                                          height: `${barPct}%`,
                                          background:
                                            'linear-gradient(to top, #00FF00 0%, #FFFF00 55%, #FF8000 80%, #FF0000 100%)',
                                        }}
                                        className="w-full block relative"
                                      >
                                        <span className="absolute -top-[1px] left-0 right-0 h-[1px] bg-white/90" />
                                      </span>
                                    </span>
                                  );
                                })
                              ) : (
                                <svg viewBox="0 0 76 18" className="w-full h-full">
                                  <polyline
                                    fill="none"
                                    stroke="#00FF00"
                                    strokeWidth="1.2"
                                    points={waveformSamples
                                      .slice(0, 38)
                                      .map((s, i) => {
                                        const x = (i / 37) * 76;
                                        const y = 9 - s * 7.5;
                                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                                      })
                                      .join(' ')}
                                  />
                                </svg>
                              )}
                            </button>
                          </div>

                          <div className="min-w-0 flex flex-col justify-between gap-[2px]">
                            <div className="bg-[#000000] border border-[#0E1016] px-1 py-[1.5px] overflow-hidden">
                              <div
                                data-paused={!isPlaying ? 'true' : 'false'}
                                className="pcw-marquee-track font-mono text-[clamp(7px,3.1cqh,9.5px)] font-bold text-[#00FF00] leading-none"
                              >
                                <span className="pr-4">{marqueeText}</span>
                                <span className="pr-4" aria-hidden="true">
                                  {marqueeText}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-1 font-mono text-[clamp(6px,2.6cqh,8px)] leading-none">
                              <div className="flex items-center gap-1">
                                <span className="bg-[#000000] border border-[#0E1016] px-1 py-[1px] text-[#00FF00]">
                                  128
                                </span>
                                <span className="text-[#8E94AB]">kbps</span>
                                <span className="bg-[#000000] border border-[#0E1016] px-1 py-[1px] text-[#00FF00]">
                                  44
                                </span>
                                <span className="text-[#8E94AB]">kHz</span>
                              </div>
                              <span className="text-[#00FF00] font-bold">stereo</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <input
                                type="range"
                                aria-label="Winamp Volume"
                                min={0}
                                max={100}
                                value={Math.round(volume * 100)}
                                onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
                                style={{
                                  background:
                                    'linear-gradient(90deg, #00C83C 0%, #E6C245 65%, #D62828 100%)',
                                }}
                                className="flex-1 min-w-0 h-[4px] accent-[#D0D4E4] cursor-pointer"
                              />
                              <input
                                type="range"
                                aria-label="Winamp Balance"
                                min={-50}
                                max={50}
                                value={balanceVal}
                                onChange={(e) => setBalanceVal(Number(e.target.value))}
                                className="w-[10cqw] max-w-[36px] h-[4px] bg-[#0B0D12] accent-[#D0D4E4] cursor-pointer shrink-0"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Seek Bar */}
                        <div className="mb-[1.4cqh] flex items-center">
                          <input
                            type="range"
                            aria-label="Winamp Track Seek"
                            min={0}
                            max={Math.max(1, track.durationSec)}
                            value={Math.min(track.durationSec, Math.floor(elapsedSec))}
                            disabled={isStandby || track.durationSec <= 0}
                            onChange={(e) => onSeek(Number(e.target.value))}
                            style={{
                              background: `linear-gradient(90deg, #E6C245 ${progressPct}%, #08090D ${progressPct}%)`,
                            }}
                            className="w-full h-[4px] accent-[#E6C245] cursor-pointer"
                          />
                        </div>

                        {/* Transport Controls + SHUFFLE / REPEAT */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-[2px]">
                            <button
                              type="button"
                              onClick={onPrevious}
                              aria-label="Winamp Previous"
                              className="pcw-winamp-btn w-[16px] h-[14px] flex items-center justify-center cursor-pointer"
                            >
                              <SkipBack className="w-2 h-2 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={onTogglePlay}
                              aria-label="Winamp Play"
                              className="pcw-winamp-btn w-[16px] h-[14px] flex items-center justify-center text-[#00FF00] cursor-pointer"
                            >
                              <Play className="w-2 h-2 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={onTogglePlay}
                              aria-label="Winamp Pause"
                              className="pcw-winamp-btn w-[16px] h-[14px] flex items-center justify-center cursor-pointer"
                            >
                              <Pause className="w-2 h-2 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={onStop}
                              aria-label="Winamp Stop"
                              className="pcw-winamp-btn w-[16px] h-[14px] flex items-center justify-center cursor-pointer"
                            >
                              <Square className="w-1.5 h-1.5 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={onNext}
                              aria-label="Winamp Next"
                              className="pcw-winamp-btn w-[16px] h-[14px] flex items-center justify-center cursor-pointer"
                            >
                              <SkipForward className="w-2 h-2 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={onOpenSpotifyModal}
                              aria-label="Open Playlist / Eject"
                              className="pcw-winamp-btn w-[16px] h-[14px] flex items-center justify-center text-[7px] font-bold cursor-pointer"
                            >
                              ⏏
                            </button>
                          </div>

                          <div className="flex items-center gap-[2px]">
                            <button
                              type="button"
                              data-active={shuffleEnabled ? 'true' : 'false'}
                              onClick={onToggleShuffle}
                              className={`pcw-winamp-btn h-[14px] px-1 font-mono text-[clamp(6px,2.3cqh,7.5px)] font-bold cursor-pointer ${
                                shuffleEnabled ? 'text-[#00FF00]' : 'text-[#9EA3B8]'
                              }`}
                            >
                              SHUF
                            </button>
                            <button
                              type="button"
                              data-active={repeatOne ? 'true' : 'false'}
                              onClick={onToggleRepeatOne}
                              className={`pcw-winamp-btn h-[14px] px-1 font-mono text-[clamp(6px,2.3cqh,7.5px)] font-bold cursor-pointer ${
                                repeatOne ? 'text-[#00FF00]' : 'text-[#9EA3B8]'
                              }`}
                            >
                              REP
                            </button>
                          </div>
                        </div>

                        {visualizerOpen && (
                          <div className="mt-1 p-1 bg-[#000000] border border-[#0E1016] flex items-center gap-1.5">
                            {track.artworkUrl ? (
                              <img
                                src={track.artworkUrl}
                                alt={track.title}
                                className="w-5 h-5 object-cover border border-[#00FF00]/40 shrink-0"
                              />
                            ) : (
                              <Disc3 className="w-4 h-4 text-[#00FF00] shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-[7.5px] text-[#00FF00] truncate">
                                MILKDROP VIS · {track.title}
                              </p>
                              <p className="font-mono text-[7px] text-[#E6C245] truncate">
                                {track.artist} · {track.album}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Windows Media Player 6.4 Window (YouTube Music Video inside Classic 1998 Beveled Chrome) */}
                    {mediaPlayerOpen && !mediaPlayerMinimized && (
                      <div
                        id="crt-windows-media-player"
                        data-testid="crt-windows-media-player"
                        data-no-drawer-swipe="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCrtWindow('media-player');
                        }}
                        style={
                          mediaPlayerMaximized
                            ? { left: '0%', right: '0%', top: '0%', bottom: '0%', zIndex: 32 }
                            : {
                                left: '23%',
                                right: '2%',
                                top: '4%',
                                bottom: '4%',
                                zIndex: activeCrtWindow === 'media-player' ? 30 : 20,
                              }
                        }
                        className="pcw-win98-out absolute flex flex-col p-[2px] shadow-[3px_3px_0_rgba(0,0,0,0.5)]"
                      >
                        {/* Titlebar: #000080 -> #1084D0 */}
                        <div
                          style={{
                            background: 'linear-gradient(90deg, #000080 0%, #1084D0 100%)',
                          }}
                          className="h-[clamp(14px,7.5cqh,18px)] px-1 flex items-center justify-between gap-1 shrink-0"
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="w-[11px] h-[11px] shrink-0">
                              <PixelMediaPlayerIcon />
                            </span>
                            <span className="font-sans text-[clamp(7.5px,3.2cqh,10px)] font-bold text-white truncate">
                              Media Player - [{isStandby ? 'Ready' : track.title}]
                            </span>
                          </div>
                          <div className="flex items-center gap-[2px] shrink-0">
                            <button
                              type="button"
                              aria-label="Minimize Media Player"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMediaPlayerMinimized(true);
                              }}
                              className="pcw-win98-out w-[12px] h-[11px] flex items-center justify-center font-sans text-[8px] font-bold text-black leading-none cursor-pointer"
                            >
                              _
                            </button>
                            <button
                              type="button"
                              aria-label="Maximize Media Player"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMediaPlayerMaximized((m) => !m);
                              }}
                              className="pcw-win98-out w-[12px] h-[11px] flex items-center justify-center font-sans text-[8px] font-bold text-black leading-none cursor-pointer"
                            >
                              □
                            </button>
                            <button
                              type="button"
                              aria-label="Close Media Player"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMediaPlayerMaximized(false);
                                setMediaPlayerMinimized(false);
                                onCloseMediaPlayer();
                              }}
                              className="pcw-win98-out w-[12px] h-[11px] flex items-center justify-center font-sans text-[8px] font-bold text-black leading-none cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Classic WMP 6.4 Menu Strip */}
                        <div className="px-1 py-[1px] flex items-center gap-[5px] font-sans text-[clamp(6.5px,2.7cqh,9px)] text-[#111111] border-b border-[#808080] shrink-0">
                          {['File', 'View', 'Play', 'Favorites', 'Go', 'Help'].map((menuItem) => (
                            <span key={menuItem} className="select-none">
                              {menuItem}
                            </span>
                          ))}
                        </div>

                        {/* Recessed Black Video Viewport (2px inset #808080) — Double-Click/Tap triggers True Full-Screen Video */}
                        <div
                          data-testid="wmp-video-viewport"
                          style={{ border: '2px inset #808080' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const now = Date.now();
                            if (now - lastWmpTapMsRef.current <= 300) {
                              lastWmpTapMsRef.current = 0;
                              enterWmpFullscreen();
                              return;
                            }
                            lastWmpTapMsRef.current = now;
                            if (!isStandby) onTogglePlay();
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            enterWmpFullscreen();
                          }}
                          title="Double-click video for full-screen playback"
                          className="relative flex-1 min-h-0 bg-[#000000] overflow-hidden cursor-pointer flex items-center justify-center"
                        >
                          {!isStandby && wmpVideoId && !iframeUnavailable ? (
                            <>
                              <iframe
                                key={`${track.id}-${wmpVideoId}`}
                                ref={ytIframeRef}
                                title={`Windows Media Player - ${track.title}`}
                                src={buildWmpEmbedUrl(false, Math.floor(elapsedSec))}
                                referrerPolicy="strict-origin-when-cross-origin"
                                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                                className="w-full h-full border-0 pointer-events-none scale-[1.18] object-cover"
                              />
                              {/* Click Shield preventing YouTube hover overlays from intercepting double-click */}
                              <div className="absolute inset-0 z-10" aria-hidden="true" />
                            </>
                          ) : (
                            <div className="relative w-full h-full flex flex-col items-center justify-center text-center px-2">
                              {track.artworkUrl && !isStandby && (
                                <img
                                  src={track.artworkUrl}
                                  alt={track.title}
                                  className="absolute inset-0 w-full h-full object-cover opacity-35"
                                />
                              )}
                              <div className="relative z-10 flex flex-col items-center gap-1">
                                <span className="w-[22px] h-[22px]">
                                  <PixelMediaPlayerIcon />
                                </span>
                                <span className="font-mono text-[clamp(7px,2.8cqh,10px)] text-[#00FF00] bg-black/75 px-1.5 py-0.5 border border-[#00FF00]/40">
                                  {isStandby
                                    ? 'LOAD PLAYLIST TO PLAY VIDEO'
                                    : isResolvingVideo
                                      ? 'BUFFERING VIDEO STREAM...'
                                      : `${track.title} — ${track.artist}`}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Authentic WMP 6.4 Seek Bar & Transport Footer */}
                        <div className="pt-[2px] flex flex-col gap-[2px] shrink-0">
                          <div className="flex items-center gap-1 px-0.5">
                            <input
                              type="range"
                              aria-label="Media Player Seek"
                              min={0}
                              max={Math.max(1, track.durationSec)}
                              value={Math.min(track.durationSec, Math.floor(elapsedSec))}
                              disabled={isStandby || track.durationSec <= 0}
                              onChange={(e) => onSeek(Number(e.target.value))}
                              className="w-full h-[4px] accent-[#808080] cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-1 px-0.5">
                            <div className="flex items-center gap-[1.5px]">
                              <button
                                type="button"
                                onClick={onTogglePlay}
                                aria-label="WMP Play"
                                className="pcw-win98-out w-[15px] h-[14px] flex items-center justify-center text-[#111] cursor-pointer"
                              >
                                <Play className="w-2 h-2 fill-current" />
                              </button>
                              <button
                                type="button"
                                onClick={onTogglePlay}
                                aria-label="WMP Pause"
                                className="pcw-win98-out w-[15px] h-[14px] flex items-center justify-center text-[#111] cursor-pointer"
                              >
                                <Pause className="w-2 h-2 fill-current" />
                              </button>
                              <button
                                type="button"
                                onClick={onStop}
                                aria-label="WMP Stop"
                                className="pcw-win98-out w-[15px] h-[14px] flex items-center justify-center text-[#111] cursor-pointer"
                              >
                                <Square className="w-1.5 h-1.5 fill-current" />
                              </button>
                              <button
                                type="button"
                                onClick={onPrevious}
                                aria-label="WMP Previous"
                                className="pcw-win98-out w-[15px] h-[14px] flex items-center justify-center text-[#111] cursor-pointer"
                              >
                                <SkipBack className="w-2 h-2 fill-current" />
                              </button>
                              <button
                                type="button"
                                onClick={onNext}
                                aria-label="WMP Next"
                                className="pcw-win98-out w-[15px] h-[14px] flex items-center justify-center text-[#111] cursor-pointer"
                              >
                                <SkipForward className="w-2 h-2 fill-current" />
                              </button>
                              <button
                                type="button"
                                onClick={handleToggleMute}
                                aria-label="WMP Audio Mute"
                                className="pcw-win98-out w-[15px] h-[14px] flex items-center justify-center text-[#111] cursor-pointer ml-[2px]"
                              >
                                {volume <= 0.01 ? (
                                  <VolumeX className="w-2 h-2 text-[#B91C1C]" />
                                ) : (
                                  <Volume2 className="w-2 h-2 text-[#1E3A8A]" />
                                )}
                              </button>
                            </div>

                            {/* Sunken Black Status Readout */}
                            <div className="bg-[#000000] border border-[#808080] px-1.5 py-[1px] font-mono text-[clamp(6px,2.5cqh,8.5px)] text-[#00FF00] truncate flex-1 text-right tabular-nums">
                              {formatWmp64StatusLabel(isStandby, isPlaying, isResolvingVideo)} ·{' '}
                              {formatWinampLcdTime(elapsedSec)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* OSD Toast Banner */}
                    {osdBanner && (
                      <div className="absolute top-2 right-2 z-40 bg-[#000080] border border-[#00FF00] px-2 py-1 font-mono text-[clamp(7px,2.8cqh,9px)] text-[#00FF00] shadow-md">
                        {osdBanner}
                      </div>
                    )}

                    {/* Animated Win98 Pixel Arrow Cursor + #FFFFE1 Tooltip Guide (Dismisses Permanently on Click/Tap/Move) */}
                    {!cursorGuideDismissed && !winampOpen && !mediaPlayerOpen && (
                      <div
                        id="win98-animated-cursor-guide"
                        data-testid="win98-animated-cursor-guide"
                        aria-hidden="true"
                        style={{
                          left:
                            cursorStopIdx === 0
                              ? '12%'
                              : cursorStopIdx === 1
                                ? '12%'
                                : cursorStopIdx === 2
                                  ? '28%'
                                  : '8%',
                          top:
                            cursorStopIdx === 0
                              ? '44%'
                              : cursorStopIdx === 1
                                ? '66%'
                                : cursorStopIdx === 2
                                  ? '13%'
                                  : '88%',
                          transition:
                            'left 620ms cubic-bezier(0.22, 1, 0.36, 1), top 620ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                        className="pointer-events-none absolute z-35 flex flex-col items-start"
                      >
                        <svg
                          viewBox="0 0 16 21"
                          width="16"
                          height="21"
                          shapeRendering="crispEdges"
                          className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.45)]"
                        >
                          <polygon
                            points="1,1 1,16 5,12 8,19 10,18 7,11 12,11"
                            fill="#FFFFFF"
                            stroke="#000000"
                            strokeWidth="1.2"
                          />
                        </svg>
                        <span
                          style={{
                            backgroundColor: '#FFFFE1',
                            border: '1px solid #000000',
                            fontFamily: "'Tahoma', 'MS Sans Serif', sans-serif",
                          }}
                          className="ml-3 -mt-1 px-1 py-[0.5px] text-[9px] leading-tight text-[#000000] whitespace-nowrap shadow-[1px_1px_0_rgba(0,0,0,0.35)]"
                        >
                          {cursorStopIdx === 0
                            ? 'Winamp'
                            : cursorStopIdx === 1
                              ? 'Media Player'
                              : cursorStopIdx === 2
                                ? 'Load Spotify'
                                : 'Start'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Interactive Raised Windows 98 Start Menu (w/ Programs -> Accessories -> Entertainment -> Media Player) */}
                  {startMenuOpen && (
                    <div
                      id="win98-start-menu"
                      data-testid="win98-start-menu"
                      onClick={(e) => e.stopPropagation()}
                      className="pcw-win98-out absolute left-[2px] bottom-[clamp(18px,11cqh,25px)] z-50 w-[148px] flex shadow-[3px_3px_0_rgba(0,0,0,0.45)]"
                    >
                      <div
                        style={{
                          background: 'linear-gradient(to top, #000080 0%, #1084D0 100%)',
                          writingMode: 'vertical-rl',
                        }}
                        className="w-[16px] rotate-180 px-[1px] py-1.5 font-sans text-[10px] font-extrabold text-white tracking-wide flex items-center justify-start shrink-0"
                      >
                        Windows<span className="font-normal opacity-90">98</span>
                      </div>

                      <div className="flex-1 py-0.5 text-[9.5px] font-sans text-[#111111]">
                        {[
                          {
                            label: 'Programs ▸',
                            hasSub: true,
                            action: () => {
                              setProgramsOpen((p) => !p);
                              setAccessoriesOpen(false);
                              setEntertainmentOpen(false);
                            },
                          },
                          { label: 'Favorites ▸', action: onOpenSpotifyModal },
                          { label: 'Documents ▸', action: onFocusPlaylistModule },
                          {
                            label: 'Settings ▸',
                            action: () => triggerOsdToast('SoundBlaster 16 IRQ 5'),
                          },
                          {
                            label: 'Help',
                            action: () => triggerOsdToast('Click any floppy disk to play!'),
                          },
                          { label: 'Run...', action: onOpenSpotifyModal },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              item.action();
                              if (!item.hasSub) closeAllMenus();
                            }}
                            className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white flex items-center justify-between cursor-pointer"
                          >
                            <span>{item.label}</span>
                          </button>
                        ))}
                        <div className="my-[2px] border-t border-[#808080] border-b border-white" />
                        <button
                          type="button"
                          onClick={() => {
                            onStop();
                            closeAllMenus();
                          }}
                          className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                        >
                          Log Off...
                        </button>
                        <button
                          type="button"
                          data-testid="win98-start-shutdown-btn"
                          onClick={() => {
                            closeAllMenus();
                            if (onTriggerPcShutdown) {
                              onTriggerPcShutdown();
                            } else {
                              onToggleMonitorPower();
                            }
                          }}
                          className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                        >
                          Shut Down...
                        </button>
                      </div>

                      {/* Programs Submenu */}
                      {programsOpen && (
                        <div className="pcw-win98-out absolute left-full top-0 w-[118px] py-0.5 text-[9.5px] text-[#111111]">
                          <button
                            type="button"
                            onClick={() => {
                              setAccessoriesOpen((a) => !a);
                              setEntertainmentOpen(false);
                            }}
                            className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                          >
                            Accessories ▸
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWinampOpen(true);
                              setWinampMinimized(false);
                              setActiveCrtWindow('winamp');
                              closeAllMenus();
                            }}
                            className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                          >
                            ⚡ Winamp 2.91
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              launchMediaPlayer();
                              closeAllMenus();
                            }}
                            className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                          >
                            🎞 Media Player
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenSpotifyModal();
                              closeAllMenus();
                            }}
                            className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                          >
                            🎵 Load Spotify
                          </button>

                          {/* Accessories -> Entertainment -> Media Player */}
                          {accessoriesOpen && (
                            <div className="pcw-win98-out absolute left-full top-0 w-[108px] py-0.5 text-[9.5px] text-[#111111]">
                              <button
                                type="button"
                                onClick={() => setEntertainmentOpen((ent) => !ent)}
                                className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                              >
                                Entertainment ▸
                              </button>
                              {entertainmentOpen && (
                                <div className="pcw-win98-out absolute left-full top-0 w-[104px] py-0.5 text-[9.5px] text-[#111111]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      launchMediaPlayer();
                                      closeAllMenus();
                                    }}
                                    className="w-full px-2 py-[2.5px] text-left hover:bg-[#000080] hover:text-white cursor-pointer"
                                  >
                                    🎞 Media Player
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom #C0C0C0 3D Beveled Windows 98 Taskbar */}
                  <div
                    id="win98-taskbar"
                    onClick={(e) => e.stopPropagation()}
                    className="pcw-win98-out relative z-30 h-[clamp(18px,11cqh,25px)] px-[3px] flex items-center justify-between gap-1 shrink-0"
                  >
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <button
                        type="button"
                        data-testid="win98-start-btn"
                        onClick={() => {
                          setStartMenuOpen((o) => !o);
                          setProgramsOpen(false);
                          setAccessoriesOpen(false);
                          setEntertainmentOpen(false);
                        }}
                        className={`${
                          startMenuOpen ? 'pcw-win98-in' : 'pcw-win98-out'
                        } h-[80%] px-1.5 flex items-center gap-1 font-sans text-[clamp(7.5px,3cqh,10px)] font-bold text-[#111111] cursor-pointer shrink-0`}
                      >
                        <span className="grid grid-cols-2 w-[8px] h-[8px] gap-[1px]" aria-hidden="true">
                          <span className="bg-[#E63946]" />
                          <span className="bg-[#2ECC71]" />
                          <span className="bg-[#3B82F6]" />
                          <span className="bg-[#FACC15]" />
                        </span>
                        <span>Start</span>
                      </button>

                      {/* Winamp Taskbar Tab (shown when Winamp window is open) */}
                      {winampOpen && (
                        <button
                          type="button"
                          onClick={() => {
                            setWinampMinimized((m) => !m);
                            setActiveCrtWindow('winamp');
                          }}
                          className={`${
                            !winampMinimized && activeCrtWindow === 'winamp'
                              ? 'pcw-win98-in font-bold'
                              : 'pcw-win98-out'
                          } h-[80%] px-1 flex items-center gap-1 min-w-0 max-w-[38cqw] font-sans text-[clamp(7px,2.7cqh,9.5px)] text-[#111111] truncate cursor-pointer`}
                        >
                          <span className="w-[10px] h-[10px] shrink-0">
                            <PixelWinampIcon />
                          </span>
                          <span className="truncate">
                            Winamp - [{isStandby ? 'Ready' : track.title}]
                          </span>
                        </button>
                      )}

                      {/* Media Player Taskbar Tab (shown when Media Player window is open) */}
                      {mediaPlayerOpen && (
                        <button
                          type="button"
                          data-testid="taskbar-media-player-tab"
                          onClick={() => {
                            setMediaPlayerMinimized((m) => !m);
                            setActiveCrtWindow('media-player');
                          }}
                          className={`${
                            !mediaPlayerMinimized && activeCrtWindow === 'media-player'
                              ? 'pcw-win98-in font-bold'
                              : 'pcw-win98-out'
                          } h-[80%] px-1 flex items-center gap-1 min-w-0 max-w-[30cqw] font-sans text-[clamp(7px,2.7cqh,9.5px)] text-[#111111] truncate cursor-pointer`}
                        >
                          <span className="w-[10px] h-[10px] shrink-0">
                            <PixelMediaPlayerIcon />
                          </span>
                          <span className="truncate">Media Player</span>
                        </button>
                      )}
                    </div>

                    {/* Recessed System Tray */}
                    <div className="pcw-win98-in h-[80%] px-1.5 flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        aria-label={volume <= 0.01 ? 'Unmute Audio' : 'Mute Audio'}
                        className="cursor-pointer flex items-center"
                      >
                        {volume <= 0.01 ? (
                          <VolumeX className="w-2.5 h-2.5 text-[#B91C1C]" />
                        ) : (
                          <Volume2 className="w-2.5 h-2.5 text-[#1E3A8A]" />
                        )}
                      </button>
                      <span className="font-sans text-[clamp(7px,2.6cqh,9px)] font-medium text-[#111111] tabular-nums">
                        {formatWin98SystemClock(systemTime)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              </div>

              {/* Subtle Phosphor Scanlines + Glass Glint & Vignette */}
              <div className="pcw-crt-scanlines absolute inset-0 z-40" />
              <div className="pcw-crt-vignette absolute inset-0 z-50 rounded-[6px]" />
            </div>
          </div>
        </div>

        {/* Lower Monitor Chin: Centered DELL Badge + OSD Pips + Power Button & LED */}
        <div
          className={`relative z-10 flex items-center justify-between px-1 ${
            compact ? 'pt-[3px]' : 'pt-[5px]'
          } shrink-0`}
        >
          <div className="flex items-center gap-[2px]" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="w-[2px] h-[5px] bg-[#969081] rounded-full" />
            ))}
          </div>

          <div className="flex items-center justify-center">
            <span className="font-sans text-[9.5px] font-black tracking-[0.14em] text-[#4A4D52] select-none">
              D<span className="inline-block -rotate-12">E</span>LL
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {!compact && (
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangeVolume(Math.max(0, volume - 0.1))}
                  className="px-1 h-[11px] rounded-[2px] border border-[#9E9787] bg-[#CEC7B8] text-[7px] font-bold text-[#4A4D52] cursor-pointer"
                  title="Decrease Volume"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => onChangeVolume(Math.min(1, volume + 0.1))}
                  className="px-1 h-[11px] rounded-[2px] border border-[#9E9787] bg-[#CEC7B8] text-[7px] font-bold text-[#4A4D52] cursor-pointer"
                  title="Increase Volume"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => triggerOsdToast('TRINITRON 1024×768 75Hz')}
                  className="px-1 h-[11px] rounded-[2px] border border-[#9E9787] bg-[#CEC7B8] text-[6.5px] font-bold text-[#4A4D52] cursor-pointer"
                >
                  MENU
                </button>
              </div>
            )}

            <button
              id="crt-power-btn"
              type="button"
              data-testid="crt-power-btn"
              onClick={onToggleMonitorPower}
              title="Toggle CRT Monitor Power"
              className="flex items-center gap-1 cursor-pointer"
            >
              <span
                data-testid="crt-power-led"
                style={{
                  backgroundColor:
                    !monitorPoweredOn || pcPowerPhase === 'off'
                      ? '#D97706'
                      : '#00E640',
                  boxShadow:
                    !monitorPoweredOn || pcPowerPhase === 'off'
                      ? '0 0 4px #D97706'
                      : '0 0 5px #00E640',
                }}
                className="w-[6px] h-[6px] rounded-full border border-black/35"
              />
              <span className="w-[12px] h-[12px] rounded-full bg-[#CCC6B7] border border-[#8E8878] shadow-[inset_1px_1px_0_#F2EFE6] flex items-center justify-center">
                <Power className="w-2 h-2 text-[#4A4D52]" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Footless CRT Housing Sits Directly Flush on Oak Desk */}

      {/* PART 5: True Full-Screen Double-Click YouTube Takeover Portal (Escapes CRT Container Containment) */}
      {isWmpFullscreen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={fsOverlayRef}
            id="wmp-fullscreen-video-overlay"
            data-testid="wmp-fullscreen-video-overlay"
            onMouseMove={resetFsControlsTimer}
            onTouchStart={resetFsControlsTimer}
            onDoubleClick={(e) => {
              e.stopPropagation();
              exitWmpFullscreen();
            }}
            onClick={(e) => {
              e.stopPropagation();
              const now = Date.now();
              if (now - lastFsTapMsRef.current <= 300) {
                lastFsTapMsRef.current = 0;
                exitWmpFullscreen();
                return;
              }
              lastFsTapMsRef.current = now;
              resetFsControlsTimer();
            }}
            style={{
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100dvh',
              zIndex: 10005,
              backgroundColor: '#000000',
            }}
            className="flex items-center justify-center overflow-hidden select-none"
          >
            <iframe
              key={`fs-${track.id}-${wmpVideoId}`}
              ref={fsIframeRef}
              title={`Full-Screen Video - ${track.title}`}
              src={buildWmpEmbedUrl(true, fsStartSecRef.current)}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={() => {
                try {
                  const win = fsIframeRef.current?.contentWindow;
                  if (win) {
                    win.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: '' }), '*');
                    win.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
                    win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: '' }), '*');
                  }
                } catch {
                  // ignore cross-origin load timing
                }
              }}
              className="w-full h-full border-0 pointer-events-none"
            />
            {/* Transparent Double-Click/Double-Tap Exit Shield */}
            <div className="absolute inset-0 z-10 cursor-pointer" aria-hidden="true" />

            {/* Auto-Hiding Top-Right Exit Button */}
            <button
              id="wmp-fullscreen-exit-btn"
              data-testid="wmp-fullscreen-exit-btn"
              type="button"
              aria-label="Exit Full-Screen Video"
              onClick={(e) => {
                e.stopPropagation();
                exitWmpFullscreen();
              }}
              style={{
                top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                right: '16px',
                opacity: fsOverlayControlsVisible ? 1 : 0,
                pointerEvents: fsOverlayControlsVisible ? 'auto' : 'none',
              }}
              className="fixed z-20 w-10 h-10 rounded-full bg-black/70 border border-white/25 text-white flex items-center justify-center transition-opacity duration-300 cursor-pointer hover:bg-black/90"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>

            {/* Subtle Auto-Hiding Bottom Hint */}
            <div
              style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
                opacity: fsOverlayControlsVisible ? 0.85 : 0,
              }}
              className="fixed left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/70 border border-white/15 font-sans text-[11px] font-medium text-white/90 pointer-events-none transition-opacity duration-300 whitespace-nowrap"
            >
              Double-click or press Esc to return
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

interface Dell1998CpuTowerProps {
  isPlaying: boolean;
  floppyLedActive: boolean;
  hddBootFlicker?: boolean;
  pcPoweredOn?: boolean;
  monitorPoweredOn: boolean;
  compact?: boolean;
  onTogglePower: () => void;
  onEjectCd: () => void;
  onPressFloppyEject: () => void;
}

export const Dell1998CpuTower: React.FC<Dell1998CpuTowerProps> = ({
  isPlaying,
  floppyLedActive,
  hddBootFlicker = false,
  pcPoweredOn = true,
  compact = false,
  onTogglePower,
  onEjectCd,
  onPressFloppyEject,
}) => {
  const [cdTrayOpen, setCdTrayOpen] = useState(false);

  return (
    <aside
      id="dell-1998-cpu-tower"
      data-testid="dell-1998-cpu-tower"
      data-pc-powered={pcPoweredOn ? 'true' : 'false'}
      aria-label="1998 Beige Dell Pentium II Tower"
      className="pcw-cpu-tower-unit relative flex flex-col justify-end select-none"
    >
      {/* Putty-Beige Tower Chassis Above Molded Isolation Feet */}
      <div
        className={`pcw-beige-abs-shell relative w-full flex-1 min-h-0 flex flex-col justify-between ${
          compact ? 'p-[5px] rounded-[6px]' : 'p-[8px] rounded-[8px]'
        } overflow-hidden`}
      >
      <div className="pcw-beige-abs-grain absolute inset-0 rounded-[inherit]" />

      {/* Top Optical 5.25" Drive Stack */}
      <div className="relative z-10 flex flex-col gap-[3px] shrink-0">
        {/* CD-ROM Drive Bay (32X MAX) */}
        <div className="bg-[#CCC6B8] border border-[#969082] shadow-[inset_1px_1px_0_#ECE8DE] p-[3px] rounded-[2px]">
          <div className="flex items-center justify-between gap-1 mb-[2px]">
            <span className="font-sans text-[6px] font-bold text-[#52555A] tracking-wider uppercase truncate">
              32X MAX
            </span>
            <span className="font-sans text-[5.5px] text-[#666970]">CD</span>
          </div>

          <div
            className={`w-full ${
              compact ? 'h-[6px]' : 'h-[8px]'
            } bg-gradient-to-b from-[#DFDAD0] to-[#BEB8A8] border border-[#8E887A] rounded-[1px] flex items-center justify-center transition-transform ${
              cdTrayOpen ? 'translate-y-[1px] brightness-90' : ''
            }`}
          >
            <span className="w-[40%] h-[1px] bg-[#787266]" />
          </div>

          <div className="mt-[2.5px] flex items-center justify-between gap-1">
            <div className="flex items-center gap-[2.5px]">
              <span className="w-[3.5px] h-[3.5px] rounded-full bg-[#242629] border border-[#7C7668]" />
              <span className="w-[6px] h-[2px] bg-[#8E8878] rounded-full" />
              <span
                className={`w-[3.5px] h-[3.5px] rounded-full ${
                  pcPoweredOn && (isPlaying || cdTrayOpen)
                    ? 'bg-[#00E640] shadow-[0_0_4px_#00E640]'
                    : 'bg-[#404A40]'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setCdTrayOpen((o) => !o);
                onEjectCd();
              }}
              aria-label="Eject CD-ROM Tray"
              title="Open / Close 32X CD-ROM Tray"
              className="w-[12px] h-[5.5px] bg-[#D6D0C2] border border-[#847E70] rounded-[1px] shadow-[inset_0.5px_0.5px_0_#FFFFFF] cursor-pointer active:translate-y-[0.5px]"
            />
          </div>
        </div>

        {!compact && (
          <div className="h-[11px] bg-[#CBC5B7] border border-[#969082] shadow-[inset_1px_1px_0_#ECE8DE] rounded-[2px]" />
        )}

        {/* Interactive 3.5" Floppy Disk Drive Bay */}
        <div
          id="dell-floppy-drive-bay"
          data-testid="dell-floppy-drive-bay"
          className="bg-[#CEC8BA] border border-[#948E80] shadow-[inset_1px_1px_0_#ECE8DE] p-[3px] rounded-[2px]"
        >
          <div className="relative w-full h-[7px] bg-[#1C1E22] border border-[#7C7668] rounded-[1px] flex items-center justify-center">
            <span className="w-[26%] h-[5px] bg-[#2D3035] border-x border-[#494D54]" />
          </div>

          <div className="mt-[2.5px] flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span
                data-testid="cpu-floppy-led"
                data-led-on={pcPoweredOn && floppyLedActive ? 'true' : 'false'}
                className={`w-[5.5px] h-[3.5px] rounded-[1px] border border-black/30 ${
                  pcPoweredOn && floppyLedActive
                    ? 'bg-[#00FF3C] shadow-[0_0_6px_#00FF3C]'
                    : 'bg-[#2C3A2E]'
                }`}
              />
              <span className="font-mono text-[5.5px] text-[#5C584D]">3.5&quot;</span>
            </div>

            {/* Protruding Physical Floppy Eject Button */}
            <button
              type="button"
              data-testid="cpu-floppy-eject-btn"
              onClick={onPressFloppyEject}
              aria-label="Eject 3.5-inch Floppy Disk"
              title="Eject active 3.5-inch floppy disk"
              className="w-[14px] h-[6.5px] bg-[#DED8CA] border border-[#7D7768] rounded-[1px] shadow-[inset_1px_1px_0_#FFFFFF] cursor-pointer active:translate-y-[0.5px]"
            />
          </div>
        </div>
      </div>

      {/* Middle Control Column: Power Button, Power LED, HDD Amber LED */}
      <div className="relative z-10 my-auto flex flex-col items-center gap-[4px] py-0.5">
        <div className="flex items-center gap-1.5">
          <button
            id="cpu-power-btn"
            type="button"
            data-testid="cpu-power-btn"
            onClick={onTogglePower}
            aria-label="PC Tower Power Button"
            title={pcPoweredOn ? 'Shut Down Windows 98 PC' : 'Power On Windows 98 PC'}
            className={`${
              compact ? 'w-[16px] h-[16px]' : 'w-[20px] h-[20px]'
            } rounded-full bg-gradient-to-b from-[#BDB6A6] to-[#DFD9CC] border border-[#7C7668] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.28)] flex items-center justify-center cursor-pointer active:scale-95`}
          >
            <Power className="w-2 h-2 text-[#4A4D52]" />
          </button>

          <div className="flex flex-col gap-[2px]">
            <div className="flex items-center gap-1">
              <span
                data-testid="cpu-power-led"
                className={`w-[4.5px] h-[4.5px] rounded-full ${
                  pcPoweredOn
                    ? 'bg-[#00E640] shadow-[0_0_5px_#00E640]'
                    : 'bg-[#363D36]'
                }`}
              />
              <span className="font-mono text-[5.5px] text-[#5A564C]">PWR</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                data-testid="cpu-hdd-led"
                className={`w-[4.5px] h-[4.5px] rounded-full ${
                  pcPoweredOn && (isPlaying || floppyLedActive || hddBootFlicker)
                    ? 'bg-[#FF8C00] shadow-[0_0_5px_#FF8C00]'
                    : 'bg-[#463626]'
                }`}
              />
              <span className="font-mono text-[5.5px] text-[#5A564C]">HDD</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grille, DELL Badge & Intel Pentium II Sticker */}
      <div className="relative z-10 flex flex-col gap-[3px] shrink-0">
        <div
          aria-hidden="true"
          className="w-full space-y-[1.5px] px-[2px] py-[2px] bg-[#C6C0B2] border border-[#9E9788] rounded-[2px]"
        >
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="w-full h-[1.5px] bg-[#666156] rounded-full" />
          ))}
        </div>

        <div className="flex items-center justify-between gap-1 px-[1px]">
          <span className="font-sans text-[8px] font-black tracking-[0.12em] text-[#4A4D52]">
            D<span className="inline-block -rotate-12">E</span>LL
          </span>

          <div className="flex items-center gap-[2px]">
            <div
              className="px-1 py-[0.5px] rounded-[1px] border border-[#6898D8] text-[5px] font-sans font-extrabold leading-tight text-white"
              style={{
                background: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 55%, #1D4ED8 100%)',
              }}
            >
              <div>intel</div>
              <div className="text-[#FACC15] text-[4.5px]">pentium®II</div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Footless CPU Tower Chassis Sits Directly Flush on Oak Desk */}
    </aside>
  );
};
