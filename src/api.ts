import type {Settings} from './settings';

export type AgentInfo = {
  ok: boolean;
  mock: boolean;
  sources: string[];
  spotify: {configured: boolean; connected: boolean};
};
export type RepeatState = 'off' | 'track' | 'context';
export type PlaybackState = {
  isPlaying: boolean;
  progressMs: number;
  readAt: number;
  shuffle: boolean;
  repeat: RepeatState;
  device: {id: string; name: string; volume: number} | null;
  track: {
    id: string;
    uri: string;
    name: string;
    artists: string;
    album: string;
    artwork: string | null;
    durationMs: number;
  } | null;
  contextUri: string | null;
};
export type SpotifyDevice = {id: string; name: string; isActive: boolean; volume: number};
export type SpotifyPlaylist = {id: string; uri: string; name: string; image: string | null};
export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  artwork: string | null;
};
export type Light = {id: string; name: string; on: boolean; reachable: boolean; brightness: number; hasColor: boolean};
export type HueState = {on?: boolean; color?: string; brightness?: number};

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
      devices: () => call<SpotifyDevice[]>('GET', '/spotify/devices'),
      playlists: () => call<SpotifyPlaylist[]>('GET', '/spotify/playlists'),
      search: (query: string) => call<SpotifyTrack[]>('GET', `/spotify/search?${new URLSearchParams({q: query})}`),
    },
  };
};

export type Api = ReturnType<typeof createApi>;
