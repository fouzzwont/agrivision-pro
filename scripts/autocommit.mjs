#!/usr/bin/env node
/**
 * Auto-commit watcher.
 *
 * Polls `git status` and, once the working tree has been unchanged for a
 * quiet period, stages everything, commits with a generated message and
 * pushes to the current branch's upstream. It exists so that saving a file
 * in an editor is enough to get the change onto GitHub.
 *
 * Design notes:
 * - Polling instead of fs.watch: `git status` already honours .gitignore, so
 *   build output, dependencies and `.env` files never enter the commit.
 * - A quiet period is required so that a file being written in several
 *   chunks is not committed half-way through.
 * - Never runs while a merge/rebase/revert is in progress, or while the
 *   index is locked, to avoid corrupting an operation you started by hand.
 * - Large files are refused rather than committed.
 *
 * Usage:
 *   bun run autocommit              # watch until Ctrl+C
 *   bun run autocommit -- --once    # commit once and exit
 *   bun run autocommit -- --no-push # commit, never push
 *   bun run autocommit -- --quiet=5000 --interval=2000
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);

function opt(name, fallback) {
  const prefix = `${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return fallback;
  const value = hit.slice(prefix.length);
  return value === "" ? fallback : value;
}

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(
    [
      "Usage: bun run autocommit [--once] [--no-push] [--interval=ms] [--quiet=ms]",
      "",
      "  --once        Run a single cycle and exit",
      "  --no-push     Commit locally but never push",
      "  --interval    Poll interval in ms (default 1500)",
      "  --quiet       How long the tree must be stable before committing (default 3000)",
    ].join("\n"),
  );
  process.exit(0);
}

const INTERVAL = Math.max(500, Number(opt("--interval", 1500)) || 1500);
const QUIET = Math.max(1000, Number(opt("--quiet", 3000)) || 3000);
const AUTO_PUSH = !argv.includes("--no-push");
const ONCE = argv.includes("--once");
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PUSH_RETRY_MS = 60_000;
const MAX_LOG_BYTES = 512 * 1024;

const probe = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });

const top = probe(["rev-parse", "--show-toplevel"], process.cwd());
if (top.status !== 0) {
  console.error("autocommit: not inside a git repository");
  process.exit(1);
}
const REPO = top.stdout.trim();
const GIT_DIR = probe(["rev-parse", "--absolute-git-dir"], REPO).stdout.trim();
const LOG_FILE = join(GIT_DIR, "autocommit.log");

mkdirSync(GIT_DIR, { recursive: true });
try {
  if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > MAX_LOG_BYTES) {
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  }
} catch {
  // A rotated log is a nicety; never let it stop the watcher.
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // Logging must never break the watcher.
  }
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: REPO,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").trim(),
  };
}

const LOCKED_STATES = [
  "MERGE_HEAD",
  "rebase-merge",
  "rebase-apply",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "index.lock",
];

const CONFLICT_CODES = ["UU", "AA", "DD", "AU", "UA", "DU", "UD"];

let lastSignature = "";
let stableSince = 0;
let pendingPush = false;
let lastPushAttempt = 0;
let lastBlockedSignature = "";

function summarise(files) {
  const shown = files.slice(0, 10);
  const remaining = files.length - shown.length;
  const lines = shown.map((file) => `- ${file}`);
  if (remaining > 0) lines.push(`- …and ${remaining} more`);
  return lines.join("\n");
}

function tryPush({ force = false } = {}) {
  if (!AUTO_PUSH) {
    pendingPush = false;
    return;
  }
  const now = Date.now();
  if (!force && now - lastPushAttempt < PUSH_RETRY_MS) return;
  lastPushAttempt = now;

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok || !branch.out || branch.out === "HEAD") {
    log("push skipped: detached HEAD");
    return;
  }

  const pushed = git(["push", "-u", "origin", branch.out]);
  if (pushed.ok) {
    pendingPush = false;
    log(`pushed ${branch.out} to origin`);
    return;
  }

  pendingPush = true;
  const detail = (pushed.err || pushed.out).split(/\r?\n/).slice(-3).join(" · ");
  log(`push failed, will retry: ${detail}`);
}

function commit() {
  const added = git(["add", "-A"]);
  if (!added.ok) {
    log(`git add failed: ${added.err || added.out}`);
    return false;
  }

  const staged = git(["diff", "--cached", "--name-only"]);
  const files = staged.out ? staged.out.split(/\r?\n/).filter(Boolean) : [];
  if (files.length === 0) return false;

  const oversized = files.filter((file) => {
    try {
      return statSync(join(REPO, file)).size > MAX_FILE_BYTES;
    } catch {
      return false;
    }
  });
  if (oversized.length > 0) {
    git(["reset", "-q"]);
    const signature = oversized.join("\n");
    if (signature !== lastBlockedSignature) {
      lastBlockedSignature = signature;
      log(
        `refused to commit oversized file(s): ${oversized.join(", ")} ` +
          `(limit ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`,
      );
    }
    return false;
  }
  lastBlockedSignature = "";

  const message = [
    `auto: ${files.length} file${files.length === 1 ? "" : "s"} changed`,
    "",
    summarise(files),
    "",
    `Saved automatically at ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
  ].join("\n");

  const result = git(["commit", "-q", "-m", message]);
  if (!result.ok) {
    log(`commit failed: ${result.err || result.out}`);
    return false;
  }

  const hash = git(["rev-parse", "--short", "HEAD"]).out;
  log(`committed ${hash} (${files.length} file${files.length === 1 ? "" : "s"})`);
  return true;
}

function cycle({ force = false } = {}) {
  for (const state of LOCKED_STATES) {
    if (existsSync(join(GIT_DIR, state))) {
      if (stableSince !== 0) log(`paused: ${state} present`);
      stableSince = 0;
      lastSignature = "";
      return;
    }
  }

  const status = git(["status", "--porcelain", "--untracked-files=normal"]);
  if (!status.ok) {
    log(`git status failed: ${status.err || status.out}`);
    return;
  }

  const entries = status.out ? status.out.split(/\r?\n/).filter(Boolean) : [];
  const conflicts = entries.filter((line) => CONFLICT_CODES.includes(line.slice(0, 2)));
  if (conflicts.length > 0) {
    if (stableSince !== 0) log(`paused: ${conflicts.length} unresolved conflict(s)`);
    stableSince = 0;
    lastSignature = "";
    return;
  }

  if (entries.length === 0) {
    lastSignature = "";
    stableSince = 0;
    if (pendingPush) tryPush();
    return;
  }

  // Sort so that a change in `git status` ordering alone never resets the
  // quiet timer.
  const signature = entries.slice().sort().join("\n");
  if (signature !== lastSignature) {
    lastSignature = signature;
    stableSince = Date.now();
    if (!force) return;
  }

  if (!force && Date.now() - stableSince < QUIET) return;

  if (commit()) {
    lastSignature = "";
    stableSince = 0;
    tryPush({ force: true });
  }
}

log(
  `watching ${REPO} (interval ${INTERVAL} ms, quiet ${QUIET} ms, ` +
    `${AUTO_PUSH ? "push enabled" : "push disabled"})`,
);

if (ONCE) {
  cycle({ force: true });
  process.exit(0);
}

let timer = setInterval(() => {
  try {
    cycle();
  } catch (error) {
    log(`cycle error: ${error instanceof Error ? error.message : String(error)}`);
  }
}, INTERVAL);

function shutdown() {
  clearInterval(timer);
  log("stopped");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
