import {timingSafeEqual} from 'node:crypto';
import {createServer, type IncomingMessage} from 'node:http';
import {HK_COMMANDS, sendCommand} from './hk.js';
import {createHue} from './hue.js';
import {createMockDevices} from './mock.js';
import type {Devices, HueState} from './types.js';

const {
  PORT = '8787',
  AGENT_TOKEN = '',
  HK_IP = '',
  HK_SOURCES = 'Radio,TV,Cable Sat',
  HUE_URL = '',
  HUE_USERNAME = '',
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
  : {hk: {send: (command, para) => sendCommand(HK_IP, command, para)}, hue: createHue(HUE_URL, HUE_USERNAME)};

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

const route = async (
  method: string,
  path: string,
  readBody: () => Promise<Record<string, unknown>>,
): Promise<Result> => {
  const segments = path.split('/').filter(Boolean);
  const [root, second, third, fourth] = segments;

  if ('GET' === method && 0 === segments.length) return {body: {ok: true, mock: isMock, sources}};

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
  const path = new URL(request.url ?? '/', 'http://agent').pathname;

  const send = (status: number, body?: unknown) => {
    const payload = undefined === body ? undefined : JSON.stringify(body);
    response.writeHead(status, {...CORS_HEADERS, ...(payload ? {'content-type': 'application/json'} : {})});
    response.end(payload);
    console.log(`${method} ${path} ${status} ${Date.now() - startedAt}ms`);
  };

  try {
    if ('OPTIONS' === method) return send(204);
    if (!isAuthorized(request)) throw new HttpError(401, 'Unauthorized');

    const {status = 200, body} = await route(method, path, () => readJson(request));
    send(body === undefined && 200 === status ? 204 : status, body);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    send(status, {error: error instanceof Error ? error.message : String(error)});
  }
});

server.listen(Number(PORT), () => console.log(`HK agent listening on :${PORT}${isMock ? ' (mock mode)' : ''}`));
