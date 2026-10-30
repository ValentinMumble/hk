import {describe, expect, it} from 'vitest';
import {formatTime, splitTitle} from './title';

describe('splitTitle', () => {
  it('takes trailing version notes off the title', () => {
    expect(splitTitle('Dreams - 2004 Remaster')).toEqual({title: 'Dreams', extras: ['2004 Remaster']});
    expect(splitTitle('Song (feat. X) - Live')).toEqual({title: 'Song', extras: ['feat. X', 'Live']});
    expect(splitTitle('Track [Radio Edit]')).toEqual({title: 'Track', extras: ['Radio Edit']});
  });

  it('keeps groups that are part of the title', () => {
    expect(splitTitle('Hot - Blooded')).toEqual({title: 'Hot - Blooded', extras: []});
    expect(splitTitle('Song (Part II)')).toEqual({title: 'Song (Part II)', extras: []});
    expect(splitTitle("(Don't Fear) The Reaper")).toEqual({title: "(Don't Fear) The Reaper", extras: []});
  });
});

describe('formatTime', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(187_400)).toBe('3:07');
    expect(formatTime(-5)).toBe('0:00');
  });
});
