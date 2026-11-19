import React, { useEffect, useRef, useState } from 'react';
import { computeEarPodHangingCablePaths } from '../../utils/clickWheelLogic';
import { retroAudio } from '../../utils/retroAudioEngine';

export interface ClickWheelEarbudsProps {
  isPlaying: boolean;
  activeLoopsEnabled: boolean;
  prefersReducedMotion: boolean;
  trackPulseKey: number;
  dockWidthScaledPx: number;
  dockHeightPx?: number;
  isMobilePortrait: boolean;
}

/**
 * 1.2 Naturally Hanging & Waving EarPods (No Wires Blocking the Front Speaker Grille):
 * - Anchors the classic white wired Apple EarPods from the top-side outer edges of the Hi-Fi dock
 *   (outside the center charcoal speaker grille `x: 235..565`) so the acoustic mesh is 100% unobstructed.
 * - The EarPod earpieces themselves hang downward naturally in open space at the bottom of their
 *   vertical stems and swing with a continuous pendulum and spring-wave physics simulation.
 */
export const ClickWheelEarbuds: React.FC<ClickWheelEarbudsProps> = React.memo(
  ({
    isPlaying,
    activeLoopsEnabled,
    prefersReducedMotion,
    trackPulseKey,
    dockWidthScaledPx,
    dockHeightPx = 172,
    isMobilePortrait,
  }) => {
    const bounceActive = activeLoopsEnabled && isPlaying;
    const svgWidth = Math.min(Math.round(dockWidthScaledPx), isMobilePortrait ? 366 : 800);
    const svgHeight = isMobilePortrait ? 68 : Math.max(152, dockHeightPx + 14);

    const [cablePose, setCablePose] = useState(() =>
      computeEarPodHangingCablePaths(0, 0, 0)
    );
    const impulseRef = useRef<number>(0);

    useEffect(() => {
      if (trackPulseKey > 0 && !prefersReducedMotion) {
        impulseRef.current = 1;
      }
    }, [trackPulseKey, prefersReducedMotion]);

    useEffect(() => {
      if (prefersReducedMotion) {
        setCablePose(computeEarPodHangingCablePaths(0, 0, 0));
        return;
      }

      let rafId = 0;
      const startMs = performance.now();

      const stepRopePhysics = (nowMs: number) => {
        const elapsedSec = (nowMs - startMs) / 1000;
        const vu = isPlaying ? retroAudio.getVuLevels() : { left: 0, right: 0 };
        const bassEnergy = isPlaying
          ? Math.max(0.22, Math.min(1, Math.max(vu.left, vu.right)))
          : 0.08;
        impulseRef.current = Math.max(0, impulseRef.current * 0.92);

        setCablePose(
          computeEarPodHangingCablePaths(elapsedSec, bassEnergy, impulseRef.current)
        );
        rafId = window.requestAnimationFrame(stepRopePhysics);
      };

      rafId = window.requestAnimationFrame(stepRopePhysics);
      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }, [isPlaying, prefersReducedMotion]);

    return (
      <div
        id="cw-wired-earbuds"
        aria-label="Naturally Hanging Wired Apple EarPods with Pendulum Wave Physics"
        data-playing={bounceActive ? 'true' : 'false'}
        data-top-mounted="true"
        data-front-grille-unobstructed="true"
        data-pendulum-sway={cablePose.pendulumSwayPx}
        style={{
          width: `${svgWidth}px`,
          height: `${svgHeight}px`,
          top: isMobilePortrait ? '-4px' : '-6px',
        }}
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-[32] flex items-start justify-center overflow-visible"
      >
        <svg
          viewBox="0 0 800 176"
          preserveAspectRatio="xMidYMin meet"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="cwCordGloss" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#D6DCE5" />
              <stop offset="42%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#B8C0CC" />
            </linearGradient>
            <linearGradient id="cwEarbudStem" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#CBD2DC" />
              <stop offset="48%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#D6DCE5" />
            </linearGradient>
            <radialGradient id="cwEarbudHead" cx="42%" cy="32%" r="65%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="68%" stopColor="#EBEEF3" />
              <stop offset="100%" stopColor="#C5CCD6" />
            </radialGradient>
            <filter id="cwEarbudDropShadow" x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="2.6"
                floodColor="#0F172A"
                floodOpacity="0.34"
              />
            </filter>
          </defs>

          {/* =================================================================
              NATURAL VERTICAL HANGING CABLES ON LEFT & RIGHT FLANKS OF DOCK
              (100% CLEAR OF CENTER CHARCOAL SPEAKER GRILLE x: 235..565)
              ================================================================= */}
          <g data-testid="cw-hanging-earpod-cables">
            {/* Soft contact shadow cast onto satin white side bezel */}
            <path
              d={cablePose.leftCordPath}
              fill="none"
              stroke="rgba(15, 23, 42, 0.22)"
              strokeWidth="4.6"
              strokeLinecap="round"
              transform="translate(1.5, 3)"
            />
            <path
              d={cablePose.rightCordPath}
              fill="none"
              stroke="rgba(15, 23, 42, 0.22)"
              strokeWidth="4.6"
              strokeLinecap="round"
              transform="translate(1.5, 3)"
            />

            {/* Top-edge anchor rubberized grommets */}
            <circle cx="218" cy="6" r="3.4" fill="#CBD2DC" stroke="#94A3B8" strokeWidth="0.8" />
            <circle cx="582" cy="6" r="3.4" fill="#CBD2DC" stroke="#94A3B8" strokeWidth="0.8" />

            {/* Left vertical hanging cylindrical white cord */}
            <path
              id="cw-earpod-left-hanging-cord"
              d={cablePose.leftCordPath}
              fill="none"
              stroke="url(#cwCordGloss)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />

            {/* Right vertical hanging cylindrical white cord */}
            <path
              id="cw-earpod-right-hanging-cord"
              d={cablePose.rightCordPath}
              fill="none"
              stroke="url(#cwCordGloss)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </g>

          {/* =================================================================
              LEFT EARPOD EARPIECE HANGING DOWNWARD NATURALLY IN OPEN SPACE
              AT THE BOTTOM OF THE LEFT VERTICAL PENDULUM STEM
              ================================================================= */}
          <g
            id="cw-hanging-earpod-left"
            key={`l-${trackPulseKey}`}
            filter="url(#cwEarbudDropShadow)"
            transform={`translate(${cablePose.leftEarPodX}, ${cablePose.leftEarPodY}) rotate(${cablePose.leftPendulumDeg})`}
          >
            {/* Upper strain-relief collar connecting to hanging wire */}
            <rect x="-2.4" y="-3" width="4.8" height="9" rx="2.2" fill="#D4D8DF" />
            {/* Vertical glossy cylindrical stem hanging downward */}
            <rect
              x="-4.2"
              y="4"
              width="8.4"
              height="24"
              rx="4.2"
              fill="url(#cwEarbudStem)"
              stroke="#C6CCD5"
              strokeWidth="0.7"
            />
            {/* Soft grey rubberized neck ring */}
            <rect x="-4.8" y="25" width="9.6" height="3.8" rx="1.5" fill="#A9B0BA" />
            {/* Hanging Earpiece Head + Acoustic Grille */}
            <ellipse cx="3.2" cy="36.5" rx="13.5" ry="12" fill="#B2B8C2" />
            <ellipse
              cx="2.6"
              cy="35.8"
              rx="12.5"
              ry="11"
              fill="url(#cwEarbudHead)"
              stroke="#D4D8E0"
              strokeWidth="0.6"
            />
            {/* Perforated oval acoustic mesh */}
            <ellipse
              cx="6.4"
              cy="36.2"
              rx="6.8"
              ry="4.5"
              fill="#32363D"
              stroke="#8C939E"
              strokeWidth="0.7"
            />
            <circle cx="4.2" cy="35.5" r="0.75" fill="#111317" />
            <circle cx="6.4" cy="34.8" r="0.75" fill="#111317" />
            <circle cx="8.6" cy="35.5" r="0.75" fill="#111317" />
            <circle cx="5.3" cy="37.2" r="0.75" fill="#111317" />
            <circle cx="7.5" cy="37.2" r="0.75" fill="#111317" />
            {/* Crisp L Marking on vertical stem */}
            <text
              x="-1.8"
              y="18"
              fontSize="5"
              fontWeight="800"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fill="#64748B"
            >
              L
            </text>
          </g>

          {/* =================================================================
              RIGHT EARPOD EARPIECE HANGING DOWNWARD NATURALLY IN OPEN SPACE
              AT THE BOTTOM OF THE RIGHT VERTICAL PENDULUM STEM
              ================================================================= */}
          <g
            id="cw-hanging-earpod-right"
            key={`r-${trackPulseKey}`}
            filter="url(#cwEarbudDropShadow)"
            transform={`translate(${cablePose.rightEarPodX}, ${cablePose.rightEarPodY}) rotate(${cablePose.rightPendulumDeg})`}
          >
            {/* Upper strain-relief collar connecting to hanging wire */}
            <rect x="-2.4" y="-3" width="4.8" height="9" rx="2.2" fill="#D4D8DF" />
            {/* Vertical glossy cylindrical stem hanging downward */}
            <rect
              x="-4.2"
              y="4"
              width="8.4"
              height="24"
              rx="4.2"
              fill="url(#cwEarbudStem)"
              stroke="#C6CCD5"
              strokeWidth="0.7"
            />
            {/* Soft grey rubberized neck ring */}
            <rect x="-4.8" y="25" width="9.6" height="3.8" rx="1.5" fill="#A9B0BA" />
            {/* Hanging Earpiece Head + Acoustic Grille */}
            <ellipse cx="-3.2" cy="36.5" rx="13.5" ry="12" fill="#B2B8C2" />
            <ellipse
              cx="-2.6"
              cy="35.8"
              rx="12.5"
              ry="11"
              fill="url(#cwEarbudHead)"
              stroke="#D4D8E0"
              strokeWidth="0.6"
            />
            {/* Perforated oval acoustic mesh */}
            <ellipse
              cx="-6.4"
              cy="36.2"
              rx="6.8"
              ry="4.5"
              fill="#32363D"
              stroke="#8C939E"
              strokeWidth="0.7"
            />
            <circle cx="-4.2" cy="35.5" r="0.75" fill="#111317" />
            <circle cx="-6.4" cy="34.8" r="0.75" fill="#111317" />
            <circle cx="-8.6" cy="35.5" r="0.75" fill="#111317" />
            <circle cx="-5.3" cy="37.2" r="0.75" fill="#111317" />
            <circle cx="-7.5" cy="37.2" r="0.75" fill="#111317" />
            {/* Crisp R Marking on vertical stem */}
            <text
              x="-1.8"
              y="18"
              fontSize="5"
              fontWeight="800"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fill="#64748B"
            >
              R
            </text>
          </g>
        </svg>
      </div>
    );
  }
);

ClickWheelEarbuds.displayName = 'ClickWheelEarbuds';
