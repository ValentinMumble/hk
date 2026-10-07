import {useCallback, useEffect, useRef, useState, type MouseEvent} from 'react';
import type {Api, PlaybackState, RepeatState, SpotifyDevice, SpotifyPlaylist} from './api';
import {dominantColor} from './artwork';
import {Icon} from './Icon';
import {attempt} from './toast';

const POLL_MS = 2000;
const AFTER_ACTION_MS = 400;
const STATE_KEY = 'hk.spotify.state';
const RING = 2 * Math.PI * 48;

type PlayerProps = {api: Api; connected: boolean; onConnected: () => void};

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const nextRepeat = (state: RepeatState): RepeatState =>
  'off' === state ? 'context' : 'context' === state ? 'track' : 'off';

/** Redirect URI registered in the Spotify dashboard: the app's own origin. */
const redirectUri = () => `${window.location.origin}/`;

export const Player = ({api, connected, onConnected}: PlayerProps) => {
  const [state, setState] = useState<PlaybackState | null>(null);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [isLoggingIn, setLoggingIn] = useState(false);
  const artworkRef = useRef<string | null>(null);
  const volumeTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const next = await api.spotify.state();
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

  // Accent from the artwork
  useEffect(() => {
    const artwork = state?.track?.artwork ?? null;

    if (artwork === artworkRef.current) return;

    artworkRef.current = artwork;

    if (!artwork) return;

    dominantColor(artwork)
      .then(color => document.documentElement.style.setProperty('--accent', color))
      .catch(() => undefined);
  }, [state?.track?.artwork]);

  const act = (action: () => Promise<unknown>, label?: string) =>
    attempt(async () => {
      await action();
      window.setTimeout(refresh, AFTER_ACTION_MS);
    }, label);

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

  const openDevices = async () => {
    if (devices) return setDevices(null);

    setPlaylists(null);
    await attempt(async () => setDevices(await api.spotify.devices()));
  };

  const openPlaylists = async () => {
    if (playlists) return setPlaylists(null);

    setDevices(null);
    await attempt(async () => setPlaylists(await api.spotify.playlists()));
  };

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
  const ratio = duration ? Math.min(1, progress / duration) : 0;

  return (
    <section className="panel">
      <div className={`player ${state?.isPlaying ? '' : 'paused'}`}>
        {track?.artwork && <img key={`bg-${track.artwork}`} className="player-bg" src={track.artwork} alt="" />}
        <div className="player-top">
          <h2>Spotify</h2>
          <button type="button" className="status" onClick={openDevices}>
            <Icon name="speaker" /> {state?.device?.name ?? 'no device'}
          </button>
        </div>
        <button
          type="button"
          className="disc"
          aria-label={state?.isPlaying ? 'Pause' : 'Play'}
          onClick={() => act(() => (state?.isPlaying ? api.spotify.pause() : api.spotify.play()))}
        >
          {track?.artwork ? <img key={track.artwork} src={track.artwork} alt="" /> : <div className="disc-empty" />}
          <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="ring-track" cx="50" cy="50" r="48" />
            <circle className="ring-fill" cx="50" cy="50" r="48" style={{strokeDasharray: `${ratio * RING} ${RING}`}} />
          </svg>
        </button>
        <div className="player-bottom">
          <div className="player-title">{track?.name ?? (state ? 'Nothing playing' : '…')}</div>
          <div className="player-artist">{track?.artists ?? ''}</div>
          <div className="seek" onClick={seek} role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
            <div className="seek-fill" style={{width: `${ratio * 100}%`}} />
          </div>
          <div className="player-times">
            <span>{formatTime(progress)}</span>
            <span>-{formatTime(Math.max(0, duration - progress))}</span>
          </div>
          <div className="row">
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
              onClick={() => act(() => (state?.isPlaying ? api.spotify.pause() : api.spotify.play()))}
            >
              <Icon name={state?.isPlaying ? 'pause' : 'play'} />
            </button>
            <button type="button" className="round" aria-label="Next" onClick={() => act(() => api.spotify.next())}>
              <Icon name="next" />
            </button>
          </div>
          <div className="row volume-row">
            <button
              type="button"
              className={`round small ${state?.shuffle ? '' : 'muted'}`}
              aria-label="Shuffle"
              onClick={() => act(() => api.spotify.shuffle(!state?.shuffle))}
            >
              <Icon name="shuffle" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume ?? 0}
              aria-label="Spotify volume"
              onChange={event => changeVolume(Number(event.target.value))}
            />
            <button
              type="button"
              className={`round small ${'off' === state?.repeat ? 'muted' : ''}`}
              aria-label="Repeat"
              onClick={() => act(() => api.spotify.repeat(nextRepeat(state?.repeat ?? 'off')))}
            >
              <Icon name="repeat" />
              {'track' === state?.repeat && <span className="badge">1</span>}
            </button>
            <button type="button" className="round small" aria-label="Playlists" onClick={openPlaylists}>
              <Icon name="list" />
            </button>
          </div>
        </div>
      </div>
      {devices && (
        <div className="row">
          {devices.map(device => (
            <button
              key={device.id}
              type="button"
              className={`chip ${device.isActive ? 'on' : ''}`}
              onClick={() => {
                setDevices(null);
                act(() => api.spotify.transfer(device.id, state?.isPlaying ?? false), `🔈 ${device.name}`);
              }}
            >
              {device.name}
            </button>
          ))}
          {0 === devices.length && <span className="status">No Spotify Connect device online</span>}
        </div>
      )}
      {playlists && (
        <div className="row">
          {playlists.map(playlist => (
            <button
              key={playlist.id}
              type="button"
              className={`chip ${playlist.uri === state?.contextUri ? 'on' : ''}`}
              onClick={() => {
                setPlaylists(null);
                act(() => api.spotify.play({contextUri: playlist.uri}), `▶️ ${playlist.name}`);
              }}
            >
              {playlist.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
