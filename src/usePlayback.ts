import {useCallback, useEffect, useRef, useState} from 'react';
import type {Api, PlaybackState} from './api';
import {attempt} from './toast';

const POLL_MS = 2000;
const AFTER_ACTION_MS = 400;
const VOLUME_DEBOUNCE_MS = 300;
/** How long a play or pause tap wins over reads that do not show it yet: Spotify takes a moment to catch up. */
const PENDING_PLAY_MS = 3000;

/**
 * Spotify's playback, read every few seconds while the app is visible, with a local clock for the position in between.
 * Actions run through `act`, which reads the state again a moment later; play and pause flip at once.
 */
export const usePlayback = (api: Api, connected: boolean) => {
  const [state, setState] = useState<PlaybackState | null>(null);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const volumeTimer = useRef<number | undefined>(undefined);
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

  const act = useCallback(
    (action: () => Promise<unknown>, label?: string) =>
      attempt(async () => {
        await action();
        window.setTimeout(refresh, AFTER_ACTION_MS);
      }, label),
    [refresh],
  );

  // Flips at once: the button, the paused look and the clock change before Spotify answers; a failure puts them back
  const togglePlay = () => {
    if (!state) return act(() => api.spotify.play());

    const wasPlaying = state.isPlaying;
    const now = Date.now();
    const position = wasPlaying ? state.progressMs + now - state.readAt : state.progressMs;
    pendingPlay.current = {isPlaying: !wasPlaying, until: now + PENDING_PLAY_MS};
    setState(current => current && {...current, isPlaying: !wasPlaying, progressMs: position, readAt: now});

    return act(async () => {
      try {
        await (wasPlaying ? api.spotify.pause() : api.spotify.play());
      } catch (error) {
        pendingPlay.current = null;
        setState(current => current && {...current, isPlaying: wasPlaying});
        throw error;
      }
    });
  };

  /** Jumps in the song; the clock moves there at once, before Spotify answers. */
  const seekTo = (positionMs: number) => {
    setState(current => current && {...current, progressMs: positionMs, readAt: Date.now()});

    return act(() => api.spotify.seek(positionMs));
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    window.clearTimeout(volumeTimer.current);
    volumeTimer.current = window.setTimeout(() => {
      volumeTimer.current = undefined;
      act(() => api.spotify.volume(value));
    }, VOLUME_DEBOUNCE_MS);
  };

  const stepVolume = (delta: number) =>
    changeVolume(Math.min(100, Math.max(0, (volume ?? state?.device?.volume ?? 50) + delta)));

  return {state, setState, progress, volume, refresh, act, togglePlay, seekTo, changeVolume, stepVolume};
};
