import {request as httpsRequest} from 'node:https';
import type {Lyrics, LyricsResult} from './types.js';

/**
 * Lyrics through Genius, like the old server: the API finds the song, the song page holds the text
 * (Genius does not serve lyrics through its API), so the page is fetched and its lyrics blocks extracted.
 */
const API = 'https://api.genius.com';
const TIMEOUT_MS = 10_000;
const CACHE_SIZE = 10;

export type Hit = {result: {title: string; url: string; primary_artist: {name: string}}};

/** Lowercase, no accents, no punctuation, no leading "the": enough to compare names loosely. */
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Same, with version notes such as "(Live)" or "- Remastered" removed first. */
const loose = (value: string) => normalize(cleanTitle(value));

/** Whole-word containment either way, so "Daft Punk" matches "Daft Punk & Pharrell" but "Air" not "Fairground". */
const overlaps = (left: string, right: string) =>
  Boolean(left && right) && (` ${left} `.includes(` ${right} `) || ` ${right} `.includes(` ${left} `));

/** Title without any bracketed part, for "Song (with X)" against "Song", or "(Pts. 1-5)" against "(Parts I-V)". */
const bare = (value: string) => normalize(value.replace(/\s*[([].*?[)\]]/g, ''));

/**
 * The hit to use, or null when no hit is this song by this artist. Both must match: Genius always returns
 * something, and another song's lyrics (even by the same artist) are worse than none. Exported for tests.
 */
export const pickHit = (hits: Hit[], artist: string, title: string): Hit | null => {
  const wantedArtist = loose(artist);
  const wantedTitle = loose(title);
  const wantedBare = bare(cleanTitle(title));
  const byArtist = hits.filter(hit => overlaps(loose(hit.result.primary_artist.name), wantedArtist));

  return (
    byArtist.find(hit => normalize(hit.result.title) === wantedTitle) ??
    byArtist.find(hit => loose(hit.result.title) === wantedTitle) ??
    byArtist.find(hit => Boolean(wantedBare) && bare(hit.result.title) === wantedBare) ??
    null
  );
};

const get = (
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
    request.on('error', error => reject(new Error(`Genius: ${error.message}`)));
    request.end();
  });

/** Strip accents and the usual suffixes that confuse the search ("- Remastered 2011", "(feat. X)"). */
export const cleanTitle = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([].*?(feat|\bwith\b|\bft\b|remaster|version|edit|mix|live|mono|stereo|deluxe).*?[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo|deluxe).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const decodeEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#?apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const DIV_TAG = /<\/?div\b[^>]*>/g;

/** Inner HTML of the div whose opening tag starts at `openStart`, and the index after its closing tag. */
const balancedDiv = (html: string, openStart: number): {inner: string; end: number} | null => {
  DIV_TAG.lastIndex = openStart;
  let depth = 0;
  let innerStart = -1;
  let match: RegExpExecArray | null;

  while ((match = DIV_TAG.exec(html))) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (0 === depth) return {inner: html.slice(innerStart, match.index), end: DIV_TAG.lastIndex};
    } else {
      depth += 1;
      if (1 === depth) innerStart = DIV_TAG.lastIndex;
    }
  }

  return null;
};

/** Genius nests header and footer chrome in divs inside the lyrics container; the lyrics themselves are not in divs. */
const dropNestedDivs = (html: string): string => {
  let result = html;
  let openStart = result.indexOf('<div');

  while (-1 !== openStart) {
    const block = balancedDiv(result, openStart);

    if (!block) break;

    result = result.slice(0, openStart) + result.slice(block.end);
    openStart = result.indexOf('<div', openStart);
  }

  return result;
};

/** Lyrics text from a Genius song page. Exported for tests. */
export const extractLyrics = (html: string): string => {
  const blocks: string[] = [];
  const container = /<div\b[^>]*data-lyrics-container="true"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = container.exec(html))) {
    const block = balancedDiv(html, match.index);

    if (!block) break;

    blocks.push(dropNestedDivs(block.inner));
    container.lastIndex = block.end;
  }

  if (0 === blocks.length) return '';

  return decodeEntities(
    blocks
      .join('\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const createLyrics = (token: string): Lyrics => {
  // null marks a song Genius has no lyrics for, so the app's polling does not search again every time.
  const cache = new Map<string, LyricsResult | null>();
  const remember = (key: string, result: LyricsResult | null) => {
    cache.set(key, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  };

  return {
    lookup: async (artist, title) => {
      const key = `${artist}|${title}`.toLowerCase();
      const cached = cache.get(key);

      if (cached) return cached;
      if (null === cached) throw new Error('No lyrics found for this song');

      const query = encodeURIComponent(`${cleanTitle(artist)} ${cleanTitle(title)}`);
      const search = await get(`${API}/search?q=${query}`, {authorization: `Bearer ${token}`});

      if (search.status >= 400) throw new Error(`Genius: search failed (HTTP ${search.status})`);

      const hits = (JSON.parse(search.body) as {response?: {hits?: Hit[]}}).response?.hits ?? [];
      const hit = pickHit(hits, artist, title);

      if (!hit) {
        remember(key, null);
        throw new Error('No lyrics found for this song');
      }

      const page = await get(hit.result.url, {'user-agent': 'Mozilla/5.0 (hk agent)'});
      const lyrics = extractLyrics(page.body);

      if (!lyrics) {
        remember(key, null);
        throw new Error('No lyrics on the Genius page');
      }

      const result: LyricsResult = {
        title: hit.result.title,
        artist: hit.result.primary_artist.name,
        url: hit.result.url,
        lyrics,
      };

      remember(key, result);

      return result;
    },
  };
};
