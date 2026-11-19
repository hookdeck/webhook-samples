// Doc-sourced samples (files with a `source` key) are edited in
// hookdeck/webhook-registry's samples-doc/ and arrive here through its sync
// workflow on the `registry-sync` branch. An edit made here directly is overwritten
// by the next sync, and between 2026-11-04 and 2026-11-19 edits made on either side
// left the hub and Inspect showing different events and values (#92-#94).
//
// This fails a pull request that adds, changes or deletes a doc-sourced file unless
// it comes from this repo's own `registry-sync` branch (a fork's branch of that name
// doesn't count). Captures (no `source` key) are unaffected.
//
// Replacing a doc sample with a capture is allowed, because a capture always wins,
// but only on a PR labelled `capture`: dropping the `source` key from a doc file and
// editing it would otherwise pass as a capture, and the sync would then leave it
// alone for good.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2];
const headRef = process.env.HEAD_REF || "";
const fromThisRepo = (process.env.HEAD_REPO || "") === (process.env.REPO || "-");
const labelled = (process.env.PR_LABELS || "").split(",").includes("capture");
const exempt = new Set(JSON.parse(readFileSync(".github/doc-samples-guard.json", "utf8")).upstream_owned);

if (headRef === "registry-sync" && fromThisRepo) {
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
  else if (isDoc(before) && !labelled) bad.push(`replaces doc sample ${path} with a capture (label the PR \`capture\` if it is one)`);
}
if (bad.length) {
  console.log(`::error::This PR edits ${bad.length} doc-sourced sample(s). Make the change in hookdeck/webhook-registry samples-doc/; its sync workflow brings it here.`);
  for (const b of bad.slice(0, 50)) console.log(`  ${b}`);
  if (bad.length > 50) console.log(`  ... and ${bad.length - 50} more`);
  process.exit(1);
}
console.log("No doc-sourced samples edited outside registry-sync.");
