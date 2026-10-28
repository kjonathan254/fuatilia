#!/usr/bin/env node
// Fuatilia — the open ad-intelligence toolkit for Kenya.
// Zero dependencies. Node >= 18.
//
//   fuatilia init              scaffold watchlist + data dir
//   fuatilia add [flags]       capture one ad card from a public ad library
//   fuatilia check             validate captures against the schema
//   fuatilia score             classify every captured ad, printed as a table
//   fuatilia digest [--out D]  render the weekly markdown digest
//
// Method: docs/METHOD.md · Schema: docs/SCHEMA.md · License: MIT

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, aggregate, scaleBand } from "../lib/signals.js";
import { renderDigest } from "../lib/digest.js";

const VERSION = "0.1.0";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const CAPTURES = path.join(DATA_DIR, "captures.jsonl");
const WATCHLIST = path.join(ROOT, "watchlist.json");
const DIGESTS = path.join(ROOT, "digests");

const PLATFORMS = new Set(["meta", "google", "tiktok"]);
const COUNTRIES = /^[A-Z]{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const HELP = `
Fuatilia v${VERSION} — know what Kenya is advertising.

  fuatilia init                      scaffold watchlist.json + data/
  fuatilia add --advertiser NAME --platform meta|google|tiktok --country KE
               [--start YYYY-MM-DD] [--versions N] [--type video|image|carousel|search]
               [--offer "..."] [--landing URL] [--headline "..."] [--library URL]
               [--page-id ID] [--tags a,b] [--notes "..."]
               [--example]          capture one ad card (5 minutes of browsing, one row)
  fuatilia check                     validate data/captures.jsonl against the schema
  fuatilia score                     print all captures with tenure + signals
  fuatilia digest [--out DIR]        render the weekly digest (default: digests/)

Signals are heuristics, not proof. Method: docs/METHOD.md
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
  return fs
    .readFileSync(CAPTURES, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        die(`captures.jsonl line ${i + 1} is not valid JSON`, 2);
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
  fs.appendFileSync(CAPTURES, JSON.stringify(record) + "\n");
  const c = classify(record);
  console.log(`captured: ${record.advertiser} (${record.platform}/${record.country})`);
  console.log(`  id: ${record.id}`);
  console.log(
    `  signals: ${c.signals.length ? c.signals.map((s) => s.label).join("; ") : "none yet"}`
  );
  console.log(`  caveat: ${c.caveat}`);
}

function cmdCheck() {
  const records = readCaptures();
  if (!records.length) {
    console.log("no captures yet — run `fuatilia add` after browsing the library");
    return;
  }
  let bad = 0;
  records.forEach((r, i) => {
    const errs = validateRecord(r);
    if (errs.length) {
      bad++;
      console.error(`line ${i + 1} (${r.advertiser || "?"}):`);
      errs.forEach((e) => console.error(`  -- ${e}`));
    }
  });
  console.log(
    bad ? `${records.length - bad}/${records.length} records valid (${bad} with errors)`
        : `all ${records.length} records valid`,
  );
  if (bad) process.exit(2);
}

function cmdScore() {
  const records = readCaptures();
  const real = records.filter((r) => !r.example);
  const shown = real.length ? real : records;
  if (!shown.length) {
    console.log("no captures yet");
    return;
  }
  if (!real.length && records.length)
    console.log("(showing example rows — no real captures yet)\n");

  const rows = shown.map((r) => {
    const c = classify(r);
    const band = scaleBand(Number(r.active_versions) || 1);
    return [
      r.advertiser,
      r.platform,
      c.tenure !== null ? `${c.tenure}d` : "—",
      String(r.active_versions ?? "—"),
      c.signals.map((s) => s.code).join("+") || "—",
      band ? band.band : "—",
    ];
  });
  const headers = ["advertiser", "platform", "tenure", "versions", "signals", "band"];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length), 3),
  );
  const line = (cells) =>
    "| " + cells.map((c, i) => (c + " ".repeat(widths[i])).slice(0, widths[i])).join(" | ") + " |";
  console.log(line(headers));
  console.log("|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|");
  rows.forEach((r) => console.log(line(r)));
}

function cmdDigest(args) {
  const records = readCaptures();
  const watchlist = readWatchlist();
  const now = new Date();
  const md = renderDigest(records, watchlist, now);
  const outDir = args.out || DIGESTS;
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `adwatch-${todayISO(now)}.md`);
  fs.writeFileSync(file, md);
  console.log(`digest written: ${path.relative(ROOT, file)}`);
  const real = records.filter((r) => !r.example).length;
  if (!real) {
    console.log(
      "\nnote: built from example rows only — capture real ads with `fuatilia add` for a live digest",
    );
  }
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
