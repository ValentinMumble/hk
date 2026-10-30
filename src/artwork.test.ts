import {describe, expect, it} from 'vitest';
import {accentsFromPixels} from './artwork';

/** RGBA pixels: `count` of each colour, in order. */
const pixels = (...groups: Array<[[number, number, number], number]>) =>
  groups.flatMap(([[red, green, blue], count]) => Array.from({length: count}, () => [red, green, blue, 255]).flat());

const hue = (hex: string) => {
  const [red, green, blue] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));

  return red >= green && red >= blue ? 'red' : green >= blue ? 'green' : 'blue';
};

describe('accentsFromPixels', () => {
  it('gives nothing for a cover without colour', () => {
    expect(accentsFromPixels(pixels([[30, 30, 30], 500], [[240, 240, 240], 500]))).toEqual([]);
  });

  it('ranks the colours by how much vivid colour there is', () => {
    const accents = accentsFromPixels(pixels([[200, 20, 20], 300], [[20, 20, 200], 100]));

    expect(accents.map(hue)).toEqual(['red', 'blue']);
  });

  it('counts close hues as one colour', () => {
    expect(accentsFromPixels(pixels([[200, 20, 20], 300], [[200, 40, 20], 300]))).toHaveLength(1);
  });

  it('brightens dark colours so they stand out on black', () => {
    const [accent] = accentsFromPixels(pixels([[90, 10, 10], 400]));
    const red = parseInt(accent.slice(1, 3), 16);

    expect(red).toBeGreaterThanOrEqual(Math.round(0.85 * 255));
  });
});
