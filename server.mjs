import express from "express";
import { readdir, readFile } from "fs/promises";
import { nest } from "./index.js";
import path from "path";

const app = express();
const PORT = 8080;

app.get("/nest", express.json(), async (req, res) => {
  const files = (await readdir("./input"))
    .filter((file) => path.extname(file) === ".svg")
    .map((file) => path.resolve("./input", file));
  nest(
    await Promise.all(
      files.map(async (file) => ({
        file,
        svg: (await readFile(file)).toString(),
      }))
    ),
    async ({ svg, abort }) => {
      await abort();
      res.contentType("image/svg+xml");
      res.writeHead(200).end(svg());
    },
    {
      //   timeout: 60_000,
      spacing: 4,
      progressCallback: ({ index, progress, phase }) => {
        // res.writeProcessing();
        // res.setHeader(
        //   "Progress",
        //   `iteration(${index}) ${Math.round(progress * 100)}% ${phase}`
        // );
      },
      // sheet: { width: 100, height: 50 },
    }
  );
  //   res.writeHead(102, { progress: "1/2" });
  //   res.sendStatus(102);
});

app.listen(PORT, (err) => {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
