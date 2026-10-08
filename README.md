# B2B Event Jobs · Instagram Stories bot

Runs on GitHub Actions (free, no computer needed). Reads jobs from Base44, renders on-brand 1080×1920 Stories, posts them through the Instagram Graph API, brand closer always last.

| Story | When (ET) | What |
|---|---|---|
| Event Job of the Day | daily 10:15 am | The job LinkedIn just posted (matched from `LinkedInJobPost`), else best-scored non-remote job |
| Remote Job of the Day | daily 3:15 pm | Best-scored remote job |
| Friday Roundup | Fri 9:20 am | Top 5 jobs of the week, one per company |
| Trending Jobs | Tue/Thu 12:25 pm | Jobs at the companies in `config.json → trendingCompanies` (Google, Anthropic, OpenAI…). Skips if fewer than 2 match. |

Never posts Hyve Group (`excludeCompanies`). A job isn't re-featured for 30 days. Nothing suitable → nothing posted, and the run is logged as a warning.

## One-time setup
1. **Create a public GitHub repo** and push this folder. (Public because Instagram must fetch the images from a public URL. No secrets live in the repo.)
2. **Settings → Secrets and variables → Actions → New repository secret**:
   - `BASE44_API_KEY` — API key of the **B2BEVENTJOBS.COM** app (owns `JobListing`)
   - `BASE44_LINKEDIN_API_KEY` — API key of the **Lyra** app (owns `LinkedInJobPost`)
   - (App IDs are not secret and live in `config.json → base44`.) Base44 keys are app-wide read/write, so keep this repo single-owner and never run untrusted workflows with secrets.
   - `IG_USER_ID` — the Instagram Business account ID (yours: 27544176338592260)
   - `IG_ACCESS_TOKEN` — your own token (never Base44's). Two kinds work:
     - **Facebook-Login system-user token** (never expires; needs the IG account linked to a Facebook Page; scope `instagram_content_publish`) → leave `IG_GRAPH_BASE` unset.
     - **Instagram-Login token** (what Base44 uses; scopes `instagram_business_basic` + `instagram_business_content_publish`; lasts 60 days and must be refreshed) → set repository variable `IG_GRAPH_BASE` = `https://graph.instagram.com/v21.0`.
3. **Settings → Actions → General → Workflow permissions → Read and write.**
4. **Sanity-check the field mapping** (already set to your real `JobListing` / `LinkedInJobPost` fields: `job_title`, `company_name`, `location_type`, `salary_range`, `job_url`, `date_posted`, `is_active`, …). On any computer with Node 20, after `npm install`:
   `BASE44_API_KEY=… node src/run.mjs --inspect`
   It prints the first record and how it was normalised; adjust `config.json → fields` if something resolves wrong.
5. **Dry run:** Actions → *Instagram Stories* → Run workflow → kind `event`, dry run ✔. Download the `story-preview` artifact and look at the images. Then run once with dry run ✘ to post for real.

After that the schedules run on their own. Failed runs email the repo owner.

## Tuning
- Trending companies, exclusions, counts, cooldowns: `config.json`
- Times: `.github/workflows/stories.yml` **and** `config.json → schedules` (a test checks they match). Each slot has two UTC crons so it's right in both EDT and EST.
- Design: edit `templates/stories.src.html`, then `npm run build:template` (inlines the fonts). Brand closer: `node -e "import('./src/render.mjs').then(m=>m.renderAll([{type:'closer',file:'docs/closer.jpg',data:{}}]))"`
- Tests: `npm test`. Local render without posting: `node src/run.mjs --kind trending --dry --jobs-file test/mock-jobs.json --out /tmp/out`

## Known limits
- Instagram's API can't add tappable link stickers; the URL is printed text on the closer.
- Story images must be JPEG; this is handled.
- Images older than 10 days are pruned from `docs/stories/`.
