import {useCallback, useEffect, useState} from 'react';
import type {Api} from './api';
import {Icon} from './Icon';
import {attempt} from './toast';

type SoundProps = {api: Api; sources: string[]};

export const Sound = ({api, sources}: SoundProps) => {
  const [isOnline, setOnline] = useState<boolean | null>(null);

  const checkStatus = useCallback(async () => {
    setOnline(null);

    try {
      await api.hkStatus();
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [api]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const run = (command: string, label: string) => attempt(() => api.hk(command), label);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Sound</h2>
        <button type="button" className={`status status-${isOnline}`} onClick={checkStatus}>
          {null === isOnline ? '…' : isOnline ? '● online' : '○ offline, tap to retry'}
        </button>
      </header>
      <div className="row">
        {sources.map(source => (
          <button
            key={source}
            type="button"
            className="chip"
            onClick={() => attempt(() => api.hkSource(source), `📡 ${source}`)}
          >
            {source}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="round big" aria-label="Volume down" onClick={() => run('volume-down', '👇')}>
          <Icon name="volumeDown" />
        </button>
        <button type="button" className="round big" aria-label="Volume up" onClick={() => run('volume-up', '👆')}>
          <Icon name="volumeUp" />
        </button>
      </div>
      <div className="row">
        <button type="button" className="round labeled" onClick={() => run('mute', '🔇')}>
          <Icon name="mute" />
          <span>mute</span>
        </button>
        <button type="button" className="round labeled" onClick={() => run('on', '🟢 on')}>
          <Icon name="power" />
          <span>on</span>
        </button>
        <button type="button" className="round labeled" onClick={() => run('sleep', '😴 sleep')}>
          <Icon name="sleep" />
          <span>sleep</span>
        </button>
        <button type="button" className="round labeled muted" onClick={() => run('off', '🌚 off')}>
          <Icon name="power" />
          <span>off</span>
        </button>
      </div>
    </section>
  );
};
