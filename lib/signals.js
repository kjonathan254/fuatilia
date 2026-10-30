// Fuatilia signals engine — heuristics, never promises.
// Every classifier here is a directional read of public transparency data,
// and every function returns the caveat alongside the signal.
//
// Wording contract (v0.4): we flag *persistence* and *experimentation*, never
// profit or intent. A 90-day ad is a "long-running creative", not a "winner";
// 3+ variants is "creative experimentation", not "hook testing" — variants can
// be aspect ratios, languages or placements as easily as new hooks.

export const THRESHOLDS = {
  WINNER_DAYS: 90, // days live before an ad is flagged "long-running creative"
  HOOK_VERSIONS: 3, // active variants of one concept before we flag "creative experimentation"
  NEW_DAYS: 7, // first_seen_by_us within this window = "new this week"
};

export const SCALE_BANDS = [
  { min: 30, band: "team-scale", read: "agency or in-house team; heavy monthly budget" },
  { min: 3, band: "scaling", read: "real media budget, someone watching the numbers" },
  { min: 1, band: "solo/testing", read: "one person with a card and hope" },
];

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(fromISO, toDate = new Date()) {
  const from = parseDate(fromISO);
  if (!from) return null;
  return Math.max(0, Math.floor((toDate.getTime() - from.getTime()) / 86400000));
}

/** Tenure of an ad in days: from its library start date, falling back to first_seen_by_us. */
export function tenureDays(record, today = new Date()) {
  const from = record.ad_start || record.first_seen_by_us;
  const days = daysBetween(from, today);
  return days === null ? null : days;
}

export function scaleBand(activeCount) {
  if (!Number.isFinite(activeCount) || activeCount < 1) return null;
  return SCALE_BANDS.find((b) => activeCount >= b.min) || null;
}

/**
 * The advertiser+platform-level active-ad count for a group of captured rows.
 * Only trusts the explicitly captured `active_ad_count` field (the total the
 * library itself shows on the advertiser page). Never derives a count from
 * version numbers or from how many rows happened to be saved.
 */
export function activeAdCount(rows) {
  const counts = (rows || [])
    .map((r) => Number(r.active_ad_count))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return counts.length ? Math.max(...counts) : null;
}

/**
 * Classify one captured ad record.
 * Returns { tenure, signals: [{code, label, detail}], caveat }.
 */
export function classify(record, today = new Date()) {
  const tenure = tenureDays(record, today);
  const signals = [];

  if (tenure !== null && tenure >= THRESHOLDS.WINNER_DAYS) {
    signals.push({
      code: "LONG_RUNNING",
      label: `long-running creative (${tenure}d live)`,
      detail: `running ${tenure} days — a persistence signal: someone keeps renewing the budget (not proof it is profitable)`,
    });
  }

  const versions = Number(record.active_versions);
  if (Number.isFinite(versions) && versions >= THRESHOLDS.HOOK_VERSIONS) {
    signals.push({
      code: "CREATIVE_EXPERIMENT",
      label: `creative experimentation (${versions} variants)`,
      detail: `${versions} active variants of this concept — could be new hooks, or just aspect ratios, languages or placements. Watch which survive`,
    });
  }

  if (tenure !== null && tenure < THRESHOLDS.WINNER_DAYS) {
    signals.push({
      code: "YOUNG",
      label: `young (${tenure}d)`,
      detail: "too early to read — re-check next week",
    });
  }

  return {
    tenure,
    signals,
    caveat: "signal, not proof — agencies leave losers on autopilot too",
  };
}

/**
 * Aggregate captures into per-advertiser reads.
 * Returns [{ advertiser, platform, ads, activeAdCount, maxVersions, oldestStart,
 * maxTenure, band, bandRead, signals }] sorted by intelligence value
 * (longest tenure first, then most variants).
 *
 * The scale band comes ONLY from `active_ad_count` (the advertiser+platform-level
 * total the library displays). No count captured → band is null with a read that
 * says so. Version counts and captured-row counts are never substitutes.
 */
export function aggregate(records, today = new Date()) {
  const byAdvertiser = new Map();
  for (const r of records) {
    // NOTE: caller decides which rows to pass (real vs demo) — aggregate stays pure.
    const key = `${r.advertiser}::${r.platform}`;
    if (!byAdvertiser.has(key)) byAdvertiser.set(key, []);
    byAdvertiser.get(key).push(r);
  }

  const out = [];
  for (const [key, rows] of byAdvertiser) {
    const [advertiser, platform] = key.split("::");
    const tenures = rows.map((r) => tenureDays(r, today)).filter((t) => t !== null);
    const maxTenure = tenures.length ? Math.max(...tenures) : null;
    const maxVersions = Math.max(
      0,
      ...rows.map((r) => Number(r.active_versions) || 0),
    );
    const adCount = activeAdCount(rows);
    const band = scaleBand(adCount);
    const signals = [];
    if (maxTenure !== null && maxTenure >= THRESHOLDS.WINNER_DAYS) {
      signals.push("LONG_RUNNING");
    }
    if (maxVersions >= THRESHOLDS.HOOK_VERSIONS) signals.push("CREATIVE_EXPERIMENT");

    const starts = rows.map((r) => r.ad_start).filter(Boolean).sort();
    out.push({
      advertiser,
      platform,
      ads: rows.length,
      activeAdCount: adCount,
      maxVersions,
      oldestStart: starts[0] || null,
      maxTenure,
      band: band ? band.band : null,
      bandRead: band
        ? band.read
        : "unknown — capture the advertiser's total active-ad count from the library page",
      signals,
    });
  }

  return out.sort((a, b) => {
    const ta = a.maxTenure ?? -1;
    const tb = b.maxTenure ?? -1;
    if (tb !== ta) return tb - ta;
    return b.maxVersions - a.maxVersions;
  });
}
