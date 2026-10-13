import {describe, expect, it} from 'vitest';
import {pickRadioSongs} from './lastfm.js';

describe('pickRadioSongs', () => {
  const seed = {artist: 'New Order', title: 'Your Silent Face'};

  it('skips the seed song and keeps at most two songs per artist, in order', () => {
    const songs = [
      {artist: 'New Order', title: 'your silent face'},
      {artist: 'New Order', title: 'Ultraviolence'},
      {artist: 'Joy Division', title: 'Isolation'},
      {artist: 'new order', title: 'The Village'},
      {artist: 'New Order', title: 'Age of Consent'},
      {artist: 'The Cure', title: null},
    ];

    expect(pickRadioSongs(songs, seed)).toEqual([
      {artist: 'New Order', title: 'Ultraviolence'},
      {artist: 'Joy Division', title: 'Isolation'},
      {artist: 'new order', title: 'The Village'},
      {artist: 'The Cure', title: null},
    ]);
  });

  it('stops at the maximum', () => {
    const songs = Array.from({length: 10}, (_unused, index) => ({artist: `Artist ${index}`, title: 'Song'}));

    expect(pickRadioSongs(songs, seed, {max: 3})).toHaveLength(3);
  });
});
