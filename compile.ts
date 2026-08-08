import fs from "fs/promises";
import path from "path";

// How a version's samples were obtained. `capture` means the samples came
// through a real delivery from the provider — real headers, real delivery
// mechanics — not that the payload is production traffic; several providers
// send synthetic fixtures through the real path. `docs` means transcribed
// from the provider's documentation, which is weaker: docs go stale and are
// sometimes simply wrong. `unknown` is the default, and is never inferred.
const SOURCED_VIA = ["capture", "docs", "unknown"] as const;
type SourcedVia = (typeof SOURCED_VIA)[number];

type Provenance = { sourced_via: SourcedVia; sourced_on?: string };

const compile = async () => {
  const root = path.join(__dirname, "providers");
  const data: any = {};
  // Everything published is sorted explicitly. `fs.readdir` returns entries in
  // filesystem order — sorted on APFS, hash order on ext4 — so without this the
  // published order silently depends on which machine ran the build.
  const providers = (await fs.readdir(root)).sort();
  for (const provider of providers) {
    const provider_path = path.join(root, provider);
    if (!(await fs.stat(provider_path)).isDirectory()) continue;
    const versions = (await fs.readdir(provider_path)).sort();
    const config_file = await fs.readFile(
      path.join(provider_path, "index.json"),
      "utf8"
    );
    const config: {
      label: string;
      provenance?: Record<string, Partial<Provenance>>;
      configs: {
        latest_version: string;
        topic_identifier: string | string[];
      };
    } = JSON.parse(config_file);

    // Fail the build on a typo rather than publishing it. An unrecognised
    // value would otherwise reach consumers looking authoritative.
    for (const [version, entry] of Object.entries(config.provenance ?? {})) {
      if (entry.sourced_via && !SOURCED_VIA.includes(entry.sourced_via)) {
        throw new Error(
          `${provider}/${version}: sourced_via "${entry.sourced_via}" is not one of ${SOURCED_VIA.join(", ")}`
        );
      }
    }

    data[provider] = {
      label: config.label,
      latest_version: config.configs.latest_version,
      provenance: config.provenance ?? {},
      versions: {},
    };

    for (const version of versions.filter((v) => v !== "index.json")) {
      const version_path = path.join(provider_path, version);
      if (!(await fs.stat(version_path)).isDirectory()) continue;

      const topics = await fs.readdir(version_path);

      // Collect first, then emit in topic order. Sorting the filenames is not
      // the same thing: a file is `orders.create.json` where the topic it
      // publishes is `orders/create`, and it is the topic that consumers see.
      const by_topic: Record<string, any> = {};
      for (const topic of topics) {
        const topic_data = await fs.readFile(
          path.join(root, provider, version, topic),
          "utf8"
        );

        const parsed_topic = JSON.parse(topic_data);

        // Two records of provenance have to agree: the per-file `source` key
        // that doc-sourced samples carry, and the version-level block. A
        // captured version containing a doc-sourced file means one of them is
        // lying, and the version-level claim is the stronger one — it's what
        // consumers filter on without downloading the samples.
        if (
          parsed_topic.source &&
          config.provenance?.[version]?.sourced_via === "capture"
        ) {
          throw new Error(
            `${provider}/${version} is marked sourced_via "capture" but ${topic} carries a "source" key, which only doc-sourced samples have`
          );
        }

        by_topic[parsed_topic.topic] = parsed_topic;
      }

      const sorted_version: Record<string, any> = {};
      for (const topic of Object.keys(by_topic).sort()) {
        sorted_version[topic] = by_topic[topic];
      }
      data[provider].versions[version] = sorted_version;

      await fs.mkdir(path.join(__dirname, "public", "providers", provider), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(__dirname, "public", "providers", provider, `${version}.json`),
        JSON.stringify(sorted_version, null),
        "utf8"
      );
    }
  }
  return data;
};

compile()
  .then(async (data) => {
    const providers = Object.keys(data).reduce((object, provider) => {
      const versions = Object.keys(data[provider].versions);
      object[provider] = {
        label: data[provider].label,
        latest_version: data[provider].latest_version,
        versions,
        // Every version gets an entry. A version with nothing recorded
        // resolves to `unknown` — absence must never read as a claim that
        // the samples were captured.
        provenance: versions.reduce((acc: Record<string, Provenance>, version) => {
          const entry = data[provider].provenance[version];
          acc[version] = {
            sourced_via: entry?.sourced_via ?? "unknown",
            ...(entry?.sourced_on ? { sourced_on: entry.sourced_on } : {}),
          };
          return acc;
        }, {}),
      };
      return object;
    }, {});
    await fs.writeFile(
      path.join(__dirname, "public", "providers.json"),
      JSON.stringify(providers, null),
      "utf8"
    );
  })
  .then(() => {
    console.log("Compiled");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
