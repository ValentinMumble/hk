import {request as httpRequest} from 'node:http';
import {request as httpsRequest, type RequestOptions} from 'node:https';
import {hexToXy, miredToHex, xyToHex} from './color.js';
import type {Hue, HueScene, HueState, Light} from './types.js';

/** Hue bridge local API (v1). Recent firmware serves it over HTTPS with a self-signed certificate. */
const TIMEOUT_MS = 5000;

type RawLight = {
  name: string;
  state: {on: boolean; bri?: number; reachable?: boolean; xy?: [number, number]; ct?: number};
};
type BridgeReply = Array<{success?: unknown; error?: {description?: string}}>;
/** Scenes as the v1 API lists them. "recycle" ones are temporary, made by apps for their own use. */
export type RawScene = {name: string; type?: string; group?: string; recycle?: boolean};
export type RawGroup = {name: string};

/** The scenes worth showing, with their room's name, sorted by name. Exported for tests. */
export const toScenes = (scenes: Record<string, RawScene>, groups: Record<string, RawGroup>): HueScene[] =>
  Object.entries(scenes)
    .filter(([, scene]) => !scene.recycle)
    .map(([id, scene]) => ({id, name: scene.name, room: (scene.group && groups[scene.group]?.name) || null}))
    .sort((left, right) => left.name.localeCompare(right.name) || (left.room ?? '').localeCompare(right.room ?? ''));

const toLight = ([id, raw]: [string, RawLight]): Light => ({
  id,
  name: raw.name,
  on: raw.state.on,
  reachable: raw.state.reachable ?? true,
  brightness: Math.round(((raw.state.bri ?? 254) / 254) * 100),
  hasColor: undefined !== raw.state.xy,
  color: raw.state.xy ? xyToHex(raw.state.xy) : raw.state.ct ? miredToHex(raw.state.ct) : '#ffe9c4',
});

const toBridgeState = ({on, color, brightness, effect, alert, transition}: HueState) => ({
  ...(undefined === on ? {} : {on}),
  ...(undefined === color ? {} : {xy: hexToXy(color)}),
  ...(undefined === brightness ? {} : {bri: Math.round(1 + (Math.min(100, Math.max(0, brightness)) / 100) * 253)}),
  ...(undefined === effect ? {} : {effect}),
  ...(undefined === alert ? {} : {alert}),
  ...(undefined === transition ? {} : {transitiontime: Math.round(Math.min(6553, Math.max(0, transition)) * 10)}),
});

/** The bridge answers writes with a list of success/error items. Errors only count when nothing succeeded. */
const check = <T>(reply: T): T => {
  if (Array.isArray(reply)) {
    const items = reply as BridgeReply;
    const firstError = items.find(item => item.error)?.error;

    if (firstError && !items.some(item => item.success)) {
      throw new Error(`Hue: ${firstError.description ?? 'unknown error'}`);
    }
  }

  return reply;
};

export const createHue = (bridgeUrl: string, username: string): Hue => {
  const base = new URL(`/api/${username}/`, bridgeUrl);

  const call = (method: 'GET' | 'PUT', path: string, body?: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const url = new URL(path, base);
      const payload = undefined === body ? undefined : JSON.stringify(body);
      const options: RequestOptions = {
        method,
        timeout: TIMEOUT_MS,
        rejectUnauthorized: false,
        headers: payload ? {'content-type': 'application/json', 'content-length': Buffer.byteLength(payload)} : {},
      };
      const onResponse = (response: import('node:http').IncomingMessage) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', chunk => (raw += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Hue: unexpected reply (HTTP ${response.statusCode})`));
          }
        });
      };
      const request =
        'https:' === url.protocol ? httpsRequest(url, options, onResponse) : httpRequest(url, options, onResponse);

      request.on('timeout', () => request.destroy(new Error('timed out')));
      request.on('error', error => reject(new Error(`Hue: ${error.message}`)));
      request.end(payload);
    });

  const setLight = async (id: string, state: HueState) => {
    check(await call('PUT', `lights/${id}/state`, toBridgeState(state)));
  };

  return {
    lights: async () => {
      const reply = check(await call('GET', 'lights')) as Record<string, RawLight>;

      return Object.entries(reply).map(toLight);
    },
    scenes: async () => {
      const [scenes, groups] = await Promise.all([call('GET', 'scenes'), call('GET', 'groups')]);

      return toScenes(check(scenes) as Record<string, RawScene>, check(groups) as Record<string, RawGroup>);
    },
    // A room scene is recalled through its room, a scene of loose lights through group 0 (every light)
    recallScene: async id => {
      const scene = check(await call('GET', `scenes/${encodeURIComponent(id)}`)) as RawScene;
      check(await call('PUT', `groups/${scene.group ?? '0'}/action`, {scene: id}));
    },
    setAll: async state => {
      check(await call('PUT', 'groups/0/action', toBridgeState(state)));
    },
    setLight,
    toggle: async id => {
      const raw = check(await call('GET', `lights/${id}`)) as RawLight;
      const on = !raw.state.on;
      await setLight(id, {on});

      return on;
    },
  };
};
