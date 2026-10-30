import {useCallback, useEffect, useState} from 'react';
import type {Api, SpotifyDevice, SpotifyPlaylist, SpotifyTrack} from './api';

/**
 * The lists around the player: Connect devices, playlists (Liked Songs first, as the agent sends them) and up next.
 * Each is read once connected and again when its menu opens; up next also for each new song. A failed read keeps the
 * list it had.
 */
export const useSpotifyLists = (api: Api, connected: boolean, playingId: string | null) => {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [queue, setQueue] = useState<SpotifyTrack[]>([]);

  const loadDevices = useCallback(async () => {
    try {
      setDevices(await api.spotify.devices());
    } catch {
      // keep the list
    }
  }, [api]);

  const loadPlaylists = useCallback(async () => {
    try {
      setPlaylists(await api.spotify.playlists());
    } catch {
      // keep the list
    }
  }, [api]);

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await api.spotify.queue());
    } catch {
      // keep the list
    }
  }, [api]);

  useEffect(() => {
    if (!connected) return;

    loadDevices();
    loadPlaylists();
  }, [connected, loadDevices, loadPlaylists]);

  useEffect(() => {
    if (connected && playingId) loadQueue();
  }, [connected, playingId, loadQueue]);

  return {devices, playlists, queue, loadDevices, loadPlaylists, loadQueue};
};
