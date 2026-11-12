import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  clampSeekTime,
  getNextTrackIndex,
  getShuffledNextTrackIndex,
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
  type TrackItem,
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
