// Fuatilia signals engine — heuristics, never promises.
// Every classifier here is a directional read of public transparency data,
// and every function returns the caveat alongside the signal.
//
// v0.3 changes (post-audit, 2026-10-30):
//   * Scale bands now read ACTIVE AD COUNT (advertiser + platform level),
//     never creative-variant counts. A brand running 7 versions of ONE ad
//     is experimenting, not scaling. `active_ad_count` (reported on the ad
//     card) is the preferred input; the number of distinct captured cards
//     is the honest fallback. The basis is always reported alongside the band.
//   * "winner candidate" -> LONG_RUNNING (persistence signal). A 90-day ad
//     proves somebody kept it alive — profit, brand reach, retargeting,
//     grants or plain autopilot. Persistence, not proof of performance.
//   * "hook testing" -> CREATIVE_EXPERIMENTATION. Variants can be hooks,
//     formats, languages, placements or audiences. Counting variants does
//     not tell you which.

export const THRESHOLDS = {
  PERSISTENCE_DAYS: 90, // days live before an ad is a long-running-creative signal
  VARIANTS_FLAG: 3, // active variants of one ad before flagging creative experimentation
  NEW_DAYS: 7, // first_seen_by_us within this window = "new this week"
};

// Backwards-compatible alias (deprecated name kept so older imports keep working).
export const WINNER_DAYS = THRESHOLDS.PERSISTENCE_DAYS;
export const HOOK_VERSIONS = THRESHOLDS.VARIANTS_FLAG;

export const SCALE_BANDS = [
  {
    min: 30,
    band: "wide-footprint",
    read: "30+ active ads observed — large ongoing program; activity, not budget proof",
  },
  {
    min: 3,
    band: "consistent",
    read: "3–29 active ads observed — steady campaign activity",
  },
  {
    min: 1,
    band: "light",
    read: "1–2 active ads observed — small or early-stage activity",
  },
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
 * Resolve the active-ad count for a group of captured rows of ONE
 * advertiser+platform, plus an honest label of where that number came from.
 *
 * Priority:
 *   1. `active_ad_count` reported on the ad card (advertiser-level truth)
 *   2. number of distinct captured cards (our own observations)
 * NEVER the creative-variant count — versions are not ads.
 */
export function resolveActiveAds(rows) {
  const reported = Math.max(
    0,
    ...rows.map((r) => {
      const n = Number(r.active_ad_count);
      return Number.isFinite(n) ? n : 0;
    }),
  );
  if (reported > 0) {
    return { count: reported, basis: "reported_active_ads" };
  }
  return rows.length > 0
    ? { count: rows.length, basis: "captured_cards" }
    : { count: 0, basis: "unknown" };
}

/**
 * Classify one captured ad record.
 * Returns { tenure, signals: [{code, label, detail}], caveat }.
 */
export function classify(record, today = new Date()) {
  const tenure = tenureDays(record, today);
  const signals = [];

  if (tenure !== null && tenure >= THRESHOLDS.PERSISTENCE_DAYS) {
    signals.push({
      code: "LONG_RUNNING",
      label: `long-running creative (${tenure}d live)`,
      detail: `running ${tenure} days — persistence signal: could be profit, brand reach, retargeting, grants or autopilot. Verify before reading performance.`,
    });
  }

  const versions = Number(record.active_versions);
  if (Number.isFinite(versions) && versions >= THRESHOLDS.VARIANTS_FLAG) {
    signals.push({
      code: "CREATIVE_EXPERIMENTATION",
      label: `creative experimentation (${versions} variants)`,
      detail: `${versions} active variants of this ad — could be different hooks, or just formats, languages, placements or audiences. Concepts, not just counts, tell you which.`,
    });
  }

  if (tenure !== null && tenure < THRESHOLDS.PERSISTENCE_DAYS) {
    signals.push({
      code: "YOUNG",
      label: `young (${tenure}d)`,
      detail: "too early to read — re-check next week",
    });
  }

  return {
    tenure,
    signals,
    caveat:
      "signal, not proof — long-running ads can be losers on autopilot; variants can be formats, not hooks",
  };
}

/**
 * Aggregate captures into per-advertiser-platform reads.
 * Returns [{ advertiser, platform, ads, activeAds, scaleBasis, maxVersions,
 *            oldestStart, maxTenure, band, bandRead, signals }]
 * sorted by intelligence value (longest tenure first, then most variants).
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
    // THE FIX: scale comes from active ad count, never from variant counts.
    const { count: activeAds, basis: scaleBasis } = resolveActiveAds(rows);
    const band = scaleBand(activeAds);
    const signals = [];
    if (maxTenure !== null && maxTenure >= THRESHOLDS.PERSISTENCE_DAYS) {
      signals.push("LONG_RUNNING");
    }
    if (maxVersions >= THRESHOLDS.VARIANTS_FLAG) signals.push("CREATIVE_EXPERIMENTATION");

    const starts = rows.map((r) => r.ad_start).filter(Boolean).sort();
    out.push({
      advertiser,
      platform,
      ads: rows.length,
      activeAds,
      scaleBasis,
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
