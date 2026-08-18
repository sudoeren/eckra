const packageJson = require("../../../package.json");
const { s, pause, link } = require("../common");
const { open } = require("../screen");

async function doAbout() {
  open("About", `v${packageJson.version}`);

  console.log(s.muted("  AI-powered Git management CLI"));
  console.log();
  console.log(
    s.dim("  GitHub  ") + s.primary(link("https://github.com/sudoeren/eckra"))
  );
  console.log();

  await pause();
}

module.exports = { doAbout };
