import React, { useState, useEffect, useCallback } from 'react';
import andromedaWallpaper from '../../assets/images/osx_lion_andromeda_1794925891597.jpg';

export type ImacOpenAppId = 'none' | 'itunes' | 'video';

export interface ClickWheelImacDisplayMetrics {
  imacWidthPx: number;
  imacScreenHeightPx: number;
  imacChinHeightPx: number;
  imacTotalHeightPx: number;
  imacStandHeightPx?: number;
}

export interface ClickWheelImacBackdropProps {
  metrics: ClickWheelImacDisplayMetrics;
  isMobilePortrait: boolean;
  isPlaying: boolean;
  trackTitle: string;
  trackArtist: string;
  youtubeVideoId?: string;
  openApp: ImacOpenAppId;
  onToggleApp: (app: ImacOpenAppId) => void;
  onOpenSettingsPane: () => void;
  onCycleGeneration: () => void;
  renderLibraryWindowContent?: () => React.ReactNode;
  renderVideoWindowContent?: () => React.ReactNode;
}

const DEFAULT_IMAC_YOUTUBE_VIDEO_ID = 'jfKfPfyJRdk';

const DOCK_APPS: Array<{
  id: 'finder' | 'launchpad' | 'youtube' | 'spotify' | 'prefs';
  label: string;
}> = [
  { id: 'finder', label: 'Finder' },
  { id: 'launchpad', label: 'Launchpad' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'prefs', label: 'System Preferences' },
];

function renderDockIconSvg(id: 'finder' | 'launchpad' | 'youtube' | 'spotify' | 'prefs') {
  switch (id) {
    case 'finder':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="cwFinderL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6DC4FF" />
              <stop offset="100%" stopColor="#267AE0" />
            </linearGradient>
            <linearGradient id="cwFinderR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5FAFF" />
              <stop offset="100%" stopColor="#C8DDF5" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="32" height="32" rx="6" fill="url(#cwFinderR)" stroke="#6888B0" strokeWidth="1" />
          <path d="M2 8 C2 4.7 4.7 2 8 2 H18 C16.5 11 16 17 19.5 19 L17.5 34 H8 C4.7 34 2 31.3 2 28 Z" fill="url(#cwFinderL)" />
          <circle cx="11.5" cy="14" r="1.5" fill="#0F294A" />
          <circle cx="24.5" cy="14" r="1.5" fill="#0F294A" />
          <path d="M10.5 23 Q18 28.5 25.5 23" fill="none" stroke="#0F294A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'launchpad':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="cwLpBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E4EAF2" />
              <stop offset="100%" stopColor="#8F9BAE" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="32" height="32" rx="7" fill="url(#cwLpBg)" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1" />
          <rect x="7" y="7" width="6" height="6" rx="1.5" fill="#F87171" />
          <rect x="15" y="7" width="6" height="6" rx="1.5" fill="#FBBF24" />
          <rect x="23" y="7" width="6" height="6" rx="1.5" fill="#34D399" />
          <rect x="7" y="15" width="6" height="6" rx="1.5" fill="#60A5FA" />
          <rect x="15" y="15" width="6" height="6" rx="1.5" fill="#A78BFA" />
          <rect x="23" y="15" width="6" height="6" rx="1.5" fill="#F472B6" />
          <rect x="7" y="23" width="6" height="6" rx="1.5" fill="#38BDF8" />
          <rect x="15" y="23" width="6" height="6" rx="1.5" fill="#FB923C" />
          <rect x="23" y="23" width="6" height="6" rx="1.5" fill="#4ADE80" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <defs>
            <linearGradient id="cwYtRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF3B30" />
              <stop offset="52%" stopColor="#E11D24" />
              <stop offset="100%" stopColor="#991B1B" />
            </linearGradient>
            <linearGradient id="cwYtGloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <rect x="2" y="5" width="32" height="26" rx="7.5" fill="url(#cwYtRed)" stroke="#FCA5A5" strokeWidth="1" />
          <path d="M4 11 C4 7.5 6.8 6 10 6 H26 C29.2 6 32 7.5 32 11 V14.5 C24 16.5 12 16.5 4 14.5 Z" fill="url(#cwYtGloss)" />
          <polygon points="14.5,11.8 25,18 14.5,24.2" fill="#FFFFFF" />
        </svg>
      );
    case 'spotify':
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          <defs>
            <radialGradient id="cwSpotifyGreen" cx="38%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#4ADE80" />
              <stop offset="48%" stopColor="#1ED760" />
              <stop offset="100%" stopColor="#117A37" />
            </radialGradient>
            <linearGradient id="cwSpotifyGloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.58" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <circle cx="18" cy="18" r="16" fill="url(#cwSpotifyGreen)" stroke="#BBF7D0" strokeWidth="1.1" />
          <ellipse cx="18" cy="10.2" rx="11.5" ry="6.2" fill="url(#cwSpotifyGloss)" />
          <path
            d="M9.6 13.8 C15.2 12.1 21.8 12.4 26.8 15.2"
            fill="none"
            stroke="#090D11"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M11.0 18.6 C15.6 17.2 20.9 17.5 25.1 19.9"
            fill="none"
            stroke="#090D11"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M12.2 23.1 C16.0 21.9 20.1 22.2 23.4 24.1"
            fill="none"
            stroke="#090D11"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'prefs':
    default:
      return (
        <svg viewBox="0 0 36 36" className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <defs>
            <linearGradient id="cwPrefsBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D8DCE3" />
              <stop offset="100%" stopColor="#7C8391" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="32" height="32" rx="7" fill="url(#cwPrefsBg)" stroke="#E5E9F0" strokeWidth="1" />
          <circle cx="18" cy="18" r="9.5" fill="#4B525E" stroke="#F8FAFC" strokeWidth="1.5" strokeDasharray="3 1.7" />
          <circle cx="18" cy="18" r="4.5" fill="#CBD5E1" stroke="#334155" strokeWidth="1.2" />
        </svg>
      );
  }
}

export const ClickWheelImacBackdrop: React.FC<ClickWheelImacBackdropProps> = React.memo(
  ({
    metrics,
    isMobilePortrait,
    isPlaying,
    trackTitle,
    trackArtist,
    youtubeVideoId,
    openApp,
    onToggleApp,
    onOpenSettingsPane,
    onCycleGeneration,
    renderLibraryWindowContent,
  }) => {
    const neckHeightPx = isMobilePortrait ? 12 : Math.max(28, (metrics.imacStandHeightPx ?? 50) - 10);
    const footHeightPx = isMobilePortrait ? 5 : 9;

    // PART 3.3: Two-Step Animated macOS Demo Mouse Pointer (1: Spotify Callout -> 2: YouTube Callout -> Dismiss)
    const [demoStep, setDemoStep] = useState<'spotify' | 'youtube' | 'dismissed'>('spotify');

    const dismissDemoCursor = useCallback(() => {
      setDemoStep('dismissed');
    }, []);

    useEffect(() => {
      if (demoStep === 'dismissed') return;
      const toYoutubeTimer = window.setTimeout(() => {
        setDemoStep((prev) => (prev === 'spotify' ? 'youtube' : prev));
      }, 2400);
      const toFinishTimer = window.setTimeout(() => {
        setDemoStep((prev) => (prev === 'youtube' ? 'spotify' : prev));
      }, 4800);
      return () => {
        window.clearTimeout(toYoutubeTimer);
        window.clearTimeout(toFinishTimer);
      };
    }, [demoStep]);

    const effectiveYoutubeVideoId =
      youtubeVideoId && youtubeVideoId.trim().length > 0
        ? youtubeVideoId.trim()
        : DEFAULT_IMAC_YOUTUBE_VIDEO_ID;

    const chromelessYoutubeSrc = `https://www.youtube.com/embed/${encodeURIComponent(
      effectiveYoutubeVideoId
    )}?autoplay=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&loop=1&playlist=${encodeURIComponent(
      effectiveYoutubeVideoId
    )}`;

    return (
      <div
        id="cw-2011-imac-assembly"
        style={{
          width: `${metrics.imacWidthPx}px`,
        }}
        className="pointer-events-auto relative z-[14] flex flex-col items-center select-none shrink-0"
      >
        {/* Main iMac Display Chassis (86% Black Glass Display + 14% Brushed Aluminum Bottom Chin) */}
        <div
          id="cw-2011-imac-frame"
          style={{
            width: `${metrics.imacWidthPx}px`,
            height: `${metrics.imacTotalHeightPx}px`,
          }}
          className="cw-imac-housing relative rounded-[10px] sm:rounded-[16px] overflow-hidden flex flex-col"
        >
          {/* Upper 86%: Edge-to-Edge Glossy Black Glass Bezel + Andromeda OS X Lion Desktop */}
          <div
            style={{ height: `${metrics.imacScreenHeightPx}px` }}
            className="cw-imac-glass-bezel relative w-full shrink-0 p-[5px] sm:p-[11px] flex flex-col"
          >
            {/* Top-Center iSight / FaceTime Camera Dot */}
            <div
              aria-hidden="true"
              className="absolute top-[2px] sm:top-[4px] left-1/2 -translate-x-1/2 w-[3.5px] h-[3.5px] sm:w-[5px] sm:h-[5px] rounded-full bg-[#1C2430] ring-1 ring-white/15 flex items-center justify-center z-30"
            >
              <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#38BDF8]/55" />
            </div>

            {/* Active LCD Panel Displaying OS X Lion Andromeda Galaxy Wallpaper OR 100% Fullscreen Chromeless YouTube Mode */}
            <div
              id="cw-osx-lion-desktop"
              onPointerDown={dismissDemoCursor}
              onMouseEnter={dismissDemoCursor}
              className="relative w-full h-full rounded-[2px] overflow-hidden bg-[#0A0817] flex flex-col justify-between"
            >
              <img
                src={andromedaWallpaper}
                alt="OS X Lion Andromeda Galaxy Desktop"
                draggable={false}
                className="pointer-events-none absolute inset-0 w-full h-full object-cover"
              />

              {/* PART 3.3: Full-Screen Chromeless YouTube Mode (100% of iMac active display area, covering wallpaper & dock) */}
              {openApp === 'video' ? (
                <div
                  id="cw-imac-chromeless-youtube"
                  data-testid="cw-imac-chromeless-youtube"
                  data-youtube-video-id={effectiveYoutubeVideoId}
                  className="absolute inset-0 z-40 w-full h-full bg-black overflow-hidden"
                >
                  <iframe
                    id="cw-imac-youtube-iframe"
                    title="iMac Fullscreen Chromeless YouTube Mode"
                    src={chromelessYoutubeSrc}
                    allow="autoplay; encrypted-media"
                    className="w-full h-full border-0 pointer-events-none object-cover scale-[1.03]"
                  />
                  {/* Subtle Corner Toggle Exit Overlay so User Can Toggle YouTube Mode OFF */}
                  <button
                    id="cw-imac-youtube-exit-btn"
                    type="button"
                    aria-label="Toggle YouTube Mode OFF"
                    title="Exit Fullscreen YouTube Mode"
                    onClick={() => onToggleApp('none')}
                    className="absolute top-2 right-2 z-50 px-2 py-0.5 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-[8.5px] sm:text-[10px] font-sans font-semibold text-white/90 backdrop-blur-md cursor-pointer transition-opacity opacity-75 hover:opacity-100"
                  >
                    YouTube OFF
                  </button>
                </div>
              ) : (
                <>
                  {/* Translucent OS X Lion Top Menu Bar */}
                  <div
                    id="cw-osx-menubar"
                    className="relative z-20 w-full h-[14px] sm:h-[20px] px-2 bg-white/75 backdrop-blur-md border-b border-black/15 flex items-center justify-between text-[7.5px] sm:text-[9.5px] font-sans text-[#111318] shadow-[0_1px_3px_rgba(0,0,0,0.28)]"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                      {/* Classic Apple Silhouette */}
                      <svg
                        viewBox="0 0 14 17"
                        aria-hidden="true"
                        className="w-[7.5px] h-[9px] sm:w-[9.5px] sm:h-[11.5px] fill-[#111318] shrink-0"
                      >
                        <path d="M11.6 8.9c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.4 0-2.6.8-3.3 2-.1.2-1.3 2.4-.3 5.5.6 1.7 1.4 3.6 2.5 3.6 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1 0 1.8-1.7 2.5-3.4.8-1.8 1.1-3.5 1.1-3.6-.1 0-1.9-.7-1.9-2.4zM9.4 2.8c.5-.7.9-1.6.8-2.6-.8 0-1.8.5-2.3 1.2-.5.6-.9 1.5-.8 2.5.9.1 3.1-.8 2.3-1.1z" />
                      </svg>
                      <span className="font-bold tracking-tight">Finder</span>
                      <span className="hidden sm:inline font-medium opacity-85">File</span>
                      <span className="hidden sm:inline font-medium opacity-85">Edit</span>
                      <span className="hidden sm:inline font-medium opacity-85">View</span>
                      <button
                        type="button"
                        onClick={() => onToggleApp(openApp === 'itunes' ? 'none' : 'itunes')}
                        className="font-semibold text-[#007AFF] hover:underline cursor-pointer truncate"
                      >
                        iTunes Library
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 tabular-nums font-medium">
                      <span className="hidden md:inline truncate max-w-[180px] opacity-80">
                        {isPlaying ? `♪ ${trackTitle} — ${trackArtist}` : 'Desktop Ready'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleApp('video')}
                        className="px-1.5 py-[1px] rounded bg-black/10 hover:bg-black/20 text-[7px] sm:text-[8.5px] font-semibold cursor-pointer"
                      >
                        YouTube Mode
                      </button>
                    </div>
                  </div>

                  {/* Optional On-Demand Floating OS X Lion App Window (Library/Spotify) */}
                  {openApp === 'itunes' && (
                    <div
                      id="cw-osx-floating-window"
                      className="relative z-30 mx-auto my-auto w-[92%] sm:w-[86%] h-[74%] rounded-[7px] bg-[#ECEEF2]/95 border border-black/35 shadow-[0_14px_34px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden backdrop-blur-md"
                    >
                      <div className="h-[18px] sm:h-[22px] px-2 bg-gradient-to-b from-[#E7E9EE] to-[#C8CCD4] border-b border-[#989DA6] flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Close Window"
                            onClick={() => onToggleApp('none')}
                            className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E] cursor-pointer"
                          />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                        </div>
                        <span className="font-sans text-[8.5px] sm:text-[10.5px] font-bold text-[#272A30] truncate">
                          iTunes — Playlists & Spotify
                        </span>
                        <span className="w-6" />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto p-1.5 bg-[#F4F5F7]">
                        {renderLibraryWindowContent?.()}
                      </div>
                    </div>
                  )}

                  {/* Translucent 3D Glass OS X Lion Bottom Dock + Onboarding Demo Cursor */}
                  <div
                    id="cw-osx-lion-dock"
                    role="toolbar"
                    aria-label="OS X Lion Desktop Dock"
                    className="relative z-20 mx-auto mb-[3px] sm:mb-[7px] flex flex-col items-center shrink-0"
                  >
                    <div className="relative px-2 sm:px-4 pt-1 pb-[2px] sm:pb-[3px] flex items-end gap-1.5 sm:gap-3.5">
                      {/* 3D Perspective Translucent Glass Shelf Behind Icons */}
                      <div
                        aria-hidden="true"
                        style={{
                          transform: 'perspective(180px) rotateX(26deg)',
                          transformOrigin: 'bottom center',
                        }}
                        className="cw-osx-glass-dock-shelf pointer-events-none absolute inset-x-0 bottom-0 h-[11px] sm:h-[20px] rounded-[4px]"
                      />

                      {DOCK_APPS.map((app) => {
                        const isActive =
                          (app.id === 'spotify' && (openApp === 'itunes' || isPlaying)) ||
                          (app.id === 'youtube' && (openApp as string) === 'video');
                        const isDemoHovered =
                          openApp === 'none' &&
                          ((demoStep === 'spotify' && app.id === 'spotify') ||
                            (demoStep === 'youtube' && app.id === 'youtube'));

                        return (
                          <button
                            key={app.id}
                            id={`cw-imac-dock-app-${app.id}`}
                            type="button"
                            data-imac-dock-app={app.id}
                            data-demo-hovered={isDemoHovered ? 'true' : 'false'}
                            aria-label={app.label}
                            title={app.label}
                            onClick={() => {
                              dismissDemoCursor();
                              if (app.id === 'spotify') {
                                onToggleApp(openApp === 'itunes' ? 'none' : 'itunes');
                              } else if (app.id === 'youtube') {
                                onToggleApp((openApp as string) === 'video' ? 'none' : 'video');
                              } else if (app.id === 'prefs') {
                                onOpenSettingsPane();
                              } else if (app.id === 'launchpad') {
                                onCycleGeneration();
                              } else {
                                onToggleApp('none');
                              }
                            }}
                            className={`group relative z-10 w-[16px] h-[16px] sm:w-[28px] sm:h-[28px] transition-transform duration-200 hover:-translate-y-1.5 hover:scale-125 active:scale-95 cursor-pointer flex flex-col items-center ${
                              isDemoHovered ? '-translate-y-1.5 scale-125' : ''
                            }`}
                          >
                            {/* Frosted macOS Onboarding Callout Tooltip */}
                            {isDemoHovered && (
                              <span
                                id="cw-imac-demo-tooltip"
                                role="status"
                                className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-[5px] bg-[#1D1D1F]/88 backdrop-blur-md border border-white/25 text-[7.5px] sm:text-[9.5px] font-sans font-semibold text-white whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,0.45)] z-40"
                              >
                                {app.id === 'spotify'
                                  ? 'Load your playlist from Spotify'
                                  : 'Toggle YouTube Mode ON/OFF'}
                              </span>
                            )}

                            {renderDockIconSvg(app.id)}

                            {/* Classic macOS Black-Arrow Mouse Pointer (White Outline + Drop Shadow) */}
                            {isDemoHovered && (
                              <span
                                id="cw-imac-demo-cursor"
                                data-testid="cw-imac-demo-cursor"
                                data-demo-step={demoStep}
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-2 -right-2 z-50 w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-500"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="w-full h-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]"
                                >
                                  <path
                                    d="M4 2 L4 19 L8.5 14.8 L12.2 22 L15 20.6 L11.3 13.5 L17.5 13.5 Z"
                                    fill="#0B0D10"
                                    stroke="#FFFFFF"
                                    strokeWidth="1.8"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            )}

                            {/* Subtle Dock Shelf Reflection Under Each Glossy Icon */}
                            <span
                              aria-hidden="true"
                              className="pointer-events-none w-[70%] h-[3px] rounded-full bg-white/25 blur-[1px] mt-[0.5px]"
                            />
                            {isActive && (
                              <span
                                aria-hidden="true"
                                className="w-[3px] h-[3px] sm:w-[4px] sm:h-[4px] rounded-full bg-[#E0F2FE] shadow-[0_0_5px_#7DD3FC]"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Subtle Diagonal Ambient Room Glass Reflection Across Display Bezel */}
            <div
              aria-hidden="true"
              className="cw-imac-glass-reflection pointer-events-none absolute inset-0 z-30"
            />
          </div>

          {/* Lower 14%: Brushed Anodized Aluminum Bottom Chin + Centered Glossy Black Apple Emblem */}
          <div
            id="cw-2011-imac-chin"
            style={{ height: `${metrics.imacChinHeightPx}px` }}
            className="cw-imac-aluminum-chin relative w-full shrink-0 flex items-center justify-center"
          >
            <svg
              viewBox="0 0 24 28"
              aria-label="Apple Emblem"
              className="w-[10px] h-[12px] sm:w-[19px] sm:h-[23px] fill-[#111317] drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]"
            >
              <path d="M19.8 14.9c0-3.4 2.8-5 2.9-5.1-1.6-2.3-4.1-2.6-4.9-2.7-2-.2-4 1.2-5 1.2-1.1 0-2.7-1.2-4.4-1.2-2.3 0-4.4 1.3-5.6 3.4-2.4 4.1-.6 10.2 1.7 13.6 1.1 1.6 2.5 3.5 4.3 3.4 1.7-.1 2.4-1.1 4.4-1.1 2.1 0 2.7 1.1 4.5 1.1 1.9 0 3.1-1.7 4.2-3.3 1.3-1.9 1.9-3.8 1.9-3.9-.1 0-4-1.5-4-5.4zM16.1 5.1c.9-1.1 1.6-2.7 1.4-4.3-1.4.1-3.1.9-4.1 2-.9 1-1.6 2.6-1.4 4.2 1.5.1 3.1-.8 4.1-1.9z" />
            </svg>
          </div>
        </div>

        {/* Tapered Brushed Aluminum L-Stand Casting Soft Contact Shadow */}
        <div
          id="cw-2011-imac-stand"
          aria-hidden="true"
          className="pointer-events-none relative flex flex-col items-center -mt-[1px]"
        >
          <div
            style={{
              width: `${Math.round(metrics.imacWidthPx * 0.21)}px`,
              height: `${neckHeightPx}px`,
              clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
            }}
            className="cw-imac-l-stand-neck"
          />
          <div
            style={{
              width: `${Math.round(metrics.imacWidthPx * 0.27)}px`,
              height: `${footHeightPx}px`,
            }}
            className="cw-imac-l-stand-foot rounded-b-[4px]"
          />
          <div
            style={{
              width: `${Math.round(metrics.imacWidthPx * 0.34)}px`,
              height: isMobilePortrait ? '6px' : '10px',
            }}
            className="-mt-[3px] rounded-full bg-black/25 blur-[5px]"
          />
        </div>
      </div>
    );
  }
);

ClickWheelImacBackdrop.displayName = 'ClickWheelImacBackdrop';
