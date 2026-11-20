function rgb(hex) {
  return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
}

function luminance(channels) {
  const [red, green, blue] = channels.map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return red * .2126 + green * .7152 + blue * .0722;
}

// The same accent is also used for small links and keyboard focus on tinted surfaces.
function readableAccent(color, background, darkMode) {
  const backdrop = luminance(rgb(background));
  const end = darkMode ? 255 : 0;
  for (let step = 0; step <= 100; step++) {
    const tone = color.map(channel => Math.round(channel + (end - channel) * step / 100));
    const light = luminance(tone);
    if ((Math.max(light, backdrop) + .05) / (Math.min(light, backdrop) + .05) >= 4.5) {
      return 'rgb(' + tone.join(' ') + ')';
    }
  }
}

export function applyAppearance(root, preferences) {
  const { fontSize, fontFamily, primaryColor, secondaryColor } = preferences;
  root.style.setProperty('--ui-font-size', fontSize + 'px');
  root.dataset.font = fontFamily;
  root.toggleAttribute('data-custom-primary', Boolean(primaryColor));
  root.toggleAttribute('data-custom-secondary', Boolean(secondaryColor));
  root.style.setProperty('--choice-secondary', secondaryColor ?? '');
  root.style.setProperty('--choice-primary', primaryColor ?? '');
  if (primaryColor) {
    const color = rgb(primaryColor);
    root.style.setProperty('--primary-ink', luminance(color) > .179 ? '#000' : '#fff');
    root.style.setProperty('--primary-light', readableAccent(color, '#c7ccd4', false));
    root.style.setProperty('--primary-dark', readableAccent(color, '#515662', true));
  } else {
    for (const token of ['--primary-ink', '--primary-light', '--primary-dark']) root.style.removeProperty(token);
  }
}
