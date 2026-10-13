import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {pickRadioSongs, type SimilarSong} from './lastfm.js';
import {withoutVersionNotes} from './lyrics.js';
import type {PlaybackState, Spotify, SpotifyDevice, SpotifyTrack} from './types.js';

/**
 * Spotify Web API client holding one user session for every client of the agent, like the old server did.
 * Tokens live in a JSON file so they survive restarts; log in again after a reflash.
 */
const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const TIMEOUT_MS = 8000;
const REFRESH_MARGIN_MS = 30_000;
/** Radio songs are looked up on Spotify this many at a time, to stay clear of its rate limit. */
const SEARCH_BATCH = 6;
/** Songs a radio adds to the queue: one request each, so a few seconds in all. */
const RADIO_SIZE = 20;

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'user-library-read',
  'user-library-modify',
];

type Tokens = {accessToken: string; refreshToken: string; expiresAt: number};
type Reply = {status: number; data: unknown};
type Options = {query?: Record<string, string | number | boolean>; body?: unknown; form?: Record<string, string>};

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

const httpsJson = (method: string, url: string, headers: Record<string, string>, payload?: string): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method,
        timeout: TIMEOUT_MS,
        headers: {...headers, ...(payload === undefined ? {} : {'content-length': Buffer.byteLength(payload)})},
      },
      response => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => (raw += chunk));
        response.on('end', () => {
          let data: unknown = undefined;

          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
          }

          resolve({status: response.statusCode ?? 0, data});
        });
      },
    );

    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', error => reject(new Error(`Spotify: ${error.message}`)));
    request.end(payload);
  });

const joinArtists = (artists: Array<{name: string}> | undefined) =>
  (artists ?? []).map(artist => artist.name).join(', ');

const smallestImage = (images: Array<{url: string; width?: number}> | undefined, minWidth: number): string | null => {
  const sorted = [...(images ?? [])].sort((left, right) => (left.width ?? 0) - (right.width ?? 0));

  return (sorted.find(image => (image.width ?? 0) >= minWidth) ?? sorted[sorted.length - 1])?.url ?? null;
};

type RawTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists?: Array<{name: string}>;
  album?: {name: string; images?: Array<{url: string; width?: number}>};
};

const toTrack = (raw: RawTrack): SpotifyTrack => ({
  id: raw.id,
  uri: raw.uri,
  name: raw.name,
  artists: joinArtists(raw.artists),
  album: raw.album?.name ?? '',
  artwork: smallestImage(raw.album?.images, 300),
});

/** Trim Spotify's playback object down to what the app shows. Exported for tests. */
export const toPlaybackState = (raw: unknown): PlaybackState => {
  const empty: PlaybackState = {
    isPlaying: false,
    progressMs: 0,
    readAt: Date.now(),
    shuffle: false,
    repeat: 'off',
    device: null,
    track: null,
    contextUri: null,
  };

  if (!raw || 'object' !== typeof raw) return empty;

  const state = raw as {
    is_playing?: boolean;
    progress_ms?: number | null;
    shuffle_state?: boolean;
    repeat_state?: PlaybackState['repeat'];
    device?: {id: string; name: string; volume_percent?: number | null} | null;
    item?: (RawTrack & {type?: string}) | null;
    context?: {uri: string} | null;
  };

  return {
    ...empty,
    isPlaying: state.is_playing ?? false,
    progressMs: state.progress_ms ?? 0,
    shuffle: state.shuffle_state ?? false,
    repeat: state.repeat_state ?? 'off',
    device: state.device
      ? {id: state.device.id, name: state.device.name, volume: state.device.volume_percent ?? 0}
      : null,
    track:
      state.item && 'track' === (state.item.type ?? 'track')
        ? {...toTrack(state.item), durationMs: state.item.duration_ms, saved: false}
        : null,
    contextUri: state.context?.uri ?? null,
  };
};

type Config = {
  clientId: string;
  clientSecret: string;
  defaultDevice?: string;
  tokensFile: string;
  /** Songs like a given one, for the radio (Last.fm). Without it the radio asks Spotify's own recommendations. */
  similarSongs?: (artist: string, title: string) => Promise<SimilarSong[]>;
};

export const createSpotify = ({clientId, clientSecret, defaultDevice, tokensFile, similarSongs}: Config): Spotify => {
  let tokens: Tokens | null = null;

  try {
    if (existsSync(tokensFile)) tokens = JSON.parse(readFileSync(tokensFile, 'utf8'));
  } catch (error) {
    console.error(`Spotify: cannot read ${tokensFile}:`, error);
  }

  const saveTokens = (next: Tokens) => {
    tokens = next;
    writeFileSync(tokensFile, JSON.stringify(next), {mode: 0o600});
  };

  const accountsCall = async (form: Record<string, string>): Promise<Tokens> => {
    const payload = new URLSearchParams(form).toString();
    const {status, data} = await httpsJson(
      'POST',
      `${ACCOUNTS}/api/token`,
      {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload,
    );
    const reply = data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
      error?: string;
    };

    if (status >= 400 || !reply.access_token) {
      throw new SpotifyError(status, `Spotify login failed: ${reply.error_description ?? reply.error ?? status}`);
    }

    return {
      accessToken: reply.access_token,
      refreshToken: reply.refresh_token ?? tokens?.refreshToken ?? '',
      expiresAt: Date.now() + (reply.expires_in ?? 3600) * 1000,
    };
  };

  const refresh = async () => {
    if (!tokens) throw new SpotifyError(401, 'Spotify: not connected');

    saveTokens(await accountsCall({grant_type: 'refresh_token', refresh_token: tokens.refreshToken}));
  };

  const api = async (method: string, path: string, {query, body}: Options = {}, retry = true): Promise<unknown> => {
    if (!tokens) throw new SpotifyError(401, 'Spotify: not connected');
    if (Date.now() > tokens.expiresAt - REFRESH_MARGIN_MS) await refresh();

    const search = query
      ? `?${new URLSearchParams(Object.entries(query).map(([key, value]): [string, string] => [key, String(value)]))}`
      : '';
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const {status, data} = await httpsJson(
      method,
      `${API}${path}${search}`,
      {authorization: `Bearer ${tokens.accessToken}`, ...(payload ? {'content-type': 'application/json'} : {})},
      payload,
    );

    if (401 === status && retry) {
      await refresh();

      return api(method, path, {query, body}, false);
    }

    if (status >= 400) {
      const error = (data as {error?: {message?: string; reason?: string}} | undefined)?.error;

      throw new SpotifyError(status, `Spotify: ${error?.message ?? `HTTP ${status}`}`, error?.reason);
    }

    return data;
  };

  /** Whether tracks are in Liked Songs, remembered per track so polling does not ask every time. */
  const savedCache = new Map<string, boolean>();

  const isSaved = async (trackId: string): Promise<boolean> => {
    const cached = savedCache.get(trackId);

    if (undefined !== cached) return cached;

    const reply = (await api('GET', '/me/tracks/contains', {query: {ids: trackId}})) as boolean[];
    const saved = reply[0] ?? false;
    savedCache.set(trackId, saved);
    if (savedCache.size > 50) savedCache.delete(savedCache.keys().next().value as string);

    return saved;
  };

  let cachedUserId = '';

  const userId = async (): Promise<string> => {
    if (!cachedUserId) cachedUserId = ((await api('GET', '/me')) as {id: string}).id;

    return cachedUserId;
  };

  const devices = async (): Promise<SpotifyDevice[]> => {
    const reply = (await api('GET', '/me/player/devices')) as {
      devices?: Array<{id: string; name: string; is_active: boolean; volume_percent?: number | null}>;
    };

    return (reply.devices ?? []).map(device => ({
      id: device.id,
      name: device.name,
      isActive: device.is_active,
      volume: device.volume_percent ?? 0,
    }));
  };

  const transfer = async (deviceId: string, play: boolean) => {
    await api('PUT', '/me/player', {body: {device_ids: [deviceId], play}});
  };

  /** Player commands fail with NO_ACTIVE_DEVICE when nothing plays; wake the default device and retry once. */
  /** Spotify's own recommendations, closed to apps in development mode since November 2024. */
  const recommendedUris = async (trackId: string) => {
    try {
      const reply = (await api('GET', '/recommendations', {query: {seed_tracks: trackId, limit: 49}})) as {
        tracks?: RawTrack[];
      };

      return (reply.tracks ?? []).map(track => track.uri);
    } catch (error) {
      if (error instanceof SpotifyError && (404 === error.status || 403 === error.status)) {
        throw new SpotifyError(error.status, 'Song radio needs LASTFM_API_KEY on the agent');
      }
      throw error;
    }
  };

  /** The Spotify track for a song, or null when Spotify does not have it. */
  const findTrack = async ({artist, title}: SimilarSong): Promise<string | null> => {
    const quoted = (value: string) => `"${value.replace(/"/g, '')}"`;
    const q = title ? `track:${quoted(title)} artist:${quoted(artist)}` : `artist:${quoted(artist)}`;
    const reply = (await api('GET', '/search', {query: {q, type: 'track', limit: 1}})) as {
      tracks?: {items?: RawTrack[]};
    };

    return reply.tracks?.items?.[0]?.uri ?? null;
  };

  /** Songs like the track from the similar-songs source, found on Spotify; the ones it lacks are skipped. */
  const similarUris = async (trackId: string, source: NonNullable<Config['similarSongs']>) => {
    const seed = (await api('GET', `/tracks/${trackId}`)) as RawTrack;
    const artist = seed.artists?.[0]?.name ?? '';
    const title = withoutVersionNotes(seed.name);
    // A few more than needed, for the songs Spotify does not have
    const songs = pickRadioSongs(await source(artist, title), {artist, title}, {max: RADIO_SIZE + 4});
    const uris: string[] = [];

    for (let start = 0; start < songs.length; start += SEARCH_BATCH) {
      const batch = songs.slice(start, start + SEARCH_BATCH);
      const found = await Promise.all(batch.map(async song => (await findTrack(song).catch(() => null)) ?? ''));
      uris.push(...found.filter(Boolean));
    }

    return [...new Set(uris)];
  };

  const withDevice = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof SpotifyError) || 'NO_ACTIVE_DEVICE' !== error.reason || !defaultDevice) throw error;

      const target = (await devices()).find(device => device.name.toLowerCase() === defaultDevice.toLowerCase());

      if (!target) throw new SpotifyError(404, `Spotify: no active device, and "${defaultDevice}" is not available`);

      console.log(`Spotify: waking up ${target.name}`);
      await transfer(target.id, false);
      await new Promise(resolve => setTimeout(resolve, 800));
      await action();
    }
  };

  return {
    connected: () => null !== tokens,
    authorizeUrl: (redirectUri, state) =>
      `${ACCOUNTS}/authorize?${new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SPOTIFY_SCOPES.join(' '),
        state,
      })}`,
    authorize: async (code, redirectUri) => {
      saveTokens(await accountsCall({grant_type: 'authorization_code', code, redirect_uri: redirectUri}));
    },
    logout: () => {
      tokens = null;
      if (existsSync(tokensFile)) unlinkSync(tokensFile);
    },
    state: async () => {
      const state = toPlaybackState(await api('GET', '/me/player'));

      if (state.track) {
        try {
          state.track.saved = await isSaved(state.track.id);
        } catch (error) {
          // older sessions lack the library scope; the heart then shows as not saved
          if (!(error instanceof SpotifyError && 403 === error.status)) throw error;
        }
      }

      return state;
    },
    play: ({uri, contextUri}) =>
      withDevice(() =>
        api('PUT', '/me/player/play', {body: uri ? {uris: [uri]} : contextUri ? {context_uri: contextUri} : {}}),
      ),
    pause: () => withDevice(() => api('PUT', '/me/player/pause')),
    next: () => withDevice(() => api('POST', '/me/player/next')),
    previous: () => withDevice(() => api('POST', '/me/player/previous')),
    seek: positionMs =>
      withDevice(() => api('PUT', '/me/player/seek', {query: {position_ms: Math.max(0, Math.round(positionMs))}})),
    volume: percent =>
      withDevice(() =>
        api('PUT', '/me/player/volume', {query: {volume_percent: Math.min(100, Math.max(0, Math.round(percent)))}}),
      ),
    shuffle: state => withDevice(() => api('PUT', '/me/player/shuffle', {query: {state}})),
    repeat: state => withDevice(() => api('PUT', '/me/player/repeat', {query: {state}})),
    transfer,
    like: async (trackId, saved) => {
      await api(saved ? 'PUT' : 'DELETE', '/me/tracks', {query: {ids: trackId}});
      savedCache.set(trackId, saved);
    },
    devices,
    playlists: async () => {
      const reply = (await api('GET', '/me/playlists', {query: {limit: 50}})) as {
        items?: Array<{id: string; uri: string; name: string; images?: Array<{url: string; width?: number}>} | null>;
      };
      const playlists = (reply.items ?? [])
        .filter((item): item is NonNullable<typeof item> => null !== item)
        .map(item => ({id: item.id, uri: item.uri, name: item.name, image: smallestImage(item.images, 60)}));

      // Liked Songs is not a playlist, but the "collection" context plays it
      return [
        {id: 'liked', uri: `spotify:user:${await userId()}:collection`, name: '💚 Liked Songs', image: null},
        ...playlists,
      ];
    },
    queue: async () => {
      const reply = (await api('GET', '/me/player/queue')) as {queue?: RawTrack[]};

      return (reply.queue ?? [])
        .filter(item => item && item.id)
        .slice(0, 30)
        .map(toTrack);
    },
    addToQueue: async uri => {
      await api('POST', '/me/player/queue', {query: {uri}});
    },
    radio: async trackId => {
      const seedUri = `spotify:track:${trackId}`;
      const uris = (similarSongs ? await similarUris(trackId, similarSongs) : await recommendedUris(trackId))
        .filter(uri => uri !== seedUri)
        .slice(0, RADIO_SIZE);

      if (!uris.length) throw new SpotifyError(404, 'No similar songs found');

      // Queued after the current song, which keeps playing; one at a time so they come in order of likeness
      for (const uri of uris) await withDevice(() => api('POST', '/me/player/queue', {query: {uri}}));

      return uris.length;
    },
    search: async query => {
      const reply = (await api('GET', '/search', {query: {q: query, type: 'track', limit: 10}})) as {
        tracks?: {items?: RawTrack[]};
      };

      return (reply.tracks?.items ?? []).map(toTrack);
    },
  };
};
