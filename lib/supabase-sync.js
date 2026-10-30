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
//
// Brief linkage: the portal is customer-scoped — an observation is visible to
// a customer only through the brief it was collected for. Push with
// `--brief <uuid>` (or FUATILIA_BRIEF_ID) to attach rows to a brief; those
// pushes upsert on dedupe_key, so re-pushing the same evidence links rows
// that were stored unlinked earlier. Unlinked rows are stored but stay
// pipeline-only until a linked push claims them.

const SUPABASE_TABLE = "observations";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveBriefId(env, opts = {}) {
  const raw = opts.briefId || env.FUATILIA_BRIEF_ID || env.SUPABASE_BRIEF_ID || "";
  const brief = String(raw).trim();
  if (brief && !UUID_RE.test(brief)) {
    throw new Error(`brief must be a UUID (got "${brief}") — copy it from the portal brief URL`);
  }
  return brief || null;
}

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

function toObservation(r, briefId) {
  return {
    brief_id: briefId,
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

async function rest(url, key, table, method, body, query = "", prefer) {
  const res = await fetch(`${url}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: prefer || (body ? "return=representation" : "return=minimal"),
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
  const briefId = resolveBriefId(env, opts); // throws on a malformed uuid

  if (!url || !key) {
    return {
      skipped: ["push (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable)"],
      notes,
    };
  }
  if (briefId) notes.push(`linking evidence to brief ${briefId}`);
  else
    notes.push(
      "no brief linkage — rows are stored but stay pipeline-only until a --brief push claims them",
    );

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
    const rows = real.map((r) => toObservation(r, briefId));
    // A linked push upserts (merge-duplicates) so re-pushing evidence that was
    // stored unlinked earlier now claims it for the brief. An unlinked push
    // keeps plain on-conflict-do-nothing: it never overwrites a linked row.
    const inserted = await rest(
      url,
      key,
      SUPABASE_TABLE,
      "POST",
      rows,
      "?on_conflict=dedupe_key",
      briefId ? "return=representation,resolution=merge-duplicates" : undefined,
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
