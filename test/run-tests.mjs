// Offline tests: node test/run-tests.mjs   (no network, no browser)
import assert from 'assert'; import fs from 'fs'; import path from 'path';
import { config, ROOT, etNow } from '../src/lib.mjs';
import { usable } from '../src/jobs.mjs';
import { pickSingle, pickRoundup, pickTrending, buildData, highlightWord, blurb } from '../src/select.mjs';
const mock = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/mock-jobs.json'), 'utf8'));
const jobs = usable(mock.jobs); const empty = { posts: [] };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('Hyve Group and closed listings are excluded', () => { assert(!jobs.some(j => /hyve/i.test(j.company))); assert(!jobs.some(j => j.company === 'Old Posting Inc')); });
t('event pick follows the LinkedIn post logged today', () => { const r = pickSingle('event', jobs, mock.linkedin, empty, new Date('2026-10-08T14:15:00Z')); assert.equal(r.via, 'linkedin-match'); assert.equal(r.job.key, 'job1'); });
t('Instagram fallback rows in the LinkedIn log are ignored', () => { const r = pickSingle('event', jobs, mock.linkedin, empty, new Date('2026-10-08T14:15:00Z')); assert.notEqual(r.job.key, 'job9'); });
t('location_type decides remote (not the location text)', () => { assert(jobs.find(j => j.key === 'job3').remote); assert(!jobs.find(j => j.key === 'job14').remote); assert(jobs.find(j => j.key === 'job10').remote); });
t('summary falls back to company_bio when job_summary is empty', () => { assert(jobs.find(j => j.key === 'job1').summary.startsWith('Own a $4M')); });
t('event falls back to scoring and is never remote', () => { const r = pickSingle('event', jobs, [], empty, new Date('2026-10-08T14:15:00Z')); assert(!r.job.remote); });
t('remote pick is remote', () => { assert(pickSingle('remote', jobs, [], empty, new Date('2026-10-08T19:15:00Z')).job.remote); });
t('already-posted jobs are not picked again for 30 days', () => {
  const now = new Date('2026-10-08T14:15:00Z'); const first = pickSingle('event', jobs, [], empty, now).job;
  const st = { posts: [{ kind: 'event', keys: [first.key], at: now.toISOString() }] };
  assert.notEqual(pickSingle('event', jobs, [], st, new Date(+now + 864e5)).job.key, first.key); });
t('roundup: 3-5 jobs, one per company', () => { const r = pickRoundup(jobs, new Date('2026-10-09T13:20:00Z')); assert(r.length >= 3 && r.length <= 5); assert.equal(new Set(r.map(j => j.company)).size, r.length); });
t('trending: only watchlist companies', () => { const r = pickTrending(jobs, empty, new Date('2026-10-09T16:25:00Z')); assert.deepEqual(r.map(j => j.company).sort(), ['Anthropic', 'Google', 'OpenAI']); });
t('trending: skips (null) when fewer than minJobs match', () => { assert.equal(pickTrending(jobs.filter(j => j.company === 'Google'), empty), null); });
t('trending: name match is whole-word (Metaverse Events is not Meta)', () => { const j = { ...jobs[0], company: 'Metaverse Events', key: 'x' }; assert.equal(pickTrending([j, { ...j, company: 'Metaphor Live', key: 'y' }], empty), null); });
t('highlight skips seniority words', () => { assert.equal(highlightWord({ title: 'Senior Director, Sponsorship Sales' }, 'event'), 'Sponsorship'); assert.equal(highlightWord({ title: 'Remote Event Marketing Manager' }, 'remote'), 'Remote'); });
t('blurb is one short sentence', () => { assert(blurb('Own a $4M portfolio across three flagship B2B conferences. You will lead a team.').endsWith('conferences.')); assert.equal(blurb(''), ''); });
t('buildData: chips never exceed 3, no empty chips', () => { const d = buildData('event', jobs[0]); assert(d.event.chips.length <= 3 && d.event.chips.every(Boolean)); });
t('DST: 10:15 ET is 14:15 UTC in Oct and 15:15 UTC in Dec', () => { assert.equal(etNow(new Date('2026-10-08T14:15:00Z')).hour, 10); assert.equal(etNow(new Date('2026-12-08T15:15:00Z')).hour, 10); assert.equal(etNow(new Date('2026-12-08T14:15:00Z')).hour, 9); });
t('every cron in the workflow has a schedule entry', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/stories.yml'), 'utf8');
  const crons = [...yml.matchAll(/- cron: "([^"]+)"/g)].map(m => m[1]);
  assert.equal(crons.length, Object.keys(config.schedules).length); crons.forEach(c => assert(config.schedules[c], 'missing ' + c)); });
console.log(`\n${n} tests passed`);
