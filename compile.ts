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
  const providers = await fs.readdir(root);
  for (const provider of providers) {
    const provider_path = path.join(root, provider);
    if (!(await fs.stat(provider_path)).isDirectory()) continue;
    const versions = await fs.readdir(provider_path);
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
      data[provider].versions[version] = {};

      const topics = await fs.readdir(version_path);
      data[provider].versions[version] = {};

      for (const topic of topics) {
        const topic_data = await fs.readFile(
          path.join(root, provider, version, topic),
          "utf8"
        );

        const parsed_topic = JSON.parse(topic_data);
        data[provider].versions[version][parsed_topic.topic] = parsed_topic;
        await fs.mkdir(path.join(__dirname, "public", "providers", provider), {
          recursive: true,
        });
        await fs.writeFile(
          path.join(
            __dirname,
            "public",
            "providers",
            provider,
            `${version}.json`
          ),
          JSON.stringify(data[provider].versions[version], null),
          "utf8"
        );
      }
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
