import {HK_COMMANDS} from './hk.js';
import type {Devices, HueState, Light} from './types.js';

const STATUS_REPLY =
  '<?xml version="1.0" encoding="UTF-8"?><harman><avr><common><status><name>heart-alive</name><zone>Main Zone</zone><para>on</para></status></common></avr></harman>';

/** Fake devices so the web app can be developed without the amp or the bridge. */
export const createMockDevices = (): Devices => {
  const lights: Light[] = [
    {id: '1', name: 'Boule', on: false, reachable: true, brightness: 100, hasColor: true},
    {id: '2', name: 'Strip', on: true, reachable: true, brightness: 60, hasColor: true},
    {id: '3', name: 'Pied', on: false, reachable: true, brightness: 100, hasColor: false},
    {id: '4', name: 'Applique', on: false, reachable: false, brightness: 100, hasColor: false},
  ];

  const find = (id: string): Light => {
    const light = lights.find(candidate => candidate.id === id);

    if (!light) throw new Error(`Hue: light ${id} not found`);

    return light;
  };

  const apply = (light: Light, {on, brightness}: HueState) => {
    if (undefined !== on) light.on = on;
    if (undefined !== brightness) light.brightness = brightness;
  };

  return {
    hk: {
      send: async (command, para) => {
        console.log(`[mock] HK ${command}${para ? ` "${para}"` : ''}`);

        return HK_COMMANDS[command]?.hasResponse ? STATUS_REPLY : undefined;
      },
    },
    hue: {
      lights: async () => lights.map(light => ({...light})),
      setAll: async state => {
        console.log('[mock] Hue all', state);
        lights.forEach(light => apply(light, state));
      },
      setLight: async (id, state) => {
        console.log(`[mock] Hue light ${id}`, state);
        apply(find(id), state);
      },
      toggle: async id => {
        const light = find(id);
        light.on = !light.on;
        console.log(`[mock] Hue toggle ${id} -> ${light.on}`);

        return light.on;
      },
    },
  };
};
