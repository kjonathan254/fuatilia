// Fuatilia delivery — push the Monday digest to where Kenyans actually read:
// Telegram, WhatsApp (Cloud API), or any generic webhook (Zapier/Make/n8n bridges).
//
// All channels are env-driven and skip gracefully when unconfigured, so the Monday
// Action never fails just because delivery isn't set up yet.
//
//   FUATILIA_TELEGRAM_BOT_TOKEN + FUATILIA_TELEGRAM_CHAT_ID   -> Telegram sendMessage
//   FUATILIA_WHATSAPP_TOKEN + FUATILIA_WHATSAPP_PHONE_ID
//     + FUATILIA_WHATSAPP_TO                                  -> WhatsApp Cloud API
//   FUATILIA_WEBHOOK_URL                                      -> POST {text, digest_file}
//
// Rules: never fail the digest because delivery is missing; fail the step if a
// CONFIGURED channel errors (silently dropped notifications are worse than red Xs).

import fs from "node:fs";
import path from "node:path";

const TELEGRAM_LIMIT = 4000; // API hard limit is 4096; leave headroom
const WHATSAPP_LIMIT = 4000; // text message body limit is 4096

/** Find the newest digest in digests/ (or use the explicit path). */
export function latestDigest(root, explicitPath) {
  if (explicitPath) {
    const p = path.resolve(root, explicitPath);
    if (!fs.existsSync(p)) throw new Error(`digest not found: ${p}`);
    return p;
  }
  const dir = path.join(root, "digests");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("adwatch-") && f.endsWith(".md"))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

/**
 * Condense the Markdown digest into phone-friendly plain text:
 * keep the header, demo banner, every data row as "a · b · c" lines;
 * drop table header rows, separator rows and the boilerplate footer.
 */
export function condense(md) {
  const out = [];
  let tableOpen = false; // true while inside a markdown table

  const clean = (s) => s.replace(/\*\*/g, "").replace(/`/g, "");

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    if (line.startsWith("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      const isSeparator =
        cells.length > 0 && cells.every((c) => /^[-: ]*$/.test(c));
      // First row of a table is its column header; separator rows are noise.
      // Drop both — each data row already reads as "name · value · value".
      if (!tableOpen || isSeparator) {
        tableOpen = true;
        continue;
      }
      if (cells.length) out.push("  • " + cells.join(" · "));
      continue;
    }

    if (tableOpen && !line.trim()) continue; // table may continue after blank line
    tableOpen = false;

    if (!line) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    if (line.startsWith("# ")) out.push(clean(line.slice(2)).toUpperCase());
    else if (line.startsWith("## ")) out.push("\n" + clean(line.slice(3)));
    else if (line.startsWith("> ")) out.push(clean(line.slice(2)));
    else if (line.startsWith("- ")) out.push("  • " + clean(line.slice(2)));
    else if (line.startsWith("_")) continue; // footer meta
    else out.push(clean(line));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function clip(text, limit) {
  return text.length <= limit ? text : text.slice(0, limit - 1) + "…";
}

async function sendTelegram(condensed, env) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.FUATILIA_TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.FUATILIA_TELEGRAM_CHAT_ID,
        text: clip(condensed, TELEGRAM_LIMIT),
      }),
    },
  );
  if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
}

async function sendWhatsApp(condensed, env) {
  const version = env.FUATILIA_WHATSAPP_API_VERSION || "v21.0";
  const res = await fetch(
    `https://graph.facebook.com/${version}/${env.FUATILIA_WHATSAPP_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FUATILIA_WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: env.FUATILIA_WHATSAPP_TO,
        type: "text",
        text: { body: clip(condensed, WHATSAPP_LIMIT) },
      }),
    },
  );
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
}

async function sendWebhook(fullText, digestFile, env) {
  const res = await fetch(env.FUATILIA_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fullText, digest_file: digestFile }),
  });
  if (!res.ok) throw new Error(`Webhook ${res.status}: ${await res.text()}`);
}

/**
 * Deliver the digest to every configured channel.
 * Returns { sent: string[], skipped: string[], failed: {channel, error}[] }.
 */
export async function deliver(root, env = process.env, explicitPath = null) {
  const digestFile = latestDigest(root, explicitPath);
  if (!digestFile) {
    return { sent: [], skipped: ["no digest found — run `fuatilia digest` first"], failed: [] };
  }
  const full = fs.readFileSync(digestFile, "utf8");
  const condensed = condense(full);

  const channels = [];
  if (env.FUATILIA_TELEGRAM_BOT_TOKEN && env.FUATILIA_TELEGRAM_CHAT_ID)
    channels.push(["telegram", () => sendTelegram(condensed, env)]);
  if (
    env.FUATILIA_WHATSAPP_TOKEN &&
    env.FUATILIA_WHATSAPP_PHONE_ID &&
    env.FUATILIA_WHATSAPP_TO
  )
    channels.push(["whatsapp", () => sendWhatsApp(condensed, env)]);
  if (env.FUATILIA_WEBHOOK_URL)
    channels.push(["webhook", () => sendWebhook(full, path.basename(digestFile), env)]);

  if (channels.length === 0) {
    return {
      sent: [],
      skipped: [
        "no delivery channels configured",
        "set FUATILIA_TELEGRAM_BOT_TOKEN + FUATILIA_TELEGRAM_CHAT_ID (easiest), or see docs/DELIVERY.md",
      ],
      failed: [],
    };
  }

  const sent = [];
  const failed = [];
  for (const [name, fn] of channels) {
    try {
      await fn();
      sent.push(name);
    } catch (e) {
      failed.push({ channel: name, error: String(e.message || e) });
    }
  }
  return { sent, skipped: [], failed };
}
