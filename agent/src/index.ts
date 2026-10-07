import {timingSafeEqual} from 'node:crypto';
import {createServer, type IncomingMessage} from 'node:http';
import {HK_COMMANDS, sendCommand} from './hk.js';
import {createHue} from './hue.js';
import {createMockDevices} from './mock.js';
import {createSpotify} from './spotify.js';
import type {Devices, HueState, PlaybackState} from './types.js';

const {
  PORT = '8787',
  AGENT_TOKEN = '',
  HK_IP = '',
  HK_SOURCES = 'Radio,TV,Cable Sat',
  HUE_URL = '',
  HUE_USERNAME = '',
  SPOTIFY_CLIENT_ID = '',
  SPOTIFY_CLIENT_SECRET = '',
  SPOTIFY_DEFAULT_DEVICE = '',
  SPOTIFY_TOKENS_FILE = 'spotify.json',
  MOCK = '',
} = process.env;

const isMock = '1' === MOCK || 'true' === MOCK;

if (!AGENT_TOKEN) {
  console.error('AGENT_TOKEN is required');
  process.exit(1);
}

if (!isMock && (!HK_IP || !HUE_URL || !HUE_USERNAME)) {
  console.error('HK_IP, HUE_URL and HUE_USERNAME are required (or set MOCK=1)');
  process.exit(1);
}

const devices: Devices = isMock
  ? createMockDevices()
  : {
      hk: {send: (command, para) => sendCommand(HK_IP, command, para)},
      hue: createHue(HUE_URL, HUE_USERNAME),
      spotify:
        SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET
          ? createSpotify({
              clientId: SPOTIFY_CLIENT_ID,
              clientSecret: SPOTIFY_CLIENT_SECRET,
              defaultDevice: SPOTIFY_DEFAULT_DEVICE || undefined,
              tokensFile: SPOTIFY_TOKENS_FILE,
            })
          : null,
    };

const sources = HK_SOURCES.split(',')
  .map(source => source.trim())
  .filter(Boolean);

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const isAuthorized = (request: IncomingMessage): boolean => {
  const header = request.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '');
  const expected = Buffer.from(AGENT_TOKEN);

  return given.length === expected.length && timingSafeEqual(given, expected);
};

const readJson = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  let raw = '';

  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 10_000) throw new HttpError(413, 'Body too large');
  }

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
};

const toHueState = (body: Record<string, unknown>): HueState => ({
  ...('boolean' === typeof body.on ? {on: body.on} : {}),
  ...('string' === typeof body.color ? {color: body.color} : {}),
  ...('number' === typeof body.brightness ? {brightness: body.brightness} : {}),
});

type Result = {status?: number; body?: unknown};

const REPEAT_STATES: PlaybackState['repeat'][] = ['off', 'track', 'context'];

const text = (value: unknown, name: string): string => {
  if ('string' !== typeof value || !value) throw new HttpError(400, `Missing ${name}`);

  return value;
};

const number = (value: unknown, name: string): number => {
  if ('number' !== typeof value || Number.isNaN(value)) throw new HttpError(400, `Missing ${name}`);

  return value;
};

const spotifyRoute = async (
  method: string,
  action: string | undefined,
  query: URLSearchParams,
  readBody: () => Promise<Record<string, unknown>>,
): Promise<Result> => {
  const spotify = devices.spotify;

  if (!spotify) throw new HttpError(404, 'Spotify is not configured on the agent');

  const done = async (promise: Promise<unknown>): Promise<Result> => {
    await promise;

    return {status: 204};
  };

  if ('GET' === method) {
    switch (action) {
      case 'auth-url':
        return {
          body: {url: spotify.authorizeUrl(text(query.get('redirect'), 'redirect'), text(query.get('state'), 'state'))},
        };
      case 'state':
        return {body: await spotify.state()};
      case 'devices':
        return {body: await spotify.devices()};
      case 'playlists':
        return {body: await spotify.playlists()};
      case 'search':
        return {body: await spotify.search(text(query.get('q'), 'q'))};
    }
  }

  if ('POST' === method) {
    switch (action) {
      case 'authorize': {
        const body = await readBody();

        return done(spotify.authorize(text(body.code, 'code'), text(body.redirectUri, 'redirectUri')));
      }
      case 'logout':
        spotify.logout();

        return {status: 204};
      case 'play': {
        const body = await readBody();

        return done(
          spotify.play({
            ...('string' === typeof body.uri ? {uri: body.uri} : {}),
            ...('string' === typeof body.contextUri ? {contextUri: body.contextUri} : {}),
          }),
        );
      }
      case 'pause':
        return done(spotify.pause());
      case 'next':
        return done(spotify.next());
      case 'previous':
        return done(spotify.previous());
      case 'seek':
        return done(spotify.seek(number((await readBody()).positionMs, 'positionMs')));
      case 'volume':
        return done(spotify.volume(number((await readBody()).percent, 'percent')));
      case 'shuffle':
        return done(spotify.shuffle(Boolean((await readBody()).state)));
      case 'repeat': {
        const state = (await readBody()).state as PlaybackState['repeat'];

        if (!REPEAT_STATES.includes(state)) throw new HttpError(400, 'state must be off, track or context');

        return done(spotify.repeat(state));
      }
      case 'transfer': {
        const body = await readBody();

        return done(spotify.transfer(text(body.deviceId, 'deviceId'), Boolean(body.play)));
      }
    }
  }

  throw new HttpError(404, `No Spotify route for ${method} ${action ?? ''}`);
};

const route = async (
  method: string,
  path: string,
  query: URLSearchParams,
  readBody: () => Promise<Record<string, unknown>>,
): Promise<Result> => {
  const segments = path.split('/').filter(Boolean);
  const [root, second, third, fourth] = segments;

  if ('GET' === method && 0 === segments.length) {
    return {
      body: {
        ok: true,
        mock: isMock,
        sources,
        spotify: {configured: null !== devices.spotify, connected: devices.spotify?.connected() ?? false},
      },
    };
  }

  if ('spotify' === root && segments.length <= 2) return spotifyRoute(method, second, query, readBody);

  if ('hk' === root && 'POST' === method && 2 === segments.length) {
    if (!(second in HK_COMMANDS)) throw new HttpError(404, `Unknown HK command: ${second}`);

    const para = 'source' === second ? String((await readBody()).source ?? '') : '';

    if ('source' === second && !para) throw new HttpError(400, 'Missing source');

    const response = await devices.hk.send(second, para);

    return undefined === response ? {status: 204} : {body: {response}};
  }

  if ('hue' === root) {
    if ('GET' === method && 'lights' === second && 2 === segments.length) return {body: await devices.hue.lights()};

    if ('POST' === method && 'all' === second && 2 === segments.length) {
      await devices.hue.setAll(toHueState(await readBody()));

      return {status: 204};
    }

    if ('POST' === method && 'lights' === second && 4 === segments.length && 'toggle' === fourth) {
      return {body: {on: await devices.hue.toggle(third)}};
    }

    if ('POST' === method && 'lights' === second && 3 === segments.length) {
      await devices.hue.setLight(third, toHueState(await readBody()));

      return {status: 204};
    }
  }

  throw new HttpError(404, `No route for ${method} ${path}`);
};

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://agent');
  const path = url.pathname;

  const send = (status: number, body?: unknown) => {
    const payload = undefined === body ? undefined : JSON.stringify(body);
    response.writeHead(status, {...CORS_HEADERS, ...(payload ? {'content-type': 'application/json'} : {})});
    response.end(payload);
    console.log(`${method} ${path} ${status} ${Date.now() - startedAt}ms`);
  };

  try {
    if ('OPTIONS' === method) return send(204);
    if (!isAuthorized(request)) throw new HttpError(401, 'Unauthorized');

    const {status = 200, body} = await route(method, path, url.searchParams, () => readJson(request));
    send(body === undefined && 200 === status ? 204 : status, body);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    send(status, {error: error instanceof Error ? error.message : String(error)});
  }
});

server.listen(Number(PORT), () => console.log(`HK agent listening on :${PORT}${isMock ? ' (mock mode)' : ''}`));
