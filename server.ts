import express from "express";
import * as fs from "fs";
import * as path from "path";

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
    limit: "5mb",
  })
);
// app.use(
//   express.text({
//     verify: (req: any, res, buf) => {
//       req.rawBody = buf;
//     },
//     limit: '5mb',
//   })
// );
// app.use(
//   express.raw({
//     type: 'application/xml',
//     verify: (req: any, res, buf) => {
//       req.rawBody = buf;
//     },
//     limit: '5mb',
//   })
// );
// app.use(
//   express.text({
//     verify: (req: any, res, buf) => {
//       req.rawBody = buf;
//     },
//     limit: '5mb',
//   })
// );
// app.use(
//   express.urlencoded({
//     extended: true,
//     verify: (req: any, res, buf) => {
//       req.rawBody = buf;
//     },
//     limit: '5mb',
//   })
// );

const outputToFile = (output: any, provider: string, version: string) => {
  if (!fs.existsSync(path.join(process.cwd(), "providers"))) {
    fs.mkdirSync(path.join(process.cwd(), "providers"));
  }
  if (!fs.existsSync(path.join(process.cwd(), "providers", provider))) {
    fs.mkdirSync(path.join(process.cwd(), "providers", provider));
  }
  if (
    !fs.existsSync(path.join(process.cwd(), "providers", provider, version))
  ) {
    fs.mkdirSync(path.join(process.cwd(), "providers", provider, version));
  }
  const topic = output.headers["x-shopify-topic"] as string;
  fs.writeFileSync(
    path.join(
      process.cwd(),
      "providers",
      provider,
      version,
      `${topic.replace("/", ".")}.json`
    ),
    JSON.stringify(output, null, 4)
  );
};

const formatOutput = (req: any) => {
  let headers = {};
  Object.entries(req.headers).forEach(([key, value]) => {
    if (key.includes("hookdeck")) {
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
  const start = Date.now();
  res.on("finish", () => {
    const taken = Date.now() - start;
    const output = formatOutput(req);
    console.log(JSON.stringify(output, null, 4));
    outputToFile(output, provider, version);
    console.log(JSON.stringify(formatOutput(req), null, 4));
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${req.headers} (${taken} ms)`,
      {
        type: "http",
      }
    );
  });

  let status = 200;

  const timeout = req.query.timeout ? parseInt(req.query.timeout as string) : 0;

  const promise = timeout
    ? new Promise((resolve) => setTimeout(() => resolve(true), timeout))
    : Promise.resolve(true);

  promise.then(() =>
    res.status(status).json({
      message: `The Mock API returns the request data with a HTTP ${status} code`,
      next_step:
        "Convinced? Update your destination with your own server HTTP URL.",
      requested_path: req.path,
      received_data: {
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query,
      },
    })
  );
});

app.all("*", (req, res) => {
  const start = Date.now();
  res.on("finish", () => {
    const taken = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${req.headers} (${taken} ms)`,
      {
        type: "http",
      }
    );
  });

  let status = 200;

  const timeout = req.query.timeout ? parseInt(req.query.timeout as string) : 0;

  const promise = timeout
    ? new Promise((resolve) => setTimeout(() => resolve(true), timeout))
    : Promise.resolve(true);

  promise.then(() =>
    res.status(status).json({
      message: `The Mock API returns the request data with a HTTP ${status} code`,
      next_step:
        "Convinced? Update your destination with your own server HTTP URL.",
      requested_path: req.path,
      received_data: {
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query,
      },
    })
  );
});

app.listen(port, () => {
  console.log(`Mock Destination listening on http://localhost:${port}`, {
    type: "server",
  });
});
