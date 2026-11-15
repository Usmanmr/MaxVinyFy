import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  clampSeekTime,
  getNextTrackIndex,
  getShuffledNextTrackIndex,
  findTrackIndexById,
  resolveTrackById,
  getNextTrackId,
  getPreviousTrackIdAction,
  getUpNextQueueById,
  calculateTonearmTracking,
  verticalSliderToPitch,
  calculatePitchThumbTopPercent,
  parseLrcLyrics,
  buildSyncedLyricsForTrack,
  getActiveLyricIndex,
  getPreviousAction,
  getUpNextQueue,
  calculatePlaybackRate,
  selectActiveTvFrame,
  parseSpotifyInput,
  stepVuMeterPhysics,
  computeDominantAccentFromRgbSamples,
  getTvChannelTheme,
  getNextTvChannelIndex,
  calculateSeekTimeFromTonearmAngle,
  shouldEnableLowPowerByHardware,
  shouldRunActiveAnimationLoops,
  quantizeTvFrameTime,
  calculateVinylSpinTiming,
  classifyViewportLayout,
  triggerScratchHaptic,
  TONEARM_REST_ANGLE_DEG,
  getTonearmShadowPose,
  EMPTY_STANDBY_TRACK,
  TV_CHANNEL_CHANGE_MS,
  getTvVolumeKnobAngle,
  getNextSteppedVolume,
  buildCleanYouTubeEmbedUrl,
  buildLrclibGetUrl,
  parsePlainLyrics,
  containsNonLatinScript,
  lyricsContainNonLatinScript,
  alignConvertedLyricLines,
  calculateNextLyricTimeoutMs,
  calculateCenteredLyricTranslateY,
  stepLyricFontSize,
  getLyricFontSizeClasses,
  stepCrossfadeSeconds,
  getCrossfadeKnobAngle,
  shouldTriggerTrackCrossfade,
  getSpeedKnobAngle,
  getPitchKnobAngle,
  stepPitchKnobDetent,
  getEffectsKnobAngle,
  getBinaryKnobAngle,
  triggerButtonHaptic,
  getOrderedTrackArtworkUrls,
  resolveActiveArtworkState,
  ALBUM_ART_SPINDLE_SNAP_RADIUS_PX,
  isAlbumArtSyncedToSpindle,
  clampAlbumArtDragOffset,
  CRT_TINT_PRESETS,
  getNextCrtTintIndex,
  getCrtTintKnobAngle,
  clampHolderBoxDragOffset,
  TRACK_CHANGE_TIMELINE_MS,
  getTrackChangeStagePose,
  removePlaylistById,
  type TrackItem,
  type PlaylistPack,
} from './playerLogic';

const sampleTracks: TrackItem[] = [
  {
    id: 't1',
    title: 'Pacific Coast Overdrive',
    artist: 'The Midnight Cruisers',
    album: 'Twilight Drive',
    durationSec: 200,
    bpm: 110,
    year: 1984,
    artworkUrl: '/test1.jpg',
    youtubeVideoId: 'MV_3Dpw-BRY',
    synthPreset: 'midnight-synth',
    tvFrames: [
      { id: 'f1', label: 'CH 03 · Intro', timestampSec: 0, timestampLabel: '00:15', imageUrl: '/f1.jpg', caption: 'Opening highway shot' },
      { id: 'f2', label: 'CH 03 · Chorus', timestampSec: 60, timestampLabel: '01:05', imageUrl: '/f2.jpg', caption: 'Tunnel neon dash' },
      { id: 'f3', label: 'CH 03 · Solo', timestampSec: 120, timestampLabel: '02:10', imageUrl: '/f3.jpg', caption: 'Synth solo broadcast' },
      { id: 'f4', label: 'CH 03 · Outro', timestampSec: 160, timestampLabel: '02:55', imageUrl: '/f4.jpg', caption: 'Coastline horizon' },
    ],
  },
  {
    id: 't2',
    title: ' Brass & Velvet Groove',
    artist: 'Soul City Express',
    album: 'Studio B Sessions',
    durationSec: 185,
    bpm: 98,
    year: 1976,
    artworkUrl: '/test2.jpg',
    youtubeVideoId: '4NRXx6U8ABQ',
    synthPreset: 'velvet-soul',
    tvFrames: [],
  },
  {
    id: 't3',
    title: 'Malibu Sunset FM',
    artist: 'Coastline Yacht Club',
    album: 'Golden Hour 79',
    durationSec: 215,
    bpm: 104,
    year: 1979,
    artworkUrl: '/test3.jpg',
    youtubeVideoId: 'fNFzfwLM72c',
    synthPreset: 'pacific-yacht',
    tvFrames: [],
  },
];

test('formatDuration formats seconds into MM:SS accurately', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(215.8), '03:35');
  assert.equal(formatDuration(-10), '00:00');
});

test('clampSeekTime constrains arbitrary scrubbing to track bounds', () => {
  assert.equal(clampSeekTime(45, 200), 45);
  assert.equal(clampSeekTime(-12, 200), 0);
  assert.equal(clampSeekTime(350, 200), 200);
});

test('getNextTrackIndex advances and wraps around playlist', () => {
  assert.equal(getNextTrackIndex(0, 3, false), 1);
  assert.equal(getNextTrackIndex(2, 3, false), 0);
  assert.equal(getNextTrackIndex(1, 3, true), 1);
});

test('getShuffledNextTrackIndex picks a distinct track index in playlist', () => {
  const next = getShuffledNextTrackIndex(1, 5, 0.5);
  assert.notEqual(next, 1);
  assert.ok(next >= 0 && next < 5);
});

test('calculateTonearmTracking moves turntable head across vinyl grooves by song duration', () => {
  const atStart = calculateTonearmTracking(0, 200);
  assert.equal(atStart.progressRatio, 0);
  assert.equal(atStart.tonearmAngleDeg, 6);
  assert.equal(atStart.grooveRadiusPercent, 46);

  const atMid = calculateTonearmTracking(100, 200);
  assert.equal(atMid.progressRatio, 0.5);
  assert.equal(atMid.tonearmAngleDeg, 15.5);
  assert.equal(atMid.grooveRadiusPercent, 33.5);

  const atEnd = calculateTonearmTracking(200, 200);
  assert.equal(atEnd.progressRatio, 1);
  assert.equal(atEnd.tonearmAngleDeg, 25);
  assert.equal(atEnd.grooveRadiusPercent, 21);
});

test('verticalSliderToPitch and calculatePitchThumbTopPercent increase pitch when moved UP and decrease when moved DOWN', () => {
  assert.equal(verticalSliderToPitch(-8), 8);
  assert.equal(verticalSliderToPitch(6), -6);
  assert.equal(calculatePitchThumbTopPercent(12), 8);
  assert.equal(calculatePitchThumbTopPercent(0), 50);
  assert.equal(calculatePitchThumbTopPercent(-12), 92);
});

test('parseLrcLyrics and getActiveLyricIndex synchronize song verses with playback time', () => {
  const sampleLrc = `[00:05.00] First line of the song\n[00:15.50] Second verse singing now\n[00:30.00] Chorus hits hard`;
  const parsed = parseLrcLyrics(sampleLrc, 120);
  assert.equal(parsed.length, 3);
  assert.equal(getActiveLyricIndex(parsed, 2), 0);
  assert.equal(getActiveLyricIndex(parsed, 18), 1);
  assert.equal(getActiveLyricIndex(parsed, 45), 2);

  const fallbackVerses = buildSyncedLyricsForTrack({ title: 'Dhurandhar', artist: 'Hanumankind', durationSec: 120 }, null);
  assert.ok(fallbackVerses.length >= 8);
  assert.equal(getActiveLyricIndex(fallbackVerses, 65), Math.floor(65 / (120 / fallbackVerses.length)));
});

test('getPreviousAction restarts track when past 3s or jumps back when forced or early', () => {
  assert.deepEqual(getPreviousAction(1, 3, 12, false), { action: 'restart', targetIndex: 1 });
  assert.deepEqual(getPreviousAction(1, 3, 12, true), { action: 'previous', targetIndex: 0 });
  assert.deepEqual(getPreviousAction(0, 3, 1.5, false), { action: 'previous', targetIndex: 2 });
});

test('getUpNextQueue returns ordered upcoming tracks wrapping around playlist', () => {
  const queueFromSecond = getUpNextQueue(sampleTracks, 1);
  assert.equal(queueFromSecond.length, 2);
  assert.equal(queueFromSecond[0].track.id, 't3');
  assert.equal(queueFromSecond[0].originalIndex, 2);
  assert.equal(queueFromSecond[1].track.id, 't1');
  assert.equal(queueFromSecond[1].originalIndex, 0);
});

test('calculatePlaybackRate computes accurate turntable speed for 33/45 RPM and pitch fader', () => {
  assert.equal(calculatePlaybackRate(33, 0), 1);
  assert.equal(calculatePlaybackRate(33, 8), 1.08);
  assert.equal(calculatePlaybackRate(45, 0), 1.35);
});

test('selectActiveTvFrame synchronizes YouTube screen grabs with song progress or manual channel', () => {
  const autoStart = selectActiveTvFrame(sampleTracks[0], 10, null);
  assert.equal(autoStart.frameIndex, 0);
  assert.equal(autoStart.frame.id, 'f1');

  const autoMid = selectActiveTvFrame(sampleTracks[0], 110, null);
  assert.equal(autoMid.frameIndex, 2);
  assert.equal(autoMid.frame.id, 'f3');

  const manualPick = selectActiveTvFrame(sampleTracks[0], 10, 3);
  assert.equal(manualPick.frameIndex, 3);
  assert.equal(manualPick.frame.id, 'f4');
});

test('parseSpotifyInput parses Spotify playlist and track URLs and URIs', () => {
  assert.deepEqual(
    parseSpotifyInput('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123'),
    { type: 'playlist', id: '37i9dQZF1DXcBWIGoYBM5M' }
  );
  assert.deepEqual(
    parseSpotifyInput('spotify:track:4cOdK2wGLETKBW3PvgPWqT'),
    { type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' }
  );
  assert.deepEqual(parseSpotifyInput('not-a-url'), { type: 'invalid', id: '' });
});

test('stepVuMeterPhysics decays smoothly with physics momentum and bounce instead of snapping', () => {
  let state = { level: 0.9, velocity: 0, peakHold: 0.9, peakVelocity: 0 };
  const afterOneFrame = stepVuMeterPhysics(state, 0.2, 0.016);
  assert.ok(afterOneFrame.level > 0.7 && afterOneFrame.level < 0.9);
  assert.ok(afterOneFrame.velocity < 0);

  let minReached = 1;
  for (let i = 0; i < 45; i++) {
    state = stepVuMeterPhysics(state, 0.25, 0.016);
    if (state.level < minReached) minReached = state.level;
  }
  assert.ok(minReached < 0.25, `Expected slight bounce dip below 0.25, got ${minReached}`);
  assert.ok(Math.abs(state.level - 0.25) < 0.05);
  assert.ok(state.peakHold >= state.level);
});

test('computeDominantAccentFromRgbSamples extracts vibrant dominant color palette for UI, VU meter, and TV cabinet', () => {
  const cyanCoverSamples: Array<[number, number, number]> = [
    [12, 185, 225],
    [18, 195, 235],
    [15, 175, 215],
    [10, 10, 12],
    [250, 252, 255],
  ];
  const palette = computeDominantAccentFromRgbSamples(cyanCoverSamples, 'dhurandhar');
  assert.ok(palette.hue >= 180 && palette.hue <= 210, `Expected cyan hue, got ${palette.hue}`);
  assert.match(palette.primaryHex, /^#[0-9a-f]{6}$/i);
  assert.match(palette.vuMidHex, /^#[0-9a-f]{6}$/i);
  assert.ok(palette.tvCabinetGradient.includes('linear-gradient'));
});

test('getTvChannelTheme and getNextTvChannelIndex cycle through 5 YouTube visual theme channels', () => {
  const ch0 = getTvChannelTheme(0);
  assert.equal(ch0.code, 'CH 01');
  assert.equal(ch0.videoSource, 'primary');

  const ch2 = getTvChannelTheme(2);
  assert.equal(ch2.code, 'CH 03');
  assert.ok(ch2.filterCss.includes('sepia'));

  assert.equal(getNextTvChannelIndex(0), 1);
  assert.equal(getNextTvChannelIndex(4), 0);
});

test('calculateSeekTimeFromTonearmAngle maps dragged playing head angle to exact song timestamp', () => {
  const startDrag = calculateSeekTimeFromTonearmAngle(6, 200);
  assert.equal(startDrag.targetTimeSec, 0);
  assert.equal(startDrag.grooveRadiusPercent, 46);

  const midDrag = calculateSeekTimeFromTonearmAngle(15.5, 200);
  assert.equal(midDrag.targetTimeSec, 100);
  assert.equal(midDrag.progressRatio, 0.5);

  const endDrag = calculateSeekTimeFromTonearmAngle(25, 200);
  assert.equal(endDrag.targetTimeSec, 200);
  assert.equal(endDrag.grooveRadiusPercent, 21);

  const standbyDrag = calculateSeekTimeFromTonearmAngle(18, EMPTY_STANDBY_TRACK.durationSec);
  assert.equal(standbyDrag.targetTimeSec, 0);
});

test('shouldEnableLowPowerByHardware auto-enables Low Power Mode when hardwareConcurrency <= 4', () => {
  assert.equal(shouldEnableLowPowerByHardware(2), true);
  assert.equal(shouldEnableLowPowerByHardware(4), true);
  assert.equal(shouldEnableLowPowerByHardware(8), false);
  assert.equal(shouldEnableLowPowerByHardware(undefined), false);
});

test('shouldRunActiveAnimationLoops pauses completely when paused, hidden, reduced motion, or low power', () => {
  assert.equal(shouldRunActiveAnimationLoops(true, false, false, false), true);
  assert.equal(shouldRunActiveAnimationLoops(false, false, false, false), false);
  assert.equal(shouldRunActiveAnimationLoops(true, true, false, false), false);
  assert.equal(shouldRunActiveAnimationLoops(true, false, true, false), false);
  assert.equal(shouldRunActiveAnimationLoops(true, false, false, true), false);
});

test('quantizeTvFrameTime and calculateVinylSpinTiming enforce 5s TV buckets and 12fps spin in Low Power Mode', () => {
  assert.equal(quantizeTvFrameTime(0, 5), 0);
  assert.equal(quantizeTvFrameTime(4.9, 5), 0);
  assert.equal(quantizeTvFrameTime(5.1, 5), 5);
  assert.equal(quantizeTvFrameTime(14.8, 5), 10);

  assert.equal(calculateVinylSpinTiming(1.8, false), 'linear');
  assert.equal(calculateVinylSpinTiming(1.8, true), 'steps(22, end)');
});

test('classifyViewportLayout accurately routes mobile-landscape, mobile-portrait, and desktop-tablet viewports', () => {
  assert.equal(classifyViewportLayout(844, 390), 'mobile-landscape');
  assert.equal(classifyViewportLayout(667, 375), 'mobile-landscape');
  assert.equal(classifyViewportLayout(390, 844), 'mobile-portrait');
  assert.equal(classifyViewportLayout(412, 915), 'mobile-portrait');
  assert.equal(classifyViewportLayout(1024, 600), 'desktop-tablet');
  assert.equal(classifyViewportLayout(1440, 900), 'desktop-tablet');
});

test('triggerScratchHaptic fires navigator.vibrate patterns when Low Power Mode is off and suppresses when on', () => {
  const calls: Array<number | number[]> = [];
  const mockVibrate = (p: number | number[]) => {
    calls.push(p);
    return true;
  };

  assert.equal(triggerScratchHaptic(true, 'classic', mockVibrate), false);
  assert.equal(calls.length, 0);

  assert.equal(triggerScratchHaptic(false, 'light', mockVibrate), true);
  assert.equal(triggerScratchHaptic(false, 'classic', mockVibrate), true);
  assert.equal(triggerScratchHaptic(false, 'backspin', mockVibrate), true);
  assert.deepEqual(calls, [10, 22, [18, 16, 26]]);
});

test('getTonearmShadowPose increases shadow offset and fades slightly when lifted vs resting or playing', () => {
  assert.equal(TONEARM_REST_ANGLE_DEG < 0, true);
  const restPose = getTonearmShadowPose('rest');
  const liftPose = getTonearmShadowPose('lifting-to-play');
  const swingPose = getTonearmShadowPose('swinging-to-groove');
  const dropPose = getTonearmShadowPose('dropping-to-groove');
  const playPose = getTonearmShadowPose('playing');

  assert.ok(liftPose.offsetXpx > playPose.offsetXpx);
  assert.ok(liftPose.offsetYpx > playPose.offsetYpx);
  assert.ok(liftPose.opacity < playPose.opacity);
  assert.ok(swingPose.armScale > restPose.armScale);
  assert.deepEqual(dropPose, playPose);
  assert.deepEqual(restPose, playPose);
});

test('getTvVolumeKnobAngle, getNextSteppedVolume, and buildCleanYouTubeEmbedUrl enforce TV hardware behavior and clean iframe params', () => {
  assert.equal(TV_CHANNEL_CHANGE_MS, 300);
  assert.equal(getTvVolumeKnobAngle(0), -135);
  assert.equal(getTvVolumeKnobAngle(0.5), 0);
  assert.equal(getTvVolumeKnobAngle(1), 135);

  assert.equal(getNextSteppedVolume(0), 0.25);
  assert.equal(getNextSteppedVolume(0.5), 0.75);
  assert.equal(getNextSteppedVolume(0.98), 0);

  const url = buildCleanYouTubeEmbedUrl('dQw4w9WgXcQ', true, 42.9);
  assert.match(url, /controls=0/);
  assert.match(url, /modestbranding=1/);
  assert.match(url, /rel=0/);
  assert.match(url, /iv_load_policy=3/);
  assert.match(url, /playsinline=1/);
  assert.match(url, /disablekb=1/);
  assert.match(url, /start=42/);
  assert.match(url, /autoplay=1/);
});

test('containsNonLatinScript accurately detects Gurmukhi, Devanagari, and Arabic/Urdu while skipping Latin script', () => {
  assert.equal(containsNonLatinScript('Ladies and gentlemen, get ready!'), false);
  assert.equal(containsNonLatinScript('Café résumé naïve — 1984 ♪'), false);
  // Gurmukhi (Punjabi)
  assert.equal(containsNonLatinScript('ਨਾ ਦੇ ਦਿਲ ਪਰਦੇਸੀ ਨੂੰ, ਤੈਨੂੰ ਨਿੱਤ ਦਾ ਰੋਣਾ ਪੈ ਜਾਊਗਾ'), true);
  // Devanagari (Hindi)
  assert.equal(containsNonLatinScript('(धुरंधर) तेरा जादू चल गया'), true);
  // Arabic / Urdu
  assert.equal(containsNonLatinScript('دل پردیسی نوں نہ دے'), true);

  assert.equal(
    lyricsContainNonLatinScript(['Ladies and gentlemen', 'You are not ready for this']),
    false
  );
  assert.equal(
    lyricsContainNonLatinScript(['Ladies and gentlemen', 'ਨਾ ਦੇ ਦਿਲ ਪਰਦੇਸੀ ਨੂੰ']),
    true
  );
});

test('alignConvertedLyricLines enforces exact line count and order so timestamps never shift', () => {
  const original = [
    'Ladies and gentlemen',
    'ਨਾ ਦੇ ਦਿਲ ਪਰਦੇਸੀ ਨੂੰ',
    '(धुरंधर)',
  ];

  // Valid 1-to-1 string array
  const romanized = alignConvertedLyricLines(original, {
    lines: ['Ladies and gentlemen', 'Na de dil pardesi nu', '(Dhurandhar)'],
  });
  assert.deepEqual(romanized, [
    'Ladies and gentlemen',
    'Na de dil pardesi nu',
    '(Dhurandhar)',
  ]);

  // Indexed object array preserves exact order even if returned out of order
  const outOfOrderIndexed = alignConvertedLyricLines(original, {
    lines: [
      { index: 2, text: '(The Champion)' },
      { index: 0, text: 'Ladies and gentlemen' },
      { index: 1, text: 'Do not give your heart to a stranger' },
    ],
  });
  assert.deepEqual(outOfOrderIndexed, [
    'Ladies and gentlemen',
    'Do not give your heart to a stranger',
    '(The Champion)',
  ]);

  // Mismatched string array count is rejected (returns null) so caller falls back to original + retry
  assert.equal(alignConvertedLyricLines(original, { lines: ['Merged single line'] }), null);
  assert.equal(alignConvertedLyricLines(original, { lines: [] }), null);
});

test('buildLrclibGetUrl, parsePlainLyrics, calculateNextLyricTimeoutMs, calculateCenteredLyricTranslateY, and stepLyricFontSize work accurately', () => {
  const getUrl = buildLrclibGetUrl({
    trackName: 'Dhurandhar',
    artistName: 'Shashwat Sachdev',
    albumName: 'Dhurandhar',
    durationSec: 156.4,
  });
  assert.match(getUrl, /^https:\/\/lrclib\.net\/api\/get\?/);
  assert.match(getUrl, /track_name=Dhurandhar/);
  assert.match(getUrl, /artist_name=Shashwat\+Sachdev/);
  assert.match(getUrl, /album_name=Dhurandhar/);
  assert.match(getUrl, /duration=156/);

  assert.deepEqual(parsePlainLyrics('Line 1\n\n  Line 2 \r\nLine 3'), ['Line 1', 'Line 2', 'Line 3']);

  const parsedLrc = parseLrcLyrics('[00:02.00] First\n[00:05.50] Second\n[00:10.00] Third', 30);
  // At 2.0s (activeIndex = 0), next line is at 5.5s -> 3500ms at 1x speed
  assert.equal(calculateNextLyricTimeoutMs(parsedLrc, 0, 2.0, 1), 3500);
  // At last line (activeIndex = 2), returns null
  assert.equal(calculateNextLyricTimeoutMs(parsedLrc, 2, 11.0, 1), null);

  // Viewport 240px tall, active line at offsetTop 100px with height 40px -> center is 120 - 120 = 0px
  assert.equal(calculateCenteredLyricTranslateY(240, 100, 40), 0);
  // Active line at offsetTop 300px with height 40px -> 120 - 320 = -200px
  assert.equal(calculateCenteredLyricTranslateY(240, 300, 40), -200);

  assert.equal(stepLyricFontSize(1, 1), 2);
  assert.equal(stepLyricFontSize(3, 1), 3);
  assert.equal(stepLyricFontSize(0, -1), 0);
  assert.ok(getLyricFontSizeClasses(2).activeClass.includes('15px'));
});

test('stepCrossfadeSeconds, getCrossfadeKnobAngle, and shouldTriggerTrackCrossfade enforce 1-5s X-FADE detents and Low Power bypass', () => {
  assert.equal(stepCrossfadeSeconds(3), 4);
  assert.equal(stepCrossfadeSeconds(5), 1);
  assert.equal(getCrossfadeKnobAngle(1), -110);
  assert.equal(getCrossfadeKnobAngle(3), 0);
  assert.equal(getCrossfadeKnobAngle(5), 110);

  // Within last 3s of a 200s track with lowPowerMode=false -> triggers crossfade
  assert.equal(
    shouldTriggerTrackCrossfade({
      currentTimeSec: 197.4,
      durationSec: 200,
      crossfadeSec: 3,
      lowPowerMode: false,
    }),
    true
  );

  // Disabled automatically in Low Power Mode
  assert.equal(
    shouldTriggerTrackCrossfade({
      currentTimeSec: 197.4,
      durationSec: 200,
      crossfadeSec: 3,
      lowPowerMode: true,
    }),
    false
  );

  // Skipped on manual skip or when already crossfading
  assert.equal(
    shouldTriggerTrackCrossfade({
      currentTimeSec: 197.4,
      durationSec: 200,
      crossfadeSec: 3,
      lowPowerMode: false,
      isManualSkip: true,
    }),
    false
  );
});

test('top-surface rotary knob angle helpers and triggerButtonHaptic behave deterministically', () => {
  assert.equal(getSpeedKnobAngle(33), -45);
  assert.equal(getSpeedKnobAngle(45), 45);
  assert.equal(getPitchKnobAngle(0), 0);
  assert.equal(getPitchKnobAngle(12), 130);
  assert.equal(getPitchKnobAngle(-12), -130);
  assert.equal(stepPitchKnobDetent(0), 4);
  assert.equal(stepPitchKnobDetent(12), -12);
  assert.equal(getEffectsKnobAngle(0), -90);
  assert.equal(getEffectsKnobAngle(2), 30);
  assert.equal(getBinaryKnobAngle(false), -45);
  assert.equal(getBinaryKnobAngle(true), 45);

  const pulses: Array<number | number[]> = [];
  const mockVib = (p: number | number[]) => {
    pulses.push(p);
    return true;
  };
  assert.equal(triggerButtonHaptic(true, mockVib), false);
  assert.equal(pulses.length, 0);
  assert.equal(triggerButtonHaptic(false, mockVib), true);
  assert.deepEqual(pulses, [12]);
});

test('ID-based track click resolution always resolves the clicked Spotify track ID against the original unfiltered playlist even with unplayable tracks mixed in', () => {
  const mixedPlaylist: TrackItem[] = [
    {
      id: 'sp-playable-0',
      title: 'Track Zero (Playable)',
      artist: 'Artist 0',
      album: 'Album',
      durationSec: 180,
      bpm: 110,
      year: 2024,
      artworkUrl: '/a0.jpg',
      previewAudioUrl: 'https://p.scdn.co/mp3-preview/0',
      youtubeVideoId: '',
      synthPreset: 'midnight-synth',
      tvFrames: [],
    },
    {
      id: 'sp-unplayable-1',
      title: 'Track One (No Preview Audio)',
      artist: 'Artist 1',
      album: 'Album',
      durationSec: 195,
      bpm: 112,
      year: 2024,
      artworkUrl: '/a1.jpg',
      // No previewAudioUrl — previously filtering this out caused index N clicks to hit the wrong song!
      youtubeVideoId: '',
      synthPreset: 'velvet-soul',
      tvFrames: [],
    },
    {
      id: 'sp-unplayable-2',
      title: 'Track Two (No Preview Audio)',
      artist: 'Artist 2',
      album: 'Album',
      durationSec: 210,
      bpm: 105,
      year: 2023,
      artworkUrl: '/a2.jpg',
      youtubeVideoId: '',
      synthPreset: 'classic-funk',
      tvFrames: [],
    },
    {
      id: 'sp-playable-3',
      title: 'Track Three (Playable N)',
      artist: 'Artist 3',
      album: 'Album',
      durationSec: 204,
      bpm: 118,
      year: 2025,
      artworkUrl: '/a3.jpg',
      previewAudioUrl: 'https://p.scdn.co/mp3-preview/3',
      youtubeVideoId: '',
      synthPreset: 'cyber-electro',
      tvFrames: [],
    },
    {
      id: 'sp-playable-4',
      title: 'Track Four (Playable)',
      artist: 'Artist 4',
      album: 'Album',
      durationSec: 175,
      bpm: 100,
      year: 2022,
      artworkUrl: '/a4.jpg',
      previewAudioUrl: 'https://p.scdn.co/mp3-preview/4',
      youtubeVideoId: '',
      synthPreset: 'pacific-yacht',
      tvFrames: [],
    },
  ];

  // Simulate a filtered/shuffled visual list where visual row 1 is actually original index 3 ('sp-playable-3')
  const visualPlayableOnly = mixedPlaylist.filter((t) => Boolean(t.previewAudioUrl));
  const clickedTrackFromVisualRow = visualPlayableOnly[1]; // 'sp-playable-3' (visual index 1, original index 3)

  // Resolution MUST pass the clicked track's unique ID against the ORIGINAL unfiltered array
  const resolved = resolveTrackById(mixedPlaylist, clickedTrackFromVisualRow.id);
  assert.equal(resolved.index, 3);
  assert.equal(resolved.track?.id, 'sp-playable-3');
  assert.equal(resolved.track?.title, 'Track Three (Playable N)');

  // Clicking an unplayable track directly by ID also resolves that exact track N
  const clickedTrackN = mixedPlaylist[2];
  const resolvedN = resolveTrackById(mixedPlaylist, clickedTrackN.id);
  assert.equal(resolvedN.index, 2);
  assert.equal(resolvedN.track?.id, 'sp-unplayable-2');

  // Verify Up Next, Next, and Prev all resolve consistently by ID against originalTracks
  assert.equal(findTrackIndexById(mixedPlaylist, 'sp-playable-3'), 3);
  const upNext = getUpNextQueueById(mixedPlaylist, 'sp-playable-3');
  assert.equal(upNext[0].track.id, 'sp-playable-4');
  assert.equal(upNext[1].track.id, 'sp-playable-0');

  assert.equal(getNextTrackId(mixedPlaylist, 'sp-playable-3', false, false), 'sp-playable-4');
  assert.equal(getNextTrackId(mixedPlaylist, 'sp-playable-3', true, false), 'sp-playable-3');

  const shuffledNextId = getNextTrackId(mixedPlaylist, 'sp-playable-3', false, true, 0.5);
  assert.notEqual(shuffledNextId, 'sp-playable-3');
  assert.ok(mixedPlaylist.some((t) => t.id === shuffledNextId));

  assert.deepEqual(getPreviousTrackIdAction(mixedPlaylist, 'sp-playable-3', 10, true), {
    action: 'previous',
    targetTrackId: 'sp-unplayable-2',
  });
  assert.deepEqual(getPreviousTrackIdAction(mixedPlaylist, 'sp-playable-3', 10, false), {
    action: 'restart',
    targetTrackId: 'sp-playable-3',
  });
});

test('getOrderedTrackArtworkUrls and resolveActiveArtworkState select largest image first and step through onError fallback path to placeholder', () => {
  const mockedMultiImageTrack: TrackItem = {
    id: 'art-test-track',
    title: 'Neon Horizon',
    artist: 'The Analogues',
    album: 'Test LP',
    durationSec: 210,
    bpm: 112,
    year: 1983,
    artworkUrl: 'https://cdn.example.com/fallback-legacy.jpg',
    images: [
      { url: 'https://cdn.example.com/medium-300.jpg', width: 300, height: 300 },
      { url: 'https://cdn.example.com/large-640.jpg', width: 640, height: 640 },
      { url: 'https://cdn.example.com/small-64.jpg', width: 64, height: 64 },
    ],
    youtubeVideoId: 'MV_3Dpw-BRY',
    synthPreset: 'midnight-synth',
    tvFrames: [
      {
        id: 'tf1',
        label: 'CH 01',
        timestampSec: 0,
        timestampLabel: '00:00',
        imageUrl: 'https://cdn.example.com/tv-frame.jpg',
        caption: 'Frame',
      },
    ],
  };

  const ordered = getOrderedTrackArtworkUrls(mockedMultiImageTrack);
  // Largest (640x640) must come first, then 300x300, then 64x64, then legacy artworkUrl, YouTube HQ, and tvFrame
  assert.equal(ordered[0], 'https://cdn.example.com/large-640.jpg');
  assert.equal(ordered[1], 'https://cdn.example.com/medium-300.jpg');
  assert.equal(ordered[2], 'https://cdn.example.com/small-64.jpg');
  assert.equal(ordered[3], 'https://cdn.example.com/fallback-legacy.jpg');
  assert.equal(ordered[4], 'https://i.ytimg.com/vi/MV_3Dpw-BRY/hqdefault.jpg');
  assert.equal(ordered[5], 'https://cdn.example.com/tv-frame.jpg');

  // Initial state (0 errors): renders largest image (640x640)
  const initial = resolveActiveArtworkState(mockedMultiImageTrack, 0);
  assert.equal(initial.activeUrl, 'https://cdn.example.com/large-640.jpg');
  assert.equal(initial.isPlaceholder, false);
  assert.equal(initial.attemptIndex, 0);

  // First onError (1 failed attempt): falls back to next largest image (300x300)
  const afterOneError = resolveActiveArtworkState(mockedMultiImageTrack, 1);
  assert.equal(afterOneError.activeUrl, 'https://cdn.example.com/medium-300.jpg');
  assert.equal(afterOneError.isPlaceholder, false);

  // Second onError (2 failed attempts): falls back to 64x64 image
  const afterTwoErrors = resolveActiveArtworkState(mockedMultiImageTrack, 2);
  assert.equal(afterTwoErrors.activeUrl, 'https://cdn.example.com/small-64.jpg');
  assert.equal(afterTwoErrors.isPlaceholder, false);

  // When all candidate URLs fail: falls back to vinyl-label placeholder graphic
  const afterAllFailed = resolveActiveArtworkState(mockedMultiImageTrack, ordered.length);
  assert.equal(afterAllFailed.activeUrl, null);
  assert.equal(afterAllFailed.isPlaceholder, true);

  // Standby track immediately uses placeholder
  const standbyState = resolveActiveArtworkState(EMPTY_STANDBY_TRACK, 0);
  assert.equal(standbyState.activeUrl, null);
  assert.equal(standbyState.isPlaceholder, true);
});

test('isAlbumArtSyncedToSpindle and clampAlbumArtDragOffset sync rotation only when centered on spindle and clamp to wooden board bounds', () => {
  assert.equal(isAlbumArtSyncedToSpindle(0, 0), true);
  assert.equal(isAlbumArtSyncedToSpindle(ALBUM_ART_SPINDLE_SNAP_RADIUS_PX - 2, 0), true);
  assert.equal(isAlbumArtSyncedToSpindle(45, -30), false);

  // Dragging within snap radius snaps cleanly back to spindle center (0, 0) and rotates with vinyl
  const snapped = clampAlbumArtDragOffset({
    offsetX: 6,
    offsetY: -5,
    boardWidth: 500,
    boardHeight: 400,
    discDiameter: 180,
    spindleCenterX: 300,
    spindleCenterY: 200,
  });
  assert.equal(snapped.offsetX, 0);
  assert.equal(snapped.offsetY, 0);
  assert.equal(snapped.isCenteredOnSpindle, true);

  // Dragging off-center stays static (isCenteredOnSpindle = false) and clamps within board edges
  const draggedLeft = clampAlbumArtDragOffset({
    offsetX: -140,
    offsetY: 25,
    boardWidth: 500,
    boardHeight: 400,
    discDiameter: 180,
    spindleCenterX: 300,
    spindleCenterY: 200,
  });
  assert.equal(draggedLeft.offsetX, -140);
  assert.equal(draggedLeft.offsetY, 25);
  assert.equal(draggedLeft.isCenteredOnSpindle, false);

  // Extreme drag beyond board bounds is clamped so disc never leaves the wooden surface
  const clampedExtreme = clampAlbumArtDragOffset({
    offsetX: -999,
    offsetY: 999,
    boardWidth: 500,
    boardHeight: 400,
    discDiameter: 180,
    spindleCenterX: 300,
    spindleCenterY: 200,
  });
  assert.equal(clampedExtreme.offsetX, -206); // minOffsetX = (90 + 4) - 300 = -206
  assert.equal(clampedExtreme.offsetY, 106); // maxOffsetY = (400 - 90 - 4) - 200 = 106
  assert.equal(clampedExtreme.isCenteredOnSpindle, false);
});

test('CRT_TINT_PRESETS and removePlaylistById cycle broadcast tints and delete saved playlists cleanly', () => {
  assert.equal(CRT_TINT_PRESETS.length, 4);
  assert.equal(getNextCrtTintIndex(0), 1);
  assert.equal(getNextCrtTintIndex(3), 0);

  const mockPacks: PlaylistPack[] = [
    { id: 'pl-1', name: 'Pack One', subtitle: '1', source: 'spotify-curated', tracks: [sampleTracks[0]] },
    { id: 'pl-2', name: 'Pack Two', subtitle: '2', source: 'spotify-curated', tracks: [sampleTracks[1]] },
    { id: 'pl-3', name: 'Pack Three', subtitle: '3', source: 'spotify-curated', tracks: [sampleTracks[2]] },
  ];

  // Deleting active playlist pl-2 switches activePlaylistId to first remaining playlist (pl-1)
  const afterDeleteActive = removePlaylistById(mockPacks, 'pl-2', 'pl-2');
  assert.equal(afterDeleteActive.remaining.length, 2);
  assert.equal(afterDeleteActive.nextActiveId, 'pl-1');

  // Deleting non-active playlist preserves current activePlaylistId
  const afterDeleteOther = removePlaylistById(mockPacks, 'pl-3', 'pl-1');
  assert.equal(afterDeleteOther.remaining.length, 2);
  assert.equal(afterDeleteOther.nextActiveId, 'pl-1');
});

test('getCrtTintKnobAngle maps 4 CRT filter/tint presets to rotary knob angles [-90, -30, +30, +90]', () => {
  assert.equal(getCrtTintKnobAngle(0), -90);
  assert.equal(getCrtTintKnobAngle(1), -30);
  assert.equal(getCrtTintKnobAngle(2), 30);
  assert.equal(getCrtTintKnobAngle(3), 90);
  assert.equal(getCrtTintKnobAngle(4), -90);
});

test('clampHolderBoxDragOffset clamps the square album-art holder box within wooden board bounds and snaps to home', () => {
  // Dropping within snap radius snaps cleanly back to (0, 0) above the vinyl
  const snappedHome = clampHolderBoxDragOffset({
    offsetX: 6,
    offsetY: -5,
    boardWidth: 500,
    boardHeight: 420,
    boxSize: 100,
    homeCenterX: 250,
    homeCenterY: 66,
  });
  assert.equal(snappedHome.offsetX, 0);
  assert.equal(snappedHome.offsetY, 0);
  assert.equal(snappedHome.isAtHomePosition, true);

  // Dragging across the wooden board preserves offset while staying inside board bounds
  const draggedRight = clampHolderBoxDragOffset({
    offsetX: 110,
    offsetY: 85,
    boardWidth: 500,
    boardHeight: 420,
    boxSize: 100,
    homeCenterX: 250,
    homeCenterY: 66,
  });
  assert.equal(draggedRight.offsetX, 110);
  assert.equal(draggedRight.offsetY, 85);
  assert.equal(draggedRight.isAtHomePosition, false);

  // Extreme drag beyond board edges is clamped so the holder box never leaves the wooden surface
  const clampedExtreme = clampHolderBoxDragOffset({
    offsetX: -999,
    offsetY: 999,
    boardWidth: 500,
    boardHeight: 420,
    boxSize: 100,
    homeCenterX: 250,
    homeCenterY: 66,
  });
  assert.equal(clampedExtreme.offsetX, -196); // minX = (50 + 4) - 250 = -196
  assert.equal(clampedExtreme.offsetY, 300); // maxY = (420 - 50 - 4) - 66 = 300
  assert.equal(clampedExtreme.isAtHomePosition, false);
});

test('getTrackChangeStagePose sequences all 6 steps (a-f) of the track-change animation within ~1.56s', () => {
  assert.ok(
    TRACK_CHANGE_TIMELINE_MS.lowerTonearmEndMs >= 1500 &&
      TRACK_CHANGE_TIMELINE_MS.lowerTonearmEndMs <= 2000
  );

  // Step a & d: vinyl lifts/slides into box above it, tonearm swings to rest, outgoing art still in box
  const stepA = getTrackChangeStagePose('lifting-vinyl-to-box');
  assert.equal(stepA.holderSlotOpen, true);
  assert.equal(stepA.forceTonearmRest, true);
  assert.equal(stepA.showOutgoingTrackInBox, true);
  assert.match(stepA.vinylTransform, /translate3d\(0%, -56%, 0\)/);

  // Step b & d: holder box shrinks & slides toward playlist thumbnail
  const stepB = getTrackChangeStagePose('returning-box-to-playlist');
  assert.equal(stepB.forceTonearmRest, true);
  assert.equal(stepB.showOutgoingTrackInBox, true);
  assert.equal(stepB.vinylOpacity, 0);
  assert.match(stepB.holderBoxTransform, /scale\(0\.24\)/);

  // Step c & d: new track's holder box slides out from playlist onto board
  const stepC = getTrackChangeStagePose('bringing-new-box-from-playlist');
  assert.equal(stepC.forceTonearmRest, true);
  assert.equal(stepC.showOutgoingTrackInBox, false);
  assert.equal(stepC.holderSlotOpen, true);
  assert.equal(stepC.holderBoxOpacity, 1);

  // Step e & d: new box opens and vinyl slides out onto spindle
  const stepE = getTrackChangeStagePose('sliding-vinyl-to-spindle');
  assert.equal(stepE.forceTonearmRest, true);
  assert.equal(stepE.holderSlotOpen, true);
  assert.equal(stepE.vinylOpacity, 1);
  assert.match(stepE.vinylTransform, /scale\(1\)/);

  // Step f: tonearm swings back in and lowers onto record
  const stepF = getTrackChangeStagePose('lowering-tonearm');
  assert.equal(stepF.forceTonearmRest, false);
  assert.equal(stepF.holderSlotOpen, false);
  assert.equal(stepF.vinylOpacity, 1);

  const idlePose = getTrackChangeStagePose('idle');
  assert.equal(idlePose.forceTonearmRest, false);
  assert.equal(idlePose.holderSlotOpen, false);
});






