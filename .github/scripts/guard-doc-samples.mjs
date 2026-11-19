// Doc-sourced samples (files with a `source` key) are edited in
// hookdeck/webhook-registry's samples-doc/ and arrive here through its sync
// workflow on the `registry-sync` branch. An edit made here directly is overwritten
// by the next sync, and between 2026-11-04 and 2026-11-19 edits made on either side
// left the hub and Inspect showing different events and values (#92-#94).
//
// This fails a pull request that adds, changes or deletes a doc-sourced file unless
// it comes from `registry-sync`. Captures (no `source` key) are unaffected, and a
// capture replacing a doc sample is allowed: a capture always wins.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2];
const headRef = process.env.HEAD_REF || "";
const exempt = new Set(JSON.parse(readFileSync(".github/doc-samples-guard.json", "utf8")).upstream_owned);

if (headRef === "registry-sync") {
  console.log("registry-sync branch: doc-sourced edits allowed.");
  process.exit(0);
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const read = (rev, path) => {
  try { return JSON.parse(git("show", `${rev}:${path}`)); } catch { return null; }
};
const isDoc = (d) => d !== null && typeof d === "object" && !Array.isArray(d) && "source" in d;

const changed = git("diff", "--name-status", "--no-renames", `${base}...HEAD`)
  .split("\n").filter(Boolean).map((l) => l.split("\t"));
const bad = [];
for (const [status, path] of changed) {
  const m = path.match(/^providers\/([^/]+)\/[^/]+\/[^/]+\.json$/);
  if (!m || exempt.has(m[1])) continue;
  const before = read(base, path);
  const after = status === "D" ? null : read("HEAD", path);
  if (isDoc(after)) bad.push(`${status === "A" ? "adds" : "changes"} ${path}`);
  else if (after === null && isDoc(before)) bad.push(`deletes ${path}`);
}
if (bad.length) {
  console.log(`::error::This PR edits ${bad.length} doc-sourced sample(s). Make the change in hookdeck/webhook-registry samples-doc/; its sync workflow brings it here.`);
  for (const b of bad.slice(0, 50)) console.log(`  ${b}`);
  if (bad.length > 50) console.log(`  ... and ${bad.length - 50} more`);
  process.exit(1);
}
console.log("No doc-sourced samples edited outside registry-sync.");
