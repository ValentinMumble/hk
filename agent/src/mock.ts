import {HK_COMMANDS} from './hk.js';
import type {Devices, HueState, Light, PlaybackState, SpotifyDevice, SpotifyPlaylist, SpotifyTrack} from './types.js';

const STATUS_REPLY =
  '<?xml version="1.0" encoding="UTF-8"?><harman><avr><common><status><name>heart-alive</name><zone>Main Zone</zone><para>on</para></status></common></avr></harman>';

/** Fake devices so the web app can be developed without the amp or the bridge. */
export const createMockDevices = (): Devices => {
  const lights: Light[] = [
    {id: '1', name: 'Boule', on: false, reachable: true, brightness: 100, hasColor: true, color: '#01a7c2'},
    {id: '2', name: 'Strip', on: true, reachable: true, brightness: 60, hasColor: true, color: '#ff96ca'},
    {id: '3', name: 'Pied', on: false, reachable: true, brightness: 100, hasColor: false, color: '#ffe9c4'},
    {id: '4', name: 'Applique', on: false, reachable: false, brightness: 100, hasColor: false, color: '#ffe9c4'},
    {id: '5', name: 'Porte', on: true, reachable: true, brightness: 86, hasColor: false, color: '#ffd1a0'},
  ];

  const find = (id: string): Light => {
    const light = lights.find(candidate => candidate.id === id);

    if (!light) throw new Error(`Hue: light ${id} not found`);

    return light;
  };

  const apply = (light: Light, {on, brightness, color, effect, alert}: HueState) => {
    if (undefined !== on) light.on = on;
    if (undefined !== brightness) light.brightness = brightness;
    if (undefined !== color && light.hasColor) light.color = color;
    if (effect || alert) console.log(`[mock] Hue ${light.name} effect=${effect ?? '-'} alert=${alert ?? '-'}`);
  };

  const tracks: SpotifyTrack[] = [
    {id: 't1', uri: 'spotify:track:t1', name: 'Mock Song', artists: 'The Mocks', album: 'Mockumentary', artwork: null},
    {
      id: 't2',
      uri: 'spotify:track:t2',
      name: 'Second Take',
      artists: 'Stub & Fake',
      album: 'Placeholder',
      artwork: null,
    },
  ];
  const spotifyDevices: SpotifyDevice[] = [
    {id: 'd1', name: 'Volumio', isActive: true, volume: 40},
    {id: 'd2', name: 'MacMumble', isActive: false, volume: 100},
  ];
  const playlists: SpotifyPlaylist[] = [
    {id: 'p1', uri: 'spotify:playlist:p1', name: 'OK', image: null},
    {id: 'p2', uri: 'spotify:playlist:p2', name: 'Discover Weekly', image: null},
  ];
  let connected = true;
  let trackIndex = 0;
  let playback: PlaybackState = {
    isPlaying: true,
    progressMs: 30_000,
    readAt: Date.now(),
    shuffle: false,
    repeat: 'off',
    device: {id: 'd1', name: 'Volumio', volume: 40},
    track: {...tracks[0], durationMs: 180_000, saved: false},
    contextUri: null,
  };

  /** Advance the position as time passes, loop at the end. */
  const tick = (): PlaybackState => {
    const now = Date.now();

    if (playback.isPlaying && playback.track) {
      playback.progressMs = (playback.progressMs + now - playback.readAt) % playback.track.durationMs;
    }
    playback.readAt = now;

    return {
      ...playback,
      track: playback.track ? {...playback.track} : null,
      device: playback.device ? {...playback.device} : null,
    };
  };

  const skip = (direction: 1 | -1) => {
    trackIndex = (trackIndex + direction + tracks.length) % tracks.length;
    playback.track = {...tracks[trackIndex], durationMs: 180_000, saved: false};
    playback.progressMs = 0;
    playback.readAt = Date.now();
  };

  return {
    lyrics: {
      lookup: async (artist, title) => ({
        title,
        artist,
        url: 'https://genius.com/',
        lyrics:
          '[Verse 1]\nThis is a mock song\nWith mock lyrics that go on\n\n[Chorus]\nLa la la, mock mock mock\nLa la la, around the clock',
      }),
    },
    spotify: {
      connected: () => connected,
      authorizeUrl: (redirectUri, state) => `${redirectUri}?code=mock&state=${encodeURIComponent(state)}`,
      authorize: async () => {
        connected = true;
      },
      logout: () => {
        connected = false;
      },
      state: async () => tick(),
      play: async ({uri, contextUri}) => {
        tick();
        if (uri) {
          const found = tracks.find(track => track.uri === uri);
          if (found) {
            trackIndex = tracks.indexOf(found);
            playback.track = {...found, durationMs: 180_000, saved: false};
            playback.progressMs = 0;
          }
        }
        if (contextUri) playback.contextUri = contextUri;
        playback.isPlaying = true;
      },
      pause: async () => {
        tick();
        playback.isPlaying = false;
      },
      next: async () => skip(1),
      previous: async () => skip(-1),
      seek: async positionMs => {
        playback.progressMs = positionMs;
        playback.readAt = Date.now();
      },
      volume: async percent => {
        if (playback.device) playback.device.volume = percent;
      },
      shuffle: async state => {
        playback.shuffle = state;
      },
      repeat: async state => {
        playback.repeat = state;
      },
      transfer: async (deviceId, play) => {
        const device = spotifyDevices.find(candidate => candidate.id === deviceId);
        if (device) playback.device = {id: device.id, name: device.name, volume: device.volume};
        playback.isPlaying = play;
      },
      like: async (_trackId, saved) => {
        if (playback.track) playback.track.saved = saved;
      },
      devices: async () => spotifyDevices.map(device => ({...device, isActive: device.id === playback.device?.id})),
      playlists: async () => playlists,
      search: async query =>
        tracks.filter(track => `${track.name} ${track.artists}`.toLowerCase().includes(query.toLowerCase())),
    },
    hk: {
      send: async (command, para) => {
        console.log(`[mock] HK ${command}${para ? ` "${para}"` : ''}`);

        return HK_COMMANDS[command]?.hasResponse ? STATUS_REPLY : undefined;
      },
    },
    hue: {
      lights: async () => lights.map(light => ({...light})),
      setAll: async state => {
        console.log('[mock] Hue all', state);
        lights.forEach(light => apply(light, state));
      },
      setLight: async (id, state) => {
        console.log(`[mock] Hue light ${id}`, state);
        apply(find(id), state);
      },
      toggle: async id => {
        const light = find(id);
        light.on = !light.on;
        console.log(`[mock] Hue toggle ${id} -> ${light.on}`);

        return light.on;
      },
    },
  };
};
