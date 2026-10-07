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
