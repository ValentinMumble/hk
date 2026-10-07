import {useCallback, useEffect, useRef, useState} from 'react';
import type {Api, Light} from './api';
import {Icon} from './Icon';
import {attempt} from './toast';

const COLORS = ['#ffffff', '#ffaa71', '#01a7c2', '#57b133', '#b13333', '#ff96ca'];
const BRIGHTNESS_DEBOUNCE = 300;

const useDebounced = <T extends unknown[]>(callback: (...args: T) => void, delay: number) => {
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(callback);
  latest.current = callback;

  return useCallback(
    (...args: T) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => latest.current(...args), delay);
    },
    [delay],
  );
};

export const Lights = ({api}: {api: Api}) => {
  const [lights, setLights] = useState<Light[]>([]);
  const [brightness, setBrightness] = useState(100);

  const refresh = useCallback(() => attempt(async () => setLights(await api.lights())), [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setColor = async (color: string) => {
    document.documentElement.style.setProperty('--accent', color);
    await attempt(() => api.allLights({on: true, color, brightness: 100}), '🌞 Lights on', color);
    setBrightness(100);
    refresh();
  };

  const allOff = async () => {
    await attempt(() => api.allLights({on: false}), '🌚 Lights off');
    refresh();
  };

  const toggle = (light: Light) =>
    attempt(async () => {
      const {on} = await api.toggleLight(light.id);
      setLights(current => current.map(item => (item.id === light.id ? {...item, on} : item)));
    });

  const commitBrightness = useDebounced(
    (value: number) => attempt(() => api.allLights({brightness: value}), `🔆 ${value}%`),
    BRIGHTNESS_DEBOUNCE,
  );

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Lights</h2>
        <button type="button" className="status" onClick={refresh}>
          {lights.filter(light => light.on).length} on
        </button>
      </header>
      <div className="swatches">
        {COLORS.map(color => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{background: color}}
            aria-label={`All lights ${color}`}
            onClick={() => setColor(color)}
          />
        ))}
        <button type="button" className="swatch off" aria-label="All lights off" onClick={allOff}>
          <Icon name="power" />
        </button>
      </div>
      <div className="row">
        {lights.map(light => (
          <button
            key={light.id}
            type="button"
            className={`chip ${light.on ? 'on' : ''} ${light.reachable ? '' : 'dim'}`}
            onClick={() => toggle(light)}
          >
            <Icon name="bulb" /> {light.name}
          </button>
        ))}
      </div>
      <input
        type="range"
        min={1}
        max={100}
        value={brightness}
        aria-label="Brightness"
        onChange={event => {
          const value = Number(event.target.value);
          setBrightness(value);
          commitBrightness(value);
        }}
      />
    </section>
  );
};
