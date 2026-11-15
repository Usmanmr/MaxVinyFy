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
  getCrtTintKnobAngle,
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
    const tintKnobAngleDeg = getCrtTintKnobAngle(tintPresetIndex);
    const channelNumberLabel = `CH ${channelIndex + 1}`;
    const knobTransition =
      prefersReducedMotion || lowPowerMode ? 'none' : 'transform 160ms linear';

    return (
      <section
        aria-label="Photorealistic 1970s CRT Television on Vintage Table"
        className="relative flex flex-col justify-between gap-0 select-none w-full h-auto min-h-0 overflow-visible"
      >
        {/* Top Balanced Horizontal Header Composition: Spinning MVF Logo + Title (Left) Aligned with Right-Mounted Rabbit-Ear Antenna (Right) */}
        <div
          id="tv-top-header-bar"
          className="relative w-full flex items-center justify-between px-1 pb-0.5 shrink-0 z-20"
        >
          <BrandHeader
            themePalette={themePalette}
            isPlaying={isPlaying}
            isStandby={isStandby}
            isDocumentHidden={isDocumentHidden}
            prefersReducedMotion={prefersReducedMotion}
            compact={compactLandscape}
          />

          {/* Right-Positioned Retro Rabbit-Ear Dipole Antenna Assembly Aligned with Brand Header and Flush on Top-Right of TV Cabinet */}
          <div
            id="tv-rabbit-ear-antennas"
            aria-hidden="true"
            className="pointer-events-none relative flex flex-col items-center justify-end translate-y-[4px] mr-[4%] shrink-0 z-20"
          >
            <svg
              viewBox="0 0 220 44"
              className={
                compactLandscape
                  ? 'w-24 h-5 overflow-visible'
                  : 'w-32 sm:w-40 h-6 sm:h-7 overflow-visible'
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
        </div>

        {/* 1970s-80s CRT TV Cabinet: Full Width Matching Playlist Box Width Exactly + Proportional 16:10 Height */}
        <div className="relative w-full flex items-center justify-center pb-0.5">
          {/* Static Grounding Contact Shadow Under Walnut Cabinet */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 inset-x-[6%] h-2.5 rounded-full bg-black/65 z-0"
          />

          <div
            id="retro-tv-chassis"
            data-tv-powered={tvPoweredOn ? 'true' : 'false'}
            data-tv-channel={channelNumberLabel}
            data-tv-channel-code={activeChannelTheme.code}
            data-tv-channel-video-id={activeChannelVideoId}
            data-tv-tint={activeTintPreset.code}
            style={{ aspectRatio: '16 / 10' }}
            className="walnut-furniture-cabinet relative z-10 w-full overflow-visible"
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

            {/* CRT Screen Aperture — Strictly 16:10 Aspect Ratio with Letterbox/Pillarbox Protection */}
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
                REBALANCED RIGHT CONTROL PANEL:
                - 3 Rotary Knobs: 1) POWER (On/Off), 2) CHANNEL (CH 1..5), 3) FILTER/TINT (CLR/AMB/CYN/B&W)
                - 2 Larger, Prominent Analogue Push-Buttons Below Them: FULL & SCAN
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

              {/* THREE RETRO ROTARY KNOBS: 1) POWER, 2) CHANNEL (CH 1..5), 3) FILTER/TINT */}
              <div
                id="retro-tv-large-knobs"
                className="flex-1 w-full flex flex-col items-center justify-evenly py-0 min-h-0"
              >
                {/* Knob 1: POWER Rotary Knob */}
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
                        ? 'w-[12px] h-[12px]'
                        : 'w-[20px] h-[20px] sm:w-[24px] sm:h-[24px] xl:w-[28px] xl:h-[28px]'
                    } rounded-full p-0.5 border border-black/70 bg-[#18130f] shadow-[0_2px_5px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)] cursor-pointer flex items-center justify-center`}
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
                        compactLandscape ? 'text-[3px]' : 'text-[4.5px] sm:text-[5.5px]'
                      } font-extrabold uppercase tracking-tighter text-[#f5e7d3] leading-none whitespace-nowrap`}
                    >
                      {compactLandscape ? `PWR·${tvPoweredOn ? 'ON' : 'OFF'}` : `PWR·${tvPoweredOn ? 'ON' : 'OFF'}`}
                    </span>
                  </div>
                </div>

                {/* Knob 2: CHANNEL Selector Rotary Knob (CH 1 - CH 5) */}
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
                        ? 'w-[12px] h-[12px]'
                        : 'w-[20px] h-[20px] sm:w-[24px] sm:h-[24px] xl:w-[28px] xl:h-[28px]'
                    } rounded-full p-0.5 border border-black/70 bg-[#18130f] shadow-[0_2px_5px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)] cursor-pointer flex items-center justify-center`}
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
                        compactLandscape ? 'text-[3px]' : 'text-[4.5px] sm:text-[5.5px]'
                      } font-extrabold uppercase tracking-tighter text-amber-300 leading-none whitespace-nowrap`}
                    >
                      {compactLandscape ? channelNumberLabel : `CH·${channelNumberLabel}`}
                    </span>
                  </div>
                </div>

                {/* Knob 3: FILTER / TINT Rotary Knob (CLR, AMB, CYN, B&W) */}
                <div className="w-full flex flex-col items-center justify-center gap-[1px]">
                  <button
                    id="tv-tint-knob"
                    type="button"
                    data-tint={activeTintPreset.code}
                    data-knob-angle={tintKnobAngleDeg}
                    onClick={handleCycleTintButton}
                    aria-label={`TV Filter and Tint Knob (${activeTintPreset.label})`}
                    title={`Broadcast Filter/Tint Knob: ${activeTintPreset.label} (${activeTintPreset.code})`}
                    className={`relative ${
                      compactLandscape
                        ? 'w-[12px] h-[12px]'
                        : 'w-[20px] h-[20px] sm:w-[24px] sm:h-[24px] xl:w-[28px] xl:h-[28px]'
                    } rounded-full p-0.5 border border-black/70 bg-[#18130f] shadow-[0_2px_5px_rgba(0,0,0,0.75),inset_0_1px_1px_rgba(255,255,255,0.25)] cursor-pointer flex items-center justify-center`}
                  >
                    <img
                      src="/tv/tv-knob.webp"
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      style={{
                        transform: `rotate(${tintKnobAngleDeg}deg)`,
                        transition: knobTransition,
                      }}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 ${
                        compactLandscape ? 'w-1 h-1' : 'w-1.5 h-1.5'
                      } rounded-full border border-black/70 ${
                        tintPresetIndex > 0 ? 'bg-cyan-300' : 'bg-amber-200'
                      }`}
                    />
                  </button>
                  <div
                    id="tv-tint-label-plate"
                    className={`${
                      compactLandscape ? 'px-0.5 py-0' : 'px-1 py-[1px]'
                    } rounded-[2px] bg-[#1e1812] border border-black/60 shadow-inner flex items-center justify-center gap-0.5 max-w-full overflow-hidden`}
                  >
                    {!compactLandscape && <Sparkles className="w-2 h-2 text-amber-300 shrink-0" />}
                    <span
                      className={`font-mono ${
                        compactLandscape ? 'text-[3px]' : 'text-[4.5px] sm:text-[5.5px]'
                      } font-extrabold uppercase tracking-tighter text-[#f5e7d3] leading-none whitespace-nowrap`}
                    >
                      {compactLandscape
                        ? `FLT·${activeTintPreset.code}`
                        : `TINT·${activeTintPreset.code}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* TWO LARGER, PROMINENT ANALOGUE PUSH-BUTTONS BELOW THE 3 KNOBS: FULL & SCAN */}
              <div
                id="retro-tv-analogue-buttons"
                role="group"
                aria-label="TV Analogue Push Buttons"
                className={`w-full grid grid-cols-2 gap-1 ${
                  compactLandscape ? 'pt-0.5' : 'pt-1'
                } border-t border-black/35 shrink-0`}
              >
                {/* Analogue Push-Button 1: Prominent Fullscreen Toggle */}
                <button
                  id="tv-btn-fullscreen"
                  type="button"
                  data-pressed={isTvFullscreen ? 'true' : 'false'}
                  onClick={handleToggleTvFullscreen}
                  aria-label={isTvFullscreen ? 'Exit TV Fullscreen' : 'Enter TV Fullscreen'}
                  title="Fullscreen Video (FULL)"
                  className={`${
                    compactLandscape ? 'h-4' : 'h-7 sm:h-8'
                  } rounded-[3px] border border-black/85 ${
                    isTvFullscreen
                      ? 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                      : 'bg-gradient-to-b from-[#faf4ec] via-[#dccfb9] to-[#9b8c79] text-[#17120d]'
                  } shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.75)] flex flex-col items-center justify-center gap-[1px] cursor-pointer active:translate-y-[1px]`}
                >
                  {!compactLandscape &&
                    (isTvFullscreen ? (
                      <Minimize2 strokeWidth={2.4} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    ) : (
                      <Maximize2 strokeWidth={2.4} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    ))}
                  <span
                    className={`font-mono ${
                      compactLandscape ? 'text-[4px]' : 'text-[6px] sm:text-[7px]'
                    } font-black uppercase tracking-tight leading-none`}
                  >
                    FULL
                  </span>
                </button>

                {/* Analogue Push-Button 2: Prominent Scanlines Toggle */}
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
                    compactLandscape ? 'h-4' : 'h-7 sm:h-8'
                  } rounded-[3px] border border-black/85 ${
                    crtScanlinesOn
                      ? 'bg-gradient-to-b from-[#45382b] to-[#261e16] text-amber-300 translate-y-[0.5px]'
                      : 'bg-gradient-to-b from-[#faf4ec] via-[#dccfb9] to-[#9b8c79] text-[#17120d]'
                  } shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.75)] flex flex-col items-center justify-center gap-[1px] cursor-pointer active:translate-y-[1px]`}
                >
                  {!compactLandscape && <Tv strokeWidth={2.4} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                  <span
                    className={`font-mono ${
                      compactLandscape ? 'text-[4px]' : 'text-[6px] sm:text-[7px]'
                    } font-black uppercase tracking-tight leading-none`}
                  >
                    SCAN
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

/**
 * Shared Screwed-in Brushed-Metal Label Plate for Playlist Hardware Push-Buttons (Matching Turntable Controls).
 */
const PlaylistHardwareLabelPlate = React.memo<{ label: string }>(({ label }) => (
  <div className="relative w-[36px] sm:w-[40px] h-[11px] sm:h-[12px] rounded-[2px] overflow-hidden border border-[#d6c7b2]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.7)] flex items-center justify-center shrink-0">
    <img
      src="/console/metal-plate.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute inset-0 w-full h-full object-cover"
    />
    <img
      src="/console/screw-head.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute left-[2px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] z-10"
    />
    <img
      src="/console/screw-head.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
      className="pointer-events-none absolute right-[2px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] z-10"
    />
    <span className="relative z-10 font-mono text-[5px] sm:text-[5.5px] font-extrabold uppercase tracking-tighter text-[#16120e] drop-shadow-[0_0.5px_0_rgba(255,255,255,0.65)] leading-none whitespace-nowrap">
      {label}
    </span>
  </div>
));

/**
 * Round Machined Metal Push-Button + Screwed-In Engraved Label Plate for the Playlist Box
 * (Exact same retro hardware theme as the controls on the turntable board).
 */
const PlaylistHardwarePushButton = React.memo<{
  id?: string;
  label: string;
  ariaLabel: string;
  title: string;
  disabled?: boolean;
  isPressed?: boolean;
  isBlinking?: boolean;
  highlightEmerald?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>(
  ({
    id,
    label,
    ariaLabel,
    title,
    disabled = false,
    isPressed = false,
    isBlinking = false,
    highlightEmerald = false,
    onClick,
    children,
  }) => {
    const [momentaryDown, setMomentaryDown] = useState(false);
    const depressed = isPressed || momentaryDown;

    return (
      <div className="flex flex-col items-center justify-end gap-0.5 shrink-0">
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={isPressed}
          title={title}
          data-pressed={depressed ? 'true' : 'false'}
          data-blinking={isBlinking ? 'true' : 'false'}
          onPointerDown={() => {
            if (!disabled) setMomentaryDown(true);
          }}
          onPointerUp={() => setMomentaryDown(false)}
          onPointerLeave={() => {
            if (momentaryDown) setMomentaryDown(false);
          }}
          onClick={onClick}
          style={{
            transform: depressed && !disabled ? 'translateY(1.5px)' : 'translateY(0px)',
            transition: 'transform 80ms linear, opacity 120ms linear',
          }}
          className={`relative w-[28px] h-[28px] sm:w-[32px] sm:h-[32px] rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
            isBlinking ? 'spotify-connect-blink ring-2 ring-[#1ed760]' : ''
          } ${
            highlightEmerald
              ? 'ring-1 ring-emerald-400/70 shadow-[0_2px_6px_rgba(0,0,0,0.75)]'
              : 'shadow-[0_2px_6px_rgba(0,0,0,0.75)]'
          }`}
        >
          <img
            src={depressed ? '/console/pushbutton-down.webp' : '/console/pushbutton-up.webp'}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] object-contain"
          />
          <span
            className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
              highlightEmerald
                ? 'text-emerald-950'
                : depressed
                ? 'text-amber-300'
                : 'text-[#18130e]'
            }`}
          >
            {children}
          </span>
        </button>
        <PlaylistHardwareLabelPlate label={label} />
      </div>
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

        {/* Top Bar: Screwed-In Brushed-Metal Playlist Selector Plate + Retro Machined Hardware Push-Buttons */}
        <div className="relative z-30 flex items-end justify-between gap-1.5 pb-2 mb-2 border-b border-amber-200/20 shrink-0">
          {/* Playlist Selector Dropdown Immediately to the Left of the Spotify Connect Button — Restyled as a Screwed-In Brushed-Metal Hardware Plate */}
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
              className="relative w-full h-[40px] sm:h-[44px] px-3.5 rounded-[3px] overflow-hidden border border-[#d6c7b2]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_3px_7px_rgba(0,0,0,0.75)] flex items-center justify-between gap-1.5 cursor-pointer text-left active:translate-y-[1px]"
            >
              <img
                src="/console/metal-plate.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute inset-0 w-full h-full object-cover"
              />
              <img
                src="/console/screw-head.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute top-1 left-1 w-1.5 h-1.5 z-20"
              />
              <img
                src="/console/screw-head.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute top-1 right-1 w-1.5 h-1.5 z-20"
              />
              <img
                src="/console/screw-head.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute bottom-1 left-1 w-1.5 h-1.5 z-20"
              />
              <img
                src="/console/screw-head.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute bottom-1 right-1 w-1.5 h-1.5 z-20"
              />

              <div className="relative z-10 min-w-0 flex-1 leading-tight">
                <p className="font-display text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-[#17130f] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] truncate">
                  {hasTracks ? activePlaylist.name : 'Select Playlist'}
                </p>
                <p className="font-mono text-[9px] sm:text-[9.5px] font-bold text-[#2b241d]/90 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] truncate">
                  {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} ·{' '}
                  {activePlaylist.tracks.length} tracks
                </p>
              </div>

              {/* Machined Hardware Dial Cap Around Dropdown Chevron */}
              <span className="relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                <img
                  src={isDropdownOpen ? '/console/pushbutton-down.webp' : '/console/pushbutton-up.webp'}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                />
                <ChevronDown
                  strokeWidth={2.5}
                  className={`relative z-10 w-3.5 h-3.5 text-[#17130f] transition-transform duration-150 ${
                    isDropdownOpen ? 'rotate-180 text-amber-300' : ''
                  }`}
                />
              </span>
            </button>

            {/* Dropdown Menu Listing All Loaded/Saved Playlists with Retro Hardware Delete Buttons */}
            {isDropdownOpen && (
              <div
                id="playlist-selector-menu"
                role="listbox"
                aria-label="Saved Playlists"
                className="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto rounded-[3px] border-2 border-[#a87c4f] bg-[#1a0f08] shadow-[0_14px_30px_rgba(0,0,0,0.92)] p-1.5 space-y-1"
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
                        className={`flex items-center justify-between gap-1.5 rounded-[3px] px-2 py-1.5 border ${
                          isSelected
                            ? 'bg-[#382111] border-amber-400/65 text-amber-100'
                            : 'bg-[#24150b]/85 hover:bg-[#2f1b0e] border-[#7a4f2a]/45 text-amber-100/85'
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
                                className="px-2 py-0.5 rounded-[2px] border border-red-300/60 bg-gradient-to-b from-red-500 to-red-700 text-white font-mono text-[9.5px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center gap-0.5 cursor-pointer"
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
                                className="relative px-2 py-0.5 rounded-[2px] overflow-hidden border border-[#d6c7b2]/50 text-[#17130f] font-mono text-[9.5px] font-extrabold cursor-pointer"
                              >
                                <img
                                  src="/console/metal-plate.webp"
                                  alt=""
                                  aria-hidden="true"
                                  draggable={false}
                                  className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                                />
                                <span className="relative z-10">Cancel</span>
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
                            {/* Machined Hardware Trash Push-Button */}
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
                              className="relative w-6 h-6 rounded-full flex items-center justify-center text-[#18130e] hover:text-red-700 cursor-pointer shrink-0 active:translate-y-[1px]"
                            >
                              <img
                                src="/console/pushbutton-up.webp"
                                alt=""
                                aria-hidden="true"
                                draggable={false}
                                className="pointer-events-none absolute inset-0 w-full h-full object-contain"
                              />
                              <Trash2 strokeWidth={2.2} className="relative z-10 w-3 h-3" />
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

          {/* Retro Hardware Action Push-Buttons Immediately to the Right of the Playlist Dropdown */}
          <div className="flex items-end gap-1.5 shrink-0">
            {needsInitialSpotifyConnect && shouldAnimateGuidance && onOpenSpotifyModal && (
              <button
                id="spotify-hand-pointer"
                type="button"
                aria-label="Click Connect Spotify"
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onOpenSpotifyModal();
                }}
                className="hand-pointer-nudge relative h-[32px] px-2 rounded-[3px] overflow-hidden border border-[#1ed760] text-[#17130f] font-bold text-xs flex items-center justify-center shadow-md cursor-pointer"
              >
                <img
                  src="/console/metal-plate.webp"
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                />
                <Pointer strokeWidth={2.2} className="relative z-10 w-4 h-4 rotate-90 text-[#17130f]" />
              </button>
            )}

            {onOpenSpotifyModal && (
              <PlaylistHardwarePushButton
                id="spotify-connect-btn"
                label="SPOTIFY"
                ariaLabel="Connect Spotify Account and Select Playlist"
                title={
                  spotifyConnected
                    ? `Spotify Connected (${spotifyUserLabel})`
                    : 'Connect Spotify'
                }
                isPressed={spotifyConnected}
                isBlinking={shouldAnimateGuidance}
                highlightEmerald={spotifyConnected || needsInitialSpotifyConnect}
                onClick={() => {
                  triggerButtonHaptic(lowPowerMode);
                  onOpenSpotifyModal();
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current"
                  aria-hidden="true"
                >
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.469-.077-.334.132-.67.469-.745 3.809-.87 7.076-.496 9.713 1.115.293.18.386.563.207.855zm1.224-2.722c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.256 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.129-1.166-.623-.148-.495.13-1.015.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.445.264.59.838.327 1.282-.264.443-.838.59-1.283.327z" />
                </svg>
              </PlaylistHardwarePushButton>
            )}

            <PlaylistHardwarePushButton
              id="playlist-shuffle-btn"
              label="SHUF"
              disabled={!hasTracks}
              isPressed={shuffleEnabled}
              ariaLabel="Shuffle Playlist"
              title={shuffleEnabled ? 'Shuffle On' : 'Shuffle Playlist'}
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                onToggleShuffle();
              }}
            >
              <Shuffle strokeWidth={2.2} className="w-3.5 h-3.5" />
            </PlaylistHardwarePushButton>

            <PlaylistHardwarePushButton
              id="playlist-next-btn"
              label="NEXT"
              disabled={!hasTracks}
              ariaLabel="Play Next Song Now"
              title="Next Track"
              onClick={() => {
                triggerButtonHaptic(lowPowerMode);
                onNextTrack();
              }}
            >
              <SkipForward strokeWidth={2.2} className="w-3.5 h-3.5" />
            </PlaylistHardwarePushButton>
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

