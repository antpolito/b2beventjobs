import fs from 'fs';
import { config, warn } from './lib.mjs';

const pick = (rec, names) => { for (const n of names) if (rec?.[n] !== undefined && rec[n] !== null && rec[n] !== '') return rec[n]; return undefined; };
const strip = h => String(h ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function fetchEntity(entity, appId, apiKey, keyName) {
  if (!appId || !apiKey) throw new Error(`Missing ${keyName} (Base44 API key for the app that owns ${entity}). Pass --jobs-file for a local test.`);
  const base = process.env.BASE44_API_BASE || 'https://app.base44.com';
  const all = [], limit = 500;
  for (let skip = 0; skip < 2500; skip += limit) {                  // page with skip until a short page comes back
    const url = `${base}/api/apps/${appId}/entities/${entity}?sort=-created_date&limit=${limit}&skip=${skip}`;
    const res = await fetch(url, { headers: { api_key: apiKey, 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`Base44 ${entity} fetch failed: ${res.status} ${(await res.text()).slice(0, 200)}`);   // never prints the key
    const body = await res.json(); const page = Array.isArray(body) ? body : (body.items || body.data || []);
    all.push(...page); if (page.length < limit) break;
  }
  return all;
}

export async function loadRaw(jobsFile) {
  if (jobsFile) { const j = JSON.parse(fs.readFileSync(jobsFile, 'utf8')); return { jobs: j.jobs, linkedin: j.linkedin || [] }; }
  const e = process.env;
  const jobs = await fetchEntity(config.entities.jobs, e.BASE44_APP_ID || config.base44.jobsAppId, e.BASE44_API_KEY, 'BASE44_API_KEY');
  let linkedin = [];
  if (config.matchLinkedIn) { try { linkedin = await fetchEntity(config.entities.linkedinLog, e.BASE44_LINKEDIN_APP_ID || config.base44.linkedinAppId, e.BASE44_LINKEDIN_API_KEY || e.BASE44_API_KEY, 'BASE44_LINKEDIN_API_KEY'); } catch (e) { warn('Could not read LinkedIn log: ' + e.message); } }
  return { jobs, linkedin };
}

const isRemote = (rec, f, loc) => {
  const r = pick(rec, f.remote);
  if (typeof r === 'boolean') return r;
  if (typeof r === 'string') return /remote/i.test(r);              // location_type: "Remote" / "On-Site" / "Hybrid"
  return /remote/i.test(String(loc || ''));
};

export function normalise(rec) {
  const f = config.fields;
  const location = strip(pick(rec, f.location) ?? '');
  const title = strip(pick(rec, f.title) ?? '');
  const company = strip(pick(rec, f.company) ?? '');
  const url = pick(rec, f.url) ?? '';
  const posted = new Date(pick(rec, f.posted) ?? 0);
  return {
    key: String(pick(rec, f.id) ?? url ?? `${title}|${company}`),
    title, company, location, url: String(url),
    salary: strip(pick(rec, f.salary) ?? ''), summary: strip(pick(rec, f.summary) ?? ''),
    type: strip(pick(rec, f.type) ?? ''), category: strip(pick(rec, f.category) ?? ''),
    remote: isRemote(rec, f, location), posted: isNaN(+posted) ? new Date(0) : posted, _raw: rec
  };
}

export function isActive(rec) {
  const a = config.active; if (!a?.field || !(a.field in rec)) return true;   // no status field -> treat as active
  const v = rec[a.field]; if (typeof v === 'boolean') return v;
  return a.values.includes(String(v).toLowerCase());
}

export const isExcluded = j => config.excludeCompanies.some(x => j.company.toLowerCase().includes(x.toLowerCase()));

export function usable(raw) {
  return raw.filter(isActive).map(normalise).filter(j => j.title && j.company && !isExcluded(j));
}

export function normaliseLinkedIn(rec) {
  const f = config.linkedinFields;
  return { title: strip(pick(rec, f.title) ?? ''), company: strip(pick(rec, f.company) ?? ''), url: String(pick(rec, f.url) ?? ''), date: new Date(pick(rec, f.date) ?? 0), urn: String(pick(rec, f.urn) ?? '') };
}
