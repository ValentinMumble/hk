const PATHS = {
  power: 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  sleep: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  volumeDown: 'M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07',
  volumeUp: 'M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14',
  mute: 'M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
  bulb: 'M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.6.6-1 1.5-1 2.5h-5c0-1-.4-1.9-1-2.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
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
