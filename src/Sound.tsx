import {useCallback, useEffect, useRef, useState} from 'react';
import type {Api} from './api';
import {Icon, type IconName} from './Icon';
import {attempt, toast} from './toast';
import './Sound.css';

type SoundProps = {
  api: Api;
  sources: string[];
  isMock: boolean;
  onSettings: () => void;
  onReachable: (isReachable: boolean) => void;
};

/** Holding a volume button steps once, waits a moment, then keeps stepping until it is let go. */
const HOLD_DELAY_MS = 450;
const REPEAT_MS = 220;
/** The amp cannot say which input it is on, so the last one picked here is remembered on this device. */
const SOURCE_KEY = 'hk.source';

const SOURCE_ICONS: Record<string, IconName> = {tv: 'tv', radio: 'radio', 'cable sat': 'satellite', sat: 'satellite'};
const sourceIcon = (source: string): IconName => SOURCE_ICONS[source.trim().toLowerCase()] ?? 'speaker';

export const Sound = ({api, sources, isMock, onSettings, onReachable}: SoundProps) => {
  const [isOnline, setOnline] = useState<boolean | null>(null);
  const [lastSource, setLastSource] = useState(() => window.localStorage.getItem(SOURCE_KEY));

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

  // Still checking counts as reachable, so the tab does not flicker on each check
  useEffect(() => onReachable(false !== isOnline), [isOnline, onReachable]);

  const run = (command: string, label: string) => attempt(() => api.hk(command), label);

  const pickSource = (source: string) =>
    attempt(async () => {
      await api.hkSource(source);
      setLastSource(source);
      window.localStorage.setItem(SOURCE_KEY, source);
    }, `📡 ${source}`);

  const isHolding = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);

  const stopVolume = useCallback(() => {
    isHolding.current = false;
    window.clearTimeout(holdTimer.current);
  }, []);

  // One step at once, then more while the finger stays down; a failure stops it and says why
  const startVolume = (command: 'volume-up' | 'volume-down') => {
    stopVolume();
    isHolding.current = true;

    const step = async (delay: number) => {
      try {
        await api.hk(command);
      } catch (error) {
        stopVolume();
        toast(`😩 ${error instanceof Error ? error.message : String(error)}`);

        return;
      }

      if (isHolding.current) holdTimer.current = window.setTimeout(() => step(REPEAT_MS), delay);
    };

    step(HOLD_DELAY_MS);
  };

  useEffect(() => stopVolume, [stopVolume]);

  const volumeHalf = (command: 'volume-up' | 'volume-down', icon: IconName, label: string) => (
    <button
      type="button"
      className="rocker-half"
      aria-label={label}
      onPointerDown={() => startVolume(command)}
      onPointerUp={stopVolume}
      onPointerLeave={stopVolume}
      onPointerCancel={stopVolume}
      onContextMenu={event => event.preventDefault()}
    >
      <Icon name={icon} />
    </button>
  );

  return (
    <section className={`panel ${false === isOnline ? 'offline' : ''}`}>
      <header className="panel-header">
        <h2>HK</h2>
        <button
          type="button"
          className={`pill ${null === isOnline ? '' : isOnline ? 'ok' : 'bad'}`}
          onClick={checkStatus}
        >
          {null === isOnline ? 'Checking' : isOnline ? 'Online' : 'Offline · retry'}
        </button>
      </header>
      <div className="panel-body">
        <div className="sources">
          {sources.map(source => (
            <button
              key={source}
              type="button"
              className={`source glass ${source === lastSource ? 'on' : ''}`}
              onClick={() => pickSource(source)}
            >
              <Icon name={sourceIcon(source)} />
              <span>{source}</span>
            </button>
          ))}
        </div>
        <div className="volume-block">
          <button
            type="button"
            className="round side glass"
            aria-label="Sleep timer"
            onClick={() => run('sleep', '😴 Sleep timer')}
          >
            <Icon name="sleep" />
          </button>
          <div className="rocker glass" role="group" aria-label="Amp volume, hold to keep going">
            {volumeHalf('volume-up', 'plus', 'Volume up')}
            {volumeHalf('volume-down', 'minus', 'Volume down')}
          </div>
          <button type="button" className="round side glass" aria-label="Mute" onClick={() => run('mute', '🔇')}>
            <Icon name="mute" />
          </button>
        </div>
      </div>
      <footer className="panel-footer">
        <span />
        <button type="button" className="round off glass" aria-label="Power off" onClick={() => run('off', '🌚 off')}>
          <Icon name="power" />
        </button>
        <span className="end">
          {isMock && <span className="status">mock</span>}
          <button type="button" className="round small soft glass" aria-label="Settings" onClick={onSettings}>
            <Icon name="gear" />
          </button>
        </span>
      </footer>
    </section>
  );
};
