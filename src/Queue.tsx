import {useEffect, useState} from 'react';
import type {Api, SpotifyTrack} from './api';
import {Sheet} from './Sheet';

type QueueProps = {api: Api; current: SpotifyTrack | null; onClose: () => void};

/** What Spotify will play next. The API offers no way to jump to an item, so this is read-only. */
export const Queue = ({api, current, onClose}: QueueProps) => {
  const [tracks, setTracks] = useState<SpotifyTrack[] | null>(null);

  useEffect(() => {
    api.spotify
      .queue()
      .then(setTracks)
      .catch(() => setTracks([]));
  }, [api]);

  return (
    <Sheet title="Up next" onClose={onClose}>
      <div className="list">
        {current && (
          <div className="list-item now">
            <div className="list-main">
              {current.artwork ? <img src={current.artwork} alt="" /> : <span className="list-art" />}
              <span className="list-text">
                <span className="list-title">{current.name}</span>
                <span className="list-sub">{current.artists} · playing</span>
              </span>
            </div>
          </div>
        )}
        {tracks?.map((track, index) => (
          <div key={`${track.id}-${index}`} className="list-item">
            <div className="list-main">
              {track.artwork ? <img src={track.artwork} alt="" /> : <span className="list-art" />}
              <span className="list-text">
                <span className="list-title">{track.name}</span>
                <span className="list-sub">{track.artists}</span>
              </span>
            </div>
          </div>
        ))}
        {null === tracks && <p className="status">…</p>}
        {tracks && !tracks.length && <p className="status">Queue is empty</p>}
      </div>
    </Sheet>
  );
};
