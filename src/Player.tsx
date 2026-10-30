import {useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent} from 'react';
import type {Api, PlaybackState, Playhead, SpotifyDevice, SpotifyPlaylist, SpotifyTrack} from './api';
import {dominantColor} from './artwork';
import {Icon} from './Icon';
import {Marquee} from './Marquee';
import {attempt, toast} from './toast';

const POLL_MS = 2000;
const AFTER_ACTION_MS = 400;
const VOLUME_STEP = 5;
const DOUBLE_TAP_MS = 280;
/** How long a play or pause tap wins over reads that do not show it yet: Spotify takes a moment to catch up. */
const PENDING_PLAY_MS = 3000;
const STATE_KEY = 'hk.spotify.state';
const RING = 2 * Math.PI * 48;

type PlayerProps = {
  api: Api;
  connected: boolean;
  onConnected: () => void;
  onPlayhead: (playhead: Playhead) => void;
};

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** A trailing segment is a version note only when it reads like one; otherwise it is part of the title. */
const VERSION_NOTE =
  /\b(remaster(ed)?|live|edit|version|mix|remix|mono|stereo|demo|acoustic|instrumental|radio|single|bonus|deluxe|anniversary|re-?record(ed|ing)?|feat\.?|featuring|from|session|take|alternate|extended|original|sped up|slowed|cover|karaoke|explicit|clean|\d{4})\b/i;

/**
 * Split "Song (feat. X) - 2011 Remaster" into the title and its version notes, shown smaller. Only trailing
 * groups that look like version notes are taken: "Hot - Blooded", "Song (Part II)" and "(Don't Fear) The Reaper"
 * keep their text.
 */
const splitTitle = (name: string): {title: string; extras: string[]} => {
  let title = name.trim();
  const extras: string[] = [];

  for (;;) {
    const match = title.match(/^(.+?)\s+(?:\(([^()]*)\)|\[([^\]]*)\])$/) ?? title.match(/^(.+)\s+-\s+(.+)$/);
    const extra = match ? (match[2] ?? match[3]).trim() : '';

    if (!match || !VERSION_NOTE.test(extra)) break;

    extras.unshift(extra);
    title = match[1].trim();
  }

  return {title, extras};
};

/** Redirect URI registered in the Spotify dashboard: the app's own origin. */
const redirectUri = () => `${window.location.origin}/`;

/**
 * One blurred copy of the album art behind the whole app (kept across tabs, the element lives outside React). It fades
 * in only once the picture is decoded: fading an image that is still loading makes it pop in at the end.
 */
const setBackdrop = async (artwork: string | null) => {
  let image = document.querySelector<HTMLImageElement>('img.backdrop');

  if (!image) {
    image = document.createElement('img');
    image.className = 'backdrop';
    image.alt = '';
    document.body.prepend(image);
  }

  if (!artwork) {
    image.classList.remove('visible');

    return;
  }

  image.src = artwork;

  try {
    await image.decode();
  } catch {
    return;
  }

  // A newer song may have replaced the picture meanwhile; its own call shows it
  if (image.src === artwork) image.classList.add('visible');
};

export const Player = ({api, connected, onConnected, onPlayhead}: PlayerProps) => {
  const [state, setState] = useState<PlaybackState | null>(null);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [isLoggingIn, setLoggingIn] = useState(false);
  const artworkRef = useRef<string | null>(null);
  const volumeTimer = useRef<number | undefined>(undefined);
  const tapTimer = useRef<number | undefined>(undefined);
  const [isPopping, setPopping] = useState(false);

  const pendingPlay = useRef<{isPlaying: boolean; until: number} | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.spotify.state();
      const pending = pendingPlay.current;

      if (pending && next.isPlaying !== pending.isPlaying && Date.now() < pending.until) return;

      pendingPlay.current = null;
      setState(next);
      setVolume(current =>
        null === current || undefined === volumeTimer.current ? (next.device?.volume ?? current) : current,
      );
    } catch (error) {
      // keep the last known state, the next poll retries
      console.warn(error);
    }
  }, [api]);

  // Finish the Spotify login when we come back with ?code=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const expectedState = window.sessionStorage.getItem(STATE_KEY);

    if (!code) return;

    window.history.replaceState(null, '', window.location.pathname + window.location.hash);

    if (params.get('state') !== expectedState) return;

    attempt(async () => {
      await api.spotify.authorize(code, redirectUri());
      window.sessionStorage.removeItem(STATE_KEY);
      onConnected();
    }, '🎧 Spotify connected');
  }, [api, onConnected]);

  // Poll while visible
  useEffect(() => {
    if (!connected) return;

    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if ('visible' === document.visibilityState) await refresh();
        schedule();
      }, POLL_MS);
    };

    refresh();
    schedule();
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [connected, refresh]);

  // Local progress between polls
  useEffect(() => {
    if (!state) return;

    const update = () => setProgress(state.isPlaying ? state.progressMs + Date.now() - state.readAt : state.progressMs);
    update();
    const timer = window.setInterval(update, 500);

    return () => window.clearInterval(timer);
  }, [state]);

  // Tell the app which song plays and where (once known): the lyrics tab loads it at once and follows along
  useEffect(() => {
    if (!state) return;

    onPlayhead({
      trackId: state.track?.id ?? null,
      progressMs: state.progressMs,
      readAt: state.readAt,
      isPlaying: state.isPlaying,
    });
  }, [state, onPlayhead]);

  // Accent from the artwork, and the artwork itself as the app's blurred backdrop
  useEffect(() => {
    const artwork = state?.track?.artwork ?? null;

    if (artwork === artworkRef.current) return;

    artworkRef.current = artwork;
    setBackdrop(artwork);

    if (!artwork) {
      document.documentElement.style.removeProperty('--accent');

      return;
    }

    dominantColor(artwork)
      .then(color =>
        color
          ? document.documentElement.style.setProperty('--accent', color)
          : document.documentElement.style.removeProperty('--accent'),
      )
      .catch(() => undefined);
  }, [state?.track?.artwork]);

  const act = (action: () => Promise<unknown>, label?: string) =>
    attempt(async () => {
      await action();
      window.setTimeout(refresh, AFTER_ACTION_MS);
    }, label);

  const [isRadioBusy, setRadioBusy] = useState(false);

  // Finding and queueing the songs takes a few seconds: the button pulses meanwhile and further taps are ignored
  const startRadio = async () => {
    if (!track || isRadioBusy) return;

    const title = splitTitle(track.name).title;
    setRadioBusy(true);
    await attempt(async () => {
      const {queued} = await api.spotify.radio(track.id);
      toast(`📻 ${queued} songs like ${title} queued`);
      window.setTimeout(refresh, AFTER_ACTION_MS);
      window.setTimeout(loadQueue, AFTER_ACTION_MS);
    });
    setRadioBusy(false);
  };

  const login = async () => {
    setLoggingIn(true);

    try {
      const nonce = Math.random().toString(36).slice(2);
      window.sessionStorage.setItem(STATE_KEY, nonce);
      const {url} = await api.spotify.authUrl(redirectUri(), nonce);
      window.location.assign(url);
    } catch (error) {
      setLoggingIn(false);
      attempt(() => Promise.reject(error));
    }
  };

  /** Like needs the library scopes; a session from before they existed is logged out so the next login asks for them. */
  const like = (track: NonNullable<PlaybackState['track']>) =>
    attempt(
      async () => {
        const saved = !track.saved;
        setState(current => (current?.track ? {...current, track: {...current.track, saved}} : current));

        try {
          await api.spotify.like(track.id, saved);
        } catch (error) {
          if (error instanceof Error && /scope/i.test(error.message)) {
            await api.spotify.logout();
            onConnected();
            throw new Error('Reconnect Spotify to like songs');
          }
          throw error;
        }
      },
      track.saved ? '💔 Removed from Liked Songs' : '💚 Liked',
    );

  /** One tap on the disc plays or pauses, two taps like the track. */
  const tapDisc = () => {
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;

      if (track) {
        setPopping(true);
        window.setTimeout(() => setPopping(false), 600);
        like(track);
      }

      return;
    }

    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      togglePlay();
    }, DOUBLE_TAP_MS);
  };

  // Flips at once: the button, the paused look and the clock change before Spotify answers; a failure puts them back
  const togglePlay = () => {
    if (!state) return act(() => api.spotify.play());

    const wasPlaying = state.isPlaying;
    const now = Date.now();
    const position = wasPlaying ? state.progressMs + now - state.readAt : state.progressMs;
    pendingPlay.current = {isPlaying: !wasPlaying, until: now + PENDING_PLAY_MS};
    setState(current => current && {...current, isPlaying: !wasPlaying, progressMs: position, readAt: now});

    act(async () => {
      try {
        await (wasPlaying ? api.spotify.pause() : api.spotify.play());
      } catch (error) {
        pendingPlay.current = null;
        setState(current => current && {...current, isPlaying: wasPlaying});
        throw error;
      }
    });
  };

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    if (!state?.track) return;

    const {left, width} = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - left) / width));
    act(() => api.spotify.seek(ratio * state.track!.durationMs));
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    window.clearTimeout(volumeTimer.current);
    volumeTimer.current = window.setTimeout(() => {
      volumeTimer.current = undefined;
      act(() => api.spotify.volume(value));
    }, 300);
  };

  const stepVolume = (delta: number) =>
    changeVolume(Math.min(100, Math.max(0, (volume ?? state?.device?.volume ?? 50) + delta)));

  const loadDevices = useCallback(() => {
    api.spotify
      .devices()
      .then(setDevices)
      .catch(() => undefined);
  }, [api]);

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);

  // The agent puts Liked Songs first among the user's playlists
  const loadPlaylists = useCallback(async () => {
    try {
      setPlaylists(await api.spotify.playlists());
    } catch {
      // the menu keeps the list it had
    }
  }, [api]);

  useEffect(() => {
    if (!connected) return;

    loadDevices();
    loadPlaylists();
  }, [connected, loadDevices, loadPlaylists]);

  // Up next: read again for each new song, after a radio, and when the menu opens
  const [queue, setQueue] = useState<SpotifyTrack[]>([]);
  const playingId = state?.track?.id ?? null;

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await api.spotify.queue());
    } catch {
      // the line keeps what it had
    }
  }, [api]);

  useEffect(() => {
    if (connected && playingId) loadQueue();
  }, [connected, playingId, loadQueue]);

  /** Spotify cannot jump into its queue, so skip to the song one track at a time. */
  const skipTo = (index: number) => {
    const target = queue[index];

    if (!target) return;

    act(
      async () => {
        for (let step = 0; step <= index; step += 1) await api.spotify.next();
      },
      `⏭️ ${splitTitle(target.name).title}`,
    );
  };

  const playPlaylist = (uri: string) => {
    const playlist = playlists.find(candidate => candidate.uri === uri);

    if (playlist) act(() => api.spotify.play({contextUri: playlist.uri}), `▶️ ${playlist.name}`);
  };

  const transferTo = (deviceId: string) => {
    const device = devices.find(candidate => candidate.id === deviceId);

    if (!device || device.id === state?.device?.id) return;

    act(() => api.spotify.transfer(device.id, state?.isPlaying ?? false), `🔈 ${device.name}`);
  };

  /** The active device is always listed, even before the device list has loaded. */
  const deviceOptions =
    state?.device && !devices.some(device => device.id === state.device?.id)
      ? [{id: state.device.id, name: state.device.name, isActive: true, volume: state.device.volume}, ...devices]
      : devices;

  if (!connected) {
    return (
      <section className="panel">
        <header className="panel-header">
          <h2>Spotify</h2>
        </header>
        <button type="button" className="chip on" disabled={isLoggingIn} onClick={login}>
          {isLoggingIn ? 'Opening Spotify…' : 'Connect Spotify'}
        </button>
      </section>
    );
  }

  const track = state?.track ?? null;
  const duration = track?.durationMs ?? 0;
  const upNext = queue[0] ?? null;
  const ratio = duration ? Math.min(1, progress / duration) : 0;

  return (
    <section className="panel">
      <div className={`player ${state?.isPlaying ? '' : 'paused'}`}>
        <div className="player-top">
          <h2>
            <a className="app-link" href="spotify:" title="Open the Spotify app">
              Spotify
            </a>
          </h2>
          <label className="status select-wrap">
            <Icon name="speaker" /> {state?.device?.name ?? 'no device'}
            <select
              value={state?.device?.id ?? ''}
              aria-label="Spotify Connect device"
              onPointerDown={loadDevices}
              onChange={event => transferTo(event.target.value)}
            >
              {!state?.device && <option value="">No device</option>}
              {deviceOptions.map(device => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="player-middle">
          <button
            type="button"
            className="disc"
            aria-label={state?.isPlaying ? 'Pause (double tap to like)' : 'Play (double tap to like)'}
            onClick={tapDisc}
          >
            {track?.artwork ? (
              <img key={track.artwork} src={track.artwork} alt="" />
            ) : (
              <div className={`disc-empty ${state ? '' : 'skeleton'}`} />
            )}
            {isPopping && (
              <span className="pop" aria-hidden="true">
                <Icon name="heart" filled />
              </span>
            )}
            <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="ring-track" cx="50" cy="50" r="48" />
              <circle
                className="ring-fill"
                cx="50"
                cy="50"
                r="48"
                style={{strokeDasharray: `${ratio * RING} ${RING}`}}
              />
            </svg>
          </button>
        </div>
        <div className="player-bottom">
          {!state && (
            <>
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-artist" />
            </>
          )}
          <Marquee className="player-title">
            {track ? splitTitle(track.name).title : state ? 'Nothing playing' : ''}
            {track && splitTitle(track.name).extras.length > 0 && (
              <span className="title-extra">{splitTitle(track.name).extras.join(' · ')}</span>
            )}
            {track?.saved && (
              <span className="liked" title="In Liked Songs">
                <Icon name="heart" filled />
              </span>
            )}
          </Marquee>
          <Marquee className="player-artist">{track?.artists ?? ''}</Marquee>
          <div className="seek" onClick={seek} role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
            <div className="seek-fill" style={{width: `${ratio * 100}%`}} />
          </div>
          <div className="player-times">
            <span>{formatTime(progress)}</span>
            {upNext ? (
              <label className="up-next select-wrap">
                <span>
                  Next · {splitTitle(upNext.name).title} · {upNext.artists}
                </span>
                <select
                  value=""
                  aria-label="Up next"
                  onPointerDown={loadQueue}
                  onChange={event => skipTo(Number(event.target.value))}
                >
                  <option value="">Up next…</option>
                  {queue.map((item, index) => (
                    <option key={`${item.id}-${index}`} value={index}>
                      {splitTitle(item.name).title} · {item.artists}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="up-next" />
            )}
            <span>-{formatTime(Math.max(0, duration - progress))}</span>
          </div>
          <div className="row transport">
            <button
              type="button"
              className={`round small ${isRadioBusy ? 'busy' : ''}`}
              aria-label="Queue songs like this one"
              aria-busy={isRadioBusy}
              disabled={!track || isRadioBusy}
              onClick={startRadio}
            >
              <Icon name="radio" />
            </button>
            <button
              type="button"
              className="round"
              aria-label="Previous"
              onClick={() => act(() => api.spotify.previous())}
            >
              <Icon name="previous" />
            </button>
            <button
              type="button"
              className="round big play"
              aria-label={state?.isPlaying ? 'Pause' : 'Play'}
              onClick={togglePlay}
            >
              <Icon name={state?.isPlaying ? 'pause' : 'play'} />
            </button>
            <button type="button" className="round" aria-label="Next" onClick={() => act(() => api.spotify.next())}>
              <Icon name="next" />
            </button>
            <label className="round small select-wrap">
              <Icon name="list" />
              <select
                value=""
                aria-label="Playlists"
                onPointerDown={loadPlaylists}
                onChange={event => playPlaylist(event.target.value)}
              >
                <option value="">Playlists…</option>
                {playlists.map(playlist => (
                  <option key={playlist.id} value={playlist.uri}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row volume-row">
            <button type="button" className="step" aria-label="Volume down" onClick={() => stepVolume(-VOLUME_STEP)}>
              <Icon name="volumeDown" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume ?? 0}
              style={{'--value': `${volume ?? 0}%`} as CSSProperties}
              aria-label="Spotify volume"
              onChange={event => changeVolume(Number(event.target.value))}
            />
            <button type="button" className="step" aria-label="Volume up" onClick={() => stepVolume(VOLUME_STEP)}>
              <Icon name="volumeUp" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
