const packageJson = require("../../../package.json");
const { s, pause } = require("../common");
const { open } = require("../screen");

async function doAbout() {
  open("About");

  console.log(s.brand("  ECKRA") + s.dim("  v" + packageJson.version));
  console.log(s.muted("  AI-powered Git management CLI"));
  console.log();
  console.log(s.dim("  GitHub  ") + s.primary("github.com/sudoeren/eckra"));
  console.log(s.dim("  License ") + s.text("MIT"));
  console.log();

  await pause();
}

module.exports = { doAbout };
