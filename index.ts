import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const compiled_data = JSON.parse(
  fs.readFileSync(path.join(__dirname, ".build", "providers.json"), "utf8")
);

const app = express();
const port = process.env.PORT || 9002;

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

app.use(cors());

const providers = Object.keys(compiled_data).reduce((object, provider) => {
  object[provider] = { label: compiled_data[provider].label };
  return object;
}, {});

app.get("/providers", (req, res) => {
  res.json(providers);
});

app.get("/providers/:provider/:version", (req, res) => {
  if (req.params.version === "latest") {
    req.params.version = compiled_data[req.params.provider].latest_version;
  }
  res.json(compiled_data[req.params.provider].versions[req.params.version]);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`, {
    type: "server",
  });
});
