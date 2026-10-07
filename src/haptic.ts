/**
 * A small tap on button presses. Android and desktop Chrome have the Vibration API; iOS Safari does not, but
 * since iOS 18 a `switch` checkbox toggled through its label produces the system haptic, so one is kept hidden.
 */
let switchLabel: HTMLLabelElement | null = null;

const iosSwitch = (): HTMLLabelElement | null => {
  if (switchLabel) return switchLabel;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');

  // only Safari 17.4+ understands the switch attribute; elsewhere this trick does nothing useful
  if (!('switch' in input) && 'checkbox' === input.type && !CSS.supports('selector(input:checked:is([switch]))'))
    return null;

  switchLabel = document.createElement('label');
  switchLabel.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  switchLabel.setAttribute('aria-hidden', 'true');
  switchLabel.appendChild(input);
  document.body.appendChild(switchLabel);

  return switchLabel;
};

export const haptic = () => {
  try {
    if ('vibrate' in navigator && navigator.vibrate(8)) return;

    iosSwitch()?.click();
  } catch {
    // never let feedback break a tap
  }
};

/** One listener for every button-like element, so each component stays unaware of it. */
export const installHaptics = () => {
  document.addEventListener(
    'pointerdown',
    event => {
      if ((event.target as Element | null)?.closest?.('button, .tab, .swatch, .light, .disc, .select-wrap')) haptic();
    },
    {passive: true},
  );
};
