export interface RoastTrackSeed {
  title: string;
  artist: string;
}

export interface PlaylistRoastInput {
  playlistName?: string;
  tracks: RoastTrackSeed[];
  fallbackTracks?: RoastTrackSeed[];
  mode?: 'playlist' | 'refresh' | 'login';
}

export function extractSpotifyPlaylistId(idOrUrl: string): string {
  const trimmed = (idOrUrl || '').trim();
  if (!trimmed) return '';
  const matchUrl = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
  if (matchUrl) return matchUrl[1];
  const matchUri = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/i);
  if (matchUri) return matchUri[1];
  return trimmed.replace(/[^a-zA-Z0-9]/g, '');
}

function cleanRoastField(value: string | undefined, fallback: string): string {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

function buildTrackSpecificRoast(track: RoastTrackSeed, variantIdx: number): string {
  const title = cleanRoastField(track.title, 'this mysterious track');
  const artist = cleanRoastField(track.artist, 'whoever made this');

  const contextualPool: string[] = [];

  if (/\b(love|heart|miss|cry|tears|lonely|broken|sorry|goodbye|hurt|pain|sad|alone|ex)\b/i.test(title)) {
    contextualPool.push(
      `"${title}" by ${artist} — bold move inviting your speakers to a full emotional debrief.`,
      `Queueing "${title}" by ${artist}? Someone clearly needs hydration and zero access to their ex's profile.`
    );
  }

  if (/\b(night|midnight|moon|dark|dream|sleep|stars|3am|2am|late)\b/i.test(title)) {
    contextualPool.push(
      `"${title}" by ${artist} screams "staring at the ceiling at 2:47 AM pretending life has a soundtrack."`,
      `Ah yes, "${title}" by ${artist} — certified fuel for dramatic late-night overthinking.`
    );
  }

  if (/\b(party|dance|club|money|rich|boss|fire|hot|lit|fast|champagne|king|queen)\b/i.test(title)) {
    contextualPool.push(
      `"${title}" by ${artist} — essential audio for treating a grocery run like a red-carpet entrance.`,
      `Loading "${title}" by ${artist} as if your kitchen isn't still waiting on those dishes.`
    );
  }

  if (/\b(remix|edit|acoustic|live|version|remaster|pt\.|part\s+\d|slowed|reverb)\b|\(feat\./i.test(title)) {
    contextualPool.push(
      `"${title}" by ${artist}? Because apparently the regular version didn't test enough patience.`,
      `Specifically choosing "${title}" by ${artist} shows suspicious dedication to the extended universe.`
    );
  }

  if (/[,&×]|\bfeat\.|\bft\./i.test(artist)) {
    contextualPool.push(
      `${artist} crowding onto "${title}" feels like a chaotic group project that somehow shipped on time.`
    );
  }

  const generalPool = [
    `Oh look, "${title}" by ${artist} — because clearly nobody has heard that one enough yet.`,
    `"${title}" by ${artist}? Brave of you to confess your Spotify Wrapped out loud like this.`,
    `Fetching "${title}" by ${artist}. Even the progress spinner is raising an eyebrow at that pick.`,
    `${artist} recorded "${title}" and you really said, "Yes, this defines my entire personality today."`,
    `Let me guess: "${title}" by ${artist} is on here "strictly for the vibes." Sure it is.`,
    `Loading "${title}" by ${artist} — nothing says impeccable taste like weaponized main-character syndrome.`,
    `Ah, ${artist}'s "${title}" — the musical equivalent of replying "haha yeah" without listening to the voice note.`,
    `Pulling in "${title}" by ${artist}. Tell me you curated this at 1 AM without telling me.`,
  ];

  const combined = [...contextualPool, ...generalPool];
  return combined[variantIdx % combined.length];
}

export function buildPlaylistRoasts(input: PlaylistRoastInput): string[] {
  const primaryTracks = (input.tracks || []).filter(
    (t) => Boolean((t.title || '').trim()) || Boolean((t.artist || '').trim())
  );
  const secondaryTracks = (input.fallbackTracks || []).filter(
    (t) => Boolean((t.title || '').trim()) || Boolean((t.artist || '').trim())
  );
  const usableTracks = primaryTracks.length > 0 ? primaryTracks : secondaryTracks;

  if (usableTracks.length === 0) {
    if (input.mode === 'login') {
      return [
        'Waiting on Spotify so we can properly judge your questionable listening history...',
        'Preparing sarcastic remarks for whatever songs you claim you only play ironically...',
      ];
    }
    return [
      'Peeking at the song titles and artists so I can roast your taste accurately...',
      'Checking whether these tracks belong in a hall of fame or a 2 AM confession...',
      'Judging your playlist choices before the first beat even drops...',
    ];
  }

  // Spread selections across distinct tracks so consecutive comments roast different songs & artists
  const seenKeys = new Set<string>();
  const distinctTracks: RoastTrackSeed[] = [];
  for (const track of usableTracks) {
    const key = `${(track.title || '').trim().toLowerCase()}::${(track.artist || '').trim().toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      distinctTracks.push(track);
    }
    if (distinctTracks.length >= 12) break;
  }

  const roasts: string[] = [];
  const totalSlots = Math.max(4, Math.min(10, distinctTracks.length * 2));
  for (let i = 0; i < totalSlots; i++) {
    const track = distinctTracks[i % distinctTracks.length];
    const passIdx = Math.floor(i / distinctTracks.length);
    const variantIdx = i + (distinctTracks.length > 1 ? passIdx * 3 : 0);
    const line = buildTrackSpecificRoast(track, variantIdx);
    if (!roasts.includes(line)) {
      roasts.push(line);
    }
  }

  return roasts;
}
