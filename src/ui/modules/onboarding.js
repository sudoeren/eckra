const autocomplete = require("inquirer-autocomplete-prompt");
const inquirer = require("inquirer");
const boxen = require("boxen");
const {
  saveConfig,
  saveAIConnection,
  DEFAULT_CONFIG,
} = require("../../helpers/config");
const {
  PROVIDER_CHOICES: REGISTRY_CHOICES,
} = require("../../helpers/providers");
const { s, clear, sleep } = require("../common");
const { prompt } = require("../screen");

inquirer.registerPrompt("autocomplete", autocomplete);

/**
 * Onboarding workflow for new users
 */
async function doOnboarding() {
  clear();

  const welcome = boxen(
    s.brand("Welcome to Eckra! 🚀\n\n") +
      s.text("Your AI-powered Git management companion.\n") +
      s.muted("Let's get you set up in less than a minute."),
    {
      padding: 1,
      borderStyle: "round",
      borderColor: "cyan",
      textAlign: "center",
    }
  );

  console.log("\n" + welcome + "\n");

  // Choose provider (single registry source)
  const { provider } = await prompt([
    {
      type: "autocomplete",
      name: "provider",
      message: "Which AI provider would you like to use? (type to search)",
      source: (_answers, input) => {
        if (!input) return REGISTRY_CHOICES;
        const term = input.toLowerCase();
        return REGISTRY_CHOICES.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.value.toLowerCase().includes(term)
        );
      },
    },
  ]);

  const { getProviderQuestions } = require("../../helpers/providers");
  const credQuestions = getProviderQuestions(provider, DEFAULT_CONFIG);
  let answers = {};
  if (credQuestions.length > 0) {
    answers = await prompt(credQuestions);
  }

  const modelAnswers = await require("./settings").promptModelSearch(
    provider,
    answers,
    DEFAULT_CONFIG
  );
  answers = { ...answers, ...modelAnswers };

  const { COMMIT_FORMATS } = require("../../helpers/ai");
  const COMMIT_TYPE_LABELS = {
    "conventional+body": "Conventional + body (recommended)",
    conventional: "Conventional (subject only)",
    gitmoji: "Gitmoji (emoji prefix)",
    "subject+body": "Subject + body",
    plain: "Plain (simple subject)",
  };
  const { commitType } = await prompt([
    {
      type: "list",
      name: "commitType",
      message: "Preferred commit message format?",
      choices: COMMIT_FORMATS.map((value) => ({
        name: COMMIT_TYPE_LABELS[value] || value,
        value,
      })),
      default: DEFAULT_CONFIG.commitType,
      pageSize: 10,
    },
  ]);
  // Connections-first: onboarding result becomes the `default` connection
  const { resetAIConnectionCache } = require("../../helpers/ai");
  saveAIConnection("default", { provider, ...answers }, { activate: true });
  resetAIConnectionCache();
  saveConfig({ commitType, onboarded: true, theme: "auto" });

  clear();
  console.log(
    boxen(
      s.success("Configuration complete! ✓\n\n") +
        s.text("You can always change these settings in: ") +
        s.primary("More > Settings"),
      { padding: 1, borderStyle: "round", borderColor: "green" }
    )
  );

  await sleep(1500);
}

module.exports = { doOnboarding };
