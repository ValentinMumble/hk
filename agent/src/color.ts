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
