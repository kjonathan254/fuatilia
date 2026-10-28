# Delivery & Collection Setup (v0.2)

The Monday pipeline is: **collect → digest → deliver**. The digest always runs. The
other two stages switch themselves on as soon as you add their secrets — a fresh fork
works with zero configuration, and you light up channels one by one.

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
   ad-intelligence brief for Kenya — winners, hook tests, new entrants. 09:00 Nairobi."

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

---

## Behaviour guarantees

| Situation | Result |
|---|---|
| No secrets at all | collect skips, digest runs, deliver skips — **run stays green** |
| One channel misconfigured | that channel reports `failed`, others still send, **step exits 1** so you notice |
| Meta API down or tier empty | collector logs honest notes, digest still renders |
| `--digest path/to/file.md` | deliver sends that exact file instead of the newest |
