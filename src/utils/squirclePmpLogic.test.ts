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
  SQUIRCLE_EDITORIAL_MASK_GRADIENT,
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

test('computeSquircleStageLayout docks Zune + external rounded video display left below header across Desktop & Mobile viewports', async () => {
  const { ZUNE_OS_PORTRAIT_MENU_ITEMS } = await import('./squirclePmpLogic');
  assert.deepEqual(
    ZUNE_OS_PORTRAIT_MENU_ITEMS.map((item) => item.label),
    ['music', 'videos', 'pictures', 'radio', 'community', 'settings']
  );
  assert.match(
    SQUIRCLE_EDITORIAL_MASK_GRADIENT,
    /linear-gradient\(to right, transparent 0%, rgba\(0, 0, 0, 0\.1\) 18%, rgba\(0, 0, 0, 0\.88\) 36%, #000000 46%\)/
  );

  const desk = computeSquircleStageLayout(1280, 800, false);
  assert.ok(desk.leftPx >= 16 && desk.leftPx <= 32);
  assert.ok(desk.topOffsetPx >= 60);
  assert.ok(desk.editorialPaddingLeftPx > desk.leftPx + 100);
  assert.ok(Math.abs(desk.chassisW / desk.chassisH - 9.6 / 16.4) < 0.02);
  assert.equal(desk.videoScreenW, desk.chassisW);
  assert.ok(desk.videoScreenH >= 74);

  const mob = computeSquircleStageLayout(390, 844, true);
  assert.ok(mob.topOffsetPx >= 54);
  assert.ok(mob.leftPx >= 10);
  assert.ok(mob.editorialPaddingLeftPx > mob.leftPx + 80);
  assert.equal(mob.videoScreenW, mob.chassisW);
  assert.ok(mob.videoScreenH >= 80);

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

