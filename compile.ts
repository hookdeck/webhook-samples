import fs from "fs/promises";
import path from "path";

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
      doc_sourced?: boolean;
      configs: {
        latest_version: string;
        topic_identifier: string | string[];
      };
    } = JSON.parse(config_file);
    data[provider] = {
      label: config.label,
      latest_version: config.configs.latest_version,
      doc_sourced: config.doc_sourced === true,
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
      object[provider] = {
        label: data[provider].label,
        latest_version: data[provider].latest_version,
        doc_sourced: data[provider].doc_sourced,
        versions: Object.keys(data[provider].versions),
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
