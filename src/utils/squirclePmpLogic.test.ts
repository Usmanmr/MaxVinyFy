import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SQUIRCLE_PMP_THEME,
  THEME_REGISTRY,
  getThemeById,
} from '../themes/themeRegistry';
import {
  SQUIRCLE_PMP_PANE_ORDER,
  SQUIRCLE_TRACK_CHANGE_TIMELINE_MS,
  stepSquirclePaneIndex,
  getSquirclePaneTranslatePct,
  groupPlaylistTracksByArtist,
  formatSquircleOversizedTime,
  calculateSquircleVolumeStep,
  getSquircleBackNavigationTarget,
  calculateSquircleHolderRestTiltDeg,
  getSquircleTrackChangePose,
  SQUIRCLE_HOME_MENU_ITEMS,
  computeKineticListItemFade,
  computeSquircleStageLayout,
  resolveSquircleVideoPlaybackState,
} from './squirclePmpLogic';
import type { TrackItem } from './playerLogic';

test('THEME_REGISTRY exposes Squircle PMP with soft-touch brown-olive palette and zero trademarks', () => {
  const found = THEME_REGISTRY.find((t) => t.id === 'squircle-pmp');
  assert.ok(found);
  assert.equal(found.name, 'Squircle PMP');
  assert.equal(found.swatch.cabinetHex, '#4A3A2E');
  assert.equal(found.swatch.primaryHex, '#55503C');
  assert.equal(found.swatch.accentHex, '#E6007E');
  assert.equal(getThemeById('squircle-pmp').id, SQUIRCLE_PMP_THEME.id);

  const combinedText = `${found.name} ${found.description}`.toLowerCase();
  assert.equal(/\bzune\b/.test(combinedText), false);
  assert.equal(/\bmicrosoft\b/.test(combinedText), false);
});

test('Squircle PMP twist section stepping and translate offsets stay within 4 panes', () => {
  assert.deepEqual(SQUIRCLE_PMP_PANE_ORDER, ['music', 'now-playing', 'lyrics', 'settings']);
  assert.equal(stepSquirclePaneIndex('music', 'prev'), 'music');
  assert.equal(stepSquirclePaneIndex('music', 'next'), 'now-playing');
  assert.equal(stepSquirclePaneIndex('lyrics', 'next'), 'settings');
  assert.equal(stepSquirclePaneIndex('settings', 'next'), 'settings');

  assert.equal(getSquirclePaneTranslatePct('music'), 0);
  assert.equal(getSquirclePaneTranslatePct('now-playing'), 100);
  assert.equal(getSquirclePaneTranslatePct('lyrics'), 200);
  assert.equal(getSquirclePaneTranslatePct('settings'), 300);
});

test('groupPlaylistTracksByArtist groups tracks under lowercase artist headers cleanly', () => {
  const sampleTracks: TrackItem[] = [
    {
      id: 't1',
      title: 'Track One',
      artist: 'Neon Drift',
      album: 'A',
      durationSec: 180,
      bpm: 110,
      year: 2008,
      artworkUrl: '',
      youtubeVideoId: '',
      synthPreset: 'midnight-synth',
      tvFrames: [],
    },
    {
      id: 't2',
      title: 'Track Two',
      artist: 'Brown Olive',
      album: 'B',
      durationSec: 200,
      bpm: 120,
      year: 2009,
      artworkUrl: '',
      youtubeVideoId: '',
      synthPreset: 'classic-funk',
      tvFrames: [],
    },
    {
      id: 't3',
      title: 'Track Three',
      artist: 'neon drift',
      album: 'A',
      durationSec: 165,
      bpm: 105,
      year: 2008,
      artworkUrl: '',
      youtubeVideoId: '',
      synthPreset: 'velvet-soul',
      tvFrames: [],
    },
  ];

  const grouped = groupPlaylistTracksByArtist(sampleTracks);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].artistDisplayLowercase, 'neon drift');
  assert.equal(grouped[0].tracks.length, 2);
  assert.equal(grouped[1].artistDisplayLowercase, 'brown olive');
  assert.equal(grouped[1].tracks.length, 1);
});

test('Oversized timer formatting, D-pad volume step, and circular back navigation work deterministically', () => {
  assert.deepEqual(formatSquircleOversizedTime(84, 214), { elapsed: '1:24', total: '3:34' });
  assert.deepEqual(formatSquircleOversizedTime(999, 120), { elapsed: '2:00', total: '2:00' });

  assert.equal(calculateSquircleVolumeStep(0.8, 'up', 0.1), 0.9);
  assert.equal(calculateSquircleVolumeStep(0.96, 'up', 0.1), 1);
  assert.equal(calculateSquircleVolumeStep(0.04, 'down', 0.1), 0);

  const back1 = getSquircleBackNavigationTarget('lyrics', ['music', 'now-playing']);
  assert.equal(back1.nextPane, 'now-playing');
  assert.deepEqual(back1.nextHistory, ['music']);

  const backFallback = getSquircleBackNavigationTarget('now-playing', []);
  assert.equal(backFallback.nextPane, 'music');
});

test('Matte holder box settles into non-zero tilt and track-change animation stays under 1 second', () => {
  assert.ok(SQUIRCLE_TRACK_CHANGE_TIMELINE_MS.totalMs < 1000);
  const enteringPose = getSquircleTrackChangePose('entering');
  const settledPose = getSquircleTrackChangePose('idle');
  assert.ok(enteringPose.titleTranslateYPx < 0);
  assert.equal(settledPose.titleTranslateYPx, 0);
  assert.equal(settledPose.titleOpacity, 1);

  const restRight = calculateSquircleHolderRestTiltDeg(24, 5);
  const restLeft = calculateSquircleHolderRestTiltDeg(-18, -4);
  const restDefault = calculateSquircleHolderRestTiltDeg(0, 0);
  assert.ok(restRight >= 2.5 && restRight <= 5.5);
  assert.ok(restLeft <= -2.5 && restLeft >= -5.5);
  assert.notEqual(restDefault, 0);
});

test('SQUIRCLE_HOME_MENU_ITEMS and computeKineticListItemFade model the lowercase menu and contextual edge fading', () => {
  assert.deepEqual(
    SQUIRCLE_HOME_MENU_ITEMS.map((item) => item.label),
    ['music', 'videos', 'pictures', 'social', 'radio', 'marketplace', 'settings']
  );

  const activeFade = computeKineticListItemFade(0, 0, 7);
  const nearFade = computeKineticListItemFade(1, 0, 7);
  const farFade = computeKineticListItemFade(6, 0, 7);

  assert.equal(activeFade.opacity, 1);
  assert.ok(nearFade.opacity < activeFade.opacity);
  assert.ok(farFade.opacity < nearFade.opacity);
  assert.ok(farFade.opacity >= 0.42);
});

test('computeSquircleStageLayout and Zune OS playlist helpers enforce Desktop/Landscape split-stage and Mobile Portrait native LCD list', async () => {
  const {
    ZUNE_OS_PORTRAIT_MENU_ITEMS,
    ZUNE_CHASSIS_ASPECT_RATIO,
    SQUIRCLE_UNDER_VIDEO_SCROLL_MASK_GRADIENT,
    getZuneDpadTiltTransform,
    getZuneOsScreenTranslatePct,
    getZuneOsBackTarget,
    stepZuneListFocusIndex,
    computeZuneScrollIndicatorMetrics,
  } = await import('./squirclePmpLogic');

  assert.deepEqual(
    ZUNE_OS_PORTRAIT_MENU_ITEMS.map((item) => item.label),
    ['music', 'videos', 'pictures', 'radio', 'community', 'settings']
  );
  assert.equal(ZUNE_CHASSIS_ASPECT_RATIO, 0.545);
  assert.match(
    SQUIRCLE_UNDER_VIDEO_SCROLL_MASK_GRADIENT,
    /linear-gradient\(to bottom, transparent 0px, rgba\(0, 0, 0, 0\.4\) 18px, #000000 44px, #000000 100%\)/
  );

  // Tactile 1.5deg D-pad tilt & center button depression physics
  assert.match(getZuneDpadTiltTransform('up').ringTransform, /rotateX\(1\.5deg\)/);
  assert.match(getZuneDpadTiltTransform('down').ringTransform, /rotateX\(-1\.5deg\)/);
  assert.match(getZuneDpadTiltTransform('left').ringTransform, /rotateY\(-1\.5deg\)/);
  assert.match(getZuneDpadTiltTransform('right').ringTransform, /rotateY\(1\.5deg\)/);
  assert.equal(getZuneDpadTiltTransform('center').centerTransform, 'scale(0.97)');
  assert.equal(getZuneDpadTiltTransform(null).centerTransform, 'scale(1)');

  // Authentic Zune OS 5-screen slider & Back button hierarchy
  assert.equal(getZuneOsScreenTranslatePct('home'), 0);
  assert.equal(getZuneOsScreenTranslatePct('playlist'), 100);
  assert.equal(getZuneOsScreenTranslatePct('now-playing'), 200);
  assert.equal(getZuneOsBackTarget('lyrics'), 'now-playing');
  assert.equal(getZuneOsBackTarget('now-playing'), 'playlist');
  assert.equal(getZuneOsBackTarget('playlist'), 'home');

  // D-pad up/down list focus & scroll indicator
  assert.equal(stepZuneListFocusIndex(0, 8, 'up'), 0);
  assert.equal(stepZuneListFocusIndex(0, 8, 'down'), 1);
  assert.equal(stepZuneListFocusIndex(7, 8, 'down'), 7);
  const hiddenScroll = computeZuneScrollIndicatorMetrics(0, 180, 200);
  assert.equal(hiddenScroll.visible, false);
  const activeScroll = computeZuneScrollIndicatorMetrics(150, 500, 200);
  assert.equal(activeScroll.visible, true);
  assert.equal(activeScroll.thumbHeightPct, 40);
  assert.equal(activeScroll.thumbTopPct, 30);

  // Desktop split-stage: reclaimed top clearance 20px, right clearance 44px, fit-to-height 0.545:1 Zune, 560px max video
  const desk = computeSquircleStageLayout(1280, 800, false, false);
  assert.equal(desk.isExternalPlaylistVisible, true);
  assert.equal(desk.topClearancePx, 20);
  assert.equal(desk.rightClearancePx, 44);
  assert.equal(desk.chassisH, 760);
  assert.ok(Math.abs(desk.chassisW / desk.chassisH - 0.545) < 0.01);
  assert.ok(desk.videoMaxWidthPx <= 560);

  // Mobile landscape split-stage: reclaimed top clearance 12px, right clearance 42px, fit-to-height (100dvh - 24px), non-clipping max-width <= 36vw
  const mobLand = computeSquircleStageLayout(844, 390, false, true);
  assert.equal(mobLand.isExternalPlaylistVisible, true);
  assert.equal(mobLand.topClearancePx, 12);
  assert.equal(mobLand.rightClearancePx, 42);
  assert.equal(mobLand.chassisH, 366);
  assert.ok(mobLand.chassisW <= Math.round(844 * 0.36));
  assert.ok(Math.abs(mobLand.chassisW / mobLand.chassisH - 0.545) < 0.01);
  assert.ok(mobLand.videoMaxHeightPx <= Math.round(390 * 0.46));

  // Mobile portrait: behind-Zune right-fading editorial playlist visible, right-anchored Zune at 0.545:1 <= 54vw, top 16:9 video <= 29dvh
  const mobPort = computeSquircleStageLayout(390, 844, true, false);
  assert.equal(mobPort.isExternalPlaylistVisible, true);
  assert.equal(mobPort.topClearancePx, 8);
  assert.ok(mobPort.chassisW <= Math.round(390 * 0.54));
  assert.ok(mobPort.chassisH <= 460);
  assert.ok(Math.abs(mobPort.chassisW / mobPort.chassisH - 0.545) < 0.01);
  assert.ok(mobPort.videoMaxHeightPx > 80 && mobPort.videoMaxHeightPx <= Math.round(844 * 0.29));

  const { buildZuneYoutubeScreenGrabCandidates } = await import('./squirclePmpLogic');
  const grabs = buildZuneYoutubeScreenGrabCandidates('dQw4w9WgXcQ');
  assert.equal(grabs.length, 6);
  assert.ok(grabs[0].endsWith('/dQw4w9WgXcQ/hq1.jpg'));
  assert.ok(grabs.includes('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'));
  assert.deepEqual(buildZuneYoutubeScreenGrabCandidates('invalid'), []);

  const playingVideo = resolveSquircleVideoPlaybackState({
    activeVideoId: 'dQw4w9WgXcQ',
    iframeUnavailable: false,
    isStandby: false,
    viewMode: 'video',
  });
  assert.equal(playingVideo.showVideoIframe, true);
  assert.equal(playingVideo.showAnimatedFramesFallback, false);

  const failedVideo = resolveSquircleVideoPlaybackState({
    activeVideoId: 'dQw4w9WgXcQ',
    iframeUnavailable: true,
    isStandby: false,
    viewMode: 'video',
  });
  assert.equal(failedVideo.showVideoIframe, false);
  assert.equal(failedVideo.showAnimatedFramesFallback, true);

  const artMode = resolveSquircleVideoPlaybackState({
    activeVideoId: 'dQw4w9WgXcQ',
    iframeUnavailable: false,
    isStandby: false,
    viewMode: 'artwork',
  });
  assert.equal(artMode.showVideoIframe, false);
  assert.equal(artMode.showAnimatedFramesFallback, true);
});

test('Zune 5-colorway gesture engine cycles smoothly, persists selection, and validates horizontal swipe thresholds', async () => {
  const {
    ZUNE_COLORWAY_ORDER,
    ZUNE_30_COLORWAYS,
    ZUNE_MOBILE_EDITORIAL_RIGHT_MASK,
    normalizeZuneColorway,
    loadSavedZuneColorway,
    saveZuneColorway,
    stepZuneColorway,
    evaluateZuneColorSwipeGesture,
  } = await import('./squirclePmpLogic');

  assert.deepEqual(ZUNE_COLORWAY_ORDER, [
    'chocolate',
    'matte-black',
    'pearl-white',
    'crimson-red',
    'zune-pink',
  ]);
  for (const id of ZUNE_COLORWAY_ORDER) {
    assert.ok(ZUNE_30_COLORWAYS[id].outerShellBg);
    assert.ok(ZUNE_30_COLORWAYS[id].coreBg);
    assert.ok(ZUNE_30_COLORWAYS[id].keyholeMidHex);
    assert.ok(ZUNE_30_COLORWAYS[id].circleBtnBg);
  }

  assert.equal(stepZuneColorway('chocolate', 'next'), 'matte-black');
  assert.equal(stepZuneColorway('zune-pink', 'next'), 'chocolate');
  assert.equal(stepZuneColorway('chocolate', 'prev'), 'zune-pink');
  assert.equal(normalizeZuneColorway('crimson-red'), 'crimson-red');
  assert.equal(normalizeZuneColorway('bogus'), 'chocolate');

  const mem = new Map<string, string>();
  const mockStorage = {
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
  } as Storage;

  assert.equal(loadSavedZuneColorway(mockStorage), 'chocolate');
  saveZuneColorway('zune-pink', mockStorage);
  assert.equal(loadSavedZuneColorway(mockStorage), 'zune-pink');

  // Horizontal swipe gesture evaluation: |dx| >= 36 && |dx| > |dy| * 1.4
  assert.equal(evaluateZuneColorSwipeGesture(-42, 8), 'next');
  assert.equal(evaluateZuneColorSwipeGesture(48, -10), 'prev');
  assert.equal(evaluateZuneColorSwipeGesture(28, 0), null);
  assert.equal(evaluateZuneColorSwipeGesture(40, 35), null);

  assert.match(ZUNE_MOBILE_EDITORIAL_RIGHT_MASK, /linear-gradient\(to right, #000000 0%, #000000 48%, rgba\(0, 0, 0, 0\.45\) 68%, rgba\(0, 0, 0, 0\.08\) 92%\)/);
});

test('Zune 30 Now Playing helpers compute 0-20 volume steps, padded track readouts, Twist back toggles, and favorites persistence', async () => {
  const {
    volumeToZuneStepCount,
    formatZuneTrackIndexReadout,
    getZuneLeftButtonTarget,
    loadSavedZuneFavorites,
    toggleZuneFavoriteTrackId,
  } = await import('./squirclePmpLogic');

  assert.equal(volumeToZuneStepCount(0), 0);
  assert.equal(volumeToZuneStepCount(0.5), 10);
  assert.equal(volumeToZuneStepCount(1), 20);
  assert.equal(volumeToZuneStepCount(1.4), 20);

  assert.equal(formatZuneTrackIndexReadout(2, 14), '03 / 14');
  assert.equal(formatZuneTrackIndexReadout(0, 0), '00 / 00');

  assert.equal(getZuneLeftButtonTarget('now-playing', false), 'home');
  assert.equal(getZuneLeftButtonTarget('home', false), 'now-playing');
  assert.equal(getZuneLeftButtonTarget('home', true), 'playlist');
  assert.equal(getZuneLeftButtonTarget('lyrics', false), 'now-playing');
  assert.equal(getZuneLeftButtonTarget('playlist', false), 'home');

  const mem = new Map<string, string>();
  const mockStorage = {
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
  } as Storage;

  assert.deepEqual(loadSavedZuneFavorites(mockStorage), []);
  const added = toggleZuneFavoriteTrackId([], 'tr-1', mockStorage);
  assert.deepEqual(added, ['tr-1']);
  assert.deepEqual(loadSavedZuneFavorites(mockStorage), ['tr-1']);
  const removed = toggleZuneFavoriteTrackId(added, 'tr-1', mockStorage);
  assert.deepEqual(removed, []);
});

