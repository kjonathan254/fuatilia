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
    `Week of ${week} · generated ${now.toISOString()} · data: publicly observable ad-library captures`,
  );
  lines.push("");
  if (demoMode) {
    lines.push(
      `> ⚠️ **DEMO DATA — THE ADVERTISERS BELOW ARE FICTIONAL.** No real captures exist yet, so this sheet renders the demo rows shipped with the repo (\`example: true\`, now isolated in \`data/demo.jsonl\`). Do not cite or act on anything in this sheet. Browse a public ad library, run \`fuatilia add\`, and the next digest is built from your real records instead.`,
    );
    lines.push("");
  }

  const agg = aggregate(useRows, now);
  const advertisers = new Set(useRows.map((r) => r.advertiser)).size;
  const platforms = new Map();
  for (const r of useRows) platforms.set(r.platform, (platforms.get(r.platform) || 0) + 1);
  const capturedDates = useRows.map((r) => r.captured_at || r.first_seen_by_us).filter(Boolean).sort();
  const lastCapture = demoMode ? "none — demo rows only" : capturedDates[capturedDates.length - 1] || "—";

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
        ["Last verified capture", lastCapture],
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
  lines.push(
    `_Coverage honesty: this digest reflects only what was actually captured — publicly observable ads in the libraries we browsed. It is not a census of Kenyan advertising._`,
  );
  lines.push("");

  const longRunners = agg.filter((a) => a.signals.includes("LONG_RUNNING"));
  lines.push(`## Long-running creatives (live ${THRESHOLDS.PERSISTENCE_DAYS}+ days)`);
  lines.push("");
  lines.push(
    `_A 90-day-old ad is a **persistence signal**, not a performance verdict — brand campaigns, retargeting, grants and autopilot all keep ads alive._`,
  );
  lines.push("");
  if (longRunners.length === 0) {
    lines.push(
      `None yet. Either the niche is young, or capture volume is thin — browse the library for your watchlist and \`fuatilia add\` what you see.`,
    );
  } else {
    lines.push(
      table(
        ["Advertiser", "Platform", "Live", "Variants", "Scale (basis)"],
        longRunners.map((a) => [
          a.advertiser,
          a.platform,
          a.maxTenure !== null ? `${a.maxTenure}d` : "—",
          a.maxVersions || "—",
          a.band ? `${a.band} (${a.scaleBasis === "reported_active_ads" ? "reported active ads" : "captured cards"})` : "—",
        ]),
      ),
    );
  }
  lines.push("");

  const experimenters = agg.filter((a) => a.signals.includes("CREATIVE_EXPERIMENTATION"));
  lines.push(`## Creative experimentation (${THRESHOLDS.VARIANTS_FLAG}+ variants of one ad)`);
  lines.push("");
  lines.push(
    `_Multiple variants may mean hook testing — or just different aspect ratios, languages, placements or audiences. Track concepts, not just counts._`,
  );
  lines.push("");
  if (experimenters.length === 0) {
    lines.push(
      "No multi-variant advertisers captured this week. Multi-version cards are worth a look — go find them in the library.",
    );
  } else {
    lines.push(
      table(
        ["Advertiser", "Platform", "Variants", "Live", "Scale (basis)"],
        experimenters.map((a) => [
          a.advertiser,
          a.platform,
          a.maxVersions,
          a.maxTenure !== null ? `${a.maxTenure}d` : "—",
          a.band ? `${a.band} (${a.scaleBasis === "reported_active_ads" ? "reported active ads" : "captured cards"})` : "—",
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
        ["Advertiser", "Platform", "Ad start", "Variants", "Captured", "Offer"],
        fresh.map((r) => [
          r.advertiser,
          r.platform,
          r.ad_start || "—",
          r.active_versions || "—",
          r.captured_at || r.first_seen_by_us || "—",
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
          const when = r.captured_at || r.first_seen_by_us || "";
          return `- **${r.advertiser}** [${label}${when ? ` · captured ${when}` : ""}](${r.landing_url}) — ${
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
    "- Tenure, variants and bands are **signals, not proof**. Long-running ads can be losers on autopilot; grants fund ads that never need profit; variants can be formats, not new hooks.",
  );
  lines.push(
    "- Scale bands read **active-ad counts** (reported on the card, or our captured-card count as fallback — the basis is printed next to every band). They indicate activity, never budgets.",
  );
  lines.push(
    "- Spend is not public outside political ads. Anyone selling exact Kenyan spend numbers is guessing.",
  );
  lines.push(
    "- Kenyan commercial ads are **not** in Meta's public API tier — this digest is built from disciplined human capture of public library pages. That is a feature: it keeps the product inside platform terms.",
  );
  lines.push(
    "- Coverage is partial by design: only the libraries, advertisers and cards we actually browsed. Absence here ≠ absence in the market.",
  );
  lines.push(
    "- Copy structure, never words or assets. Structure is craft; words belong to whoever wrote them.",
  );
  lines.push("");
  if (demoMode) {
    lines.push(
      "⚠️ Reminder: **every advertiser above is fictional demo data.** The next real capture replaces this sheet.",
    );
    lines.push("");
  }

  lines.push(
    `_Next digest: scheduled Monday 09:00 Nairobi, while the repo stays active (GitHub pauses scheduled workflows after 60 idle days). Method: docs/METHOD.md · Schema: docs/SCHEMA.md_`,
  );

  return lines.join("\n") + "\n";
}
