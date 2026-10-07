import {useCallback, useEffect, useRef, useState, type CSSProperties} from 'react';
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

const lightStyle = (light: Light): CSSProperties =>
  ({'--light': light.color, '--level': light.on ? light.brightness / 100 : 0}) as CSSProperties;

export const Lights = ({api}: {api: Api}) => {
  const [lights, setLights] = useState<Light[]>([]);
  const [brightness, setBrightness] = useState(100);
  const [activeColor, setActiveColor] = useState<string | null>(null);

  const refresh = useCallback(() => attempt(async () => setLights(await api.lights())), [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setColor = async (color: string) => {
    setActiveColor(color);
    document.documentElement.style.setProperty('--accent', color);
    await attempt(() => api.allLights({on: true, color, brightness: 100}), '🌞 Lights on', color);
    setBrightness(100);
    refresh();
  };

  const allOff = async () => {
    setActiveColor(null);
    await attempt(() => api.allLights({on: false}), '🌚 Lights off');
    refresh();
  };

  const toggle = (light: Light) =>
    attempt(async () => {
      const {on} = await api.toggleLight(light.id);
      setLights(current => current.map(item => (item.id === light.id ? {...item, on} : item)));
    });

  const commitBrightness = useDebounced((value: number) => {
    attempt(() => api.allLights({brightness: value}), `🔆 ${value}%`).then(refresh);
  }, BRIGHTNESS_DEBOUNCE);

  const onCount = lights.filter(light => light.on).length;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Lights</h2>
        <button type="button" className="status" onClick={refresh}>
          {onCount ? `${onCount} on` : 'all off'}
        </button>
      </header>
      <div className="lights">
        {lights.map(light => (
          <button
            key={light.id}
            type="button"
            className={`light ${light.on ? 'on' : ''} ${light.reachable ? '' : 'dim'}`}
            style={lightStyle(light)}
            aria-pressed={light.on}
            onClick={() => toggle(light)}
          >
            <span className="light-bulb">
              <Icon name="bulb" />
            </span>
            <span className="light-name">{light.name}</span>
          </button>
        ))}
      </div>
      <div className="swatches">
        {COLORS.map(color => (
          <button
            key={color}
            type="button"
            className={`swatch ${color === activeColor ? 'active' : ''}`}
            style={{background: color}}
            aria-label={`All lights ${color}`}
            onClick={() => setColor(color)}
          />
        ))}
        <button type="button" className="swatch off" aria-label="All lights off" onClick={allOff}>
          <Icon name="power" />
        </button>
      </div>
      <div className="row brightness-row">
        <span className="status">🔅</span>
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
        <span className="status">🔆</span>
      </div>
    </section>
  );
};
