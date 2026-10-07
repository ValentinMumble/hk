import {describe, expect, it} from 'vitest';
import {hexToRgb, hexToXy} from './color.js';

describe('hexToRgb', () => {
  it('reads long and short hex, with or without the hash', () => {
    expect(hexToRgb('#ffaa71')).toEqual([255, 170, 113]);
    expect(hexToRgb('ffaa71')).toEqual([255, 170, 113]);
    expect(hexToRgb('#fa7')).toEqual([255, 170, 119]);
  });

  it('rejects garbage', () => {
    expect(() => hexToRgb('red')).toThrow('Invalid color: red');
  });
});

describe('hexToXy', () => {
  it('maps white to the D65-ish white point of the Wide RGB matrix', () => {
    const [x, y] = hexToXy('#ffffff');

    expect(x).toBeCloseTo(0.3227, 3);
    expect(y).toBeCloseTo(0.329, 3);
  });

  it('maps pure red to the red corner of the gamut', () => {
    const [x, y] = hexToXy('#ff0000');

    expect(x).toBeCloseTo(0.7006, 3);
    expect(y).toBeCloseTo(0.2993, 3);
  });

  it('treats black as the origin instead of dividing by zero', () => {
    expect(hexToXy('#000')).toEqual([0, 0]);
  });
});

describe('xyToHex', () => {
  it('gives back the same hue (xy carries no brightness, so the result is at full brightness)', async () => {
    const {hexToXy: toXy, xyToHex: toHexColor} = await import('./color.js');
    const normalized = (hex: string) => {
      const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
      const max = Math.max(...channels);

      return channels.map(channel => channel / max);
    };

    expect(toHexColor(toXy('#ff0000'))).toBe('#ff0000');
    normalized(toHexColor(toXy('#01a7c2'))).forEach((channel, index) =>
      expect(channel).toBeCloseTo(normalized('#01a7c2')[index], 1),
    );
    expect(toHexColor([0, 0])).toBe('#000000');
  });
});

describe('miredToHex', () => {
  it('goes from a cool white to a warm orange', async () => {
    const {miredToHex: toHexColor} = await import('./color.js');

    expect(toHexColor(153)).toBe('#e6f0ff');
    expect(toHexColor(500)).toBe('#ffb36b');
    expect(toHexColor(9999)).toBe('#ffb36b');
  });
});
