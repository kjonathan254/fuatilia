# Audit response — 2026-10-30

Response to the independent product & strategy audit of Fuatilia delivered on 30 Oct 2026.
This file maps every audit finding to an action: **fixed in this release (v0.3.0)**,
**in progress**, or **planned** with a target release.

## What we fixed immediately (Week 1 of the audit's plan, shipped same-day)

| # | Audit finding | Severity | Action taken |
|---|---|---|---|
| 1 | **Scale-band calculation uses the wrong input** (`maxVersions` substituted for ad count) | Critical | `lib/signals.js` rewritten: bands read `active_ad_count` (reported on the ad card) with an honest `captured_cards` fallback; the basis is printed with every band (`resolveActiveAds`). Variant counts can never drive scale again. Same fix in the CLI `score` table (now grouped per advertiser+platform) and in the digest. Verified with the audit's own Brand A/B case |
| 2 | Demo records in the public production data store | Medium | Demo rows moved to `data/demo.jsonl` (isolated). `data/captures.jsonl` is production-only. `fuatilia add --example` writes to the demo file. Digest falls back to demo rows **only** when production is empty — with an unmissable fictional-data banner |
| 3 | "Nobody funds a loser for a quarter" and similar overstatements | High | Language pass across README, METHOD, LAUNCH, landing page, viewer, digest: "winner candidate" → **long-running creative (persistence signal)**; "hook testing" → **creative experimentation**; bands describe **activity, never budgets** |
| 4 | Variants ≠ new hooks (formats/languages/placements/audiences) | High | New `concept_id` schema field + capture flag (`--concept`); signal copy now says "count concepts, not variants"; schema rules updated |
| 5 | Coverage claims ("every ad", "entire playbook") | High | All copy now says "publicly observable ads across supported libraries"; hero, thread post 2/8 and honesty box updated; "not a census" stated on the landing page |
| 6 | Unsupported competitor claims ("zero Kenyan coverage") | High | Replaced with a defensible positioning: built around Kenyan categories, budgets and prices |
| 7 | "Regulator-mandated transparency data" wording | Medium | Corrected everywhere: "publicly available transparency pages"; METHOD now explicitly separates EU DSA obligations from Kenyan legal reality |
| 8 | "Arrives forever" promise | Medium | Replaced with "scheduled delivery, while the repo stays active" — plus the heartbeat makes reality visible |
| 9 | No delivery/run monitoring; 60-day scheduler risk | Medium | Workflow now writes `ops/heartbeat.json` (last successful run + commit, committed publicly), sends a **failure alert to Telegram** (when secrets exist), has `timeout-minutes`, and the landing page shows the heartbeat |
| 10 | No historical change tracking | High | New `fuatilia snapshot` command → `snapshots/<iso-week>.json` with per-advertiser active-ad counts, signals and **deltas vs the previous week**; the Monday workflow commits digests + snapshots as a persistent archive |
| 11 | Viewer hides provenance | Medium | Cards now show capture date, capture source (`manual_capture` / `meta_api`…), and reported active-ad count; demo rows are behind an explicit "Show demo rows" toggle (off by default, `?demo=1` supported) |
| 12 | Coverage Monitor (audit's key trust feature) | — | Shipped: the landing page's pulse section is now a **Coverage Monitor** computed from real captures only — advertisers tracked, observations, categories, last verified capture, per-platform observations, pipeline heartbeat. When there are no real captures it says so honestly: *coverage is honestly zero* |
| 13 | Digest lacks capture provenance | Medium | Digest pulse now includes **last verified capture** date; "New this week" table gained a *Captured* column; teardown links carry capture dates; coverage-honesty note printed under the pulse |

## Decisions we took from the audit's strategy section

- **Positioning line adopted**: "Kenyan advertising intelligence hiding in public."
- **Hybrid model, now concretised by the owner (2026-10-30)**: free public radar forever;
  intelligence **free for the first 5 sessions** — no card, no signup — then paid
  (Fuatilia Brief from KSh 500/session or KSh 2,500/month; agency tier KSh 10,000/month).
  Session-based freemium replaces the audit's flat free/paid split: the audience gets
  hooked on real sessions first, then pays. No charging for access to already-public ads
  — we charge for research, organisation and time saved.
- **First target customer** (agencies + independent media buyers) noted for the pilot phase — see the audit's validation experiment, which we accept as the plan for the next 90 days: 30 advertisers, 3 sectors, 4 consecutive weekly briefs, 10 pilot users.

## Explicitly not done yet (the audit's Week 2–4 backlog)

- Advertiser Intelligence Profiles (audit's #1 next feature) → **v0.4**
- Creative-concept classification surfaced in the viewer (schema ready, UI pending) → **v0.4**
- Browser-first capture interface → **v0.4**
- Digest HTML edition → **v0.4**
- Real-world pilot dataset (30 advertisers, 3 sectors) → **the 90-day target**
- Sector filters, advertiser comparison, landing-page teardowns at scale → **v0.4/v1.0**
- Moving scheduling off GitHub Actions for any paid tier → deferred until there is a paid tier (audit agrees: "You do not need to build that backend today")

## Known cosmetic debt

The 60-second launch video still uses the old "90+ days = winner" phrasing in two stamp
graphics. The audio says the same. Re-rendering is cheap (the Remotion project is in the
repo history) but was deliberately deferred one day so the correctness fixes ship first.

## The question the audit asked that only the owner can answer

> Do you intend Fuatilia to become: an independent public-interest tool, a commercial
> SaaS, or a hybrid?

**Answered by the owner on 2026-10-30: a hybrid, with session-based freemium** — the
radar stays free and open forever; intelligence is free for the first 5 sessions, then
paid once the value is proven to the operator. The code supports the path (clean MIT
core, isolated data stores, honest methodology); the pricing copy ships on the landing
page and in README/docs.
