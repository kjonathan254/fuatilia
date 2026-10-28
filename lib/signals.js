// Fuatilia signals engine — heuristics, never promises.
// Every classifier here is a directional read of public transparency data,
// and every function returns the caveat alongside the signal.

export const THRESHOLDS = {
  WINNER_DAYS: 90, // days live before an ad is a "winner candidate"
  HOOK_VERSIONS: 3, // active variants before an advertiser is "hook testing"
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
 * Classify one captured ad record.
 * Returns { tenure, signals: [{code, label, detail}], caveat }.
 */
export function classify(record, today = new Date()) {
  const tenure = tenureDays(record, today);
  const signals = [];

  if (tenure !== null && tenure >= THRESHOLDS.WINNER_DAYS) {
    signals.push({
      code: "WINNER_CANDIDATE",
      label: `winner candidate (${tenure}d live)`,
      detail: `running ${tenure} days — nobody funds an ad a quarter without a reason`,
    });
  }

  const versions = Number(record.active_versions);
  if (Number.isFinite(versions) && versions >= THRESHOLDS.HOOK_VERSIONS) {
    signals.push({
      code: "HOOK_TESTING",
      label: `hook testing (${versions} versions)`,
      detail: `${versions} active variants — they are A/B-ing the opening right now`,
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
 * Returns [{ advertiser, platforms, ads, maxVersions, oldestStart, maxTenure, band, signals }]
 * sorted by intelligence value (longest tenure first, then most versions).
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
    const band = scaleBand(maxVersions || rows.length);
    const signals = [];
    if (maxTenure !== null && maxTenure >= THRESHOLDS.WINNER_DAYS) {
      signals.push("WINNER_CANDIDATE");
    }
    if (maxVersions >= THRESHOLDS.HOOK_VERSIONS) signals.push("HOOK_TESTING");

    const starts = rows.map((r) => r.ad_start).filter(Boolean).sort();
    out.push({
      advertiser,
      platform,
      ads: rows.length,
      maxVersions,
      oldestStart: starts[0] || null,
      maxTenure,
      band: band ? band.band : null,
      bandRead: band ? band.read : null,
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
