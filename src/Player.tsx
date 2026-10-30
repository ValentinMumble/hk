import {useEffect, useRef, useState, type CSSProperties, type MouseEvent} from 'react';
import type {Api, PlaybackState, Playhead} from './api';
import {Icon} from './Icon';
import {Marquee} from './Marquee';
import {Sheet} from './Sheet';
import {formatTime, splitTitle} from './title';
import {attempt, toast} from './toast';
import {useArtwork} from './useArtwork';
import {usePlayback} from './usePlayback';
import {useSpotifyLists} from './useSpotifyLists';
import {useSpotifyLogin} from './useSpotifyLogin';
import './Player.css';

const AFTER_ACTION_MS = 400;
const VOLUME_STEP = 5;
const DOUBLE_TAP_MS = 280;
const RING = 2 * Math.PI * 48;

type PlayerProps = {
  api: Api;
  connected: boolean;
  onConnected: () => void;
  onPlayhead: (playhead: Playhead) => void;
};

export const Player = ({api, connected, onConnected, onPlayhead}: PlayerProps) => {
  const {state, setState, progress, volume, refresh, act, togglePlay, seekTo, changeVolume, stepVolume} = usePlayback(
    api,
    connected,
  );
  const track = state?.track ?? null;
  const {devices, playlists, queue, loadDevices, loadPlaylists, loadQueue} = useSpotifyLists(
    api,
    connected,
    track?.id ?? null,
  );
  const {isLoggingIn, login} = useSpotifyLogin(api, onConnected);
  const nextAccent = useArtwork(track?.artwork ?? null);
  const [isRadioBusy, setRadioBusy] = useState(false);
  const [isQueueOpen, setQueueOpen] = useState(false);
  const [isPopping, setPopping] = useState(false);
  const tapTimer = useRef<number | undefined>(undefined);

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

  /** Like needs the library scopes; a session from before they existed is logged out so the next login asks for them. */
  const like = (liked: NonNullable<PlaybackState['track']>) =>
    attempt(
      async () => {
        const saved = !liked.saved;
        setState(current => (current?.track ? {...current, track: {...current.track, saved}} : current));

        try {
          await api.spotify.like(liked.id, saved);
        } catch (error) {
          if (error instanceof Error && /scope/i.test(error.message)) {
            await api.spotify.logout();
            onConnected();
            throw new Error('Reconnect Spotify to like songs');
          }
          throw error;
        }
      },
      liked.saved ? '💔 Removed from Liked Songs' : '💚 Liked',
    );

  /** One tap on the artwork moves the accent to the cover's next colour, two taps like the song. */
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
      nextAccent();
    }, DOUBLE_TAP_MS);
  };

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    if (!track) return;

    const {left, width} = event.currentTarget.getBoundingClientRect();
    seekTo(Math.min(1, Math.max(0, (event.clientX - left) / width)) * track.durationMs);
  };

  /** Spotify cannot jump into its queue, so skip to the song one track at a time. */
  const skipTo = (index: number) => {
    const target = queue[index];

    if (!target) return;

    setQueueOpen(false);
    act(
      async () => {
        for (let step = 0; step <= index; step += 1) await api.spotify.next();
      },
      `⏭️ ${splitTitle(target.name).title}`,
    );
  };

  const openQueue = () => {
    loadQueue();
    setQueueOpen(true);
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
        <button type="button" className="chip glass on" disabled={isLoggingIn} onClick={login}>
          {isLoggingIn ? 'Opening Spotify…' : 'Connect Spotify'}
        </button>
      </section>
    );
  }

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
          <button type="button" className="disc" aria-label="Next accent colour (double tap to like)" onClick={tapDisc}>
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
          {/* a tap on the title likes the song, or takes it out of Liked Songs */}
          <Marquee className="player-title" onClick={track ? () => like(track) : undefined}>
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
            <span>-{formatTime(Math.max(0, duration - progress))}</span>
          </div>
          {upNext && (
            <button type="button" className="up-next" onClick={openQueue}>
              <span>
                Next · {splitTitle(upNext.name).title} · {upNext.artists}
              </span>
            </button>
          )}
          <div className="row transport">
            <button
              type="button"
              className={`round small glass ${isRadioBusy ? 'busy' : ''}`}
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
            <label className="round small glass select-wrap">
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
              style={{'--fraction': (volume ?? 0) / 100} as CSSProperties}
              aria-label="Spotify volume"
              onChange={event => changeVolume(Number(event.target.value))}
            />
            <button type="button" className="step" aria-label="Volume up" onClick={() => stepVolume(VOLUME_STEP)}>
              <Icon name="volumeUp" />
            </button>
          </div>
        </div>
      </div>
      {isQueueOpen && (
        <Sheet title="Up next" onClose={() => setQueueOpen(false)}>
          {queue.length > 0 ? (
            <ol className="queue">
              {queue.map((item, index) => (
                <li key={`${item.id}-${index}`}>
                  <button type="button" className="queue-item" onClick={() => skipTo(index)}>
                    {item.artwork ? <img src={item.artwork} alt="" /> : <span className="queue-cover" />}
                    <span className="queue-text">
                      <span className="queue-title">{splitTitle(item.name).title}</span>
                      <span className="queue-artist">{item.artists}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="queue-empty">Nothing queued after this song</p>
          )}
        </Sheet>
      )}
    </section>
  );
};
