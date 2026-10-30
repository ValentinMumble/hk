import {useState, type FormEvent} from 'react';
import {createApi} from './api';
import {Status} from './Status';
import type {Settings} from './settings';
import './Setup.css';

type SetupProps = {
  initial: Settings | null;
  onSave: (settings: Settings) => void;
  onCancel?: () => void;
};

export const Setup = ({initial, onSave, onCancel}: SetupProps) => {
  const [agentUrl, setAgentUrl] = useState(initial?.agentUrl ?? '');
  const [token, setToken] = useState(initial?.token ?? '');
  const [error, setError] = useState('');
  const [isChecking, setChecking] = useState(false);

  /** A whole setup link (`https://hk.vumble.dev/#agent=…&token=…`) pasted in the URL field fills both fields. */
  const handleUrlChange = (value: string) => {
    const hash = value.includes('#agent=') ? value.slice(value.indexOf('#') + 1) : '';
    const params = new URLSearchParams(hash);
    const pastedAgent = params.get('agent');
    const pastedToken = params.get('token');

    if (pastedAgent && pastedToken) {
      setAgentUrl(pastedAgent);
      setToken(pastedToken);
    } else {
      setAgentUrl(value);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const settings = {agentUrl: agentUrl.trim().replace(/\/+$/, ''), token: token.trim()};
    setChecking(true);
    setError('');

    try {
      await createApi(settings).info();
      onSave(settings);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError));
    } finally {
      setChecking(false);
    }
  };

  // Opened from the app, settings are a sheet over it; the very first setup fills the screen
  const isSheet = Boolean(onCancel);

  return (
    <form className={`setup ${isSheet ? 'sheet' : ''}`} onSubmit={submit}>
      {isSheet ? (
        <header className="sheet-bar">
          <span className="grabber" aria-hidden="true" />
          <button type="button" className="sheet-action" onClick={onCancel}>
            Cancel
          </button>
          <h1>Settings</h1>
          <button type="submit" className="sheet-action strong" disabled={isChecking}>
            {isChecking ? 'Checking…' : 'Save'}
          </button>
        </header>
      ) : (
        <h1>HK</h1>
      )}
      <div className="group">
        <label className="group-row">
          Agent URL
          <input
            type="url"
            required
            autoFocus={!isSheet}
            placeholder="https://mac.tailnet.ts.net"
            value={agentUrl}
            onChange={event => handleUrlChange(event.target.value)}
          />
        </label>
        <label className="group-row">
          Token
          <input type="password" required value={token} onChange={event => setToken(event.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {initial && <Status settings={initial} />}
      {!isSheet && (
        <button type="submit" className="chip glass on" disabled={isChecking}>
          {isChecking ? 'Checking…' : 'Connect'}
        </button>
      )}
    </form>
  );
};
