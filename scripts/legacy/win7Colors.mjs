// Chromium 108 can evaluate RGB channels and calc(), but not light-dark() or color-mix().
// Lower the functions in the legacy stylesheet so both bundles share the same theme definitions.
const channels = ['r', 'g', 'b'];
const named = { black: '#000000', white: '#ffffff' };

function themed(light, dark) {
  // A custom property set to initial selects its fallback; a space selects an empty token.
  return `var(--w7-light, ${light}) var(--w7-dark, ${dark})`;
}

export function win7Colors() {
  return {
    postcssPlugin: 'inventory-chromium-108-colors',
    Once(root, { postcss }) {
      const argsOf = value => postcss.list.comma(value.slice(value.indexOf('(') + 1, -1));

      function rgb(value) {
        if (value.startsWith('light-dark(')) {
          const [light, dark] = argsOf(value).map(rgb);
          return light.map((n, i) => themed(n, dark[i]));
        }
        if (value.startsWith('color-mix(')) return mix(value).rgb;
        const variable = /^var\(--([\w-]+)\)$/.exec(value);
        if (variable) return channels.map(c => `var(--w7-${variable[1]}-${c})`);
        let hex = named[value] ?? value;
        if (/^#[a-f\d]{3}$/i.test(hex)) hex = '#' + Array.from(hex.slice(1), digit => digit + digit).join('');
        if (!/^#[a-f\d]{6}$/i.test(hex)) throw Error('Unsupported palette color: ' + value);
        return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      }

      function mix(value) {
        const [space, first, second] = argsOf(value);
        const match = /^(.*?)\s+([\d.]+)%$/.exec(first);
        if (space !== 'in srgb' || !match || !second) throw Error('Unsupported palette mix: ' + value);
        const left = rgb(match[1]);
        const weight = Number(match[2]);
        if (second === 'transparent') return { rgb: left, alpha: weight / 100 };
        const right = rgb(second);
        return {
          rgb: left.map((n, i) => `calc(${n} * ${weight / 100} + ${right[i]} * ${(100 - weight) / 100})`),
          alpha: 1,
        };
      }

      function lower(value) {
        const match = /\b(light-dark|color-mix)\(/.exec(value);
        if (!match) return value;
        let depth = 1;
        let end = match.index + match[0].length;
        while (depth && end < value.length) {
          const char = value[end++];
          if (char === '(') depth++;
          if (char === ')') depth--;
        }
        if (depth) throw Error('Unbalanced palette expression: ' + value);
        const expression = value.slice(match.index, end);
        let replacement;
        if (match[1] === 'light-dark') {
          const [light, dark] = argsOf(expression);
          replacement = themed(lower(light), lower(dark));
        } else {
          const color = mix(expression);
          replacement = `rgb(${color.rgb.join(' ')} / ${color.alpha})`;
        }
        return value.slice(0, match.index) + replacement + lower(value.slice(end));
      }

      let hasPalette = false;
      root.walkDecls(decl => {
        if (decl.prop.startsWith('--') && decl.parent.selector?.startsWith(':root')) {
          const value = decl.value.trim();
          // Shadows, font stacks and timing functions aren't operands in the palette.
          if (/^(?:#[a-f\d]{3}(?:[a-f\d]{3})?$|var\(--[\w-]+\)$|light-dark\(|color-mix\()/i.test(value)) {
            const values = rgb(value);
            channels.forEach((c, i) => decl.cloneBefore({ prop: '--w7-' + decl.prop.slice(2) + '-' + c, value: String(values[i]) }));
          }
          if (decl.prop === '--canvas') hasPalette = true;
        }
        decl.value = lower(decl.value);
      });
      if (hasPalette) {
        root.prepend(postcss.parse(`
:root { --w7-light: initial; --w7-dark: ; }
:root[data-theme="dark"] { --w7-light: ; --w7-dark: initial; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --w7-light: ; --w7-dark: initial; }
}`, { from: root.source?.input.from }));
      }
    },
  };
}
