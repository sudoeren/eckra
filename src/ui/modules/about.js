const boxen = require("boxen");
const chalk = require("chalk");
const packageJson = require("../../../package.json");
const { clear, pause } = require("../common");

async function doAbout() {
  clear();

  const content = [
    chalk.cyan.bold("E C K R A"),
    chalk.white("AI-Powered Git Assistant"),
    chalk.gray(`version ${packageJson.version}`),
    "",
    chalk.dim("Developed by"),
    chalk.cyan("Eren Çakar"),
    "",
    chalk.dim("github.com/erencakkar/eckra"),
    chalk.dim("npmjs.com/package/eckra"),
    chalk.dim("License: MIT")
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 4, right: 4 },
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
      textAlignment: "center",
      minWidth: 40
    })
  );

  await pause();
}

module.exports = { doAbout };