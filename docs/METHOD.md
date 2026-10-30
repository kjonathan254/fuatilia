# The Fuatilia Method

The four-part competitive intelligence loop, formalized. This is the operating manual
for what the CLI records and what the digest reads.

> **Honesty clause, read first.** Every signal below is a *heuristic*, not proof.
> Agencies leave losing ads on autopilot for months; grants and brand campaigns are not
> trying to be profitable; a long-lived ad can be a tax write-off with a logo on it.
> Fuatilia classifies signals — humans make the decisions.

---

## Part 1 — The search (who is spending)

Open the **Meta Ad Library** (`facebook.com/ads/library`), set country to **Kenya**,
search a product or category. Every publicly observable brand advertising that thing
right now appears. No login. The advertiser cannot opt out of the library — in the EU
that is law (DSA Art. 39); in Kenya the platforms do it by policy. Either way the data
is public and free to read.

Do the same in the **Google Ads Transparency Center** (Search/YouTube/Display, ~30-day
window) and **TikTok Creative Center**. Cross-platform advertisers are the strongest
spenders — capture them first.

**Record**: advertiser name, platform(s), category, the library URL of the search or
advertiser page.

## Part 2 — The timeline (what survives)

For each advertiser, note the ad's **start date**. The library shows it on every card.

- **90+ days live** → *long-running creative*. Someone keeps renewing the budget — a
  persistence signal, not proof of profit. (120 days is the viral threshold; 90 is the
  conservative one. Fuatilia flags at 90 and names it exactly what it is: long-running.)
- **3+ active variants of one ad** → *creative experimentation in progress*. They are
  iterating the creative — new hooks, or just aspect ratios, languages and placements.
  Watch which variants survive before you decide it was a hook fight.
- **Launch dates cluster** (many ads started the same week) → *campaign burst*: product
  launch, seasonal push, or funding round. Compare year-over-year for seasonality.

## Part 3 — The scale read (how big they are)

Read the advertiser's **total active-ad count off the library's advertiser page** (Meta
shows it directly — "X active ads") and map it to bands. Record it in
`active_ad_count` — the schema has a dedicated field for exactly this. Never infer
scale from version counts or from how many rows you happened to save; those measure
different things.

| Active ads | Band | What it usually means |
|---|---|---|
| 1–2 | Solo / testing | One person with a card and hope |
| 3–29 | Scaling | A real media budget and someone watching numbers |
| 30+ | Team-scale | Agency or in-house team, six-figure monthly spend territory |

Bands are calibrated for the Kenyan market's smaller absolute budgets; treat them as
order-of-magnitude reads, never exact figures. Actual spend is not public outside
political ads — anyone selling you exact spend numbers for Kenya is guessing.

## Part 4 — The landing page (where the click lands)

Click through from the ad. That page is where **every paid click goes** — its headline,
offer structure, proof stacking and CTA have been tested with real money.

- Copy the **structure** (skeleton): promise → proof → offer → urgency → CTA.
- Never copy the **words or assets**. Structure is craft; words and images belong to
  whoever made them. Copying them is not just bad practice, it is infringement.

Fuatilia stores the URL and the headline; the teardown is human work (or a prompt away).

---

## The loop, weekly

1. **Monday morning**: the Action generates the digest from everything captured last week.
2. **Read the digest**: new entrants, fresh creative experiments, long-runners crossing
   the 90-day line.
3. **Capture anything new** you saw while scrolling (`fuatilia add` takes a minute).
4. **Teardown one long-runner** properly each week — structure notes into `notes/` (optional).

## Legality & platform terms (the boundaries that keep this product alive)

- The three libraries are **public transparency surfaces** — some under legal obligation
  (DSA Article 39 in the EU, political-ad rules in the US), some under platform policy
  for other markets (Meta's all-ads library covering Kenya is policy, not Kenyan law).
  Browsing them is the intended use either way.
- **Manual, human capture is fine. Bulk scraping and reselling raw data violate Meta's
  and Google's terms of service.** Fuatilia is a structured notebook for human capture —
  deliberately.
- The **Meta Ad Library API** exists and is free, but only covers political/issue ads
  globally plus all EU ads under the DSA. Kenyan commercial ads are not in the API. If
  you also run issue ads or target the EU, an API collector can be added (roadmap v0.2)
  using your own developer app and token.
- Never store personal data. Ad records, creative descriptions and landing pages are the
  scope — not the people behind them.

## What a good capture looks like

A capture is one *active ad card* you saw today:

- advertiser: **Zuku** — platform: **meta** — country: **KE**
- ad_start: the date on the card — versions: how many active variants of that ad
- active_ad_count: the advertiser's total active ads (from their library page)
- offer: "Free installation this month" — landing_url: where the button goes
- library_url: paste it so future-you can re-check in one click

That single row feeds every signal and the whole digest. Ten minutes of browsing on a
Sunday is a full week of intelligence for a Kenyan niche.
