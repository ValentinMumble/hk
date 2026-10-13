import {useCallback, useEffect, useState} from 'react';
import type {Api, LyricsLine, LyricsResult} from './api';

/** Lines light up a little early: reading takes a moment, and the position is only estimated between reads. */
export const LEAD_MS = 300;

/** Index of the line playing at `positionMs`, or -1 before the first one. */
export const currentLine = (lines: LyricsLine[], positionMs: number) => {
  let index = -1;

  while (index + 1 < lines.length && lines[index + 1].timeMs <= positionMs) index += 1;

  return index;
};

/** The lyrics on show (only ever the playing song's), or why there are none. */
export type SongLyrics = {shown: LyricsResult | null; error: string | null};

/**
 * The lyrics of the playing song, shared by the Lyrics tab and the player. A new song loads its lyrics at once,
 * whichever tab is open.
 */
export const useLyrics = (api: Api | null, trackId: string | null, isEnabled: boolean): SongLyrics => {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api || !isEnabled) return;

    try {
      const next = await api.lyrics();
      setError(null);
      setResult(current => (current?.trackId && current.trackId === next.trackId ? current : next));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);

      setError(message);
      // The agent answered (new song without lyrics, nothing playing): the old lyrics are wrong now.
      // When it is only unreachable, keep them.
      if ('Agent unreachable' !== message) setResult(null);
    }
  }, [api, isEnabled]);

  useEffect(() => {
    setError(null);
    load();
  }, [load, trackId]);

  // While the new song's lyrics are on their way, show nothing rather than the previous song's
  const shown = result && (!trackId || result.trackId === trackId) ? result : null;

  return {shown, error};
};
