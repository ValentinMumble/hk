import {get} from './http.js';

/**
 * Songs like a given one, from Last.fm (a free API key). It stands in for Spotify's recommendations, which Spotify
 * closed to apps in development mode. Little-known songs have no similar songs there, so their similar artists are
 * used instead.
 */
const API = 'https://ws.audioscrobbler.com/2.0/';
const SIMILAR_LIMIT = 60;
const ARTIST_LIMIT = 25;

/** A song to look up on Spotify. Without a title, any well-known song by the artist will do. */
export type SimilarSong = {artist: string; title: string | null};

type Reply = {
  error?: number;
  message?: string;
  similartracks?: {track?: Array<{name: string; artist: {name: string}}>};
  similarartists?: {artist?: Array<{name: string}>};
};

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * The songs for a radio, in Last.fm's order of likeness: without the seed song itself, and at most `perArtist`
 * songs by the same artist so the mix stays varied. Exported for tests.
 */
export const pickRadioSongs = (
  songs: SimilarSong[],
  seed: {artist: string; title: string},
  {max = 30, perArtist = 2} = {},
): SimilarSong[] => {
  const counts = new Map<string, number>();
  const picked: SimilarSong[] = [];

  for (const song of songs) {
    if (picked.length >= max) break;
    if (song.title && same(song.artist, seed.artist) && same(song.title, seed.title)) continue;

    const key = song.artist.trim().toLowerCase();
    const count = counts.get(key) ?? 0;

    if (count >= perArtist) continue;

    counts.set(key, count + 1);
    picked.push(song);
  }

  return picked;
};

export const createLastfm = (apiKey: string, userAgent: string) => {
  const call = async (params: Record<string, string>): Promise<Reply> => {
    const query = new URLSearchParams({...params, api_key: apiKey, format: 'json', autocorrect: '1'});
    const reply = await get(`${API}?${query}`, {'user-agent': userAgent});
    const data = JSON.parse(reply.body) as Reply;

    if (data.error || reply.status >= 400) throw new Error(`Last.fm: ${data.message ?? `HTTP ${reply.status}`}`);

    return data;
  };

  return {
    similarSongs: async (artist: string, title: string): Promise<SimilarSong[]> => {
      const {similartracks} = await call({
        method: 'track.getsimilar',
        artist,
        track: title,
        limit: String(SIMILAR_LIMIT),
      });
      const songs = (similartracks?.track ?? []).map(track => ({artist: track.artist.name, title: track.name}));

      if (songs.length) return songs;

      const {similarartists} = await call({method: 'artist.getsimilar', artist, limit: String(ARTIST_LIMIT)});

      return (similarartists?.artist ?? []).map(similar => ({artist: similar.name, title: null}));
    },
  };
};
