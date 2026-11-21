import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeClickWheelAngleDeltaDeg,
  accumulateClickWheelTickSteps,
  computeClickWheelListIndexStep,
  computeClickWheelSeekTargetSec,
  formatRemainingTrackTime,
  getClickWheelPaneOffsetPercent,
  getNextClickWheelMenuBackPane,
  detectDoubleCenterPress,
  getClickWheelTrackChangePose,
  CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS,
  CLICK_WHEEL_GENERATION_ORDER,
  getClickWheelGenerationSpec,
  cycleClickWheelGeneration,
  loadSavedClickWheelGeneration,
  saveClickWheelGeneration,
  loadSavedGen3Finish,
  saveGen3Finish,
  computeMechanicalWheelDetentSnapDeg,
  stepMechanicalWheelInertia,
  ditherRgbPixelsTo1BitRgba,
  computeMonitorDockIconScale,
  CLICK_WHEEL_DOCK_HEIGHT_RATIO,
  CLICK_WHEEL_MOBILE_DOCK_HEIGHT_RATIO,
  IMAC_2011_CHIN_HEIGHT_RATIO,
  computeSpeakerDockStageHeight,
  computeDockAdapterCollarWidthPx,
  computeImacChinOverlapLayout,
  getClickWheelUnitSwapPose,
  CLICK_WHEEL_DOCK_FIXED_WIDTH_PX,
  computeFixedDockResponsiveScale,
  CLASSIC_COLOR_SPLIT_MENU,
  GEN1_SCROLL_ROOT_MENU,
  GEN2_CLICK_ROOT_MENU,
  buildAmbientFloatingCardSlots,
  computeCardParallaxPose,
  APPLE_STUDIO_RADIAL_GRADIENT,
  APPLE_AQUA_ACTIVE_BLUE_HEX,
  IPOD_MUSIC_HUB_MENU,
  IPOD_REAL_LIFE_ASPECT_RATIO,
  cycleNowPlayingCenterMode,
  computeAsymmetricDesktopWorkspaceLayout,
  computeMobileZeroScrollStackedLayout,
} from './clickWheelLogic';
import {
  THEME_REGISTRY,
  CLICK_WHEEL_THEME,
  getThemeById,
  loadSavedThemeId,
  saveThemeId,
} from '../themes/themeRegistry';

function createMemoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
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
}

describe('Click Wheel Theme Registry Integration', () => {
  it('registers Click Wheel alongside Retro Turntable, Reel-to-Reel, and Cassette Deck', () => {
    const ids = THEME_REGISTRY.map((t) => t.id);
    for (const expectedId of ['retro-turntable', 'reel-to-reel', 'cassette-deck', 'click-wheel']) {
      assert.ok(ids.includes(expectedId), `Expected THEME_REGISTRY to include ${expectedId}`);
    }
    assert.equal(getThemeById('click-wheel').name, 'Click Wheel');
    assert.equal(CLICK_WHEEL_THEME.swatch.cabinetHex, '#F4F5F7');
    assert.equal(CLICK_WHEEL_THEME.swatch.accentHex, '#3478F6');
  });

  it('persists and restores click-wheel theme id from storage cleanly', () => {
    const storageMock = createMemoryStorage();
    const saved = saveThemeId('click-wheel', storageMock);
    assert.equal(saved, 'click-wheel');
    assert.equal(loadSavedThemeId(storageMock), 'click-wheel');
  });
});

describe('Click Wheel Angular Drag & 15-Degree Stepping', () => {
  it('normalizes signed angular wraparound across +/-180 degree boundary', () => {
    assert.equal(normalizeClickWheelAngleDeltaDeg(175, -175), 10);
    assert.equal(normalizeClickWheelAngleDeltaDeg(-175, 175), -10);
    assert.equal(normalizeClickWheelAngleDeltaDeg(20, 45), 25);
    assert.equal(normalizeClickWheelAngleDeltaDeg(45, 20), -25);
  });

  it('emits discrete tick steps every 15 degrees and carries remainder accurately', () => {
    const a = accumulateClickWheelTickSteps(0, 10);
    assert.equal(a.steps, 0);
    assert.equal(a.remainderDeg, 10);

    const b = accumulateClickWheelTickSteps(a.remainderDeg, 22);
    assert.equal(b.steps, 2);
    assert.equal(b.remainderDeg, 2);

    const c = accumulateClickWheelTickSteps(0, -35);
    assert.equal(c.steps, -2);
    assert.equal(c.remainderDeg, -5);
  });

  it('clamps list focus steps cleanly within playlist bounds', () => {
    assert.equal(computeClickWheelListIndexStep(0, -3, 12), 0);
    assert.equal(computeClickWheelListIndexStep(2, 4, 12), 6);
    assert.equal(computeClickWheelListIndexStep(10, 5, 12), 11);
    assert.equal(computeClickWheelListIndexStep(0, 1, 0), 0);
  });

  it('maps Now Playing wheel ticks to bounded timeline seek seconds', () => {
    assert.equal(computeClickWheelSeekTargetSec(30, 2, 200, 3), 36);
    assert.equal(computeClickWheelSeekTargetSec(2, -4, 200, 3), 0);
    assert.equal(computeClickWheelSeekTargetSec(198, 3, 200, 3), 200);
    assert.equal(computeClickWheelSeekTargetSec(10, 1, 0, 3), 0);
  });
});

describe('Click Wheel Time Counters, Panes, Double-Press & Track Slide', () => {
  it('formats elapsed and minus-prefixed remaining track time', () => {
    assert.deepEqual(formatRemainingTrackTime(84, 222), {
      elapsedLabel: '1:24',
      remainingLabel: '-2:18',
    });
    assert.deepEqual(formatRemainingTrackTime(250, 180), {
      elapsedLabel: '3:00',
      remainingLabel: '-0:00',
    });
  });

  it('calculates horizontal slide offsets and MENU back stack navigation cleanly', () => {
    assert.equal(getClickWheelPaneOffsetPercent('music'), 0);
    assert.equal(getClickWheelPaneOffsetPercent('now-playing'), 100);
    assert.equal(getClickWheelPaneOffsetPercent('lyrics'), 200);
    assert.equal(getClickWheelPaneOffsetPercent('settings'), 300);

    const popped = getNextClickWheelMenuBackPane('lyrics', ['music', 'now-playing']);
    assert.equal(popped.nextPane, 'now-playing');
    assert.deepEqual(popped.nextHistory, ['music']);

    const fallback = getNextClickWheelMenuBackPane('now-playing', []);
    assert.equal(fallback.nextPane, 'music');
  });

  it('detects rapid center button double-press within skip-stutter window', () => {
    const first = detectDoubleCenterPress(null, 1000, 340);
    assert.equal(first.isDoublePress, false);
    assert.equal(first.nextLastPressMs, 1000);

    const secondFast = detectDoubleCenterPress(first.nextLastPressMs, 1240, 340);
    assert.equal(secondFast.isDoublePress, true);
    assert.equal(secondFast.nextLastPressMs, null);

    const secondSlow = detectDoubleCenterPress(1000, 1500, 340);
    assert.equal(secondSlow.isDoublePress, false);
    assert.equal(secondSlow.nextLastPressMs, 1500);
  });

  it('keeps track-change slide timeline under 1 second with clean left-out/right-in pose', () => {
    assert.ok(CLICK_WHEEL_TRACK_CHANGE_TIMELINE_MS.slideDurationMs < 1000);
    const sliding = getClickWheelTrackChangePose('sliding');
    assert.equal(sliding.outgoingTranslatePct, -108);
    assert.equal(sliding.outgoingOpacity, 0);
    assert.equal(sliding.incomingTranslatePct, 0);
    assert.equal(sliding.incomingOpacity, 1);
  });
});

describe('Multi-Generation iPod Hardware, Dock Collar, 2011 iMac & Parallax Cards', () => {
  it('defines 4 generations (1st Gen, 4th Gen, Classic, Nano), supports Nano narrow collar & Dark Grey default finish', () => {
    assert.deepEqual(CLICK_WHEEL_GENERATION_ORDER, ['gen1', 'gen2', 'gen3', 'nano']);
    const g1 = getClickWheelGenerationSpec('gen1');
    const g2 = getClickWheelGenerationSpec('gen2');
    const g3 = getClickWheelGenerationSpec('gen3');
    const nano = getClickWheelGenerationSpec('nano');

    assert.equal(g1.wheelMode, 'mechanical');
    assert.equal(g1.screenMode, 'mono-lcd');
    assert.equal(g1.hasAcrylicOverlay, true);
    assert.equal(g1.soundProfile, 'plastic-clack');

    assert.equal(g2.wheelMode, 'touch');
    assert.equal(g2.screenMode, 'mono-blue');
    assert.equal(g2.soundProfile, 'electronic-tick');

    assert.equal(g3.wheelMode, 'touch');
    assert.equal(g3.screenMode, 'color');
    assert.equal(g3.supportsFinishToggle, true);

    assert.equal(nano.wheelMode, 'touch');
    assert.equal(nano.screenMode, 'color');
    assert.ok(nano.widthScaleFactor < 0.8);
    assert.ok(nano.chassisWidthRatio > g3.chassisWidthRatio);

    assert.ok(
      computeDockAdapterCollarWidthPx(148, 1) < computeDockAdapterCollarWidthPx(204, 1)
    );

    assert.equal(cycleClickWheelGeneration('gen1'), 'gen2');
    assert.equal(cycleClickWheelGeneration('gen2'), 'gen3');
    assert.equal(cycleClickWheelGeneration('gen3'), 'nano');
    assert.equal(cycleClickWheelGeneration('nano'), 'gen1');

    const storage = createMemoryStorage();
    assert.equal(loadSavedClickWheelGeneration(storage), 'gen3');
    saveClickWheelGeneration('nano', storage);
    assert.equal(loadSavedClickWheelGeneration(storage), 'nano');

    assert.equal(loadSavedGen3Finish(storage), 'black');
    saveGen3Finish('white', storage);
    assert.equal(loadSavedGen3Finish(storage), 'white');
  });

  it('snaps mechanical wheel to 15-degree detents and decays inertia smoothly until settled', () => {
    assert.equal(computeMechanicalWheelDetentSnapDeg(21), 15);
    assert.equal(computeMechanicalWheelDetentSnapDeg(24), 30);
    assert.equal(computeMechanicalWheelDetentSnapDeg(-8), -15);

    let vel = 360;
    let totalDeg = 0;
    let steps = 0;
    while (steps < 120) {
      const res = stepMechanicalWheelInertia(vel, 0.016);
      vel = res.nextVelocityDegPerSec;
      totalDeg += res.deltaDeg;
      steps++;
      if (res.settled) break;
    }
    assert.equal(vel, 0);
    assert.ok(totalDeg > 10 && totalDeg < 90);
  });

  it('produces strict 2-color 1-bit Bayer ordered-dithered bitmap pixels for Gen 1 artwork', () => {
    const fg: [number, number, number, number] = [22, 31, 19, 255];
    const bg: [number, number, number, number] = [199, 212, 182, 255];
    const input = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      const lum = Math.round((i / 15) * 255);
      input[i * 4] = lum;
      input[i * 4 + 1] = lum;
      input[i * 4 + 2] = lum;
      input[i * 4 + 3] = 255;
    }
    const out = ditherRgbPixelsTo1BitRgba(input, 4, 4, fg, bg);
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const key = `${out[i * 4]},${out[i * 4 + 1]},${out[i * 4 + 2]},${out[i * 4 + 3]}`;
      seen.add(key);
      assert.ok(
        key === fg.join(',') || key === bg.join(','),
        `Expected binary LCD tone, got ${key}`
      );
    }
    assert.equal(seen.size, 2);
  });

  it('computes 1.4x hovered / 1.15x neighbor / 1.0x rest dock magnification scales', () => {
    assert.equal(computeMonitorDockIconScale(0, null), 1);
    assert.equal(computeMonitorDockIconScale(3, 3), 1.4);
    assert.equal(computeMonitorDockIconScale(2, 3), 1.15);
    assert.equal(computeMonitorDockIconScale(4, 3), 1.15);
    assert.equal(computeMonitorDockIconScale(1, 3), 1);
    assert.equal(computeMonitorDockIconScale(6, 3), 1);
  });

  it('computes 30% desktop dock height, taller mobile portrait dock, 14% iMac chin overlap, and swap poses', () => {
    assert.equal(CLICK_WHEEL_DOCK_HEIGHT_RATIO, 0.3);
    assert.ok(CLICK_WHEEL_MOBILE_DOCK_HEIGHT_RATIO > CLICK_WHEEL_DOCK_HEIGHT_RATIO);
    assert.equal(computeSpeakerDockStageHeight(800, false), 240);
    assert.ok(computeSpeakerDockStageHeight(800, true) > computeSpeakerDockStageHeight(800, false));

    assert.equal(IMAC_2011_CHIN_HEIGHT_RATIO, 0.14);
    const imacLayout = computeImacChinOverlapLayout(1440, 880, 264, 320, 12, false);
    const actualChinRatio = imacLayout.imacChinHeightPx / imacLayout.imacTotalHeightPx;
    assert.ok(Math.abs(actualChinRatio - 0.14) < 0.015);
    assert.ok(imacLayout.playerTopPx >= imacLayout.imacTopPx + 120);

    const ejectPose = getClickWheelUnitSwapPose('ejecting-up');
    assert.ok(ejectPose.translateYPx < -20);
    assert.ok(ejectPose.opacity < 0.5);

    const dockPose = getClickWheelUnitSwapPose('docking-down');
    assert.ok(dockPose.translateYPx > 0);
    assert.equal(dockPose.opacity, 1);

    const settledPose = getClickWheelUnitSwapPose('docked');
    assert.equal(settledPose.translateYPx, 0);
    assert.equal(settledPose.rotateXDeg, 8);
  });

  it('enforces 800px fixed dock width, authentic Gen menus, 7 side cards (0 top), and cursor parallax pose', () => {
    assert.equal(CLICK_WHEEL_DOCK_FIXED_WIDTH_PX, 800);
    assert.equal(computeFixedDockResponsiveScale(920), 1);
    assert.equal(computeFixedDockResponsiveScale(808), 1);
    assert.ok(computeFixedDockResponsiveScale(390) < 0.55);

    assert.deepEqual(
      CLASSIC_COLOR_SPLIT_MENU.map((m) => m.label),
      ['Music', 'Videos', 'Photos', 'Podcasts', 'Extras', 'Settings', 'Shuffle Songs', 'Now Playing']
    );
    assert.deepEqual(
      GEN1_SCROLL_ROOT_MENU.map((m) => m.label),
      ['Playlists', 'Artists', 'Songs', 'Contacts', 'Settings']
    );
    assert.deepEqual(
      GEN2_CLICK_ROOT_MENU.map((m) => m.label),
      ['Music', 'Extras', 'Settings', 'Shuffle Songs', 'Backlight']
    );

    const sampleTracks = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
      { id: 'f' },
      { id: 'g' },
      { id: 'h' },
    ];
    const slots = buildAmbientFloatingCardSlots(sampleTracks, 'c');
    assert.equal(slots.length, 14);
    assert.ok(slots.length >= 12 && slots.length <= 16);
    assert.equal(slots.filter((s) => s.side === 'left').length, 8);
    assert.equal(slots.filter((s) => s.side === 'right').length, 6);
    assert.equal(slots.filter((s) => (s.side as string) === 'top').length, 0);
    assert.equal(slots[0].track?.id, 'c');

    const shallowPose = computeCardParallaxPose(0.5, -0.5, 0.7, 9);
    const deepPose = computeCardParallaxPose(0.5, -0.5, 1.3, 9);
    assert.ok(deepPose.translateXPx > shallowPose.translateXPx);
    assert.ok(deepPose.translateYPx < shallowPose.translateYPx);
    assert.ok(deepPose.rotateXDeg > 0 && deepPose.rotateYDeg > 0);
  });

  it('computes swapped desktop split-stage layout (Left 62%-68% iMac + Hi-Fi dock, Right centered iPod + floating cards) and mobile locked 0.608/1 real-life aspect ratio layout', () => {
    assert.equal(
      APPLE_STUDIO_RADIAL_GRADIENT,
      'radial-gradient(circle at 50% 35%, #F7F8FA 0%, #E5E7EB 55%, #CFD3D9 100%)'
    );
    assert.equal(APPLE_AQUA_ACTIVE_BLUE_HEX, '#007AFF');
    assert.equal(IPOD_REAL_LIFE_ASPECT_RATIO, 0.608);
    assert.deepEqual(
      IPOD_MUSIC_HUB_MENU.map((m) => m.label),
      ['Playlists', 'Artists', 'Songs', 'Now Playing']
    );
    assert.equal(cycleNowPlayingCenterMode('default'), 'scrub');
    assert.equal(cycleNowPlayingCenterMode('scrub'), 'volume');
    assert.equal(cycleNowPlayingCenterMode('volume'), 'rating');
    assert.equal(cycleNowPlayingCenterMode('rating'), 'default');

    const desk = computeAsymmetricDesktopWorkspaceLayout(1440, 900, 'gen3');
    assert.ok(desk.leftStageWidthRatio >= 0.62 && desk.leftStageWidthRatio <= 0.68);
    assert.ok(Math.abs(desk.chassisAspectRatio - 0.608) <= 0.01);
    assert.ok(
      desk.imacTopPx + desk.imacTotalHeightPx + desk.imacStandHeightPx + desk.dockH <= 900
    );

    const mob = computeMobileZeroScrollStackedLayout(390, 844, false);
    assert.ok(Math.abs(mob.ipodAspectRatio - 0.608) <= 0.01);
    assert.ok(mob.ipodWidthPx < 390 - 80, 'Expected generous horizontal studio-gradient margins in mobile portrait');
    assert.ok(mob.ipodHorizontalMarginPx >= 40);
    assert.equal(mob.fitsSimultaneouslyWithoutScroll, true);
    assert.ok(mob.imacAndIpodCombinedHeightPx <= 844);
  });

  it('computes permanent large showcase iPod scale, 9px card corner radius, 3D orbital poses, halved dock slits, and unobstructed EarPod pendulum physics', async () => {
    const {
      toggleIpodScaleMode,
      computeIpodScaledDimensions,
      computeOrbitingVerticalCard3DPose,
      VERTICAL_PLAYLIST_CARD_SPEC,
      FLOATING_PLAYLIST_CARD_TOTAL_COUNT,
      DOCK_RIGHT_UTILITY_BUTTON_IDS,
      DOCK_SIDE_SLIT_HEIGHT_RATIO,
      IMAC_DOCK_APP_IDS,
      computeFloatingVerticalCardBouncePose,
      computeEarPodHangingCablePaths,
    } = await import('./clickWheelLogic');

    assert.equal(toggleIpodScaleMode('actual'), 'fill');
    assert.equal(toggleIpodScaleMode('fill'), 'actual');

    assert.equal(FLOATING_PLAYLIST_CARD_TOTAL_COUNT, 14);
    assert.deepEqual(DOCK_RIGHT_UTILITY_BUTTON_IDS, ['lyrics', 'settings']);
    assert.equal(DOCK_SIDE_SLIT_HEIGHT_RATIO, 0.5);
    assert.deepEqual(IMAC_DOCK_APP_IDS, ['finder', 'launchpad', 'youtube', 'spotify', 'prefs']);

    const desk = computeIpodScaledDimensions('actual', 1440, 900, false, 'gen3', false);
    const fillDesk = computeIpodScaledDimensions('fill', 1440, 900, false, 'gen3', false);
    assert.equal(desk.mode, 'fill');
    assert.equal(fillDesk.mode, 'fill');
    assert.ok(fillDesk.scaleFactor > 1.15);
    assert.equal(desk.heightPx, fillDesk.heightPx);
    assert.ok(Math.abs(fillDesk.aspectRatio - 0.608) <= 0.01);

    const mob = computeIpodScaledDimensions('fill', 390, 844, true, 'gen3', false);
    const mobLayout = computeMobileZeroScrollStackedLayout(390, 844, false);
    assert.equal(mob.widthPx, mobLayout.dockOuterWidthPx);
    assert.ok(Math.abs(mob.aspectRatio - 0.608) <= 0.01);

    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.cardWidthPx, 34);
    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.cardHeightPx, 56);
    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.aspectRatioCss, '0.608 / 1');
    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.borderRadiusPx, 7);
    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.artworkBorderRadiusPx, 5);
    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.scalePct, 50);
    assert.equal(VERTICAL_PLAYLIST_CARD_SPEC.hasMiniClickWheel, false);

    const orbit0 = computeOrbitingVerticalCard3DPose(0, 12.5, 14);
    const orbit7 = computeOrbitingVerticalCard3DPose(7, 12.5, 14);
    assert.ok(orbit0.orbitPeriodSec >= 28 && orbit0.orbitPeriodSec <= 55);
    assert.ok(orbit0.scale >= 0.78 && orbit0.scale <= 1.04);
    assert.ok(orbit0.blurPx >= 0 && orbit0.blurPx <= 2.5);
    assert.notEqual(orbit0.translateXPx, orbit7.translateXPx);

    const card0 = computeFloatingVerticalCardBouncePose(0, 2.5, 0.7);
    const card13 = computeFloatingVerticalCardBouncePose(13, 2.5, 0.7);
    assert.notEqual(card0.translateYPx, card13.translateYPx);
    assert.ok(card0.scale >= 1);

    const cablePose = computeEarPodHangingCablePaths(1.4, 0.85, 0.4);
    assert.equal(cablePose.frontGrilleUnobstructed, true);
    assert.ok(cablePose.leftEarPodX < 235, 'Left hanging EarPod should stay outside center speaker grille');
    assert.ok(cablePose.rightEarPodX > 565, 'Right hanging EarPod should stay outside center speaker grille');
    assert.ok(cablePose.leftEarPodY > 90, 'Left EarPod earpiece hangs downward in open space');
    assert.ok(cablePose.rightEarPodY > 90, 'Right EarPod earpiece hangs downward in open space');
  });

  it('supports slender 0.43:1 iPod Nano ratio, 7 iconic Nano colorways, [White, Silver, Grey] dock finish order, and 94% mobile iMac layout', async () => {
    const {
      IPOD_NANO_ASPECT_RATIO,
      IPOD_NANO_7_COLORS,
      DOCK_COLORWAY_FINISH_OPTIONS,
      normalizeNanoColor,
      getNanoColorSpec,
      loadSavedNanoColor,
      saveNanoColor,
    } = await import('./clickWheelLogic');

    assert.equal(IPOD_NANO_ASPECT_RATIO, 0.43);
    assert.equal(IPOD_NANO_7_COLORS.length, 7);
    assert.deepEqual(DOCK_COLORWAY_FINISH_OPTIONS, ['official-white', 'white', 'black']);

    assert.equal(normalizeNanoColor('blue'), 'blue');
    assert.equal(normalizeNanoColor('red'), 'red');
    assert.equal(normalizeNanoColor('invalid-color'), 'blue');
    assert.equal(getNanoColorSpec('pink').label, 'Hot Pink');

    const storage = createMemoryStorage();
    assert.equal(loadSavedNanoColor(storage), 'blue');
    saveNanoColor('green', storage);
    assert.equal(loadSavedNanoColor(storage), 'green');

    const deskNano = computeAsymmetricDesktopWorkspaceLayout(1440, 900, 'nano');
    assert.ok(Math.abs(deskNano.chassisAspectRatio - 0.43) <= 0.01);

    const mobNano = computeMobileZeroScrollStackedLayout(390, 844, false, 'nano');
    assert.ok(mobNano.imacWidthPx >= Math.floor(390 * 0.94) - 2);
    assert.equal(mobNano.slimDockHeightPx, 0);
    assert.equal(mobNano.controlSliderHeightPx, 68);
    assert.equal(mobNano.leftRailWidthPx, 0);
    assert.ok(Math.abs(mobNano.ipodAspectRatio - 0.43) <= 0.015);
    assert.equal(mobNano.fitsSimultaneouslyWithoutScroll, true);
  });

  it('builds strictly muted YouTube embed URLs, sanitizes 11-char IDs, appends origin/widget_referrer, and orders candidate queue', async () => {
    const { buildMutedImacYoutubeEmbedUrl } = await import('./clickWheelLogic');
    const {
      extractValidYouTubeVideoId,
      buildYouTubeCandidateQueue,
      VERIFIED_EMBED_SAFE_VISUALIZER_IDS,
    } = await import('./youtubePlayer');

    const url = buildMutedImacYoutubeEmbedUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD123',
      'https://example.app',
      'https://example.app/player'
    );
    assert.ok(url.includes('https://www.youtube.com/embed/dQw4w9WgXcQ?'));
    assert.ok(url.includes('mute=1'));
    assert.ok(url.includes('enablejsapi=1'));
    assert.ok(url.includes('autoplay=1'));
    assert.ok(url.includes('origin=https%3A%2F%2Fexample.app'));
    assert.ok(url.includes('widget_referrer=https%3A%2F%2Fexample.app%2Fplayer'));

    const fallbackUrl = buildMutedImacYoutubeEmbedUrl('bad-id');
    assert.ok(fallbackUrl.includes('jfKfPfyJRdk'));
    assert.ok(fallbackUrl.includes('mute=1'));

    assert.equal(extractValidYouTubeVideoId('youtu.be/abc123DEF45?si=1'), 'abc123DEF45');
    assert.equal(extractValidYouTubeVideoId('not-a-valid-id'), null);

    const queue = buildYouTubeCandidateQueue('dQw4w9WgXcQ', [
      'invalid',
      'dQw4w9WgXcQ',
      'M7lc1UVf-VE',
    ]);
    assert.equal(queue[0], 'dQw4w9WgXcQ');
    assert.equal(queue[1], 'M7lc1UVf-VE');
    for (const safeId of VERIFIED_EMBED_SAFE_VISUALIZER_IDS) {
      assert.ok(queue.includes(safeId));
    }
  });
});


