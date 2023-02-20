import express from "express";
import * as fs from "fs";
import * as path from "path";

const app = express();
const port = process.env.PORT || 9001;

// Compile before starting
//
//

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

app.get("/", (req, res) => {
  // Get data here. ?=provider&topic=topic&version=version&search_term
  res.json({ hello: "world" });
});

app.listen(port, () => {
  console.log(`Mock Destination listening on http://localhost:${port}`, {
    type: "server",
  });
});
