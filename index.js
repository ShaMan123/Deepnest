const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const electron = require("electron");

// Known issues: https://playwright.dev/docs/api/class-electron
flipFuses(electron, {
  version: FuseVersion.V1,
  [FuseV1Options.EnableNodeCliInspectArguments]: true,
});

require("./main");
