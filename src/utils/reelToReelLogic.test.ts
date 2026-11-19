import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REEL_TRACK_CHANGE_TIMELINE_MS,
  calculateReelTapeRadii,
  calculateReelRotationSpeeds,
  getReelTrackChangeStagePose,
  vuLevelToNeedleAngleDeg,
  rotaryValueToAngleDeg,
  pitchPercentToNormalized,
  normalizedToPitchPercent,
  computeRotaryDragValue,
} from './reelToReelLogic';
import {
  THEME_REGISTRY,
  REEL_TO_REEL_THEME,
  RETRO_TURNTABLE_THEME,
  getThemeById,
  saveThemeId,
  loadSavedThemeId,
  ACTIVE_THEME_STORAGE_KEY,
} from '../themes/themeRegistry';

test('THEME_REGISTRY exposes both Retro Turntable and Reel-to-Reel themes with storage persistence', () => {
  assert.equal(THEME_REGISTRY.length >= 2, true);
  assert.ok(THEME_REGISTRY.some((t) => t.id === RETRO_TURNTABLE_THEME.id && t.name === 'Retro Turntable'));
  assert.ok(THEME_REGISTRY.some((t) => t.id === REEL_TO_REEL_THEME.id && t.name === 'Reel-to-Reel'));

  const resolved = getThemeById('reel-to-reel');
  assert.equal(resolved.id, 'reel-to-reel');
  assert.equal(resolved.name, 'Reel-to-Reel');
  assert.equal(resolved.swatch.cabinetHex, '#6B4A2F');
  assert.equal(resolved.swatch.primaryHex, '#C9CCCE');
  assert.equal(resolved.swatch.secondaryHex, '#3B2A1E');
  assert.equal(resolved.swatch.accentHex, '#FF9F43');

  const memMap = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => memMap.get(k) ?? null,
    setItem: (k: string, v: string) => { memMap.set(k, v); },
  };

  assert.equal(saveThemeId('reel-to-reel', mockStorage), 'reel-to-reel');
  assert.equal(memMap.get(ACTIVE_THEME_STORAGE_KEY), 'reel-to-reel');
  assert.equal(loadSavedThemeId(mockStorage), 'reel-to-reel');

  assert.equal(saveThemeId('retro-turntable', mockStorage), 'retro-turntable');
  assert.equal(loadSavedThemeId(mockStorage), 'retro-turntable');
});

test('calculateReelTapeRadii models physical supply-shrinking and takeup-growing tape spools across song progress', () => {
  const start = calculateReelTapeRadii(0);
  const mid = calculateReelTapeRadii(0.5);
  const end = calculateReelTapeRadii(1);

  assert.equal(start.supplyOuterPct, 86);
  assert.equal(start.takeupOuterPct, 38);

  assert.ok(mid.supplyOuterPct < start.supplyOuterPct && mid.supplyOuterPct > end.supplyOuterPct);
  assert.ok(mid.takeupOuterPct > start.takeupOuterPct && mid.takeupOuterPct < end.takeupOuterPct);
  assert.ok(Math.abs(mid.supplyOuterPct - mid.takeupOuterPct) < 0.05);

  assert.equal(end.supplyOuterPct, 38);
  assert.equal(end.takeupOuterPct, 86);

  // Clamping guards
  assert.deepEqual(calculateReelTapeRadii(-1), start);
  assert.deepEqual(calculateReelTapeRadii(2), end);
  assert.deepEqual(calculateReelTapeRadii(Number.NaN), start);
});

test('calculateReelRotationSpeeds spins take-up reel ~20% faster than supply and guide rollers fastest', () => {
  const std = calculateReelRotationSpeeds(33, 0, false);
  assert.equal(std.timingFunction, 'linear');
  assert.ok(Math.abs(std.takeupDurationSec - Number((std.supplyDurationSec / 1.2).toFixed(3))) <= 0.002);
  assert.ok(std.guideRollerDurationSec < std.takeupDurationSec);

  const fast45 = calculateReelRotationSpeeds(45, 8, false);
  assert.ok(fast45.supplyDurationSec < std.supplyDurationSec);
  assert.ok(fast45.takeupDurationSec < std.takeupDurationSec);

  const lowPower = calculateReelRotationSpeeds(33, 0, true);
  assert.match(lowPower.timingFunction, /^steps\(\d+, end\)$/);
});

test('REEL_TRACK_CHANGE_TIMELINE_MS stays under 2 seconds and maps all track-change phases cleanly', () => {
  assert.ok(REEL_TRACK_CHANGE_TIMELINE_MS.resumePlayEndMs < 2000);
  assert.ok(
    REEL_TRACK_CHANGE_TIMELINE_MS.brakeWobbleEndMs < REEL_TRACK_CHANGE_TIMELINE_MS.rewindTapeEndMs &&
      REEL_TRACK_CHANGE_TIMELINE_MS.rewindTapeEndMs < REEL_TRACK_CHANGE_TIMELINE_MS.swapReelsEndMs &&
      REEL_TRACK_CHANGE_TIMELINE_MS.swapReelsEndMs < REEL_TRACK_CHANGE_TIMELINE_MS.resumePlayEndMs
  );

  const braking = getReelTrackChangeStagePose('braking-wobble');
  assert.equal(braking.rollerSpinMode, 'paused');
  assert.equal(braking.showFreshReelProportions, false);

  const rewinding = getReelTrackChangeStagePose('rewinding-tape');
  assert.equal(rewinding.rollerSpinMode, 'reverse-fast');
  assert.equal(rewinding.tapeRewindShimmer, true);
  assert.equal(rewinding.showFreshReelProportions, false);

  const swapping = getReelTrackChangeStagePose('swapping-reels');
  assert.equal(swapping.rollerSpinMode, 'paused');
  assert.equal(swapping.showFreshReelProportions, true);

  const resuming = getReelTrackChangeStagePose('resuming-play');
  assert.equal(resuming.rollerSpinMode, 'normal');
  assert.equal(resuming.showFreshReelProportions, true);

  const idle = getReelTrackChangeStagePose('idle');
  assert.equal(idle.rollerSpinMode, 'normal');
  assert.equal(idle.tapePathOpacity, 1);
});

test('vuLevelToNeedleAngleDeg centers needle at 0deg when idle and sweeps [-38..+38]deg when active', () => {
  assert.equal(vuLevelToNeedleAngleDeg(0.8, false), 0);
  assert.equal(vuLevelToNeedleAngleDeg(Number.NaN, true), 0);
  assert.equal(vuLevelToNeedleAngleDeg(0.03, true), -38);
  assert.equal(vuLevelToNeedleAngleDeg(1, true), 38);

  const mid = vuLevelToNeedleAngleDeg(0.515, true);
  assert.ok(Math.abs(mid) <= 0.1, `Expected nominal midpoint near 0deg, got ${mid}`);
});

test('rotaryValueToAngleDeg, pitchPercent normalization, and computeRotaryDragValue support both vertical and arc drags', () => {
  assert.equal(rotaryValueToAngleDeg(0), -135);
  assert.equal(rotaryValueToAngleDeg(0.5), 0);
  assert.equal(rotaryValueToAngleDeg(1), 135);

  assert.equal(pitchPercentToNormalized(-12), 0);
  assert.equal(pitchPercentToNormalized(0), 0.5);
  assert.equal(pitchPercentToNormalized(12), 1);

  assert.equal(normalizedToPitchPercent(0), -12);
  assert.equal(normalizedToPitchPercent(0.5), 0);
  assert.equal(normalizedToPitchPercent(1), 12);

  // Vertical drag up increases normalized knob value
  const verticalUp = computeRotaryDragValue({
    startValue01: 0.5,
    startClientX: 100,
    startClientY: 200,
    clientX: 100,
    clientY: 145, // 55px up = +0.5
    centerX: 100,
    centerY: 200,
    mode: 'vertical',
  });
  assert.equal(verticalUp, 1);

  const verticalDown = computeRotaryDragValue({
    startValue01: 0.5,
    startClientX: 100,
    startClientY: 200,
    clientX: 100,
    clientY: 255, // 55px down = -0.5
    centerX: 100,
    centerY: 200,
    mode: 'vertical',
  });
  assert.equal(verticalDown, 0);

  // Circular arc drag around knob center: straight up -> 0.5, right (+90deg) -> ~0.833, left (-90deg) -> ~0.167
  const arcTop = computeRotaryDragValue({
    startValue01: 0.2,
    startClientX: 60,
    startClientY: 200,
    clientX: 100,
    clientY: 160, // directly above center (100, 200)
    centerX: 100,
    centerY: 200,
    mode: 'arc',
  });
  assert.equal(arcTop, 0.5);

  const arcRight = computeRotaryDragValue({
    startValue01: 0.5,
    startClientX: 100,
    startClientY: 160,
    clientX: 140,
    clientY: 200, // directly right of center -> +90deg -> (90+135)/270 = 0.833
    centerX: 100,
    centerY: 200,
    mode: 'arc',
  });
  assert.equal(arcRight, 0.833);
});
