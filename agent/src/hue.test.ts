import {describe, expect, it} from 'vitest';
import {toScenes} from './hue.js';

describe('toScenes', () => {
  it('drops temporary scenes, names the room and sorts by name', () => {
    const scenes = {
      abc: {name: 'Relax', type: 'GroupScene', group: '1'},
      def: {name: 'Bright', type: 'GroupScene', group: '2'},
      ghi: {name: 'Tmp', type: 'LightScene', recycle: true},
      jkl: {name: 'Loose', type: 'LightScene'},
    };
    const groups = {'1': {name: 'Living room'}, '2': {name: 'Bedroom'}};

    expect(toScenes(scenes, groups)).toEqual([
      {id: 'def', name: 'Bright', room: 'Bedroom'},
      {id: 'jkl', name: 'Loose', room: null},
      {id: 'abc', name: 'Relax', room: 'Living room'},
    ]);
  });
});
