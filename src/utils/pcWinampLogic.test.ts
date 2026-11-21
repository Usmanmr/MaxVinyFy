import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WINAMP_EQ_BAND_LABELS,
  WINAMP_DEFAULT_BANDS_DB,
  WINAMP_EQ_PRESETS,
  dbToNormalized01,
  normalized01ToDb,
  formatWinampLcdTime,
  formatWinampTrackDuration,
  formatWin98SystemClock,
  buildWinampMarqueeText,
  computeWinampEqSplinePath,
  computeScatteredFloppyDeskItems,
  WIN98_BOOT_TIMINGS_MS,
  WIN98_SHUTDOWN_TIMINGS_MS,
  WIN98_BSOD_TIMINGS_MS,
  computeBsodTriggerDelayMs,
  splitDesktopFloppyFlanks,
  formatWmp64StatusLabel,
} from './pcWinampLogic';
import type { TrackItem } from './playerLogic';

const makeTrack = (idx: number): TrackItem => ({
  id: `tr-${idx}`,
  title: `Track Title ${idx}`,
  artist: `Artist ${idx}`,
  album: `Album ${idx}`,
  durationSec: 185 + idx * 12,
  bpm: 112,
  year: 1998,
  artworkUrl: `https://example.com/art-${idx}.jpg`,
  youtubeVideoId: '',
  synthPreset: 'midnight-synth',
  tvFrames: [],
});

describe('pcWinampLogic', () => {
  it('defines 10 authentic Winamp EQ bands from 60Hz to 16KHz', () => {
    assert.equal(WINAMP_EQ_BAND_LABELS.length, 10);
    assert.equal(WINAMP_EQ_BAND_LABELS[0], '60');
    assert.equal(WINAMP_EQ_BAND_LABELS[9], '16K');
    assert.equal(WINAMP_DEFAULT_BANDS_DB.length, 10);
    assert.ok(WINAMP_EQ_PRESETS.length >= 4);
  });

  it('converts dB to normalized [0..1] and back accurately', () => {
    assert.equal(dbToNormalized01(-12), 0);
    assert.equal(dbToNormalized01(0), 0.5);
    assert.equal(dbToNormalized01(12), 1);
    assert.equal(normalized01ToDb(0.5), 0);
    assert.equal(normalized01ToDb(1), 12);
    assert.equal(normalized01ToDb(0), -12);
  });

  it('formats Winamp segmented LCD timer and remaining countdown', () => {
    assert.equal(formatWinampLcdTime(165), '02:45');
    assert.equal(formatWinampLcdTime(165, true, 245), '-01:20');
    assert.equal(formatWinampTrackDuration(225), '3:45');
  });

  it('formats Windows 98 tray clock cleanly', () => {
    const sample = new Date(1998, 7, 24, 16, 20, 0);
    assert.equal(formatWin98SystemClock(sample), '4:20 PM');
  });

  it('builds scrolling Winamp track marquee (song title only) and EQ spline path', () => {
    const marquee = buildWinampMarqueeText(makeTrack(1), 0);
    assert.ok(marquee.includes('1. Track Title 1'));
    assert.equal(marquee.includes('Artist 1'), false);
    const spline = computeWinampEqSplinePath(0, WINAMP_DEFAULT_BANDS_DB, 114, 24);
    assert.equal(spline.linePoints.split(' ').length, 10);
    assert.ok(spline.areaPoints.includes('111,'));
  });

  it('scatters up to 7 floppy disks with varied shell colors and active disk centered', () => {
    const tracks = Array.from({ length: 14 }, (_, i) => makeTrack(i + 1));
    const floppies = computeScatteredFloppyDeskItems(tracks, 'tr-9', 7);
    assert.equal(floppies.length, 7);
    assert.equal(
      floppies.some((f) => f.track.id === 'tr-9' && f.isActive),
      true
    );
    const uniqueShells = new Set(floppies.map((f) => f.shellHex));
    assert.ok(uniqueShells.size >= 4);
  });

  it('defines ordered Windows 98 boot stage timings, splits desk flanks, and formats WMP 6.4 status', () => {
    assert.equal(WIN98_BOOT_TIMINGS_MS.biosStartMs, 280);
    assert.equal(WIN98_BOOT_TIMINGS_MS.splashStartMs, 650);
    assert.equal(WIN98_BOOT_TIMINGS_MS.tealStartMs, 2250);
    assert.equal(WIN98_BOOT_TIMINGS_MS.desktopStartMs, 2450);

    const tracks = Array.from({ length: 6 }, (_, i) => makeTrack(i + 1));
    const floppies = computeScatteredFloppyDeskItems(tracks, 'tr-2', 6);
    const { left, right } = splitDesktopFloppyFlanks(floppies);
    assert.equal(left.length, 3);
    assert.equal(right.length, 3);

    assert.equal(formatWmp64StatusLabel(false, true), 'Playing...   128 Kbps');
    assert.equal(formatWmp64StatusLabel(false, false), 'Paused   128 Kbps');
    assert.equal(formatWmp64StatusLabel(true, false), 'Stopped   0 Kbps');
  });

  it('defines Windows 98 shutdown & BSOD timings and computes bounded BSOD trigger delays', () => {
    assert.equal(WIN98_SHUTDOWN_TIMINGS_MS.splashStartMs, 200);
    assert.equal(WIN98_SHUTDOWN_TIMINGS_MS.safeScreenStartMs, 1500);
    assert.equal(WIN98_SHUTDOWN_TIMINGS_MS.powerOffStartMs, 2300);
    assert.equal(WIN98_SHUTDOWN_TIMINGS_MS.completeOffMs, 2600);
    assert.equal(WIN98_BSOD_TIMINGS_MS.bsodDisplayMs, 2600);
    assert.equal(WIN98_BSOD_TIMINGS_MS.blackFlashMs, 200);
    assert.equal(WIN98_BSOD_TIMINGS_MS.recoveryBootMs, 1300);
    assert.equal(WIN98_BSOD_TIMINGS_MS.totalRecoveryMs, 4100);

    // Known duration: 25% to 72% of durationSec minus elapsedSec (clamped >= 4s)
    assert.equal(computeBsodTriggerDelayMs(200, 0, () => 0), 50000);
    assert.equal(computeBsodTriggerDelayMs(200, 0, () => 0.9999), 143991);
    assert.equal(computeBsodTriggerDelayMs(200, 40, () => 0), 10000);
    assert.equal(computeBsodTriggerDelayMs(200, 120, () => 0), 4000);
    // Unknown duration: 22s to 65s fallback
    assert.equal(computeBsodTriggerDelayMs(0, 0, () => 0), 22000);
    assert.equal(computeBsodTriggerDelayMs(0, 0, () => 0.9999), 64996);
  });
});

