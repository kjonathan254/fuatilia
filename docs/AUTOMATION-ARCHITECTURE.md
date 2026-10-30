# Fuatilia — Automation Architecture

How Fuatilia becomes an automated advertising-intelligence service without pretending
that every platform's data is automatable. Written 2026-10-30, after the owner's
automation-first brief.

> **The one distinction this whole document rests on:** you can automate the entire
> workflow. You cannot assume you can automate access to every advertising platform's
> data. Automating the workflow makes Fuatilia a reliable product. Pretending about
> access makes it an automated system that produces incomplete reports with
> impressive-looking conclusions. We chose reliability.

---

## 1 · The six components

| # | Component | Responsibility | Where it lives today |
|---|---|---|---|
| 1 | Customer portal | Collects preferences, manages subscriptions | `Fuatilia Brief` (Next.js 16 + Supabase Auth, this repo's sibling app) |
| 2 | Data collection | Retrieves available advertising observations | `fuatilia collect` (Meta API tier) + assisted human capture (`fuatilia add`) |
| 3 | Database | Stores advertisers, ads, changes and evidence | **Supabase** — Postgres + RLS (`supabase/migrations/0001_fuatilia_init.sql`) |
| 4 | Intelligence engine | Classifies, compares, detects change | `lib/signals.js` + `lib/digest.js` (deterministic, zero-dependency) |
| 5 | Report generator | Produces personalised, evidence-linked reports | reports tables + the Monday digest (AI interpretation layered on deterministic signals) |
| 6 | Delivery engine | Sends reports to the chosen channel | `lib/deliver.js` (Telegram/WhatsApp/webhook) → per-customer deliveries table |

```
Customer preferences          Competitors · industry · location · frequency
        │
Automation orchestrator       schedules + coordinates (GitHub Actions today, n8n later)
        │
Data collection + validation  APIs · assisted capture · customer-submitted evidence
        │
Intelligence engine           classification · comparison · change detection
        │
AI report generation          personalised analysis with evidence + source links
        │
Automatic delivery            WhatsApp · email · Telegram
```

## 2 · The customer journey (onboarding workflow)

1. **Create an account** — name, email, password (Supabase Auth; the `handle_new_user`
   trigger provisions `customers` + `subscriptions` rows automatically).
2. **Configure the brief** — industry, competitors (one per line), platforms, geography,
   frequency, delivery channel + time. Stored in `briefs` + `brief_competitors`.
3. **Fuatilia collects** — scheduled sweeps and assisted capture land in `observations`
   with source, capture method and capture date. `fuatilia push` is the bridge from the
   local engine to the platform (idempotent via `dedupe_key`).
4. **Analysis** — the deterministic engine computes tenure, variants, active-ad bands;
   the AI layer writes interpretation **on top of** those numbers, never instead of them.
5. **Report** — `reports` rows with `summary` (counts) and `content` (executive
   intelligence, strategic observations, methodology, limitations) + evidence links.
6. **Delivery** — `deliveries` rows record channel, destination, status, provider id.

A Nairobi agency configures: Banking & financial services · three named banks ·
Meta + Google · Kenya · every Monday · WhatsApp 08:00. Fuatilia prepares that brief from
the data it can actually access — and says what it could not access.

## 3 · Two different data products — never confuse them

| Product | What it is | Data access |
|---|---|---|
| **Competitor intelligence** | What other businesses are publicly advertising | Source-limited: library web UI (assisted capture), API tiers that exist, no general Kenyan commercial API |
| **First-party analytics** | What the customer's own business spends, runs, achieves | Customer-authorised ad-account connections, subject to API permissions |

They have different access requirements, different trust models and different pricing.
Fuatilia's platform schema keeps `observations` (public evidence) separate from any
future first-party connector (authorised, per-customer).

## 4 · Data-access reality (the constraints that shape the product)

- **Meta Ad Library API** — political/issue ads worldwide + all EU/UK ads. Not a
  general-purpose Kenyan commercial-ad API.
- **Meta automated collection** — requires express written permission. Fuatilia does not
  build on unauthorised scraping; human capture inside platform terms is deliberate.
- **Google Ads Transparency Center** — browseable, no public competitor-ad API; ~30-day
  commercial retention. Capture is manual + timestamped.
- **TikTok Creative Center** — Commercial Content API is EU-only + application-gated.
- **Customer-submitted evidence** — screenshots/URLs a customer contributes become
  `observations` rows with `capture_method` and provenance.

Every report states its sources and its limits. An automated inaccurate report delivered
every Monday is not a product advantage — reliability is the product.

## 5 · Security model

- **Publishable (anon) key** — the portal uses it; every query is governed by RLS.
  Customers only ever see their own briefs, reports and deliveries. `observations` are
  readable by any authenticated user (public ad evidence), but **written only by the
  pipeline** — no insert policy exists for clients.
- **Service-role key** — bypasses RLS; belongs to the automation pipeline only
  (`fuatilia push`, n8n, report writer). It lives in CI secrets / shell env — never in
  the repo, never in the portal, never in client code. If it is ever exposed in a chat
  or a screenshot, rotate it in Supabase → Settings → API.
- **Row ownership** — `briefs → reports → deliveries` chains enforce ownership through
  RLS joins; no customer can read another customer's configuration.

## 6 · Build stages — where we are

| Stage | Scope | Status |
|---|---|---|
| 1 · Customer onboarding | Register, configure competitors/industries/frequency | **Live** — portal + Auth + trigger + RLS |
| 2 · Automated collection | Connect authorised sources, schedule, record provenance | **Built** — `fuatilia add`/`collect` + `fuatilia push` with heartbeat (`collection_runs`) |
| 3 · Intelligence engine | Classify, compare, detect change | **Built (deterministic)** — persistence/experimentation/scale signals; AI interpretation next |
| 4 · Personalised reports | Evidence + links + dates + limitations | **Schema live** — report writer is the next build |
| 5 · Automatic delivery | Channel of choice, pause/edit anytime | **Per-operator today** (Telegram/WhatsApp/webhook); per-customer next |
| 6 · Billing & subscriptions | Plan limits, renewals | **Metering live** — `subscriptions.free_sessions_*` implements the 5-free-sessions model; payment processing later |

## 7 · Deliberately not built yet (and why)

- **n8n orchestrator** — GitHub Actions already coordinates the Monday loop; n8n earns
  its place when per-customer schedules and retries multiply.
- **AI report writer** — until real observations flow for a paying pilot, an AI writer
  would generate confident prose from thin data. First: one sector, 5–10 customers,
  a limited advertiser set (the audit's validation experiment).
- **WhatsApp Business Platform per customer** — template approval and phone-number
  infrastructure come with the pilot, not before.
- **Payment processing** — the free-session meter gates usage; billing follows proof.
