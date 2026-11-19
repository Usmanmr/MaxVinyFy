import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_REGISTRY,
  DESKTOP_98_THEME,
  getThemeById,
  saveThemeId,
  loadSavedThemeId,
} from '../themes/themeRegistry';
import {
  DESKTOP_98_SPECTRUM_BAR_COUNT,
  DESKTOP_98_EQ_BAND_LABELS,
  DESKTOP_98_TRACK_CHANGE_TIMELINE_MS,
  SEVEN_SEGMENT_DIGIT_MAP,
  formatDesktop98LedDigits,
  formatDesktop98MarqueeText,
  formatDesktop98PlaylistEntry,
  stepDesktop98SpectrumBars,
  calculateDesktop98HolderTiltDeg,
  getDesktop98BitrateAndSampleRate,
} from './desktop98Logic';

describe("'98 Desktop Player Theme & Pure Logic Suite", () => {
  it("registers '98 Desktop Player in THEME_REGISTRY with steel-blue and LED green tokens and zero forbidden brand names", () => {
    const ids = THEME_REGISTRY.map((t) => t.id);
    assert.ok(ids.includes('desktop-98'));
    const theme = getThemeById('desktop-98');
    assert.equal(theme.name, "'98 Desktop Player");
    assert.equal(DESKTOP_98_THEME.swatch.primaryHex, '#3A4A5C');
    assert.equal(DESKTOP_98_THEME.swatch.accentHex, '#00E36D');

    const serialized = JSON.stringify(DESKTOP_98_THEME).toLowerCase();
    assert.equal(serialized.includes('winamp'), false);
    assert.equal(serialized.includes('llama'), false);
    assert.equal(serialized.includes('nullsoft'), false);

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
    assert.equal(saveThemeId('desktop-98', storageMock), 'desktop-98');
    assert.equal(loadSavedThemeId(storageMock), 'desktop-98');
  });

  it('formats 7-segment LED digits and forces 00:00 during track-change loading flash', () => {
    assert.deepEqual(formatDesktop98LedDigits(75, false), ['0', '1', '1', '5']);
    assert.deepEqual(formatDesktop98LedDigits(75, true), ['0', '0', '0', '0']);
    assert.equal(SEVEN_SEGMENT_DIGIT_MAP['8'].every(Boolean), true);
    assert.equal(SEVEN_SEGMENT_DIGIT_MAP['0'][6], false);
  });

  it('animates marquee LOADING flash and character-by-character typing in under 1.5 seconds', () => {
    assert.ok(DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.totalMs < 1500);
    assert.equal(
      DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.loadingFlashMs +
        DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.typingDurationMs,
      DESKTOP_98_TRACK_CHANGE_TIMELINE_MS.totalMs
    );

    assert.equal(formatDesktop98MarqueeText('Daft Punk', 'Da Funk', 'loading', 0), 'LOADING...');
    const partial = formatDesktop98MarqueeText('Daft Punk', 'Da Funk', 'typing', 0.25);
    const full = formatDesktop98MarqueeText('Daft Punk', 'Da Funk', 'idle', 1);
    assert.equal(full, 'DAFT PUNK - DA FUNK *** ');
    assert.ok(partial.length > 0 && partial.length < full.length);
    assert.ok(full.startsWith(partial));
  });

  it('formats numbered green-on-black playlist rows and zero-tilt floating art viewer window', () => {
    const row = formatDesktop98PlaylistEntry(0, 'The Prodigy', 'Breathe', 191);
    assert.equal(row.numberedTitle, '1. The Prodigy - Breathe');
    assert.equal(row.durationText, '3:11');
    assert.equal(calculateDesktop98HolderTiltDeg(), 0);
    assert.equal(DESKTOP_98_EQ_BAND_LABELS.length, 10);
  });

  it('drives 19-bar spectrum analyzer with falling peak caps when playing and collapses flat when paused or loading', () => {
    const empty = new Array(DESKTOP_98_SPECTRUM_BAR_COUNT).fill(0.5);
    const paused = stepDesktop98SpectrumBars(empty, empty, false, false, 1.2);
    assert.equal(paused.bars.length, 19);
    assert.ok(paused.bars.every((b) => b <= 0.06));
    assert.ok(paused.peaks.every((p) => p <= 0.06));

    const active1 = stepDesktop98SpectrumBars(paused.bars, paused.peaks, true, false, 1.0);
    assert.equal(active1.bars.length, 19);
    assert.ok(active1.bars.some((b) => b > 0.25));
    assert.ok(active1.peaks.every((p, idx) => p >= active1.bars[idx]));

    const loadingCollapse = stepDesktop98SpectrumBars(active1.bars, active1.peaks, true, true, 2.0);
    assert.ok(loadingCollapse.bars.every((b) => b <= 0.06));

    const rateInfo = getDesktop98BitrateAndSampleRate('track-98');
    assert.equal(rateInfo.khz, 44);
    assert.ok([128, 160, 192, 256, 320].includes(rateInfo.kbps));
  });
});
