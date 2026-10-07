import type {Settings} from './settings';

export type AgentInfo = {ok: boolean; mock: boolean; sources: string[]};
export type Light = {id: string; name: string; on: boolean; reachable: boolean; brightness: number; hasColor: boolean};
export type HueState = {on?: boolean; color?: string; brightness?: number};

export const createApi = ({agentUrl, token}: Settings) => {
  const call = async <T = undefined>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    let response: Response;

    try {
      response = await fetch(`${agentUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : {'content-type': 'application/json'}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Agent unreachable');
    }

    if (204 === response.status) return undefined as T;

    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);

    return data as T;
  };

  return {
    info: () => call<AgentInfo>('GET', '/'),
    hk: (command: string) => call('POST', `/hk/${command}`),
    hkSource: (source: string) => call('POST', '/hk/source', {source}),
    hkStatus: () => call<{response: string}>('POST', '/hk/status'),
    lights: () => call<Light[]>('GET', '/hue/lights'),
    allLights: (state: HueState) => call('POST', '/hue/all', state),
    setLight: (id: string, state: HueState) => call('POST', `/hue/lights/${id}`, state),
    toggleLight: (id: string) => call<{on: boolean}>('POST', `/hue/lights/${id}/toggle`),
  };
};

export type Api = ReturnType<typeof createApi>;
