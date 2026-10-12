import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer, type IncomingMessage} from 'node:http';
import {HK_COMMANDS, sendCommand} from './hk.js';
import {createHue} from './hue.js';
import {createLyrics} from './lyrics.js';
import {createMockDevices} from './mock.js';
import {createSpotify} from './spotify.js';
import {readBuild, update} from './update.js';
import type {Devices, HueState, PlaybackState} from './types.js';

const {
  PORT = '8787',
  AGENT_TOKEN = '',
  HK_IP = '',
  HK_SOURCES = 'TV,Radio,Cable Sat',
  HUE_URL = '',
  HUE_USERNAME = '',
  SPOTIFY_CLIENT_ID = '',
  SPOTIFY_CLIENT_SECRET = '',
  SPOTIFY_DEFAULT_DEVICE = '',
  SPOTIFY_TOKENS_FILE = 'spotify.json',
  GENIUS_TOKEN = '',
  GITHUB_REPO = 'ValentinMumble/hk',
  GITHUB_TOKEN = '',
  MOCK = '',
} = process.env;

const isMock = '1' === MOCK || 'true' === MOCK;
const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {version: string})
  .version;
const APP_DIR = new URL('..', import.meta.url).pathname;
const BUILD = readBuild(new URL('.', import.meta.url).pathname);

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
      lyrics: createLyrics({
        geniusToken: GENIUS_TOKEN || null,
        userAgent: `hk-agent/${VERSION} (https://github.com/ValentinMumble/hk)`,
      }),
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
  ...('colorloop' === body.effect || 'none' === body.effect ? {effect: body.effect} : {}),
  ...('select' === body.alert || 'lselect' === body.alert || 'none' === body.alert ? {alert: body.alert} : {}),
  ...('number' === typeof body.transition ? {transition: body.transition} : {}),
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
      case 'queue':
        return {body: await spotify.queue()};
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
      case 'queue':
        return done(spotify.addToQueue(text((await readBody()).uri, 'uri')));
      case 'radio':
        return {body: {queued: await spotify.radio(text((await readBody()).trackId, 'trackId'))}};
      case 'like': {
        const body = await readBody();

        return done(spotify.like(text(body.trackId, 'trackId'), Boolean(body.saved)));
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
        version: VERSION,
        build: BUILD,
        uptime: Math.round(process.uptime()),
        sources,
        spotify: {configured: null !== devices.spotify, connected: devices.spotify?.connected() ?? false},
        lyrics: {configured: true, genius: Boolean(GENIUS_TOKEN) && !isMock},
      },
    };
  }

  if ('lyrics' === root && 'GET' === method && 1 === segments.length) {
    let artist = query.get('artist') ?? '';
    let title = query.get('title') ?? '';
    let durationMs: number | undefined;
    let trackId: string | null = null;

    if (!artist || !title) {
      if (!devices.spotify) throw new HttpError(400, 'Pass artist and title, Spotify is not configured');

      const {track} = await devices.spotify.state();

      if (!track) throw new HttpError(404, 'Nothing is playing');

      artist = track.artists.split(',')[0].trim();
      title = track.name;
      durationMs = track.durationMs;
      trackId = track.id;
    }

    return {body: {trackId, ...(await devices.lyrics.lookup({artist, title, durationMs}))}};
  }

  if ('spotify' === root && segments.length <= 2) return spotifyRoute(method, second, query, readBody);

  if ('update' === root && 'POST' === method && 1 === segments.length) {
    if (isMock) throw new HttpError(400, 'Not in mock mode');

    const build = await update({repo: GITHUB_REPO, token: GITHUB_TOKEN || undefined, appDir: APP_DIR});
    console.log(`updated to ${build.sha} (${build.date}), restarting`);
    setTimeout(() => process.exit(0), 500);

    return {body: build};
  }

  if ('hk' === root && 'POST' === method && 2 === segments.length) {
    if (!(second in HK_COMMANDS)) throw new HttpError(404, `Unknown HK command: ${second}`);

    const para = 'source' === second ? String((await readBody()).source ?? '') : '';

    if ('source' === second && !para) throw new HttpError(400, 'Missing source');

    const response = await devices.hk.send(second, para);

    return undefined === response ? {status: 204} : {body: {response}};
  }

  if ('hue' === root) {
    if ('GET' === method && 'lights' === second && 2 === segments.length) return {body: await devices.hue.lights()};
    if ('GET' === method && 'scenes' === second && 2 === segments.length) return {body: await devices.hue.scenes()};

    if ('POST' === method && 'scenes' === second && 3 === segments.length) {
      await devices.hue.recallScene(third);

      return {status: 204};
    }

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
