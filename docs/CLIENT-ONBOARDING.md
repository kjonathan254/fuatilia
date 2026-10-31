# Client onboarding — the practical workflow

Example client: **DC254** (DataCentre254). This is the real, non-demo path you
follow for every paying customer — from account creation to the Monday report
they receive. Everything here reflects how the platform actually works today
(v0.5.x); nothing is aspirational.

---

## Who does what

| Role | Does |
| --- | --- |
| **You (operator)** | Capture ad evidence with the CLI, keep the repo secrets healthy, read the Monday run results, forward reports when needed |
| **GitHub Actions** | Every Monday 09:00 Nairobi: push evidence → digest → snapshot → AI report → Telegram delivery → archive |
| **Supabase** | Stores customers, briefs, evidence, reports, delivery log — Row Level Security keeps every client scoped to their own rows |
| **The client** | Signs into the portal, creates/adjusts their brief, reads evidence + weekly reports, names competitors |

Portal URL: **https://kjonathan254.github.io/fuatilia/portal/**

---

## Part 1 — One-time client setup (~15 minutes)

### Step 1 — Client creates their account (self-serve)

Send the client the portal link. They click **Create your account**, enter
name / email / password (8+ characters), and confirm via the email Supabase
sends. A trigger then automatically creates two rows:

- a `customers` row (their profile),
- a `subscriptions` row (`radar_free` plan, 5 free intelligence sessions).

No SQL, no dashboard access needed. If a client can't receive the
confirmation email, create the user for them: **Supabase Dashboard →
Authentication → Add user → tick Auto Confirm User**.

### Step 2 — Client creates their brief

Still in the portal, the client clicks **+ New brief** and fills:

- **Brief name** — e.g. `DataCentre254 Brief`
- **Industry** — e.g. `data centres` (optional)
- **Geography** — `KE` (default)
- **Platforms** — Meta, Google (TikTok optional)
- **Frequency** — Weekly
- **Delivery** — Telegram (or WhatsApp/email)
- **Deliver to** — their phone / email / chat id

One brief = one monitoring configuration. A client can run several briefs.

### Step 3 — Wire the brief into the automation

The scheduled pipeline pushes evidence and reports to **one** brief, named by
two repository secrets. For DC254:

1. Open the brief in the portal and copy its UUID from the URL
   (`#<uuid>`), or read it from **Supabase → Table Editor → briefs**.
2. On GitHub: **Settings → Secrets and variables → Actions**, set:
   - `FUATILIA_BRIEF_ID` = the brief UUID
   - `FUATILIA_REPORT_BRIEF_ID` = the same UUID

   (These are already set to the DataCentre254 Brief
   `011086a5-7ca7-4bc2-8f53-e3de7c34280e`. Re-point them per active client.)

The other required secrets — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`FUATILIA_TELEGRAM_BOT_TOKEN`, `FUATILIA_TELEGRAM_CHAT_ID` — are already
configured and shared by all clients.

### Step 4 — Telegram destination (where reports land)

Delivery today uses **one** Telegram chat (the `FUATILIA_TELEGRAM_CHAT_ID`
secret). Three honest options per client:

1. **Shared group/channel (recommended)** — create a Telegram group with the
   client, add your bot, use that group's chat id as the secret. Both of you
   see every delivery.
2. **Client's own chat id** — the client messages the bot once, you read their
   chat id (e.g. via `getUpdates`), put it in the secret. You then forward
   anything they need you to see.
3. **Keep your operator chat** — you receive everything and forward manually.
   Fine for the first one or two clients.

---

## Part 2 — The weekly operating loop (the actual job)

This is the part that never stops. Kenya is **not** covered by the Meta Ad
Library API (EU/issue-ads only), so evidence for Kenyan advertisers is
**manual capture**: a human browses the public library, the CLI logs it, the
pipeline ships it. Budget roughly 20–30 minutes per client per week.

### Step 1 — Capture evidence (your 20–30 minutes, any day before Monday)

Open the public ad libraries — no login needed:

- Meta: https://www.facebook.com/ads/library → country: **Kenya**
- Google: https://adstransparency.google.com → region: **Kenya**

For every ad card worth logging, run one `add`:

```bash
node bin/fuatilia.js add \
  --advertiser "Africa Data Centres" \
  --platform meta \
  --ads 14 \
  --type video \
  --offer "Hyperscale launch — Nairobi campus" \
  --start 2026-10-20 \
  --landing "https://africadatacentres.com/nairobi" \
  --library "https://www.facebook.com/ads/library/?id=123456789" \
  --notes "first video push this quarter"
```

Flag reference that matters:

- `--ads N` — total active ads visible for that advertiser+platform (feeds the
  scale bands; variant counts never drive scale).
- `--versions N` — variants of THIS ad.
- `--concept ID` — groups variants of one creative idea.
- `--offer`, `--headline`, `--landing` — the commercial message.
- `--library URL` — provenance link back to the exact library card.

Rows land in `data/captures.jsonl`. Real rows only — never use `--example`
for client work (that files to `data/demo.jsonl` and never leaves the CLI).

Sanity-check before pushing:

```bash
node bin/fuatilia.js check   # validates every row
node bin/fuatilia.js score   # tenure + signals + scale per capture
```

### Step 2 — Push to the platform

**Automatic (normal path):** the Monday workflow's *Push captures* step runs
`push --brief "$FUATILIA_BRIEF_ID"` with the repo secrets. You do nothing.

**Manual (same-day delivery, e.g. you promised evidence by Friday):**

```bash
export SUPABASE_URL="https://tmxunegddjjlomssnrkh.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
node bin/fuatilia.js push --brief 011086a5-7ca7-4bc2-8f53-e3de7c34280e --source manual
```

Integrity guard: `push` **refuses to run when `captures.jsonl` has zero real
rows** — demo rows can never contaminate the platform.

### Step 3 — Monday 09:00 Nairobi: the pipeline runs itself

GitHub Action **"Fuatilia AdWatch"** (`cron 0 6 * * 1 UTC`, manual
"Run workflow" button available):

```
Collect (Meta API tier — skips without token, always skips for KE)
  → Push captures (brief-linked, service_role)
  → Weekly digest
  → Weekly snapshot (history/trend archive)
  → Deliver digest (Telegram)
  → Write weekly intelligence report (AI layer; deterministic fallback)
  → Deliver reports (Telegram)
  → Heartbeat (public proof of last successful run)
  → Commit digest/snapshot/heartbeat to the repo
```

### Step 4 — The client receives and reads

- **Telegram**: digest + weekly report message arrive in the configured chat.
- **Portal**: the client signs in and opens their brief — evidence table,
  expandable weekly reports (executive + strategic points, methodology),
  competitors they named, and the delivery log showing every send.

---

## Part 3 — What "real" vs "demo" means (integrity rules)

These rules are enforced in code, not by discipline alone:

1. **Demo rows never leave the CLI.** `--example` rows live in
   `data/demo.jsonl`; `push` refuses to upload them.
2. **Reports fall back to demo only when there is zero real evidence** for the
   period — and are then labelled: headline prefixed `[DEMO]`, banner
   "Demo mode — fictional demo rows", `content.demo_mode = true`. The portal
   renders that banner visibly. A client can never mistake a demo for market
   intelligence.
3. **Unlinked evidence is invisible to clients.** Observations without a
   brief, or under another customer's brief, return `[]` for that client —
   enforced by RLS policies, verified end-to-end.
4. **Scale bands, not raw counts.** `active_ad_count` feeds conservative
   scale bands; single-digit differences are never reported as trends.

Practical consequence: **log at least one real capture per week per client**,
or their Monday report will be an honest `[DEMO]` placeholder.

---

## Multi-client notes (current limits, honestly)

- **One scheduled brief per workflow.** The secrets point at one brief. With
  two active clients either (a) alternate the secrets per client and run the
  workflow manually twice on Monday, or (b) duplicate the workflow file with
  per-client secret names — 10-minute change, no code.
- **One Telegram destination.** Shared group/channel per client (Part 1,
  Step 4) is the cleanest current answer.
- **Portal brief CRUD is per signed-in client** — a client can create as many
  briefs as they like, but only the secret-pointed brief receives automated
  evidence this week.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `push` says "nothing to push" | `data/captures.jsonl` empty — capture with `fuatilia add` first (this is the integrity guard, not a bug) |
| Portal shows "Portal not configured yet" | The anon key placeholder is still in `portal/index.html` — paste the Supabase **anon public** key (never service_role) |
| Report arrived with `[DEMO]` headline | No real captures made it into the period — check `push` step logs, add evidence |
| Client sees another client's data | Impossible by policy — if suspected, check you are not reading via the service_role key; verify with the client's own login |
| Monday run red | Open the failed step in Actions; failure alert also lands in Telegram |
