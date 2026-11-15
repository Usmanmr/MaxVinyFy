import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Maximize2,
  Minimize2,
  Disc3,
  Pointer,
  Shuffle,
  SkipForward,
  ChevronDown,
  Trash2,
  Check,
  X,
  Power,
  Tv,
  Sparkles,
} from 'lucide-react';
import {
  selectActiveTvFrame,
  formatDuration,
  getTvChannelTheme,
  getNextTvChannelIndex,
  getBinaryKnobAngle,
  buildCleanYouTubeEmbedUrl,
  triggerButtonHaptic,
  CRT_TINT_PRESETS,
  getNextCrtTintIndex,
  resolveActiveArtworkState,
  TV_CHANNEL_CHANGE_MS,
  type TrackItem,
  type YouTubeGrabFrame,
  type TvSongVideoChannel,
  type PlaylistPack,
  type DominantThemePalette,
} from '../utils/playerLogic';
import {
  playbackClockStore,
  usePlaybackTvBucket,
} from '../utils/playbackStore';

export const BrandHeader = React.memo<{
  themePalette: DominantThemePalette;
  isPlaying?: boolean;
  isStandby?: boolean;
  isDocumentHidden?: boolean;
  prefersReducedMotion?: boolean;
  compact?: boolean;
  className?: string;
}>(({
  themePalette,
  isPlaying = false,
  isStandby = true,
  isDocumentHidden = false,
  prefersReducedMotion = false,
  compact = false,
  className = '',
}) => {
  const shouldSpin = Boolean(
    isPlaying && !isStandby && !isDocumentHidden && !prefersReducedMotion
  );

  return (
    <div
      id="app-brand-header"
      className={`relative z-20 flex items-center gap-2.5 shrink-0 ${className}`}
    >
      <div
        id="mvf-logo-badge"
        data-spinning={shouldSpin ? 'true' : 'false'}
        style={{
          animationDuration: '1.8s',
          animationPlayState: shouldSpin ? 'running' : 'paused',
        }}
        className={`vinyl-platter-gpu-spin relative ${
          compact
            ? 'w-[34px] h-[34px] min-w-[34px] min-h-[34px]'
            : 'w-[46px] h-[46px] min-w-[46px] min-h-[46px]'
        } rounded-full inline-flex items-center justify-center shrink-0 shadow-[0_3px_10px_rgba(0,0,0,0.65)] overflow-hidden`}
      >
        <img
          src="/turntable/vinyl-record.webp"
          alt="Spinning MVF Vinyl Record Logo"
          draggable={false}
          className="pointer-events-none absolute inset-0 w-full h-full object-cover"
        />
        <div
          style={{
            background: `linear-gradient(135deg, ${themePalette.primaryHex} 0%, ${themePalette.darkHex} 100%)`,
          }}
          className="relative z-10 w-[46%] h-[46%] rounded-full border border-black/75 flex items-center justify-center shadow-inner"
        >
          <span
            className={`font-display font-extrabold ${
              compact ? 'text-[6.5px] -translate-y-[2px]' : 'text-[8px] -translate-y-[3px]'
            } leading-none tracking-tighter text-white`}
          >
            MVF
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-[#090807] border border-white/40"
          />
        </div>
      </div>

      <div className="flex flex-col justify-center leading-none min-w-0">
        <h1
          id="app-brand-title"
          className={`font-display ${
            compact ? 'text-base' : 'text-lg sm:text-[21px]'
          } font-extrabold tracking-tight text-[#f8ead6] drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)] leading-none truncate`}
        >
          MaxVinyFy
        </h1>
        <p
          id="app-brand-subtitle"
          style={{ color: themePalette.lightHex }}
          className={`${
            compact ? 'text-[9.5px] mt-0.5' : 'text-[10.5px] mt-1'
          } font-medium tracking-wider opacity-90 leading-none truncate`}
        >
          by xuMax interActive
        </p>
      </div>
    </div>
  );
});

interface RetroTvTableProps {
  track: TrackItem;
  isPlaying: boolean;
  isDocumentHidden?: boolean;
  volume?: number;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
  compactLandscape?: boolean;
  themePalette: DominantThemePalette;
  onChangeVolume?: (nextVolume: number) => void;
  onResolvedTrackMetadata?: (
    trackId: string,
    artworkUrl: string,
    videoId: string,
    frames: YouTubeGrabFrame[]
  ) => void;
}

/** Crossfading CRT image stage — updates at most once every 5 seconds with lazy loading & opacity crossfade */
const TvFrameCrossfadeStage = React.memo<{
  effectiveTrack: TrackItem;
  manualFrameIndex: number | null;
  frameOffset: number;
  channelCode: string;
  channelName: string;
  lowPowerMode: boolean;
  prefersReducedMotion: boolean;
}>(
  ({
    effectiveTrack,
    manualFrameIndex,
    frameOffset,
    channelCode,
    channelName,
    lowPowerMode,
    prefersReducedMotion,
  }) => {
    const tvBucketSec = usePlaybackTvBucket();
    const totalFrames = Math.max(1, effectiveTrack.tvFrames.length);
    const baseSelection = selectActiveTvFrame(effectiveTrack, tvBucketSec, manualFrameIndex);
    const channelAdjustedIndex = (baseSelection.frameIndex + frameOffset) % totalFrames;
    const activeFrame = effectiveTrack.tvFrames[channelAdjustedIndex] || baseSelection.frame;

    const fallbackArt = resolveActiveArtworkState(effectiveTrack, 0).activeUrl || effectiveTrack.artworkUrl;
    const [slotImages, setSlotImages] = useState<[string, string]>([
      activeFrame.imageUrl || fallbackArt,
      '',
    ]);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
      const nextUrl = activeFrame.imageUrl || fallbackArt;
      if (!nextUrl) return;
      setImgError(false);

      if (lowPowerMode || prefersReducedMotion) {
        setSlotImages([nextUrl, '']);
        setActiveSlot(0);
        return;
      }

      setSlotImages((prev) => {
        if (prev[activeSlot] === nextUrl) return prev;
        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
        const updated: [string, string] = [...prev] as [string, string];
        updated[nextSlot] = nextUrl;
        setActiveSlot(nextSlot);
        return updated;
      });
    }, [activeFrame.imageUrl, fallbackArt, lowPowerMode, prefersReducedMotion]);

    if (imgError || (!slotImages[0] && !slotImages[1])) {
      return (
        <div
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse at 45% 42%, #242d28 0%, #161c19 56%, #0b0e0d 100%)',
          }}
          className="w-full h-full"
        />
      );
    }

    const fadeClass =
      lowPowerMode || prefersReducedMotion ? '' : 'transition-opacity duration-500';

    return (
      <div className="relative w-full h-full">
        {slotImages[0] && (
          <img
            src={slotImages[0]}
            alt={`${channelCode} ${channelName} · ${effectiveTrack.title}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (fallbackArt && slotImages[0] !== fallbackArt) {
                setSlotImages([fallbackArt, '']);
                setActiveSlot(0);
              } else {
                setImgError(true);
              }
            }}
            style={{ opacity: activeSlot === 0 ? 0.96 : 0 }}
            className={`absolute inset-0 w-full h-full object-cover ${fadeClass}`}
          />
        )}
        {slotImages[1] && (
          <img
            src={slotImages[1]}
            alt={`${channelCode} ${channelName} · ${effectiveTrack.title}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (fallbackArt && slotImages[1] !== fallbackArt) {
                setSlotImages([fallbackArt, '']);
                setActiveSlot(0);
              } else {
                setImgError(true);
              }
            }}
            style={{ opacity: activeSlot === 1 ? 0.96 : 0 }}
            className={`absolute inset-0 w-full h-full object-cover ${fadeClass}`}
          />
        )}
      </div>
    );
  }
);

export const RetroTvTable = React.memo<RetroTvTableProps>(
  ({
    track,
    isPlaying,
    isDocumentHidden = false,
    lowPowerMode,
    prefersReducedMotion,
    compactLandscape = false,
    themePalette,
    onResolvedTrackMetadata,
  }) => {
    const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;

    // 1. POWER knob state (On by default; when Off, screen goes dark/static)
    const [tvPoweredOn, setTvPoweredOn] = useState<boolean>(true);
    // 2. CHANNEL knob state (CH 1 = official video, CH 2..CH 5 = top 4 most-viewed YouTube videos for this song)
    const [channelIndex, setChannelIndex] = useState<number>(0);
    // 5-channel YouTube video cache per track ID
    const [songChannels, setSongChannels] = useState<TvSongVideoChannel[]>([]);
    const [manualFrameIndex, setManualFrameIndex] = useState<number | null>(null);
    const [liveFrames, setLiveFrames] = useState<YouTubeGrabFrame[] | null>(null);
    const [resolvedVideoId, setResolvedVideoId] = useState<string>(track.youtubeVideoId);

    // 3 Analogue Push-Buttons below the 2 knobs:
    // Button 1: Fullscreen (#tv-btn-fullscreen)
    const [isTvFullscreen, setIsTvFullscreen] = useState<boolean>(false);
    // Button 2: Scanlines (#tv-btn-scanlines)
    const [crtScanlinesOn, setCrtScanlinesOn] = useState<boolean>(true);
    // Button 3: Tint / Broadcast Phosphor preset (#tv-btn-tint)
    const [tintPresetIndex, setTintPresetIndex] = useState<number>(0);

    const [isChannelChanging, setIsChannelChanging] = useState<boolean>(false);
    const [channelFlashTick, setChannelFlashTick] = useState<number>(0);

    const tvScreenRef = useRef<HTMLDivElement | null>(null);
    const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
    const prevTrackIdRef = useRef<string>(track.id);
    const channelFlashTimerRef = useRef<number | null>(null);
    const channelsCacheByTrackRef = useRef<Map<string, TvSongVideoChannel[]>>(new Map());

    const activeChannelTheme = getTvChannelTheme(channelIndex);
    const activeTintPreset = CRT_TINT_PRESETS[tintPresetIndex] || CRT_TINT_PRESETS[0];

    // Fullscreen synchronization + Escape key exit listener
    useEffect(() => {
      const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
          setIsTvFullscreen(false);
        } else if (tvScreenRef.current && document.fullscreenElement === tvScreenRef.current) {
          setIsTvFullscreen(true);
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsTvFullscreen(false);
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
        }
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, []);

    const triggerOneShotChannelChange = () => {
      if (prefersReducedMotion || lowPowerMode) return;
      if (channelFlashTimerRef.current !== null) {
        window.clearTimeout(channelFlashTimerRef.current);
      }
      setIsChannelChanging(true);
      setChannelFlashTick((tick) => tick + 1);
      channelFlashTimerRef.current = window.setTimeout(() => {
        setIsChannelChanging(false);
        channelFlashTimerRef.current = null;
      }, TV_CHANNEL_CHANGE_MS);
    };

    useEffect(() => {
      return () => {
        if (channelFlashTimerRef.current !== null) {
          window.clearTimeout(channelFlashTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (prevTrackIdRef.current !== track.id) {
        prevTrackIdRef.current = track.id;
        setChannelIndex(0);
        if (!isStandby && tvPoweredOn) {
          triggerOneShotChannelChange();
        } else {
          setIsChannelChanging(false);
        }
      }
    }, [track.id, isStandby, tvPoweredOn, prefersReducedMotion, lowPowerMode]);

    const trackRef = useRef(track);
    trackRef.current = track;

    // Fetch 5 YouTube video channels (CH 1 official + CH 2-5 top 4 most-viewed alternates) for the current song
    useEffect(() => {
      const currentTrack = trackRef.current;
      setManualFrameIndex(null);
      setLiveFrames(null);
      setResolvedVideoId(currentTrack.youtubeVideoId);

      const cached = channelsCacheByTrackRef.current.get(currentTrack.id);
      if (cached && cached.length > 0) {
        setSongChannels(cached);
        setLiveFrames(cached[0].frames);
        setResolvedVideoId(cached[0].videoId);
        return;
      }

      if (isStandby || !currentTrack.title) return;

      let cancelled = false;
      const targetTrackId = currentTrack.id;
      const fetchSongYouTubeGrabs = async () => {
        try {
          const params = new URLSearchParams({
            title: currentTrack.title,
            artist: currentTrack.artist,
            trackId: targetTrackId,
            videoId: currentTrack.youtubeVideoId,
          });
          const res = await fetch(`/api/youtube/search-grabs?${params.toString()}`);
          if (!res.ok || cancelled) return;
          const data = await res.json();
          if (cancelled || trackRef.current.id !== targetTrackId) return;

          if (Array.isArray(data.channels) && data.channels.length > 0) {
            channelsCacheByTrackRef.current.set(targetTrackId, data.channels);
            setSongChannels(data.channels);
          }

          if (Array.isArray(data.frames) && data.frames.length > 0) {
            setLiveFrames(data.frames);
            if (data.videoId) setResolvedVideoId(data.videoId);

            if (onResolvedTrackMetadata) {
              onResolvedTrackMetadata(
                targetTrackId,
                data.artworkUrl || currentTrack.artworkUrl,
                data.videoId || currentTrack.youtubeVideoId,
                data.frames
              );
            }
          }
        } catch {
          // Fallback to pre-populated frames
        }
      };

      fetchSongYouTubeGrabs();
      return () => {
        cancelled = true;
      };
    }, [track.id, isStandby, onResolvedTrackMetadata]);

    // Resolve active channel's videoId and frames from the 5-channel song video list
    const activeSongChannel: TvSongVideoChannel | null =
      songChannels[channelIndex] || songChannels[0] || null;
    const activeChannelVideoId =
      activeSongChannel?.videoId || resolvedVideoId || track.youtubeVideoId;
    const activeChannelFrames =
      activeSongChannel?.frames && activeSongChannel.frames.length > 0
        ? activeSongChannel.frames
        : liveFrames && liveFrames.length > 0
        ? liveFrames
        : track.tvFrames;

    const effectiveTrack: TrackItem = useMemo(
      () => ({
        ...track,
        youtubeVideoId: activeChannelVideoId,
        tvFrames: activeChannelFrames,
      }),
      [track, activeChannelVideoId, activeChannelFrames]
    );

    const handleTogglePowerKnob = () => {
      triggerButtonHaptic(lowPowerMode);
      setTvPoweredOn((prev) => {
        const next = !prev;
        if (next) {
          triggerOneShotChannelChange();
        }
        return next;
      });
    };

    const handleTurnChannelKnob = () => {
      triggerButtonHaptic(lowPowerMode);
      setChannelIndex((prev) => getNextTvChannelIndex(prev));
      if (tvPoweredOn) {
        triggerOneShotChannelChange();
      }
    };

    const handleEnterTvFullscreen = async () => {
      triggerButtonHaptic(lowPowerMode);
      setIsTvFullscreen(true);
      const target = tvScreenRef.current;
      if (target && typeof target.requestFullscreen === 'function' && !document.fullscreenElement) {
        try {
          await target.requestFullscreen();
        } catch {
          // Fallback overlay fullscreen remains active even if browser blocks native requestFullscreen
        }
      }
    };

    const handleExitTvFullscreen = async () => {
      triggerButtonHaptic(lowPowerMode);
      setIsTvFullscreen(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen?.();
        } catch {
          // ignore
        }
      }
    };

    const handleToggleTvFullscreen = () => {
      if (isTvFullscreen) {
        handleExitTvFullscreen();
      } else {
        handleEnterTvFullscreen();
      }
    };

    const handleCycleTintButton = () => {
      triggerButtonHaptic(lowPowerMode);
      setTintPresetIndex((prev) => getNextCrtTintIndex(prev));
      if (tvPoweredOn) {
        triggerOneShotChannelChange();
      }
    };

    const showCrtEffects = crtScanlinesOn && !lowPowerMode;
    const powerKnobAngleDeg = getBinaryKnobAngle(tvPoweredOn);
    const channelNumberLabel = `CH ${channelIndex + 1}`;
    const knobTransition =
      prefersReducedMotion || lowPowerMode ? 'none' : 'transform 160ms linear';

    return (
      <section
        aria-label="Photorealistic 1970s CRT Television on Vintage Table"
        className="relative flex flex-col justify-between gap-1 select-none w-full h-full min-h-0 overflow-visible"
      >
        {/* Top Brand Header Always Visible at the Top of the Layout */}
        <div className="relative flex items-center justify-between shrink-0 z-20">
          <BrandHeader
            themePalette={themePalette}
            isPlaying={isPlaying}
            isStandby={isStandby}
            isDocumentHidden={isDocumentHidden}
            prefersReducedMotion={prefersReducedMotion}
            compact={compactLandscape}
          />
        </div>

        {/* 1970s-80s CRT TV Cabinet Constrained Strictly to <= 16:10 Aspect Ratio */}
        <div className="relative flex-1 min-h-0 w-full flex items-center justify-center pt-3 pb-0.5">
          {/* Static Grounding Contact Shadow Under Walnut Cabinet */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 inset-x-[8%] h-2.5 rounded-full bg-black/65 z-0"
          />

          <div
            id="retro-tv-chassis"
            data-tv-powered={tvPoweredOn ? 'true' : 'false'}
            data-tv-channel={channelNumberLabel}
            data-tv-channel-code={activeChannelTheme.code}
            data-tv-channel-video-id={activeChannelVideoId}
            data-tv-tint={activeTintPreset.code}
            style={{ aspectRatio: '16 / 10' }}
            className="walnut-furniture-cabinet relative z-10 h-full max-h-full w-auto max-w-full mx-auto overflow-visible"
          >
            {/* Four Corner Slot-Head Screws on the Raised Walnut Frame (Matching Turntable & Playlist) */}
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-40 opacity-85"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-40 opacity-85"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-40 opacity-85"
            />
            <img
              src="/console/screw-head.webp"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-40 opacity-85"
            />

            {/* Flush-Mounted Retro Rabbit-Ear Dipole Antenna Sitting Directly on Top of the TV Cabinet */}
            <div
              id="tv-rabbit-ear-antennas"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-[46%] -translate-x-1/2 translate-y-[4px] flex flex-col items-center z-20"
            >
              <svg
                viewBox="0 0 220 44"
                className={
                  compactLandscape
                    ? 'w-24 h-4 overflow-visible'
                    : 'w-32 sm:w-40 h-5 sm:h-7 overflow-visible'
                }
              >
                <defs>
                  <linearGradient id="antennaRodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#71717a" />
                    <stop offset="48%" stopColor="#f4f4f5" />
                    <stop offset="100%" stopColor="#52525b" />
                  </linearGradient>
                  <linearGradient id="antennaBaseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#5a351d" />
                    <stop offset="55%" stopColor="#2b180c" />
                    <stop offset="100%" stopColor="#140b05" />
                  </linearGradient>
                </defs>
                {/* Left & Right Brushed Chrome Dipole Rods Anchored Inside the Base Swivels */}
                <line
                  x1="96"
                  y1="36"
                  x2="16"
                  y2="3"
                  stroke="url(#antennaRodGrad)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <line
                  x1="96"
                  y1="36"
                  x2="56"
                  y2="19.5"
                  stroke="#d4d4d8"
                  strokeWidth="4.4"
                  strokeLinecap="round"
                />
                <circle cx="16" cy="3" r="4" fill="#d97706" stroke="#27272a" strokeWidth="1.2" />

                <line
                  x1="124"
                  y1="36"
                  x2="204"
                  y2="3"
                  stroke="url(#antennaRodGrad)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <line
                  x1="124"
                  y1="36"
                  x2="164"
                  y2="19.5"
                  stroke="#d4d4d8"
                  strokeWidth="4.4"
                  strokeLinecap="round"
                />
                <circle cx="204" cy="3" r="4" fill="#d97706" stroke="#27272a" strokeWidth="1.2" />

                {/* Chrome Swivel Knuckles */}
                <circle cx="96" cy="35" r="4.5" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.2" />
                <circle cx="124" cy="35" r="4.5" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.2" />

                {/* Bakelite & Walnut Flush Mounting Pedestal + Screwed Brass Bracket */}
                <path
                  d="M 70 43 L 78 31 L 142 31 L 150 43 Z"
                  fill="url(#antennaBaseGrad)"
                  stroke="#7c4d2b"
                  strokeWidth="1.4"
                />
                <rect
                  x="64"
                  y="39"
                  width="92"
                  height="5"
                  rx="1.5"
                  fill="#a16207"
                  stroke="#29170b"
                  strokeWidth="1.2"
                />
              </svg>

              {/* Flush Physical Mounting Bracket with Matching Slot-Head Screws */}
              <div
                id="tv-antenna-mount-bracket"
                className="relative -mt-[3px] w-16 sm:w-20 h-[6px] rounded-[2px] bg-gradient-to-b from-[#d6c7b2] via-[#8c7a65] to-[#3f3429] border border-black/80 shadow-[0_1px_2px_rgba(0,0,0,0.85)] flex items-center justify-between px-1.5"
              >
                <img
                  src="/console/screw-head.webp"
                  alt=""
                  draggable={false}
                  className="w-1.5 h-1.5 object-contain"
                />
                <span className="font-mono text-[4px] font-black tracking-widest text-[#1c150e] uppercase leading-none">
                  VHF/UHF
                </span>
                <img
                  src="/console/screw-head.webp"
                  alt=""
                  draggable={false}
                  className="w-1.5 h-1.5 object-contain"
                />
              </div>
            </div>

            {/* CRT Screen Aperture — Strictly 16:10 Max Aspect Ratio with Letterbox/Pillarbox Protection */}
            <div
              id="retro-tv-screen"
              ref={tvScreenRef}
              data-tv-channel={channelNumberLabel}
              data-tv-channel-label={activeSongChannel?.label || activeChannelTheme.name}
              data-tv-fullscreen={isTvFullscreen ? 'true' : 'false'}
              style={
                isTvFullscreen
                  ? {
                      borderRadius: 0,
                    }
                  : {
                      left: '7.8%',
                      top: '11.4%',
                      width: '67.5%',
                      height: '76.5%',
                      borderRadius: '7% / 10%',
                    }
              }
              className={`panel-contain overflow-hidden bg-[#050706] flex items-center justify-center ${
                isTvFullscreen
                  ? 'fixed inset-0 z-[9990] w-screen h-screen bg-black'
                  : 'absolute z-10'
              }`}
            >
              {/* 16:10 Aspect-Ratio Locked Video Container (Never Stretches Wider Than 16:10) */}
              <div
                id="retro-tv-video-aspect-box"
                style={{
                  aspectRatio: '16 / 10',
                  filter: activeTintPreset.filterCss,
                }}
                className="relative w-full max-w-full max-h-full m-auto overflow-hidden bg-[#070908] flex items-center justify-center"
              >
                {!tvPoweredOn ? (
                  /* TV POWER OFF STATE: Dark CRT Phosphor Glass with Subtle Residual Static Dot */
                  <div
                    id="tv-power-off-screen"
                    data-powered="false"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 50%, #171c19 0%, #0a0d0c 48%, #040505 100%)',
                    }}
                    className="relative w-full h-full flex flex-col items-center justify-center"
                  >
                    <div className="w-16 h-[1.5px] rounded-full bg-amber-100/20 shadow-[0_0_8px_rgba(255,255,255,0.25)]" />
                    <span className="mt-2 font-mono text-[9px] uppercase tracking-widest text-white/30">
                      POWER OFF
                    </span>
                  </div>
                ) : (
                  /* TV POWER ON STATE: Live Video Feed / Screen Grabs for Current Song */
                  <div
                    key={`screen-roll-${channelFlashTick}`}
                    className={`relative w-full h-full ${
                      isChannelChanging && !prefersReducedMotion && !lowPowerMode
                        ? 'tv-vertical-roll'
                        : ''
                    }`}
                  >
                    {isStandby ? (
                      <div
                        style={{
                          background:
                            'radial-gradient(ellipse at 45% 42%, #242d28 0%, #161c19 56%, #0b0e0d 100%)',
                        }}
                        className="w-full h-full"
                      />
                    ) : isTvFullscreen ? (
                      <iframe
                        key={`${activeChannelVideoId}-${channelIndex}`}
                        ref={ytIframeRef}
                        title={`YouTube broadcast for ${track.title} (${channelNumberLabel})`}
                        src={buildCleanYouTubeEmbedUrl(
                          activeChannelVideoId,
                          isPlaying,
                          Math.floor(playbackClockStore.getCurrentTimeSec())
                        )}
                        className="w-full h-full border-0 pointer-events-auto"
                        allow="autoplay; encrypted-media; fullscreen"
                        allowFullScreen
                      />
                    ) : (
                      <TvFrameCrossfadeStage
                        effectiveTrack={effectiveTrack}
                        manualFrameIndex={manualFrameIndex}
                        frameOffset={activeChannelTheme.frameOffset}
                        channelCode={channelNumberLabel}
                        channelName={activeSongChannel?.label || activeChannelTheme.name}
                        lowPowerMode={lowPowerMode}
                        prefersReducedMotion={prefersReducedMotion}
                      />
                    )}

                    {/* Subtle Broadcast Tint Overlay */}
                    {!lowPowerMode && !isStandby && (
                      <div
                        aria-hidden="true"
                        style={{ backgroundColor: activeTintPreset.overlayRgba }}
                        className="pointer-events-none absolute inset-0"
                      />
                    )}
                  </div>
                )}

                {/* One-Shot 300ms Channel Change Static Snow Burst (Never Loops) */}
                {tvPoweredOn && isChannelChanging && !prefersReducedMotion && !lowPowerMode && (
                  <img
                    key={`static-burst-${channelFlashTick}`}
                    src="/tv/tv-static-noise.webp"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="tv-static-flash pointer-events-none absolute inset-0 z-20 w-full h-full object-cover"
                  />
                )}

                {/* Static Tiled CRT Scanline Texture (Toggled by SCAN Push-Button) */}
                {tvPoweredOn && showCrtEffects && !isStandby && (
                  <div
                    id="tv-scanline-overlay"
                    aria-hidden="true"
                    className="crt-scanlines pointer-events-none absolute inset-0 z-30"
                  />
                )}

                {/* Static Inner CRT Edge Vignette */}
                {!isTvFullscreen && (
                  <img
                    src="/tv/tv-screen-vignette.png"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 z-40 w-full h-full object-fill"
                  />
                )}

                {/* Static Curved Glass Reflection Highlight, Faint Dust & Edge Vignette */}
                {!isTvFullscreen && (
                  <img
                    src="/tv/tv-glass-overlay.png"
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 z-50 w-full h-full object-fill"
                  />
                )}
              </div>

              {/* Always-Reachable Top-Right Exit Fullscreen Button (Visible Inside Fullscreen Mode) */}
              {isTvFullscreen && (
                <button
                  id="tv-exit-fullscreen-btn"
                  type="button"
                  onClick={handleExitTvFullscreen}
                  aria-label="Exit Fullscreen (Esc)"
                  title="Exit Fullscreen (Esc)"
                  className="fixed top-4 right-4 z-[9999] pointer-events-auto px-3.5 py-2 rounded-md bg-black/85 hover:bg-black border-2 border-amber-300/75 text-amber-100 text-xs font-mono font-bold uppercase tracking-wider shadow-[0_6px_20px_rgba(0,0,0,0.9)] flex items-center gap-2 cursor-pointer"
                >
                  <X strokeWidth={2.5} className="w-4 h-4 text-amber-300" />
                  <span>Exit Fullscreen</span>
                </button>
              )}
            </div>

            {/* Photorealistic Walnut Cabinet + Screen Bezel Overlay */}
            <img
              src="/tv/tv-cabinet.webp"
              alt="1970s Walnut CRT Television Cabinet"
              draggable={false}
              className="pointer-events-none relative z-30 w-full h-full object-fill"
            />

            {/* =======================================================================
                REDESIGNED RIGHT CONTROL PANEL:
                - 2 Large Clearly Labeled Retro Knobs (POWER On/Off + CHANNEL CH 1..5)
                - Horizontal Row of 3 Old Analogue Push-Buttons Below Them (FULL, SCAN, TINT)
               ======================================================================= */}
            <div
              id="retro-tv-side-mount"
              style={{
                left: '80.5%',
                top: '7.0%',
                width: '17.2%',
                height: '82.0%',
              }}
              className={`absolute z-40 rounded-[3px] border border-[#3d291a] bg-gradient-to-b from-[#d8cfc2] via-[#b8ac9b] to-[#8f8272] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_2px_6px_rgba(0,0,0,0.65)] flex flex-col justify-between items-center ${
                compactLandscape ? 'p-0.5' : 'p-1'
              } overflow-hidden`}
            >
              {/* Top Brand & Power LED Strip */}
              <div
                className={`w-full flex items-center justify-between ${
                  compactLandscape ? 'px-0.5 py-[1px]' : 'px-1 py-0.5'
                } rounded-[2px] bg-[#1b1510] border border-black/70 shrink-0`}
              >
                <span
                  className={`font-mono font-extrabold ${
                    compactLandscape ? 'text-[3.5px]' : 'text-[5px] sm:text-[6px]'
                  } tracking-wider text-amber-200/90 uppercase leading-none truncate`}
                >
                  MAXVINYFY
                </span>
                <span
                  id="tv-standby-led"
                  aria-label={tvPoweredOn ? 'TV Power On LED' : 'TV Power Off LED'}
                  style={{
                    backgroundColor: tvPoweredOn ? '#22c55e' : '#ef4444',
                    boxShadow: tvPoweredOn
                      ? '0 0 5px rgba(34, 197, 94, 0.9)'
                      : '0 0 4px rgba(239, 68, 68, 0.75)',
                  }}
                  className={`${
                    compactLandscape ? 'w-1 h-1' : 'w-1.5 h-1.5'
                  } rounded-full border border-black/60 shrink-0`}
                />
              </div>

              {/* TWO LARGE RETRO ROTARY KNOBS: 1) POWER (On/Off) and 2) CHANNEL (CH 1 - CH 5) */}
              <div
                id="retro-tv-large-knobs"
                className="flex-1 w-full flex flex-col items-center justify-evenly py-0 min-h-0"
              >
                {/* Knob 1: Large POWER Rotary Knob */}
                <div className="w-full flex flex-col items-center justify-center gap-[1px]">
                  <button
                    id="tv-power-knob"
                    type="button"
                    data-powered={tvPoweredOn ? 'true' : 'false'}
                    data-knob-angle={powerKnobAngleDeg}
                    aria-pressed={tvPoweredOn}
                    aria-label={`TV Power Knob (${tvPoweredOn ? 'On' : 'Off'})`}
                    title={`TV Power: ${tvPoweredOn ? 'ON (Click to turn Off)' : 'OFF (Click to turn On)'}`}
                    onClick={handleTogglePowerKnob}
                    className={`relative ${
                      compactLandscape
                        ? 'w-[15px] h-[15px]'
                        : 'w-[28px] h-[28px] sm:w-[34px] sm:h-[34px] xl:w-[38px] xl:h-[38px]'
                    } rounded-full p-0.5 border border-black/70 bg-[#18130f] shadow-[0_3px_6px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)] cursor-pointer flex items-center justify-center`}
                  >
                    <img
                      src="/tv/tv-knob.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      style={{
                        transform: `rotate(${powerKnobAngleDeg}deg)`,
                        transition: knobTransition,
                      }}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 ${
                        compactLandscape ? 'w-1 h-1' : 'w-1.5 h-1.5'
                      } rounded-full border border-black/70 ${
                        tvPoweredOn ? 'bg-emerald-400' : 'bg-red-500'
                      }`}
                    />
                  </button>
                  <div
                    id="tv-power-label-plate"
                    className={`${
                      compactLandscape ? 'px-0.5 py-0' : 'px-1 py-[1px]'
                    } rounded-[2px] bg-[#1e1812] border border-black/60 shadow-inner flex items-center justify-center gap-0.5 max-w-full overflow-hidden`}
                  >
                    {!compactLandscape && <Power className="w-2 h-2 text-amber-300 shrink-0" />}
                    <span
                      className={`font-mono ${
                        compactLandscape ? 'text-[3.5px]' : 'text-[5px] sm:text-[6px]'
                      } font-extrabold uppercase tracking-tighter text-[#f5e7d3] leading-none whitespace-nowrap`}
                    >
                      {compactLandscape ? `PWR·${tvPoweredOn ? 'ON' : 'OFF'}` : `POWER·${tvPoweredOn ? 'ON' : 'OFF'}`}
                    </span>
                  </div>
                </div>

                {/* Knob 2: Large CHANNEL Selector Rotary Knob (CH 1 - CH 5) */}
                <div className="w-full flex flex-col items-center justify-center gap-[1px]">
                  <button
                    id="tv-channel-knob"
                    type="button"
                    data-channel-index={channelIndex + 1}
                    data-channel-label={channelNumberLabel}
                    data-channel-angle={activeChannelTheme.dialAngleDeg}
                    onClick={handleTurnChannelKnob}
                    aria-label={`TV Channel Selector Knob (${channelNumberLabel} of 5)`}
                    title={`Channel Selector: ${channelNumberLabel} (${activeSongChannel?.label || activeChannelTheme.name}) — Click to cycle 5 YouTube videos`}
                    className={`relative ${
                      compactLandscape
                        ? 'w-[15px] h-[15px]'
                        : 'w-[28px] h-[28px] sm:w-[34px] sm:h-[34px] xl:w-[38px] xl:h-[38px]'
                    } rounded-full p-0.5 border border-black/70 bg-[#18130f] shadow-[0_3px_6px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)] cursor-pointer flex items-center justify-center`}
                  >
                    <img
                      src="/tv/tv-knob.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      style={{
                        transform: `rotate(${activeChannelTheme.dialAngleDeg}deg)`,
                        transition: knobTransition,
                      }}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 ${
                        compactLandscape ? 'w-1 h-1' : 'w-1.5 h-1.5'
                      } rounded-full bg-amber-400 border border-black/70`}
                    />
                  </button>
                  <div
                    id="tv-channel-label-plate"
                    className={`${
                      compactLandscape ? 'px-0.5 py-0' : 'px-1 py-[1px]'
                    } rounded-[2px] bg-[#1e1812] border border-black/60 shadow-inner flex items-center justify-center gap-0.5 max-w-full overflow-hidden`}
                  >
                    <span
                      className={`font-mono ${
                        compactLandscape ? 'text-[3.5px]' : 'text-[5px] sm:text-[6px]'
                      } font-extrabold uppercase tracking-tighter text-amber-300 leading-none whitespace-nowrap`}
                    >
                      {compactLandscape ? channelNumberLabel : `CH·${channelNumberLabel}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* HORIZONTAL ROW OF 3 OLD ANALOGUE PUSH-BUTTONS BELOW THE 2 KNOBS */}
              <div
                id="retro-tv-analogue-buttons"
                role="group"
                aria-label="TV Analogue Push Buttons"
                className={`w-full grid grid-cols-3 gap-0.5 ${
                  compactLandscape ? 'pt-0.5' : 'pt-1'
                } border-t border-black/30 shrink-0`}
              >
                {/* Analogue Push-Button 1: Fullscreen */}
                <button
                  id="tv-btn-fullscreen"
                  type="button"
                  data-pressed={isTvFullscreen ? 'true' : 'false'}
                  onClick={handleToggleTvFullscreen}
                  aria-label={isTvFullscreen ? 'Exit TV Fullscreen' : 'Enter TV Fullscreen'}
                  title="Fullscreen Video (FULL)"
                  className={`${
                    compactLandscape ? 'h-3.5' : 'h-5 sm:h-6'
                  } rounded-[2px] border border-black/80 ${
                    isTvFullscreen
                      ? 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                      : 'bg-gradient-to-b from-[#f5efe6] via-[#d5c8b6] to-[#9b8c79] text-[#1a140f]'
                  } shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center cursor-pointer active:translate-y-[1px]`}
                >
                  {!compactLandscape &&
                    (isTvFullscreen ? (
                      <Minimize2 strokeWidth={2.2} className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                    ) : (
                      <Maximize2 strokeWidth={2.2} className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                    ))}
                  <span
                    className={`font-mono ${
                      compactLandscape ? 'text-[3.5px]' : 'text-[4.5px] sm:text-[5.5px]'
                    } font-black uppercase tracking-tighter leading-none`}
                  >
                    FULL
                  </span>
                </button>

                {/* Analogue Push-Button 2: Scanlines Toggle */}
                <button
                  id="tv-btn-scanlines"
                  type="button"
                  data-pressed={crtScanlinesOn ? 'true' : 'false'}
                  aria-pressed={crtScanlinesOn}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    setCrtScanlinesOn((v) => !v);
                  }}
                  aria-label="Toggle CRT Scanlines Overlay"
                  title={`CRT Scanlines: ${crtScanlinesOn ? 'ON' : 'OFF'}`}
                  className={`${
                    compactLandscape ? 'h-3.5' : 'h-5 sm:h-6'
                  } rounded-[2px] border border-black/80 ${
                    crtScanlinesOn
                      ? 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                      : 'bg-gradient-to-b from-[#f5efe6] via-[#d5c8b6] to-[#9b8c79] text-[#1a140f]'
                  } shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center cursor-pointer active:translate-y-[1px]`}
                >
                  {!compactLandscape && <Tv strokeWidth={2.2} className="w-2 h-2 sm:w-2.5 sm:h-2.5" />}
                  <span
                    className={`font-mono ${
                      compactLandscape ? 'text-[3.5px]' : 'text-[4.5px] sm:text-[5.5px]'
                    } font-black uppercase tracking-tighter leading-none`}
                  >
                    SCAN
                  </span>
                </button>

                {/* Analogue Push-Button 3: Broadcast Phosphor Tint Cycle */}
                <button
                  id="tv-btn-tint"
                  type="button"
                  data-tint={activeTintPreset.code}
                  data-pressed={tintPresetIndex > 0 ? 'true' : 'false'}
                  onClick={handleCycleTintButton}
                  aria-label={`Cycle CRT Phosphor Tint (${activeTintPreset.label})`}
                  title={`Broadcast Tint: ${activeTintPreset.label} (${activeTintPreset.code})`}
                  className={`${
                    compactLandscape ? 'h-3.5' : 'h-5 sm:h-6'
                  } rounded-[2px] border border-black/80 ${
                    tintPresetIndex > 0
                      ? 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                      : 'bg-gradient-to-b from-[#f5efe6] via-[#d5c8b6] to-[#9b8c79] text-[#1a140f]'
                  } shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center cursor-pointer active:translate-y-[1px]`}
                >
                  {!compactLandscape && (
                    <Sparkles strokeWidth={2.2} className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                  )}
                  <span
                    className={`font-mono ${
                      compactLandscape ? 'text-[3.5px]' : 'text-[4.5px] sm:text-[5.5px]'
                    } font-black uppercase tracking-tighter leading-none`}
                  >
                    {activeTintPreset.code}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }
);

interface PlaylistQueueBoxProps {
  playlists: PlaylistPack[];
  activePlaylist: PlaylistPack;
  activeTrackId: string;
  isPlaying?: boolean;
  shuffleEnabled: boolean;
  lowPowerMode?: boolean;
  isLoadingPlaylist?: boolean;
  spotifyConnected?: boolean;
  spotifyUserLabel?: string;
  needsInitialSpotifyConnect?: boolean;
  guidanceActive?: boolean;
  isDocumentHidden?: boolean;
  prefersReducedMotion: boolean;
  showCompactBrandHeader?: boolean;
  themePalette: DominantThemePalette;
  onSelectPlaylist: (playlistId: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onToggleShuffle: () => void;
  onNextTrack: () => void;
  onOpenSpotifyModal?: () => void;
}

export const PlaylistQueueBox = React.memo<PlaylistQueueBoxProps>(
  ({
    playlists,
    activePlaylist,
    activeTrackId,
    isPlaying = false,
    shuffleEnabled,
    lowPowerMode = false,
    isLoadingPlaylist = false,
    spotifyConnected = false,
    spotifyUserLabel = 'Connect Spotify Account',
    needsInitialSpotifyConnect = false,
    guidanceActive = false,
    isDocumentHidden = false,
    prefersReducedMotion,
    showCompactBrandHeader = false,
    themePalette,
    onSelectPlaylist,
    onDeletePlaylist,
    onSelectTrack,
    onToggleShuffle,
    onNextTrack,
    onOpenSpotifyModal,
  }) => {
    const activeRowRef = useRef<HTMLButtonElement | null>(null);
    const tracksScrollRef = useRef<HTMLDivElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const hasTracks = activePlaylist.tracks.length > 0;

    const shouldAnimateGuidance =
      needsInitialSpotifyConnect && guidanceActive && !isDocumentHidden && !prefersReducedMotion;

    // Close playlist dropdown on outside click
    useEffect(() => {
      if (!isDropdownOpen) return;
      const handlePointerDown = (e: PointerEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setIsDropdownOpen(false);
          setPendingDeleteId(null);
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isDropdownOpen]);

    // Auto-scroll highlighted active track inside #playlist-tracks-scroll ONLY (never scroll window/document)
    useEffect(() => {
      const container = tracksScrollRef.current;
      const row = activeRowRef.current;
      if (hasTracks && container && row) {
        const rowTop = row.offsetTop;
        const rowBottom = rowTop + row.offsetHeight;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        if (rowTop < viewTop) {
          container.scrollTop = rowTop;
        } else if (rowBottom > viewBottom) {
          container.scrollTop = rowBottom - container.clientHeight;
        }
      }
    }, [activeTrackId, activePlaylist.id, hasTracks]);

    return (
      <section
        id="playlist-panel"
        aria-label="Spotify Playlist Queue"
        className="walnut-furniture-cabinet panel-contain relative flex flex-col justify-start p-2.5 sm:p-3 select-none w-full h-full min-h-0 overflow-hidden z-10"
      >
        {/* Four Corner Slot-Head Screws on the Raised Walnut Cabinet Frame */}
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 left-1 w-2 h-2 z-30 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute top-1 right-1 w-2 h-2 z-30 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 left-1 w-2 h-2 z-30 opacity-85"
        />
        <img
          src="/console/screw-head.webp"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute bottom-1 right-1 w-2 h-2 z-30 opacity-85"
        />

        {showCompactBrandHeader && (
          <div className="pb-1.5 mb-1.5 border-b border-amber-200/15 shrink-0">
            <BrandHeader
              themePalette={themePalette}
              isPlaying={isPlaying}
              isStandby={!hasTracks}
              isDocumentHidden={isDocumentHidden}
              prefersReducedMotion={prefersReducedMotion}
              compact
            />
          </div>
        )}

        {/* Top Bar: Playlist Selector Dropdown (Immediately Left of Spotify Button) + Connect Spotify + Shuffle & Next */}
        <div className="relative z-30 flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-amber-200/20 shrink-0">
          {/* Playlist Selector Dropdown Immediately to the Left of the Spotify Connect Button */}
          <div
            id="playlist-selector-dropdown"
            ref={dropdownRef}
            className="relative flex-1 min-w-0"
          >
            <button
              id="playlist-selector-trigger"
              type="button"
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                setIsDropdownOpen((prev) => !prev);
                setPendingDeleteId(null);
              }}
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-label="Select or Manage Loaded Playlists"
              className="w-full h-[38px] sm:h-[42px] px-2.5 rounded-[3px] border border-[#8c6239] bg-gradient-to-b from-[#331e10] via-[#24140a] to-[#170c06] shadow-[inset_0_1px_0_rgba(255,215,170,0.22),0_2px_4px_rgba(0,0,0,0.65)] flex items-center justify-between gap-1.5 cursor-pointer text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-[11px] sm:text-xs font-bold engraved-wood-text truncate">
                  {hasTracks ? activePlaylist.name : 'Select Playlist'}
                </p>
                <p className="font-mono text-[9.5px] text-amber-200/65 truncate">
                  {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} ·{' '}
                  {activePlaylist.tracks.length} tracks
                </p>
              </div>
              <ChevronDown
                strokeWidth={2.2}
                className={`w-4 h-4 text-amber-300/85 shrink-0 transition-transform duration-150 ${
                  isDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu Listing All Loaded/Saved Playlists with Delete (Trash) + Confirmation Step */}
            {isDropdownOpen && (
              <div
                id="playlist-selector-menu"
                role="listbox"
                aria-label="Saved Playlists"
                className="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto rounded-[3px] border-2 border-[#7a4f2a] bg-[#1a0f08] shadow-[0_14px_30px_rgba(0,0,0,0.92)] p-1 space-y-1"
              >
                {playlists.length === 0 ? (
                  <div className="px-2.5 py-3 text-center font-mono text-[11px] text-amber-100/60">
                    No saved playlists. Click Spotify to load one.
                  </div>
                ) : (
                  playlists.map((pl) => {
                    const isSelected = pl.id === activePlaylist.id;
                    const isConfirmingDelete = pendingDeleteId === pl.id;
                    return (
                      <div
                        key={pl.id}
                        data-playlist-row-id={pl.id}
                        className={`flex items-center justify-between gap-1 rounded-[2px] px-2 py-1.5 border ${
                          isSelected
                            ? 'bg-[#382111] border-amber-400/55 text-amber-100'
                            : 'bg-[#24150b]/80 hover:bg-[#2f1b0e] border-white/10 text-amber-100/85'
                        }`}
                      >
                        {isConfirmingDelete ? (
                          <div className="w-full flex items-center justify-between gap-1.5 py-0.5">
                            <span className="font-mono text-[10px] font-bold text-amber-200 truncate">
                              Delete &ldquo;{pl.name}&rdquo;?
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                data-confirm-delete-playlist={pl.id}
                                aria-label={`Confirm Delete ${pl.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerButtonHaptic(lowPowerMode);
                                  onDeletePlaylist(pl.id);
                                  setPendingDeleteId(null);
                                }}
                                className="px-2 py-0.5 rounded-[2px] bg-red-600 hover:bg-red-500 text-white font-mono text-[9.5px] font-bold flex items-center gap-0.5 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                              <button
                                type="button"
                                data-cancel-delete-playlist={pl.id}
                                aria-label="Cancel Delete Playlist"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingDeleteId(null);
                                }}
                                className="px-1.5 py-0.5 rounded-[2px] bg-white/10 hover:bg-white/20 text-amber-100 font-mono text-[9.5px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              data-playlist-option-id={pl.id}
                              onClick={() => {
                                triggerButtonHaptic(lowPowerMode);
                                onSelectPlaylist(pl.id);
                                setIsDropdownOpen(false);
                                setPendingDeleteId(null);
                              }}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <p className="font-display text-xs font-bold truncate">{pl.name}</p>
                              <p className="font-mono text-[9.5px] text-amber-200/60 truncate">
                                {pl.tracks.length} tracks
                              </p>
                            </button>
                            <button
                              type="button"
                              data-delete-playlist-id={pl.id}
                              aria-label={`Delete playlist ${pl.name}`}
                              title={`Delete ${pl.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerButtonHaptic(lowPowerMode);
                                setPendingDeleteId(pl.id);
                              }}
                              className="p-1.5 rounded-[2px] text-amber-200/60 hover:text-red-400 hover:bg-black/40 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Action Controls Immediately to the Right of the Playlist Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            {needsInitialSpotifyConnect && shouldAnimateGuidance && onOpenSpotifyModal && (
              <button
                id="spotify-hand-pointer"
                type="button"
                aria-label="Click Connect Spotify"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onOpenSpotifyModal();
                }}
                className="hand-pointer-nudge hifi-btn px-2 gap-1 border-[#1ed760] text-[#1ed760] font-bold text-xs whitespace-nowrap"
              >
                <Pointer strokeWidth={1.75} className="hifi-icon rotate-90" />
              </button>
            )}

            {onOpenSpotifyModal && (
              <button
                id="spotify-connect-btn"
                type="button"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onOpenSpotifyModal();
                }}
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
                      }px-2.5 gap-1.5 bg-[#1ed760] text-[#12100e] font-bold text-xs border-white whitespace-nowrap`
                    : spotifyConnected
                    ? 'hifi-square-control text-emerald-300 border-emerald-400/50'
                    : 'hifi-square-control'
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
            )}

            <button
              type="button"
              disabled={!hasTracks}
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                onToggleShuffle();
              }}
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
              className="hifi-square-control hifi-btn text-amber-100/85"
            >
              <Shuffle strokeWidth={1.75} className="hifi-icon" />
            </button>

            <button
              type="button"
              disabled={!hasTracks}
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                onNextTrack();
              }}
              aria-label="Play Next Song Now"
              title="Next Track"
              style={{ color: themePalette.lightHex }}
              className="hifi-square-control hifi-btn"
            >
              <SkipForward strokeWidth={1.75} className="hifi-icon" />
            </button>
          </div>
        </div>

        {/* Loading Skeletons for Playlist While Fetching */}
        {isLoadingPlaylist ? (
          <div
            id="playlist-loading-skeleton"
            aria-label="Loading Playlist Tracks"
            className="flex-1 space-y-1.5 overflow-hidden pr-1 min-h-0"
          >
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className="w-full min-h-[42px] px-2.5 py-1.5 rounded-[3px] flex items-center justify-between gap-2.5 bg-black/35 border border-amber-200/10"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-[2px] bg-amber-100/10 shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <div className="h-3 w-3/5 rounded bg-amber-100/15" />
                    <div className="h-2.5 w-2/5 rounded bg-amber-100/10" />
                  </div>
                </div>
                <div className="h-3 w-8 rounded bg-amber-100/10 shrink-0" />
              </div>
            ))}
          </div>
        ) : hasTracks ? (
          <div
            id="playlist-tracks-scroll"
            ref={tracksScrollRef}
            className="flex-1 space-y-1.5 overflow-y-auto pr-1 min-h-0"
          >
            {activePlaylist.tracks.map((item, idx) => {
              const isCurrent = item.id === activeTrackId;
              const rowArt =
                resolveActiveArtworkState(item, 0).activeUrl || item.artworkUrl;
              return (
                <button
                  key={`${item.id}-${idx}`}
                  ref={isCurrent ? activeRowRef : null}
                  type="button"
                  data-track-id={item.id}
                  onClick={() => {
                    triggerButtonHaptic(lowPowerMode);
                    onSelectTrack(item.id);
                  }}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={`Play ${item.title} by ${item.artist}`}
                  style={
                    isCurrent
                      ? {
                          borderColor: '#d97706',
                        }
                      : undefined
                  }
                  className={`w-full min-h-[42px] px-2.5 py-1.5 rounded-[3px] flex items-center justify-between gap-2.5 text-left border transition-[transform,opacity] active:translate-y-[1px] cursor-pointer ${
                    isCurrent
                      ? 'bg-gradient-to-r from-[#422612] via-[#331c0d] to-[#261409] text-[#fff3e0] shadow-[inset_0_1px_0_rgba(255,220,170,0.3)]'
                      : 'bg-[#1a0f08]/75 hover:bg-[#2a180d]/90 text-[#edd8be] border-[#5c391e]/55'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {rowArt ? (
                      <img
                        src={rowArt}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const nextState = resolveActiveArtworkState(item, 1);
                          if (nextState.activeUrl && e.currentTarget.src !== nextState.activeUrl) {
                            e.currentTarget.src = nextState.activeUrl;
                          }
                        }}
                        className="w-8 h-8 rounded-[2px] object-cover shrink-0 border border-amber-200/25 bg-black/50"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-[2px] bg-black/50 border border-amber-200/20 flex items-center justify-center shrink-0">
                        <Disc3 strokeWidth={1.75} className="w-4 h-4 text-amber-200/60" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold engraved-wood-text truncate">
                        {item.title}
                      </p>
                      <p className="text-[10.5px] text-amber-200/70 truncate">
                        {item.artist}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-amber-200/75 tabular-nums shrink-0">
                    {formatDuration(item.durationSec)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-6 text-amber-100/70">
            <Disc3 strokeWidth={1.75} className="hifi-icon mb-2 text-[#1ed760]/80" />
            <p className="text-xs font-bold engraved-wood-text">
              No Spotify Playlist Loaded
            </p>
            <p className="text-[11px] text-amber-200/60 mt-1 max-w-[230px]">
              Click <strong className="text-[#1ed760]">Spotify</strong> to load your playlists &amp; songs.
            </p>
          </div>
        )}
      </section>
    );
  }
);
