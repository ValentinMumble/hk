export type HueState = {
  on?: boolean;
  color?: string;
  brightness?: number;
  /** Cycle through hues (colour lights only). */
  effect?: 'colorloop' | 'none';
  /** One blink, or breathe for 15 s. */
  alert?: 'select' | 'lselect' | 'none';
  /** Fade duration in seconds. */
  transition?: number;
};

export type Light = {
  id: string;
  name: string;
  on: boolean;
  reachable: boolean;
  /** 0-100 */
  brightness: number;
  hasColor: boolean;
  /** Current colour at full brightness, or the white it produces, for display. */
  color: string;
};

export type Hue = {
  lights(): Promise<Light[]>;
  /** Apply a state to every light at once (Hue group 0). */
  setAll(state: HueState): Promise<void>;
  setLight(id: string, state: HueState): Promise<void>;
  /** Flip one light and return its new on/off state. */
  toggle(id: string): Promise<boolean>;
};

export type Hk = {
  /** Send a command; resolves with the device reply for the few commands that answer. */
  send(command: string, para?: string): Promise<string | undefined>;
};

export type PlaybackState = {
  isPlaying: boolean;
  /** Position in the track when the state was read, with the time it was read. */
  progressMs: number;
  readAt: number;
  shuffle: boolean;
  repeat: 'off' | 'track' | 'context';
  device: {id: string; name: string; volume: number} | null;
  track: {
    id: string;
    uri: string;
    name: string;
    artists: string;
    album: string;
    artwork: string | null;
    durationMs: number;
    /** In the user's Liked Songs. */
    saved: boolean;
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

export type Spotify = {
  connected(): boolean;
  authorizeUrl(redirectUri: string, state: string): string;
  authorize(code: string, redirectUri: string): Promise<void>;
  logout(): void;
  state(): Promise<PlaybackState>;
  play(body: {uri?: string; contextUri?: string}): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  volume(percent: number): Promise<void>;
  shuffle(state: boolean): Promise<void>;
  repeat(state: PlaybackState['repeat']): Promise<void>;
  transfer(deviceId: string, play: boolean): Promise<void>;
  /** Add to or remove from Liked Songs. */
  like(trackId: string, saved: boolean): Promise<void>;
  devices(): Promise<SpotifyDevice[]>;
  playlists(): Promise<SpotifyPlaylist[]>;
  search(query: string): Promise<SpotifyTrack[]>;
};

export type LyricsResult = {title: string; artist: string; url: string; lyrics: string};

export type Lyrics = {
  lookup(artist: string, title: string): Promise<LyricsResult>;
};

export type Devices = {hk: Hk; hue: Hue; spotify: Spotify | null; lyrics: Lyrics | null};
