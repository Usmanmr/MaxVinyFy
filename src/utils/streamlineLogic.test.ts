import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  THEME_REGISTRY,
  STREAMLINE_THEME,
  getThemeById,
  saveThemeId,
  loadSavedThemeId,
} from '../themes/themeRegistry';
import {
  STREAMLINE_PALETTE,
  STREAMLINE_TRACK_CHANGE_TIMELINE_MS,
  STREAMLINE_LYRIC_TRANSITION_MS,
  STREAMLINE_CHANNEL_COUNT,
  getStreamlineKaraokeWindow,
  calculateStreamlineKaraokeTranslateY,
  hexToRgbaString,
  buildStreamlineAmbientGradient,
  calculateStreamlineHolderSettleTiltDeg,
  computeSeekHoverPreview,
  computeDjBrakeCurve,
} from './streamlineLogic';

describe('Streamline Theme & Pure Logic Suite', () => {
  it('registers Streamline in THEME_REGISTRY with exact dark-UI teal tokens and zero Spotify branding', () => {
    const ids = THEME_REGISTRY.map((t) => t.id);
    assert.ok(ids.includes('streamline'));
    const theme = getThemeById('streamline');
    assert.equal(theme.name, 'Streamline');
    assert.equal(STREAMLINE_THEME.swatch.primaryHex, '#161A20');
    assert.equal(STREAMLINE_THEME.swatch.secondaryHex, '#0F1115');
    assert.equal(STREAMLINE_THEME.swatch.accentHex, '#19C6A3');
    assert.equal(STREAMLINE_PALETTE.background, '#0F1115');
    assert.equal(STREAMLINE_PALETTE.card, '#161A20');
    assert.equal(STREAMLINE_PALETTE.rowHover, '#1D232B');
    assert.equal(STREAMLINE_PALETTE.textPrimary, '#FFFFFF');
    assert.equal(STREAMLINE_PALETTE.textSecondary, '#A7AFBC');
    assert.equal(STREAMLINE_PALETTE.textTertiary, '#5E6673');
    assert.equal(STREAMLINE_PALETTE.accentTeal, '#19C6A3');
    assert.equal(STREAMLINE_PALETTE.cardRadiusPx, 16);
    assert.equal(STREAMLINE_PALETTE.heroArtRadiusPx, 20);
    assert.equal(STREAMLINE_PALETTE.playlistRowHeightPx, 48);
    assert.equal(STREAMLINE_PALETTE.playButtonSizePx, 48);
    assert.equal(STREAMLINE_PALETTE.seekBarHeightPx, 3);
    assert.equal(STREAMLINE_CHANNEL_COUNT, 5);

    const serializedTheme = JSON.stringify(STREAMLINE_THEME).toLowerCase();
    assert.equal(serializedTheme.includes('spotify'), false);
    assert.equal(serializedTheme.includes('1db954'), false);
    assert.equal(serializedTheme.includes('1ed760'), false);

    const mem = new Map<string, string>();
    const storageMock: Storage = {
      length: 0,
      clear: () => mem.clear(),
      getItem: (k: string) => mem.get(k) ?? null,
      key: () => null,
      removeItem: (k: string) => {
        mem.delete(k);
      },
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    assert.equal(saveThemeId('streamline', storageMock), 'streamline');
    assert.equal(loadSavedThemeId(storageMock), 'streamline');
  });

  it('computes 3-line karaoke lyric windows and smooth center translation offsets', () => {
    assert.equal(STREAMLINE_LYRIC_TRANSITION_MS, 200);
    assert.equal(STREAMLINE_TRACK_CHANGE_TIMELINE_MS.crossfadeMs, 600);

    assert.deepEqual(getStreamlineKaraokeWindow(0, 0), {
      visibleIndices: [],
      activeIndex: 0,
    });
    assert.deepEqual(getStreamlineKaraokeWindow(2, 1), {
      visibleIndices: [0, 1],
      activeIndex: 1,
    });
    assert.deepEqual(getStreamlineKaraokeWindow(10, 0), {
      visibleIndices: [0, 1, 2],
      activeIndex: 0,
    });
    assert.deepEqual(getStreamlineKaraokeWindow(10, 4), {
      visibleIndices: [3, 4, 5],
      activeIndex: 4,
    });
    assert.deepEqual(getStreamlineKaraokeWindow(10, 9), {
      visibleIndices: [7, 8, 9],
      activeIndex: 9,
    });

    assert.equal(calculateStreamlineKaraokeTranslateY(160, 60, 40), 0);
    assert.equal(calculateStreamlineKaraokeTranslateY(160, 100, 40), -40);
  });

  it('builds blurred dominant-color ambient gradients and converts hex values safely', () => {
    assert.equal(hexToRgbaString('#19C6A3', 0.5), 'rgba(25, 198, 163, 0.5)');
    assert.equal(hexToRgbaString('#FFF', 0.25), 'rgba(255, 255, 255, 0.25)');
    assert.equal(hexToRgbaString('bad-hex', 2), 'rgba(25, 198, 163, 1)');

    const grad = buildStreamlineAmbientGradient('#E0564A', '#FF9F88', '#331210');
    assert.ok(grad.includes('rgba(224, 86, 74, 0.34)'));
    assert.ok(grad.includes('rgba(255, 159, 136, 0.22)'));
    assert.ok(grad.includes('#0F1115'));
  });

  it('settles draggable card flat at 0deg, computes seek hover preview, and generates DJ-brake rate steps', () => {
    assert.equal(calculateStreamlineHolderSettleTiltDeg(), 0);

    assert.deepEqual(computeSeekHoverPreview(0.5, 200), {
      percent: 50,
      targetSec: 100,
    });
    assert.deepEqual(computeSeekHoverPreview(1.4, 180), {
      percent: 100,
      targetSec: 180,
    });
    assert.deepEqual(computeSeekHoverPreview(-0.2, 180), {
      percent: 0,
      targetSec: 0,
    });

    const curve = computeDjBrakeCurve(1.0);
    assert.equal(curve.length, 4);
    assert.ok(curve[1] < curve[0]);
    assert.equal(curve[curve.length - 1], 1.0);
  });

  it('keeps Spotify branding and Spotify green (#1DB954/#1ED760) completely out of Streamline deck/player-bar components', () => {
    const rootDir = process.cwd();
    const targets = [
      path.join(rootDir, 'src/components/StreamlineDeck.tsx'),
      path.join(rootDir, 'src/components/StreamlinePlayerBar.tsx'),
      path.join(rootDir, 'src/themes/streamline.css'),
    ];
    for (const filePath of targets) {
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      assert.equal(content.includes('1db954'), false, `Unexpected #1DB954 in ${filePath}`);
      assert.equal(content.includes('1ed760'), false, `Unexpected #1ED760 in ${filePath}`);
    }
  });
});
