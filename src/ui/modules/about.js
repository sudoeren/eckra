const packageJson = require("../../../package.json");
const { s, clear, header, pause } = require("../common");

async function doAbout() {
  clear();
  header();
  console.log(s.bold("  About\n"));

  console.log(s.brand("  ECKRA"));
  console.log(s.muted("  AI-Powered Git Assistant"));
  console.log(s.dim("  v" + packageJson.version));
  console.log();
  console.log(s.dim("  Developed by ") + s.text("Eren Çakar"));
  console.log();
  console.log(s.dim("  Web    ") + s.primary("erencakar.com"));
  console.log(s.dim("  GitHub ") + s.primary("github.com/sudoeren"));
  console.log(s.dim("  NPM    ") + s.primary("npmjs.com/package/eckra"));
  console.log();
  console.log(s.dim("  MIT License"));
  console.log();

  await pause();
}

module.exports = { doAbout };
