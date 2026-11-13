import React, { useState, useEffect, useRef } from 'react';
import { Tv, Radio, Film, RefreshCw, Eye, SkipForward, Shuffle } from 'lucide-react';
import {
  selectActiveTvFrame,
  formatDuration,
  getUpNextQueue,
  getTvChannelTheme,
  getNextTvChannelIndex,
  TV_VISUAL_CHANNELS,
  type TrackItem,
  type YouTubeGrabFrame,
  type PlaylistPack,
  type DominantThemePalette,
} from '../utils/playerLogic';

interface RetroTvTableProps {
  track: TrackItem;
  currentTimeSec: number;
  isPlaying: boolean;
  themePalette: DominantThemePalette;
  onResolvedTrackMetadata?: (
    trackId: string,
    artworkUrl: string,
    videoId: string,
    frames: YouTubeGrabFrame[]
  ) => void;
}

export const RetroTvTable: React.FC<RetroTvTableProps> = ({
  track,
  currentTimeSec,
  isPlaying,
  themePalette,
  onResolvedTrackMetadata,
}) => {
  const [channelIndex, setChannelIndex] = useState<number>(0);
  const [manualFrameIndex, setManualFrameIndex] = useState<number | null>(null);
  const [liveFrames, setLiveFrames] = useState<YouTubeGrabFrame[] | null>(null);
  const [resolvedVideoId, setResolvedVideoId] = useState<string>(track.youtubeVideoId);
  const [secondaryVideoId, setSecondaryVideoId] = useState<string>(track.youtubeVideoId);
  const [lyricVideoId, setLyricVideoId] = useState<string>(track.youtubeVideoId);
  const [showLiveEmbed, setShowLiveEmbed] = useState(false);
  const [crtScanlinesOn, setCrtScanlinesOn] = useState(true);
  const [channelStatic, setChannelStatic] = useState(false);
  const [imgError, setImgError] = useState(false);

  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSyncedTimeRef = useRef<number>(currentTimeSec);
  const initialEmbedStartRef = useRef<number>(Math.floor(currentTimeSec));

  const activeChannelTheme = getTvChannelTheme(channelIndex);

  // Automatically read the song title & artist, search YouTube on the backend, and load multi-channel visual themes
  useEffect(() => {
    setManualFrameIndex(null);
    setLiveFrames(null);
    setResolvedVideoId(track.youtubeVideoId);
    setSecondaryVideoId(track.youtubeVideoId);
    setLyricVideoId(track.youtubeVideoId);
    setImgError(false);
    initialEmbedStartRef.current = Math.floor(currentTimeSec);

    let cancelled = false;
    const fetchSongYouTubeGrabs = async () => {
      try {
        const params = new URLSearchParams({
          title: track.title,
          artist: track.artist,
          trackId: track.id,
          videoId: track.youtubeVideoId,
        });
        const res = await fetch(`/api/youtube/search-grabs?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        if (Array.isArray(data.frames) && data.frames.length > 0) {
          setLiveFrames(data.frames);
          if (data.videoId) setResolvedVideoId(data.videoId);
          if (data.secondaryVideoId) setSecondaryVideoId(data.secondaryVideoId);
          if (data.lyricVideoId) setLyricVideoId(data.lyricVideoId);

          if (onResolvedTrackMetadata) {
            onResolvedTrackMetadata(
              track.id,
              data.artworkUrl || track.artworkUrl,
              data.videoId || track.youtubeVideoId,
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
  }, [track.id, track.title, track.artist]);

  const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  };

  // Sync YouTube IFrame video playback state (play/pause) with control section
  useEffect(() => {
    if (!showLiveEmbed) return;
    sendYouTubeCommand(isPlaying ? 'playVideo' : 'pauseVideo');
    sendYouTubeCommand('seekTo', [Math.floor(currentTimeSec), true]);
  }, [isPlaying, showLiveEmbed]);

  // Sync YouTube IFrame video timestamp whenever the song position is scrubbed or drifts > 1.5s
  useEffect(() => {
    const delta = Math.abs(currentTimeSec - lastSyncedTimeRef.current);
    if (delta > 1.5) {
      if (showLiveEmbed) {
        sendYouTubeCommand('seekTo', [Math.floor(currentTimeSec), true]);
      }
      setManualFrameIndex(null);
    }
    lastSyncedTimeRef.current = currentTimeSec;
  }, [currentTimeSec, showLiveEmbed]);

  // Pick active YouTube video ID for the currently tuned channel theme
  const activeChannelVideoId =
    activeChannelTheme.videoSource === 'secondary'
      ? secondaryVideoId
      : activeChannelTheme.videoSource === 'lyric'
      ? lyricVideoId
      : resolvedVideoId;

  const effectiveTrack: TrackItem =
    liveFrames && liveFrames.length > 0
      ? { ...track, youtubeVideoId: activeChannelVideoId, tvFrames: liveFrames }
      : { ...track, youtubeVideoId: activeChannelVideoId };

  const totalFrames = Math.max(1, effectiveTrack.tvFrames.length);

  // Synchronize TV frame to exact song time + active channel theme offset
  const baseSelection = selectActiveTvFrame(effectiveTrack, currentTimeSec, manualFrameIndex);
  const channelAdjustedIndex =
    (baseSelection.frameIndex + activeChannelTheme.frameOffset) % totalFrames;
  const activeFrame =
    effectiveTrack.tvFrames[channelAdjustedIndex] || baseSelection.frame;

  const triggerStaticBlip = () => {
    setChannelStatic(true);
    setImgError(false);
    window.setTimeout(() => setChannelStatic(false), 140);
  };

  // Side-mounted rotary channel dial handler: switches between the 5 YouTube visual theme channels
  const handleTurnChannelDial = () => {
    triggerStaticBlip();
    initialEmbedStartRef.current = Math.floor(currentTimeSec);
    setChannelIndex((prev) => getNextTvChannelIndex(prev));
  };

  const handleToggleLiveEmbed = () => {
    initialEmbedStartRef.current = Math.floor(currentTimeSec);
    setShowLiveEmbed((v) => !v);
  };

  const handleReSearchYouTube = async () => {
    triggerStaticBlip();
    setManualFrameIndex(null);
    try {
      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist,
        trackId: track.id,
      });
      const res = await fetch(`/api/youtube/search-grabs?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.frames) && data.frames.length > 0) {
        setLiveFrames(data.frames);
        if (data.videoId) setResolvedVideoId(data.videoId);
        if (data.secondaryVideoId) setSecondaryVideoId(data.secondaryVideoId);
        if (data.lyricVideoId) setLyricVideoId(data.lyricVideoId);
      }
    } catch {
      // ignore
    }
  };

  return (
    <section
      aria-label="Retro CRT TV on Vintage Wooden Stand"
      className="relative flex flex-col justify-between select-none w-full min-h-[280px] lg:min-h-0 lg:h-full overflow-visible"
    >
      {/* Upward-Pointing Rabbit-Ear Dipole Antenna (\ /) Perched Atop the TV Chassis */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 flex flex-col items-center z-10"
      >
        <svg viewBox="0 0 180 26" className="w-36 h-5 overflow-visible">
          <line
            x1="90"
            y1="24"
            x2="26"
            y2="2"
            stroke="#d4d4d8"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="26" cy="2" r="2.5" fill="#f4f4f5" />
          <line
            x1="90"
            y1="24"
            x2="154"
            y2="2"
            stroke="#d4d4d8"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="154" cy="2" r="2.5" fill="#f4f4f5" />
          <path
            d="M 75 25 Q 90 15 105 25 Z"
            fill={themePalette.darkHex}
            stroke={themePalette.tvCabinetBorderHex}
            strokeWidth="1.2"
          />
        </svg>
      </div>

      {/* Taller Retro Television Chassis — Outer Color Tinted by Album Art Dominant Color, Full rounded-3xl */}
      <div
        id="retro-tv-chassis"
        data-synced-time={Math.floor(currentTimeSec)}
        data-tv-channel={activeChannelTheme.code}
        data-tv-channel-theme={activeChannelTheme.name}
        data-tv-outer-color={themePalette.tvCabinetBorderHex}
        style={{
          background: themePalette.tvCabinetGradient,
          borderColor: themePalette.tvCabinetBorderHex,
        }}
        className="flex-1 min-h-[250px] lg:min-h-0 rounded-3xl border-2 p-3 shadow-[0_22px_50px_rgba(0,0,0,0.42)] flex gap-3 items-stretch relative z-10 transition-colors duration-500"
      >
        {/* Left: Classic 4:3 Curved Glass CRT Screen with YouTube Visual Theme Filter & Inner Black Glow */}
        <div
          id="retro-tv-screen"
          className="relative flex-1 min-h-[220px] lg:min-h-0 lg:h-full rounded-2xl overflow-hidden bg-[#0b0a09] border-4 border-[#141210] shadow-inner"
        >
          {/* Visual Theme Filter Container */}
          <div
            style={{ filter: activeChannelTheme.filterCss }}
            className="w-full h-full relative transition-all duration-300"
          >
            {showLiveEmbed ? (
              <iframe
                key={`${activeChannelVideoId}-${activeChannelTheme.id}`}
                ref={ytIframeRef}
                title={`YouTube broadcast for ${track.title} (${activeChannelTheme.name})`}
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
                  activeChannelVideoId
                )}?enablejsapi=1&autoplay=${isPlaying ? 1 : 0}&start=${
                  initialEmbedStartRef.current
                }&mute=1&controls=1&rel=0`}
                onLoad={() => {
                  sendYouTubeCommand('seekTo', [Math.floor(currentTimeSec), true]);
                  sendYouTubeCommand(isPlaying ? 'playVideo' : 'pauseVideo');
                }}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media"
              />
            ) : (
              <>
                {!imgError && activeFrame.imageUrl ? (
                  <img
                    src={activeFrame.imageUrl}
                    alt={activeFrame.caption}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      channelStatic ? 'opacity-25' : 'opacity-95'
                    }`}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#2a1f18] via-[#171310] to-[#0d0b0a] flex flex-col items-center justify-center p-3 text-center">
                    <Tv style={{ color: themePalette.lightHex }} className="w-7 h-7 mb-1" />
                    <p className="text-xs font-semibold text-[#f5efe6] truncate max-w-full">
                      {track.title}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Channel Theme Color Tint Overlay */}
            <div
              aria-hidden="true"
              style={{ backgroundColor: activeChannelTheme.tintOverlayRgba }}
              className="pointer-events-none absolute inset-0"
            />
          </div>

          {/* CRT On-Screen Display (OSD) Channel Theme Badge in Top-Left Corner */}
          <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/70 border border-white/10">
            <span
              style={{ color: themePalette.lightHex }}
              className="font-mono text-[10px] font-bold tracking-wider"
            >
              {activeChannelTheme.code}
            </span>
            <span className="text-[10px] font-medium text-white/80">
              {activeChannelTheme.name}
            </span>
          </div>

          {/* Time-Synced Song Overlay on CRT Bottom */}
          {!showLiveEmbed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 flex items-end justify-between gap-2 z-10">
              <p className="text-xs font-medium text-white/95 truncate">
                {track.title} ·{' '}
                <span style={{ color: themePalette.lightHex }}>{track.artist}</span>
              </p>
              <span
                style={{ color: themePalette.lightHex }}
                className="font-mono text-[11px] shrink-0"
              >
                {formatDuration(currentTimeSec)}
              </span>
            </div>
          )}

          {/* Lightweight Static CRT Scanline Mesh */}
          {crtScanlinesOn && (
            <div
              aria-hidden="true"
              className="crt-scanlines pointer-events-none absolute inset-0 z-10"
            />
          )}

          {/* Slight Inner Glow in Black Color Around the Edges of the TV Screen */}
          <div
            id="tv-screen-inner-black-glow"
            aria-hidden="true"
            className="tv-screen-inner-black-glow pointer-events-none absolute inset-0 rounded-2xl z-20"
          />
        </div>

        {/* Right: Side-Mounted Rotary Channel Dial + Icon-Only Tuner Controls */}
        <div
          id="retro-tv-side-mount"
          className="w-15 bg-black/45 border border-white/10 rounded-2xl p-1.5 flex flex-col justify-between items-center shrink-0"
        >
          {/* Side-Mounted Rotary Channel Dial (Switches Between 5 YouTube Visual Theme Channels) */}
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <span
              style={{ color: themePalette.lightHex }}
              className="font-mono text-[9px] font-bold tracking-tight"
            >
              {activeChannelTheme.code}
            </span>

            <button
              id="tv-channel-dial"
              type="button"
              onClick={handleTurnChannelDial}
              aria-label={`Side-Mounted TV Channel Dial — Current ${activeChannelTheme.code} ${activeChannelTheme.name}. Click to switch YouTube visual theme channel.`}
              title={`Channel Dial: ${activeChannelTheme.code} · ${activeChannelTheme.name} (Click to switch visual theme)`}
              className="relative w-11 h-11 rounded-full bg-gradient-to-b from-[#262320] to-[#12100e] border-2 border-white/25 active:scale-95 transition-transform flex items-center justify-center shadow-md cursor-pointer"
            >
              {/* 5 Channel Detent Dots Around Rotary Dial */}
              {TV_VISUAL_CHANNELS.map((ch) => {
                const isSelected = ch.index === channelIndex;
                const rad = ((ch.dialAngleDeg - 90) * Math.PI) / 180;
                const cx = 50 + Math.cos(rad) * 38;
                const cy = 50 + Math.sin(rad) * 38;
                return (
                  <span
                    key={ch.id}
                    aria-hidden="true"
                    style={{
                      left: `${cx}%`,
                      top: `${cy}%`,
                      backgroundColor: isSelected ? themePalette.lightHex : 'rgba(255,255,255,0.28)',
                    }}
                    className="pointer-events-none absolute w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  />
                );
              })}

              {/* Rotary Knob Pointer Bar */}
              <div
                style={{
                  transform: `rotate(${activeChannelTheme.dialAngleDeg}deg)`,
                }}
                className="w-full h-full flex items-start justify-center pt-1.5 transition-transform duration-200"
              >
                <div
                  style={{ backgroundColor: themePalette.primaryHex }}
                  className="w-1.5 h-4 rounded-full shadow"
                />
              </div>
            </button>
          </div>

          {/* Compact Tuner Action Buttons */}
          <div className="flex flex-col gap-1.5 w-full items-center">
            <button
              type="button"
              onClick={handleReSearchYouTube}
              aria-label="Search YouTube Video Grabs for Song"
              title="Refresh YouTube Song Search"
              style={{ color: themePalette.lightHex }}
              className="glass-button w-9 h-8 rounded-lg flex items-center justify-center transition-transform active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleToggleLiveEmbed}
              aria-label={showLiveEmbed ? 'Show YouTube Screen Grabs' : 'Play Live YouTube Video'}
              title={
                showLiveEmbed ? 'Show Time-Synced YouTube Grabs' : 'Play Time-Synced YouTube Video'
              }
              style={
                showLiveEmbed
                  ? {
                      backgroundColor: themePalette.primaryHex,
                      color: '#12100e',
                    }
                  : undefined
              }
              className={`w-9 h-8 rounded-lg flex items-center justify-center transition-all ${
                showLiveEmbed ? 'shadow' : 'glass-button text-white/80'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setCrtScanlinesOn((v) => !v)}
              aria-label="Toggle Animated CRT Scanlines"
              aria-pressed={crtScanlinesOn}
              title="Toggle CRT Scanlines"
              style={
                crtScanlinesOn
                  ? {
                      color: themePalette.lightHex,
                      borderColor: themePalette.borderRgba,
                    }
                  : undefined
              }
              className={`w-9 h-8 rounded-lg flex items-center justify-center transition-all ${
                crtScanlinesOn ? 'glass-button' : 'glass-button text-white/40'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setManualFrameIndex(null);
                setChannelIndex(0);
              }}
              aria-label="Auto-Sync YouTube Grabs"
              title="Reset to CH 01 Official MV & Lock to Song Time"
              style={
                manualFrameIndex === null && channelIndex === 0
                  ? {
                      color: themePalette.lightHex,
                      borderColor: themePalette.borderRgba,
                    }
                  : undefined
              }
              className={`w-9 h-8 rounded-lg flex items-center justify-center transition-all ${
                manualFrameIndex === null && channelIndex === 0
                  ? 'glass-button'
                  : 'glass-button text-white/45'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* TV Stands / Feet Resting Directly on Top of the Playlist Box on Desktop with 50% Opacity Contact Shadows */}
      <div className="relative shrink-0 mb-0 lg:-mb-4 z-20 flex items-end justify-between px-10 h-3.5 lg:h-4">
        <div className="relative flex flex-col items-center">
          <div
            style={{
              background: themePalette.tvFootGradient,
              borderColor: themePalette.tvCabinetBorderHex,
            }}
            className="w-6 h-3.5 lg:h-4 rounded-b-md border-x border-b shadow-[0_3px_6px_rgba(0,0,0,0.45)] [clip-path:polygon(12%_0%,88%_0%,100%_100%,0%_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1 w-11 h-2 rounded-full bg-black/45"
          />
        </div>

        <div className="relative flex flex-col items-center">
          <div
            style={{
              background: themePalette.tvFootGradient,
              borderColor: themePalette.tvCabinetBorderHex,
            }}
            className="w-6 h-3.5 lg:h-4 rounded-b-md border-x border-b shadow-[0_3px_6px_rgba(0,0,0,0.45)] [clip-path:polygon(12%_0%,88%_0%,100%_100%,0%_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1 w-11 h-2 rounded-full bg-black/45"
          />
        </div>
      </div>
    </section>
  );
};

interface PlaylistQueueBoxProps {
  activePlaylist: PlaylistPack;
  currentTrackIndex: number;
  shuffleEnabled: boolean;
  themePalette: DominantThemePalette;
  onSelectTrack: (index: number) => void;
  onToggleShuffle: () => void;
  onNextTrack: () => void;
}

export const PlaylistQueueBox: React.FC<PlaylistQueueBoxProps> = ({
  activePlaylist,
  currentTrackIndex,
  shuffleEnabled,
  themePalette,
  onSelectTrack,
  onToggleShuffle,
  onNextTrack,
}) => {
  const upNextItems = getUpNextQueue(activePlaylist.tracks, currentTrackIndex);
  const immediateNext = upNextItems[0] || null;

  return (
    <section
      id="playlist-panel"
      aria-label="Spotify Playlist Queue"
      className="glass-panel relative flex flex-col justify-start rounded-3xl p-3.5 select-none w-full min-h-[280px] lg:min-h-0 lg:h-full overflow-hidden z-10"
    >
      {/* Top Bar: Up Next Song Readout + Shuffle Button & Next Track Button */}
      <div className="flex items-center justify-between gap-2.5 pb-2.5 mb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0 pl-1">
          {immediateNext ? (
            <p className="text-xs font-medium text-white/85 truncate">
              <span style={{ color: themePalette.lightHex }} className="font-mono mr-1.5">
                →
              </span>
              {immediateNext.track.title} ·{' '}
              <span className="text-white/50">{immediateNext.track.artist}</span>
            </p>
          ) : (
            <p className="text-xs font-medium text-white/60 truncate">{activePlaylist.name}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Shuffle Playlist"
            aria-pressed={shuffleEnabled}
            title={shuffleEnabled ? 'Shuffle On (Click to disable)' : 'Shuffle Playlist'}
            style={
              shuffleEnabled
                ? {
                    backgroundColor: themePalette.softBgRgba,
                    borderColor: themePalette.borderRgba,
                    color: themePalette.lightHex,
                    boxShadow: `0 0 12px ${themePalette.glowRgba}`,
                  }
                : undefined
            }
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
              shuffleEnabled ? '' : 'glass-button text-white/75'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onNextTrack}
            aria-label="Play Next Song Now"
            title="Next Track"
            style={{ color: themePalette.lightHex }}
            className="glass-button w-8 h-8 rounded-xl flex items-center justify-center hover:scale-105 transition-all"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Spotify Tracklist */}
      <div className="flex-1 space-y-1 overflow-y-auto pr-1 min-h-0 max-h-[260px] lg:max-h-none">
        {activePlaylist.tracks.map((item, idx) => {
          const isCurrent = idx === currentTrackIndex;
          return (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              onClick={() => onSelectTrack(idx)}
              aria-label={`Play ${item.title} by ${item.artist}`}
              style={
                isCurrent
                  ? {
                      backgroundColor: themePalette.softBgRgba,
                      borderColor: themePalette.borderRgba,
                    }
                  : undefined
              }
              className={`w-full min-h-[36px] px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left border transition-all ${
                isCurrent
                  ? 'text-white shadow-sm'
                  : 'hover:bg-white/[0.06] text-white/75 border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] font-mono text-white/45 tabular-nums w-5 shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{item.title}</p>
                  <p className="text-[10px] text-white/50 truncate">{item.artist}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-white/55 tabular-nums shrink-0">
                {formatDuration(item.durationSec)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
