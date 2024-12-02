// const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { app, dialog } = require("electron");
const path = require("path");
const { readFile, writeFile } = require("fs/promises");
const { ensureDirSync } = require("fs-extra");

// Known issues: https://playwright.dev/docs/api/class-electron
// flipFuses(electron, {
//   version: FuseVersion.V1,
//   [FuseV1Options.EnableNodeCliInspectArguments]: undefined,
//   [FuseV1Options.RunAsNode]: undefined,
// });

const inputDir = path.resolve(__dirname, "tests");
const outputDir = path.resolve(__dirname, "test-results", "output");
ensureDirSync(outputDir);
const downloadFile = path.resolve(outputDir, "result.svg");

const exec = async () => {
  const { data, svg } = await new Promise((resolve) => {
    dialog.showOpenDialog = async () => {
      return {
        filePaths: [
          path.resolve(inputDir, "letters.svg"),
          path.resolve(inputDir, "letters2.svg"),
        ],
        canceled: false,
      };
    };

    dialog.showSaveDialogSync = () => downloadFile;

    app.on("main-window", async ({ mainWindow }) => {
      const data = await mainWindow.webContents.executeJavaScript(
        (await readFile(path.resolve(inputDir, "robot.js"))).toString(),
        true
      );

      await writeFile(
        path.resolve(outputDir, "data.json"),
        JSON.stringify(data, null, 2)
      );

      app.quit();

      resolve({
        data,
        svg: (await readFile(downloadFile)).toString(),
      });
    });
  });
  console.log({ data, svg });
};

exec();
require("./main");
