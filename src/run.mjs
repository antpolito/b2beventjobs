#!/usr/bin/env node
import fs from 'fs'; import path from 'path'; import { execSync } from 'child_process';
import { config, ROOT, readState, writeState, etNow, log, warn } from './lib.mjs';
import { loadRaw, usable, normalise } from './jobs.mjs';
import { pickSingle, pickRoundup, pickTrending, buildData } from './select.mjs';
import { renderAll } from './render.mjs';
import { publishStories, waitForUrl } from './instagram.mjs';

const arg = n => { const i = process.argv.indexOf('--' + n); return i < 0 ? undefined : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const dry = !!arg('dry'), force = !!arg('force'), jobsFile = arg('jobs-file'), outDir = arg('out');
const now = arg('now') ? new Date(arg('now')) : new Date();

// ---- resolve which kind to run ----
let kind = arg('kind'), hour = Number(arg('hour')) || undefined;
if (arg('schedule')) {
  const s = config.schedules[arg('schedule')];
  if (!s) { log(`No schedule entry for cron "${arg('schedule')}" - nothing to do.`); process.exit(0); }
  ({ kind, hour } = s);
}

if (arg('inspect')) {                                   // prints raw field names so config.fields can be matched to JobListing
  const { jobs } = await loadRaw(jobsFile);
  console.log('Field names on first JobListing record:\n ', Object.keys(jobs[0] || {}).join(', '));
  console.log('\nNormalised:', JSON.stringify({ ...normalise(jobs[0] || {}), _raw: undefined }, null, 2));
  process.exit(0);
}
if (!['event', 'remote', 'roundup', 'trending'].includes(kind)) { console.error('Usage: run.mjs --kind event|remote|roundup|trending [--dry] [--force] [--jobs-file f]  |  --schedule "<cron>"  |  --inspect'); process.exit(2); }

const { date, hour: etHour } = etNow(now);
const state = readState();

// ---- timing guards (cron runs in UTC; we run twice a year-round and only one of the two fires is "right") ----
if (!force && hour !== undefined && (etHour < hour || etHour > hour + 2)) { log(`ET hour is ${etHour}, expected ${hour}-${hour + 2}. Skipping (daylight-saving twin of the cron).`); process.exit(0); }
if (!force && state.posts.some(p => p.kind === kind && p.date === date)) { log(`${kind} already posted for ${date}. Skipping.`); process.exit(0); }

// ---- data + selection ----
const { jobs: rawJobs, linkedin } = await loadRaw(jobsFile);
const jobs = usable(rawJobs);
log(`${jobs.length} usable active jobs (of ${rawJobs.length} records, Hyve excluded).`);

let picked, via = 'score', keys;
if (kind === 'event' || kind === 'remote') { const r = pickSingle(kind, jobs, linkedin, state, now); if (r) { picked = r.job; via = r.via; keys = [picked.key]; } }
else if (kind === 'roundup') { picked = pickRoundup(jobs, now); keys = picked?.map(j => j.key); }
else { picked = pickTrending(jobs, state, now); keys = picked?.map(j => j.key); }

if (!picked) { warn(`No suitable ${kind} job today - skipping (nothing posted).`); process.exit(0); }
log(`Picked (${via}):`, Array.isArray(picked) ? picked.map(j => `${j.company} - ${j.title}`) : `${picked.company} - ${picked.title}`);

// ---- render ----
const data = buildData(kind, picked, now);
const stamp = `${date}-${kind}`;
const imgDir = outDir ? path.resolve(outDir) : path.join(ROOT, 'docs', 'stories');
const slides = [{ type: kind, file: path.join(imgDir, `${stamp}.jpg`), data }];
const closerFile = path.join(ROOT, 'docs', 'closer.jpg');
if (!fs.existsSync(closerFile) || outDir) slides.push({ type: 'closer', file: outDir ? path.join(imgDir, `${stamp}-closer.jpg`) : closerFile, data: {} });
await renderAll(slides);
log('Rendered:', slides.map(s => path.relative(ROOT, s.file)).join(', '));
if (dry) { log('Dry run: not publishing, not committing.'); process.exit(0); }

// ---- host images (public raw GitHub URLs) ----
const sh = c => execSync(c, { cwd: ROOT, stdio: 'inherit' });
const repo = process.env.GITHUB_REPOSITORY, branch = process.env.GITHUB_REF_NAME || 'main';
if (!repo) throw new Error('GITHUB_REPOSITORY not set - run this inside GitHub Actions (or use --dry).');
const raw = f => `https://raw.githubusercontent.com/${repo}/${branch}/${path.relative(ROOT, f).split(path.sep).join('/')}`;
const prune = () => { for (const f of fs.readdirSync(imgDir)) { const m = f.match(/^(\d{4}-\d{2}-\d{2})-/); if (m && (+now - +new Date(m[1])) / 864e5 > 10) fs.unlinkSync(path.join(imgDir, f)); } };
prune();
sh('git config user.name "b2b-stories-bot" && git config user.email "actions@users.noreply.github.com"');
sh('git add docs && (git diff --cached --quiet || git commit -m "stories: images ' + stamp + '") && git pull --rebase -q && git push -q');
const urls = [raw(slides[0].file), raw(closerFile)];
for (const u of urls) await waitForUrl(u);

// ---- publish ----
const ids = await publishStories(urls);
log('Published Story IDs:', ids.join(', '));

// ---- bookkeeping ----
const list = Array.isArray(picked) ? picked : [picked];
state.posts.push({ kind, date, at: now.toISOString(), keys, items: list.map(j => ({ title: j.title, company: j.company, url: j.url })), storyIds: ids });
state.posts = state.posts.filter(p => (+now - +new Date(p.at)) / 864e5 < 90);
writeState(state);
sh('git add state && (git diff --cached --quiet || git commit -m "stories: log ' + stamp + '") && git pull --rebase -q && git push -q');
