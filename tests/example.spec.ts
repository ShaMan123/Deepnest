import { _electron as electron, expect, test } from "@playwright/test";
import { OpenDialogReturnValue } from "electron";
import { readFile } from "fs/promises";
import path from "path";

type NestingResult = {
  area: number;
  fitness: number;
  index: number;
  mergedLength: number;
  selected: boolean;
  placements: {
    sheet: number;
    sheetid: number;
    sheetplacements: {
      filename: string;
      id: number;
      rotation: number;
      source: number;
      x: number;
      y: number;
    }[];
  }[];
};

// test.use({ launchOptions: { slowMo: !process.env.CI ? 500 : 0 } });

test.setTimeout(120_000);

const sheet = { width: 10, height: 10 };

test("Nest", async ({}) => {
  const electronApp = await electron.launch({
    args: ["main.js"],
  });

  const window = await electronApp.firstWindow();

  // Direct Electron console to Node terminal.
  window.on("console", console.log);

  await test.step("upload and start", async () => {
    electronApp.evaluate(
      ({ dialog }, paths) => {
        dialog.showOpenDialog = async (): Promise<OpenDialogReturnValue> => ({
          filePaths: paths,
          canceled: false,
        });
      },
      [
        path.resolve(__dirname, "letters.svg"),
        path.resolve(__dirname, "letters2.svg"),
      ]
    );
    await window.click("id=import");

    await window.click("id=addsheet");
    await window.fill("id=sheetwidth", sheet.width.toString());
    await window.fill("id=sheetheight", sheet.height.toString());
    await window.click("id=confirmsheet");

    const spacingMM = 4;
    const scale = 72;
    const config = {
      units: "mm",
      scale, // stored value will be in units/inch
      spacing: (spacingMM / 25.4) * scale, // stored value will be in units/inch
      curveTolerance: 0.72, // store distances in native units
      clipperScale: 10000000,
      rotations: 4,
      threads: 4,
      populationSize: 10,
      mutationRate: 10,
      placementType: "gravity", // how to place each part (possible values gravity, box, convexhull)
      mergeLines: true, // whether to merge lines
      timeRatio: 0.5, // ratio of material reduction to laser time. 0 = optimize material only, 1 = optimize laser time only
      simplify: false,
      dxfImportScale: "1",
      dxfExportScale: "72",
      endpointTolerance: 0.36,
      conversionServer: "http://convert.deepnest.io",
    };

    await window.evaluate((config) => {
      window.config.setSync(config);
      window.DeepNest.config(config);
    }, config);

    await expect(window).toHaveScreenshot("loaded.png", {
      clip: { x: 100, y: 100, width: 2000, height: 1000 },
    });

    await window.click("id=startnest");
  });

  const stopNesting = () => window.click("id=stopnest");

  const downloadSvg = async () => {
    const file = test.info().outputPath("output.svg");
    electronApp.evaluate(({ dialog }, path) => {
      dialog.showSaveDialogSync = () => path;
    }, file);
    await window.click("id=export");
    await expect(window.locator("id=exportsvg")).toBeVisible();
    await window.click("id=exportsvg");
    return (await readFile(file)).toString();
  };

  // await electronApp.evaluate(({ ipcRenderer }) => {
  //   ipcRenderer.on("setPlacements", (event, payload) =>
  //     console.log("INCOMING", payload)
  //   );
  // });

  const waitForIteration = (n: number) =>
    expect(() =>
      expect(
        window
          .locator("id=nestlist")
          .locator("span")
          .nth(n - 1)
      ).toBeVisible()
    ).toPass();

  // await window.pause();
  await expect(window.locator("id=progressbar")).toBeVisible();
  await expect(window).toHaveScreenshot("status.png", {
    clip: { x: 0, y: 0, width: 150, height: 250 },
  });
  await waitForIteration(1);

  const svg = await downloadSvg();

  const data = (): Promise<NestingResult> =>
    window.evaluate(() => window.DeepNest.nests);

  test
    .info()
    .attach("nesting.svg", { body: svg, contentType: "image/svg+xml" });

  test.info().attach("nesting.json", {
    body: JSON.stringify(await data(), null, 2),
    contentType: "application/json",
  });

  await stopNesting();

  await electronApp.close();
});
