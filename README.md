# Fuatilia

> **Swahili: _"track it / keep watch."_** Kenyan advertising intelligence hiding in public.
> Track the ads that are publicly observable in Kenya's ad libraries — who is running
> what, which creatives persist past 90 days, which advertisers are experimenting with
> variants — using public transparency pages and disciplined human capture.
> Zero dependencies. Built in Nairobi.

**Product #2 of the DC254 stack** (Product #1: the [Data-Centers-254](https://github.com/kjonathan254/Data-Centers-254) content engine).

**Live site:** <https://kjonathan254.github.io/fuatilia/> — landing page + data viewer,
published from `main` via GitHub Pages.

---

## The gap it fills

The "Meta Ad Library method" is real: the ads you can observe in the public libraries,
their start dates, their variant counts, their landing pages — public, free, no login.
Global ad-intelligence tools are built around markets with API access, and enterprise
pricing excludes most Kenyan SMBs. Fuatilia packages a disciplined, local capture
method for the Kenyan market as **method + CLI + weekly digest + weekly snapshots**,
open source (MIT). It is structured monitoring of publicly observable advertising —
not a census of the market, and we never claim it is.

## What's in the box

| Piece | File | What it does |
|---|---|---|
| CLI | `bin/fuatilia.js` | `init` · `add` · `check` · `score` · `digest` · `snapshot` · `deliver` · `collect` · `push` · `report` · `deliver-reports` — zero-dependency Node ≥ 18 |
| Signals engine | `lib/signals.js` | Tenure, variant counts, **active-ad-count scale bands** → long-running creatives & creative experimentation |
| Digest renderer | `lib/digest.js` | The Monday Markdown sheet: pulse, long-running creatives, experimenters, new entrants, teardown list — demo mode is labelled loudly |
| Snapshots | `snapshots/` | Weekly per-advertiser aggregates (`snapshot-<week>.json`) with deltas vs the previous week — the history layer |
| Delivery | `lib/deliver.js` | Sends the digest to **Telegram**, **WhatsApp (Cloud API)** or any webhook; `deliver-reports` sends per-customer **WhatsApp template** messages and logs them in `deliveries` — env-driven, skips when unconfigured |
| Report writer | `lib/analyst.js` | Weekly intelligence report: deterministic facts → guardrailed **AI interpretation** (OpenAI-compatible, optional) with a deterministic fallback — AI writes on top of the numbers, never instead of them |
| API collector | `lib/collector.js` | Pulls the Meta Ad Library **API tier** (EU + issue ads) into `captures.jsonl`, de-duplicated |
| Supabase sync | `lib/supabase-sync.js` | `push` uploads real captures to the automation platform (observations + heartbeat) — env-driven, skips when unconfigured; `--brief <uuid>` attaches evidence to a portal brief |
| Watchlist | `watchlist.json` | Kenyan brands & category search seeds to track weekly |
| Capture store | `data/captures.jsonl` | One JSON object per seen ad card — **real captures only** (schema: `docs/SCHEMA.md`) |
| Demo store | `data/demo.jsonl` | The fictional demo rows (`example: true`) — never mixed into real digests, snapshots or coverage stats |
| Monday Action | `.github/workflows/adwatch.yml` | Every **Monday 09:00 Nairobi**: collect → push (platform) → digest → snapshot → deliver → report (AI layer) → deliver-reports (per-customer templates) → heartbeat + archive |
| CI | `.github/workflows/ci.yml` | Syntax + schema + smoke tests on every push |
| Viewer | `viewer/index.html` | Static browser for non-technical users (GitHub Pages ready) |

## Quickstart

```bash
git clone https://github.com/kjonathan254/fuatilia.git
cd fuatilia

# 1. browse the public library (no login): https://www.facebook.com/ads/library → country: Kenya
# 2. capture what you see — one row per ad card:
node bin/fuatilia.js add \
  --advertiser "Zuku" --platform meta --country KE \
  --start 2026-09-01 --versions 4 --ads 18 \
  --concept "concept-free-install" \
  --offer "Free installation this month" \
  --library "https://www.facebook.com/ads/library/?id=..."

# 3. read the signals
node bin/fuatilia.js score

# 4. render the digest
node bin/fuatilia.js digest

# 5. (optional) send it to your phone — Telegram in ~10 minutes:
#    repo secrets: FUATILIA_TELEGRAM_BOT_TOKEN, FUATILIA_TELEGRAM_CHAT_ID
#    full guide (WhatsApp + webhook + Meta API): docs/DELIVERY.md
```

Serve the viewer: `python3 -m http.server` from the repo root → open `/viewer/`.

## The signals

| Signal | Trigger | Read |
|---|---|---|
| **Long-running creative** | ad live **90+ days** | persistence signal — could be profit, brand reach, retargeting, grants or autopilot. Fuatilia flags it; you supply the verdict |
| **Creative experimentation** | **3+ variants of one ad** | they are iterating *something* — hooks, or just formats, languages, placements, audiences. Track concepts (`--concept`), not just counts |
| **Scale band** | `active_ad_count`: 1–2 / 3–29 / 30+ | light / consistent / wide-footprint **activity**. Basis printed with every band (`reported_active_ads` or `captured_cards`). Variant counts never drive it. Activity ≠ budget |

**Every output carries the caveat: signal, not proof.** Agencies leave losers on
autopilot; grants fund ads that never need profit; variants are not always new hooks.
Fuatilia classifies — humans decide.

## The model

**Radar is free forever** — the CLI, the method, the Monday digest, the viewer.
**Intelligence is free for your first 5 sessions** — no card, no signup; get hooked
first, decide after. Once it has earned its keep: **Fuatilia Brief** from KSh 500 per
session, or **KSh 2,500/month** for unlimited sessions, weekly snapshots and sector
filters. **Agency tier: KSh 10,000/month** (multi-seat, custom watchlists). You pay for
research, organisation and time saved — never for access to already-public ads.

## Honest data constraints (read before dreaming)

| Source | Kenya commercial ads | Notes |
|---|---|---|
| Meta Ad Library API | ❌ | API covers political/issue ads globally + all EU ads (DSA Art. 39) only |
| Meta Ad Library web | ✅ browseable, no login | assisted human capture via this CLI — deliberately, to stay inside ToS |
| Google Ads Transparency Center | ✅ browseable | no public API; ~30-day commercial retention |
| TikTok Creative Center | ✅ varies | Commercial Content API is EU-only + application-gated |

This is why Fuatilia is **capture-first, not a scraper**: the moat is not raw data
(anyone can browse it) — it is structured local coverage, the signals layer, and the
weekly reading habit. **Sell analysis, never raw platform data.**

## For Kenyan advertisers — the weekly loop

1. **Monday 09:00** — the Action drops the digest (Actions → artifacts, and committed to `digests/` as a permanent archive while the repo stays active).
2. Read: new entrants, new multi-variant advertisers, long-running creatives crossing the 90-day line.
3. Ten minutes browsing your niche's library terms → `fuatilia add` what you saw.
4. Teardown one long-runner's landing page — copy the **structure** (promise → proof → offer
   → urgency → CTA), never the words or assets.

## Docs

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — full definition, 5W1H, business model, roadmap
- [`docs/METHOD.md`](docs/METHOD.md) — the four-part method + legality boundaries
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — the capture record schema
- [`docs/DELIVERY.md`](docs/DELIVERY.md) — Telegram/WhatsApp/webhook setup + Meta API collector
- [`docs/AUTOMATION-ARCHITECTURE.md`](docs/AUTOMATION-ARCHITECTURE.md) — the automation-first platform: six components, Supabase schema, security model, build stages
- [`supabase/migrations/0001_fuatilia_init.sql`](supabase/migrations/0001_fuatilia_init.sql) — the platform database schema (safe to re-run in the Supabase SQL Editor; policies are dropped and recreated, evidence is customer-scoped)
- [`docs/CLIENT-ONBOARDING.md`](docs/CLIENT-ONBOARDING.md) — the practical, non-demo workflow for onboarding a paying client (example: DC254)
- [`docs/LAUNCH.md`](docs/LAUNCH.md) — the X launch thread + posting kit

## The Monday pipeline

```
collect (Meta API tier — optional) → digest (always) → deliver (Telegram/WhatsApp/webhook — optional)
         skips without token                    skips without secrets
```

Every optional stage self-skips when its secrets are missing, so a fresh fork runs green
out of the box and lights up as you configure. Setup guide: `docs/DELIVERY.md`.

## Client portal

**https://kjonathan254.github.io/fuatilia/portal/** — static client app on
GitHub Pages, no extra infrastructure. Clients sign in with email + password,
manage their briefs, and read their own evidence, weekly reports (demo rows
visibly labelled), named competitors and delivery log.

- Security model: the page ships only the Supabase **anon public** key; every
  row is scoped by Row Level Security to the signed-in customer — cross-client
  reads return empty by policy. Never paste a service_role key here.
- One-time enable: set the `SUPABASE_ANON_KEY` constant in `portal/index.html`
  (Dashboard → Project Settings → API keys → anon public).
- Onboarding a client end-to-end (account → brief → evidence → Monday
  report → delivery): [`docs/CLIENT-ONBOARDING.md`](docs/CLIENT-ONBOARDING.md).

## Roadmap

- **v0.2** ✅ — Telegram/WhatsApp/webhook digest delivery · Meta API collector (EU/issue tier)
- **v0.3** ✅ — GitHub Pages site ✅ · **post-audit trust release**: active-ad-count scale bands (variant counts never drive scale) · demo/production data isolation (`data/demo.jsonl`) · `active_ad_count` + `concept_id` schema fields · weekly snapshots with deltas · workflow heartbeat + failure alert + persistent digest archive · honest-signal copy pass
- **v0.4** — advertiser intelligence profiles · creative-concept tracking in the viewer · coverage monitor upgrades · digest HTML edition · multi-country profiles (TZ / UG / RW)
- **v1.0** — Swahili/Sheng mode · contributor capture playbook · first paid analysis cohort (hybrid model: free public radar, paid professional intelligence)

## Non-goals

No scraping gated surfaces. No personal data. No "guaranteed profitable products" claims.
No resale of raw platform data.

## License

MIT — see [LICENSE](LICENSE). Built by [DC254](https://github.com/kjonathan254) ·
Kevin Jonathan Otieno. Contributions welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).
