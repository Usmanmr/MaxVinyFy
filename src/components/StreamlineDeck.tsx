import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Disc3 } from 'lucide-react';
import {
  resolveActiveArtworkState,
  clampHolderBoxDragOffset,
  calculateHolderBoxDragTiltDeg,
  shouldRunActiveAnimationLoops,
} from '../utils/playerLogic';
import {
  STREAMLINE_TRACK_CHANGE_TIMELINE_MS,
  calculateStreamlineHolderSettleTiltDeg,
  hexToRgbaString,
} from '../utils/streamlineLogic';
import { retroAudio } from '../utils/retroAudioEngine';
import { SyncedLyricsPanel } from './SyncedLyricsPanel';
import type { TurntableDeckProps } from './TurntableDeck';

export const StreamlineDeck: React.FC<TurntableDeckProps> = ({
  track,
  isPlaying,
  isDocumentHidden,
  lowPowerMode,
  nightMode,
  prefersReducedMotion,
  rpm,
  pitchPercent,
  viewportLayout,
  themePalette,
  hideBoxArt = false,
  onSeek,
  onResolvedPerTrackArtwork,
}) => {
  const isStandby = track.id === 'standby-empty' || track.durationSec <= 0;
  const activeLoopsEnabled = shouldRunActiveAnimationLoops(
    isPlaying,
    isDocumentHidden,
    prefersReducedMotion,
    lowPowerMode
  );
  const playbackRate = (rpm === 45 ? 45 / 33.3333 : 1) * (1 + pitchPercent / 100);

  // Artwork resolution & caching
  const [artworkAttempt, setArtworkAttempt] = useState<number>(0);
  const [artworkBroken, setArtworkBroken] = useState<boolean>(false);

  const artworkState = useMemo(
    () => resolveActiveArtworkState(track, artworkAttempt),
    [track, artworkAttempt]
  );
  const resolvedArtworkUrl = artworkState.activeUrl || '';
  const hasMoreFallbackCandidates = artworkAttempt + 1 < artworkState.candidates.length;

  useEffect(() => {
    setArtworkAttempt(0);
    setArtworkBroken(false);
  }, [track.id, track.artworkUrl]);

  useEffect(() => {
    if (!isStandby && !resolvedArtworkUrl && onResolvedPerTrackArtwork) {
      let cancelled = false;
      const params = new URLSearchParams({
        trackId: track.id,
        title: track.title,
        artist: track.artist || '',
      });
      fetch(`/api/spotify/track-artwork?${params.toString()}`)
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
  }, [
    isStandby,
    resolvedArtworkUrl,
    track.id,
    track.title,
    track.artist,
    onResolvedPerTrackArtwork,
  ]);

  // Track-change choreography (<= 800ms): art crossfade + title slide-up fade + single soft tick
  const prevTrackIdRef = useRef<string>(track.id);
  const prevArtSnapRef = useRef<{ url: string }>({ url: resolvedArtworkUrl });
  const [outgoingArtUrl, setOutgoingArtUrl] = useState<string | null>(null);
  const [isArtFadingOut, setIsArtFadingOut] = useState<boolean>(false);
  const [titleAnimKey, setTitleAnimKey] = useState<number>(0);

  useEffect(() => {
    const prevId = prevTrackIdRef.current;
    const prevArt = prevArtSnapRef.current.url;
    if (prevId !== track.id) {
      prevTrackIdRef.current = track.id;
      setTitleAnimKey((k) => k + 1);
      retroAudio.triggerStreamlineSoftTick();

      if (prefersReducedMotion || lowPowerMode || isDocumentHidden || !prevArt) {
        setOutgoingArtUrl(null);
        setIsArtFadingOut(false);
      } else {
        setOutgoingArtUrl(prevArt);
        setIsArtFadingOut(false);
        let raf2Id: number | null = null;
        const rafId = window.requestAnimationFrame(() => {
          raf2Id = window.requestAnimationFrame(() => {
            setIsArtFadingOut(true);
          });
        });
        const timerId = window.setTimeout(() => {
          setOutgoingArtUrl(null);
          setIsArtFadingOut(false);
        }, STREAMLINE_TRACK_CHANGE_TIMELINE_MS.totalMs);
        return () => {
          window.cancelAnimationFrame(rafId);
          if (raf2Id !== null) window.cancelAnimationFrame(raf2Id);
          window.clearTimeout(timerId);
        };
      }
    }
  }, [track.id, prefersReducedMotion, lowPowerMode, isDocumentHidden]);

  useEffect(() => {
    prevArtSnapRef.current = { url: resolvedArtworkUrl };
  }, [resolvedArtworkUrl]);

  // Draggable floating glass-morphism holder card (settles flat at 0deg with soft shadow)
  const stageRef = useRef<HTMLDivElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [holderOffset, setHolderOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingHolder, setIsDraggingHolder] = useState<boolean>(false);
  const [dragTiltDeg, setDragTiltDeg] = useState<number>(0);
  const dragOriginRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
    lastClientX: number;
    bounds: {
      containerWidth: number;
      containerHeight: number;
      holderWidth: number;
      holderHeight: number;
      baseLeft: number;
      baseTop: number;
    };
  } | null>(null);

  const handleHolderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const surface = stageRef.current;
    const holder = holderRef.current;
    if (!surface || !holder) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const sRect = surface.getBoundingClientRect();
    const hRect = holder.getBoundingClientRect();
    const baseLeft = hRect.left - sRect.left - holderOffset.x;
    const baseTop = hRect.top - sRect.top - holderOffset.y;

    dragOriginRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: holderOffset.x,
      startOffsetY: holderOffset.y,
      lastClientX: e.clientX,
      bounds: {
        containerWidth: sRect.width,
        containerHeight: sRect.height,
        holderWidth: hRect.width,
        holderHeight: hRect.height,
        baseLeft,
        baseTop,
      },
    };
    setIsDraggingHolder(true);
  };

  const handleHolderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOriginRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const deltaX = e.clientX - drag.startClientX;
    const deltaY = e.clientY - drag.startClientY;
    const velocityX = e.clientX - drag.lastClientX;
    drag.lastClientX = e.clientX;

    const clamped = clampHolderBoxDragOffset({
      offsetX: drag.startOffsetX + deltaX,
      offsetY: drag.startOffsetY + deltaY,
      boardWidth: drag.bounds.containerWidth,
      boardHeight: drag.bounds.containerHeight,
      boxSize: Math.max(drag.bounds.holderWidth, drag.bounds.holderHeight),
      homeCenterX: drag.bounds.baseLeft + drag.bounds.holderWidth / 2,
      homeCenterY: drag.bounds.baseTop + drag.bounds.holderHeight / 2,
    });
    setHolderOffset({ x: clamped.offsetX, y: clamped.offsetY });
    setDragTiltDeg(
      Math.max(-5, Math.min(5, calculateHolderBoxDragTiltDeg(velocityX, true) * 0.65))
    );
  };

  const handleHolderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOriginRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragOriginRef.current = null;
    setIsDraggingHolder(false);
    setDragTiltDeg(calculateStreamlineHolderSettleTiltDeg());
  };

  const primaryGlowRgba = hexToRgbaString(themePalette.primaryHex || '#19C6A3', 0.42);
  const secondaryGlowRgba = hexToRgbaString(themePalette.lightHex || '#19C6A3', 0.24);
  const isCompactLandscape = viewportLayout === 'mobile-landscape';

  return (
    <section
      id="turntable-console-card"
      data-theme-deck="streamline"
      aria-label="Streamline Hero Music Stage"
      className="sl-card relative flex-1 min-h-0 w-full h-full flex flex-col justify-between overflow-hidden select-none"
    >
      <div
        id="console-top-surface"
        ref={stageRef}
        className="relative flex-1 min-h-0 w-full h-full flex flex-col items-center justify-center gap-2 lg:gap-3 px-4 lg:px-8 py-2.5 lg:py-4 overflow-hidden"
      >
        {/* Whisper-quiet top-right subtle ambient reflection tint */}
        <div
          aria-hidden="true"
          style={{
            background: `radial-gradient(ellipse 65% 55% at 50% 34%, ${secondaryGlowRgba} 0%, transparent 72%)`,
            transition: prefersReducedMotion || lowPowerMode ? 'none' : 'opacity 600ms ease',
          }}
          className="pointer-events-none absolute inset-0 z-0 opacity-70"
        />

        {/* 1. Hero Album Art Holder — Floating Glass-Morphism Card (backdrop-blur 20px, 1px white/10 border), Draggable, Settles Flat */}
        <div
          aria-hidden={hideBoxArt ? 'true' : undefined}
          style={{
            opacity: hideBoxArt ? 0 : 1,
            maxHeight: hideBoxArt ? '0px' : '520px',
            transform: hideBoxArt ? 'scale(0.92)' : 'scale(1)',
            pointerEvents: hideBoxArt ? 'none' : 'auto',
            overflow: hideBoxArt ? 'hidden' : 'visible',
            transition: prefersReducedMotion
              ? 'none'
              : 'opacity 240ms ease, max-height 260ms ease, transform 240ms ease',
          }}
          className="relative z-20 flex flex-col items-center justify-center shrink-0"
        >
          {/* Slow Ambient Glow Pulse Synced Loosely to Play State (Static when Paused) */}
          <div
            aria-hidden="true"
            data-ambient-glow-active={activeLoopsEnabled ? 'true' : 'false'}
            style={{
              background: `radial-gradient(circle at center, ${primaryGlowRgba} 0%, ${secondaryGlowRgba} 45%, transparent 72%)`,
              filter: 'blur(36px)',
            }}
            className="sl-ambient-art-glow pointer-events-none absolute -inset-6 sm:-inset-10 rounded-full z-0"
          />

          <div
            id="album-art-holder-box"
            ref={holderRef}
            role="region"
            aria-label="Draggable Album Art Card (Double-click to center)"
            title="Drag card freely · Double-click to center"
            onPointerDown={handleHolderPointerDown}
            onPointerMove={handleHolderPointerMove}
            onPointerUp={handleHolderPointerUp}
            onPointerCancel={handleHolderPointerUp}
            onDoubleClick={() => {
              setHolderOffset({ x: 0, y: 0 });
              setDragTiltDeg(0);
            }}
            data-holder-tilt={dragTiltDeg}
            data-dragging={isDraggingHolder ? 'true' : 'false'}
            style={{
              transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) rotate(${dragTiltDeg}deg)`,
              transition: isDraggingHolder
                ? 'none'
                : prefersReducedMotion || lowPowerMode
                  ? 'none'
                  : 'transform 340ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms ease',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              touchAction: 'none',
            }}
            className={`relative z-10 p-1.5 sm:p-2 rounded-[22px] border border-white/10 bg-[#161A20]/55 ${
              isDraggingHolder
                ? 'cursor-grabbing shadow-[0_28px_64px_rgba(0,0,0,0.72)]'
                : 'cursor-grab shadow-[0_18px_48px_rgba(0,0,0,0.58)]'
            }`}
          >
            {/* Inner Hero Album Art Square (min 40vh on desktop, radius 20px) */}
            <div
              className={`relative overflow-hidden rounded-[20px] bg-[#0F1115] shadow-[0_12px_36px_rgba(0,0,0,0.55)] flex items-center justify-center ${
                isCompactLandscape
                  ? 'w-[116px] h-[116px]'
                  : 'w-[min(64vw,240px)] h-[min(64vw,240px)] md:w-[min(40vh,410px)] md:h-[min(40vh,410px)] md:min-h-[40vh] md:min-w-[40vh]'
              }`}
            >
              {!isStandby && resolvedArtworkUrl && !artworkBroken ? (
                <img
                  id="vinyl-center-artwork"
                  src={resolvedArtworkUrl}
                  alt={`${track.title} album art`}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (hasMoreFallbackCandidates) {
                      setArtworkAttempt((a) => a + 1);
                    } else {
                      setArtworkBroken(true);
                    }
                  }}
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1D232B] via-[#161A20] to-[#0F1115] flex flex-col items-center justify-center gap-2 text-[#5E6673]">
                  <Disc3 strokeWidth={1.5} className="w-14 h-14 text-[#19C6A3]/70" />
                  <span className="text-[12px] font-medium text-[#A7AFBC]">
                    {isStandby ? 'Ready to stream' : track.title}
                  </span>
                </div>
              )}

              {/* Outgoing Artwork Crossfade Layer (<= 600ms) */}
              {outgoingArtUrl && (
                <img
                  src={outgoingArtUrl}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  style={{
                    opacity: isArtFadingOut ? 0 : 1,
                    transition: 'opacity 500ms ease-out',
                  }}
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover z-20"
                />
              )}
            </div>
          </div>

          {/* Subtle Mirrored Reflection Beneath Hero Art */}
          {!isCompactLandscape && !isStandby && resolvedArtworkUrl && !artworkBroken && (
            <div
              aria-hidden="true"
              style={{
                transform: `translate3d(${holderOffset.x}px, ${holderOffset.y}px, 0) scaleY(-1)`,
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 22%, rgba(0, 0, 0, 0.85) 100%)',
                maskImage:
                  'linear-gradient(to bottom, transparent 22%, rgba(0, 0, 0, 0.85) 100%)',
                transition: isDraggingHolder
                  ? 'none'
                  : prefersReducedMotion || lowPowerMode
                    ? 'none'
                    : 'transform 340ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="pointer-events-none relative z-0 -mt-1 w-[min(64vw,240px)] md:w-[min(40vh,410px)] h-5 lg:h-9 rounded-b-[20px] overflow-hidden opacity-[0.16] blur-[2px]"
            >
              <img
                src={resolvedArtworkUrl}
                alt=""
                draggable={false}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-bottom"
              />
            </div>
          )}
        </div>

        {/* 2. Heart-Less Song Title & Artist Beneath Hero Art (Slide-Up Fade on Track Change) */}
        <div
          key={`title-block-${titleAnimKey}-${track.id}`}
          className={`relative z-10 w-full max-w-2xl text-center flex flex-col items-center ${
            isCompactLandscape ? 'gap-0.5' : 'gap-0.5 sm:gap-1'
          } ${prefersReducedMotion || lowPowerMode ? '' : 'sl-title-slide-up'} shrink-0`}
        >
          <h2
            id="console-song-title"
            className={`w-full truncate font-sans font-bold tracking-tight text-[#FFFFFF] ${
              isCompactLandscape
                ? 'text-[18px] leading-tight'
                : 'text-[22px] sm:text-[28px] leading-[1.15]'
            }`}
          >
            {isStandby ? 'Ready to Play' : track.title}
          </h2>
          <p
            id="console-artist-name"
            className={`w-full truncate font-sans font-medium text-[#A7AFBC] ${
              isCompactLandscape ? 'text-[12px]' : 'text-[14px] sm:text-[15px]'
            }`}
          >
            {isStandby ? 'Connect Spotify in the left panel to start listening' : track.artist}
          </p>
        </div>

        {/* 3. Big Karaoke Style Lyrics Below Title/Artist (3 lines visible, current white 22px, others #5E6673, 200ms transitions) */}
        <div
          id="console-lyrics-wrapper"
          className={`relative z-10 w-full max-w-2xl min-h-0 ${
            isCompactLandscape ? 'h-[62px] shrink-0' : 'flex-1 min-h-[78px] max-h-[126px]'
          }`}
        >
          <SyncedLyricsPanel
            track={track}
            isStandby={isStandby}
            isPlaying={isPlaying}
            isDocumentHidden={isDocumentHidden}
            lowPowerMode={lowPowerMode}
            nightMode={nightMode}
            playbackRate={playbackRate}
            prefersReducedMotion={prefersReducedMotion}
            themePalette={themePalette}
            themeId="streamline"
            onSeek={onSeek}
            className="w-full h-full"
          />
        </div>
      </div>
    </section>
  );
};

StreamlineDeck.displayName = 'StreamlineDeck';
