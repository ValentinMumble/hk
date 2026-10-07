import {useCallback, useEffect, useRef, useState, type CSSProperties} from 'react';
import type {Api, Light} from './api';
import {Icon, type IconName} from './Icon';
import {attempt} from './toast';

const COLORS = ['#ffffff', '#ffaa71', '#01a7c2', '#57b133', '#b13333', '#ff96ca'];
const DEBOUNCE_MS = 300;

/** Icons by light name, like the old app did; anything else is a plain bulb. */
const ICONS: Record<string, IconName> = {
  boule: 'ball',
  strip: 'strip',
  pied: 'floorLamp',
  applique: 'wallLamp',
  porte: 'door',
};
const lightIcon = (name: string): IconName => ICONS[name.trim().toLowerCase()] ?? 'bulb';

const hslToHex = (hue: number, saturation: number, lightness: number) => {
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));

    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

/** Point in the wheel (0-1 coordinates) to a colour: angle is the hue, distance from the centre the saturation. */
const wheelColor = (x: number, y: number) => {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const hue = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;
  const saturation = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);

  return hslToHex(hue, 1, 1 - saturation * 0.5);
};

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
  const [wheelPoint, setWheelPoint] = useState<{x: number; y: number} | null>(null);
  const isDragging = useRef(false);

  const refresh = useCallback(() => attempt(async () => setLights(await api.lights())), [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setAccent = (color: string) => document.documentElement.style.setProperty('--accent', color);

  const setColor = async (color: string, label = '🌞 Lights on') => {
    setActiveColor(color);
    setAccent(color);
    await attempt(() => api.allLights({on: true, color, brightness: 100, effect: 'none'}), label, color);
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
  }, DEBOUNCE_MS);

  const commitPicked = useDebounced((value: string) => setColor(value, '🎨 Lights on'), DEBOUNCE_MS);

  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const dx = x - 0.5;
    const dy = y - 0.5;

    if (Math.sqrt(dx * dx + dy * dy) > 0.5) return;

    setWheelPoint({x, y});
    const color = wheelColor(x, y);
    setAccent(color);
    commitPicked(color);
  };

  const onCount = lights.filter(light => light.on).length;

  return (
    <section className="panel compact">
      <header className="panel-header">
        <h2>Lights</h2>
        <button type="button" className="status" onClick={refresh}>
          {onCount ? `${onCount} on` : 'all off'}
        </button>
      </header>
      <div className="panel-body">
        <div className="lights">
          {lights.map(light => (
            <button
              key={light.id}
              type="button"
              className={`light ${light.on ? 'on' : ''} ${light.reachable ? '' : 'dim'}`}
              style={lightStyle(light)}
              aria-pressed={light.on}
              aria-label={light.name}
              title={light.name}
              onClick={() => toggle(light)}
            >
              <Icon name={lightIcon(light.name)} />
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
        <div
          className="wheel"
          role="slider"
          aria-label="Colour wheel"
          onPointerDown={event => {
            isDragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            pick(event);
          }}
          onPointerMove={event => {
            if (isDragging.current) pick(event);
          }}
          onPointerUp={() => {
            isDragging.current = false;
          }}
          onPointerCancel={() => {
            isDragging.current = false;
          }}
        >
          {wheelPoint && (
            <span
              className="wheel-dot"
              style={{
                left: `${wheelPoint.x * 100}%`,
                top: `${wheelPoint.y * 100}%`,
                background: wheelColor(wheelPoint.x, wheelPoint.y),
              }}
            />
          )}
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
      </div>
    </section>
  );
};
