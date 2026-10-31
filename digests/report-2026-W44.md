# Fuatilia weekly report — Week 2026-W44: 5 advertisers on the public record

Week 2026-W44 · generated 2026-10-31T11:49:41.305Z · interpretation: deterministic

> **Demo mode** — built from the fictional demo rows (`data/demo.jsonl`, `example: true`). This report demonstrates format only; it is not market intelligence.

## Executive read

- 5 advertisers observed across 6 captured records (meta: 4, google: 1, tiktok: 1).
- 3 advertisers kept creative live 90+ days (Demo Skincare KE 213d; Demo Gadgets KE 166d; Demo ISP Ltd 121d) — persistence, not performance proof.
- 3 advertisers ran 3+ variants of one ad (Demo Gadgets KE: 7; Demo ISP Ltd: 4; Demo Loans KE: 3) — active creative experimentation.
- 6 captures new to us within 7 days.

## Strategic observations

- Demo Skincare KE (meta): 213 days live, 2 active ads observed (card-reported). Teardown candidate — check what the landing page is doing that the ad promises.
- Demo Gadgets KE (meta): 166 days live, 34 active ads observed (card-reported). Teardown candidate — check what the landing page is doing that the ad promises.
- Demo ISP Ltd (meta): 121 days live, 12 active ads observed (card-reported). Teardown candidate — check what the landing page is doing that the ad promises.
- Demo Gadgets KE (meta): 7 variants of one ad. Track concepts, not counts — group the variants by idea before reading a hook strategy.
- Demo ISP Ltd (meta): 4 variants of one ad. Track concepts, not counts — group the variants by idea before reading a hook strategy.
- Demo Loans KE (tiktok): 3 variants of one ad. Track concepts, not counts — group the variants by idea before reading a hook strategy.
- Demo ISP Ltd (meta) is new to our capture — offer on the card: "Free router + installation this month". Re-check next Monday; young ads say nothing yet.
- Demo Gadgets KE (meta) is new to our capture — offer on the card: "Smartwatch at KSh 1,999 — today only". Re-check next Monday; young ads say nothing yet.
- Demo Solar KE (google) is new to our capture — offer on the card: "Solar kit on 30-day deposit". Re-check next Monday; young ads say nothing yet.

## Methodology

- All numbers come from deterministic classification of captured observations (lib/signals.js): tenure from library start dates, variant counts from ad cards, active-ad counts from the card's advertiser-level figure with our captured-card count as the labelled fallback.
- Scale bands read active ad counts, never variant counts — variants are creatives, not ads.
- Interpretation is layered on top of those numbers; the AI layer, when enabled, receives only the computed facts and may not introduce advertisers, numbers or quotes.

## Limitations

- Signals are not proof: long-running ads can be losers on autopilot; variant counts can be formats, languages or placements rather than new hooks.
- Spend is not public outside political ads — nothing here estimates budgets.
- Kenyan commercial ads are not in Meta's Ad Library API; coverage is limited to what was actually captured from the public libraries this week.
- Delivery is scheduled, not guaranteed — collection depends on capture discipline and platform availability.

## Basis (deterministic facts)

| Advertiser | Platform | Active ads | Basis | Variants | Longest live | Band | Signals |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Demo Skincare KE | meta | 2 | reported_active_ads | 2 | 213d | light | LONG_RUNNING |
| Demo Gadgets KE | meta | 34 | reported_active_ads | 7 | 166d | wide-footprint | LONG_RUNNING+CREATIVE_EXPERIMENTATION |
| Demo ISP Ltd | meta | 12 | reported_active_ads | 4 | 121d | consistent | LONG_RUNNING+CREATIVE_EXPERIMENTATION |
| Demo Loans KE | tiktok | 5 | reported_active_ads | 3 | 77d | consistent | CREATIVE_EXPERIMENTATION |
| Demo Solar KE | meta | 3 | reported_active_ads | 2 | 41d | consistent | — |
| Demo Solar KE | google | 3 | reported_active_ads | 1 | 21d | consistent | — |

_AI layer writes interpretation on top of deterministic signals, never instead of them. Method: docs/METHOD.md_
