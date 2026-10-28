# data/

- `captures.jsonl` — the intelligence store. One JSON object per line (see `docs/SCHEMA.md`).
- The rows currently in the file are **fictional demo rows** (`"example": true`) so the
  tooling works out of the box. Start capturing real ads with:

```bash
node bin/fuatilia.js add --advertiser "Zuku" --platform meta --country KE \
  --start 2026-09-01 --versions 4 --library "https://www.facebook.com/ads/library/?..."
```

- This file is append-only by convention: new lines in, old lines never edited. Git
  history is your audit trail.
- Do **not** commit personal data or screenshots of gated surfaces — public library
  records only.
