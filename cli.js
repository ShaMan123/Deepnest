const path = require("path");
const { ensureDir } = require("fs-extra");
const { readFile, writeFile, readdir } = require("fs/promises");
const { nest, nestingToSVG } = require("./index");

async function main() {
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
    async ({ iteration: i, result, data, elements }, deepNest) => {
      const outputDir = path.resolve("./output");
      await ensureDir(outputDir);
      const out = {
        svg: path.resolve(outputDir, `result-${i}.svg`),
        json: path.resolve(outputDir, `data-${i}.json`),
      };
      await writeFile(out.svg, nestingToSVG(deepNest, data));
      await writeFile(out.json, JSON.stringify(result, null, 2));
      console.log(`Successfully nested ${elements.length} elements:`, out);
    },
    {
      iterations: 1,
      timeout: 10_000,
      spacing: 0,
      sheet: { width: 100, height: 50 },
    }
  );
}

main();
