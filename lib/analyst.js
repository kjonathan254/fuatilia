// Fuatilia AI report writer — Stage 3 of the automation architecture.
//
// The division of labour is absolute:
//   * lib/signals.js computes EVERY number (tenure, variants, active ads, bands).
//   * this module writes the words ON TOP of those numbers — never instead of them.
//
// Two interpretation engines, same output shape:
//   * "ai"            — an OpenAI-compatible chat endpoint (env-configured), fed ONLY
//                       the deterministic facts JSON and a hard guardrail prompt.
//   * "deterministic" — template sentences built from the same facts. Runs when no
//                       key is set, or when the AI call fails/parses wrong. The Monday
//                       run never turns red because an AI endpoint is down.
//
// Guardrails (enforced in code, not just the prompt):
//   * the model sees the facts object and nothing else — no captures, no free text
//   * its JSON is shape-validated; any violation falls back to deterministic
//   * methodology + limitations are OUR fixed strings, never model output
//   * demo rows produce a loudly-labelled demo report

import fs from "node:fs";
import path from "node:path";
import { aggregate, classify, THRESHOLDS } from "./signals.js";
import { supabaseRequest } from "./supabase-sync.js";

const METHODOLOGY = [
  "All numbers come from deterministic classification of captured observations (lib/signals.js): tenure from library start dates, variant counts from ad cards, active-ad counts from the card's advertiser-level figure with our captured-card count as the labelled fallback.",
  "Scale bands read active ad counts, never variant counts — variants are creatives, not ads.",
  "Interpretation is layered on top of those numbers; the AI layer, when enabled, receives only the computed facts and may not introduce advertisers, numbers or quotes.",
];

const LIMITATIONS = [
  "Signals are not proof: long-running ads can be losers on autopilot; variant counts can be formats, languages or placements rather than new hooks.",
  "Spend is not public outside political ads — nothing here estimates budgets.",
  "Kenyan commercial ads are not in Meta's Ad Library API; coverage is limited to what was actually captured from the public libraries this week.",
  "Delivery is scheduled, not guaranteed — collection depends on capture discipline and platform availability.",
];

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Build the deterministic facts object — the ONLY thing any interpretation
 * engine is allowed to see. Numbers first, no prose.
 */
export function collectFacts(records, watchlist, now = new Date()) {
  const real = records.filter((r) => !r.example);
  const demo = records.filter((r) => r.example);
  // Same rule as the digest: real captures take precedence; demo rows render
  // only when nothing real exists, loudly labelled.
  const useRows = real.length ? real : demo;
  const demoMode = real.length === 0 && useRows.length > 0;

  const agg = aggregate(useRows, now);
  const platforms = {};
  for (const r of useRows) platforms[r.platform] = (platforms[r.platform] || 0) + 1;

  const cutoff = new Date(now.getTime() - THRESHOLDS.NEW_DAYS * 86400000);
  const fresh = useRows.filter(
    (r) => r.first_seen_by_us && new Date(r.first_seen_by_us) >= cutoff,
  );
  const teardowns = useRows.filter((r) => r.landing_url);

  return {
    week: isoWeek(now),
    generated_at: now.toISOString(),
    demo_mode: demoMode,
    thresholds: {
      long_running_days: THRESHOLDS.PERSISTENCE_DAYS,
      variants_flag: THRESHOLDS.VARIANTS_FLAG,
      new_window_days: THRESHOLDS.NEW_DAYS,
    },
    pulse: {
      advertisers_observed: new Set(useRows.map((r) => r.advertiser)).size,
      records_captured: useRows.length,
      by_platform: platforms,
      watchlist_size: Array.isArray(watchlist) ? watchlist.length : 0,
    },
    advertisers: agg.map((a) => ({
      advertiser: a.advertiser,
      platform: a.platform,
      active_ads: a.activeAds,
      scale_basis: a.scaleBasis, // reported_active_ads | captured_cards
      variants: a.maxVersions,
      longest_live_days: a.maxTenure,
      running_since: a.oldestStart,
      band: a.band,
      signals: a.signals, // LONG_RUNNING | CREATIVE_EXPERIMENTATION
    })),
    new_this_week: fresh.map((r) => ({
      advertiser: r.advertiser,
      platform: r.platform,
      ad_start: r.ad_start || null,
      variants: r.active_versions ?? null,
      offer: (r.offer || "").slice(0, 120) || null,
    })),
    teardown_candidates: teardowns.map((r) => ({
      advertiser: r.advertiser,
      platform: r.platform,
      landing_url: r.landing_url,
      landing_headline: r.landing_headline || null,
      signals: classify(r, now).signals.map((s) => s.code),
    })),
  };
}

/** Honest template sentences from the facts — the no-AI interpreter. */
export function deterministicInterpretation(facts) {
  const executive = [];
  const strategic = [];
  const p = facts.pulse;

  if (p.records_captured === 0) {
    return {
      headline: "Nothing captured this week — the digest is honest about it",
      executive: [
        "No observations were captured, so this report carries no intelligence claims.",
      ],
      strategic: [
        "Ten minutes of browsing a public ad library and `fuatilia add` for each card seen is enough to make next week's report real.",
      ],
    };
  }

  executive.push(
    `${p.advertisers_observed} advertisers observed across ${p.records_captured} captured records (${Object.entries(p.by_platform).map(([k, v]) => `${k}: ${v}`).join(", ")}).`,
  );

  const longRunners = facts.advertisers.filter((a) =>
    a.signals.includes("LONG_RUNNING"),
  );
  if (longRunners.length) {
    executive.push(
      `${longRunners.length} advertiser${longRunners.length === 1 ? "" : "s"} kept creative live ${facts.thresholds.long_running_days}+ days (${longRunners
        .map((a) => `${a.advertiser} ${a.longest_live_days}d`)
        .join("; ")}) — persistence, not performance proof.`,
    );
  } else {
    executive.push(
      `No creative has crossed the ${facts.thresholds.long_running_days}-day persistence mark yet — the captured set is young.`,
    );
  }

  const experimenters = facts.advertisers.filter((a) =>
    a.signals.includes("CREATIVE_EXPERIMENTATION"),
  );
  if (experimenters.length) {
    executive.push(
      `${experimenters.length} advertiser${experimenters.length === 1 ? "" : "s"} ran ${facts.thresholds.variants_flag}+ variants of one ad (${experimenters
        .map((a) => `${a.advertiser}: ${a.variants}`)
        .join("; ")}) — active creative experimentation.`,
    );
  }

  if (facts.new_this_week.length) {
    executive.push(
      `${facts.new_this_week.length} capture${facts.new_this_week.length === 1 ? "" : "s"} new to us within ${facts.thresholds.new_window_days} days.`,
    );
  }

  for (const a of longRunners.slice(0, 3)) {
    strategic.push(
      `${a.advertiser} (${a.platform}): ${a.longest_live_days} days live, ${a.active_ads} active ads observed (${a.scale_basis === "reported_active_ads" ? "card-reported" : "captured-card basis"}). Teardown candidate — check what the landing page is doing that the ad promises.`,
    );
  }
  for (const a of experimenters.slice(0, 3)) {
    strategic.push(
      `${a.advertiser} (${a.platform}): ${a.variants} variants of one ad. Track concepts, not counts — group the variants by idea before reading a hook strategy.`,
    );
  }
  for (const n of facts.new_this_week.slice(0, 3)) {
    strategic.push(
      `${n.advertiser} (${n.platform}) is new to our capture${n.offer ? ` — offer on the card: "${n.offer}"` : ""}. Re-check next Monday; young ads say nothing yet.`,
    );
  }
  if (!strategic.length) {
    strategic.push(
      "Thin week — capture volume, not analysis, is the constraint. More cards in, sharper reads out.",
    );
  }

  return { headline: `Week ${facts.week}: ${p.advertisers_observed} advertisers on the public record`, executive, strategic };
}

const SYSTEM_PROMPT = `You are the interpretation layer of Fuatilia, a Kenyan advertising-intelligence service. You receive a JSON object of DETERMINISTICALLY COMPUTED facts about one week of captured public ad-library observations. Write the interpretation for a Kenyan agency strategist who pays for this.

Hard rules:
- Use ONLY the numbers, advertisers, offers and URLs present in the facts. Do not invent advertisers, counts, dates, spend figures or quotes.
- Signals are persistence/experimentation observations, NOT performance: never claim an ad is profitable or succeeding.
- Variant counts may be hooks, formats, languages, placements or audiences — say so when you lean on them.
- If demo_mode is true, say the report describes fictional demo rows.
- Plain, concrete prose for a paying strategist. No hype, no filler, no emoji. British/Kenyan English spelling.
- Return STRICT JSON only, no markdown fences:
  {"headline": string (<=120 chars), "executive": string[] (2-5 bullets, each a fact-grounded read), "strategic": string[] (2-5 bullets, each an actionable next step: teardown, concept tracking, watch list)}`;

/** Call an OpenAI-compatible chat endpoint. Returns parsed report or null. */
export async function aiInterpret(facts, env) {
  const key = env.FUATILIA_AI_API_KEY;
  if (!key) return null;
  const base = (env.FUATILIA_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env.FUATILIA_AI_MODEL || "gpt-4o-mini";
  const timeoutMs = Number(env.FUATILIA_AI_TIMEOUT_MS) || 60000;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`AI endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return { report: parseReportJSON(text), model };
  } finally {
    clearTimeout(timer);
  }
}

/** Robust strict-JSON extraction + shape validation. Throws on any violation. */
export function parseReportJSON(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) t = fence[1];
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object in AI output");
  const obj = JSON.parse(t.slice(start, end + 1));

  const asStrings = (v) =>
    (Array.isArray(v) ? v : [v]).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
  const executive = asStrings(obj.executive);
  const strategic = asStrings(obj.strategic);
  if (!executive.length) throw new Error("AI report has no executive bullets");
  return {
    headline: String(obj.headline || "").slice(0, 140) || "Weekly advertising intelligence brief",
    executive,
    strategic,
  };
}

/** Markdown rendering — the human-readable edition of the report. */
export function renderReportMarkdown(report, facts) {
  const lines = [];
  lines.push(`# Fuatilia weekly report — ${report.headline}`);
  lines.push("");
  lines.push(`Week ${facts.week} · generated ${facts.generated_at} · interpretation: ${report.interpretation}${report.model ? ` (${report.model})` : ""}`);
  lines.push("");
  if (facts.demo_mode) {
    lines.push(
      "> **Demo mode** — built from the fictional demo rows (`data/demo.jsonl`, `example: true`). This report demonstrates format only; it is not market intelligence.",
    );
    lines.push("");
  }
  lines.push("## Executive read");
  lines.push("");
  for (const b of report.executive) lines.push(`- ${b}`);
  lines.push("");
  lines.push("## Strategic observations");
  lines.push("");
  for (const b of report.strategic) lines.push(`- ${b}`);
  lines.push("");
  lines.push("## Methodology");
  lines.push("");
  for (const m of report.methodology) lines.push(`- ${m}`);
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const l of report.limitations) lines.push(`- ${l}`);
  lines.push("");
  lines.push("## Basis (deterministic facts)");
  lines.push("");
  lines.push(
    `| Advertiser | Platform | Active ads | Basis | Variants | Longest live | Band | Signals |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const a of facts.advertisers) {
    lines.push(
      `| ${a.advertiser} | ${a.platform} | ${a.active_ads} | ${a.scale_basis} | ${a.variants ?? "—"} | ${a.longest_live_days !== null ? `${a.longest_live_days}d` : "—"} | ${a.band || "—"} | ${a.signals.join("+") || "—"} |`,
    );
  }
  lines.push("");
  lines.push("_AI layer writes interpretation on top of deterministic signals, never instead of them. Method: docs/METHOD.md_");
  return lines.join("\n") + "\n";
}

/**
 * Build the weekly report: facts -> interpretation (AI when configured, with
 * deterministic fallback) -> files (+ optional Supabase reports row).
 *
 * @returns {{file: string, mdFile: string, interpretation: string, model: ?string,
 *            persisted: ?string, notes: string[]}}
 */
export async function writeReport(root, env = process.env, opts = {}) {
  const notes = [];
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const real = read(path.join(root, "data", "captures.jsonl"));
  const demo = read(path.join(root, "data", "demo.jsonl"));
  const watchlist = fs.existsSync(path.join(root, "watchlist.json"))
    ? JSON.parse(fs.readFileSync(path.join(root, "watchlist.json"), "utf8"))
    : [];
  const list = Array.isArray(watchlist) ? watchlist : watchlist.watchlist || [];

  const facts = collectFacts([...real, ...demo], list);

  let interpretation = "deterministic";
  let model = null;
  let body = null;

  if (env.FUATILIA_AI_API_KEY) {
    try {
      const ai = await aiInterpret(facts, env);
      if (ai?.report) {
        body = ai.report;
        interpretation = "ai";
        model = ai.model;
      }
    } catch (e) {
      notes.push(`AI interpretation failed (${String(e.message || e).slice(0, 200)}) — deterministic fallback used`);
    }
  } else {
    notes.push("no FUATILIA_AI_API_KEY — deterministic interpretation only");
  }
  if (!body) body = deterministicInterpretation(facts);

  const report = {
    week: facts.week,
    generated_at: facts.generated_at,
    interpretation,
    model,
    engine_note:
      "deterministic signals from lib/signals.js; the interpretation layer writes on top of those numbers, never instead of them",
    headline: body.headline,
    executive: body.executive,
    strategic: body.strategic,
    methodology: METHODOLOGY,
    limitations: LIMITATIONS,
    demo_mode: facts.demo_mode,
    facts,
  };

  // Persist to the platform reports table when configured. best-effort:
  // a Supabase outage degrades to files, it never blocks the Monday run.
  let persisted = null;
  const url = env.FUATILIA_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.FUATILIA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const briefId = opts.briefId || env.FUATILIA_REPORT_BRIEF_ID || "";
  if (url && key && briefId) {
    try {
      const periodEnd = facts.generated_at.slice(0, 10);
      const periodStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      const rows = await supabaseRequest(url, key, "reports", "POST", {
        brief_id: briefId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "final",
        headline: report.headline,
        summary: {
          advertisers: facts.pulse.advertisers_observed,
          observations: facts.pulse.records_captured,
          new_observations: facts.new_this_week.length,
          offer_changes: facts.new_this_week.filter((n) => n.offer).length,
        },
        content: {
          executive: report.executive,
          strategic: report.strategic,
          methodology: report.methodology,
          limitations: report.limitations,
        },
      });
      persisted = Array.isArray(rows) ? rows[0]?.id || null : rows?.id || null;
      if (persisted) report.supabase_id = persisted;
    } catch (e) {
      notes.push(`Supabase persist failed (${String(e.message || e).slice(0, 200)}) — report kept as files only`);
    }
  } else if (url && key && !briefId) {
    notes.push("no FUATILIA_REPORT_BRIEF_ID / --brief — report not persisted (reports.brief_id is required)");
  }

  const outDir = opts.outDir || path.join(root, "digests");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `report-${facts.week}.json`);
  const mdFile = path.join(outDir, `report-${facts.week}.md`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(mdFile, renderReportMarkdown(report, facts));

  return { file, mdFile, interpretation, model, persisted, notes };
}

/** Newest report JSON in digests/ (used by per-customer delivery). */
export function latestReport(root) {
  const dir = path.join(root, "digests");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("report-") && f.endsWith(".json"))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}
