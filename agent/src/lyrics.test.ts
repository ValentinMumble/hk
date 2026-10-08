import {describe, expect, it} from 'vitest';
import {cleanTitle, extractLyrics, pickHit, type Hit} from './lyrics.js';

describe('cleanTitle', () => {
  it('drops remaster and feat suffixes and accents', () => {
    expect(cleanTitle('Shine On You Crazy Diamond - 2011 Remastered Version')).toBe('Shine On You Crazy Diamond');
    expect(cleanTitle('Umbrella (feat. JAY-Z)')).toBe('Umbrella');
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
});
