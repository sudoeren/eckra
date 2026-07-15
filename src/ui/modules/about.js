const boxen = require("boxen");
const packageJson = require("../../../package.json");
const { s, clear, pause } = require("../common");

async function doAbout() {
  clear();

  const content = [
    s.brand("ECKRA"),
    s.muted("AI-Powered Git Assistant"),
    s.dim("v" + packageJson.version),
    "",
    s.dim("Developed by") + " " + s.white.bold("Eren Çakar"),
    "",
    s.dim("Web   ") + s.primary("erencakar.com"),
    s.dim("GitHub") + " " + s.primary("github.com/sudoeren"),
    s.dim("NPM   ") + s.primary("npmjs.com/package/eckra"),
    "",
    s.dim("MIT License"),
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 4, right: 4 },
      margin: 1,
      borderStyle: "round",
      textAlignment: "center",
      minWidth: 50,
    }),
  );

  await pause();
}

module.exports = { doAbout };
