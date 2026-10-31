# The first fully real cycle — complete run log

On **Saturday 2026-10-31**, Fuatilia ran its first end-to-end cycle with **real,
human-captured Kenyan ad evidence** — no demo rows anywhere in the chain — and a
client confirmed the report on their phone. This document is the stored breakdown
of exactly how that session went, from start to finish. Everything below is
reconstructable from the repo itself: commits, files, the heartbeat.

> This run log is the source material for [`skills/fuatilia/SKILL.md`](../skills/fuatilia/SKILL.md)
> — the installable agent skill that turns this procedure into something any AI
> agent can repeat for you every week.

---

## The run, summarized

| | |
|---|---|
| **Client** | DC254 (DataCentre254) — brief `DataCentre254 Brief` |
| **Evidence captured** | Saturday 2026-10-31, Meta Ad Library (country: Kenya) |
| **Captures** | 7 ad cards · 4 advertisers · all Meta · all active at capture time |
| **Report** | Week 2026-W44 — deterministic interpretation, `demo_mode: false` |
| **Delivery** | Telegram, received and confirmed by the operator ~16:18 Nairobi |
| **Proof** | commit `a07b554` (evidence) · commit `852d98e` (archive) · `ops/heartbeat.json` · `digests/report-2026-W44.{md,json}` · `snapshots/snapshot-2026-W44.json` |

The pipeline stages ran in this order — **collect → push → digest → snapshot →
deliver → report → deliver-reports → heartbeat → archive** — and the whole run,
from the evidence commit landing to the Telegram message arriving, took well
under a minute of wall-clock time.

---

## Phase 0 — Recover the workspace

The session started from a recycled sandbox: the local clone was gone. Recovery:

1. Read the remote URL of the repo (it embeds a fine-grained GitHub token):
   `git remote get-url origin` → `https://<token>@github.com/kjonathan254/fuatilia.git`.
2. Re-cloned with that URL, then verified with `git log` + `git diff` that
   nothing unpushed was lost (there wasn't — the last session ended with a clean,
   pushed tree).

**Lesson:** keep the source of truth on the remote, treat any local machine as
disposable. Every artifact that matters (evidence, digests, reports, snapshots,
heartbeat) is committed — that is why this run log can be written at all.

## Phase 1 — Ground truth before client work

Before touching client data, the backend and portal were proven with real
requests, not assumptions:

- **RLS verification (9 checks, all passing)** — anonymous reads return `[]`,
  cross-customer reads return `[]`, demo rows are invisible to clients, writes
  are customer-scoped. The working header combination matters: Supabase's REST
  API needs **both** `apikey: <key>` and `Authorization: Bearer <user access
  token>`; sending the access token as the apikey alone returns 401.
- **Portal fixes** (commits `1b31809`, `0406a25`, `5e8d45f`, `1185147`): the
  public page leaked setup guidance in an unconfigured-state card (replaced
  with a neutral notice), a CSS `display` rule defeated the `hidden` attribute
  on the Sign out button (fixed with `[hidden]{display:none!important}`), and
  successful sign-in didn't switch views (the auth listener only handled
  SIGNED_OUT — `enter(data.user)` is now called explicitly on success).

**Lesson:** run the boring verification first. Two of those three portal bugs
would have surfaced mid-cycle as "the portal is broken" and cost more time then.

## Phase 2 — The client, the brief, the wiring

Already in place from onboarding (see [`CLIENT-ONBOARDING.md`](CLIENT-ONBOARDING.md)):

- DC254's account created via the portal (self-serve signup → Supabase trigger
  creates the `customers` + `subscriptions` rows automatically).
- Brief **"DataCentre254 Brief"** — industry: data centres / connectivity,
  geography KE, weekly frequency, Telegram delivery.
- Repository secrets `FUATILIA_BRIEF_ID` + `FUATILIA_REPORT_BRIEF_ID` pointed at
  that brief's UUID, so pushed evidence lands inside the client's RLS scope.
- Telegram secrets (`FUATILIA_TELEGRAM_BOT_TOKEN`, `FUATILIA_TELEGRAM_CHAT_ID`)
  configured — created once via @BotFather, per [`DELIVERY.md` §1](DELIVERY.md).

## Phase 3 — Real evidence capture (the 20–30 minutes)

This is the part no API can do for Kenya: the Meta Ad Library API covers
political/issue ads globally and EU ads only (DSA Art. 39). Kenyan commercial
ads exist only on the **public, login-free web library** — so a human (or an
agent driving a browser) browses and records what they see.

**Method used:**

1. Open `https://www.facebook.com/ads/library`, set country to **Kenya**.
2. Keyword-search the brief's sector seeds: *Safaricom*, *Faiba*, *Starlink*,
   *M-KOPA* (the last one surfacing asset-financing creative adjacent to the
   connectivity sector).
3. For each **active** card worth logging, record: advertiser, start date,
   the offer text verbatim, the landing headline when shown, the Library card
   URL (the provenance link), tags, and a note saying where and when it was seen.
4. One `fuatilia add` per card. Seven cards, seven rows.

**The seven rows** (verbatim from `data/captures.jsonl`, commit `a07b554`):

| Advertiser | Offer on the card | Ad start | Library ID |
|---|---|---|---|
| Safaricom PLC | New number ranges — from any Safaricom Shop or Dealer | 2026-09-13 | `1111209384783840` |
| Safaricom PLC | M-PESA Business Till: free payments up to 500 bob (up from 200) | 2026-09-13 | `1497744762120177` |
| Safaricom PLC | M-Shwari & KCB M-PESA under Financial Services on My OneApp | 2026-07-28 | `1777895590781315` |
| Safaricom PLC | 1.5GB for KES 99 — stream on YouTube today | 2026-10-08 | `3399511866922363` |
| JAMII FAIBA | Faiba Home fibre: 35 Mbps KSh 3,000 · 60 Mbps KSh 4,000 · 90 Mbps KSh 5,000 | 2026-10-29 | `1640626407653306` |
| Starlink | High-speed internet where it was too expensive or out of reach | 2026-10-23 | `1375513602313770` |
| Spiro Kenya - EV | Electric bike via M-KOPA: KES 15,000 deposit + KES 365/day × 24 months | 2026-10-06 | `2103715977202897` |

Selection discipline: only cards that were **live at capture time**, only
**verbatim** offer text (no paraphrase — the offer string is evidence), every
row carrying its Library ID so anyone can re-open the exact card.

## Phase 4 — Validate before anything leaves the machine

```bash
node bin/fuatilia.js check    # schema-validates every row in captures.jsonl
node bin/fuatilia.js score    # tenure + signals + scale band per capture
```

`check` confirmed all 7 rows valid. `score` already showed the story: Safaricom's
M-Shwari/KCB creative at **95 days live** → the LONG_RUNNING persistence signal;
everything else young (2–25 days). No demo rows existed in `captures.jsonl` —
the file is real-captures-only by design (`--example` files to
`data/demo.jsonl`, which never leaves the CLI, and `push` refuses to run when
the real store is empty).

## Phase 5 — Dispatch the pipeline

2026-10-31 was a **Saturday**; the cron fires Mondays 06:00 UTC (09:00
Nairobi). So the run was triggered by hand: **repo → Actions → "Fuatilia
AdWatch" → Run workflow** — same pipeline, same secrets, same archive.

Evidence commit `a07b554` landed 13:17:59 UTC (16:17:59 Nairobi). The run
completed on exactly that commit:

| Stage | Outcome in this run |
|---|---|
| `collect` (Meta API tier) | Skipped honestly — no token configured, and Kenyan commercial ads aren't in the API tier anyway |
| `push` (Supabase) | 7 real observations uploaded, brief-linked, recorded in `collection_runs` |
| `digest` | `digests/adwatch-2026-10-31.md` — pulse, long-runners, new-this-week |
| `snapshot` | `snapshots/snapshot-2026-W44.json` — first week of the history layer |
| `deliver` | Condensed digest sent to **Telegram** (the operator's phone) |
| `report` | `digests/report-2026-W44.{md,json}` — deterministic interpretation, synced to the platform (`supabase_id b7844ce8…`), `demo_mode: false` |
| `deliver-reports` | Skipped — per-customer WhatsApp templates not configured (Telegram is the delivery channel) |
| `heartbeat` | `ops/heartbeat.json` → `2026-10-31T13:18:14Z` on commit `a07b554` |
| `archive` | Commit `852d98e` — digest + snapshot + heartbeat committed to the repo |

**13:17:59 → 13:18:14 UTC: fifteen seconds from `git push` to delivery.** The
zero-dependency CLI makes the whole pipeline cheap enough to run on demand.

## Phase 6 — Delivery confirmed

The Telegram message arrived (condensed digest: pulse, the Safaricom long-runner,
the new-this-week table). The full report also became readable in the portal
under the client's brief — evidence table, report sections, delivery log. The
operator confirmed receipt: *"I can confirm I received the report on my
Telegram."*

The headline that mattered: **"Week 2026-W44: 4 advertisers on the public
record"** — no `[DEMO]` prefix anywhere. The client's report was real market
observation, every number traceable to a public library card.

---

## Breakages hit during the session (honest list)

| What broke | Root cause | Fix |
|---|---|---|
| RLS test returned 401 | Access token used as the `apikey` header | Send **both** headers: `apikey: <key>` + `Authorization: Bearer <token>` |
| Local repo vanished | Sandbox recycled between sessions | Re-clone from the token-embedded remote; verify `git diff` first |
| Setup card leaked guidance publicly | Portal's unconfigured fallback printed stack details | Neutral maintenance copy + real anon key configured |
| Sign out button visible when logged out | CSS `display` rule defeated the `hidden` attribute | Global `[hidden]{display:none!important}` |
| Sign-in succeeded but view didn't change | Auth listener only handled `SIGNED_OUT` | Call `enter(data.user)` explicitly on successful password grant |

## Effort accounting (honest)

| Activity | Time |
|---|---|
| Phase 0–1 (workspace + verification + portal fixes) | one session, done once — not part of the weekly loop |
| Phase 3 (browse + capture 7 cards) | ~20 minutes |
| Phase 4 (check + score) | < 1 minute |
| Phase 5 (dispatch + watch) | ~2 minutes, mostly reading the run log |
| Phase 6 (confirmation) | instant |
| **The repeatable weekly loop (3–6)** | **~25 minutes per client per week** |

## From run log to skill

Everything above that is repeatable was generalized into
[`skills/fuatilia/SKILL.md`](../skills/fuatilia/SKILL.md) — backend setup,
Telegram bot creation, WhatsApp template delivery, client onboarding, and the
weekly evidence loop — written so an AI agent can execute it with you. Install
instructions: the [README](../README.md#use-it-as-an-agent-skill) or the
[live skill page](https://kjonathan254.github.io/fuatilia/skill.html).
