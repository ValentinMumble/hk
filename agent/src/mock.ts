import {HK_COMMANDS} from './hk.js';
import type {Devices, HueState, Light, PlaybackState, SpotifyDevice, SpotifyPlaylist, SpotifyTrack} from './types.js';

/** A colourful placeholder so the artwork effects can be seen without Spotify. */
const MOCK_ART =
  'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 300%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop offset=%220%22 stop-color=%22%23ff5e3a%22/%3E%3Cstop offset=%220.5%22 stop-color=%22%23b980ff%22/%3E%3Cstop offset=%221%22 stop-color=%22%2301a7c2%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22300%22 height=%22300%22 fill=%22url(%23g)%22/%3E%3Ccircle cx=%22150%22 cy=%22150%22 r=%2270%22 fill=%22%23ffd166%22/%3E%3C/svg%3E';

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
    {
      id: 't1',
      uri: 'spotify:track:t1',
      name: 'Mock Song',
      artists: 'The Mocks',
      album: 'Mockumentary',
      artwork: MOCK_ART,
    },
    {
      id: 't2',
      uri: 'spotify:track:t2',
      name: 'A Very Long Second Take That Keeps Going On (feat. Somebody Famous) - 2011 Remastered Version',
      artists: 'Stub & Fake and the Placeholder Philharmonic Orchestra',
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
      queue: async () => tracks.filter((_track, index) => index !== trackIndex),
      addToQueue: async uri => {
        console.log(`[mock] Spotify queue ${uri}`);
      },
      radio: async trackId => {
        console.log(`[mock] Spotify radio from ${trackId}`);
        playback.isPlaying = true;

        return 49;
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
