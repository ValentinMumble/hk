import {useCallback, useEffect, useRef, useState} from 'react';
import {Marquee} from './Marquee';
import type {Api, LyricsResult} from './api';

/** `trackId` is the song the player sees: a new one loads its lyrics at once, even while the tab is hidden. */
export const Lyrics = ({api, trackId}: {api: Api; trackId: string | null}) => {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      const message = loadError instanceof Error ? loadError.message : String(loadError);

      setError(message);
      // The agent answered (new song without lyrics, nothing playing): the old lyrics are wrong now.
      // When it is only unreachable, keep them on screen.
      if ('Agent unreachable' !== message) setResult(null);
    }
  }, [api]);

  useEffect(() => {
    setError(null);
    load();
  }, [load, trackId]);

  // While the new song's lyrics are on their way, show the loader rather than the previous song's
  const shown = result && (!trackId || result.trackId === trackId) ? result : null;

  return (
    <section className="panel lyrics-panel">
      <header className="panel-header">
        <h2>Lyrics</h2>
        {shown && (
          <a className="status" href={shown.url} target="_blank" rel="noreferrer">
            Genius ↗
          </a>
        )}
      </header>
      {shown && (
        <div className="track">
          <Marquee className="track-name">{shown.title}</Marquee>
          <Marquee className="track-artist">{shown.artist}</Marquee>
        </div>
      )}
      {!shown && !error ? (
        <div className="loader" role="status" aria-label="Finding lyrics">
          <span className="spinner" />
        </div>
      ) : !shown ? (
        <p className="status">😶 {error}</p>
      ) : (
        <div className="lyrics" ref={scrollRef}>
          {shown.lyrics.split('\n').map((line, index) =>
            /^\[.*\]$/.test(line.trim()) ? (
              <span key={index} className="marker">
                {line.trim().slice(1, -1)}
              </span>
            ) : (
              <span key={index}>
                {line}
                {'\n'}
              </span>
            ),
          )}
        </div>
      )}
    </section>
  );
};
