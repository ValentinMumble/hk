export const hexToRgb = (hex: string): [number, number, number] => {
  const match = hex.trim().match(/^#?([\da-f]{3}|[\da-f]{6})$/i);

  if (!match) throw new Error(`Invalid color: ${hex}`);

  const digits = 3 === match[1].length ? [...match[1]].map(digit => digit + digit).join('') : match[1];
  const value = Number.parseInt(digits, 16);

  return [value >> 16, (value >> 8) & 0xff, value & 0xff];
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

/** sRGB hex colour to CIE xy, with the "Wide RGB D65" matrix from the Hue developer docs. */
export const hexToXy = (hex: string): [number, number] => {
  const [red, green, blue] = hexToRgb(hex).map(channel => {
    const value = channel / 255;

    return value > 0.04045 ? ((value + 0.055) / 1.055) ** 2.4 : value / 12.92;
  });

  const X = red * 0.664511 + green * 0.154324 + blue * 0.162028;
  const Y = red * 0.283881 + green * 0.668433 + blue * 0.047685;
  const Z = red * 0.000088 + green * 0.07231 + blue * 0.986039;
  const sum = X + Y + Z;

  if (0 === sum) return [0, 0];

  return [round4(X / sum), round4(Y / sum)];
};

const gamma = (channel: number) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

const toHex = (rgb: number[]) =>
  `#${rgb
    .map(channel =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** CIE xy (at full brightness) to an sRGB hex colour, inverse of hexToXy, from the Hue developer docs. */
export const xyToHex = ([x, y]: [number, number]): string => {
  if (y <= 0) return '#000000';

  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  const linear = [
    X * 1.656492 - Y * 0.354851 - Z * 0.255038,
    -X * 0.707196 + Y * 1.655397 + Z * 0.036152,
    X * 0.051713 - Y * 0.121364 + Z * 1.01153,
  ].map(channel => Math.max(0, channel));
  const max = Math.max(...linear);
  const scaled = max > 1 ? linear.map(channel => channel / max) : linear;

  return toHex(scaled.map(gamma));
};

/** Colour temperature in mireds (153 cool … 500 warm) to a display colour. */
export const miredToHex = (mired: number): string => {
  const warmth = Math.min(1, Math.max(0, (mired - 153) / (500 - 153)));
  const cool = [0.9, 0.94, 1];
  const warm = [1, 0.7, 0.42];

  return toHex(cool.map((channel, index) => channel + (warm[index] - channel) * warmth));
};
