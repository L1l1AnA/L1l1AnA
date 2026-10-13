import { writeFile } from 'node:fs/promises';
import { THEMES, SYSTEM_FONT } from './theme.mjs';

const USERNAME = process.env.USERNAME ?? 'L1l1AnA';
const WIDTH = 840;
const HEIGHT = 168;
const PAD_X = 24;
const WAVE_TOP = 64;
const WAVE_HEIGHT = 64;
const MIN_BAR = 1.5;
const PULSE_SECONDS = 1.4;
const PULSE_MIN_SCALE = 0.6;
// Phase offset between neighbouring bars, so the pulse travels across the chart as a wave.
const WAVE_LAG_SECONDS = 0.12;

const QUERY = `query($login: String!) {
  user(login: $login) {
    pullRequests { totalCount }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { firstDay contributionDays { contributionCount } }
      }
    }
  }
}`;

async function fetchActivity() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });
  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors));
  const { calendar, pullRequests } = {
    calendar: data.user.contributionsCollection.contributionCalendar,
    pullRequests: data.user.pullRequests.totalCount,
  };
  const weeks = calendar.weeks.map((w) => ({
    firstDay: new Date(w.firstDay),
    total: w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0),
  }));
  return { total: calendar.totalContributions, pullRequests, weeks };
}

const fmt = (n) => n.toLocaleString('en-US');
const monthName = (d) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

function render({ total, pullRequests, weeks }, t) {
  const step = (WIDTH - PAD_X * 2) / weeks.length;
  const barWidth = step * 0.55;
  const mid = WAVE_TOP + WAVE_HEIGHT / 2;
  const max = Math.max(...weeks.map((w) => w.total));
  const peak = weeks.findIndex((w) => w.total === max);

  const bars = weeks.map((w, i) => {
    const h = Math.max(MIN_BAR, Math.sqrt(w.total / max) * WAVE_HEIGHT);
    const x = PAD_X + i * step + (step - barWidth) / 2;
    const fill = i === peak ? t.peak : t.wave;
    const delay = -(i * WAVE_LAG_SECONDS).toFixed(2);
    return `<rect class="w" style="animation-delay:${delay}s" x="${x.toFixed(1)}" y="${(mid - h / 2).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="${(barWidth / 2).toFixed(1)}" fill="${fill}"/>`;
  });

  const months = weeks
    .map((w, i) => ({ i, d: w.firstDay }))
    .filter(({ i, d }) => i > 0 && d.getUTCMonth() !== weeks[i - 1].firstDay.getUTCMonth())
    .map(({ i, d }) => {
      const x = PAD_X + i * step;
      return `<line x1="${x.toFixed(1)}" y1="${WAVE_TOP + WAVE_HEIGHT + 8}" x2="${x.toFixed(1)}" y2="${WAVE_TOP + WAVE_HEIGHT + 14}" stroke="${t.rule}"/>`
        + `<text x="${(x + 4).toFixed(1)}" y="${WAVE_TOP + WAVE_HEIGHT + 26}" class="m">${monthName(d)}</text>`;
    });

  const peakX = PAD_X + peak * step + step / 2;
  const peakAnchor = peak > weeks.length - 8 ? 'end' : 'middle';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="t">
<title id="t">${fmt(total)} contributions in the last year, ${fmt(pullRequests)} pull requests in total</title>
<style>
  text { font-family: ${SYSTEM_FONT}; fill: ${t.muted}; }
  .h { font-size: 15px; font-weight: 600; fill: ${t.ink}; }
  .s { font-size: 13px; }
  .m { font-size: 11px; }
  .p { font-size: 11px; fill: ${t.peak}; font-weight: 600; }
  .w { transform-box: fill-box; transform-origin: center; animation: pulse ${PULSE_SECONDS}s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate; }
  @keyframes pulse {
    from { transform: scaleY(${PULSE_MIN_SCALE}); }
    to { transform: scaleY(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .w { animation: none; }
  }
</style>
<text x="${PAD_X}" y="28" class="h">${fmt(total)} contributions in the last year</text>
<text x="${PAD_X}" y="48" class="s">Mostly in private work repositories. ${fmt(pullRequests)} pull requests opened in total.</text>
<line x1="${PAD_X}" y1="${mid}" x2="${WIDTH - PAD_X}" y2="${mid}" stroke="${t.rule}"/>
${bars.join('\n')}
<text x="${peakX.toFixed(1)}" y="${WAVE_TOP - 4}" text-anchor="${peakAnchor}" class="p">${max} in one week</text>
${months.join('\n')}
</svg>
`;
}

const activity = await fetchActivity();
await Promise.all(
  Object.entries(THEMES).map(([name, t]) => writeFile(`profile/activity-${name}.svg`, render(activity, t))),
);
