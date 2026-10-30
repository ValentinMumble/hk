const SIDE = 32;
const HUE_GROUPS = 24;

type Hsv = {hue: number; saturation: number; brightness: number};

const toHsv = (red: number, green: number, blue: number): Hsv => {
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta + 6) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }

  return {hue: hue / 6, saturation: 0 === max ? 0 : delta / max, brightness: max};
};

const toHex = ({hue, saturation, brightness}: Hsv) => {
  const channel = (offset: number) => {
    const position = (offset + hue * 6) % 6;

    return brightness - brightness * saturation * Math.max(0, Math.min(position, 4 - position, 1));
  };

  return `#${[channel(5), channel(3), channel(1)]
    .map(value =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** Hue groups closer than this count as one colour, so each accent offered is clearly different from the others. */
const NEAR_GROUPS = 2;
/** A group needs at least this much vivid colour to be offered; below it, a cover has no colour of its own. */
const MIN_WEIGHT = 0.5;

/**
 * The accent colours of a cover, strongest first, like the Mac app's: each a hue that is present in the cover, made
 * bright enough to stand out on black. Near-black and near-white pixels are skipped, and the rest are grouped by hue,
 * weighted by how vivid they are, so a small red detail on a cream cover still counts. Empty for a cover with no colour
 * at all, which keeps the neutral gray. Works on RGBA pixels, as a canvas gives them.
 */
export const accentsFromPixels = (data: ArrayLike<number>, limit = 4): string[] => {
  const groups = Array.from({length: HUE_GROUPS}, (_, index) => ({index, weight: 0, red: 0, green: 0, blue: 0}));

  for (let offset = 0; offset < data.length; offset += 4) {
    const [red, green, blue] = [data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255];
    const {hue, saturation, brightness} = toHsv(red, green, blue);

    // Shadows and paper white say nothing about the cover's colour
    if (brightness <= 0.2 || saturation <= 0.06) continue;

    const group = groups[Math.min(HUE_GROUPS - 1, Math.floor(hue * HUE_GROUPS))];
    const weight = saturation * saturation * brightness;
    group.weight += weight;
    group.red += red * weight;
    group.green += green * weight;
    group.blue += blue * weight;
  }

  const picked: typeof groups = [];
  const distance = (first: number, second: number) => {
    const gap = Math.abs(first - second);

    return Math.min(gap, HUE_GROUPS - gap);
  };

  for (const group of [...groups].sort((first, second) => second.weight - first.weight)) {
    if (group.weight <= MIN_WEIGHT || picked.length >= limit) break;
    if (picked.some(other => distance(other.index, group.index) <= NEAR_GROUPS)) continue;

    picked.push(group);
  }

  return picked.map(group => {
    const {hue, saturation, brightness} = toHsv(
      group.red / group.weight,
      group.green / group.weight,
      group.blue / group.weight,
    );

    return toHex({
      hue,
      saturation: Math.min(1, Math.max(saturation * 1.3, 0.5)),
      brightness: Math.max(brightness, 0.85),
    });
  });
};

/** The accent colours of the cover at `url`. Needs CORS on the image, which Spotify's CDN allows. */
export const coverAccents = (url: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onerror = () => reject(new Error(`Cannot load ${url}`));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SIDE;
      canvas.height = SIDE;
      const context = canvas.getContext('2d');

      if (!context) return reject(new Error('No canvas'));

      context.drawImage(image, 0, 0, SIDE, SIDE);
      resolve(accentsFromPixels(context.getImageData(0, 0, SIDE, SIDE).data));
    };
    image.src = url;
  });
