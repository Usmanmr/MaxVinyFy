import type { PlaylistPack, YouTubeGrabFrame } from './playerLogic';

export function buildYouTubeFramesForTrack(
  videoId: string,
  title: string,
  artist: string
): YouTubeGrabFrame[] {
  return [
    {
      id: `${videoId}-hq`,
      label: 'CH 03 · YouTube Master Grab',
      timestampSec: 0,
      timestampLabel: '00:15',
      imageUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      caption: `YouTube Video Grab · ${title} — ${artist}`,
    },
    {
      id: `${videoId}-1`,
      label: 'CH 04 · Scene Grab #1',
      timestampSec: 35,
      timestampLabel: '00:48',
      imageUrl: `https://i.ytimg.com/vi/${videoId}/1.jpg`,
      caption: `YouTube Frame #1 · ${title} (${artist})`,
    },
    {
      id: `${videoId}-2`,
      label: 'CH 05 · Scene Grab #2',
      timestampSec: 75,
      timestampLabel: '01:24',
      imageUrl: `https://i.ytimg.com/vi/${videoId}/2.jpg`,
      caption: `YouTube Frame #2 · ${title} (${artist})`,
    },
    {
      id: `${videoId}-3`,
      label: 'CH 06 · Scene Grab #3',
      timestampSec: 115,
      timestampLabel: '02:05',
      imageUrl: `https://i.ytimg.com/vi/${videoId}/3.jpg`,
      caption: `YouTube Frame #3 · ${title} (${artist})`,
    },
  ];
}

/**
 * Clean unauthenticated initial state:
 * zero personal usernames, playlists, or track seeds are shipped by default.
 */
export const DEFAULT_PLAYLISTS: PlaylistPack[] = [];
