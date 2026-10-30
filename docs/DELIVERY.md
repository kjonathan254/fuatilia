# Delivery & Collection Setup (v0.5)

The Monday pipeline is: **collect → push → digest → snapshot → deliver → report →
deliver-reports**. The digest, snapshot and report always run. Every other stage
switches itself on as soon as you add its secrets — a fresh fork works with zero
configuration, and you light up stages one by one.

Add secrets at: **repo → Settings → Secrets and variables → Actions → New repository secret.**

---

## 1. Telegram (easiest — 15 minutes, zero to phone)

**1. Create the bot with @BotFather** (Telegram's official bot that makes other bots):

1. Open Telegram, search **@BotFather** (blue check), send `/newbot`.
2. It asks for a **display name** — suggestions: `Fuatilia Digest` · `Fuatilia Radar` · `AdWatch KE`.
3. It asks for a **username** (must end in `bot`, 5–32 chars). Try in order:
   `fuatilia_digest_bot` → `fuatiliaradar_bot` → `fuatilia_ke_bot` → `my_fuatilia_bot`
   → taken? add your digits: `fuatilia_digest_254_bot`.
4. BotFather replies with the **bot token** — `123456789:AAH-xxxx...`.
   That token is the bot's password. Never commit it; if it ever leaks, `/revoke`
   in BotFather mints a new one. Optional polish: `/setdescription` → "Your Monday
   ad-intelligence brief for Kenya — long-runners, experiments, new entrants. 09:00 Nairobi."

**2. Say hello to your bot (do not skip):** open the bot from BotFather's message and
press **Start** (or send any message). Bots cannot message you first — without this
step every later send fails with `chat not found`.

**3. Get your chat ID.** Open in any browser:

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

(replace `<TOKEN>` with the full token, no spaces). In the JSON, find
`"chat":{"id":123456789,...}` — that number is your chat ID. Blank result? Send the
bot another message and refresh. Shortcut for personal chats: message **@userinfobot**
— your Telegram user ID *is* your chat ID. Groups: add the bot to the group, run
`/setprivacy` → **Disable** in BotFather (lets getUpdates see chatter), post anything
in the group, refresh getUpdates — the group ID is negative (e.g. `-1001234...`);
use it as-is.

**4. Add two repository secrets** (repo → Settings → Secrets and variables → Actions
→ New repository secret; secrets are write-only — a typo can only be fixed by
overwriting, never viewed):

| Name | Value |
|---|---|
| `FUATILIA_TELEGRAM_BOT_TOKEN` | the full bot token, e.g. `123456789:AAH-...` |
| `FUATILIA_TELEGRAM_CHAT_ID` | the numeric chat ID, e.g. `123456789` |

**5. Test from your laptop** (sends the newest file in `digests/`):

```bash
FUATILIA_TELEGRAM_BOT_TOKEN=123456789:AAH-... \
FUATILIA_TELEGRAM_CHAT_ID=123456789 \
node bin/fuatilia.js deliver
```

**6. Test in the cloud:** repo → Actions → **Fuatilia AdWatch** → Run workflow →
wait ~1 minute → the condensed digest lands on your phone. From then on it arrives
every Monday 09:00 Nairobi, no one has to remember anything.

**Troubleshooting**

| Symptom | Cause → fix |
|---|---|
| `Telegram API 401` | token wrong or revoked → re-copy from BotFather, overwrite the secret |
| `400 ... chat not found` | you never pressed Start, or the chat ID is wrong (groups are negative) |
| CLI says `skipped: no delivery channels configured` | env var names typo'd — they must be exactly `FUATILIA_TELEGRAM_BOT_TOKEN` + `FUATILIA_TELEGRAM_CHAT_ID` |
| Workflow green but silent | deliver ran before any digest existed → ensure the digest step ran, or pass `--digest path` |
| Want it in a group too | chat ID = group's negative ID; one bot can serve both (second secret set not needed — one channel, one destination) |

## 2. WhatsApp (official Cloud API)

1. **developers.facebook.com** → Create App → type **Business** → add the
   **WhatsApp** product. The test setup gives you a test phone number ID and a temp token.
2. Add the recipient phone number in the app's "To" field (test mode allows up to 5
   verified numbers — enough for a personal weekly digest).
3. Add three secrets:
   - `FUATILIA_WHATSAPP_TOKEN` (system-user token; the temp token expires in 24h)
   - `FUATILIA_WHATSAPP_PHONE_ID` (the sender phone number ID)
   - `FUATILIA_WHATSAPP_TO` (recipient number, country code, no `+`)

**Scope of this text mode:** free-form text messages are only deliverable inside a
24-hour customer-service window or in test mode. A scheduled business-initiated
weekly brief must go as an **approved template** — that is `fuatilia deliver-reports`
in §7 below.

Pragmatic alternative: skip Meta Business entirely — deliver to Telegram, and forward
from Telegram to WhatsApp manually, or bridge via a webhook (below).

## 3. Generic webhook (bridges anywhere: Zapier, Make, n8n, your own endpoint)

- `FUATILIA_WEBHOOK_URL`
- Contract: `POST` with JSON `{ "text": "<full markdown digest>", "digest_file": "adwatch-2026-10-28.md" }`

## 4. Meta Ad Library API collector (`fuatilia collect`)

**Read this honestly:** the Ad Library API covers **political/issue ads globally** and
**all ads shown in the EU** (DSA Art. 39). **Kenyan commercial ads are not in the API**
— that tier stays human capture (`fuatilia add`). Enable the collector only if you track
issue campaigns or sell into the EU.

1. **developers.facebook.com** → Create App → type **Business** → add the
   **Ad Library API** product (no review needed for read-only ad archive queries).
2. Generate an access token, add secret: `META_ACCESS_TOKEN`
3. Optional secrets:
   - `FUATILIA_COLLECT_TERMS` — comma-separated (defaults to your watchlist's `search_seeds`)
   - `FUATILIA_COLLECT_COUNTRIES` — comma-separated ISO codes (default `KE`)
   - `FUATILIA_META_API_VERSION` — default `v21.0`

The collector de-duplicates on stable ad IDs and appends to `data/captures.jsonl` with
`source: "meta_api"`. When Meta's API returns nothing for a term/country (expected for
Kenyan commercial ads), it logs the reason and moves on — the Monday run never turns red
over it.

## 5. Platform connection — scheduled collection (`fuatilia push`, `fuatilia report`)

This is Stage 2 of the automation architecture: the Monday workflow stops being a
local digest and starts feeding the platform (observations, heartbeat, reports).

| Secret | Meaning |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` — Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role key (**bypasses RLS** — pipeline only, never client-side) |
| `FUATILIA_BRIEF_ID` | optional — links pushed evidence to that portal brief; without it rows are stored but stay pipeline-only |
| `FUATILIA_REPORT_BRIEF_ID` | optional — brief the weekly report row is filed under (`reports.brief_id` is required) |

What the workflow does once these are set:

1. `fuatilia push --source scheduled_workflow` — every real capture lands in
   `observations` (deduped by evidence key) and the run is recorded in
   `collection_runs`, so the portal's "last run" card shows pipeline health. Set
   `FUATILIA_BRIEF_ID` so the evidence is visible to the brief's customer.
2. `fuatilia report --brief <id>` — the weekly report row lands in `reports` with
   `summary` counts and the `content` sections; per-customer delivery (§7) records
   each send against it in `deliveries`.

## 6. AI interpretation layer (`fuatilia report`)

Stage 3: the deterministic engine computes every number; an LLM writes the words on
top of them, never instead of them. The model sees ONLY the computed facts JSON and a
hard guardrail prompt; its output is shape-validated and any failure falls back to the
built-in deterministic interpreter — an AI outage never turns the Monday run red.

| Secret | Meaning |
|---|---|
| `FUATILIA_AI_API_KEY` | any OpenAI-compatible provider — set it and the AI layer switches on |
| `FUATILIA_AI_BASE_URL` | default `https://api.openai.com/v1`; point at any compatible endpoint |
| `FUATILIA_AI_MODEL` | default `gpt-4o-mini` |

Without the key (or when the endpoint fails) the report is still written —
`digests/report-<week>.md` + `.json` — with the deterministic interpretation and a
note saying so. The files are committed to the repo and uploaded as artifacts.

## 7. WhatsApp Business template — per-customer delivery (`fuatilia deliver-reports`)

Stage 5: the workflow sends each active WhatsApp brief its weekly notification as an
**approved template** message and records every send in the `deliveries` table.
Template messages are the only compliant way to business-initiate a weekly brief.

**Register the template once** (Meta Business Manager → WhatsApp → Message templates
→ Create template):

- Name: `fuatilia_weekly_intel` · Category: **Marketing** · Language: **English (en)**
- Body (exactly five positional parameters):

```text
Hi {{1}}, your weekly advertising intelligence brief "{{2}}" is ready for the week of {{3}}.

{{4}}

Open your report: {{5}}

Reply STOP to opt out.
```

| Param | Filled with |
|---|---|
| `{{1}}` | customer name (from their portal account) |
| `{{2}}` | brief name (e.g. "Banks watch") |
| `{{3}}` | week-of date |
| `{{4}}` | weekly pulse line: advertisers observed · records captured |
| `{{5}}` | portal/report link (`FUATILIA_PORTAL_URL`, defaults to the Pages site) |

Approval usually takes minutes to 48h. Personalised report CONTENT per brief is the
next build (Stage 4) — today every customer gets the same honest weekly pulse,
personalised with their name, brief and link.

Secrets: `FUATILIA_WHATSAPP_TOKEN`, `FUATILIA_WHATSAPP_PHONE_ID` (same app as §2),
optional `FUATILIA_WHATSAPP_TEMPLATE` / `FUATILIA_WHATSAPP_TEMPLATE_LANG` (override
the defaults above) and `FUATILIA_PORTAL_URL`. Requires §5 (the platform knows who
to message and where to log). Customers who reply STOP must be opted out on the
platform before the next send — template sends to opted-out numbers are rejected by
Meta and would show up as `failed` in the run log and the deliveries table.

---

## Behaviour guarantees

| Situation | Result |
|---|---|
| No secrets at all | collect, push, deliver, report-AI, deliver-reports skip — digest + snapshot + deterministic report still run, **run stays green** |
| One channel misconfigured | that channel reports `failed`, others still send, **step exits 1** so you notice |
| Meta API down or tier empty | collector logs honest notes, digest still renders |
| AI endpoint down or off-spec | report falls back to the deterministic interpretation, notes the reason, run stays green |
| Supabase unreachable | push/report persist notes the failure; digest + files still ship; `collection_runs` heartbeat shows the failed run in the portal |
| `--digest path/to/file.md` | deliver sends that exact file instead of the newest |
| Template not yet approved | deliver-reports fails loudly for that send (Meta rejects unknown templates) — approve first, §7 |
