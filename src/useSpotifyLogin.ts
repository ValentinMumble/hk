import {useEffect, useState} from 'react';
import type {Api} from './api';
import {attempt} from './toast';

const STATE_KEY = 'hk.spotify.state';

/** Redirect URI registered in the Spotify dashboard: the app's own origin. */
const redirectUri = () => `${window.location.origin}/`;

/**
 * Logging the agent in to Spotify: `login` goes to Spotify's page, which comes back to the app with ?code=…, and the
 * agent trades that code for its own session.
 */
export const useSpotifyLogin = (api: Api, onConnected: () => void) => {
  const [isLoggingIn, setLoggingIn] = useState(false);

  // Finish the login when we come back with ?code=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const expectedState = window.sessionStorage.getItem(STATE_KEY);

    if (!code) return;

    window.history.replaceState(null, '', window.location.pathname + window.location.hash);

    if (params.get('state') !== expectedState) return;

    attempt(async () => {
      await api.spotify.authorize(code, redirectUri());
      window.sessionStorage.removeItem(STATE_KEY);
      onConnected();
    }, '🎧 Spotify connected');
  }, [api, onConnected]);

  const login = async () => {
    setLoggingIn(true);

    try {
      const nonce = Math.random().toString(36).slice(2);
      window.sessionStorage.setItem(STATE_KEY, nonce);
      const {url} = await api.spotify.authUrl(redirectUri(), nonce);
      window.location.assign(url);
    } catch (error) {
      setLoggingIn(false);
      attempt(() => Promise.reject(error));
    }
  };

  return {isLoggingIn, login};
};
