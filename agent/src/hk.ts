import {createConnection} from 'node:net';

/**
 * Harman Kardon AVR network remote protocol: one TCP connection per command on port 10025,
 * an HTTP-looking header followed by a small XML document. Most commands never answer.
 */
export const HK_PORT = 10025;
export const HK_ZONE = 'Main Zone';

const CONNECT_TIMEOUT_MS = 3000;
const RESPONSE_TIMEOUT_MS = 2000;
const HEADER = 'POST AVR HTTP/1.1\r\nHost: :10025\r\nUser-Agent: Harman Kardon AVR Remote Controller /2.0';

type Command = {name: string; hasResponse?: boolean};

/** Commands exposed by the agent, keyed by the name used in its URLs. */
export const HK_COMMANDS: Record<string, Command> = {
  on: {name: 'power-on'},
  off: {name: 'power-off'},
  sleep: {name: 'power-sleep'},
  'volume-up': {name: 'volume-up'},
  'volume-down': {name: 'volume-down'},
  mute: {name: 'mute-toggle'},
  play: {name: 'media-play'},
  pause: {name: 'media-pause'},
  next: {name: 'media-next'},
  previous: {name: 'media-previous'},
  source: {name: 'source-selection'},
  status: {name: 'heart-alive', hasResponse: true},
};

const escapeXml = (value: string) =>
  value.replace(/[<>&]/g, char => ({'<': '&lt;', '>': '&gt;', '&': '&amp;'})[char] ?? char);

export const buildRequest = (name: string, para = '', zone = HK_ZONE): string => {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<harman>',
    '    <avr>',
    '        <common>',
    '            <control>',
    `                <name>${name}</name>`,
    `                <zone>${zone}</zone>`,
    `                <para>${escapeXml(para)}</para>`,
    '            </control>',
    '        </common>',
    '    </avr>',
    '</harman>',
  ].join('\n');

  return `${HEADER}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
};

export const extractXml = (raw: string): string => {
  const start = raw.indexOf('<?xml');
  const end = raw.lastIndexOf('>');

  return -1 !== start && end > start ? raw.slice(start, end + 1) : raw.trim();
};

export const sendCommand = (ip: string, command: string, para = '', port = HK_PORT): Promise<string | undefined> => {
  const spec = HK_COMMANDS[command];

  if (!spec) return Promise.reject(new Error(`Unknown HK command: ${command}`));

  return new Promise((resolve, reject) => {
    const socket = createConnection({host: ip, port});
    let isDone = false;
    let timer: NodeJS.Timeout;

    const finish = (error?: Error, response?: string) => {
      if (isDone) return;

      isDone = true;
      clearTimeout(timer);
      socket.destroy();

      if (error) reject(error);
      else resolve(response);
    };

    timer = setTimeout(() => finish(new Error(`HK ${ip}: connection timed out`)), CONNECT_TIMEOUT_MS);

    socket.on('error', error => finish(new Error(`HK ${ip}: ${error.message}`)));
    socket.on('close', () => finish(new Error(`HK ${ip}: connection closed before answering`)));
    socket.on('data', data => finish(undefined, extractXml(data.toString())));
    socket.on('connect', () => {
      socket.write(buildRequest(spec.name, para), () => {
        if (!spec.hasResponse) finish();
      });

      if (spec.hasResponse) {
        clearTimeout(timer);
        timer = setTimeout(
          () => finish(new Error(`HK ${ip}: no answer after ${RESPONSE_TIMEOUT_MS} ms`)),
          RESPONSE_TIMEOUT_MS,
        );
      }
    });
  });
};
