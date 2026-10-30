import {describe, expect, it} from 'vitest';
import {currentLine} from './useLyrics';

const lines = [
  {timeMs: 1000, text: 'one'},
  {timeMs: 5000, text: 'two'},
  {timeMs: 9000, text: 'three'},
];

describe('currentLine', () => {
  it('is -1 before the first line', () => {
    expect(currentLine(lines, 500)).toBe(-1);
  });

  it('is the last line that has started', () => {
    expect(currentLine(lines, 1000)).toBe(0);
    expect(currentLine(lines, 8999)).toBe(1);
    expect(currentLine(lines, 60_000)).toBe(2);
  });
});
