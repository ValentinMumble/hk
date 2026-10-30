import {useCallback, useEffect, useState} from 'react';
import {coverAccents} from './artwork';

/**
 * One blurred copy of the album art behind the whole app (kept across tabs, the element lives outside React). It fades
 * in only once the picture is decoded: fading an image that is still loading makes it pop in at the end.
 */
const setBackdrop = async (artwork: string | null) => {
  let image = document.querySelector<HTMLImageElement>('img.backdrop');

  if (!image) {
    image = document.createElement('img');
    image.className = 'backdrop';
    image.alt = '';
    document.body.prepend(image);
  }

  if (!artwork) {
    image.classList.remove('visible');

    return;
  }

  image.src = artwork;

  try {
    await image.decode();
  } catch {
    return;
  }

  // A newer song may have replaced the picture meanwhile; its own call shows it
  if (image.src === artwork) image.classList.add('visible');
};

/**
 * The playing song's artwork as the app's blurred backdrop, and its colours as the accent. The returned function moves
 * the accent on to the cover's next colour, then the neutral gray, then back to the first.
 */
export const useArtwork = (artwork: string | null) => {
  const [accents, setAccents] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setBackdrop(artwork);

    if (!artwork) {
      setAccents([]);

      return;
    }

    let isCurrent = true;

    (async () => {
      try {
        const found = await coverAccents(artwork);

        // The previous song's accent stays until the new one is known, so the colour never flashes gray
        if (isCurrent) {
          setAccents(found);
          setIndex(0);
        }
      } catch {
        // the accent stays as it was
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [artwork]);

  useEffect(() => {
    const color = accents[index];
    const root = document.documentElement.style;

    if (color) root.setProperty('--accent', color);
    else root.removeProperty('--accent');
  }, [accents, index]);

  return useCallback(() => setIndex(current => (current + 1) % (accents.length + 1)), [accents.length]);
};
