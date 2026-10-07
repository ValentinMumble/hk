import {useState, type FormEvent} from 'react';
import {createApi} from './api';
import {Status} from './Status';
import type {Settings} from './settings';

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

  return (
    <form className="setup" onSubmit={submit}>
      <h1>HK</h1>
      <label>
        Agent URL
        <input
          type="url"
          required
          autoFocus
          placeholder="https://mac.tailnet.ts.net"
          value={agentUrl}
          onChange={event => handleUrlChange(event.target.value)}
        />
      </label>
      <label>
        Token
        <input type="password" required value={token} onChange={event => setToken(event.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      {initial && <Status settings={initial} />}
      <div className="row">
        {onCancel && (
          <button type="button" className="chip" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="chip on" disabled={isChecking}>
          {isChecking ? 'Checking…' : 'Connect'}
        </button>
      </div>
    </form>
  );
};
