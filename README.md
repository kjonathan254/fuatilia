# Fuatilia

> **Swahili: _"track it / keep watch."_** The open ad-intelligence toolkit for Kenya.
> Know what Kenya is advertising — who is spending, which ads survived 90+ days, which
> creatives are being iterated right now — using only public ad-library transparency
> data (mandated by law in some jurisdictions, by platform policy elsewhere).
> Zero dependencies. Built in Nairobi.

**Product #2 of the DC254 stack** (Product #1: the [Data-Centers-254](https://github.com/kjonathan254/Data-Centers-254) content engine).

**Live site:** <https://kjonathan254.github.io/fuatilia/> — landing page + data viewer,
published from `main` via GitHub Pages.

---

## The gap it fills

The "Meta Ad Library method" is real: the publicly observable ads, their start dates,
their version counts, their landing pages — public, free, no login. As of writing, the
global ad-spy tools (BigSpy, PiPiAds, Foreplay, AdClarity) do not list Kenya or East
Africa as covered markets — verify their current coverage before relying on that — and
enterprise ad intelligence (Nielsen, Similarweb) prices out the average Kenyan SMB
advertiser.

Fuatilia packages the method for the Kenyan market as **method + CLI + weekly digest**,
open source (MIT).

## What's in the box

| Piece | File | What it does |
|---|---|---|
| CLI | `bin/fuatilia.js` | `init` · `add` · `check` · `score` · `digest` · `deliver` · `collect` — zero-dependency Node ≥ 18 |
| Signals engine | `lib/signals.js` | Tenure, variant counts, scale bands → long-running creatives & creative experiments |
| Digest renderer | `lib/digest.js` | The Monday Markdown sheet: pulse, long-runners, experiments, new entrants, teardown list |
| Delivery | `lib/deliver.js` | Sends the digest to **Telegram**, **WhatsApp (Cloud API)** or any webhook — env-driven, skips when unconfigured |
| API collector | `lib/collector.js` | Pulls the Meta Ad Library **API tier** (EU + issue ads) into `captures.jsonl`, de-duplicated |
| Watchlist | `watchlist.json` | Kenyan brands & category search seeds to track weekly |
| Capture store | `data/captures.jsonl` | One JSON object per seen ad card (schema: `docs/SCHEMA.md`) |
| Monday Action | `.github/workflows/adwatch.yml` | Generates the digest every **Monday 09:00 Nairobi** as a workflow artifact |
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
  --start 2026-09-01 --versions 4 \
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
| **Long-running creative** | ad live **90+ days** | persistence signal — someone keeps renewing the budget; not proof of profit (120 days is the viral threshold; 90 here, conservative) |
| **Creative experimentation** | **3+ active variants** of one ad | they are iterating the creative — could be new hooks, or just aspect ratios, languages and placements; watch which variants survive |
| **Scale band** | advertiser's **total active ads** (1–2 / 3–29 / 30+) | solo-testing / scaling / team-scale budget (calibrated for Kenyan budgets). Counted from the library's advertiser-level `active_ad_count` — never inferred from variant counts or rows saved |

**Every output carries the caveat: signal, not proof.** Agencies leave losers on
autopilot; grants fund ads that never need profit. Fuatilia classifies — humans decide.

## The model

**Radar is free forever** — the CLI, the method, the Monday digest, the viewer.
**Intelligence is free for your first 5 sessions** — no card, no signup; get hooked
first, decide after. Once it has earned its keep: **Fuatilia Brief** from KSh 500 per
session or **KSh 2,500/month** for unlimited sessions, weekly snapshots and sector
filters. **Agency tier: KSh 10,000/month** (multi-seat, custom watchlists). Sell
analysis, never raw platform data.

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

1. **Monday 09:00** — the Action drops the digest (Actions → artifacts).
2. Read: new entrants, fresh creative experiments, long-runners crossing the 90-day line.
3. Ten minutes browsing your niche's library terms → `fuatilia add` what you saw.
4. Teardown one long-runner's landing page — copy the **structure** (promise → proof → offer
   → urgency → CTA), never the words or assets.

## Docs

- [`docs/PRODUCT.md`](docs/PRODUCT.md) — full definition, 5W1H, business model, roadmap
- [`docs/METHOD.md`](docs/METHOD.md) — the four-part method + legality boundaries
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — the capture record schema
- [`docs/DELIVERY.md`](docs/DELIVERY.md) — Telegram/WhatsApp/webhook setup + Meta API collector
- [`docs/LAUNCH.md`](docs/LAUNCH.md) — the X launch thread + posting kit

## The Monday pipeline

```
collect (Meta API tier — optional) → digest (always) → deliver (Telegram/WhatsApp/webhook — optional)
         skips without token                    skips without secrets
```

Every optional stage self-skips when its secrets are missing, so a fresh fork runs green
out of the box and lights up as you configure. Setup guide: `docs/DELIVERY.md`.

## Roadmap

- **v0.2** ✅ — Telegram/WhatsApp/webhook digest delivery · Meta API collector (EU/issue tier)
- **v0.3** ✅ — GitHub Pages site (landing + viewer, `main` → Pages)
- **v0.4** ✅ — trust & accuracy pass: advertiser-level `active_ad_count` scale bands (never inferred from variants), `capture_method` provenance, persistence/experimentation wording, demo data quarantined, honest coverage claims
- **v0.5** — advertiser intelligence profiles · creative-concept grouping · weekly snapshots
- **v1.0** — Swahili/Sheng mode · contributor capture playbook · first paid analysis cohort

## Non-goals

No scraping gated surfaces. No personal data. No "guaranteed profitable products" claims.
No resale of raw platform data.

## License

MIT — see [LICENSE](LICENSE). Built by [DC254](https://github.com/kjonathan254) ·
Kevin Jonathan Otieno. Contributions welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).
