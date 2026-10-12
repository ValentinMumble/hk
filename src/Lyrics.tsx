import {useCallback, useEffect, useRef, useState} from 'react';
import {Marquee} from './Marquee';
import type {Api, LyricsLine, LyricsResult, Playhead} from './api';

/** Lines light up a little early: reading takes a moment, and the position is only estimated between reads. */
const LEAD_MS = 300;
const TICK_MS = 250;
/** After a scroll by hand, the lyrics stay where they were put for this long. */
const MANUAL_SCROLL_MS = 4000;

const positionOf = (playhead: Playhead, now: number) =>
  playhead.isPlaying ? playhead.progressMs + now - playhead.readAt : playhead.progressMs;

/** Index of the line playing at `positionMs`, or -1 before the first one. */
const currentLine = (lines: LyricsLine[], positionMs: number) => {
  let index = -1;

  while (index + 1 < lines.length && lines[index + 1].timeMs <= positionMs) index += 1;

  return index;
};

type LyricsProps = {api: Api; playhead: Playhead | null; isActive: boolean};

/**
 * The words of the playing song. The playhead names the song, so a new one loads its lyrics at once, even while the
 * tab is hidden. With time-coded lines, the current one lights up and stays in the middle of the screen.
 */
export const Lyrics = ({api, playhead, isActive}: LyricsProps) => {
  const trackId = playhead?.trackId ?? null;
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLSpanElement | null>>([]);
  /** The line last brought to the middle, -1 when the next scroll should jump there at once. */
  const centredLine = useRef(-1);
  const touchedAt = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await api.lyrics();
      setError(null);
      setResult(current => {
        if (current?.trackId && current.trackId === next.trackId) return current;

        scrollRef.current?.scrollTo({top: 0});
        centredLine.current = -1;

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
  const synced = shown?.synced ?? null;

  // The clock only runs while time-coded lines are on screen
  useEffect(() => {
    if (!synced || !isActive) return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);

    return () => window.clearInterval(timer);
  }, [synced, isActive]);

  const current = synced && playhead ? currentLine(synced, positionOf(playhead, now) + LEAD_MS) : -1;

  // Keep the current line in the middle: at once when the tab opens, smoothly after that
  useEffect(() => {
    if (!isActive) {
      centredLine.current = -1;

      return;
    }

    const container = scrollRef.current;
    const line = lineRefs.current[current];

    if (!container || !line || current === centredLine.current) return;
    if (Date.now() - touchedAt.current < MANUAL_SCROLL_MS) return;

    container.scrollTo({
      top: line.offsetTop - (container.clientHeight - line.offsetHeight) / 2,
      behavior: -1 === centredLine.current ? 'auto' : 'smooth',
    });
    centredLine.current = current;
  }, [current, isActive]);

  const markTouched = () => {
    touchedAt.current = Date.now();
  };

  return (
    <section className="panel lyrics-panel">
      <header className="panel-header">
        <h2>Lyrics</h2>
        {shown && (
          <a className="status" href={shown.url} target="_blank" rel="noreferrer">
            {shown.source} ↗
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
      ) : shown.instrumental ? (
        <p className="status">🎻 Instrumental</p>
      ) : synced ? (
        <div className="lyrics synced" ref={scrollRef} onTouchStart={markTouched} onWheel={markTouched}>
          {synced.map((line, index) => (
            <span
              key={index}
              ref={element => {
                lineRefs.current[index] = element;
              }}
              className={`line ${index === current ? 'current' : ''}`}
            >
              {line.text || '♪'}
            </span>
          ))}
        </div>
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
