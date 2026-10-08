import {execFile} from 'node:child_process';
import {mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {request as httpsRequest} from 'node:https';
import {join} from 'node:path';

/**
 * Self-update from GitHub: a workflow publishes the built agent as the release tagged "latest";
 * this downloads it, swaps dist/ and exits, and systemd starts the new build.
 */
const TIMEOUT_MS = 60_000;

export type Build = {sha: string; date: string};

export const readBuild = (distDir: string): Build | null => {
  try {
    return JSON.parse(readFileSync(join(distDir, 'build.json'), 'utf8')) as Build;
  } catch {
    return null;
  }
};

const get = (url: string, headers: Record<string, string>, redirects = 5): Promise<{status: number; body: Buffer}> =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {method: 'GET', timeout: TIMEOUT_MS, headers: {'user-agent': 'hk-agent', ...headers}},
      response => {
        const location = response.headers.location;

        if (
          location &&
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          redirects > 0
        ) {
          response.resume();
          // the asset download bounces to a storage host that must not see the GitHub token
          const next = new URL(location, url);
          const forward = next.hostname.endsWith('github.com') ? headers : {accept: headers.accept ?? '*/*'};
          resolve(get(next.toString(), forward, redirects - 1));

          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk as Buffer));
        response.on('end', () => resolve({status: response.statusCode ?? 0, body: Buffer.concat(chunks)}));
      },
    );

    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', error => reject(new Error(`GitHub: ${error.message}`)));
    request.end();
  });

const run = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    execFile(command, args, error => (error ? reject(error) : resolve()));
  });

type Config = {repo: string; token?: string; appDir: string};

/** Download the latest release and replace dist/. Resolves with the new build, the caller restarts. */
export const update = async ({repo, token, appDir}: Config): Promise<Build> => {
  const auth: Record<string, string> = token ? {authorization: `Bearer ${token}`} : {};
  const release = await get(`https://api.github.com/repos/${repo}/releases/tags/latest`, {
    ...auth,
    accept: 'application/vnd.github+json',
  });

  if (release.status >= 400) throw new Error(`GitHub: no "latest" release (HTTP ${release.status})`);

  const asset = (JSON.parse(release.body.toString()) as {assets?: Array<{name: string; url: string}>}).assets?.find(
    candidate => candidate.name.endsWith('.tar.gz'),
  );

  if (!asset) throw new Error('GitHub: the latest release has no .tar.gz asset');

  const download = await get(asset.url, {...auth, accept: 'application/octet-stream'});

  if (download.status >= 400) throw new Error(`GitHub: asset download failed (HTTP ${download.status})`);

  // Unpack inside the app folder: /tmp can be another filesystem, and renames must stay on one.
  const work = mkdtempSync(join(appDir, '.update-'));

  try {
    const archive = join(work, 'agent.tar.gz');
    writeFileSync(archive, download.body);
    await run('tar', ['-xzf', archive, '-C', work]);

    const build = readBuild(join(work, 'dist'));

    if (!build) throw new Error('The downloaded build has no build.json');

    // Swap so that dist/ is never missing: stage next to it, then move the old one aside, then the new one in.
    const current = join(appDir, 'dist');
    const next = join(appDir, 'dist.next');
    const previous = join(appDir, 'dist.previous');
    rmSync(next, {recursive: true, force: true});
    rmSync(previous, {recursive: true, force: true});
    renameSync(join(work, 'dist'), next);
    renameSync(current, previous);

    try {
      renameSync(next, current);
    } catch (error) {
      renameSync(previous, current);
      throw error;
    }

    return build;
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
};
