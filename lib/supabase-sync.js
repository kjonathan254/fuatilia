// Fuatilia → Supabase sync. Bridges the local intelligence engine
// (data/captures.jsonl) into the automation platform's observations table.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
//
// Secrets: reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or
// FUATILIA_SUPABASE_*) from the environment — NEVER from files in the repo.
// The service_role key bypasses RLS and must only live in CI secrets /
// your shell env, never in git.
//
// Idempotent: every row carries a dedupe_key (sha1 of the observation's
// identity), so re-pushing the same captures never duplicates evidence.

const SUPABASE_TABLE = "observations";

function dedupeKey(r) {
  const identity = [
    r.advertiser,
    r.platform,
    r.captured_at,
    r.ad_start || "",
    r.offer || "",
    r.landing_url || "",
    r.library_url || "",
  ].join("|");
  return crypto.createHash("sha1").update(identity).digest("hex");
}

function toObservation(r) {
  return {
    advertiser: r.advertiser,
    platform: r.platform,
    country: r.country || "KE",
    page_id: r.page_id || null,
    ad_start: r.ad_start || null,
    first_seen_by_us: r.first_seen_by_us || null,
    active_versions: r.active_versions ?? null,
    active_ad_count: r.active_ad_count ?? null,
    capture_method: r.capture_method || "manual",
    concept_id: r.concept_id || null,
    creative_type: r.creative_type || null,
    offer: r.offer || null,
    landing_url: r.landing_url || null,
    landing_headline: r.landing_headline || null,
    library_url: r.library_url || null,
    source: r.source || "manual_capture",
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes || null,
    captured_at: r.captured_at,
    dedupe_key: dedupeKey(r),
  };
}

async function rest(url, key, table, method, body, query = "") {
  const res = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: body ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.message || parsed.error_description || parsed.error || text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`${method} ${table} → HTTP ${res.status}: ${msg}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Push real captures into the Supabase platform.
 * @returns {{skipped: string[], pushed?: number, notes: string[]}}
 */
export async function pushCaptures(ROOT, env, opts = {}) {
  const notes = [];
  const url = env.FUATILIA_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.FUATILIA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      skipped: ["push (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable)"],
      notes,
    };
  }

  const CAPTURES = path.join(ROOT, "data", "captures.jsonl");
  const records = fs.existsSync(CAPTURES)
    ? fs
        .readFileSync(CAPTURES, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  const real = records.filter((r) => !r.example);
  if (!real.length) {
    return { skipped: ["push (no real captures — demo rows never leave the CLI)"], notes };
  }

  const startedAt = new Date().toISOString();
  let runId = null;
  try {
    // Heartbeat: the pipeline run is visible even if the push fails.
    const runs = await rest(url, key, "collection_runs", "POST", {
      source: opts.source || "manual_capture",
      status: "running",
      started_at: startedAt,
    });
    runId = Array.isArray(runs) ? runs[0]?.id : runs?.id;
  } catch (e) {
    notes.push(`collection_run start failed: ${e.message}`);
  }

  try {
    const rows = real.map(toObservation);
    const inserted = await rest(
      url,
      key,
      SUPABASE_TABLE,
      "POST",
      rows,
      "?on_conflict=dedupe_key",
    );
    // Update the heartbeat (best effort).
    if (runId) {
      try {
        await rest(url, key, "collection_runs", "PATCH", {
          status: "ok",
          finished_at: new Date().toISOString(),
          records_fetched: real.length,
          records_appended: Array.isArray(inserted) ? inserted.length : rows.length,
        }, `?id=eq.${runId}`);
      } catch (e) {
        notes.push(`collection_run close failed: ${e.message}`);
      }
    }
    return { skipped: [], pushed: Array.isArray(inserted) ? inserted.length : rows.length, notes };
  } catch (e) {
    if (runId) {
      try {
        await rest(url, key, "collection_runs", "PATCH", {
          status: "failed",
          finished_at: new Date().toISOString(),
          error: String(e.message).slice(0, 500),
        }, `?id=eq.${runId}`);
      } catch {
        /* already reported */
      }
    }
    e.collectionRunFailed = true;
    throw e;
  }
}
