import {request as httpsRequest} from 'node:https';
import type {Lyrics, LyricsLine, LyricsResult, Song} from './types.js';

/**
 * Lyrics from LRCLIB first: an open database with time-coded lines and no key. Genius is the fallback when a token
 * is set: its API finds the song and the song page holds the text (Genius does not serve lyrics through its API), so
 * the page is fetched and its lyrics blocks extracted.
 */
const LRCLIB_API = 'https://lrclib.net/api';
const GENIUS_API = 'https://api.genius.com';
const TIMEOUT_MS = 10_000;
const CACHE_SIZE = 10;
const NOT_FOUND = 'No lyrics found for this song';
/** Time-coded lines only line up with a recording of the same length, give or take this. */
const SYNC_TOLERANCE_S = 3;

export type Hit = {result: {title: string; url: string; primary_artist: {name: string}}};
export type LrclibHit = {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

/** Lowercase, no accents, no punctuation, no leading "the": enough to compare names loosely. */
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Version notes such as "(feat. X)" or "- 2011 Remaster", which confuse searches and comparisons. */
const withoutVersionNotes = (value: string) =>
  value
    .replace(/\s*[([].*?(feat|\bwith\b|\bft\b|remaster|version|edit|mix|live|mono|stereo|deluxe).*?[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo|deluxe).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Strip accents and the version notes. */
export const cleanTitle = (value: string) => withoutVersionNotes(value.normalize('NFD').replace(/[̀-ͯ]/g, ''));

/** Same as normalize, with version notes removed first. */
const loose = (value: string) => normalize(cleanTitle(value));

/** Whole-word containment either way, so "Daft Punk" matches "Daft Punk & Pharrell" but "Air" not "Fairground". */
const overlaps = (left: string, right: string) =>
  Boolean(left && right) && (` ${left} `.includes(` ${right} `) || ` ${right} `.includes(` ${left} `));

/** Title without any bracketed part, for "Song (with X)" against "Song", or "(Pts. 1-5)" against "(Parts I-V)". */
const bare = (value: string) => normalize(value.replace(/\s*[([].*?[)\]]/g, ''));

/**
 * How well a found song matches the wanted one: 3 for the same title, 2 once version notes are removed, 1 once every
 * bracketed part is removed, 0 for another title or another artist. Both must match: searches always return
 * something, and another song's lyrics (even by the same artist) are worse than none.
 */
const matchScore = (foundArtist: string, foundTitle: string, artist: string, title: string) => {
  if (!overlaps(loose(foundArtist), loose(artist))) return 0;
  if (normalize(foundTitle) === loose(title)) return 3;
  if (loose(foundTitle) === loose(title)) return 2;

  const wantedBare = bare(cleanTitle(title));

  return wantedBare && bare(foundTitle) === wantedBare ? 1 : 0;
};

/** The Genius hit to use, or null when no hit is this song by this artist. Exported for tests. */
export const pickHit = (hits: Hit[], artist: string, title: string): Hit | null => {
  let best: Hit | null = null;
  let bestScore = 0;

  for (const hit of hits) {
    const score = matchScore(hit.result.primary_artist.name, hit.result.title, artist, title);

    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }

  return best;
};

const TIME_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

/** "[01:02.34] words" lines to time-coded lines, in order. Tags such as "[ar: …]" are skipped. Exported for tests. */
export const parseSynced = (text: string): LyricsLine[] => {
  const lines: LyricsLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const words = raw.replace(TIME_TAG, '').trim();

    for (const [, minutes, seconds] of raw.matchAll(TIME_TAG)) {
      lines.push({timeMs: Math.round((Number(minutes) * 60 + Number(seconds)) * 1000), text: words});
    }
  }

  return lines.sort((left, right) => left.timeMs - right.timeMs);
};

/**
 * Lyrics from LRCLIB search hits, or null when none is this song. Time-coded lines come from the hit whose length is
 * closest to the recording's, within a few seconds; otherwise the plain words of the closest hit. Exported for tests.
 */
export const fromLrclib = (hits: LrclibHit[], {artist, title, durationMs}: Song): LyricsResult | null => {
  const gap = (hit: LrclibHit) => (undefined === durationMs ? Infinity : Math.abs(hit.duration - durationMs / 1000));
  const matching = hits
    .filter(hit => matchScore(hit.artistName, hit.trackName, artist, title) > 0)
    .sort((left, right) => gap(left) - gap(right));
  const timed = matching.find(hit => hit.syncedLyrics && gap(hit) <= SYNC_TOLERANCE_S);
  const closest = timed ?? matching[0];

  if (!closest) return null;

  const base = {
    title: closest.trackName,
    artist: closest.artistName,
    source: 'LRCLIB' as const,
    url: 'https://lrclib.net',
  };

  if (timed?.syncedLyrics) {
    const synced = parseSynced(timed.syncedLyrics);

    return {
      ...base,
      lyrics: timed.plainLyrics ?? synced.map(line => line.text).join('\n'),
      synced,
      instrumental: false,
    };
  }

  if (closest.instrumental) return {...base, lyrics: '', synced: null, instrumental: true};

  const worded = matching.find(hit => hit.plainLyrics || hit.syncedLyrics);
  const words =
    worded?.plainLyrics ??
    (worded?.syncedLyrics
      ? parseSynced(worded.syncedLyrics)
          .map(line => line.text)
          .join('\n')
      : '');

  return words ? {...base, lyrics: words, synced: null, instrumental: false} : null;
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
    request.on('error', error => reject(new Error(`${new URL(url).host}: ${error.message}`)));
    request.end();
  });

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

const searchLrclib = async ({artist, title}: Song, userAgent: string): Promise<LrclibHit[]> => {
  const query = new URLSearchParams({artist_name: artist, track_name: withoutVersionNotes(title)});
  const search = await get(`${LRCLIB_API}/search?${query}`, {'user-agent': userAgent});

  if (search.status >= 400) throw new Error(`LRCLIB: search failed (HTTP ${search.status})`);

  return JSON.parse(search.body) as LrclibHit[];
};

/** Lyrics from Genius, or null when it has no such song or no words on its page. */
const fromGenius = async (token: string, {artist, title}: Song): Promise<LyricsResult | null> => {
  const query = encodeURIComponent(`${cleanTitle(artist)} ${cleanTitle(title)}`);
  const search = await get(`${GENIUS_API}/search?q=${query}`, {authorization: `Bearer ${token}`});

  if (search.status >= 400) throw new Error(`Genius: search failed (HTTP ${search.status})`);

  const hits = (JSON.parse(search.body) as {response?: {hits?: Hit[]}}).response?.hits ?? [];
  const hit = pickHit(hits, artist, title);

  if (!hit) return null;

  const page = await get(hit.result.url, {'user-agent': 'Mozilla/5.0 (hk agent)'});
  const lyrics = extractLyrics(page.body);

  if (!lyrics) return null;

  return {
    title: hit.result.title,
    artist: hit.result.primary_artist.name,
    source: 'Genius',
    url: hit.result.url,
    lyrics,
    synced: null,
    instrumental: false,
  };
};

export const createLyrics = ({geniusToken, userAgent}: {geniusToken: string | null; userAgent: string}): Lyrics => {
  // null marks a song no source has lyrics for, so the app does not search again each time it asks
  const cache = new Map<string, LyricsResult | null>();
  const remember = (key: string, result: LyricsResult | null) => {
    cache.set(key, result);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  };

  return {
    lookup: async song => {
      const key = `${song.artist}|${song.title}`.toLowerCase();
      const cached = cache.get(key);

      if (cached) return cached;
      if (null === cached) throw new Error(NOT_FOUND);

      // When LRCLIB is down, Genius still answers, but that answer is not kept: the next try may get timed lines
      let isLrclibUp = true;
      const hits = await searchLrclib(song, userAgent).catch(() => {
        isLrclibUp = false;

        return [];
      });
      const result = fromLrclib(hits, song) ?? (geniusToken ? await fromGenius(geniusToken, song) : null);

      if (isLrclibUp) remember(key, result);
      if (!result) throw new Error(NOT_FOUND);

      return result;
    },
  };
};
