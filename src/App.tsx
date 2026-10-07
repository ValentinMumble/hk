import {useEffect, useMemo, useState} from 'react';
import {createApi, type AgentInfo} from './api';
import {Icon} from './Icon';
import {Lights} from './Lights';
import {loadSettings, saveSettings, type Settings} from './settings';
import {Setup} from './Setup';
import {Sound} from './Sound';
import {attempt, Toaster} from './toast';

export const App = () => {
  const [settings, setSettings] = useState<Settings | null>(loadSettings);
  const [isEditing, setEditing] = useState(false);
  const [info, setInfo] = useState<AgentInfo | null>(null);

  const api = useMemo(() => (settings ? createApi(settings) : null), [settings]);

  useEffect(() => {
    if (!api) return;

    setInfo(null);
    attempt(async () => setInfo(await api.info()));
  }, [api]);

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
