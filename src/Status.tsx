import {useEffect, useState} from 'react';
import {createApi, type AgentInfo} from './api';
import type {Settings} from './settings';

type Line = {label: string; value: string; ok: boolean | null};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

/** What works right now, checked against the agent when the settings screen opens. */
export const Status = ({settings}: {settings: Settings}) => {
  const [lines, setLines] = useState<Line[]>([{label: 'Agent', value: 'checking…', ok: null}]);

  useEffect(() => {
    let cancelled = false;
    const api = createApi(settings);

    (async () => {
      let info: AgentInfo;

      try {
        info = await api.info();
      } catch (error) {
        if (!cancelled)
          setLines([{label: 'Agent', value: error instanceof Error ? error.message : 'unreachable', ok: false}]);

        return;
      }

      const next: Line[] = [
        {
          label: 'Agent',
          value: `v${info.version ?? '?'}, up ${formatUptime(info.uptime ?? 0)}${info.mock ? ', mock' : ''}`,
          ok: true,
        },
        {label: 'Address', value: settings.agentUrl.replace(/^https?:\/\//, ''), ok: true},
      ];

      const [hk, hue, spotify] = await Promise.all([
        api.hkStatus().then(
          () => true,
          () => false,
        ),
        api.lights().then(
          lights => `${lights.filter(light => light.reachable).length}/${lights.length} reachable`,
          () => null,
        ),
        info.spotify.connected
          ? api.spotify.state().then(
              state => state.device?.name ?? 'idle',
              () => null,
            )
          : Promise.resolve(null),
      ]);

      next.push({label: 'Amp', value: hk ? 'answers' : 'no answer (off?)', ok: hk});
      next.push({label: 'Hue', value: hue ?? 'bridge unreachable', ok: null !== hue});
      next.push({
        label: 'Spotify',
        value: !info.spotify.configured
          ? 'not configured'
          : !info.spotify.connected
            ? 'not connected'
            : (spotify ?? 'error'),
        ok: info.spotify.configured && info.spotify.connected && null !== spotify,
      });
      next.push({
        label: 'Lyrics',
        value: info.lyrics?.configured ? 'Genius configured' : 'not configured',
        ok: info.lyrics?.configured ?? false,
      });

      if (!cancelled) setLines(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [settings]);

  return (
    <dl className="status-list">
      {lines.map(line => (
        <div key={line.label} className={`status-line ${null === line.ok ? '' : line.ok ? 'ok' : 'bad'}`}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  );
};
