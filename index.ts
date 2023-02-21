import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const port = process.env.PORT || 9002;

app.set("trust proxy", 1);

app.use(cors());

app.get("/providers.json", (req, res) => {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "public", "providers.json"), "utf8")
  );
  res.json(data);
});

app.get("/providers/:provider/:version", (req, res) => {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        "public",
        "providers",
        req.params.provider,
        req.params.version
      ),
      "utf8"
    )
  );
  res.json(data);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`, {
    type: "server",
  });
});
