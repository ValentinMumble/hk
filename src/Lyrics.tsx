import {useCallback, useEffect, useRef, useState} from 'react';
import type {Api, LyricsResult} from './api';

const POLL_MS = 10_000;

export const Lyrics = ({api}: {api: Api}) => {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.lyrics();
      setError(null);
      setResult(current => {
        if (current?.trackId && current.trackId === next.trackId) return current;

        scrollRef.current?.scrollTo({top: 0});

        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if ('visible' === document.visibilityState) load();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="panel lyrics-panel">
      <header className="panel-header">
        <h2>Lyrics</h2>
        {result && (
          <a className="status" href={result.url} target="_blank" rel="noreferrer">
            Genius ↗
          </a>
        )}
      </header>
      {result && (
        <div className="track">
          <div className="track-name">{result.title}</div>
          <div className="track-artist">{result.artist}</div>
        </div>
      )}
      {isLoading && !result ? (
        <div className="loader" role="status" aria-label="Finding lyrics">
          <span />
          <span />
          <span />
        </div>
      ) : error && !result ? (
        <p className="status">😶 {error}</p>
      ) : (
        <div className="lyrics" ref={scrollRef}>
          {result?.lyrics}
        </div>
      )}
    </section>
  );
};
