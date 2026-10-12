import {useEffect, useState} from 'react';
import {createApi, type AgentInfo} from './api';
import {attempt} from './toast';
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
  const [build, setBuild] = useState<AgentInfo['build']>(null);
  const [updating, setUpdating] = useState<string | null>(null);

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

      if (!cancelled) setBuild(info.build ?? null);

      const next: Line[] = [
        {
          label: 'Agent',
          value: `${info.build ? `${info.build.sha} (${info.build.date.slice(0, 10)})` : `v${info.version ?? '?'}`}, up ${formatUptime(info.uptime ?? 0)}${info.mock ? ', mock' : ''}`,
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
        value: !info.lyrics?.configured ? 'not configured' : info.lyrics.genius ? 'LRCLIB, then Genius' : 'LRCLIB',
        ok: info.lyrics?.configured ?? false,
      });

      if (!cancelled) setLines(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [settings]);

  /** Ask the agent to fetch the latest build, then wait for it to come back with a different one. */
  const updateAgent = () =>
    attempt(async () => {
      const api = createApi(settings);
      setUpdating('downloading…');
      const next = await api.update();
      setUpdating(`restarting into ${next.sha}…`);

      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const info = await api.info();

          if (info.build?.sha === next.sha) {
            setBuild(info.build);

            return;
          }
        } catch {
          // still restarting
        }
      }

      throw new Error('The agent did not come back, check it on the Pi');
    }, '✅ Agent updated').finally(() => setUpdating(null));

  return (
    <dl className="status-list">
      {lines.map(line => (
        <div key={line.label} className={`status-line ${null === line.ok ? '' : line.ok ? 'ok' : 'bad'}`}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
      <div className="status-line">
        <dt>Update</dt>
        <dd>
          <button type="button" className="status" disabled={null !== updating} onClick={updateAgent}>
            {updating ?? (build ? 'fetch latest build' : 'fetch latest build (local build now)')}
          </button>
        </dd>
      </div>
    </dl>
  );
};
