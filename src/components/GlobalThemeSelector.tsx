import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Disc3,
  Radio,
  Tv,
  SlidersHorizontal,
  Sparkles,
  Image as ImageIcon,
  EyeOff,
} from 'lucide-react';
import { triggerButtonHaptic, type DominantThemePalette } from '../utils/playerLogic';
import { DEFAULT_THEME_ID, type ThemeDefinition } from '../themes/themeRegistry';

/**
 * PART 1.5: The 7 Canonical Drawer Themes (Minimalist Icon + Concise Theme Name only)
 */
export interface DrawerThemeEntry {
  id: string;
  conciseName: string;
}

export const DRAWER_CANONICAL_THEMES: readonly DrawerThemeEntry[] = [
  { id: 'cassette-deck', conciseName: 'Cassette' },
  { id: 'cd-hifi', conciseName: 'CD' },
  { id: 'click-wheel', conciseName: 'iPod' },
  { id: 'squircle-pmp', conciseName: 'Zune' },
  { id: 'retro-turntable', conciseName: 'Turntable' },
  { id: 'reel-to-reel', conciseName: 'Reel-to-Reel' },
  { id: 'aurora-deck', conciseName: 'Hologram' },
] as const;

export const THEME_DRAWER_DISCOVERY_STORAGE_KEY = 'hasOpenedThemeDrawer';

export interface ThemeAdaptiveDrawerSkin {
  tabBackground: string;
  tabBorder: string;
  tabBoxShadow: string;
  tabSvgStartHex: string;
  tabSvgMidHex: string;
  tabSvgEndHex: string;
  tabSvgStrokeHex: string;
  tabSvgFilterShadow: string;
  chevronWellBackground: string;
  chevronColor: string;
  gripLineColor: string;
  drawerBackground: string;
  drawerBorderLeft: string;
  drawerBoxShadow: string;
  drawerTextHex: string;
  drawerSubTextHex: string;
  activeRowBackground: string;
  activeRowBorder: string;
  activeRowTextHex: string;
  inactiveRowBackground: string;
  inactiveRowBorder: string;
  footerBorderTop: string;
  hasRgbRim?: boolean;
  hasScanlines?: boolean;
}

/**
 * PART 1.2: Dynamic Theme-Adaptive Material Synchronization for the Curved Pull-Tab & Slide-Out Drawer
 */
export function resolveThemeAdaptiveDrawerSkin(activeThemeId: string): ThemeAdaptiveDrawerSkin {
  switch (activeThemeId) {
    case 'cassette-deck':
      return {
        tabBackground:
          'repeating-linear-gradient(180deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, rgba(30,33,38,0.12) 1px, rgba(30,33,38,0.12) 2px), linear-gradient(180deg, #E2E5E8 0%, #BFC3C7 55%, #9EA3A8 100%)',
        tabBorder: '1.5px solid #F8FAFC',
        tabBoxShadow:
          '-4px 4px 14px rgba(0, 0, 0, 0.52), inset 1px 1px 0 #FFFFFF, 0 0 0 1px #5A5E62',
        tabSvgStartHex: '#E5E8EC',
        tabSvgMidHex: '#C2C6CA',
        tabSvgEndHex: '#9BA0A5',
        tabSvgStrokeHex: '#F8FAFC',
        tabSvgFilterShadow: 'drop-shadow(-3px 2px 6px rgba(0, 0, 0, 0.48))',
        chevronWellBackground: '#18191B',
        chevronColor: '#141516',
        gripLineColor: 'rgba(24, 25, 27, 0.55)',
        drawerBackground:
          'repeating-linear-gradient(180deg, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px, rgba(40,44,48,0.1) 1px, rgba(40,44,48,0.1) 2px), linear-gradient(180deg, #E6E8EA 0%, #D0D3D6 48%, #B8BCC0 85%, #9EA3A8 100%)',
        drawerBorderLeft: '3px solid #F8FAFC',
        drawerBoxShadow: '-12px 0 36px rgba(0, 0, 0, 0.65), inset 1px 0 0 #FFFFFF',
        drawerTextHex: '#141516',
        drawerSubTextHex: '#3A3E42',
        activeRowBackground: '#18191B',
        activeRowBorder: '#E61919',
        activeRowTextHex: '#F4F6F8',
        inactiveRowBackground: 'rgba(244, 246, 248, 0.72)',
        inactiveRowBorder: '#787C82',
        footerBorderTop: '2px solid #707478',
      };

    case 'cd-hifi':
      return {
        tabBackground:
          'linear-gradient(160deg, #2B3344 0%, #0E131D 52%, #070A10 100%)',
        tabBorder: '1.5px solid #00F0FF',
        tabBoxShadow:
          '-3px 0 14px rgba(0, 240, 255, 0.55), -1px 0 6px rgba(255, 0, 128, 0.45), inset 1px 1px 0 rgba(255,255,255,0.45)',
        tabSvgStartHex: '#252E3F',
        tabSvgMidHex: '#101622',
        tabSvgEndHex: '#070A10',
        tabSvgStrokeHex: '#00F0FF',
        tabSvgFilterShadow: 'drop-shadow(-3px 0 8px rgba(0, 240, 255, 0.45))',
        chevronWellBackground: '#06080D',
        chevronColor: '#00F0FF',
        gripLineColor: 'rgba(0, 240, 255, 0.48)',
        drawerBackground:
          'linear-gradient(180deg, #151B26 0%, #0B0F17 55%, #070A0F 100%)',
        drawerBorderLeft: '2px solid #00F0FF',
        drawerBoxShadow:
          '-10px 0 32px rgba(0, 0, 0, 0.85), -2px 0 16px rgba(0, 240, 255, 0.35)',
        drawerTextHex: '#F1F5F9',
        drawerSubTextHex: '#94A3B8',
        activeRowBackground: 'linear-gradient(90deg, rgba(0,240,255,0.18) 0%, rgba(15,23,42,0.95) 100%)',
        activeRowBorder: '#00F0FF',
        activeRowTextHex: '#00F0FF',
        inactiveRowBackground: 'rgba(18, 24, 36, 0.88)',
        inactiveRowBorder: '#2E384B',
        footerBorderTop: '1px solid #2E384B',
        hasRgbRim: true,
      };

    case 'click-wheel':
      return {
        tabBackground:
          'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(242,244,248,0.94) 55%, rgba(226,230,237,0.94) 100%)',
        tabBorder: '1px solid #C8CDD5',
        tabBoxShadow:
          '-4px 0 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 #FFFFFF',
        tabSvgStartHex: '#FFFFFF',
        tabSvgMidHex: '#F1F3F7',
        tabSvgEndHex: '#DFE4EC',
        tabSvgStrokeHex: '#C2C8D2',
        tabSvgFilterShadow: 'drop-shadow(-3px 2px 8px rgba(15, 23, 42, 0.18))',
        chevronWellBackground: 'rgba(235, 238, 243, 0.9)',
        chevronColor: '#007AFF',
        gripLineColor: 'rgba(142, 147, 153, 0.45)',
        drawerBackground:
          'linear-gradient(180deg, rgba(252,253,255,0.95) 0%, rgba(240,243,248,0.95) 100%)',
        drawerBorderLeft: '1px solid #C8CDD5',
        drawerBoxShadow:
          '-12px 0 34px rgba(15, 23, 42, 0.18), inset 1px 0 0 #FFFFFF',
        drawerTextHex: '#1D1D1F',
        drawerSubTextHex: '#6E6E73',
        activeRowBackground: 'linear-gradient(180deg, #5AA9FF 0%, #007AFF 52%, #0058CC 100%)',
        activeRowBorder: '#0058CC',
        activeRowTextHex: '#FFFFFF',
        inactiveRowBackground: '#FFFFFF',
        inactiveRowBorder: '#D8DCE3',
        footerBorderTop: '1px solid #D8DCE3',
      };

    case 'squircle-pmp':
      return {
        tabBackground:
          'linear-gradient(180deg, #4A3A2E 0%, #33271E 55%, #231B15 100%)',
        tabBorder: '1.5px solid #7E8F4E',
        tabBoxShadow:
          '-4px 0 16px rgba(0, 0, 0, 0.65), -1px 0 6px rgba(126, 143, 78, 0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
        tabSvgStartHex: '#4A3A2E',
        tabSvgMidHex: '#31251D',
        tabSvgEndHex: '#1F1812',
        tabSvgStrokeHex: '#849650',
        tabSvgFilterShadow: 'drop-shadow(-3px 2px 8px rgba(0, 0, 0, 0.58))',
        chevronWellBackground: '#1C1510',
        chevronColor: '#FFFFFF',
        gripLineColor: 'rgba(126, 143, 78, 0.55)',
        drawerBackground:
          'linear-gradient(180deg, #3A2D23 0%, #261D17 60%, #19130F 100%)',
        drawerBorderLeft: '2px solid #7E8F4E',
        drawerBoxShadow: '-12px 0 34px rgba(0, 0, 0, 0.78)',
        drawerTextHex: '#FFFFFF',
        drawerSubTextHex: '#B6ADA3',
        activeRowBackground: 'linear-gradient(90deg, #E6007E 0%, #F26A1B 100%)',
        activeRowBorder: '#FF7AC6',
        activeRowTextHex: '#FFFFFF',
        inactiveRowBackground: 'rgba(24, 19, 15, 0.78)',
        inactiveRowBorder: '#55503C',
        footerBorderTop: '1px solid #55503C',
      };

    case 'reel-to-reel':
      return {
        tabBackground:
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, rgba(0,0,0,0.08) 1px, rgba(0,0,0,0.08) 2px), linear-gradient(180deg, #ECEFF2 0%, #C8CCD0 52%, #9EA2A6 100%)',
        tabBorder: '1.5px solid #FFB347',
        tabBoxShadow:
          '-3px 0 14px rgba(255, 179, 71, 0.42), -6px 4px 16px rgba(0, 0, 0, 0.6), inset 1px 1px 0 #FFFFFF',
        tabSvgStartHex: '#ECEFF2',
        tabSvgMidHex: '#C6CACF',
        tabSvgEndHex: '#9EA2A6',
        tabSvgStrokeHex: '#FFB347',
        tabSvgFilterShadow: 'drop-shadow(-3px 2px 7px rgba(0, 0, 0, 0.5))',
        chevronWellBackground: '#262320',
        chevronColor: '#262320',
        gripLineColor: 'rgba(42, 35, 28, 0.55)',
        drawerBackground:
          'linear-gradient(180deg, #DFD6C5 0%, #C8BFA9 55%, #B2A68E 100%)',
        drawerBorderLeft: '2.5px solid #FFB347',
        drawerBoxShadow:
          '-12px 0 34px rgba(0, 0, 0, 0.72), -2px 0 14px rgba(255, 179, 71, 0.28)',
        drawerTextHex: '#1F150C',
        drawerSubTextHex: '#5B4128',
        activeRowBackground: '#26211C',
        activeRowBorder: '#FFB347',
        activeRowTextHex: '#FFB347',
        inactiveRowBackground: 'rgba(247, 242, 232, 0.85)',
        inactiveRowBorder: '#8C7E6A',
        footerBorderTop: '1.5px solid #8C7E6A',
      };

    case 'aurora-deck':
      return {
        tabBackground:
          'linear-gradient(160deg, rgba(16, 22, 38, 0.78) 0%, rgba(8, 11, 22, 0.88) 100%)',
        tabBorder: '1.5px solid #00FFFF',
        tabBoxShadow:
          '-2px 0 14px rgba(0, 255, 255, 0.5), -1px 0 8px rgba(255, 0, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
        tabSvgStartHex: '#152038',
        tabSvgMidHex: '#0C1222',
        tabSvgEndHex: '#070A14',
        tabSvgStrokeHex: '#00FFFF',
        tabSvgFilterShadow: 'drop-shadow(-3px 0 9px rgba(0, 255, 255, 0.46))',
        chevronWellBackground: 'rgba(6, 10, 20, 0.85)',
        chevronColor: '#00FFFF',
        gripLineColor: 'rgba(0, 255, 255, 0.48)',
        drawerBackground:
          'linear-gradient(180deg, rgba(11, 15, 28, 0.86) 0%, rgba(7, 9, 18, 0.92) 100%)',
        drawerBorderLeft: '1.5px solid #00FFFF',
        drawerBoxShadow:
          '-10px 0 32px rgba(0, 0, 0, 0.85), -2px 0 16px rgba(0, 255, 255, 0.42)',
        drawerTextHex: '#EAF2FF',
        drawerSubTextHex: '#8E9AB8',
        activeRowBackground: 'rgba(0, 255, 255, 0.16)',
        activeRowBorder: '#00FFFF',
        activeRowTextHex: '#00FFFF',
        inactiveRowBackground: 'rgba(255, 255, 255, 0.05)',
        inactiveRowBorder: 'rgba(255, 255, 255, 0.14)',
        footerBorderTop: '1px solid rgba(0, 255, 255, 0.28)',
        hasScanlines: true,
      };

    case 'retro-turntable':
    default:
      return {
        tabBackground:
          'linear-gradient(160deg, #4B2E1B 0%, #2D1A0E 55%, #1D120A 100%)',
        tabBorder: '1.5px solid #D6C7B2',
        tabBoxShadow:
          '-4px 4px 16px rgba(0, 0, 0, 0.72), inset 1px 1px 0 rgba(255, 243, 214, 0.45)',
        tabSvgStartHex: '#4B2E1B',
        tabSvgMidHex: '#2E1B0F',
        tabSvgEndHex: '#1C1009',
        tabSvgStrokeHex: '#D6C7B2',
        tabSvgFilterShadow: 'drop-shadow(-3px 2px 8px rgba(0, 0, 0, 0.65))',
        chevronWellBackground: '#18120D',
        chevronColor: '#F8EAD6',
        gripLineColor: 'rgba(248, 234, 214, 0.42)',
        drawerBackground:
          'linear-gradient(180deg, #321E11 0%, #21130A 55%, #160C06 100%)',
        drawerBorderLeft: '2px solid #C8A97E',
        drawerBoxShadow: '-12px 0 36px rgba(0, 0, 0, 0.85)',
        drawerTextHex: '#F8EAD6',
        drawerSubTextHex: '#C8B49A',
        activeRowBackground: '#3B2313',
        activeRowBorder: '#F59E0B',
        activeRowTextHex: '#FDE68A',
        inactiveRowBackground: 'rgba(24, 14, 8, 0.82)',
        inactiveRowBorder: '#6B482B',
        footerBorderTop: '1px solid #6B482B',
      };
  }
}

/**
 * PART 1.4: Pure helper to validate whether a touch/pointer swipe qualifies to open or close the drawer
 */
export function evaluateGlobalDrawerSwipeGesture(params: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isDrawerOpen: boolean;
  originatedInExcludedControl: boolean;
}): 'open' | 'close' | 'none' {
  if (params.originatedInExcludedControl) {
    return 'none';
  }
  const deltaX = params.endX - params.startX;
  const deltaY = params.endY - params.startY;
  const isDominantHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.6;
  if (!isDominantHorizontal) {
    return 'none';
  }
  if (!params.isDrawerOpen && deltaX <= -50) {
    return 'open';
  }
  if (params.isDrawerOpen && deltaX >= 50) {
    return 'close';
  }
  return 'none';
}

export interface GlobalThemeSelectorProps {
  activeThemeId: string;
  availableThemes: readonly ThemeDefinition[];
  themePalette: DominantThemePalette;
  hideBoxArt?: boolean;
  isPlaying?: boolean;
  isStandby?: boolean;
  isDocumentHidden?: boolean;
  prefersReducedMotion?: boolean;
  onSelectTheme: (themeId: string) => void;
  onToggleHideBoxArt?: () => void;
}

const renderMinimalistThemeIcon = (themeId: string, colorHex: string) => {
  switch (themeId) {
    case 'cassette-deck':
      return <Radio style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
    case 'cd-hifi':
      return <Disc3 style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
    case 'click-wheel':
      return <SlidersHorizontal style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
    case 'squircle-pmp':
      return <Tv style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
    case 'retro-turntable':
      return <Disc3 style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
    case 'reel-to-reel':
      return <Radio style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
    case 'aurora-deck':
    default:
      return <Sparkles style={{ color: colorHex }} className="w-4 h-4 shrink-0" />;
  }
};

/**
 * PART 2: Global Top-Left Brand Emblem — Strictly Static "MYT" Core & Concentric Rotating Outer Ring
 * - Fixed Top-Left Viewport Anchor: `position: fixed; top: 16px; left: 16px; z-index: 9998`
 *   (scaling from `56px × 56px` on desktop/landscape to `44px × 44px` at `top: 12px; left: 12px` on mobile)
 * - Strictly Decoupled DOM Layer Architecture:
 *   - Layer 1 (`z-index: 1`): Rotating Outer Mechanical/Graphic Ring (`position: absolute; inset: 0;`)
 *   - Layer 2 (`z-index: 2`): Strictly Static "MYT" Center Core (`position: absolute; inset: 0; transform: none !important;`)
 *     Ensure `MYT` is NEVER nested inside a rotating parent element!
 */
export const GlobalMytBrandEmblem = React.memo<{
  activeThemeId: string;
  themePalette: DominantThemePalette;
  isPlaying: boolean;
  isStandby: boolean;
  isDocumentHidden: boolean;
  prefersReducedMotion: boolean;
}>(({ activeThemeId, themePalette, isPlaying, isStandby, isDocumentHidden, prefersReducedMotion }) => {
  const shouldSpin = Boolean(
    isPlaying && !isStandby && !isDocumentHidden && !prefersReducedMotion
  );

  const hubStyle = useMemo(() => {
    switch (activeThemeId) {
      case 'cassette-deck':
        return {
          bg: 'linear-gradient(180deg, #F4F6F8 0%, #D0D3D6 100%)',
          border: '#5A5E62',
          textHex: '#141516',
        };
      case 'cd-hifi':
        return {
          bg: 'radial-gradient(circle, #151C28 0%, #090C12 100%)',
          border: '#00F0FF',
          textHex: '#00F0FF',
        };
      case 'click-wheel':
        return {
          bg: 'linear-gradient(180deg, #FFFFFF 0%, #E8ECF2 100%)',
          border: '#B8C0CC',
          textHex: '#1D1D1F',
        };
      case 'squircle-pmp':
        return {
          bg: 'linear-gradient(180deg, #3A2D23 0%, #1F1812 100%)',
          border: '#7E8F4E',
          textHex: '#FFFFFF',
        };
      case 'reel-to-reel':
        return {
          bg: 'radial-gradient(circle, #2B2520 0%, #171310 100%)',
          border: '#FFB347',
          textHex: '#FFB347',
        };
      case 'aurora-deck':
        return {
          bg: 'radial-gradient(circle, rgba(12, 18, 34, 0.94) 0%, rgba(6, 9, 18, 0.98) 100%)',
          border: '#00FFFF',
          textHex: '#00FFFF',
        };
      case 'retro-turntable':
      default:
        return {
          bg: `linear-gradient(135deg, ${themePalette.primaryHex} 0%, ${themePalette.darkHex} 100%)`,
          border: '#D6C7B2',
          textHex: '#FFFFFF',
        };
    }
  }, [activeThemeId, themePalette.primaryHex, themePalette.darkHex]);

  const renderThemeOuterRotatingRing = () => {
    switch (activeThemeId) {
      case 'cassette-deck':
        /* Cassette Mode: Miniature 6-tooth cassette tape reel hub ring with spoked dark-grey/silver teeth */
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#18191B" stroke="#D0D3D6" strokeWidth="2" />
            <circle cx="32" cy="32" r="26.5" fill="none" stroke="#686C70" strokeWidth="1.2" strokeDasharray="4 2.5" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <rect
                key={deg}
                x="29.5"
                y="4.5"
                width="5"
                height="9.5"
                rx="1"
                fill="#F4F6F8"
                stroke="#5A5E62"
                strokeWidth="0.8"
                transform={`rotate(${deg} 32 32)`}
              />
            ))}
          </svg>
        );

      case 'cd-hifi':
        /* CD Player Mode: Miniature optical CD ring with rainbow iridescent polycarbonate glint & RGB rim */
        return (
          <div
            className="w-full h-full rounded-full border-[2px] border-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.65),inset_0_0_6px_rgba(255,0,128,0.5)]"
            style={{
              background:
                'conic-gradient(from 0deg, #E2E8F0 0deg, #38BDF8 55deg, #F472B6 110deg, #FACC15 165deg, #E2E8F0 215deg, #34D399 275deg, #818CF8 325deg, #E2E8F0 360deg)',
            }}
          />
        );

      case 'reel-to-reel':
        /* Reel-to-Reel Mode: Miniature 3-spoke brushed aluminum tape reel flange rim with radial cutouts */
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#C8CCD0" stroke="#5A5E62" strokeWidth="1.8" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="#FFB347" strokeWidth="1" opacity="0.7" />
            {[0, 120, 240].map((deg) => (
              <path
                key={deg}
                d="M 27 7 L 37 7 L 34.5 19 L 29.5 19 Z"
                fill="#1F1914"
                stroke="#787C82"
                strokeWidth="0.9"
                transform={`rotate(${deg} 32 32)`}
              />
            ))}
          </svg>
        );

      case 'click-wheel':
        /* iPod Mode: Clean concentric Click Wheel / brushed metallic orbital ring with directional tick markers */
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#F2F4F8" stroke="#C3C8D1" strokeWidth="1.6" />
            <circle cx="32" cy="32" r="25.5" fill="none" stroke="#007AFF" strokeWidth="1.2" strokeDasharray="3 3" />
            {[0, 90, 180, 270].map((deg) => (
              <circle
                key={deg}
                cx="32"
                cy="7.5"
                r="2.1"
                fill="#007AFF"
                transform={`rotate(${deg} 32 32)`}
              />
            ))}
          </svg>
        );

      case 'squircle-pmp':
        /* Zune Mode: Matte dark-brown/charcoal circular pad ring with subtle olive-green highlight arc */
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#2A2019" stroke="#7E8F4E" strokeWidth="2" />
            <path
              d="M 32 4 A 28 28 0 0 1 60 32"
              fill="none"
              stroke="#E6007E"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M 32 60 A 28 28 0 0 1 4 32"
              fill="none"
              stroke="#93A85C"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'aurora-deck':
        /* Hologram Mode: Dual concentric neon cyan/magenta HUD arcs */
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="rgba(8, 12, 24, 0.72)"
              stroke="#00FFFF"
              strokeWidth="1.8"
              strokeDasharray="14 6"
            />
            <circle
              cx="32"
              cy="32"
              r="24.5"
              fill="none"
              stroke="#FF00FF"
              strokeWidth="1.5"
              strokeDasharray="8 5"
            />
          </svg>
        );

      case 'retro-turntable':
      default:
        /* Turntable Mode: Micro-grooved black vinyl record rim with realistic specular light sheen */
        return (
          <div
            className="w-full h-full rounded-full border border-[#3d291a]"
            style={{
              background:
                'conic-gradient(from 25deg, #0b0a09 0deg, #2b2724 38deg, #0b0a09 82deg, #1b1816 140deg, #0b0a09 180deg, #2b2724 218deg, #0b0a09 262deg, #1b1816 320deg, #0b0a09 360deg)',
            }}
          >
            <div className="w-full h-full rounded-full border border-white/10" />
          </div>
        );
    }
  };

  const brandTitleStyle = useMemo(() => {
    switch (activeThemeId) {
      case 'click-wheel':
        return {
          color: '#1D1D1F',
          textShadow: '0 1px 0 rgba(255,255,255,0.75)',
        };
      case 'cassette-deck':
        return {
          color: '#F4F6F8',
          textShadow: '0 1px 6px rgba(0,0,0,0.85)',
        };
      case 'cd-hifi':
        return {
          color: '#F1F5F9',
          textShadow: '0 1px 10px rgba(0,240,255,0.35), 0 1px 3px rgba(0,0,0,0.9)',
        };
      case 'squircle-pmp':
        return {
          color: '#FFFFFF',
          textShadow: '0 1px 6px rgba(0,0,0,0.85)',
          textTransform: 'lowercase' as const,
        };
      case 'aurora-deck':
        return {
          color: '#EAF2FF',
          textShadow: '0 0 10px rgba(0,255,255,0.45)',
        };
      case 'reel-to-reel':
      case 'retro-turntable':
      default:
        return {
          color: '#F8EAD6',
          textShadow: '0 1px 4px rgba(0,0,0,0.88)',
        };
    }
  }, [activeThemeId]);

  return (
    <div
      id="global-myt-brand-emblem"
      data-testid="global-myt-brand-emblem"
      data-theme-emblem={activeThemeId}
      data-emblem-spinning={shouldSpin ? 'true' : 'false'}
      aria-label="MaxYoutify Global Brand Header"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        left: '12px',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
      className="md:!top-[16px] md:!left-[16px] select-none pointer-events-auto"
    >
      <div
        id="myt-logo-badge"
        data-spinning={shouldSpin ? 'true' : 'false'}
        className="relative w-[44px] h-[44px] md:w-[56px] md:h-[56px] shrink-0 rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.45)]"
      >
        {/* LAYER 1 (z-index: 1): Rotating Outer Mechanical/Graphic Ring ONLY */}
        <div
          id="myt-emblem-rotating-ring"
          data-testid="myt-emblem-rotating-ring"
          data-spinning={shouldSpin ? 'true' : 'false'}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            transformOrigin: 'center center',
            willChange: 'transform',
            animationDuration: '2.4s',
            animationPlayState: shouldSpin ? 'running' : 'paused',
          }}
          className="vinyl-platter-gpu-spin rounded-full overflow-hidden"
        >
          {renderThemeOuterRotatingRing()}
        </div>

        {/* LAYER 2 (z-index: 2): Strictly Static "MYT" Center Core (NEVER nested inside Layer 1) */}
        <div
          id="myt-emblem-static-core"
          data-testid="myt-emblem-static-core"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'none',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '58%',
              height: '58%',
              background: hubStyle.bg,
              borderColor: hubStyle.border,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
            }}
            className="rounded-full border flex items-center justify-center"
          >
            <span
              id="myt-emblem-static-text"
              style={{
                color: hubStyle.textHex,
                fontWeight: 800,
                letterSpacing: '0.08em',
                transform: 'none',
              }}
              className="font-sans text-[9.5px] md:text-[11px] uppercase leading-none select-none"
            >
              MYT
            </span>
          </div>
        </div>
      </div>

      {/* PART 1.1: Fixed App Title Locked Strictly to the Right of the Rotating Disc Emblem (Zero Rotation) */}
      <h1
        id="app-brand-title"
        data-testid="app-brand-title"
        style={{
          transform: 'none',
          color: brandTitleStyle.color,
          textShadow: brandTitleStyle.textShadow,
          textTransform: brandTitleStyle.textTransform,
        }}
        className="font-display text-[17px] md:text-[21px] font-extrabold tracking-tight leading-none whitespace-nowrap shrink-0 pointer-events-none select-none"
      >
        MaxYoutify
      </h1>
    </div>
  );
});

export const GlobalThemeSelector = React.memo<GlobalThemeSelectorProps>(
  ({
    activeThemeId = DEFAULT_THEME_ID,
    availableThemes,
    themePalette,
    hideBoxArt = false,
    isPlaying = false,
    isStandby = false,
    isDocumentHidden = false,
    prefersReducedMotion = false,
    onSelectTheme,
    onToggleHideBoxArt,
  }) => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [hasOpenedBefore, setHasOpenedBefore] = useState<boolean>(() => {
      try {
        return window.localStorage.getItem(THEME_DRAWER_DISCOVERY_STORAGE_KEY) === 'true';
      } catch {
        return false;
      }
    });

    const skin = useMemo(() => resolveThemeAdaptiveDrawerSkin(activeThemeId), [activeThemeId]);

    const markDrawerDiscovered = useCallback(() => {
      setHasOpenedBefore((prev) => {
        if (!prev) {
          try {
            window.localStorage.setItem(THEME_DRAWER_DISCOVERY_STORAGE_KEY, 'true');
          } catch {
            // ignore storage errors
          }
        }
        return true;
      });
    }, []);

    const openDrawer = useCallback(() => {
      markDrawerDiscovered();
      setIsOpen(true);
    }, [markDrawerDiscovered]);

    const closeDrawer = useCallback(() => {
      setIsOpen(false);
    }, []);

    const toggleDrawer = useCallback(() => {
      triggerButtonHaptic(false);
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    }, [isOpen, closeDrawer, openDrawer]);

    // Close drawer on Escape key
    useEffect(() => {
      if (!isOpen) return;
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeDrawer();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, closeDrawer]);

    // PART 1.4: Full-Screen Right-to-Left Thumb Swipe & Left-to-Right Close Gesture Detection
    const swipeStartRef = useRef<{
      x: number;
      y: number;
      excluded: boolean;
    } | null>(null);

    useEffect(() => {
      const isExcludedTarget = (target: EventTarget | null): boolean => {
        if (!(target instanceof Element)) return false;
        return Boolean(
          target.closest('[data-no-drawer-swipe="true"]') ||
            target.closest('input[type="range"]') ||
            target.closest('[role="slider"]') ||
            target.closest('#cw-wheel-ring') ||
            target.closest('#cd-rotating-vertical-rack') ||
            target.closest('#album-art-holder-box')
        );
      };

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        swipeStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          excluded: isExcludedTarget(e.target),
        };
      };

      const handleTouchEnd = (e: TouchEvent) => {
        const start = swipeStartRef.current;
        swipeStartRef.current = null;
        if (!start || e.changedTouches.length === 0) return;
        const touch = e.changedTouches[0];
        const action = evaluateGlobalDrawerSwipeGesture({
          startX: start.x,
          startY: start.y,
          endX: touch.clientX,
          endY: touch.clientY,
          isDrawerOpen: isOpen,
          originatedInExcludedControl: start.excluded,
        });
        if (action === 'open') {
          openDrawer();
        } else if (action === 'close') {
          closeDrawer();
        }
      };

      const handlePointerDown = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return; // Handled by touch listeners
        if (e.button !== 0) return;
        swipeStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          excluded: isExcludedTarget(e.target),
        };
      };

      const handlePointerUp = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const start = swipeStartRef.current;
        swipeStartRef.current = null;
        if (!start) return;
        const action = evaluateGlobalDrawerSwipeGesture({
          startX: start.x,
          startY: start.y,
          endX: e.clientX,
          endY: e.clientY,
          isDrawerOpen: isOpen,
          originatedInExcludedControl: start.excluded,
        });
        if (action === 'open') {
          openDrawer();
        } else if (action === 'close') {
          closeDrawer();
        }
      };

      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true });
      window.addEventListener('pointerdown', handlePointerDown, { passive: true });
      window.addEventListener('pointerup', handlePointerUp, { passive: true });

      return () => {
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [isOpen, openDrawer, closeDrawer]);

    const showDiscoveryBounce = !hasOpenedBefore && !isOpen && !prefersReducedMotion;

    // Resolve the 7 canonical themes against availableThemes
    const drawerThemes = useMemo(() => {
      const availableIds = new Set(availableThemes.map((t) => t.id));
      return DRAWER_CANONICAL_THEMES.filter((entry) => availableIds.has(entry.id));
    }, [availableThemes]);

    return (
      <>
        {/* PART 2: Global Top-Left Brand Emblem — Static "MYT" Core & Concentric Rotating Outer Ring */}
        <GlobalMytBrandEmblem
          activeThemeId={activeThemeId}
          themePalette={themePalette}
          isPlaying={isPlaying}
          isStandby={isStandby}
          isDocumentHidden={isDocumentHidden}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* PART 1.4: Refined Right-Edge Sculpted Concave-Fillet SVG Pull-Tab */}
        <div
          id="global-theme-drawer-tab-anchor"
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 9999,
          }}
          className="pointer-events-auto select-none"
        >
          <button
            id="global-theme-drawer-tab"
            data-testid="global-theme-drawer-tab"
            type="button"
            aria-label={isOpen ? 'Close Theme Drawer' : 'Open Theme Drawer'}
            aria-expanded={isOpen}
            aria-controls="global-theme-slide-drawer"
            data-drawer-open={isOpen ? 'true' : 'false'}
            data-discovery-bounce={showDiscoveryBounce ? 'true' : 'false'}
            data-active-theme-skin={activeThemeId}
            onClick={toggleDrawer}
            style={{
              filter: skin.tabSvgFilterShadow,
            }}
            className={`global-theme-pull-tab relative w-[26px] h-[104px] md:w-[28px] md:h-[110px] flex items-center justify-end pr-[3px] bg-transparent border-0 p-0 cursor-pointer focus:outline-none ${
              showDiscoveryBounce ? 'theme-tab-discovery-bounce' : ''
            }`}
          >
            {/* Expanded Invisible Touch/Pointer Hit Target (min 44px touch clearance) */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '-6px',
                bottom: '-6px',
                left: '-18px',
                right: 0,
              }}
            />

            {/* Custom Organic Concave-Fillet SVG Handle Sweeping Seamlessly Out of Right Viewport Edge */}
            <svg
              aria-hidden="true"
              viewBox="0 0 30 112"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <defs>
                <linearGradient
                  id={`drawer-tab-grad-${activeThemeId}`}
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={skin.tabSvgStartHex} />
                  <stop offset="50%" stopColor={skin.tabSvgMidHex} />
                  <stop offset="100%" stopColor={skin.tabSvgEndHex} />
                </linearGradient>
              </defs>
              <path
                d="M 30 0 C 30 18, 9 24, 6.5 42 C 4.5 52, 4.5 60, 6.5 70 C 9 88, 30 94, 30 112 Z"
                fill={`url(#drawer-tab-grad-${activeThemeId})`}
                stroke={skin.tabSvgStrokeHex}
                strokeWidth="1.25"
                strokeLinejoin="round"
              />
              {/* Subtle vertical tactile micro-notch lines inside the handle peak */}
              <line
                x1="23.5"
                y1="44"
                x2="23.5"
                y2="68"
                stroke={skin.gripLineColor}
                strokeWidth="1"
                strokeLinecap="round"
              />
              <line
                x1="26"
                y1="47"
                x2="26"
                y2="65"
                stroke={skin.gripLineColor}
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>

            {/* Centered Crisp Left-Pointing Chevron (‹) That Rotates 180deg (›) When Open */}
            <span
              id="global-theme-tab-chevron-well"
              style={{
                color: skin.chevronColor,
              }}
              className={`relative z-10 w-[16px] h-[28px] flex items-center justify-center mr-[3px] ${
                showDiscoveryBounce ? 'theme-chevron-discovery-nudge' : ''
              }`}
            >
              <span
                id="global-theme-tab-chevron"
                style={{
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className="inline-block font-sans text-[17px] font-black leading-none"
              >
                ‹
              </span>
            </span>
          </button>
        </div>

        {/* Translucent Dimmed Backdrop When Drawer Is Open */}
        {isOpen && (
          <div
            id="global-theme-drawer-backdrop"
            data-testid="global-theme-drawer-backdrop"
            aria-hidden="true"
            onClick={closeDrawer}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 9997,
            }}
            className="fixed inset-0 transition-opacity duration-200"
          />
        )}

        {/* PART 1.3: Theme-Adaptive Slide-Out Drawer Panel — Bottom-Aligned Thumb Ergonomics */}
        <aside
          id="global-theme-slide-drawer"
          data-testid="global-theme-slide-drawer"
          aria-label="Theme Selection Drawer"
          aria-hidden={!isOpen}
          data-drawer-open={isOpen ? 'true' : 'false'}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 9998,
            background: skin.drawerBackground,
            borderLeft: skin.drawerBorderLeft,
            boxShadow: isOpen ? skin.drawerBoxShadow : 'none',
            color: skin.drawerTextHex,
            backdropFilter: activeThemeId === 'aurora-deck' ? 'blur(16px)' : undefined,
            transform: isOpen ? 'translateX(0%)' : 'translateX(100%)',
            transition: prefersReducedMotion
              ? 'none'
              : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: isOpen ? 'auto' : 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            height: '100%',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          }}
          className="w-[248px] sm:w-[272px] px-4 pt-4 select-none overflow-hidden"
        >
          <div className="w-full max-h-full overflow-y-auto flex flex-col justify-end gap-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-current/15 shrink-0">
              <span className="font-sans text-xs font-extrabold uppercase tracking-[0.14em]">
                Hardware Mode
              </span>
              <button
                id="global-theme-drawer-close-btn"
                type="button"
                onClick={closeDrawer}
                aria-label="Close Theme Drawer"
                style={{
                  color: skin.drawerTextHex,
                  borderColor: skin.inactiveRowBorder,
                }}
                className="w-7 h-7 rounded-md border flex items-center justify-center text-sm font-bold cursor-pointer hover:opacity-80"
              >
                ›
              </button>
            </div>

            {/* Minimalist 7-Theme Vertical List Positioned in Bottom-Half Thumb Reach */}
            <nav
              id="global-theme-drawer-list"
              role="listbox"
              aria-label="Hardware Themes"
              className="space-y-2 shrink-0"
            >
              {drawerThemes.map((entry) => {
                const isSelected = entry.id === activeThemeId;
                const rowTextColor = isSelected ? skin.activeRowTextHex : skin.drawerTextHex;
                return (
                  <button
                    key={entry.id}
                    id={`theme-option-${entry.id}`}
                    data-theme-option={entry.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      triggerButtonHaptic(false);
                      onSelectTheme(entry.id);
                      closeDrawer();
                    }}
                    style={{
                      background: isSelected
                        ? skin.activeRowBackground
                        : skin.inactiveRowBackground,
                      borderColor: isSelected ? skin.activeRowBorder : skin.inactiveRowBorder,
                      color: rowTextColor,
                    }}
                    className="w-full h-[42px] px-3 rounded-[8px] border flex items-center justify-between gap-2.5 text-left cursor-pointer transition-transform active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderMinimalistThemeIcon(entry.id, rowTextColor)}
                      <span className="font-sans text-[13px] font-bold tracking-tight truncate">
                        {entry.conciseName}
                      </span>
                    </div>
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: rowTextColor }}
                        className="w-2 h-2 rounded-full shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Dedicated Settings Footer Housing Persistent Show / Hide Album Art / Case Toggle */}
            {onToggleHideBoxArt && (
              <div
                id="global-theme-drawer-footer"
                style={{ borderTop: skin.footerBorderTop }}
                className="pt-2.5 shrink-0"
              >
                <button
                  id="toggle-box-art-btn"
                  type="button"
                  aria-pressed={!hideBoxArt}
                  aria-label={
                    hideBoxArt ? 'Show Album Art and Case' : 'Hide Album Art and Case'
                  }
                  title={
                    hideBoxArt ? 'Show Album Art / Case' : 'Hide Album Art / Case'
                  }
                  onClick={() => {
                    triggerButtonHaptic(false);
                    onToggleHideBoxArt();
                  }}
                  style={{
                    background: !hideBoxArt
                      ? skin.activeRowBackground
                      : skin.inactiveRowBackground,
                    borderColor: !hideBoxArt
                      ? skin.activeRowBorder
                      : skin.inactiveRowBorder,
                    color: !hideBoxArt ? skin.activeRowTextHex : skin.drawerTextHex,
                  }}
                  className="w-full h-[40px] px-3 rounded-[8px] border flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {hideBoxArt ? (
                      <EyeOff className="w-4 h-4 shrink-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 shrink-0" />
                    )}
                    <span className="font-sans text-[12px] font-bold truncate">
                      {hideBoxArt ? 'Show Album Art / Case' : 'Hide Album Art / Case'}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="font-mono text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-black/20"
                  >
                    {hideBoxArt ? 'OFF' : 'ON'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </aside>
      </>
    );
  }
);
