import {describe, expect, it} from 'vitest';
import {toPlaybackState} from './spotify.js';

describe('toPlaybackState', () => {
  it('returns an idle state when Spotify answers nothing (HTTP 204)', () => {
    const state = toPlaybackState(undefined);

    expect(state.isPlaying).toBe(false);
    expect(state.track).toBeNull();
    expect(state.device).toBeNull();
  });

  it('keeps only what the app shows', () => {
    const state = toPlaybackState({
      is_playing: true,
      progress_ms: 12345,
      shuffle_state: true,
      repeat_state: 'context',
      device: {id: 'dev1', name: 'Volumio', volume_percent: 42},
      context: {uri: 'spotify:playlist:abc'},
      item: {
        type: 'track',
        id: 't1',
        uri: 'spotify:track:t1',
        name: 'Song',
        duration_ms: 200000,
        artists: [{name: 'A'}, {name: 'B'}],
        album: {
          name: 'Album',
          images: [
            {url: 'big', width: 640},
            {url: 'medium', width: 300},
            {url: 'small', width: 64},
          ],
        },
      },
    });

    expect(state).toMatchObject({
      isPlaying: true,
      progressMs: 12345,
      shuffle: true,
      repeat: 'context',
      device: {id: 'dev1', name: 'Volumio', volume: 42},
      contextUri: 'spotify:playlist:abc',
      track: {
        id: 't1',
        uri: 'spotify:track:t1',
        name: 'Song',
        artists: 'A, B',
        album: 'Album',
        artwork: 'medium',
        durationMs: 200000,
      },
    });
    expect(state.readAt).toBeGreaterThan(0);
  });

  it('ignores podcast episodes and missing images', () => {
    const state = toPlaybackState({
      is_playing: true,
      item: {type: 'episode', id: 'e', uri: 'u', name: 'n', duration_ms: 1},
    });

    expect(state.track).toBeNull();
    expect(toPlaybackState({item: {id: 'x', uri: 'u', name: 'n', duration_ms: 1}}).track?.artwork).toBeNull();
  });
});
