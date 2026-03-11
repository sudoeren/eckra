const boxen = require("boxen");
const chalk = require("chalk");
const packageJson = require("../../../package.json");
const { clear, pause } = require("../common");

async function doAbout() {
  clear();

  const content = [
    chalk.cyan.bold("ECKRA"),
    chalk.gray("AI-Powered Git Assistant"),
    chalk.dim("v" + packageJson.version),
    "",
    chalk.dim("Developed by") + " " + chalk.white.bold("Eren Çakar"),
    "",
    chalk.dim("Web   ") + chalk.cyan("erencakar.com"),
    chalk.dim("GitHub") + " " + chalk.cyan("github.com/sudoeren"),
    chalk.dim("NPM   ") + chalk.cyan("npmjs.com/package/eckra"),
    "",
    chalk.dim("MIT License"),
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 4, right: 4 },
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
      textAlignment: "center",
      minWidth: 50,
    }),
  );

  await pause();
}

module.exports = { doAbout };
