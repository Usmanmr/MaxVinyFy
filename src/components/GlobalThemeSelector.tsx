import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Image as ImageIcon,
  EyeOff,
  Smartphone,
  X,
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
  { id: 'pc-winamp', conciseName: 'PC / Winamp' },
  { id: 'spotify', conciseName: 'Spotify' },
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

    case 'pc-winamp':
      return {
        tabBackground:
          'linear-gradient(180deg, #3A3D4D 0%, #232531 50%, #191B24 100%)',
        tabBorder: '1px solid #65697D',
        tabBoxShadow:
          '-4px 0 16px rgba(0, 0, 0, 0.78), inset 1px 1px 0 #65697D, inset -1px -1px 0 #0E1016',
        tabSvgStartHex: '#3A3D4D',
        tabSvgMidHex: '#232531',
        tabSvgEndHex: '#191B24',
        tabSvgStrokeHex: '#65697D',
        tabSvgFilterShadow: 'drop-shadow(-3px 2px 7px rgba(0, 0, 0, 0.7))',
        chevronWellBackground: '#000000',
        chevronColor: '#00FF00',
        gripLineColor: 'rgba(200, 168, 88, 0.72)',
        drawerBackground:
          'linear-gradient(180deg, #3A3D4D 0%, #232531 50%, #191B24 100%)',
        drawerBorderLeft: '2px solid #65697D',
        drawerBoxShadow:
          '-12px 0 36px rgba(0, 0, 0, 0.88), inset 1px 1px 0 #65697D, inset -1px -1px 0 #0E1016',
        drawerTextHex: '#00FF00',
        drawerSubTextHex: '#C8A858',
        activeRowBackground: '#0000C6',
        activeRowBorder: '#E6C245',
        activeRowTextHex: '#FFFFFF',
        inactiveRowBackground: '#000000',
        inactiveRowBorder: '#65697D',
        footerBorderTop: '1px solid #65697D',
      };

    case 'spotify':
      return {
        tabBackground:
          'linear-gradient(180deg, #1E1E1E 0%, #121212 60%, #0A0A0A 100%)',
        tabBorder: '1px solid #282828',
        tabBoxShadow:
          '-4px 0 16px rgba(0, 0, 0, 0.8), -1px 0 8px rgba(29, 185, 84, 0.28), inset 0 1px 0 rgba(255,255,255,0.08)',
        tabSvgStartHex: '#202020',
        tabSvgMidHex: '#151515',
        tabSvgEndHex: '#0C0C0C',
        tabSvgStrokeHex: '#1DB954',
        tabSvgFilterShadow: 'drop-shadow(-3px 0 8px rgba(29, 185, 84, 0.35))',
        chevronWellBackground: '#000000',
        chevronColor: '#1DB954',
        gripLineColor: 'rgba(179, 179, 179, 0.45)',
        drawerBackground:
          'linear-gradient(180deg, #181818 0%, #121212 58%, #0B0B0B 100%)',
        drawerBorderLeft: '1px solid #282828',
        drawerBoxShadow:
          '-12px 0 36px rgba(0, 0, 0, 0.88), -2px 0 14px rgba(29, 185, 84, 0.18)',
        drawerTextHex: '#FFFFFF',
        drawerSubTextHex: '#B3B3B3',
        activeRowBackground: 'rgba(29, 185, 84, 0.16)',
        activeRowBorder: '#1DB954',
        activeRowTextHex: '#1DB954',
        inactiveRowBackground: '#181818',
        inactiveRowBorder: '#282828',
        footerBorderTop: '1px solid #282828',
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
  isDeviceOnlyMode?: boolean;
  isPlaying?: boolean;
  isStandby?: boolean;
  isDocumentHidden?: boolean;
  prefersReducedMotion?: boolean;
  onSelectTheme: (themeId: string) => void;
  onToggleHideBoxArt?: () => void;
  onToggleDeviceOnlyMode?: () => void;
}

const renderMinimalistThemeIcon = (themeId: string, colorHex: string) => {
  const sharedProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: colorHex,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    style: { width: '20px', height: '20px', flexShrink: 0 },
  };

  switch (themeId) {
    case 'cassette-deck':
      /* Cassette: Horizontal tape shell with twin circular spool holes & trapezoid base */
      return (
        <svg {...sharedProps}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
          <circle cx="8" cy="11.5" r="2" />
          <circle cx="16" cy="11.5" r="2" />
          <path d="M9.8 11.5h4.4" />
          <path d="M6.5 18.5l1.2-3h8.6l1.2 3" />
        </svg>
      );
    case 'cd-hifi':
      /* CD: Outer polycarbonate ring, center spindle aperture, and optical glint arc */
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="12" r="2.75" />
          <path d="M16.2 7.8a5.8 5.8 0 0 1 1.6 4.2" />
        </svg>
      );
    case 'click-wheel':
      /* iPod: Vertical rectangle chassis, crisp upper display, and lower circular Click Wheel */
      return (
        <svg {...sharedProps}>
          <rect x="5.5" y="2.5" width="13" height="19" rx="2.5" />
          <rect x="8" y="5" width="8" height="5.5" rx="1" />
          <circle cx="12" cy="15.5" r="3.2" />
          <circle cx="12" cy="15.5" r="1" />
        </svg>
      );
    case 'squircle-pmp':
      /* Zune: Vertical silhouette, tall top screen, and rounded squircle control pad */
      return (
        <svg {...sharedProps}>
          <rect x="5.5" y="2.5" width="13" height="19" rx="2.2" />
          <rect x="7.8" y="4.8" width="8.4" height="7.4" rx="0.8" />
          <rect x="9.3" y="14.2" width="5.4" height="5.4" rx="1.9" />
        </svg>
      );
    case 'retro-turntable':
      /* Turntable: Rectangular plinth, vinyl record platter, and offset tonearm */
      return (
        <svg {...sharedProps}>
          <rect x="3" y="4.5" width="18" height="15" rx="2" />
          <circle cx="10.2" cy="12" r="5" />
          <circle cx="10.2" cy="12" r="1.2" />
          <path d="M17.5 7v5.5l-2.8 2.2" />
        </svg>
      );
    case 'reel-to-reel':
      /* Reel-to-Reel: Twin symmetric open tape reels above transport block */
      return (
        <svg {...sharedProps}>
          <rect x="3" y="3.5" width="18" height="17" rx="2" />
          <circle cx="8" cy="10" r="3.1" />
          <circle cx="16" cy="10" r="3.1" />
          <circle cx="8" cy="10" r="0.8" />
          <circle cx="16" cy="10" r="0.8" />
          <path d="M6.5 16.5h11" />
        </svg>
      );
    case 'pc-winamp':
      /* PC / Winamp: Boxy 4:3 CRT monitor silhouette with tiny lightning-bolt / EQ glyph inside */
      return (
        <svg {...sharedProps}>
          <rect x="3" y="3.5" width="18" height="13.5" rx="1.5" />
          <path d="M12.6 6.8 9.8 10.6h2.7l-1.1 3.3 3-3.9h-2.6l.8-3.2z" />
          <path d="M9.5 17v2.8M14.5 17v2.8M7.5 19.8h9" />
        </svg>
      );
    case 'spotify':
      /* Spotify: Circular glyph with 3 crisp curved soundwave arcs */
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M7.6 9.6c2.9-.85 6.4-.65 9.1.75" />
          <path d="M8.3 12.6c2.4-.7 5.2-.5 7.4.65" />
          <path d="M9.1 15.4c1.8-.45 3.9-.3 5.5.5" />
        </svg>
      );
    case 'aurora-deck':
    default:
      /* Hologram: Layered geometric holographic prism & diamond planes */
      return (
        <svg {...sharedProps}>
          <polygon points="12 2.8 20.2 9.5 12 21.2 3.8 9.5" />
          <path d="M3.8 9.5h16.4" />
          <path d="M12 2.8l-3.6 6.7L12 21.2l3.6-11.7Z" />
        </svg>
      );
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
  drawerTextHex?: string;
}>(({ activeThemeId, themePalette, isPlaying, isStandby, isDocumentHidden, prefersReducedMotion, drawerTextHex }) => {
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
      case 'pc-winamp':
        return {
          bg: 'linear-gradient(180deg, #2D3140 0%, #14161F 100%)',
          border: '#00FF00',
          textHex: '#00FF00',
        };
      case 'spotify':
        return {
          bg: 'radial-gradient(circle, #181818 0%, #0A0A0A 100%)',
          border: '#1DB954',
          textHex: '#1DB954',
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
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#C8CCD0" stroke="#5A5E62" strokeWidth="1.8" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="#FFB347" strokeWidth="1" opacity="0.7" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <path
                key={deg}
                d="M 29.8 18.2 C 29.5 17 30.2 16 31 14 L 26.2 8.2 C 25.4 7.1 26.1 5.6 27.6 5.3 Q 32 4.3 36.4 5.3 C 37.9 5.6 38.6 7.1 37.8 8.2 L 33 14 C 33.8 16 34.5 17 34.2 18.2 C 33.8 19.2 30.2 19.2 29.8 18.2 Z"
                fill="#2A1D14"
                stroke="#787C82"
                strokeWidth="0.85"
                strokeLinejoin="round"
                transform={`rotate(${deg} 32 32)`}
              />
            ))}
          </svg>
        );

      case 'click-wheel':
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

      case 'pc-winamp':
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#181A22" stroke="#65697D" strokeWidth="1.6" />
            <circle cx="32" cy="32" r="21.5" fill="#C4C8D0" stroke="#7E8391" strokeWidth="1.2" />
            <rect x="29.5" y="13.5" width="5" height="6" rx="0.8" fill="#232531" />
            <rect x="25" y="45" width="4" height="4.5" rx="0.6" fill="#232531" />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, idx) => (
              <rect
                key={deg}
                x="30.8"
                y="3.5"
                width="2.4"
                height={idx % 2 === 0 ? '5.5' : '3.8'}
                rx="0.6"
                fill={idx % 3 === 0 ? '#E6C245' : '#00FF00'}
                transform={`rotate(${deg} 32 32)`}
              />
            ))}
          </svg>
        );

      case 'spotify':
        return (
          <svg viewBox="0 0 64 64" className="w-full h-full">
            <circle cx="32" cy="32" r="30.5" fill="#121212" stroke="#1DB954" strokeWidth="2" />
            <circle cx="32" cy="32" r="26" fill="none" stroke="#1DB954" strokeWidth="2.2" strokeDasharray="18 6" opacity={shouldSpin ? '0.95' : '0.6'} />
            <circle cx="32" cy="32" r="22" fill="none" stroke="#1ED760" strokeWidth="1.2" strokeDasharray="8 10" opacity="0.55" />
          </svg>
        );

      case 'retro-turntable':
      default:
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

  return (
    <div
      id="global-myt-brand-emblem"
      data-testid="global-myt-brand-emblem"
      data-theme-emblem={activeThemeId}
      data-emblem-spinning={shouldSpin ? 'true' : 'false'}
      aria-label="MaxYoutify Brand Header"
      className="relative flex flex-col items-center text-center select-none shrink-0 pt-1 pb-2"
    >
      <div
        id="myt-logo-badge"
        data-spinning={shouldSpin ? 'true' : 'false'}
        style={{ width: '56px', height: '56px' }}
        className="relative shrink-0 rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.42)]"
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
              className="font-sans text-[11px] uppercase leading-none select-none"
            >
              MYT
            </span>
          </div>
        </div>
      </div>

      {/* App Title Centered Strictly Below Rotating Logo */}
      <h1
        id="app-brand-title"
        data-testid="app-brand-title"
        style={{
          marginTop: '10px',
          fontSize: '1.05rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textAlign: 'center',
          transform: 'none',
          color: drawerTextHex || 'inherit',
        }}
        className="font-display leading-tight whitespace-nowrap select-none"
      >
        MaxYoutify
      </h1>

      {/* Studio Attribution Line Centered Directly Below App Title */}
      <p
        id="app-brand-attribution"
        data-testid="app-brand-attribution"
        style={{
          marginTop: '3px',
          fontSize: '0.72rem',
          fontWeight: 500,
          letterSpacing: '0.06em',
          opacity: 0.72,
          textAlign: 'center',
          color: drawerTextHex || 'inherit',
        }}
        className="font-sans leading-tight whitespace-nowrap select-none"
      >
        by xuMax interActive
      </p>
    </div>
  );
});

export const GlobalThemeSelector = React.memo<GlobalThemeSelectorProps>(
  ({
    activeThemeId = DEFAULT_THEME_ID,
    availableThemes,
    themePalette,
    hideBoxArt = false,
    isDeviceOnlyMode = false,
    isPlaying = false,
    isStandby = false,
    isDocumentHidden = false,
    prefersReducedMotion = false,
    onSelectTheme,
    onToggleHideBoxArt,
    onToggleDeviceOnlyMode,
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

    const middleScrollRef = useRef<HTMLDivElement | null>(null);
    const [scrollShadows, setScrollShadows] = useState<{ top: boolean; bottom: boolean }>({
      top: false,
      bottom: false,
    });

    const updateMiddleScrollShadows = useCallback(() => {
      const el = middleScrollRef.current;
      if (!el) return;
      const hasOverflow = el.scrollHeight > el.clientHeight + 2;
      const top = hasOverflow && el.scrollTop > 4;
      const bottom = hasOverflow && el.scrollTop + el.clientHeight < el.scrollHeight - 4;
      setScrollShadows((prev) =>
        prev.top === top && prev.bottom === bottom ? prev : { top, bottom }
      );
    }, []);

    useEffect(() => {
      updateMiddleScrollShadows();
      const handleResize = () => updateMiddleScrollShadows();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [isOpen, activeThemeId, updateMiddleScrollShadows]);

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
            data-device-only-active={
              isDeviceOnlyMode && (activeThemeId === 'squircle-pmp' || activeThemeId === 'click-wheel')
                ? 'true'
                : 'false'
            }
            onClick={toggleDrawer}
            style={{
              filter: skin.tabSvgFilterShadow,
            }}
            className={`global-theme-pull-tab relative w-[26px] h-[104px] md:w-[28px] md:h-[110px] flex items-center justify-end pr-[3px] bg-transparent border-0 p-0 cursor-pointer focus:outline-none ${
              showDiscoveryBounce ? 'theme-tab-discovery-bounce' : ''
            } ${
              !isOpen &&
              isDeviceOnlyMode &&
              (activeThemeId === 'squircle-pmp' || activeThemeId === 'click-wheel')
                ? 'global-theme-pull-tab-dimmed'
                : ''
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

        {/* PART 1.2: Top-Left Focus-Mode Exit Button (ONLY rendered when Device Only Mode is active on iPod or Zune) */}
        {isDeviceOnlyMode &&
          onToggleDeviceOnlyMode &&
          (activeThemeId === 'click-wheel' || activeThemeId === 'squircle-pmp') && (
            <button
              id="focus-mode-exit-btn"
              data-testid="focus-mode-exit-btn"
              type="button"
              aria-label="Exit Device Only Mode"
              title="Exit Device Only Mode"
              onClick={() => {
                triggerButtonHaptic(false);
                onToggleDeviceOnlyMode();
              }}
              style={{
                position: 'fixed',
                top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
                left: '14px',
                zIndex: 9999,
                width: '34px',
                height: '34px',
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                cursor: 'pointer',
                backgroundColor:
                  activeThemeId === 'click-wheel'
                    ? 'rgba(255, 255, 255, 0.72)'
                    : 'rgba(36, 32, 30, 0.78)',
                border:
                  activeThemeId === 'click-wheel'
                    ? '1px solid rgba(0, 0, 0, 0.14)'
                    : '1px solid rgba(126, 143, 78, 0.48)',
                color: activeThemeId === 'click-wheel' ? '#1D1D1F' : '#F4EFEA',
                boxShadow:
                  activeThemeId === 'click-wheel'
                    ? '0 4px 12px rgba(0, 0, 0, 0.12)'
                    : '0 4px 12px rgba(0, 0, 0, 0.45)',
              }}
              className="transition-transform active:scale-95 hover:scale-105"
            >
              <X className="w-[14px] h-[14px]" strokeWidth={2} aria-hidden="true" />
            </button>
          )}

        {/* PART 1.1: Three-Zone Pinned Right-Swipe Drawer (Middle-Only Scrolling) */}
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
            height: '100dvh',
            padding: 0,
            overflow: 'hidden',
          }}
          className="w-[248px] sm:w-[272px] select-none"
        >
          {/* ZONE 1 — Top Pinned Brand Header (flex-shrink: 0; never scrolls out of view) */}
          <div
            style={{
              padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 16px 12px',
              borderBottom: skin.footerBorderTop,
            }}
            className="relative w-full flex flex-col items-center shrink-0"
          >
            {activeThemeId === 'pc-winamp' && (
              <div className="w-full flex items-center gap-2 mb-1.5 px-1" aria-hidden="true">
                <span className="flex-1 h-[8px] pcw-winamp-ridges" />
                <span className="font-mono text-[9px] font-bold tracking-[0.14em] text-[#E6C245] uppercase">
                  WINAMP 2.91
                </span>
                <span className="flex-1 h-[8px] pcw-winamp-ridges" />
              </div>
            )}
            <button
              id="global-theme-drawer-close-btn"
              type="button"
              onClick={closeDrawer}
              aria-label="Close Theme Drawer"
              style={{
                color: skin.drawerTextHex,
                borderColor: skin.inactiveRowBorder,
                top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
                right: '14px',
              }}
              className="absolute w-7 h-7 rounded-md border flex items-center justify-center text-sm font-bold cursor-pointer hover:opacity-80"
            >
              ›
            </button>
            <GlobalMytBrandEmblem
              activeThemeId={activeThemeId}
              themePalette={themePalette}
              isPlaying={isPlaying}
              isStandby={isStandby}
              isDocumentHidden={isDocumentHidden}
              prefersReducedMotion={prefersReducedMotion}
              drawerTextHex={skin.drawerTextHex}
            />
          </div>

          {/* ZONE 2 — Middle Scrollable Theme List (flex: 1; min-height: 0; overflow-y: auto) */}
          <div className="relative flex-1 min-h-0 w-full flex flex-col">
            {scrollShadows.top && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 right-0 h-4 z-10"
                style={{
                  background:
                    activeThemeId === 'click-wheel' || activeThemeId === 'cassette-deck'
                      ? 'linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)'
                      : 'linear-gradient(to bottom, rgba(0,0,0,0.38), transparent)',
                }}
              />
            )}
            <div
              ref={middleScrollRef}
              onScroll={updateMiddleScrollShadows}
              style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                padding: '10px 16px',
                ['--drawer-scroll-thumb' as string]:
                  activeThemeId === 'click-wheel' || activeThemeId === 'cassette-deck'
                    ? 'rgba(0, 0, 0, 0.25)'
                    : 'rgba(255, 255, 255, 0.28)',
              }}
              className="drawer-middle-scroll flex-1 min-h-0 w-full"
            >
              <nav
                id="global-theme-drawer-list"
                role="listbox"
                aria-label="Hardware Themes"
                className="space-y-2"
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
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                        height: '42px',
                        padding: '0 12px',
                      }}
                      className={`${
                        activeThemeId === 'pc-winamp' ? 'pcw-drawer-row rounded-[2px]' : 'rounded-[8px]'
                      } border text-left cursor-pointer transition-transform active:scale-[0.99]`}
                    >
                      {renderMinimalistThemeIcon(entry.id, rowTextColor)}
                      <span className="flex-1 min-w-0 font-sans text-[13px] font-bold tracking-tight truncate">
                        {entry.conciseName}
                      </span>
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
            </div>
            {scrollShadows.bottom && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 right-0 h-4 z-10"
                style={{
                  background:
                    activeThemeId === 'click-wheel' || activeThemeId === 'cassette-deck'
                      ? 'linear-gradient(to top, rgba(0,0,0,0.12), transparent)'
                      : 'linear-gradient(to top, rgba(0,0,0,0.38), transparent)',
                }}
              />
            )}
          </div>

          {/* ZONE 3 — Bottom Pinned Utility Controls (flex-shrink: 0; always locked at bottom) */}
          {(onToggleHideBoxArt ||
            (onToggleDeviceOnlyMode &&
              (activeThemeId === 'squircle-pmp' || activeThemeId === 'click-wheel'))) && (
            <div
              id="global-theme-drawer-footer"
              style={{
                borderTop: skin.footerBorderTop,
                padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)',
              }}
              className="w-full flex flex-col gap-2 shrink-0"
            >
              {onToggleDeviceOnlyMode &&
                (activeThemeId === 'squircle-pmp' || activeThemeId === 'click-wheel') && (
                  <button
                    id="toggle-device-only-btn"
                    data-testid="toggle-device-only-btn"
                    type="button"
                    aria-pressed={isDeviceOnlyMode}
                    aria-label={
                      isDeviceOnlyMode
                        ? 'Exit Device Only Mode'
                        : 'Enable Device Only Mode'
                    }
                    title="Hide all workspace surroundings to showcase only the handheld player"
                    onClick={() => {
                      triggerButtonHaptic(false);
                      onToggleDeviceOnlyMode();
                    }}
                    style={{
                      background: isDeviceOnlyMode
                        ? skin.activeRowBackground
                        : skin.inactiveRowBackground,
                      borderColor: isDeviceOnlyMode
                        ? skin.activeRowBorder
                        : skin.inactiveRowBorder,
                      color: isDeviceOnlyMode ? skin.activeRowTextHex : skin.drawerTextHex,
                    }}
                    className="w-full h-[40px] px-3 rounded-[8px] border flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span className="font-sans text-[12px] font-bold truncate">
                        Device Only Mode
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-mono text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-black/20"
                    >
                      {isDeviceOnlyMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}

              {onToggleHideBoxArt && (
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
              )}
            </div>
          )}
        </aside>
      </>
    );
  }
);
