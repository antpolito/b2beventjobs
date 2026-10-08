import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const STATE = path.join(ROOT, 'state', 'posted.json');

export const readState = () => fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { posts: [] };
export const writeState = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');

/** Current date/hour in the configured timezone. `now` is injectable for tests. */
export function etNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short', month2: undefined }).formatToParts(now).map(x => [x.type, x.value]));
  const label = new Intl.DateTimeFormat('en-US', { timeZone: config.timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(now).replace(',', ' ·');
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), label };
}
export const daysBetween = (a, b) => Math.floor((+b - +a) / 864e5);
export const log = (...a) => console.log(...a);
export const warn = m => console.log(`::warning::${m}`);
