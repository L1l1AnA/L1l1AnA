import { writeFile } from 'node:fs/promises';
import { THEMES } from './theme.mjs';

const MONO_FAMILY = 'JetBrains Mono';
// JetBrains Mono advance width is 600 of 1000 units, so each character is exactly 0.6em wide.
const CHAR_EM = 0.6;
const WIDTH = 840;
const CHAR_SECONDS = 0.055;
const LINE_PAUSE = 0.6;

const LINES = [
  { text: "Hi, I'm Liliana.", size: 44, weight: 700, y: 64, role: 'ink' },
  { text: 'Tech lead at Kodify, a product company.', size: 20, weight: 400, y: 112, role: 'ink' },
  { text: 'We build and run our own platforms for 100M visitors a month.', size: 20, weight: 400, y: 144, role: 'muted' },
  { text: 'Mentoring women in tech at Step4ward.', size: 20, weight: 400, y: 176, role: 'muted' },
];
const HEIGHT = 204;

/** Google Fonts returns a woff2 subset with only the glyphs in `text` when asked by a modern browser UA. */
async function fetchFontSubset(family, weight, text) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0 Safari/537.36' } })).text();
  const fontUrl = css.match(/url\((https:[^)]+)\)/)[1];
  return Buffer.from(await (await fetch(fontUrl)).arrayBuffer()).toString('base64');
}

function schedule() {
  let t = 0.4;
  const timed = LINES.map((line) => {
    const start = t;
    const end = start + line.text.length * CHAR_SECONDS;
    t = end + LINE_PAUSE;
    const width = line.text.length * line.size * CHAR_EM;
    return { ...line, start, end, width, x: (WIDTH - width) / 2 };
  });
  return { lines: timed, cycle: timed.at(-1).end };
}

function keyframes({ lines, cycle }) {
  const pct = (s) => `${((s / cycle) * 100).toFixed(3)}%`;
  const eps = 0.01;
  const type = lines.map(({ text, start, end }, i) => `@keyframes type${i} {
    0%, ${pct(start)} { clip-path: inset(0 100% 0 0); animation-timing-function: steps(${text.length}, end); }
    ${pct(end)}, 100% { clip-path: inset(0 0 0 0); }
  }`);
  const caret = lines.map(({ text, start, end, width }, i) => {
    const isLast = i === lines.length - 1;
    const hide = isLast ? '' : `${pct(lines[i + 1].start - eps)} { opacity: 1; transform: translateX(${width}px); }
    ${pct(lines[i + 1].start)}, 100% { opacity: 0; transform: translateX(${width}px); }`;
    return `@keyframes caret${i} {
    0%, ${pct(start - eps)} { opacity: 0; transform: translateX(0); }
    ${pct(start)} { opacity: 1; transform: translateX(0); animation-timing-function: steps(${text.length}, end); }
    ${pct(end)} { opacity: 1; transform: translateX(${width}px); }
    ${hide}
  }`;
  });
  return [...type, ...caret].join('\n  ');
}

function render(t, fonts) {
  const plan = schedule();
  const { lines, cycle } = plan;
  const run = (name) => `animation: ${name} ${cycle.toFixed(2)}s linear both;`;
  const texts = lines.map(({ text, size, weight, x, y, role }, i) =>
    `<text x="${x}" y="${y}" class="l" style="font-size:${size}px;font-weight:${weight};fill:${t[role]};${run(`type${i}`)}">${text.replaceAll("'", '&#39;')}</text>`);
  const carets = lines.map(({ size, x, y }, i) =>
    `<rect x="${x + 2}" y="${y - size * 0.8}" width="${size > 30 ? 4 : 2}" height="${size}" fill="${t.caret}" style="${run(`caret${i}`)}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="t">
<title id="t">${lines.map((l) => l.text).join(' ')}</title>
<style>
  @font-face { font-family: 'Mono'; font-weight: 400; src: url(data:font/woff2;base64,${fonts[400]}) format('woff2'); }
  @font-face { font-family: 'Mono'; font-weight: 700; src: url(data:font/woff2;base64,${fonts[700]}) format('woff2'); }
  .l { font-family: 'Mono', ui-monospace, monospace; }
  .blink { animation: blink 1s steps(1, end) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  ${keyframes(plan)}
  @media (prefers-reduced-motion: reduce) {
    .l { animation: none !important; }
    .blink { display: none; }
  }
</style>
${texts.join('\n')}
<g class="blink">
${carets.join('\n')}
</g>
</svg>
`;
}

const glyphs = [...new Set(LINES.map((l) => l.text).join(''))].join('');
const fonts = { 400: await fetchFontSubset(MONO_FAMILY, 400, glyphs), 700: await fetchFontSubset(MONO_FAMILY, 700, glyphs) };
await Promise.all(
  Object.entries(THEMES).map(([name, t]) => writeFile(`profile/banner-${name}.svg`, render(t, fonts))),
);
