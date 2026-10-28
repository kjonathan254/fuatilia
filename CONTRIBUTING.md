# Contributing to Fuatilia

## Ground rules

1. **Public data only.** Captures must come from public transparency surfaces (Meta Ad
   Library, Google Ads Transparency Center, TikTok Creative Center). No scraping gated
   or logged-in surfaces. No personal data, ever.
2. **Fictional examples must stay fictional.** Demo rows keep `"example": true`. Never
   invent numbers for a real brand — if you didn't see it in the library, don't commit it.
3. **Signals stay caveated.** Every classifier output must keep its "signal, not proof"
   language. If a PR removes the caveats, it will not be merged.

## Local development

```bash
git clone https://github.com/kjonathan254/fuatilia.git && cd fuatilia
node bin/fuatilia.js help
node bin/fuatilia.js check        # schema validation
node bin/fuatilia.js score        # signals smoke test
node bin/fuatilia.js digest       # digest smoke test
```

CI runs syntax checks, schema validation and a digest smoke test on every push — keep it
green.

## Good first contributions

- New `search_seeds` for Kenyan niches in `watchlist.json`
- Landing-page teardown templates (`docs/`)
- A digest → Telegram/WhatsApp delivery workflow
- Swahili/Sheng translations of the README and method docs

## Reporting

Open an issue with: what you searched, what the library showed, what you expected.
Screenshots of public library pages are fine; blur anything that isn't ad content.
