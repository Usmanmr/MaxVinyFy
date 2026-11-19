export interface ThemeSwatch {
  primaryHex: string;
  secondaryHex: string;
  cabinetHex: string;
  accentHex: string;
}

export interface ThemeTokens {
  shellBgHex: string;
  shellTextHex: string;
  cabinetSurfaceBg: string;
  cabinetBorderHex: string;
  woodGrainAsset: string;
  frontWoodAsset: string;
  platterMatAsset: string;
  vinylAsset: string;
  fontDisplay: string;
  fontSans: string;
  fontMono: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  scopeSelectorValue: string;
  swatch: ThemeSwatch;
  tokens: ThemeTokens;
}

export const DEFAULT_THEME_ID = 'retro-turntable';
export const ACTIVE_THEME_STORAGE_KEY = 'maxyoutify_active_theme_v1';

export const RETRO_TURNTABLE_THEME: ThemeDefinition = {
  id: 'retro-turntable',
  name: 'Retro Turntable',
  description: 'Warm 1970s walnut cabinetry, brushed brass platter & vintage CRT console',
  scopeSelectorValue: 'retro-turntable',
  swatch: {
    primaryHex: '#b87333',
    secondaryHex: '#26160b',
    cabinetHex: '#4a2c17',
    accentHex: '#fbbf24',
  },
  tokens: {
    shellBgHex: '#12100e',
    shellTextHex: '#f5efe6',
    cabinetSurfaceBg: '#26160b',
    cabinetBorderHex: '#4a2c17',
    woodGrainAsset: '/console/console-top-wood.webp',
    frontWoodAsset: '/console/console-front-wood.webp',
    platterMatAsset: '/turntable/platter-mat.webp',
    vinylAsset: '/turntable/vinyl-record.webp',
    fontDisplay: "'Outfit', sans-serif",
    fontSans: "'Plus Jakarta Sans', sans-serif",
    fontMono: "'Space Mono', monospace",
  },
};

export const REEL_TO_REEL_THEME: ThemeDefinition = {
  id: 'reel-to-reel',
  name: 'Reel-to-Reel',
  description: '1965-1975 brushed aluminum deck, dual open reels & walnut hi-fi',
  scopeSelectorValue: 'reel-to-reel',
  swatch: {
    primaryHex: '#C9CCCE',
    secondaryHex: '#3B2A1E',
    cabinetHex: '#6B4A2F',
    accentHex: '#FF9F43',
  },
  tokens: {
    shellBgHex: '#17110c',
    shellTextHex: '#EFE9DC',
    cabinetSurfaceBg: '#6B4A2F',
    cabinetBorderHex: '#4E341F',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Archivo Narrow', sans-serif",
    fontSans: "'Plus Jakarta Sans', sans-serif",
    fontMono: "'Share Tech Mono', monospace",
  },
};

export const CASSETTE_DECK_THEME: ThemeDefinition = {
  id: 'cassette-deck',
  name: 'Cassette Deck',
  description: 'Early-1980s brushed silver portable boombox, bottom-hinged deck & cassette rack',
  scopeSelectorValue: 'cassette-deck',
  swatch: {
    primaryHex: '#C6C8CB',
    secondaryHex: '#9DA0A4',
    cabinetHex: '#141516',
    accentHex: '#D64541',
  },
  tokens: {
    shellBgHex: '#1A1C20',
    shellTextHex: '#E9E6DA',
    cabinetSurfaceBg: '#C6C8CB',
    cabinetBorderHex: '#9DA0A4',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Barlow Condensed', sans-serif",
    fontSans: "'Plus Jakarta Sans', sans-serif",
    fontMono: "'VT323', monospace",
  },
};

export const CLICK_WHEEL_THEME: ThemeDefinition = {
  id: 'click-wheel',
  name: 'Click Wheel',
  description: '2004-2008 glossy white portable media player & flat-panel LCD display',
  scopeSelectorValue: 'click-wheel',
  swatch: {
    primaryHex: '#E2E4E8',
    secondaryHex: '#8E9399',
    cabinetHex: '#F4F5F7',
    accentHex: '#3478F6',
  },
  tokens: {
    shellBgHex: '#e6e8ed',
    shellTextHex: '#1D1D1F',
    cabinetSurfaceBg: '#F4F5F7',
    cabinetBorderHex: '#D8DADE',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Inter', 'Plus Jakarta Sans', sans-serif",
    fontSans: "'Inter', 'Plus Jakarta Sans', sans-serif",
    fontMono: "'Inter', ui-monospace, monospace",
  },
};

export const SQUIRCLE_PMP_THEME: ThemeDefinition = {
  id: 'squircle-pmp',
  name: 'Squircle PMP',
  description: '2006-2011 matte brown-olive portable player, magenta twist UI & slim monitor',
  scopeSelectorValue: 'squircle-pmp',
  swatch: {
    primaryHex: '#55503C',
    secondaryHex: '#0B0A0A',
    cabinetHex: '#4A3A2E',
    accentHex: '#E6007E',
  },
  tokens: {
    shellBgHex: '#2a211b',
    shellTextHex: '#FFFFFF',
    cabinetSurfaceBg: '#4A3A2E',
    cabinetBorderHex: '#857F74',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Space Grotesk', 'Plus Jakarta Sans', sans-serif",
    fontSans: "'Space Grotesk', 'Plus Jakarta Sans', sans-serif",
    fontMono: "'Space Mono', monospace",
  },
};

export const DESKTOP_98_THEME: ThemeDefinition = {
  id: 'desktop-98',
  name: "'98 Desktop Player",
  description: '1997-2002 beveled steel PC audio windows, 19-bar spectrum & beige CRT monitor',
  scopeSelectorValue: 'desktop-98',
  swatch: {
    primaryHex: '#3A4A5C',
    secondaryHex: '#0A0F0A',
    cabinetHex: '#1E2733',
    accentHex: '#00E36D',
  },
  tokens: {
    shellBgHex: '#0d131a',
    shellTextHex: '#00E36D',
    cabinetSurfaceBg: '#27313E',
    cabinetBorderHex: '#6E8298',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Silkscreen', monospace",
    fontSans: "'VT323', monospace",
    fontMono: "'VT323', monospace",
  },
};

export const STREAMLINE_THEME: ThemeDefinition = {
  id: 'streamline',
  name: 'Streamline',
  description: '2015-now dark content-first streaming UI, ambient art glow & pinned player bar',
  scopeSelectorValue: 'streamline',
  swatch: {
    primaryHex: '#161A20',
    secondaryHex: '#0F1115',
    cabinetHex: '#1D232B',
    accentHex: '#19C6A3',
  },
  tokens: {
    shellBgHex: '#0F1115',
    shellTextHex: '#FFFFFF',
    cabinetSurfaceBg: '#161A20',
    cabinetBorderHex: 'rgba(255, 255, 255, 0.08)',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Inter', sans-serif",
    fontSans: "'Inter', sans-serif",
    fontMono: "'Inter', ui-monospace, monospace",
  },
};

export const AURORA_DECK_THEME: ThemeDefinition = {
  id: 'aurora-deck',
  name: 'Aurora Deck',
  description: 'Holographic future instrument with 9 light rings, glass field panels & aurora wash',
  scopeSelectorValue: 'aurora-deck',
  swatch: {
    primaryHex: '#4DE1FF',
    secondaryHex: '#06070C',
    cabinetHex: '#9D7CFF',
    accentHex: '#FFB24D',
  },
  tokens: {
    shellBgHex: '#06070C',
    shellTextHex: '#EAF2FF',
    cabinetSurfaceBg: 'rgba(255, 255, 255, 0.06)',
    cabinetBorderHex: 'rgba(255, 255, 255, 0.14)',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Space Grotesk', sans-serif",
    fontSans: "'Space Grotesk', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
  },
};

export const CD_HIFI_THEME: ThemeDefinition = {
  id: 'cd-hifi',
  name: 'CD Hi-Fi System',
  description: 'Early-2000s Sony Micro Hi-Fi 3-Disc Changer, Kevlar Speakers, Bravia TV & Remote',
  scopeSelectorValue: 'cd-hifi',
  swatch: {
    primaryHex: '#2563EB',
    secondaryHex: '#0F131A',
    cabinetHex: '#C5C9D0',
    accentHex: '#00F0FF',
  },
  tokens: {
    shellBgHex: '#0d1016',
    shellTextHex: '#F3F6FA',
    cabinetSurfaceBg: '#191D24',
    cabinetBorderHex: '#8E95A2',
    woodGrainAsset: '',
    frontWoodAsset: '',
    platterMatAsset: '',
    vinylAsset: '',
    fontDisplay: "'Space Grotesk', 'Inter', sans-serif",
    fontSans: "'Inter', 'Plus Jakarta Sans', sans-serif",
    fontMono: "'Share Tech Mono', 'JetBrains Mono', monospace",
  },
};

export const THEME_REGISTRY: readonly ThemeDefinition[] = [
  RETRO_TURNTABLE_THEME,
  REEL_TO_REEL_THEME,
  CASSETTE_DECK_THEME,
  CD_HIFI_THEME,
  CLICK_WHEEL_THEME,
  SQUIRCLE_PMP_THEME,
  DESKTOP_98_THEME,
  STREAMLINE_THEME,
  AURORA_DECK_THEME,
] as const;

export function getThemeById(themeId?: string | null): ThemeDefinition {
  if (!themeId) return RETRO_TURNTABLE_THEME;
  const found = THEME_REGISTRY.find((theme) => theme.id === themeId);
  return found || RETRO_TURNTABLE_THEME;
}

export function loadSavedThemeId(storage?: Pick<Storage, 'getItem'> | null): string {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return DEFAULT_THEME_ID;
  try {
    const raw = targetStorage.getItem(ACTIVE_THEME_STORAGE_KEY);
    return getThemeById(raw).id;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(
  themeId: string,
  storage?: Pick<Storage, 'setItem'> | null
): string {
  const resolved = getThemeById(themeId).id;
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (targetStorage) {
    try {
      targetStorage.setItem(ACTIVE_THEME_STORAGE_KEY, resolved);
    } catch {
      // ignore storage quota errors
    }
  }
  return resolved;
}
