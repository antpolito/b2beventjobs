import { warn } from './lib.mjs';
const BASE = process.env.IG_GRAPH_BASE || 'https://graph.facebook.com/v21.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Meta rejected the token in a header/body in testing: access_token (and all params) go in the URL query string.
async function call(method, p, params) {
  const url = new URL(`${BASE}/${p}`);
  for (const [k, v] of Object.entries({ ...params, access_token: process.env.IG_ACCESS_TOKEN })) url.searchParams.set(k, v);
  const res = await fetch(url, { method });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Instagram API ${method} ${p}: ${res.status} ${JSON.stringify(j.error || j)}`);   // never includes the token
  return j;
}

/** Publishes each image URL as a Story, in order. Returns the published media IDs. */
export async function publishStories(imageUrls) {
  const uid = process.env.IG_USER_ID;
  if (!uid || !process.env.IG_ACCESS_TOKEN) throw new Error('Set IG_USER_ID and IG_ACCESS_TOKEN.');
  const ids = [];
  for (const image_url of imageUrls) {
    const c = await call('POST', `${uid}/media`, { media_type: 'STORIES', image_url });
    for (let i = 0; i < 45; i++) {                       // wait up to ~2 min (error 9007 = published before FINISHED)
      const st = await call('GET', c.id, { fields: 'status_code' });
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`Container ${c.id} ${st.status_code} for ${image_url}`);
      if (i === 44) throw new Error(`Container ${c.id} still ${st.status_code} after ~2 min`);
      await sleep(3000);
    }
    const p = await call('POST', `${uid}/media_publish`, { creation_id: c.id });
    ids.push(p.id); await sleep(1500);                   // keep slide order stable
  }
  return ids;
}

export async function waitForUrl(url, tries = 30) {
  for (let i = 0; i < tries; i++) { const r = await fetch(url, { method: 'HEAD' }).catch(() => null); if (r?.ok) return; await sleep(2000); }
  warn(`Image URL not reachable yet: ${url}`);
}
