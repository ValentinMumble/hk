import type {Settings} from './settings';

// The agent's own types, so the two sides cannot drift apart; type-only, nothing of the agent ends up in the bundle
import type {
  HueScene,
  HueState,
  Light,
  LyricsLine,
  LyricsResult as AgentLyricsResult,
  PlaybackState,
  SpotifyDevice,
  SpotifyPlaylist,
  SpotifyTrack,
} from '../agent/src/types';

export type {HueScene, HueState, Light, LyricsLine, PlaybackState, SpotifyDevice, SpotifyPlaylist, SpotifyTrack};
export type RepeatState = PlaybackState['repeat'];

/** Lyrics as the agent's route sends them: with the song they belong to. */
export type LyricsResult = AgentLyricsResult & {trackId: string | null};
/** Where the player is in the song, as last read: enough to follow it between reads. */
export type Playhead = {trackId: string | null; progressMs: number; readAt: number; isPlaying: boolean};
export type AgentInfo = {
  ok: boolean;
  mock: boolean;
  sources: string[];
  version?: string;
  build?: {sha: string; date: string} | null;
  uptime?: number;
  spotify: {configured: boolean; connected: boolean};
  lyrics?: {configured: boolean; genius?: boolean};
};

export const createApi = ({agentUrl, token}: Settings) => {
  const call = async <T = undefined>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    let response: Response;

    try {
      response = await fetch(`${agentUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : {'content-type': 'application/json'}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Agent unreachable');
    }

    if (204 === response.status) return undefined as T;

    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);

    return data as T;
  };

  return {
    info: () => call<AgentInfo>('GET', '/'),
    hk: (command: string) => call('POST', `/hk/${command}`),
    hkSource: (source: string) => call('POST', '/hk/source', {source}),
    hkStatus: () => call<{response: string}>('POST', '/hk/status'),
    lights: () => call<Light[]>('GET', '/hue/lights'),
    allLights: (state: HueState) => call('POST', '/hue/all', state),
    setLight: (id: string, state: HueState) => call('POST', `/hue/lights/${id}`, state),
    toggleLight: (id: string) => call<{on: boolean}>('POST', `/hue/lights/${id}/toggle`),
    scenes: () => call<HueScene[]>('GET', '/hue/scenes'),
    recallScene: (id: string) => call('POST', `/hue/scenes/${encodeURIComponent(id)}`),
    lyrics: () => call<LyricsResult>('GET', '/lyrics'),
    update: () => call<{sha: string; date: string}>('POST', '/update', {}),
    spotify: {
      authUrl: (redirect: string, state: string) =>
        call<{url: string}>('GET', `/spotify/auth-url?${new URLSearchParams({redirect, state})}`),
      authorize: (code: string, redirectUri: string) => call('POST', '/spotify/authorize', {code, redirectUri}),
      state: () => call<PlaybackState>('GET', '/spotify/state'),
      play: (body: {uri?: string; contextUri?: string} = {}) => call('POST', '/spotify/play', body),
      pause: () => call('POST', '/spotify/pause', {}),
      next: () => call('POST', '/spotify/next', {}),
      previous: () => call('POST', '/spotify/previous', {}),
      seek: (positionMs: number) => call('POST', '/spotify/seek', {positionMs}),
      volume: (percent: number) => call('POST', '/spotify/volume', {percent}),
      shuffle: (state: boolean) => call('POST', '/spotify/shuffle', {state}),
      repeat: (state: RepeatState) => call('POST', '/spotify/repeat', {state}),
      transfer: (deviceId: string, play: boolean) => call('POST', '/spotify/transfer', {deviceId, play}),
      like: (trackId: string, saved: boolean) => call('POST', '/spotify/like', {trackId, saved}),
      queue: () => call<SpotifyTrack[]>('GET', '/spotify/queue'),
      radio: (trackId: string) => call<{queued: number}>('POST', '/spotify/radio', {trackId}),
      addToQueue: (uri: string) => call('POST', '/spotify/queue', {uri}),
      logout: () => call('POST', '/spotify/logout', {}),
      devices: () => call<SpotifyDevice[]>('GET', '/spotify/devices'),
      playlists: () => call<SpotifyPlaylist[]>('GET', '/spotify/playlists'),
      search: (query: string) => call<SpotifyTrack[]>('GET', `/spotify/search?${new URLSearchParams({q: query})}`),
    },
  };
};

export type Api = ReturnType<typeof createApi>;
