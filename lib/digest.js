// Fuatilia digest renderer — turns captures.jsonl into the Monday Markdown sheet.
import { classify, aggregate, THRESHOLDS } from "./signals.js";

const PLATFORM_LABEL = { meta: "Meta (FB/IG)", google: "Google", tiktok: "TikTok" };

function pad(cell, width) {
  const s = String(cell ?? "—");
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function table(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "—").length), 3),
  );
  const head = "| " + headers.map((h, i) => pad(h, widths[i])).join(" | ") + " |";
  const sep = "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|";
  const body = rows
    .map((r) => "| " + r.map((c, i) => pad(c, widths[i])).join(" | ") + " |")
    .join("\n");
  return [head, sep, body].join("\n");
}

function dayISO(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Render the weekly digest.
 * @param {object[]} records parsed captures.jsonl (may include example:true demo rows)
 * @param {object[]} watchlist parsed watchlist.json entries
 * @param {Date} now
 */
export function renderDigest(records, watchlist, now = new Date()) {
  const week = dayISO(now);
  const real = records.filter((r) => !r.example);
  const demoRows = records.filter((r) => r.example);
  // Demo mode: with no real captures yet, render the fictional rows (clearly labelled)
  // so visitors see the shape of a live digest. Real captures always take precedence.
  const useRows = real.length ? real : demoRows;
  const demoMode = real.length === 0 && useRows.length > 0;
  const lines = [];

  lines.push(`# AdWatch — Fuatilia weekly digest`);
  lines.push("");
  lines.push(
    `Week of ${week} · generated ${now.toISOString()} · data: public ad libraries, human capture`,
  );
  lines.push("");
  if (demoMode) {
    lines.push(
      `> **Demo mode** — no real captures yet, so this sheet shows the fictional demo rows shipped with the repo (\`example: true\`). Browse a public ad library and run \`fuatilia add\` — the next digest is built from your real records instead.`,
    );
    lines.push("");
  }

  const agg = aggregate(useRows, now);
  const advertisers = new Set(useRows.map((r) => r.advertiser)).size;
  const platforms = new Map();
  for (const r of useRows) platforms.set(r.platform, (platforms.get(r.platform) || 0) + 1);

  lines.push("## Pulse");
  lines.push("");
  lines.push(
    table(
      ["Metric", "Value"],
      [
        ["Advertisers captured", advertisers],
        ["Ad records captured", useRows.length],
        ...[...platforms.entries()].map(
          ([p, n]) => [PLATFORM_LABEL[p] || p, n],
        ),
        ["Watchlist size", watchlist.length],
        [
          "Watchlist captured",
          watchlist.filter((w) =>
            useRows.some(
              (r) =>
                r.advertiser.toLowerCase() ===
                String(w.advertiser || w).toLowerCase(),
            ),
          ).length,
        ],
      ],
    ),
  );
  lines.push("");

  const winners = agg.filter((a) => a.signals.includes("LONG_RUNNING"));
  lines.push(`## Long-running creatives (live ${THRESHOLDS.WINNER_DAYS}+ days)`);
  lines.push("");
  if (winners.length === 0) {
    lines.push(
      `None yet. Either the niche is young, or capture volume is thin — browse the library for your watchlist and \`fuatilia add\` what you see.`,
    );
  } else {
    lines.push(
      table(
        ["Advertiser", "Platform", "Live", "Variants", "Active ads", "Band"],
        winners.map((a) => [
          a.advertiser,
          a.platform,
          a.maxTenure !== null ? `${a.maxTenure}d` : "—",
          a.maxVersions || "—",
          a.activeAdCount ?? "—",
          a.band || "—",
        ]),
      ),
    );
  }
  lines.push("");

  const hooks = agg.filter((a) => a.signals.includes("CREATIVE_EXPERIMENT"));
  lines.push(`## Creative experimentation (${THRESHOLDS.HOOK_VERSIONS}+ active variants)`);
  lines.push("");
  if (hooks.length === 0) {
    lines.push(
      "No multi-variant advertisers captured this week. Multi-variant advertisers are iterating right now — go find them.",
    );
  } else {
    lines.push(
      table(
        ["Advertiser", "Platform", "Variants", "Live", "Active ads", "Band"],
        hooks.map((a) => [
          a.advertiser,
          a.platform,
          a.maxVersions,
          a.maxTenure !== null ? `${a.maxTenure}d` : "—",
          a.activeAdCount ?? "—",
          a.band || "—",
        ]),
      ),
    );
  }
  lines.push("");

  const cutoff = new Date(now.getTime() - THRESHOLDS.NEW_DAYS * 86400000);
  const fresh = useRows.filter(
    (r) => r.first_seen_by_us && new Date(r.first_seen_by_us) >= cutoff,
  );
  lines.push(`## New this week (first seen within ${THRESHOLDS.NEW_DAYS} days)`);
  lines.push("");
  if (fresh.length === 0) {
    lines.push("Nothing new captured. Ten minutes of library browsing fixes that.");
  } else {
    lines.push(
      table(
        ["Advertiser", "Platform", "Start", "Versions", "Offer"],
        fresh.map((r) => [
          r.advertiser,
          r.platform,
          r.ad_start || "—",
          r.active_versions || "—",
          (r.offer || "").slice(0, 60) || "—",
        ]),
      ),
    );
  }
  lines.push("");

  const teardowns = useRows.filter((r) => r.landing_url);
  lines.push("## Landing pages worth a teardown");
  lines.push("");
  if (teardowns.length === 0) {
    lines.push(
      "No landing URLs captured yet. The ad gets attention; the page gets the money — capture where the button goes.",
    );
  } else {
    lines.push(
      teardowns
        .map((r) => {
          const c = classify(r, now);
          const label = c.signals.map((s) => s.code).join("+") || "AD";
          return `- **${r.advertiser}** [${label}](${r.landing_url}) — ${
            r.landing_headline || "headline not captured"
          }`;
        })
        .join("\n"),
    );
  }
  lines.push("");

  lines.push("## Reads and caveats");
  lines.push("");
  lines.push(
    "- Tenure, variants and bands are **signals, not proof** — agencies leave losers on autopilot; grants fund ads that never need profit.",
  );
  lines.push(
    "- A long-running ad is a **persistence** signal, not a profit proof. Variants are not always hooks — they can be aspect ratios, languages or placements.",
  );
  lines.push(
    "- Scale bands come from the advertiser's **own total active-ad count** as shown on the library page (`active_ad_count`) — never inferred from version counts or rows captured.",
  );
  lines.push(
    "- Spend is not public outside political ads. Anyone selling exact Kenyan spend numbers is guessing.",
  );
  lines.push(
    "- Kenya commercial ads are **not** in Meta's API — this digest is built from disciplined human capture of public library pages. That is a feature: it keeps the product inside platform terms.",
  );
  lines.push(
    "- Copy structure, never words or assets. Structure is craft; words belong to whoever wrote them.",
  );
  lines.push("");

  lines.push(
    `_Next digest: Monday 09:00 Nairobi. Method: docs/METHOD.md · Schema: docs/SCHEMA.md_`,
  );

  return lines.join("\n") + "\n";
}
