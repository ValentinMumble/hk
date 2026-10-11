import {useCallback, useEffect, useMemo, useRef, useState, type TouchEvent} from 'react';
import {createApi, type AgentInfo} from './api';
import {Icon, type IconName} from './Icon';
import {Lights} from './Lights';
import {Lyrics} from './Lyrics';
import {Player} from './Player';
import {loadSettings, saveSettings, type Settings} from './settings';
import {Setup} from './Setup';
import {Sound} from './Sound';
import {attempt, Toaster} from './toast';

type TabKey = 'spotify' | 'hk' | 'hue' | 'lyrics';

const TABS: Array<{key: TabKey; label: string; icon: IconName}> = [
  {key: 'hue', label: 'Hue', icon: 'bulb'},
  {key: 'hk', label: 'HK', icon: 'volumeUp'},
  {key: 'spotify', label: 'Spotify', icon: 'note'},
  {key: 'lyrics', label: 'Lyrics', icon: 'lines'},
];
const DEFAULT_TAB: TabKey = 'spotify';
const TAB_KEY = 'hk.tab';
const SWIPE_MIN_PX = 60;

const loadTab = (): TabKey => {
  try {
    const saved = window.localStorage.getItem(TAB_KEY) as TabKey | null;

    return saved && TABS.some(tab => tab.key === saved) ? saved : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
};

export const App = () => {
  const [settings, setSettings] = useState<Settings | null>(loadSettings);
  const [isEditing, setEditing] = useState(false);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [tab, setTab] = useState<TabKey>(loadTab);
  const touchStart = useRef<{x: number; y: number} | null>(null);

  const api = useMemo(() => (settings ? createApi(settings) : null), [settings]);

  const loadInfo = useCallback(() => {
    if (!api) return;

    attempt(async () => setInfo(await api.info()));
  }, [api]);

  useEffect(() => {
    setInfo(null);
    loadInfo();
  }, [loadInfo]);

  // A setup link pasted into a tab that already shows the app only changes the hash, without a reload
  useEffect(() => {
    const onHashChange = () => {
      const next = loadSettings();

      if (next) {
        setSettings(next);
        setEditing(false);
      }
    };
    window.addEventListener('hashchange', onHashChange);

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    // The stylesheet shows the artwork backdrop only on the Spotify tab
    document.body.dataset.tab = tab;

    try {
      window.localStorage.setItem(TAB_KEY, tab);
    } catch {
      // storage can be unavailable in private mode
    }
  }, [tab]);

  const tabs = info?.lyrics?.configured ? TABS : TABS.filter(candidate => 'lyrics' !== candidate.key);
  const index = Math.max(
    0,
    tabs.findIndex(candidate => candidate.key === tab),
  );
  const moveTab = useCallback(
    (delta: number) => setTab(tabs[(index + delta + tabs.length) % tabs.length].key),
    [index, tabs],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ('ArrowLeft' === event.key) moveTab(-1);
      if ('ArrowRight' === event.key) moveTab(1);
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [moveTab]);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = {x: touch.clientX, y: touch.clientY};
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;

    if (!start || 'range' === (event.target as HTMLElement).getAttribute?.('type')) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaX) > SWIPE_MIN_PX && Math.abs(deltaY) < SWIPE_MIN_PX) moveTab(deltaX < 0 ? 1 : -1);
  };

  if (!api || isEditing) {
    return (
      <Setup
        initial={settings}
        onSave={next => {
          setSettings(saveSettings(next));
          setEditing(false);
        }}
        onCancel={settings ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <>
      <main onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* every tab stays mounted and keeps its state; only the active one is shown */}
        <div className="tab-panel" hidden={'hue' !== tab}>
          <Lights api={api} />
        </div>
        <div className="tab-panel" hidden={'hk' !== tab}>
          <Sound
            api={api}
            sources={info?.sources ?? []}
            isMock={info?.mock ?? false}
            onSettings={() => setEditing(true)}
          />
        </div>
        <div className="tab-panel" hidden={'spotify' !== tab}>
          {info?.spotify.configured ? (
            <Player api={api} connected={info.spotify.connected} onConnected={loadInfo} />
          ) : (
            <section className="panel">
              <p className="status">{info ? 'Spotify is not configured on the agent' : '…'}</p>
            </section>
          )}
        </div>
        {info?.lyrics?.configured && (
          <div className="tab-panel" hidden={'lyrics' !== tab}>
            <Lyrics api={api} />
          </div>
        )}
      </main>
      <nav
        className="tabbar glass"
        style={{'--index': index, '--count': tabs.length} as React.CSSProperties}
        aria-label="Sections"
      >
        <span className="tab-glow" aria-hidden="true" />
        {tabs.map(candidate => (
          <button
            key={candidate.key}
            type="button"
            className={`tab ${candidate.key === tab ? 'active' : ''}`}
            aria-label={candidate.label}
            aria-current={candidate.key === tab ? 'page' : undefined}
            onClick={() => setTab(candidate.key)}
          >
            <Icon name={candidate.icon} />
            <span>{candidate.label}</span>
          </button>
        ))}
      </nav>
      <Toaster />
    </>
  );
};
