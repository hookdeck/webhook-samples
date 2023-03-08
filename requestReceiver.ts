import express from "express";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

const app = express();
const port = process.env.PORT || 9001;

app.set("trust proxy", 1);

app.use(
  express.json({
    // Allow built-in types other than object and array too
    strict: false,
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    },
    limit: "10mb",
  })
);

const outputToFile = (output: any, provider: string, version: string) => {
  if (!fs.existsSync(path.join(process.cwd(), "providers", provider))) {
    console.warn(
      `${provider} doesn't exist could not save json. Create index.json for provider.`
    ),
      fs.mkdirSync(path.join(process.cwd(), "providers", provider));
    return;
  }

  const provider_config = fs.readFileSync(
    path.join(process.cwd(), "providers", provider, "index.json"),
    "utf-8"
  );

  if (!provider_config) {
    console.warn(
      `${provider} config doesn't exist could not save json. Create index.json for provider.`
    );
  }

  const parsed_configs = JSON.parse(provider_config);

  if (
    !fs.existsSync(path.join(process.cwd(), "providers", provider, version))
  ) {
    fs.mkdirSync(path.join(process.cwd(), "providers", provider, version));
  }

  let topic =
    parsed_configs.configs.topic_identifier &&
    (output.headers[parsed_configs.configs.topic_identifier] ||
      output.body[parsed_configs.configs.topic_identifier]);

  if (!topic) {
    topic = `untitled-${crypto
      .createHash("md5")
      .update(JSON.stringify(output.body, null))
      .digest("hex")}`;
  }
  output.topic = topic;
  fs.writeFileSync(
    path.join(
      process.cwd(),
      "providers",
      provider,
      version,
      `${topic.replace(/[/:\\]/g, ".")}.json`
    ),
    JSON.stringify(output, null, 2)
  );
};

const formatOutput = (req: any) => {
  let headers = {};
  Object.entries(req.headers).forEach(([key, value]) => {
    if (
      key === "idempotency-key" &&
      value === req.headers["x-hookdeck-eventid"]
    ) {
      return;
    }
    if (key.includes("hookdeck")) {
      return;
    }
    if (key === "host") {
      return;
    }
    headers = {
      ...headers,
      [key]: value,
    };
  });
  return {
    headers,
    body: req.body,
  };
};

app.all("/:provider/:version", (req, res) => {
  const provider = req.params.provider;
  const version = req.params.version;

  res.on("finish", () => {
    const output = formatOutput(req);
    console.log(JSON.stringify(output, null, 2));
    outputToFile(output, provider, version);
    console.log(JSON.stringify(formatOutput(req), null, 2));
  });

  res.status(200).json({
    message: `it works!`,
  });
});

app.listen(port, () => {
  console.log(`Webhook receiver listening on http://localhost:${port}`, {
    type: "server",
  });
});
