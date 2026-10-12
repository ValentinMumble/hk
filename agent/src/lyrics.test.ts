import {describe, expect, it} from 'vitest';
import {cleanTitle, extractLyrics, fromLrclib, parseSynced, pickHit, type Hit, type LrclibHit} from './lyrics.js';

describe('cleanTitle', () => {
  it('drops remaster and feat suffixes and accents', () => {
    expect(cleanTitle('Shine On You Crazy Diamond - 2011 Remastered Version')).toBe('Shine On You Crazy Diamond');
    expect(cleanTitle('Umbrella (feat. JAY-Z)')).toBe('Umbrella');
    expect(cleanTitle('Stargazing (with Justin Jesso)')).toBe('Stargazing');
    expect(cleanTitle('Élodie  Frégé')).toBe('Elodie Frege');
  });
});

describe('extractLyrics', () => {
  it('joins the lyrics containers, keeps line breaks and decodes entities', () => {
    const html = `
      <div class="x" data-lyrics-container="true">[Verse 1]<br/>Hello &amp; <i>goodbye</i><br>It&#x27;s me</div>
      <div data-lyrics-container="true" id="y">[Chorus]<br/>La la</div>`;

    expect(extractLyrics(html)).toBe("[Verse 1]\nHello & goodbye\nIt's me\n[Chorus]\nLa la");
  });

  it('drops the header and footer chrome Genius nests inside the container', () => {
    const html = `<div data-lyrics-container="true" class="Lyrics__Container">
      <div class="LyricsHeader__Container"><div>173 Contributors</div><span>Translations</span></div>
      [Verse 1]<br/>Ticking away <a href="/x"><span>the moments</span></a><br/>
      <div class="Footer"><div>Embed</div></div>
    </div>
    <div data-lyrics-container="true">[Outro]<br/>Home again</div>`;

    expect(extractLyrics(html)).toBe('[Verse 1]\nTicking away the moments\n\n[Outro]\nHome again');
  });

  it('returns an empty string when the page has no lyrics block', () => {
    expect(extractLyrics('<html><body>nope</body></html>')).toBe('');
  });
});

describe('pickHit', () => {
  const hit = (artist: string, title: string): Hit => ({
    result: {title, url: `https://genius.com/${title}`, primary_artist: {name: artist}},
  });

  it('prefers the hit by the right artist with the right title', () => {
    const hits = [hit('Speedknot Mobstaz', 'Chicago'), hit('Pink Floyd', 'Time (Live)'), hit('Pink Floyd', 'Time')];

    expect(pickHit(hits, 'Pink Floyd', 'Time - 2011 Remaster')?.result.title).toBe('Time');
  });

  it('accepts a loose artist match, such as a missing "The"', () => {
    const hits = [hit('Jesus and Mary Chain', 'Just Like Honey')];

    expect(pickHit(hits, 'The Jesus and Mary Chain', 'Just Like Honey')).toBe(hits[0]);
  });

  it('returns nothing when no hit is by the artist, even if a title looks close', () => {
    const hits = [hit('Speedknot Mobstaz', 'Chicago'), hit('Somebody', 'Working After Dark')];

    expect(pickHit(hits, 'Drinking Flowers', 'Working After Dark')).toBeNull();
  });

  it('returns nothing when the artist is right but the song is not on Genius', () => {
    const hits = [hit('Drinking Flowers', 'Simulated Happiness'), hit('Drinking Flowers', 'Black Monday')];

    expect(pickHit(hits, 'Drinking Flowers', 'Working After Dark')).toBeNull();
  });

  it('does not take a shorter title or a word inside another name as a match', () => {
    expect(pickHit([hit('Drinking Flowers', 'Working')], 'Drinking Flowers', 'Working After Dark')).toBeNull();
    expect(pickHit([hit('Fairground Attraction', 'Perfect')], 'Air', 'Perfect')).toBeNull();
  });

  it('matches titles that differ only by a bracketed note or "&"', () => {
    expect(pickHit([hit('Kygo', 'Stargazing')], 'Kygo', 'Stargazing (with Justin Jesso)')).not.toBeNull();
    expect(pickHit([hit('Queen', 'Rock and Roll')], 'Queen', 'Rock & Roll')).not.toBeNull();
  });
});

describe('parseSynced', () => {
  it('reads time tags, keeps pauses as empty lines, skips other tags and sorts by time', () => {
    const text = '[ar: Pink Floyd]\n[00:02.50] Second\n[00:01.00][00:04.00] Twice\n[00:03.25]\nno time';

    expect(parseSynced(text)).toEqual([
      {timeMs: 1000, text: 'Twice'},
      {timeMs: 2500, text: 'Second'},
      {timeMs: 3250, text: ''},
      {timeMs: 4000, text: 'Twice'},
    ]);
  });
});

describe('fromLrclib', () => {
  const lrclibHit = (overrides: Partial<LrclibHit>): LrclibHit => ({
    trackName: 'Get Lucky',
    artistName: 'Daft Punk',
    duration: 369,
    instrumental: false,
    plainLyrics: 'Like the legend of the phoenix',
    syncedLyrics: '[00:10.00] Like the legend of the phoenix',
    ...overrides,
  });

  it('takes the timed lines of the hit with the same length', () => {
    const hits = [lrclibHit({duration: 248, syncedLyrics: '[00:01.00] radio edit'}), lrclibHit({duration: 368.4})];
    const result = fromLrclib(hits, {
      artist: 'Daft Punk',
      title: 'Get Lucky (feat. Pharrell Williams)',
      durationMs: 369_000,
    });

    expect(result?.source).toBe('LRCLIB');
    expect(result?.synced).toEqual([{timeMs: 10_000, text: 'Like the legend of the phoenix'}]);
  });

  it('falls back to plain words when no hit has the same length', () => {
    const result = fromLrclib([lrclibHit({duration: 248})], {
      artist: 'Daft Punk',
      title: 'Get Lucky',
      durationMs: 369_000,
    });

    expect(result?.synced).toBeNull();
    expect(result?.lyrics).toBe('Like the legend of the phoenix');
  });

  it('never uses timed lines without the length of the recording', () => {
    expect(fromLrclib([lrclibHit({})], {artist: 'Daft Punk', title: 'Get Lucky'})?.synced).toBeNull();
  });

  it('reports instrumentals', () => {
    const hits = [lrclibHit({instrumental: true, plainLyrics: null, syncedLyrics: null})];

    expect(fromLrclib(hits, {artist: 'Daft Punk', title: 'Get Lucky', durationMs: 369_000})?.instrumental).toBe(true);
  });

  it('returns nothing for another song or another artist', () => {
    const hits = [lrclibHit({trackName: 'Lose Yourself to Dance'}), lrclibHit({artistName: 'Pharrell Williams'})];

    expect(fromLrclib(hits, {artist: 'Daft Punk', title: 'Get Lucky', durationMs: 369_000})).toBeNull();
  });
});
