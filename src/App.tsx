import {useCallback, useEffect, useMemo, useState} from 'react';
import {createApi, type AgentInfo} from './api';
import {Icon} from './Icon';
import {Lights} from './Lights';
import {Player} from './Player';
import {loadSettings, saveSettings, type Settings} from './settings';
import {Setup} from './Setup';
import {Sound} from './Sound';
import {attempt, Toaster} from './toast';

export const App = () => {
  const [settings, setSettings] = useState<Settings | null>(loadSettings);
  const [isEditing, setEditing] = useState(false);
  const [info, setInfo] = useState<AgentInfo | null>(null);

  const api = useMemo(() => (settings ? createApi(settings) : null), [settings]);

  const loadInfo = useCallback(() => {
    if (!api) return;

    attempt(async () => setInfo(await api.info()));
  }, [api]);

  useEffect(() => {
    setInfo(null);
    loadInfo();
  }, [loadInfo]);

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
      <main>
        <Sound api={api} sources={info?.sources ?? []} />
        {info?.spotify.configured && <Player api={api} connected={info.spotify.connected} onConnected={loadInfo} />}
        <Lights api={api} />
      </main>
      <footer>
        {info?.mock && <span>mock agent</span>}
        <button type="button" className="status" aria-label="Settings" onClick={() => setEditing(true)}>
          <Icon name="more" />
        </button>
      </footer>
      <Toaster />
    </>
  );
};
