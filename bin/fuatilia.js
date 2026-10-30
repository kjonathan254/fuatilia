#!/usr/bin/env node
// Fuatilia — the open ad-intelligence toolkit for Kenya.
// Zero dependencies. Node >= 18.
//
//   fuatilia init              scaffold watchlist + data dir
//   fuatilia add [flags]       capture one ad card from a public ad library
//   fuatilia check             validate captures against the schema
//   fuatilia score             classify every captured ad, printed as a table
//   fuatilia digest [--out D]  render the weekly markdown digest
//   fuatilia snapshot          write snapshots/<week>.json — the weekly history
//   fuatilia deliver [--digest F]  send the latest digest: Telegram / WhatsApp /
//                                  webhook — skips channels with no secrets set
//   fuatilia collect [--terms T] [--countries KE,DE] [--limit N]
//                                  pull the Meta Ad Library API tier (EU/issue ads);
//                                  skips when META_ACCESS_TOKEN is not set
//
// Data files: data/captures.jsonl = real captures only. data/demo.jsonl = the
// fictional demo rows (example:true), kept out of the production store.
//
// Method: docs/METHOD.md · Schema: docs/SCHEMA.md · License: MIT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, aggregate, scaleBand, resolveActiveAds } from "../lib/signals.js";
import { renderDigest } from "../lib/digest.js";
import { deliver } from "../lib/deliver.js";
import { collect } from "../lib/collector.js";

const VERSION = "0.3.0";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const CAPTURES = path.join(DATA_DIR, "captures.jsonl");
const DEMO = path.join(DATA_DIR, "demo.jsonl");
const WATCHLIST = path.join(ROOT, "watchlist.json");
const DIGESTS = path.join(ROOT, "digests");
const SNAPSHOTS = path.join(ROOT, "snapshots");

const PLATFORMS = new Set(["meta", "google", "tiktok"]);
const COUNTRIES = /^[A-Z]{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const HELP = `
Fuatilia v${VERSION} — know what Kenya is advertising (the publicly observable part).

  fuatilia init                      scaffold watchlist.json + data/
  fuatilia add --advertiser NAME --platform meta|google|tiktok --country KE
               [--start YYYY-MM-DD] [--versions N] [--ads N] [--concept ID]
               [--type video|image|carousel|search]
               [--offer "..."] [--landing URL] [--headline "..."] [--library URL]
               [--page-id ID] [--tags a,b] [--notes "..."]
               [--example]          capture one ad card.
                                    --versions = variants of THIS ad.
                                    --ads = total active ads visible for this
                                    advertiser+platform (feeds scale bands).
                                    --concept groups variants of one creative idea.
                                    --example files the row under data/demo.jsonl.
  fuatilia check                     validate data/captures.jsonl (+ demo.jsonl)
  fuatilia score                     print all captures with tenure + signals + scale
  fuatilia digest [--out DIR]        render the weekly digest (default: digests/)
  fuatilia snapshot                  write snapshots/<week>.json (weekly history)

Signals are heuristics, not proof. Long-running != profitable; variants != new hooks.
Method: docs/METHOD.md
`;

function die(msg, code = 1) {
  console.error(`fuatilia: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { args, positional };
}

function readCaptures() {
  if (!fs.existsSync(CAPTURES)) return [];
  return parseJSONL(CAPTURES, "captures.jsonl");
}

function readDemoCaptures() {
  if (!fs.existsSync(DEMO)) return [];
  return parseJSONL(DEMO, "demo.jsonl");
}

function parseJSONL(file, label) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        die(`${label} line ${i + 1} is not valid JSON`, 2);
      }
    });
}

function readWatchlist() {
  if (!fs.existsSync(WATCHLIST)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(WATCHLIST, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.watchlist || [];
  } catch {
    die("watchlist.json is not valid JSON", 2);
  }
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function todayISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// ---------- commands ----------

function cmdInit() {
  let created = [];
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    created.push("data/");
  }
  if (!fs.existsSync(CAPTURES)) {
    fs.writeFileSync(CAPTURES, "");
    created.push("data/captures.jsonl");
  }
  if (!fs.existsSync(WATCHLIST)) {
    fs.writeFileSync(
      WATCHLIST,
      JSON.stringify(
        {
          country: "KE",
          updated: todayISO(),
          watchlist: [
            {
              advertiser: "Safaricom",
              category: "telco",
              platforms: ["meta", "google"],
              page_id: null,
              how_to_find:
                "Meta Ad Library → search 'Safaricom' → open the advertiser page → paste its page_id here",
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );
    created.push("watchlist.json");
  }
  console.log(
    created.length
      ? `scaffolded: ${created.join(", ")}`
      : "already initialized — nothing to do",
  );
}

function validateRecord(r) {
  const errs = [];
  if (!r.advertiser) errs.push("advertiser is required");
  if (!PLATFORMS.has(r.platform))
    errs.push(`platform must be one of ${[...PLATFORMS].join("|")}`);
  if (!COUNTRIES.test(r.country || "")) errs.push("country must be a 2-letter code (e.g. KE)");
  if (r.ad_start && !DATE.test(r.ad_start))
    errs.push("ad_start must be YYYY-MM-DD");
  if (r.first_seen_by_us && !DATE.test(r.first_seen_by_us))
    errs.push("first_seen_by_us must be YYYY-MM-DD");
  if (
    r.active_versions !== undefined &&
    !(Number.isFinite(Number(r.active_versions)) && Number(r.active_versions) >= 0)
  )
    errs.push("active_versions must be a number");
  if (
    r.active_ad_count !== undefined &&
    !(Number.isFinite(Number(r.active_ad_count)) && Number(r.active_ad_count) >= 0)
  )
    errs.push("active_ad_count must be a number >= 0");
  if (r.concept_id !== undefined && r.concept_id !== null && typeof r.concept_id !== "string")
    errs.push("concept_id must be a string");
  if (r.landing_url && !/^https?:\/\//.test(r.landing_url))
    errs.push("landing_url must be an http(s) URL");
  if (r.library_url && !/^https?:\/\//.test(r.library_url))
    errs.push("library_url must be an http(s) URL");
  return errs;
}

function cmdAdd(args) {
  if (args.help) return console.log(HELP);
  const record = {
    id: [
      slugify(args.advertiser || "unknown"),
      args.platform || "meta",
      todayISO(),
      Math.random().toString(36).slice(2, 6),
    ].join("_"),
    captured_at: todayISO(),
    advertiser: args.advertiser,
    platform: args.platform,
    country: (args.country || "KE").toUpperCase(),
    page_id: args["page-id"] || null,
    ad_start: args.start || null,
    first_seen_by_us: todayISO(),
    active_versions: args.versions !== undefined ? Number(args.versions) : undefined,
    active_ad_count: args.ads !== undefined ? Number(args.ads) : undefined,
    concept_id: args.concept || undefined,
    creative_type: args.type || undefined,
    offer: args.offer || undefined,
    landing_url: args.landing || undefined,
    landing_headline: args.headline || undefined,
    library_url: args.library || undefined,
    source: args.source || "manual_capture",
    tags: args.tags
      ? String(args.tags).split(",").map((t) => t.trim()).filter(Boolean)
      : [],
    example: args.example ? true : undefined,
    notes: args.notes || undefined,
  };

  const errs = validateRecord(record);
  if (errs.length) die(errs.map((e) => `-- ${e}`).join("\n"));
  if (!record.advertiser)
    die("--advertiser is required. Example:\n  fuatilia add --advertiser Zuku --platform meta --country KE --start 2026-09-01 --versions 4");

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = args.example ? DEMO : CAPTURES;
  fs.appendFileSync(target, JSON.stringify(record) + "\n");
  const c = classify(record);
  console.log(
    `captured: ${record.advertiser} (${record.platform}/${record.country}) → ${path.relative(ROOT, target)}`,
  );
  console.log(`  id: ${record.id}`);
  console.log(
    `  signals: ${c.signals.length ? c.signals.map((s) => s.label).join("; ") : "none yet"}`
  );
  console.log(`  caveat: ${c.caveat}`);
}

function cmdCheck() {
  const records = readCaptures();
  const demo = readDemoCaptures();
  if (!records.length && !demo.length) {
    console.log("no captures yet — run `fuatilia add` after browsing the library");
    return;
  }
  let bad = 0;
  const checkRows = (rows, label) => {
    rows.forEach((r, i) => {
      const errs = validateRecord(r);
      if (errs.length) {
        bad++;
        console.error(`${label} line ${i + 1} (${r.advertiser || "?"}):`);
        errs.forEach((e) => console.error(`  -- ${e}`));
      }
    });
  };
  checkRows(records, "captures.jsonl");
  checkRows(demo, "demo.jsonl");
  const total = records.length + demo.length;
  console.log(
    bad
      ? `${total - bad}/${total} records valid (${bad} with errors)`
      : `all ${total} records valid (captures: ${records.length}, demo: ${demo.length})`,
  );
  if (bad) process.exit(2);
}

function cmdScore() {
  const records = readCaptures();
  const real = records.filter((r) => !r.example);
  const shown = real.length ? real : readDemoCaptures();
  if (!shown.length) {
    console.log("no captures yet");
    return;
  }
  if (!real.length && shown.length)
    console.log("(showing demo rows — no real captures yet)\n");

  // Group by advertiser+platform so scale bands use the ADVERTISER-level
  // active-ad count, never this row's variant count.
  const groups = new Map();
  for (const r of shown) {
    const k = `${r.advertiser}::${r.platform}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const rows = shown.map((r) => {
    const c = classify(r);
    const { count, basis } = resolveActiveAds(
      groups.get(`${r.advertiser}::${r.platform}`) || [r],
    );
    const band = scaleBand(count);
    return [
      r.advertiser,
      r.platform,
      c.tenure !== null ? `${c.tenure}d` : "—",
      String(r.active_versions ?? "—"),
      `${count}${basis === "reported_active_ads" ? "*" : "†"}`,
      c.signals.map((s) => s.code).join("+") || "—",
      band ? band.band : "—",
    ];
  });
  const headers = [
    "advertiser",
    "platform",
    "tenure",
    "variants",
    "activeAds",
    "signals",
    "scale",
  ];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length), 3),
  );
  const line = (cells) =>
    "| " + cells.map((c, i) => (c + " ".repeat(widths[i])).slice(0, widths[i])).join(" | ") + " |";
  console.log(line(headers));
  console.log("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|");
  rows.forEach((r) => console.log(line(r)));
  console.log("");
  console.log(
    "* = active_ad_count reported on the ad card   † = captured-card count (fallback)",
  );
  console.log(
    "Variant counts never drive scale bands. Long-running = persistence signal, not performance.",
  );
}

function cmdDigest(args) {
  let records = readCaptures();
  if (!records.length) records = readDemoCaptures(); // renderer labels demo mode
  const watchlist = readWatchlist();
  const now = new Date();
  const md = renderDigest(records, watchlist, now);
  const outDir = args.out || DIGESTS;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `adwatch-${todayISO(now)}.md`);
  fs.writeFileSync(file, md);
  console.log(`digest written: ${path.relative(ROOT, file)}`);
  const real = readCaptures().filter((r) => !r.example).length;
  if (!real) {
    console.log(
      "\nwarning: DEMO DATA ONLY (fictional advertisers, data/demo.jsonl) — capture real ads with `fuatilia add` for a live digest",
    );
  }
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function cmdSnapshot() {
  const records = readCaptures().filter((r) => !r.example);
  const now = new Date();
  const week = isoWeek(now);
  const agg = aggregate(records, now);
  const snap = {
    week,
    generated_at: now.toISOString(),
    note:
      "weekly aggregate of captured observations only — demo rows excluded; activity signals, not spend",
    totals: {
      advertisers: new Set(records.map((r) => r.advertiser)).size,
      records: records.length,
      platforms: Object.fromEntries(
        [...new Set(records.map((r) => r.platform))].map((p) => [
          p,
          records.filter((r) => r.platform === p).length,
        ]),
      ),
    },
    advertisers: agg.map((a) => ({
      advertiser: a.advertiser,
      platform: a.platform,
      active_ads: a.activeAds,
      scale_basis: a.scaleBasis,
      variants: a.maxVersions,
      max_tenure_days: a.maxTenure,
      signals: a.signals,
    })),
  };

  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const prevFiles = fs
    .readdirSync(SNAPSHOTS)
    .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
    .sort();
  const prevPath =
    prevFiles.length ? path.join(SNAPSHOTS, prevFiles[prevFiles.length - 1]) : null;
  if (prevPath && !prevPath.endsWith(`snapshot-${week}.json`)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevPath, "utf8"));
      const prevMap = new Map(
        (prev.advertisers || []).map((a) => [`${a.advertiser}::${a.platform}`, a.active_ads]),
      );
      snap.delta_vs_previous_week = snap.advertisers
        .map((a) => {
          const before = prevMap.get(`${a.advertiser}::${a.platform}`);
          return before === undefined
            ? null
            : {
                advertiser: a.advertiser,
                platform: a.platform,
                active_ads_before: before,
                active_ads_now: a.active_ads,
                change: a.active_ads - before,
              };
        })
        .filter(Boolean);
    } catch {
      // snapshots are advisory; a broken previous file never blocks the run
    }
  }

  const file = path.join(SNAPSHOTS, `snapshot-${week}.json`);
  fs.writeFileSync(file, JSON.stringify(snap, null, 2) + "\n");
  console.log(
    `snapshot written: ${path.relative(ROOT, file)} (${records.length} records, ${snap.totals.advertisers} advertisers)`,
  );
}

function cmdDeliver(args) {
  deliver(ROOT, process.env, args.digest || null)
    .then((r) => {
      r.skipped.forEach((m) => console.log(`skip: ${m}`));
      r.sent.forEach((m) => console.log(`sent: ${m}`));
      r.failed.forEach((f) => console.error(`failed: ${f.channel} — ${f.error}`));
      if (r.failed.length) process.exit(1);
    })
    .catch((e) => die(String(e.message || e)));
}

async function cmdCollect(args) {
  const r = await collect(ROOT, process.env, {
    terms: args.terms,
    countries: args.countries,
    limit: args.limit,
  });
  (r.skipped || []).forEach((m) => console.log(`skip: ${m}`));
  if (r.fetched !== undefined) {
    console.log(
      `collected: ${r.appended} new records (fetched ${r.fetched}) from [${(r.countries || []).join(",")}] terms: ${(r.terms || []).join(", ")}`,
    );
  }
  (r.notes || []).forEach((n) => console.log(`note: ${n}`));
}

// ---------- main ----------

const [cmd, ...rest] = process.argv.slice(2);
const { args } = parseArgs(rest);

switch (cmd) {
  case "init":
    cmdInit();
    break;
  case "add":
    cmdAdd(args);
    break;
  case "check":
    cmdCheck();
    break;
  case "score":
    cmdScore();
    break;
  case "digest":
    cmdDigest(args);
    break;
  case "snapshot":
    cmdSnapshot();
    break;
  case "deliver":
    cmdDeliver(args);
    break;
  case "collect":
    cmdCollect(args);
    break;
  case "version":
  case "--version":
  case "-v":
    console.log(VERSION);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    console.log(HELP);
    break;
  default:
    die(`unknown command "${cmd}" — try \`fuatilia help\``);
}
