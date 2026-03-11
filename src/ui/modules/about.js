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
    chalk.cyan("\u001b]8;;http://erencakar.com\u0007Eren Çakar\u001b]8;;\u0007"),
    "",
    chalk.blue("https://github.com/sudoeren/eckra"),
    chalk.blue("https://www.npmjs.com/package/eckra"),
    "",
    chalk.dim("License: MIT"),
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
