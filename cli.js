const path = require("path");
const { ensureDir } = require("fs-extra");
const { readFile, writeFile, readdir } = require("fs/promises");
const { nest } = require("./index");

async function main() {
  const files = (await readdir("./input"))
    .filter((file) => path.extname(file) === ".svg")
    .map((file) => path.resolve("./input", file));
  const spinner = (await import("ora")).default();
  spinner.start("Nesting");
  let i = 0;
  nest(
    await Promise.all(
      files.map(async (file) => ({
        file,
        svg: (await readFile(file)).toString(),
      }))
    ),
    async ({ status, result, svg, abort }) => {
      await abort();
      const outputDir = path.resolve("./output");
      await ensureDir(outputDir);
      const out = {
        svg: path.resolve(outputDir, `result-${i}.svg`),
        json: path.resolve(outputDir, `data-${i}.json`),
      };
      i++;
      await writeFile(out.svg, svg());
      await writeFile(out.json, JSON.stringify(result, null, 2));
      spinner.succeed(
        `Successfully nested ${status.placed}/${status.total} elements\n- svg: ${out.svg}\n- json: ${out.json}`
      );
    },
    {
      timeout: 60_000,
      spacing: 4,
      progressCallback: ({ index, progress, phase, threads }) => {
        spinner.text = `iteration[${index}]: ${phase} ${Math.round(
          progress * 100
        )}% with ${threads} threads`;
      },
      // sheet: { width: 100, height: 50 },
    }
  );
}

main();
