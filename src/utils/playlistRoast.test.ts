import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaylistRoasts, extractSpotifyPlaylistId } from './playlistRoast';

test('extractSpotifyPlaylistId extracts ID from full URL, URI, bare ID, and handles blanks', () => {
  assert.equal(
    extractSpotifyPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=xyz123'),
    '37i9dQZF1DXcBWIGoYBM5M'
  );
  assert.equal(extractSpotifyPlaylistId('spotify:playlist:4AbCdEfGh123'), '4AbCdEfGh123');
  assert.equal(extractSpotifyPlaylistId('  4AbCdEfGh123  '), '4AbCdEfGh123');
  assert.equal(extractSpotifyPlaylistId('   '), '');
});

test('buildPlaylistRoasts references actual song titles and artists in sarcastic remarks', () => {
  const roasts = buildPlaylistRoasts({
    playlistName: 'Spotify · Late Night Drive',
    tracks: [
      { title: 'All Too Well (10 Minute Version)', artist: 'Taylor Swift' },
      { title: 'Midnight City', artist: 'M83' },
      { title: 'Party In The U.S.A.', artist: 'Miley Cyrus' },
    ],
  });

  assert.ok(roasts.length >= 4);
  assert.ok(roasts[0].includes('Taylor Swift'));
  assert.ok(roasts[0].includes('All Too Well (10 Minute Version)'));
  assert.ok(roasts[1].includes('Midnight City'));
  assert.ok(roasts[1].includes('M83'));
  assert.ok(roasts[2].includes('Party In The U.S.A.'));
  assert.ok(roasts[2].includes('Miley Cyrus'));
});

test('buildPlaylistRoasts uses heartbreak/collab/remix context jokes when applicable', () => {
  const roasts = buildPlaylistRoasts({
    tracks: [
      { title: 'Crying in the Club', artist: 'Camila Cabello' },
      { title: 'Stay (Remix)', artist: 'The Kid LAROI, Justin Bieber' },
    ],
  });

  assert.ok(roasts.some((r) => r.includes('Crying in the Club') && r.includes('Camila Cabello')));
  assert.ok(roasts.some((r) => r.includes('Stay (Remix)') && r.includes('Justin Bieber')));
});

test('buildPlaylistRoasts falls back to fallbackTracks and handles empty fields cleanly', () => {
  const roasts = buildPlaylistRoasts({
    tracks: [],
    fallbackTracks: [{ title: 'Mr. Brightside', artist: 'The Killers' }],
  });

  assert.ok(roasts.length >= 4);
  assert.ok(roasts.every((r) => r.includes('Mr. Brightside') && r.includes('The Killers')));

  const noTrackRoasts = buildPlaylistRoasts({ tracks: [], fallbackTracks: [] });
  assert.ok(noTrackRoasts.length >= 2);
  assert.equal(noTrackRoasts.some((r) => /undefined|null/i.test(r)), false);
});
