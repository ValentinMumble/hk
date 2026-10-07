export type Settings = {agentUrl: string; token: string};

const STORAGE_KEY = 'hk.settings';

const normalize = ({agentUrl, token}: Settings): Settings => ({
  agentUrl: agentUrl.trim().replace(/\/+$/, ''),
  token: token.trim(),
});

/**
 * Opening `https://hk.vumble.dev/#agent=https://…&token=…` fills the settings on first load.
 * Handy to set a phone up without typing. The hash is removed from the URL right away.
 */
const readHash = (): Settings | null => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const agentUrl = params.get('agent');
  const token = params.get('token');

  return agentUrl && token ? normalize({agentUrl, token}) : null;
};

export const loadSettings = (): Settings | null => {
  const fromHash = readHash();

  if (fromHash) {
    saveSettings(fromHash);
    window.history.replaceState(null, '', window.location.pathname);

    return fromHash;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as Settings) : null;
  } catch {
    return null;
  }
};

export const saveSettings = (settings: Settings): Settings => {
  const normalized = normalize(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));

  return normalized;
};
