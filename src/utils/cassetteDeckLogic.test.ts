import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CASSETTE_TRACK_CHANGE_TIMELINE_MS,
  getCassetteTrackChangeStagePose,
  resolveCassetteTransportKeyStates,
  computeBoomboxProportionalGeometry,
  computeExpandedBoomboxStageLayout,
  calculateCassetteTapePancakes,
  calculateCassetteHubSpeeds,
  formatTapeCounterDigits,
  levelTo12SegmentCount,
  levelTo4RedPeakDots,
  getCassetteLedSegmentSpec,
  getCassetteSpineStripeColor,
  CASSETTE_SPINE_STRIPE_COLORS,
  DEFAULT_CASSETTE_SPINE_PALETTE,
  extractCassetteSpinePaletteFromPixels,
  splitPlaylistIntoOrganizerColumns,
  tunerDialRatioToSeekSec,
  stepSeekSecFromTuningKnobDelta,
  computeCassetteBoxDimensions,
  CASSETTE_5BAND_EQ_SPECS,
  computeBassSpeakerPulseScale,
  computeEqBandPeakLevels,
  horizontalPointerRatioToPitch,
  calculatePitchThumbLeftPercent,
  horizontalPointerRatioToVolume,
  calculateVolumeThumbLeftPercent,
  BOOMBOX_FM_DIAL_MARKERS,
  BOOMBOX_AM_DIAL_MARKERS,
  BOOMBOX_DEFAULT_TUNER_FM_MHZ,
  fmFrequencyToNeedlePercent,
  WTB_732_RADIO_BANDS,
  WTB_732_MONOCHROME_PALETTE,
  getMirroredUpperAuxiliarySpeakers,
  CASSETTE_EQ_DB_TICKS,
  WTB_732_RACK_PALETTE,
  shouldShowCassetteGraphicEq,
} from './cassetteDeckLogic';
import {
  THEME_REGISTRY,
  CASSETTE_DECK_THEME,
  RETRO_TURNTABLE_THEME,
  REEL_TO_REEL_THEME,
  getThemeById,
  saveThemeId,
  loadSavedThemeId,
  ACTIVE_THEME_STORAGE_KEY,
} from '../themes/themeRegistry';

test('THEME_REGISTRY exposes silver boombox Cassette Deck theme without creating duplicates and supports storage persistence', () => {
  assert.equal(THEME_REGISTRY.filter((t) => t.id === 'cassette-deck').length, 1);
  assert.ok(THEME_REGISTRY.some((t) => t.id === RETRO_TURNTABLE_THEME.id && t.name === 'Retro Turntable'));
  assert.ok(THEME_REGISTRY.some((t) => t.id === REEL_TO_REEL_THEME.id && t.name === 'Reel-to-Reel'));
  assert.ok(THEME_REGISTRY.some((t) => t.id === CASSETTE_DECK_THEME.id && t.name === 'Cassette Deck'));

  const resolved = getThemeById('cassette-deck');
  assert.equal(resolved.id, 'cassette-deck');
  assert.equal(resolved.name, 'Cassette Deck');
  assert.equal(resolved.swatch.primaryHex, '#C6C8CB');
  assert.equal(resolved.swatch.secondaryHex, '#9DA0A4');
  assert.equal(resolved.swatch.cabinetHex, '#141516');
  assert.equal(resolved.swatch.accentHex, '#D64541');

  const memMap = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => memMap.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memMap.set(k, v);
    },
  };

  assert.equal(saveThemeId('cassette-deck', mockStorage), 'cassette-deck');
  assert.equal(memMap.get(ACTIVE_THEME_STORAGE_KEY), 'cassette-deck');
  assert.equal(loadSavedThemeId(mockStorage), 'cassette-deck');
});

test('calculateCassetteTapePancakes shrinks left supply pack while growing right take-up pack proportionally', () => {
  const start = calculateCassetteTapePancakes(0);
  const mid = calculateCassetteTapePancakes(0.5);
  const end = calculateCassetteTapePancakes(1);

  assert.equal(start.leftPancakePct, 92);
  assert.equal(start.rightPancakePct, 44);

  assert.ok(mid.leftPancakePct < start.leftPancakePct && mid.leftPancakePct > end.leftPancakePct);
  assert.ok(mid.rightPancakePct > start.rightPancakePct && mid.rightPancakePct < end.rightPancakePct);
  assert.ok(Math.abs(mid.leftPancakePct - mid.rightPancakePct) < 0.05);

  assert.equal(end.leftPancakePct, 44);
  assert.equal(end.rightPancakePct, 92);

  assert.deepEqual(calculateCassetteTapePancakes(-2), start);
  assert.deepEqual(calculateCassetteTapePancakes(5), end);
  assert.deepEqual(calculateCassetteTapePancakes(Number.NaN), start);
});

test('calculateCassetteHubSpeeds scales hub spin duration with speed/pitch and supports lowPowerMode steps', () => {
  const base = calculateCassetteHubSpeeds(33, 0, false);
  assert.equal(base.timingFunction, 'linear');
  assert.ok(base.takeupDurationSec < base.supplyDurationSec);

  const pitchedUp = calculateCassetteHubSpeeds(45, 10, false);
  assert.ok(pitchedUp.supplyDurationSec < base.supplyDurationSec);
  assert.ok(pitchedUp.takeupDurationSec < base.takeupDurationSec);

  const eco = calculateCassetteHubSpeeds(33, 0, true);
  assert.match(eco.timingFunction, /^steps\(\d+, end\)$/);
});

test('CASSETTE_TRACK_CHANGE_TIMELINE_MS finishes in 1,350ms with strict vertical Y-axis ejection/insertion and Z-index layering', () => {
  assert.equal(CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage4DoorCloseEndMs, 1350);
  assert.ok(
    CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage1DoorOpenEndMs < CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage2SpringPopEndMs &&
      CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage2SpringPopEndMs < CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage2ExtractUpEndMs &&
      CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage2ExtractUpEndMs < CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage3InsertDownEndMs &&
      CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage3InsertDownEndMs < CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage3BottomImpactEndMs &&
      CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage3BottomImpactEndMs < CASSETTE_TRACK_CHANGE_TIMELINE_MS.stage4DoorCloseEndMs
  );

  const stage1 = getCassetteTrackChangeStagePose('stage1-door-open');
  assert.equal(stage1.doorLatchEngaged, false);
  assert.equal(stage1.doorAngleDeg, -32);
  assert.equal(stage1.headRetractY, 8);
  assert.equal(stage1.wellZIndex, 10);
  assert.equal(stage1.cassetteZIndex, 20);
  assert.equal(stage1.doorZIndex, 30);
  assert.match(stage1.doorTransform, /perspective\(800px\) rotateX\(-32deg\)/);

  const stage2Pop = getCassetteTrackChangeStagePose('stage2-spring-pop');
  assert.equal(stage2Pop.cassetteTransform, 'translate3d(0px, -18px, 0px)');
  assert.equal(stage2Pop.cassetteOpacity, 1);

  const stage2Extract = getCassetteTrackChangeStagePose('stage2-extract-up');
  assert.equal(stage2Extract.cassetteTransform, 'translate3d(0px, -140%, 0px)');
  assert.equal(stage2Extract.cassetteOpacity, 0);
  assert.equal(stage2Extract.organizerSwapActive, true);

  const emptyEjected = getCassetteTrackChangeStagePose('ejected-empty');
  assert.equal(emptyEjected.doorAngleDeg, -32);
  assert.equal(emptyEjected.cassetteTransform, 'translate3d(0px, -140%, 0px)');
  assert.equal(emptyEjected.cassetteOpacity, 0);
  assert.equal(emptyEjected.headRetractY, 8);

  const stage3Insert = getCassetteTrackChangeStagePose('stage3-insert-down');
  assert.equal(stage3Insert.showFreshTapeState, true);
  assert.equal(stage3Insert.cassetteTransform, 'translate3d(0px, 0px, 0px)');
  assert.equal(stage3Insert.cassetteOpacity, 1);
  assert.equal(stage3Insert.doorLatchEngaged, false);

  const stage3Impact = getCassetteTrackChangeStagePose('stage3-bottom-impact');
  assert.equal(stage3Impact.cassetteTransform, 'translate3d(0px, 2px, 0px)');

  const stage4Close = getCassetteTrackChangeStagePose('stage4-door-close');
  assert.equal(stage4Close.doorLatchEngaged, true);
  assert.equal(stage4Close.doorAngleDeg, 0);
  assert.equal(stage4Close.doorCompressionPx, 1);
  assert.equal(stage4Close.headRetractY, 0);
  assert.equal(stage4Close.hubSnapDeg, 12);

  const idle = getCassetteTrackChangeStagePose('idle');
  assert.equal(idle.doorLatchEngaged, true);
  assert.equal(idle.cassetteOpacity, 1);
  assert.equal(idle.doorCompressionPx, 0);
  assert.equal(idle.hubSnapDeg, 0);
});

test('resolveCassetteTransportKeyStates handles 6-key piano transport (Record, Rewind, Play, FF, Stop, Eject) with 4px depression and Eject pop-up', () => {
  const playing = resolveCassetteTransportKeyStates({
    isPlaying: true,
    isStandby: false,
    currentSecond: 24,
    trackChangePhase: 'idle',
  });
  assert.equal(playing.play.latched, true);
  assert.equal(playing.play.depth, 'full');
  assert.equal(playing.play.travelPx, 4);
  assert.equal(playing.eject.latched, false);
  assert.equal(playing.eject.travelPx, 0);

  const stopped = resolveCassetteTransportKeyStates({
    isPlaying: false,
    isStandby: false,
    currentSecond: 0,
    trackChangePhase: 'idle',
    activeMomentaryKey: 'stop',
  });
  assert.equal(stopped.play.latched, false);
  assert.equal(stopped.stop.depth, 'full');
  assert.equal(stopped.stop.travelPx, 4);

  const ejecting = resolveCassetteTransportKeyStates({
    isPlaying: true,
    isStandby: false,
    currentSecond: 40,
    trackChangePhase: 'stage1-door-open',
    isRecordingLatched: true,
  });
  assert.equal(ejecting.eject.latched, true);
  assert.equal(ejecting.eject.travelPx, 4);
  assert.equal(ejecting.eject.scaleY, 0.96);
  assert.equal(ejecting.play.latched, false);
  assert.equal(ejecting.play.travelPx, 0);
  assert.equal(ejecting.record.latched, false);
  assert.equal(ejecting.record.travelPx, 0);
});

test('computeBoomboxProportionalGeometry enforces 1.58:1 cassette ratio and 1.15x-1.25x speaker diameter across Desktop, Mobile Landscape, and Mobile Portrait', () => {
  const desktop = computeBoomboxProportionalGeometry(740, 320, false, false);
  assert.ok(desktop.cassetteAspectRatio >= 1.54 && desktop.cassetteAspectRatio <= 1.62);
  assert.ok(desktop.speakerToCassetteRatio >= 1.15 && desktop.speakerToCassetteRatio <= 1.25);

  const landscape = computeBoomboxProportionalGeometry(480, 185, false, true);
  assert.ok(landscape.cassetteAspectRatio >= 1.54 && landscape.cassetteAspectRatio <= 1.62);
  assert.ok(landscape.speakerToCassetteRatio >= 1.15 && landscape.speakerToCassetteRatio <= 1.25);

  const portrait = computeBoomboxProportionalGeometry(356, 360, true, false);
  assert.ok(portrait.cassetteAspectRatio >= 1.54 && portrait.cassetteAspectRatio <= 1.62);
  assert.ok(portrait.speakerToCassetteRatio >= 1.15 && portrait.speakerToCassetteRatio <= 1.25);
  assert.ok(portrait.mobileSpeakerGapPx >= 12 && portrait.mobileSpeakerGapPx <= 16);
});

test('formatTapeCounterDigits and 4-LED red peak indicator helpers map levels deterministically', () => {
  assert.equal(formatTapeCounterDigits(0), '0000');
  assert.equal(formatTapeCounterDigits(0.5), '5000');
  assert.equal(formatTapeCounterDigits(1), '9999');

  assert.equal(levelTo4RedPeakDots(0.8, false), 0);
  assert.equal(levelTo4RedPeakDots(0.2, true), 1);
  assert.equal(levelTo4RedPeakDots(0.48, true), 2);
  assert.equal(levelTo4RedPeakDots(0.95, true), 4);
});

test('12-segment LED meter helpers map inactive state to 0 and boombox green/amber/red color bands accurately', () => {
  assert.equal(levelTo12SegmentCount(0.85, false), 0);
  assert.equal(levelTo12SegmentCount(Number.NaN, true), 0);
  assert.equal(levelTo12SegmentCount(0.02, true), 0);
  assert.equal(levelTo12SegmentCount(0.5, true), 6);
  assert.equal(levelTo12SegmentCount(1.0, true), 12);

  assert.equal(getCassetteLedSegmentSpec(0).zone, 'green');
  assert.equal(getCassetteLedSegmentSpec(7).zone, 'amber');
  assert.equal(getCassetteLedSegmentSpec(10).zone, 'red');
});

test('getCassetteSpineStripeColor and extractCassetteSpinePaletteFromPixels compute accessible ink and cream fallback', () => {
  const seen = CASSETTE_SPINE_STRIPE_COLORS.map((_, idx) => getCassetteSpineStripeColor(idx));
  assert.equal(new Set(seen).size, CASSETTE_SPINE_STRIPE_COLORS.length);

  assert.deepEqual(extractCassetteSpinePaletteFromPixels(null), DEFAULT_CASSETTE_SPINE_PALETTE);
  const darkPalette = extractCassetteSpinePaletteFromPixels(
    new Uint8ClampedArray([96, 18, 22, 255, 102, 20, 24, 255])
  );
  assert.equal(darkPalette.isDarkSurface, true);
  assert.equal(darkPalette.inkHex, '#F7F5EE');
});

test('splitPlaylistIntoOrganizerColumns, tunerDialRatioToSeekSec, and computeCassetteBoxDimensions work accurately', () => {
  const odd = splitPlaylistIntoOrganizerColumns(['a', 'b', 'c', 'd', 'e']);
  assert.equal(odd.leftColumn.length, 3);
  assert.equal(odd.rightColumn.length, 2);

  assert.equal(tunerDialRatioToSeekSec(0.5, 200), 100);
  assert.equal(stepSeekSecFromTuningKnobDelta(60, 300, 60), 120);

  const desktopDims = computeCassetteBoxDimensions(240, 152);
  assert.equal(desktopDims.width - 240, 50);
  assert.equal(desktopDims.height - 152, 50);
});

test('FM/AM radio dial markers, 101.5 MHz crimson-red needle, and horizontal fader helpers', () => {
  assert.deepEqual(BOOMBOX_FM_DIAL_MARKERS, ['88', '90', '92', '96', '100', '104', '108']);
  assert.deepEqual(BOOMBOX_AM_DIAL_MARKERS, [
    '530',
    '600',
    '700',
    '800',
    '1000',
    '1200',
    '1400',
    '1600',
  ]);
  assert.equal(BOOMBOX_DEFAULT_TUNER_FM_MHZ, 101.5);
  assert.equal(fmFrequencyToNeedlePercent(101.5), 67.5);

  assert.equal(horizontalPointerRatioToPitch(0), -12);
  assert.equal(horizontalPointerRatioToPitch(0.5), 0);
  assert.equal(horizontalPointerRatioToPitch(1), 12);
  assert.equal(calculatePitchThumbLeftPercent(0), 50);
  assert.equal(calculateVolumeThumbLeftPercent(0.5), 50);

  assert.equal(WTB_732_RADIO_BANDS.length, 4);
  assert.equal(WTB_732_MONOCHROME_PALETTE.tunerNeedleRedHex, '#E61919');
  assert.equal(WTB_732_MONOCHROME_PALETTE.hasGreenAmberOrYellow, false);
});

test('CASSETTE_5BAND_EQ_SPECS, computeBassSpeakerPulseScale (1.0 to 1.08 dust cap pulse), and computeEqBandPeakLevels', () => {
  assert.deepEqual(
    CASSETTE_5BAND_EQ_SPECS.map((b) => b.freqLabel),
    ['60Hz', '250Hz', '1kHz', '4kHz', '12kHz']
  );

  const pausedPulse = computeBassSpeakerPulseScale(0.8, 0.8, 0.7, 0.8, 0.7, false);
  assert.equal(pausedPulse.coneScale, 1);
  assert.equal(pausedPulse.dustCapScale, 1);

  const activePulse = computeBassSpeakerPulseScale(0.85, 0.8, 0.75, 0.9, 0.8, true);
  assert.ok(activePulse.coneScale > 1.03 && activePulse.coneScale <= 1.08);
  assert.ok(activePulse.dustCapScale > 1.03 && activePulse.dustCapScale <= 1.08);

  const activeEqPeaks = computeEqBandPeakLevels(0.75, 0.7, [0.9, 0.7, 0.5, 0.6, 0.8], 12.4, true);
  assert.equal(activeEqPeaks.length, 5);
  assert.ok(activeEqPeaks.every((lvl) => lvl > 0 && lvl <= 1));
});

test('getMirroredUpperAuxiliarySpeakers enforces outer larger / inner exact 50% mirrored pair and WTB-732 rack/EQ specs', async () => {
  const { computeUpperDualRoundSpeakerPairMetrics } = await import('./cassetteDeckLogic');
  const leftPair = getMirroredUpperAuxiliarySpeakers('left');
  const rightPair = getMirroredUpperAuxiliarySpeakers('right');

  assert.equal(leftPair[0].position, 'outer');
  assert.equal(leftPair[1].position, 'inner');
  assert.equal(rightPair[0].position, 'inner');
  assert.equal(rightPair[1].position, 'outer');
  assert.equal(leftPair[1].diameterRatioToOuter, 0.5);
  assert.equal(rightPair[0].diameterRatioToOuter, 0.5);
  assert.equal(leftPair[0].diameterPxDesktop * 0.5, leftPair[1].diameterPxDesktop);
  assert.equal(leftPair[0].diameterPxMobile * 0.5, leftPair[1].diameterPxMobile);

  const deskAux = computeUpperDualRoundSpeakerPairMetrics(150, false);
  const mobAux = computeUpperDualRoundSpeakerPairMetrics(110, true);
  assert.equal(deskAux.innerToOuterRatio, 0.5);
  assert.equal(mobAux.innerToOuterRatio, 0.5);
  assert.equal(deskAux.innerDiameterPx, deskAux.outerDiameterPx * 0.5);
  assert.equal(mobAux.innerDiameterPx, mobAux.outerDiameterPx * 0.5);

  assert.deepEqual(CASSETTE_EQ_DB_TICKS, ['+12dB', '+6dB', '0dB', '-6dB', '-12dB']);
  assert.equal(WTB_732_RACK_PALETTE.slotCharcoalHex, '#18191B');
  assert.equal(WTB_732_RACK_PALETTE.cornerScrewsCount, 4);
  assert.equal(WTB_732_RACK_PALETTE.cassetteShellScrewsCount, 5);
  assert.equal(shouldShowCassetteGraphicEq(false, false), true);
  assert.equal(shouldShowCassetteGraphicEq(true, false), true);
  assert.equal(shouldShowCassetteGraphicEq(false, true), false);
});

test('computeExpandedBoomboxStageLayout enforces 50px bottom speaker padding and +10px cassette compartment margin on all 4 sides', () => {
  const baseline960 = computeBoomboxProportionalGeometry(960, 380, false, false);
  const expanded960 = computeExpandedBoomboxStageLayout(960, 380, false, false);

  assert.equal(expanded960.leftColumnPct, 28);
  assert.equal(expanded960.centerColumnPct, 44);
  assert.equal(expanded960.rightColumnPct, 28);
  assert.equal(expanded960.speakerBottomPaddingPx, 50);
  assert.equal(expanded960.cassetteMarginAllSidesPx, 10);
  assert.equal(expanded960.cassetteDoorWidthPx - expanded960.cassetteTapeWidthPx, 20);
  assert.equal(expanded960.cassetteDoorHeightPx - expanded960.cassetteTapeHeightPx, 20);
  assert.ok(expanded960.cassetteAspectRatio >= 1.54 && expanded960.cassetteAspectRatio <= 1.62);
  assert.ok(expanded960.cassetteDoorWidthPx >= baseline960.cassetteDoorWidthPx);

  const mobExpanded = computeExpandedBoomboxStageLayout(356, 360, true, false);
  assert.equal(mobExpanded.speakerBottomPaddingPx, 50);
  assert.equal(mobExpanded.cassetteMarginAllSidesPx, 10);
  assert.equal(mobExpanded.cassetteDoorWidthPx - mobExpanded.cassetteTapeWidthPx, 20);
  assert.equal(mobExpanded.cassetteDoorHeightPx - mobExpanded.cassetteTapeHeightPx, 20);
  assert.ok(mobExpanded.cassetteAspectRatio >= 1.54 && mobExpanded.cassetteAspectRatio <= 1.62);
});
