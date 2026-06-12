import * as fs from "fs";
import * as path from "path";
import { ChildProcess } from "child_process";
import { hookdeckCi } from "./hookdeck";
import {
  REPO_ROOT,
  spawnLongRunning,
  waitForFile,
  waitForHttp,
} from "./process";

export type TriggerSpec = {
  /** Maps 1:1 to an expected `<name>.json` output file. */
  name: string;
  /** Fire the event(s); resolved value is logged as a job/run id. */
  run: () => Promise<string>;
};

export type CapturePlan = {
  /** Hookdeck project API key. */
  hookdeckApiKey: string;
  /** Name used for the `hookdeck ci` session. */
  ciName: string;
  /** Hookdeck source name to listen on. */
  sourceName: string;
  /** Local path the receiver serves, e.g. `/ordinal/latest`. */
  receiverPath: string;
  /** Absolute directory where `<topic>.json` files are written. */
  outputDir: string;
  /** Max time to wait for each delivery to land as a file. */
  deliveryTimeoutMs: number;
  /** Triggers to fire. Each maps to one expected output file. */
  triggers: TriggerSpec[];
  receiverPort?: number;
  processReadyDelayMs?: number;
  /** Optional in-place scrub applied to each captured file. */
  scrub?: (filePath: string) => void;
};

type ChildHandles = {
  receiver: ChildProcess;
  listen: ChildProcess;
};

/**
 * Provider-agnostic capture loop. Starts the repo's `requestReceiver.ts`
 * and a `hookdeck listen` tunnel, fires the supplied triggers, then waits
 * for one `<trigger>.json` file per trigger to be written by the receiver.
 *
 * Only the files named by `triggers` are cleared before the run, so a
 * provider can keep other (e.g. docs-sourced) payloads in the same
 * `outputDir` untouched across incremental captures.
 */
export async function runCapture(plan: CapturePlan): Promise<void> {
  const receiverPort = plan.receiverPort ?? 9001;
  const processReadyDelayMs = plan.processReadyDelayMs ?? 5_000;
  const topics = plan.triggers.map((t) => t.name);

  for (const topic of topics) {
    const f = path.join(plan.outputDir, `${topic}.json`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log("1/5 Refreshing Hookdeck CLI auth (--local)...");
  hookdeckCi(plan.hookdeckApiKey, plan.ciName);

  const children: Partial<ChildHandles> = {};
  const cleanup = () => {
    for (const c of Object.values(children)) {
      if (c && !c.killed) c.kill("SIGTERM");
    }
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    console.log(`2/5 Starting receiver on port ${receiverPort}...`);
    children.receiver = spawnLongRunning("node", [
      "./node_modules/.bin/ts-node",
      "requestReceiver.ts",
    ]);
    children.receiver.stdout?.on("data", (b) =>
      process.stdout.write(`[receiver] ${b}`)
    );
    children.receiver.stderr?.on("data", (b) =>
      process.stderr.write(`[receiver] ${b}`)
    );
    await waitForHttp(
      `http://localhost:${receiverPort}/healthz`,
      15_000
    ).catch(() => {
      // receiver has no /healthz — fall back to any response on root
    });
    await waitForHttp(`http://localhost:${receiverPort}/`, 15_000);

    console.log(
      `3/5 Starting hookdeck listen → :${receiverPort}${plan.receiverPath}...`
    );
    children.listen = spawnLongRunning("hookdeck", [
      "listen",
      String(receiverPort),
      plan.sourceName,
      "--path",
      plan.receiverPath,
      "--output",
      "compact",
    ]);
    children.listen.stdout?.on("data", (b) =>
      process.stdout.write(`[hookdeck] ${b}`)
    );
    children.listen.stderr?.on("data", (b) =>
      process.stderr.write(`[hookdeck] ${b}`)
    );
    await new Promise((r) => setTimeout(r, processReadyDelayMs));

    console.log(`4/5 Triggering ${plan.triggers.length} event(s)...`);
    const triggered = await Promise.allSettled(
      plan.triggers.map((t) => t.run())
    );
    for (let i = 0; i < triggered.length; i++) {
      const t = triggered[i];
      const name = plan.triggers[i].name;
      if (t.status === "rejected") {
        console.error(`   ${name}: ERROR — ${t.reason?.message ?? t.reason}`);
      } else {
        console.log(`   ${name}: queued (${t.value})`);
      }
    }

    console.log(
      `5/5 Waiting up to ${plan.deliveryTimeoutMs / 1000}s for webhook deliveries...`
    );
    const results = await Promise.allSettled(
      topics.map((topic) =>
        waitForFile(
          path.join(plan.outputDir, `${topic}.json`),
          plan.deliveryTimeoutMs
        ).then(() => topic)
      )
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const topic = topics[i];
      if (r.status === "fulfilled") {
        console.log(`   ${topic}.json captured`);
        plan.scrub?.(path.join(plan.outputDir, `${topic}.json`));
      } else {
        console.error(
          `   ${topic}.json NOT captured (${r.reason?.message ?? r.reason})`
        );
      }
    }

    console.log(
      `\nDone. Review files under ${path.relative(REPO_ROOT, plan.outputDir)}/ before committing.`
    );
  } finally {
    cleanup();
  }
}
