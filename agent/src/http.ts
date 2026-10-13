import {request as httpsRequest} from 'node:https';

const TIMEOUT_MS = 10_000;

/** GET over HTTPS following a few redirects, resolving with the status and the body as text. */
export const get = (
  url: string,
  headers: Record<string, string> = {},
  redirects = 3,
): Promise<{status: number; body: string}> =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(url, {method: 'GET', timeout: TIMEOUT_MS, headers}, response => {
      const location = response.headers.location;

      if (location && response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && redirects > 0) {
        response.resume();
        resolve(get(new URL(location, url).toString(), headers, redirects - 1));

        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => (body += chunk));
      response.on('end', () => resolve({status: response.statusCode ?? 0, body}));
    });

    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', error => reject(new Error(`${new URL(url).host}: ${error.message}`)));
    request.end();
  });
