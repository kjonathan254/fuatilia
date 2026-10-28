# Delivery & Collection Setup (v0.2)

The Monday pipeline is: **collect → digest → deliver**. The digest always runs. The
other two stages switch themselves on as soon as you add their secrets — a fresh fork
works with zero configuration, and you light up channels one by one.

Add secrets at: **repo → Settings → Secrets and variables → Actions → New repository secret.**

---

## 1. Telegram (easiest — 10 minutes)

1. In Telegram, message **@BotFather** → `/newbot` → give it a name → copy the bot
   token (looks like `123456:AAH-...`).
2. Start a chat with your new bot (press **Start**) — bots cannot message you first.
3. Get your chat ID: open
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   in a browser, find `"chat":{"id":123456789,...}` — that number is your chat ID.
   (For a group chat, add the bot to the group and read the group's id — negative number.)
4. Add two secrets:
   - `FUATILIA_TELEGRAM_BOT_TOKEN`
   - `FUATILIA_TELEGRAM_CHAT_ID`

Test locally: `FUATILIA_TELEGRAM_BOT_TOKEN=... FUATILIA_TELEGRAM_CHAT_ID=... node bin/fuatilia.js deliver`

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
