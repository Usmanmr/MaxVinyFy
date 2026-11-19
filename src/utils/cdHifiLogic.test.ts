import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CD_LOADING_TIMELINE_MS,
  CD_HIFI_SYSTEM_PROPORTIONS,
  CD_JEWEL_CASE_SPEC,
  getCdTrayStagePose,
  computeCdVfdSpectrumBars,
  computeKevlarSpeakerExcursion,
  computeCdSpeakerRgbGlow,
  getNextCdRgbPreset,
  computeRotatingCdTowerRackState,
  snapCdTowerRotationDeg,
  getNextCdPresetEq,
  formatBraviaOsdBanner,
  computeCdVfdFilamentState,
} from './cdHifiLogic';

describe('cdHifiLogic — Sony Mini Hi-Fi, RGB Speakers, 3D Rotating CD Rack & 1,600ms Loading Sequence', () => {
  it('enforces exact 34% / 32% / 34% three-column proportions and component ratios', () => {
    assert.equal(
      CD_HIFI_SYSTEM_PROPORTIONS.leftSpeakerWidthPct +
        CD_HIFI_SYSTEM_PROPORTIONS.centerReceiverWidthPct +
        CD_HIFI_SYSTEM_PROPORTIONS.rightSpeakerWidthPct,
      100
    );
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.leftSpeakerWidthPct, 34);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.centerReceiverWidthPct, 32);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.rightSpeakerWidthPct, 34);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.hornWaveguideHeightPct, 12);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.mainSpeakerScaleFactor, 0.7);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.centerDiscDiameterPct, 84);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.auxDriversCountPerSide, 3);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.wooferDiameterPct, 82);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.bassReflexPortDiameterPct, 22);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.masterVolumeKnobDiameterPct, 36);
    assert.equal(CD_HIFI_SYSTEM_PROPORTIONS.masterVolumeWellDiameterPct, 56);
  });

  it('transitions cleanly through all 4 mechanical CD loading stages (~1,600ms)', () => {
    assert.equal(CD_LOADING_TIMELINE_MS.trayOpenEndMs, 350);
    assert.equal(CD_LOADING_TIMELINE_MS.discLoadEndMs, 750);
    assert.equal(CD_LOADING_TIMELINE_MS.trayCloseEndMs, 1100);
    assert.equal(CD_LOADING_TIMELINE_MS.laserReadEndMs, 1600);

    // Standby state
    const standby = getCdTrayStagePose(100, false, true);
    assert.equal(standby.phase, 'closed-idle');
    assert.equal(standby.trayExtension01, 0);
    assert.equal(standby.discSpinDurationSec, 0);

    // Stage 1: Motorized Drawer Ejection (0..350ms) with rotateX(18deg) tilt
    const opening = getCdTrayStagePose(175, true, false);
    assert.equal(opening.phase, 'tray-opening');
    assert.ok(opening.trayExtension01 > 0.45 && opening.trayExtension01 < 0.55);
    assert.ok(opening.trayTiltDeg > 8 && opening.trayTiltDeg <= 18);
    assert.equal(opening.openCloseBtnDepressed, true);
    assert.equal(opening.vfdStatusLabel, 'OPEN');

    // Stage 2: Jewel Case Extraction & Disc Placement (350..750ms) with 2px damped drop bounce
    const loading = getCdTrayStagePose(700, true, false);
    assert.equal(loading.phase, 'disc-loading');
    assert.equal(loading.trayExtension01, 1);
    assert.equal(loading.trayTiltDeg, 18);
    assert.ok(loading.discFlightProgress01 > 0.8);
    assert.notEqual(loading.discDropBouncePx, 0);
    assert.equal(loading.vfdStatusLabel, 'DISC LOAD');

    // Stage 3: Tray Retraction (750..1,100ms)
    const closing = getCdTrayStagePose(925, true, false);
    assert.equal(closing.phase, 'tray-closing');
    assert.ok(closing.trayExtension01 < 1 && closing.trayExtension01 > 0);
    assert.equal(closing.discSeated01, 1);

    // Stage 4: Laser Focus & High-RPM Spin-Up (1,100..1,600ms)
    const laser = getCdTrayStagePose(1350, true, false);
    assert.equal(laser.phase, 'laser-reading');
    assert.equal(laser.trayExtension01, 0);
    assert.ok(laser.laserFocusPulse01 >= 0.25);
    assert.ok(laser.discSpinDurationSec > 0.42);
    assert.equal(laser.vfdStatusLabel, 'READING');

    // Completed -> Continuous High-RPM Spinning Playback
    const spinning = getCdTrayStagePose(1750, true, false);
    assert.equal(spinning.phase, 'spinning-play');
    assert.equal(spinning.trayExtension01, 0);
    assert.equal(spinning.discSpinDurationSec, 0.42);
    assert.equal(spinning.vfdStatusLabel, '00:01');
  });

  it('computes dynamic RGB speaker lighting and cone excursion (scale 1.0 to 1.07)', () => {
    const beatGlow = computeCdSpeakerRgbGlow(0.85, 0.8, 2.4, 'BEAT_SPECTRUM', true, true);
    assert.ok(beatGlow.leftConeScale > 1.0 && beatGlow.leftConeScale <= 1.07);
    assert.ok(beatGlow.rightConeScale > 1.0 && beatGlow.rightConeScale <= 1.07);
    assert.ok(beatGlow.ringGlowOpacity > 0.5);
    assert.equal(beatGlow.presetLabel, 'Beat-Sync Spectrum');

    const nextPreset = getNextCdRgbPreset('BEAT_SPECTRUM');
    assert.equal(nextPreset, 'SOLID_NEON');
    const solidGlow = computeCdSpeakerRgbGlow(0.5, 0.5, 1.0, nextPreset, false, true);
    assert.equal(solidGlow.leftRingHex, '#00F0FF');
    assert.equal(solidGlow.leftPortHex, '#FF007F');
  });

  it('computes 3D rotating vertical CD tower rack state and slot hover pull-out', () => {
    assert.equal(CD_JEWEL_CASE_SPEC.spineWidthPx, 12);
    assert.equal(snapCdTowerRotationDeg(41, 45), 45);
    const rackState = computeRotatingCdTowerRackState(90, 6, 1, 3);
    assert.equal(rackState.normalizedRotationDeg, 90);
    assert.equal(rackState.slots.length, 6);
    assert.equal(rackState.slots[3].isHovered, true);
    assert.equal(rackState.slots[3].pullOutTranslateZPx, 28);
    assert.equal(rackState.slots[3].pullOutTranslateXPx, 16);
    assert.equal(rackState.slots[1].isSelected, true);
  });

  it('computes 11-band VFD spectrum bars with Groove bass boost lift', () => {
    const flatBars = computeCdVfdSpectrumBars(0.65, 0.6, 12.4, false, true);
    const grooveBars = computeCdVfdSpectrumBars(0.65, 0.6, 12.4, true, true);
    assert.equal(flatBars.length, 11);
    assert.ok(grooveBars[0].litSegments >= flatBars[0].litSegments);
  });

  it('computes Kevlar speaker excursion and cycles preset EQ modes', () => {
    const idleExcursion = computeKevlarSpeakerExcursion(0.8, 0.8, true, false);
    assert.equal(idleExcursion.leftConeScale, 1);

    const activeExcursion = computeKevlarSpeakerExcursion(0.9, 0.85, true, true);
    assert.ok(activeExcursion.leftConeScale > 1 && activeExcursion.leftConeScale <= 1.07);
    assert.ok(activeExcursion.leftDustCapOffsetPx > 0);

    assert.equal(getNextCdPresetEq('ROCK'), 'POP');
    assert.equal(getNextCdPresetEq('FLAT'), 'ROCK');
  });

  it('formats Sony Bravia OSD banners and VFD filament dimmer states accurately', () => {
    const chBanner = formatBraviaOsdBanner('CHANNEL', {
      channelIndex: 2,
      trackTitle: 'Midnight City',
    });
    assert.equal(chBanner.primaryText, 'CH 03 · HDMI 1');
    assert.equal(chBanner.badgeText, '1080p');

    const muteBanner = formatBraviaOsdBanner('MUTING', {
      isMuted: true,
      volumePct: 65,
    });
    assert.equal(muteBanner.primaryText, 'MUTING');
    assert.equal(muteBanner.badgeText, 'MUTE');

    const brightVfd = computeCdVfdFilamentState(false, false);
    const dimmerVfd = computeCdVfdFilamentState(true, false);
    const dipVfd = computeCdVfdFilamentState(false, true);
    assert.equal(brightVfd.filamentOpacity, 1);
    assert.ok(dimmerVfd.filamentOpacity < brightVfd.filamentOpacity);
    assert.equal(dipVfd.dimLabel, 'DIP');
  });

  it('computes 7-band Full-Width Graphic Equalizer preset curves and Groove low-end lift', async () => {
    const {
      CD_FULL_WIDTH_EQ_BANDS,
      clampCdEqBandGainDb,
      getCdEqPresetBandGainsDb,
    } = await import('./cdHifiLogic');

    assert.equal(CD_FULL_WIDTH_EQ_BANDS.length, 7);
    assert.equal(clampCdEqBandGainDb(18), 12);
    assert.equal(clampCdEqBandGainDb(-19), -12);

    const flatCurve = getCdEqPresetBandGainsDb('FLAT', false);
    assert.deepEqual(flatCurve, [0, 0, 0, 0, 0, 0, 0]);

    const rockGroove = getCdEqPresetBandGainsDb('ROCK', true);
    assert.ok(rockGroove[0] > 6);
    assert.equal(rockGroove.length, 7);
  });
});
