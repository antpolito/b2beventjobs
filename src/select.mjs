import { config, daysBetween, etNow } from './lib.mjs';
import { normaliseLinkedIn } from './jobs.mjs';

const SENIORITY = new Set(['senior','sr','sr.','junior','jr','associate','assistant','lead','head','chief','executive','global','regional','vice','president','vp','svp','evp','director','manager','specialist','coordinator','of','and','the','for','a','an','&','to','in','at','-','–']);

/** Word in the title to underline (lime highlight). Prefer the first non-seniority word of 5+ letters. */
export function highlightWord(job, kind) {
  const words = job.title.replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  if (kind === 'remote') { const r = words.find(w => /^remote$/i.test(w)); if (r) return r; }
  const good = words.find(w => !SENIORITY.has(w.toLowerCase()) && w.replace(/[^a-z]/gi, '').length >= 5);
  return good || words.find(w => !SENIORITY.has(w.toLowerCase())) || '';
}

const score = (j, now) => (j.salary ? 3 : 0) + Math.min(j.summary.length, 400) / 100 + Math.max(0, 3 - daysBetween(j.posted, now)) * 0.5;

const recentlyPosted = (state, job, days, now, kinds) => state.posts.some(p => (!kinds || kinds.includes(p.kind)) && p.keys?.includes(job.key) && daysBetween(new Date(p.at), now) < days);

function bestOf(pool, now) { return [...pool].sort((a, b) => score(b, now) - score(a, now) || +b.posted - +a.posted)[0]; }

/** One standout job for Event / Remote of the Day. */
export function pickSingle(kind, jobs, linkedinRaw, state, now = new Date()) {
  const fresh = jobs.filter(j => !recentlyPosted(state, j, config.singleJobCooldownDays, now, ['event', 'remote']));
  if (kind === 'event' && config.matchLinkedIn) {
    const today = etNow(now).date;
    const li = linkedinRaw.map(normaliseLinkedIn).filter(x => x.title && (!x.urn || x.urn.startsWith('urn:li:')) && etNow(x.date).date === today)
      .sort((a, b) => +b.date - +a.date);
    for (const x of li) {
      const hit = fresh.find(j => (x.url && j.url === x.url) || (j.title.toLowerCase() === x.title.toLowerCase() && j.company.toLowerCase() === x.company.toLowerCase()));
      if (hit) return { job: hit, via: 'linkedin-match' };
    }
  }
  let pool = kind === 'remote' ? fresh.filter(j => j.remote) : fresh.filter(j => !j.remote);
  if (kind === 'event' && !pool.length) pool = fresh;
  return pool.length ? { job: bestOf(pool, now), via: 'score' } : null;
}

const distinctByCompany = (list, n) => { const seen = new Set(), out = []; for (const j of list) { const c = j.company.toLowerCase(); if (!seen.has(c)) { seen.add(c); out.push(j); if (out.length === n) break; } } return out; };

export function pickRoundup(jobs, now = new Date()) {
  const w = config.roundup;
  const recent = jobs.filter(j => daysBetween(j.posted, now) < w.windowDays);
  const list = distinctByCompany([...recent].sort((a, b) => score(b, now) - score(a, now) || +b.posted - +a.posted), w.maxJobs);
  return list.length >= 3 ? list : null;
}

export function pickTrending(jobs, state, now = new Date()) {
  const t = config.trending;
  const watch = config.trendingCompanies.map(s => s.toLowerCase());
  const matches = jobs.filter(j => watch.some(w => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(j.company)))
    .filter(j => !recentlyPosted(state, j, t.cooldownDays, now, ['trending']));
  const list = distinctByCompany([...matches].sort((a, b) => +b.posted - +a.posted || score(b, now) - score(a, now)), t.maxJobs);
  return list.length >= t.minJobs ? list : null;
}

const place = j => (j.remote ? 'Remote' : j.location) || '';
export function buildData(kind, picked, now = new Date()) {
  const { label } = etNow(now);
  const out = { date: label };
  if (kind === 'event' || kind === 'remote') {
    const j = picked;
    const chips = [j.remote && kind === 'event' ? 'Remote' : place(j), j.salary || j.type, j.salary ? j.type : j.category].filter(Boolean);
    out[kind] = { title: j.title, highlight: highlightWord(j, kind), company: j.company, chips: [...new Set(chips)].slice(0, 3), blurb: blurb(j.summary) };
  } else if (kind === 'roundup') {
    out.roundup = { title: 'Friday Roundup', sub: `${picked.length} fresh roles from this week`, jobs: picked.map(j => ({ t: j.title, c: `${j.company} · ${place(j) || 'See listing'}` })) };
  } else if (kind === 'trending') {
    out.trending = { title: 'Trending', sub: config.trending.sub, jobs: picked.map(j => ({ t: j.title, c: `${j.company} · ${place(j) || 'See listing'}` })) };
  }
  return out;
}

export function blurb(s) {
  if (!s) return '';
  const first = s.match(/^.{20,}?[.!?](\s|$)/)?.[0]?.trim() || s;
  return first.length > 110 ? first.slice(0, 109).replace(/\s+\S*$/, '') + '…' : first;
}
