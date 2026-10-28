# Fuatilia — Product Definition

**Fuatilia** (Swahili: *"track it / keep watch"*) — the open ad-intelligence toolkit for Kenya.
Codename during development: **AdWatch KE**. Product #2 of the DC254 stack (Product #1: the Data-Centers-254 content engine).

---

## The one-line pitch

> Know what Kenya is advertising — which brands are spending, which ads have survived 90+ days, which hooks they are testing right now — using only public, regulator-mandated transparency data.

## Why this exists (the gap)

The viral "Meta Ad Library method" is real competitive intelligence: every ad running
right now, its start date, its version count, its landing page — public by law. Global
tools (BigSpy, PiPiAds, Foreplay, AdClarity, Similarweb) either ignore East Africa or
treat it as an afterthought. Enterprise ad intelligence (Nielsen, Pathmatics) prices out
the average Kenyan SMB advertiser entirely.

Nobody has packaged this for the Kenyan market. Fuatilia is that package: method +
tooling + weekly digest, open source, built in Nairobi.

---

## The 5Ws + H

### WHO

- **Primary users**: Kenyan SMB advertisers and e-commerce sellers who run (or plan to
  run) paid ads on Meta, Google and TikTok and cannot afford enterprise ad-intel tools.
- **Secondary users**: media buyers and small marketing agencies managing multiple client
  accounts; marketers at ISPs, telcos, fintechs and hardware sellers benchmarking their
  category.
- **Tertiary users**: journalists and researchers auditing what is being advertised to
  Kenyans (the "public accountability" tier).
- **Maintainers**: DC254 (Kevin Jonathan Otieno) + the DC254 agent workflow, with
  open-source contributors.

### WHAT

An open-source toolkit (zero-dependency Node.js CLI + static viewer + GitHub Action)
that turns the public ad libraries into a structured, ongoing intelligence practice:

1. **A watchlist** of Kenyan advertisers, categories and keywords to track.
2. **A capture schema + CLI** that converts a 5-minute browse of the Meta Ad Library,
   Google Ads Transparency Center or TikTok Creative Center into structured records
   (`data/captures.jsonl`).
3. **A signals engine** that classifies every captured ad: tenure (days live), version
   count (hook testing), and a scale band for the advertiser.
4. **A weekly digest generator** (Markdown) — winners, hook tests, scale bands, new
   entrants, landing pages worth tearing down — run automatically every Monday.
5. **A static viewer** so non-technical users can browse the captured intelligence.

### WHEN

- **Weekly cadence**: digest generated every **Monday 09:00 Nairobi (06:00 UTC)** by the
  bundled GitHub Action — same morning rhythm as the DC254 Trust Brief and Repo Watch.
- **Daily use**: `fuatilia add` immediately after browsing an ad library (capture-as-you-go).
- **On demand**: `fuatilia digest` any time — for a pitch, a client audit, or a product launch.

### WHERE

- **Geography**: Kenya-first (country code KE), designed for East Africa expansion
  (TZ, UG, RW) by simply changing the country filter in the watchlist.
- **Distribution**: this GitHub repository; digests as workflow artifacts (and optionally
  committed to a repo or sent to Telegram/WhatsApp/email). The static viewer deploys to
  GitHub Pages with zero configuration.

### WHY

1. **The data is public by law** (EU DSA Article 39 for EU ads; platform transparency
   obligations elsewhere) — the raw material is free and legitimate.
2. **No local player** serves this market at this price point (free/open).
3. **The signals are decision-grade**: a 120-day-old ad with 3+ active versions tells a
   media buyer more than a $997 course.
4. **DC254 needs it too**: dogfooding — the toolkit tracks the ISP/telco/data-center
   categories DC254 itself sells into.

### HOW

The formalized four-part method (see `docs/METHOD.md` for the full playbook and its
legal/ToS boundaries):

| Part | Source | What it gives you |
|---|---|---|
| 1. The search | Meta Ad Library (web, country=KE) | Every brand actively paying to sell a product in the niche |
| 2. The timeline | Ad start dates + version counts | Winners (90+ days live) and current hook tests (3+ versions) |
| 3. The scale read | Active ad count per advertiser | Side hustle vs scaling vs team-scale budget (heuristic bands) |
| 4. The landing page | The ad's destination URL | The money-tested conversion structure — copy the skeleton, never the words |

**Data access reality (read this before dreaming):**

| Source | Kenya commercial ads | Automation | Notes |
|---|---|---|---|
| Meta Ad Library API | ❌ not covered | API covers political/issue ads globally + all EU ads (DSA) | Kenya commercial ads = web UI only |
| Meta Ad Library (web) | ✅ browseable, no login | Assisted capture via this CLI | Respect platform ToS: manual collection only |
| Google Ads Transparency Center | ✅ browseable | No public API; ~30-day commercial retention | Link out + capture quickly |
| TikTok Creative Center | ✅ browseable (varies by region) | Commercial Content API is EU-only + application-gated | Capture top ads manually |

**This is why Fuatilia is a capture-first product, not a scraper.** The moat is not raw
data (anyone can browse it) — it is structured local coverage, the signals layer, and
the weekly reading habit. Reselling raw platform data violates platform terms; selling
*analysis and enrichment* (the digest, the teardowns, the advisory) does not.

## Business model (kept ToS-clean)

- **Open source forever**: the CLI, schema, method and workflows (this repo).
- **Monetizable layer**: a paid human-written weekly analysis on top of the free digest
  (the "so what" for Kenyan advertisers), agency-facing teardown packs, and custom
  watchlists. Sell the insight, never the raw records.

## Roadmap

- **v0.1** (this release): CLI, signals, digest, viewer, Monday Action, demo data.
- **v0.2**: Telegram/WhatsApp digest delivery; EU/political ad tier via official Meta API
  (for users who also sell into the EU diaspora or run issue campaigns).
- **v0.3**: hosted viewer on Pages; multi-country profiles (TZ/UG/RW).
- **v1.0**: Kenyan-language landing page (Sheng/Swahili mode), contributor capture
  playbook, first paid digest cohort.

## Non-goals

- No scraping of gated/logged-in platform surfaces. No personal-data processing.
- No "guaranteed profitable products" claims — every signal is a heuristic, and the
  toolkit says so in every output it produces.
- No resale of raw platform data.
