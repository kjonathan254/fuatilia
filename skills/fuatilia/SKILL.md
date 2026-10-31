---
name: fuatilia
description: Run Fuatilia, the open-source Kenyan ad-intelligence CLI, end to end — set up the Supabase backend and client portal, create a Telegram bot for report delivery (or WhatsApp Cloud API templates), capture real competitor-ad evidence from Kenya's public ad libraries, validate and push it, and deliver the weekly Monday intelligence report. Use when the user wants to track competitor advertising in Kenya, run a weekly ad-watch or ad-intelligence cycle, onboard a client for ad monitoring, deliver reports to Telegram or WhatsApp, or asks what ads Kenyan competitors are running.
---

# Fuatilia — weekly ad intelligence for Kenya, run by an agent

Fuatilia tracks the ads that are publicly observable in Kenya's ad libraries —
who is running what, which creatives persist past 90 days, which advertisers are
experimenting — and turns disciplined weekly capture into a Monday intelligence
report delivered to Telegram, WhatsApp or a client portal. Zero dependencies,
Node ≥ 18, MIT.

**The loop you will run:**

```
browse public ad libraries (20–30 min)
  → fuatilia add        (one command per ad card seen)
  → fuatilia check      (schema validation)
  → fuatilia score      (signals + scale bands)
  → push to the platform
  → Monday 09:00 Nairobi: GitHub Actions renders digest + report and delivers them
```

The first fully real execution of this loop (evidence → pipeline → Telegram
confirmation, 2026-10-31) is documented step by step in the repo at
`docs/FIRST-REAL-CYCLE.md` — read it if you want the narrative version with the
actual capture table.

## When to use this skill

- "Track my competitors' ads in Kenya" / "what is Safaricom running right now?"
- "Set up Fuatilia for me" — backend, portal, Telegram delivery, the works
- "Run this week's capture cycle" — the recurring evidence loop
- "Onboard a client to weekly ad monitoring"
- "I want my Monday report on Telegram / WhatsApp"

## What you need

- **Node ≥ 18** and git on the machine the CLI runs on.
- A **GitHub repo** (fork or clone of Fuatilia) — GitHub Actions runs the Monday pipeline.
- A **Supabase project** (free tier is enough) — database, auth, the client portal's backend.
- A **Telegram account** for the easiest delivery channel (WhatsApp optional).
- **Honesty about the data source:** Kenyan commercial ads are NOT in any API.
  Meta's Ad Library API covers political/issue ads globally and EU ads only
  (DSA Art. 39). Evidence comes from the login-free public web libraries,
  captured by a human or a browser-driving agent. That is a feature — it keeps
  the method inside platform ToS.

## Non-negotiable integrity rules (read before anything else)

These are enforced in code, not by discipline:

1. **Demo rows never leave the CLI.** `--example` rows go to `data/demo.jsonl`
   and `push` refuses to upload them. Never use `--example` for real work.
2. **A report without real evidence is labelled `[DEMO]`** — headline prefix,
   banner, `content.demo_mode = true`. If a client's report says DEMO, the fix
   is to capture real evidence, never to remove the label.
3. **`data/captures.jsonl` is real captures only** — one JSON object per ad
   card actually seen, with its library URL as provenance.
4. **Never put a service_role key in any frontend.** The portal uses the anon
   public key; Row Level Security scopes every row to the signed-in customer.
5. **Signals are not proof.** A 90-day-old ad can be a loser on autopilot;
   variant counts can be formats, not hooks. Fuatilia classifies — you and the
   client decide.

---

## Part A — One-time setup (~45 minutes)

### A1. Get the code

```bash
git clone https://github.com/kjonathan254/fuatilia.git
cd fuatilia
node bin/fuatilia.js --help
```

No `npm install` — the CLI has zero dependencies.

### A2. Create the Supabase backend

1. Create a project at supabase.com. Copy from **Project Settings → API**:
   the project URL (`https://<ref>.supabase.co`) and the **service_role** key
   (server-side only — it bypasses RLS) and the **anon public** key (safe for
   the portal frontend, protected by RLS).
2. Open **SQL Editor** and run the contents of
   [`supabase/migrations/0001_fuatilia_init.sql`](https://github.com/kjonathan254/fuatilia/blob/main/supabase/migrations/0001_fuatilia_init.sql)
   — it is idempotent (safe to re-run; policies are dropped and recreated).
   It creates customers, subscriptions, briefs, observations, reports,
   deliveries, collection_runs + Row Level Security policies.
3. In **Authentication → Providers → Email**: confirm email signup is enabled
   (the portal's self-serve signup depends on it).

### A3. Sanity-check the CLI

```bash
node bin/fuatilia.js init      # scaffold watchlist.json + data/ (skip if present)
node bin/fuatilia.js check     # validates data/captures.jsonl + demo.jsonl
node bin/fuatilia.js score     # prints tenure + signals + scale per capture
```

### A4. Configure the client portal (GitHub Pages)

The portal is a static page served from the repo (`/portal/`). Edit
`portal/index.html` and paste **only the anon public key** into
`SUPABASE_ANON_KEY`. Push to `main`; Pages serves it about a minute later.
If the key is missing the portal shows a neutral "temporarily unavailable"
card — deliberately free of stack or setup details.

### A5. Repository secrets

Add at **repo → Settings → Secrets and variables → Actions** (write-only;
a typo can only be fixed by overwriting):

| Secret | Value | Enables |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | evidence push, reports, portal platform |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (never client-side) | same |
| `FUATILIA_BRIEF_ID` | brief UUID evidence is filed under | client-visible evidence |
| `FUATILIA_REPORT_BRIEF_ID` | brief UUID reports are filed under | client-visible reports |
| `FUATILIA_TELEGRAM_BOT_TOKEN` | from @BotFather (Part B) | Telegram delivery |
| `FUATILIA_TELEGRAM_CHAT_ID` | numeric chat id (Part B) | same |
| `FUATILIA_AI_API_KEY` | any OpenAI-compatible key (optional) | AI interpretation layer |
| `FUATILIA_AI_BASE_URL` / `FUATILIA_AI_MODEL` | optional overrides | same |

Every stage that needs a missing secret skips itself — a fresh fork runs green
and lights up channel by channel as you configure.

---

## Part B — Create the Telegram bot (~15 minutes)

Do this once; it is the easiest delivery channel.

1. **Create the bot.** In Telegram, message **@BotFather** (blue check) and
   send `/newbot`. Give it a display name (e.g. `Fuatilia Digest`) and a
   username ending in `bot` (e.g. `fuatilia_digest_254_bot`). BotFather replies
   with the **bot token** (`123456789:AAH-...`) — that token is the bot's
   password. Never commit it; if it leaks, `/revoke` in BotFather mints a new one.
2. **Say hello (do not skip).** Open the bot from BotFather's message and press
   **Start** (or send any message). Bots cannot message you first — without
   this every later send fails with `chat not found`.
3. **Get your chat ID.** Open in a browser:
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → find
   `"chat":{"id":123456789,...}`. Blank? Message the bot again and refresh.
   Groups: add the bot to the group, `/setprivacy` → **Disable** in BotFather,
   post anything, refresh — group IDs are negative (e.g. `-1001234...`), use
   as-is.
4. **Add the two secrets** (`FUATILIA_TELEGRAM_BOT_TOKEN`,
   `FUATILIA_TELEGRAM_CHAT_ID`) per the table in A5.
5. **Test locally:**

   ```bash
   FUATILIA_TELEGRAM_BOT_TOKEN=<token> FUATILIA_TELEGRAM_CHAT_ID=<id> \
     node bin/fuatilia.js deliver
   ```

6. **Test in the cloud:** repo → Actions → **Fuatilia AdWatch** → Run workflow →
   ~1 minute later the digest lands on the phone. From then on: every Monday
   09:00 Nairobi, automatically.

## Part C — WhatsApp delivery (optional, official Cloud API)

Text mode is only deliverable inside a 24-hour customer-service window; a
business-initiated weekly brief MUST go as an **approved template**.

1. **developers.facebook.com** → Create App → type **Business** → add the
   **WhatsApp** product. Note the test **phone number ID** and temporary token.
2. Add recipient numbers (test mode allows up to 5 verified numbers).
3. Secrets: `FUATILIA_WHATSAPP_TOKEN` (system-user token — the temp one expires
   in 24h), `FUATILIA_WHATSAPP_PHONE_ID`, `FUATILIA_WHATSAPP_TO` (recipient,
   country code, no `+`).
4. **For per-customer weekly briefs** (`fuatilia deliver-reports`), register the
   template once in Meta Business Manager → WhatsApp → Message templates:

   - Name: `fuatilia_weekly_intel` · Category: **Marketing** · Language: **English (en)**
   - Body (exactly five positional parameters):

   ```text
   Hi {{1}}, your weekly advertising intelligence brief "{{2}}" is ready for the week of {{3}}.

   {{4}}

   Open your report: {{5}}

   Reply STOP to opt out.
   ```

   Params: {{1}} customer name · {{2}} brief name · {{3}} week-of date ·
   {{4}} weekly pulse line · {{5}} portal link. Approval: minutes to 48h.
5. Requires Part A secrets (the platform knows who to message and logs every
   send in `deliveries`). Opt out anyone who replies STOP before the next send.

Pragmatic shortcut: deliver to Telegram and forward — fine for a first client.

---

## Part D — Onboard a client (~15 minutes)

1. **Account:** send the client the portal URL. They click **Create your
   account** (name / email / password 8+ chars) and confirm the email. A
   database trigger automatically creates their `customers` profile and a
   `radar_free` subscription (5 free sessions). If email confirmation fails,
   create the user in Supabase → Authentication → Add user → tick **Auto Confirm**.
2. **Brief:** the client clicks **+ New brief** — name, industry, geography
   (KE), platforms (Meta, Google), frequency (Weekly), delivery channel and
   destination. One brief = one monitoring configuration.
3. **Wire it in:** copy the brief UUID (portal URL `#<uuid>` or Supabase Table
   Editor → briefs) into the secrets `FUATILIA_BRIEF_ID` and
   `FUATILIA_REPORT_BRIEF_ID`. The scheduled pipeline pushes evidence and
   reports to that one brief.
4. **Delivery destination:** a shared Telegram group with the client (add the
   bot, use the group's negative chat id) is the cleanest option — both sides
   see every delivery.

Current limits, stated honestly: one scheduled brief and one Telegram
destination per workflow. With a second client, either alternate the brief
secrets and run the workflow manually per client, or duplicate the workflow
file with per-client secret names (~10 minutes).

---

## Part E — The weekly evidence cycle (the loop you run every week)

Kenya is not covered by the Ad Library API, so this capture step is the actual
job. Budget **20–30 minutes per client per week**, any day before Monday.

### E1. Browse the public libraries (no login)

- Meta: <https://www.facebook.com/ads/library> → country: **Kenya**
- Google: <https://adstransparency.google.com> → region: **Kenya**

Keyword-search the client's sector (the brief's industry + brands in
`watchlist.json`). Select **active** cards. Record the offer text **verbatim**
(the string is evidence), the start date, the landing headline when shown, and
the library card URL.

### E2. Record each card

```bash
node bin/fuatilia.js add \
  --advertiser "Africa Data Centres" \
  --platform meta \
  --country KE \
  --start 2026-10-20 \
  --ads 14 \
  --type video \
  --offer "Hyperscale launch — Nairobi campus" \
  --landing "https://africadatacentres.com/nairobi" \
  --library "https://www.facebook.com/ads/library/?id=123456789" \
  --tags "datacentres,connectivity" \
  --notes "first video push this quarter"
```

Flag reference that matters:

| Flag | Meaning |
|---|---|
| `--advertiser` | name as shown on the card (required) |
| `--platform` | `meta`, `google` or `tiktok` (required) |
| `--ads N` | total active ads visible for that advertiser+platform — feeds scale bands; variant counts never drive scale |
| `--versions N` | variants of THIS ad (3+ flags the experimentation signal) |
| `--concept ID` | groups variants of one creative idea |
| `--start` | the ad's library start date — feeds tenure (90-day long-runner signal) |
| `--offer`, `--headline`, `--landing` | the commercial message, verbatim |
| `--library URL` | provenance link to the exact card — never skip |
| `--tags`, `--notes` | free-form context |
| `--example` | ⚠️ files the row under `data/demo.jsonl` — demo rows NEVER leave the CLI; never use for client work |

Rows land in `data/captures.jsonl`. Commit them:

```bash
git add data/captures.jsonl && git commit -m "evidence: weekly KE captures (<date>)" && git push
```

### E3. Validate

```bash
node bin/fuatilia.js check   # every row schema-valid
node bin/fuatilia.js score   # tenure + signals + scale band, printed
```

### E4. Push to the platform

**Automatic (normal path):** Monday's workflow runs
`push --source scheduled_workflow` with the repo secrets — you do nothing.

**Manual (same-day evidence for the client):**

```bash
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
node bin/fuatilia.js push --brief <brief-uuid> --source manual
```

Integrity guard: `push` **refuses to run when `captures.jsonl` has zero real
rows** — demo data can never contaminate the platform.

### E5. Monday 09:00 Nairobi — the pipeline runs itself

GitHub Action **"Fuatilia AdWatch"** (`.github/workflows/adwatch.yml`,
`cron: 0 6 * * 1` UTC = 09:00 EAT, manual "Run workflow" button available):

```
collect (Meta API tier — skips honestly for KE) → push (brief-linked evidence)
  → digest (Markdown weekly sheet) → snapshot (history layer)
  → deliver digest (Telegram / WhatsApp / webhook)
  → report (deterministic facts + optional AI interpretation, guardrailed)
  → deliver-reports (per-customer WhatsApp templates, logged in deliveries)
  → heartbeat (public proof of last success) → archive commit
```

Outputs, and where they land:

| Artifact | Where |
|---|---|
| Weekly digest | `digests/adwatch-<date>.md` + Telegram |
| Intelligence report | `digests/report-<week>.{md,json}` + platform `reports` table + portal |
| Weekly snapshot | `snapshots/snapshot-<week>.json` (trend history) |
| Proof of last success | `ops/heartbeat.json` (committed to the repo) |
| Run logs | Actions tab; artifacts retained 90 days |

The AI layer sees ONLY computed facts with a hard guardrail prompt; any failure
falls back to the deterministic interpreter — an AI outage never turns the run
red or invents advertisers.

---

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `push` says "nothing to push" | `captures.jsonl` empty — capture first (integrity guard, not a bug) |
| Report arrived with `[DEMO]` headline | No real evidence reached the period — check the push step logs, capture, re-run |
| Telegram `401` | token wrong/revoked → re-copy from BotFather, overwrite the secret |
| Telegram `400 chat not found` | never pressed Start, or chat id wrong (groups are negative) |
| CLI says "no delivery channels configured" | env var names typo'd — must be exactly `FUATILIA_TELEGRAM_BOT_TOKEN` + `FUATILIA_TELEGRAM_CHAT_ID` |
| Portal shows "temporarily unavailable" | anon key missing in `portal/index.html` — paste the **anon public** key (never service_role) |
| RLS test returns 401 | access token used as apikey — send BOTH `apikey: <key>` and `Authorization: Bearer <token>` headers |
| Client sees another client's data | impossible by policy — if suspected, you are reading via service_role; verify with the client's own login |
| Monday run red | open the failed step in Actions; the failure alert also lands in Telegram |
| Workflow paused after ~60 days idle | scheduled workflows stop without repo activity — the heartbeat commit counts as activity |

## Repo map

| Path | What it is |
|---|---|
| `bin/fuatilia.js` | the CLI — `init add check score digest snapshot deliver collect push report deliver-reports` |
| `lib/signals.js` | tenure, variant counts, active-ad scale bands |
| `lib/analyst.js` | report writer (deterministic + guardrailed AI) |
| `lib/deliver.js` | Telegram / WhatsApp / webhook + per-customer templates |
| `lib/supabase-sync.js` | evidence push, brief-linked |
| `data/captures.jsonl` | real captures only |
| `data/demo.jsonl` | demo rows (never leave the CLI) |
| `watchlist.json` | Kenyan brands + category search seeds |
| `docs/CLIENT-ONBOARDING.md` | the full client workflow |
| `docs/DELIVERY.md` | tap-by-tap Telegram/WhatsApp/webhook/Meta-API setup |
| `docs/FIRST-REAL-CYCLE.md` | the first real cycle, step by step |
| `supabase/migrations/0001_fuatilia_init.sql` | idempotent database schema + RLS |
