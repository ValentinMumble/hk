import {createServer, type AddressInfo} from 'node:net';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {buildRequest, extractXml, sendCommand} from './hk.js';

const STATUS_XML = '<?xml version="1.0" encoding="UTF-8"?><harman><avr><status>ok</status></avr></harman>';

const received: string[] = [];
let port = 0;

/** Pretend amp: records every request, answers heart-alive only (like the real device). */
const fakeAmp = createServer(socket => {
  socket.on('error', () => undefined);
  socket.on('data', data => {
    const text = data.toString();
    received.push(text);

    if (text.includes('heart-alive')) {
      socket.write(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(STATUS_XML)}\r\n\r\n${STATUS_XML}`);
    }
  });
});

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

beforeAll(
  () =>
    new Promise<void>(resolve => {
      fakeAmp.listen(0, '127.0.0.1', () => {
        port = (fakeAmp.address() as AddressInfo).port;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>(resolve => fakeAmp.close(() => resolve())));

describe('buildRequest', () => {
  it('wraps the command in the AVR envelope with a matching content length', () => {
    const request = buildRequest('volume-up');
    const [head, body] = request.split('\r\n\r\n');

    expect(head).toContain('POST AVR HTTP/1.1');
    expect(head).toContain('User-Agent: Harman Kardon AVR Remote Controller /2.0');
    expect(head).toContain(`Content-Length: ${Buffer.byteLength(body)}`);
    expect(body).toContain('<name>volume-up</name>');
    expect(body).toContain('<zone>Main Zone</zone>');
    expect(body).toContain('<para></para>');
  });

  it('passes and escapes the parameter', () => {
    expect(buildRequest('source-selection', 'Cable Sat')).toContain('<para>Cable Sat</para>');
    expect(buildRequest('source-selection', 'A&B')).toContain('<para>A&amp;B</para>');
  });
});

describe('extractXml', () => {
  it('strips the HTTP head from a device reply', () => {
    expect(extractXml(`HTTP/1.1 200 OK\r\n\r\n${STATUS_XML}\r\n`)).toBe(STATUS_XML);
  });

  it('returns the trimmed raw text when there is no XML', () => {
    expect(extractXml('  nope \n')).toBe('nope');
  });
});

describe('sendCommand', () => {
  it('sends fire-and-forget commands and resolves without an answer', async () => {
    received.length = 0;

    await expect(sendCommand('127.0.0.1', 'volume-up', '', port)).resolves.toBeUndefined();
    await waitFor(() => 1 === received.length);

    expect(received[0]).toBe(buildRequest('volume-up'));
  });

  it('sends the source as parameter', async () => {
    received.length = 0;

    await sendCommand('127.0.0.1', 'source', 'TV', port);
    await waitFor(() => 1 === received.length);

    expect(received[0]).toBe(buildRequest('source-selection', 'TV'));
  });

  it('returns the XML body for commands that answer', async () => {
    await expect(sendCommand('127.0.0.1', 'status', '', port)).resolves.toBe(STATUS_XML);
  });

  it('rejects unknown commands', async () => {
    await expect(sendCommand('127.0.0.1', 'dance', '', port)).rejects.toThrow('Unknown HK command: dance');
  });

  it('rejects when nothing listens on the port', async () => {
    await expect(sendCommand('127.0.0.1', 'volume-up', '', 1)).rejects.toThrow(/^HK 127\.0\.0\.1: /);
  });
});
