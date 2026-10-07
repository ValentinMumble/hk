/**
 * Rough dominant colour of an image, for the accent. Downsamples to a few pixels on a canvas and keeps the most
 * saturated one (the average of album art is often muddy). Needs CORS on the image, which Spotify's CDN allows.
 */
export const dominantColor = (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onerror = () => reject(new Error(`Cannot load ${url}`));
    image.onload = () => {
      const size = 12;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');

      if (!context) return reject(new Error('No canvas'));

      context.drawImage(image, 0, 0, size, size);
      const {data} = context.getImageData(0, 0, size, size);
      let best = {score: -1, color: '#777777'};

      for (let offset = 0; offset < data.length; offset += 4) {
        const [red, green, blue] = [data[offset], data[offset + 1], data[offset + 2]];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const saturation = 0 === max ? 0 : (max - min) / max;
        const brightness = max / 255;
        const score = saturation * 2 + brightness - Math.abs(brightness - 0.65);

        if (score > best.score && brightness > 0.25) {
          best = {
            score,
            color: `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`,
          };
        }
      }

      resolve(best.color);
    };
    image.src = url;
  });
