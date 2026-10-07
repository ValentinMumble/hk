import {describe, expect, it} from 'vitest';
import {cleanTitle, extractLyrics} from './lyrics.js';

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
