const PATHS = {
  power: 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  sleep: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  volumeDown: 'M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07',
  volumeUp: 'M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14',
  mute: 'M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
  bulb: 'M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.6.6-1 1.5-1 2.5h-5c0-1-.4-1.9-1-2.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'M6 4l14 8-14 8V4z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  previous: 'M19 20L9 12l10-8v16zM5 19V5',
  next: 'M5 4l10 8-10 8V4zM19 5v14',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  speaker:
    'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 6h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
};

export type IconName = keyof typeof PATHS;

export const Icon = ({name}: {name: IconName}) => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={PATHS[name]} />
  </svg>
);
