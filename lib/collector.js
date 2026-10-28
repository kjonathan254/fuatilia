// Fuatilia collector — Meta Ad Library API (ads_archive) for the tiers the API covers:
// political/issue ads globally + all ads shown in the EU (DSA Art. 39).
//
// HONEST LIMIT (also stated in docs/METHOD.md): Kenyan *commercial* ads are NOT in the
// API — that tier stays human-capture (`fuatilia add`). This collector exists for users
// who also track issue campaigns or sell into the EU, and for researchers.
//
// Env: META_ACCESS_TOKEN (required) · FUATILIA_META_API_VERSION (default v21.0)
//
//   fuatilia collect [--terms "smart watch,led mask"] [--countries KE,DE] [--limit 100]
//
// With no token: friendly skip, exit 0 — the Monday Action must never break here.
// Records are de-duplicated on stable ids (meta_<ad id>) before appending.

import fs from "node:fs";
import path from "node:path";

const DEFAULT_VERSION = "v21.0";
const DEFAULT_COUNTRIES = "KE";
const DEFAULT_LIMIT = 100;

function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function readExistingIds(capturesPath) {
  if (!fs.existsSync(capturesPath)) return new Set();
  return new Set(
    fs
      .readFileSync(capturesPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l).id;
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );
}

/** Map one ads_archive record to a Fuatilia capture record. */
export function mapAd(ad, country) {
  const start = ad.ad_delivery_start_time
    ? String(ad.ad_delivery_start_time).slice(0, 10)
    : null;
  return {
    id: `meta_${ad.id}`,
    captured_at: todayISO(),
    advertiser: ad.page_name || `page ${ad.page_id}`,
    platform: "meta",
    country,
    page_id: ad.page_id ? String(ad.page_id) : null,
    ad_start: start,
    first_seen_by_us: todayISO(),
    active_versions: undefined, // API exposes one row per creative; versions read by grouping page+body
    creative_type: Array.isArray(ad.publisher_platforms)
      ? ad.publisher_platforms.includes("instagram")
        ? "image" // closest honest guess; API tier gives platforms, not media shape
        : "other"
      : undefined,
    offer: ad.body ? String(ad.body).slice(0, 160) : undefined,
    landing_url: ad.ad_creative_link_url || undefined,
    landing_headline: ad.ad_creative_link_title || undefined,
    library_url: `https://www.facebook.com/ads/library/?id=${ad.id}`,
    source: "meta_api",
    tags: ["collected"],
    notes: "via Meta Ad Library API (ads_archive)",
  };
}

async function fetchPage(version, token, term, country, limit) {
  const url =
    `https://graph.facebook.com/${version}/ads_archive?` +
    new URLSearchParams({
      access_token: token,
      search_terms: term,
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: "active",
      limit: String(limit),
      fields:
        "id,page_name,page_id,ad_delivery_start_time,ad_delivery_stop_time,body,ad_creative_link_url,ad_creative_link_title,publisher_platforms",
    }).toString();
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/**
 * Run the collector. Returns a plain summary object; never throws for API-tier
 * issues (prints honest reasons instead) so scheduled runs survive platform quirks.
 */
export async function collect(root, env = process.env, opts = {}) {
  const token = env.META_ACCESS_TOKEN;
  if (!token) {
    return {
      ok: true,
      skipped: [
        "META_ACCESS_TOKEN not set — collector skipped (this is fine)",
        "to enable the API tier (EU/issue ads), see docs/DELIVERY.md § meta-api",
      ],
    };
  }

  const version = env.FUATILIA_META_API_VERSION || DEFAULT_VERSION;
  const countries = String(opts.countries || env.FUATILIA_COLLECT_COUNTRIES || DEFAULT_COUNTRIES)
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const terms = String(
    opts.terms || env.FUATILIA_COLLECT_TERMS || "",
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const limit = Number(opts.limit || DEFAULT_LIMIT);

  // Terms fall back to the watchlist search seeds.
  let searchTerms = terms;
  if (!searchTerms.length) {
    try {
      const wl = JSON.parse(fs.readFileSync(path.join(root, "watchlist.json"), "utf8"));
      searchTerms = (wl.search_seeds || []).slice(0, 5);
    } catch {
      searchTerms = [];
    }
  }
  if (!searchTerms.length) {
    return {
      ok: true,
      skipped: ["no --terms given and watchlist.json has no search_seeds — nothing to collect"],
    };
  }

  const capturesPath = path.join(root, "data", "captures.jsonl");
  fs.mkdirSync(path.dirname(capturesPath), { recursive: true });
  const known = readExistingIds(capturesPath);

  let fetched = 0;
  let appended = 0;
  const notes = [];
  const lines = [];

  for (const country of countries) {
    for (const term of searchTerms) {
      const { status, json } = await fetchPage(version, token, term, country, limit);
      if (status !== 200) {
        const msg = json?.error?.message || `HTTP ${status}`;
        notes.push(`${term}/${country}: API said "${msg}"`);
        continue;
      }
      const ads = Array.isArray(json?.data) ? json.data : [];
      for (const ad of ads) {
        fetched++;
        const rec = mapAd(ad, country);
        if (known.has(rec.id)) continue;
        lines.push(JSON.stringify(rec));
        known.add(rec.id);
        appended++;
      }
      // Honest note when the tier returns nothing (expected outside EU/issue ads).
      if (ads.length === 0) {
        notes.push(`${term}/${country}: 0 ads from API tier (expected for non-EU commercial — that tier is human-capture)`);
      }
    }
  }

  if (lines.length) {
    fs.appendFileSync(capturesPath, lines.join("\n") + "\n");
  }

  return { ok: true, fetched, appended, notes, terms: searchTerms, countries };
}
