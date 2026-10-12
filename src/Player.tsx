import {useCallback, useEffect, useRef, useState, type MouseEvent} from 'react';
import type {Api, PlaybackState, Playhead, SpotifyDevice} from './api';
import {dominantColor} from './artwork';
import {Icon} from './Icon';
import {Marquee} from './Marquee';
import {attempt} from './toast';

const POLL_MS = 2000;
const AFTER_ACTION_MS = 400;
const VOLUME_STEP = 5;
const DOUBLE_TAP_MS = 280;
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

/** One blurred copy of the album art behind the whole app (kept across tabs, the element lives outside React). */
const setBackdrop = (artwork: string | null) => {
  let image = document.querySelector<HTMLImageElement>('img.backdrop');

  if (!image) {
    image = document.createElement('img');
    image.className = 'backdrop';
    image.alt = '';
    document.body.prepend(image);
  }

  if (artwork) {
    image.src = artwork;
    image.classList.add('visible');
  } else {
    image.classList.remove('visible');
  }
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
      act(() => (state?.isPlaying ? api.spotify.pause() : api.spotify.play()));
    }, DOUBLE_TAP_MS);
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

  useEffect(() => {
    if (!connected) return;

    loadDevices();
  }, [connected, loadDevices]);

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
            {track?.artwork ? <img key={track.artwork} src={track.artwork} alt="" /> : <div className="disc-empty" />}
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
          <Marquee className="player-title">
            {track ? splitTitle(track.name).title : state ? 'Nothing playing' : '…'}
            {track && splitTitle(track.name).extras.length > 0 && (
              <span className="title-extra">{splitTitle(track.name).extras.join(' · ')}</span>
            )}
            {track?.saved && (
              <span className="liked" title="In Liked Songs">
                <Icon name="heart" filled />
              </span>
            )}
          </Marquee>
          <button
            type="button"
            className="artist-button"
            disabled={!track}
            title="Play songs like this one"
            onClick={() =>
              track && act(() => api.spotify.radio(track.id), `📻 Songs like ${splitTitle(track.name).title}`)
            }
          >
            <Marquee className="player-artist">{track?.artists ?? ''}</Marquee>
          </button>
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
            <button type="button" className="step" aria-label="Volume down" onClick={() => stepVolume(-VOLUME_STEP)}>
              <Icon name="volumeDown" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume ?? 0}
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
