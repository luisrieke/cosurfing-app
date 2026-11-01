// Renders the app icon, splash, favicon and header logo into assets/.
// Usage: npm i --no-save @resvg/resvg-js && node scripts/render-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const OUT = process.env.OUT ?? new URL('../assets', import.meta.url).pathname;
const ESPRESSO = '#2A211A';
const ESPRESSO_LIGHT = '#5A4535';
const ESPRESSO_DARK = '#17110D';
const SUN = '#E9A04A';
const SWELL = '#D8BE96';

// Mark artwork in a 1024 box, drawn for a full-bleed square.
const wave = (color, swell = true, swellColor = color) => `<g transform="translate(0 -36)">
  <path d="M168 676 C 300 676 372 600 424 486 C 478 368 566 292 676 292 C 790 292 862 376 862 468 C 862 552 798 604 728 604 C 664 604 620 560 620 506 C 620 462 652 430 694 430"
        fill="none" stroke="${color}" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>
  ${swell ? `<path d="M196 824 C 300 824 340 784 420 784 C 500 784 540 824 620 824 C 700 824 740 784 828 784"
        fill="none" stroke="${swellColor}" stroke-width="56" stroke-linecap="round" opacity="0.6"/>` : ''}</g>`;

const sun = (color) => `<circle cx="300" cy="284" r="84" fill="${color}"/>`;

const bg = (rx) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ESPRESSO_LIGHT}"/>
      <stop offset="0.55" stop-color="${ESPRESSO}"/>
      <stop offset="1" stop-color="${ESPRESSO_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="${rx}" fill="url(#g)"/>`;

const svg = (inner, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;

// Scale artwork into the centre by factor s.
const inset = (s, inner) => {
  const o = (1024 * (1 - s)) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})">${inner}</g>`;
};

const render = (file, markup, width) => {
  const png = new Resvg(markup, { fitTo: { mode: 'width', value: width } }).render().asPng();
  writeFileSync(`${OUT}/${file}`, png);
  console.log('wrote', file, width);
};

const art = (waveColor = '#FFFFFF', sunColor = SUN, swell = true, swellColor = SWELL) =>
  sun(sunColor) + wave(waveColor, swell, swellColor);
const fullIcon = bg(0) + inset(0.82, art());
const rounded = (rx) => bg(rx) + inset(0.82, art());

render('icon.png', svg(fullIcon), 1024);
render('splash-icon.png', svg(rounded(230)), 1024);
// Small sizes drop the swell line so the mark stays crisp.
const smallMark = bg(220) + `<g transform="translate(0 60)">${inset(0.96, art('#FFFFFF', SUN, false))}</g>`;
render('logo-mark.png', svg(smallMark), 128);
render('favicon.png', svg(smallMark), 48);
// Android adaptive icon: 108dp canvas, only the inner ~66% is guaranteed visible.
render('android-icon-background.png', svg(bg(0)), 512);
render('android-icon-foreground.png', svg(inset(0.56, art())), 512);
render('android-icon-monochrome.png', svg(inset(0.56, art('#FFFFFF', '#FFFFFF', true, '#FFFFFF'))), 432);
