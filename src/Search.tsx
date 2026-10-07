import {useEffect, useRef, useState} from 'react';
import type {Api, SpotifyTrack} from './api';
import {Icon} from './Icon';
import {Sheet} from './Sheet';
import {attempt} from './toast';

const DEBOUNCE_MS = 350;

type SearchProps = {api: Api; onClose: () => void; onPlayed: () => void};

export const Search = ({api, onClose, onPlayed}: SearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [isSearching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);

      return;
    }

    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        setResults(await api.spotify.search(trimmed));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [api, query]);

  const play = (track: SpotifyTrack) =>
    attempt(async () => {
      await api.spotify.play({uri: track.uri});
      onPlayed();
      onClose();
    }, `▶️ ${track.name}`);

  const queue = (track: SpotifyTrack) => attempt(() => api.spotify.addToQueue(track.uri), `⏭ ${track.name} queued`);

  return (
    <Sheet title="Search" onClose={onClose}>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder="Song, artist, album…"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      <div className="list">
        {results.map(track => (
          <div key={track.id} className="list-item">
            <button type="button" className="list-main" onClick={() => play(track)}>
              {track.artwork ? <img src={track.artwork} alt="" /> : <span className="list-art" />}
              <span className="list-text">
                <span className="list-title">{track.name}</span>
                <span className="list-sub">{track.artists}</span>
              </span>
            </button>
            <button
              type="button"
              className="round small"
              aria-label={`Queue ${track.name}`}
              onClick={() => queue(track)}
            >
              <Icon name="plus" />
            </button>
          </div>
        ))}
        {!results.length && query.trim() && !isSearching && <p className="status">Nothing found</p>}
      </div>
    </Sheet>
  );
};
