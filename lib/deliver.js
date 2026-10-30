// Fuatilia delivery — push the Monday digest to where Kenyans actually read:
// Telegram, WhatsApp (Cloud API), or any generic webhook (Zapier/Make/n8n bridges).
//
// All channels are env-driven and skip gracefully when unconfigured, so the Monday
// Action never fails just because delivery isn't set up yet.
//
//   FUATILIA_TELEGRAM_BOT_TOKEN + FUATILIA_TELEGRAM_CHAT_ID   -> Telegram sendMessage
//   FUATILIA_WHATSAPP_TOKEN + FUATILIA_WHATSAPP_PHONE_ID
//     + FUATILIA_WHATSAPP_TO                                  -> WhatsApp Cloud API (text)
//   FUATILIA_WEBHOOK_URL                                      -> POST {text, digest_file}
//
// Per-customer delivery (Stage 5) — business-initiated WhatsApp TEMPLATE messages:
//   fuatilia deliver-reports reads every active WhatsApp brief from the platform
//   and sends the approved template with per-customer parameters, recording each
//   send in the deliveries table. Free-form text is only allowed inside a 24h
//   customer-service window; a weekly brief MUST go as an approved template.
//   See docs/DELIVERY.md §5 for the template to register in Meta Business Manager.
//
// Rules: never fail the digest because delivery is missing; fail the step if a
// CONFIGURED channel errors (silently dropped notifications are worse than red Xs).

import fs from "node:fs";
import path from "node:path";
import { latestReport } from "./analyst.js";
import { supabaseRequest } from "./supabase-sync.js";

const TELEGRAM_LIMIT = 4000; // API hard limit is 4096; leave headroom
const WHATSAPP_LIMIT = 4000; // text message body limit is 4096
const TEMPLATE_PARAM_LIMIT = 1024; // per-parameter limit in template body components

export const DEFAULT_TEMPLATE_NAME = "fuatilia_weekly_intel";

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

/**
 * Send a business-initiated WhatsApp TEMPLATE message (Stage 5).
 * `params` are positional body parameters {{1}}..{{N}} of the registered template.
 * Returns the provider message id (deliveries.provider_message_id).
 */
export async function sendWhatsAppTemplate(to, params, env) {
  const version = env.FUATILIA_WHATSAPP_API_VERSION || "v21.0";
  const name = env.FUATILIA_WHATSAPP_TEMPLATE || DEFAULT_TEMPLATE_NAME;
  const lang = env.FUATILIA_WHATSAPP_TEMPLATE_LANG || "en";
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
        to,
        type: "template",
        template: {
          name,
          language: { code: lang },
          components: [
            {
              type: "body",
              parameters: params.map((text) => ({
                type: "text",
                text: clip(String(text ?? ""), TEMPLATE_PARAM_LIMIT),
              })),
            },
          ],
        },
      }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`WhatsApp template API ${res.status}: ${body}`);
  try {
    const parsed = JSON.parse(body);
    return parsed?.messages?.[0]?.id || null;
  } catch {
    return null;
  }
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

/**
 * Per-customer delivery (Stage 5): send the weekly report to every active
 * brief whose channel is WhatsApp, as an approved TEMPLATE message, and record
 * each send in the platform's deliveries table.
 *
 * Personalised CONTENT per brief is Stage 4; today every customer gets the
 * same weekly pulse, personalised with their name, brief and the portal link.
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (who to message),
 *      FUATILIA_WHATSAPP_TOKEN + FUATILIA_WHATSAPP_PHONE_ID (how),
 *      FUATILIA_WHATSAPP_TEMPLATE / _TEMPLATE_LANG (which template, defaults
 *      to `fuatilia_weekly_intel` / `en`), FUATILIA_PORTAL_URL (report link).
 * Opts: { reportId } pins the deliveries.report_id; otherwise the newest
 *       digests/report-*.json's supabase_id is used when present.
 *
 * @returns {{sent: object[], failed: object[], skipped: string[], notes: string[]}}
 */
export async function deliverReports(root, env = process.env, opts = {}) {
  const notes = [];
  const skipped = [];
  const sent = [];
  const failed = [];

  const url = env.FUATILIA_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.FUATILIA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const hasWhatsApp = env.FUATILIA_WHATSAPP_TOKEN && env.FUATILIA_WHATSAPP_PHONE_ID;

  if (!url || !key) {
    skipped.push("per-customer delivery (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable)");
  }
  if (!hasWhatsApp) {
    skipped.push(
      "per-customer delivery (set FUATILIA_WHATSAPP_TOKEN and FUATILIA_WHATSAPP_PHONE_ID — template must be approved first, docs/DELIVERY.md §5)",
    );
  }
  if (skipped.length === 2) return { sent, failed, skipped, notes };

  // Which report row do recorded deliveries point at? deliveries.report_id is
  // NOT NULL — only record when we actually have one.
  let reportId = opts.reportId || env.FUATILIA_REPORT_ID || null;
  if (!reportId) {
    const rf = latestReport(root);
    if (rf) {
      try {
        reportId = JSON.parse(fs.readFileSync(rf, "utf8")).supabase_id || null;
        if (reportId) notes.push(`deliveries will be logged against reports row ${reportId}`);
      } catch {
        /* unreadable report json — send anyway, skip logging */
      }
    }
  }
  if (!reportId) {
    notes.push("no reports row id — sends proceed but are NOT recorded in deliveries (run `fuatilia report --brief <uuid>` first)");
  }

  // Active WhatsApp briefs + their customer names, via the service role.
  let briefs = [];
  try {
    briefs = await supabaseRequest(
      url,
      key,
      "briefs",
      "GET",
      null,
      "?select=id,name,delivery_destination,customer_id,customers(name)&status=eq.active&delivery_channel=eq.whatsapp",
    );
  } catch (e) {
    failed.push({ brief: "(fetch briefs)", error: String(e.message || e) });
    return { sent, failed, skipped, notes };
  }
  if (!Array.isArray(briefs) || briefs.length === 0) {
    skipped.push("no active WhatsApp briefs on the platform yet");
    return { sent, failed, skipped, notes };
  }

  // Report content for the template parameters.
  const rf = latestReport(root);
  if (!rf) {
    return {
      sent,
      failed,
      skipped: [...skipped, "no report found — run `fuatilia report` first"],
      notes,
    };
  }
  const report = JSON.parse(fs.readFileSync(rf, "utf8"));
  const weekOf = report.facts?.generated_at?.slice(0, 10) || report.week;
  const pulse = report.facts?.pulse || {};
  const pulseLine =
    `${pulse.advertisers_observed ?? 0} advertisers observed · ${pulse.records_captured ?? 0} ad records captured` +
    (report.demo_mode ? " · DEMO DATA" : "");
  const portal = env.FUATILIA_PORTAL_URL || "https://kjonathan254.github.io/fuatilia/";

  for (const b of briefs) {
    const to = (b.delivery_destination || "").replace(/[^+\d]/g, "");
    const customerName = b.customers?.name || "there";
    if (!to) {
      skipped.push(`brief "${b.name}" (${b.id}): no delivery_destination set`);
      continue;
    }
    const params = [
      customerName, // {{1}}
      b.name || "Your intelligence brief", // {{2}}
      weekOf, // {{3}}
      pulseLine, // {{4}}
      portal, // {{5}}
    ];
    try {
      const providerId = await sendWhatsAppTemplate(to, params, env);
      sent.push({ brief: b.name, to, provider_message_id: providerId });
      if (reportId) {
        try {
          await supabaseRequest(url, key, "deliveries", "POST", {
            report_id: reportId,
            channel: "whatsapp",
            destination: to,
            status: "sent",
            provider_message_id: providerId,
            sent_at: new Date().toISOString(),
          });
        } catch (e) {
          notes.push(`delivery log failed for ${b.name}: ${String(e.message || e).slice(0, 160)}`);
        }
      }
    } catch (e) {
      failed.push({ brief: b.name, to, error: String(e.message || e) });
      if (reportId) {
        try {
          await supabaseRequest(url, key, "deliveries", "POST", {
            report_id: reportId,
            channel: "whatsapp",
            destination: to,
            status: "failed",
            error: String(e.message || e).slice(0, 500),
          });
        } catch {
          /* already reported in failed[] */
        }
      }
    }
  }

  return { sent, failed, skipped, notes };
}
