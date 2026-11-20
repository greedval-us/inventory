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
      return tone;
    }
  }
}

function setPaletteColor(style, token, channels, hex) {
  style.setProperty('--' + token, hex ?? (channels ? 'rgb(' + channels.join(' ') + ')' : ''));
  if (import.meta.env.MODE === 'win7') {
    // The legacy stylesheet mixes these channels using calc().
    ['r', 'g', 'b'].forEach((channel, index) => {
      style.setProperty('--w7-' + token + '-' + channel, channels?.[index] ?? '');
    });
  }
}

export function applyAppearance(root, preferences) {
  const { fontSize, fontFamily, primaryColor, secondaryColor } = preferences;
  root.style.setProperty('--ui-font-size', fontSize + 'px');
  root.dataset.font = fontFamily;
  root.toggleAttribute('data-custom-primary', Boolean(primaryColor));
  root.toggleAttribute('data-custom-secondary', Boolean(secondaryColor));
  const primary = primaryColor && rgb(primaryColor);
  const secondary = secondaryColor && rgb(secondaryColor);
  setPaletteColor(root.style, 'choice-primary', primary, primaryColor);
  setPaletteColor(root.style, 'choice-secondary', secondary, secondaryColor);
  setPaletteColor(root.style, 'primary-light', primary && readableAccent(primary, '#c7ccd4', false));
  setPaletteColor(root.style, 'primary-dark', primary && readableAccent(primary, '#515662', true));
  root.style.setProperty('--primary-ink', primary ? (luminance(primary) > .179 ? '#000' : '#fff') : '');
}
