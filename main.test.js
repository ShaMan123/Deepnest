// const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { app, dialog } = require("electron");
const path = require("path");
const { readFile, writeFile, readdir } = require("fs/promises");
const { ensureDirSync } = require("fs-extra");

// Known issues: https://playwright.dev/docs/api/class-electron
// flipFuses(electron, {
//   version: FuseVersion.V1,
//   [FuseV1Options.EnableNodeCliInspectArguments]: undefined,
//   [FuseV1Options.RunAsNode]: undefined,
// });

const robotFile = path.resolve(__dirname, "robot.js");
console.log("paths:", {
  main: app.getAppPath(),
  downloads: app.getPath("downloads"),
});
const inputDir = path.resolve(app.getAppPath(), "input");
const outputDir = path.resolve(
  app.getPath("downloads"),
  `nesting-${new Date().toISOString()}`
);
ensureDirSync(outputDir);
const downloadFile = path.resolve(outputDir, "result.svg");
const dataFile = path.resolve(outputDir, "data.json");

const exec = async () => {
  const files = (await readdir(inputDir))
    .filter((file) => path.extname(file) === ".svg")
    .map((file) => path.resolve(inputDir, file));

  const { data, svg } = await new Promise((resolve) => {
    dialog.showOpenDialog = async () => {
      return {
        filePaths: files,
        canceled: false,
      };
    };

    dialog.showSaveDialogSync = () => downloadFile;

    app.on("main-window", async ({ mainWindow }) => {
      const data = await mainWindow.webContents.executeJavaScript(
        (await readFile(robotFile)).toString(),
        true
      );

      await writeFile(dataFile, JSON.stringify(data, null, 2));

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
