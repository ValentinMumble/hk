import {useCallback, useEffect, useRef, useState, type CSSProperties} from 'react';
import type {Api, HueScene, Light} from './api';
import {Icon, type IconName} from './Icon';
import {attempt} from './toast';

const COLORS = ['#ffffff', '#ffaa71', '#01a7c2', '#57b133', '#b13333', '#ff96ca'];
const DEBOUNCE_MS = 300;
const LONG_PRESS_MS = 450;
/** Placeholder tiles shown until the first read of the lights answers. */
const SKELETON_TILES = 6;

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

/** A scene's name, with its room when another scene has the same name. */
const sceneLabel = (scene: HueScene, scenes: HueScene[]) =>
  scene.room && scenes.some(other => other.id !== scene.id && other.name === scene.name)
    ? `${scene.name} · ${scene.room}`
    : scene.name;

const lightStyle = (light: Light): CSSProperties => ({'--light': light.color}) as CSSProperties;

export const Lights = ({api}: {api: Api}) => {
  const [lights, setLights] = useState<Light[]>([]);
  const [brightness, setBrightness] = useState(100);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [scenes, setScenes] = useState<HueScene[]>([]);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [wheelPoint, setWheelPoint] = useState<{x: number; y: number} | null>(null);
  /** A lamp picked with a long press: colours and brightness then go to it alone. */
  const [target, setTarget] = useState<Light | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const isDragging = useRef(false);

  // Read quietly: when the bridge or the agent is out of reach, the header says so instead of a toast
  const [isReachable, setReachable] = useState(true);
  const [isLoaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setLights(await api.lights());
      setReachable(true);
    } catch {
      setReachable(false);
    }
    setLoaded(true);
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Scenes are a bonus: when the agent or the bridge cannot list them, the row just stays out
  useEffect(() => {
    (async () => {
      try {
        setScenes(await api.scenes());
      } catch {
        setScenes([]);
      }
    })();
  }, [api]);

  const setAccent = (color: string) => document.documentElement.style.setProperty('--accent', color);

  const setColor = async (color: string, label = target ? `🌞 ${target.name}` : '🌞 Lights on') => {
    setActiveColor(color);
    setActiveScene(null);
    setAccent(color);
    await attempt(
      () =>
        target
          ? api.setLight(target.id, {on: true, color, brightness: 100})
          : api.allLights({on: true, color, brightness: 100, effect: 'none'}),
      label,
      color,
    );
    setBrightness(100);
    refresh();
  };

  const allOff = async () => {
    setActiveColor(null);
    setActiveScene(null);
    await attempt(() => api.allLights({on: false}), '🌚 Lights off');
    refresh();
  };

  const recall = async (scene: HueScene) => {
    setActiveScene(scene.id);
    setActiveColor(null);
    await attempt(() => api.recallScene(scene.id), `✨ ${scene.name}`);
    refresh();
  };

  const startPress = (light: Light) => {
    longPressed.current = false;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setTarget(current => (current?.id === light.id ? null : light));
    }, LONG_PRESS_MS);
  };

  const endPress = () => window.clearTimeout(pressTimer.current);

  const toggle = (light: Light) =>
    attempt(async () => {
      if (longPressed.current) return;

      const {on} = await api.toggleLight(light.id);
      setLights(current => current.map(item => (item.id === light.id ? {...item, on} : item)));
    });

  const commitBrightness = useDebounced((value: number) => {
    attempt(
      () => (target ? api.setLight(target.id, {brightness: value}) : api.allLights({brightness: value})),
      `🔆 ${value}%`,
    ).then(refresh);
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
    <section className={`panel compact ${isReachable ? '' : 'offline'}`}>
      <header className="panel-header">
        <h2>Hue</h2>
        {target ? (
          <button type="button" className="chip on" onClick={() => setTarget(null)}>
            {target.name} ✕
          </button>
        ) : (
          <button type="button" className={`pill ${!isLoaded ? '' : isReachable ? 'ok' : 'bad'}`} onClick={refresh}>
            {!isLoaded ? 'Checking' : !isReachable ? 'Offline · retry' : onCount ? `${onCount} on` : 'All off'}
          </button>
        )}
      </header>
      <div className="panel-body">
        <div className="lights">
          {!isLoaded &&
            Array.from({length: SKELETON_TILES}, (_, index) => <span key={index} className="light skeleton" />)}
          {lights.map(light => (
            <button
              key={light.id}
              type="button"
              className={`light ${light.on ? 'on' : ''} ${light.reachable ? '' : 'dim'} ${target?.id === light.id ? 'targeted' : ''}`}
              style={lightStyle(light)}
              aria-pressed={light.on}
              aria-label={`${light.name} (hold to colour it alone)`}
              title={light.name}
              onPointerDown={() => startPress(light)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onContextMenu={event => event.preventDefault()}
              onClick={() => toggle(light)}
            >
              <span className="light-icon">
                <Icon name={lightIcon(light.name)} />
              </span>
              <span className="light-text">
                <span className="light-name">{light.name}</span>
                <span className="light-state">
                  {!light.reachable ? 'Unreachable' : light.on ? `${light.brightness}%` : 'Off'}
                </span>
              </span>
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
        </div>
        {scenes.length > 0 && (
          <div className="scenes" role="group" aria-label="Scenes" data-no-swipe>
            {scenes.map(scene => (
              <button
                key={scene.id}
                type="button"
                className={`chip ${scene.id === activeScene ? 'on' : ''}`}
                onClick={() => recall(scene)}
              >
                {sceneLabel(scene, scenes)}
              </button>
            ))}
          </div>
        )}
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
            style={{'--value': `${brightness}%`} as CSSProperties}
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
      <footer className="panel-footer">
        <span />
        <button type="button" className="round off" aria-label="All lights off" onClick={allOff}>
          <Icon name="power" />
        </button>
        <span />
      </footer>
    </section>
  );
};
