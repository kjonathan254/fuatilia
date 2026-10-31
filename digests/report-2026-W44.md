# Fuatilia weekly report — Week 2026-W44: 4 advertisers on the public record

Week 2026-W44 · generated 2026-10-31T13:18:13.816Z · interpretation: deterministic

## Executive read

- 4 advertisers observed across 7 captured records (meta: 7).
- 1 advertiser kept creative live 90+ days (Safaricom PLC 95d) — persistence, not performance proof.
- 7 captures new to us within 7 days.

## Strategic observations

- Safaricom PLC (meta): 95 days live, 4 active ads observed (captured-card basis). Teardown candidate — check what the landing page is doing that the ad promises.
- Safaricom PLC (meta) is new to our capture — offer on the card: "New number ranges are here - get yours from any Safaricom Shop or Dealer outlet near you. #SafaricomPopoteUlipo". Re-check next Monday; young ads say nothing yet.
- Safaricom PLC (meta) is new to our capture — offer on the card: "M-PESA Business Till: free payments up to 500 bob, up from 200. Lipa na M-PESA on MyOne App. #PataMoreNaSafaricom". Re-check next Monday; young ads say nothing yet.
- Safaricom PLC (meta) is new to our capture — offer on the card: "M-Shwari and KCB M-PESA now under Financial Services on My OneApp - use the search option to get there faster". Re-check next Monday; young ads say nothing yet.

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
| Safaricom PLC | meta | 4 | captured_cards | 0 | 95d | consistent | LONG_RUNNING |
| Spiro Kenya - EV | meta | 1 | captured_cards | 0 | 25d | light | — |
| Starlink | meta | 1 | captured_cards | 0 | 8d | light | — |
| JAMII FAIBA | meta | 1 | captured_cards | 0 | 2d | light | — |

_AI layer writes interpretation on top of deterministic signals, never instead of them. Method: docs/METHOD.md_
