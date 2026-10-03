// The one place that talks to inquirer.
//
// The UI describes prompts the way inquirer 8 did (`type: "list"`,
// `type: "autocomplete"`, `{ type: "separator", line }`, `prefix`), and
// `ask()` translates that for the current inquirer, which renamed those
// types and moved styling into a `theme`.

// Loaded on the first prompt: commands that never ask anything shouldn't
// pay for it. inquirer is ESM-only, so require() hands back the module
// namespace.
let _inquirer = null;
function getInquirer() {
  if (!_inquirer) {
    const inquirerModule = require("inquirer");
    _inquirer = inquirerModule.default || inquirerModule;
  }
  return _inquirer;
}

const TYPE_ALIASES = { list: "select", autocomplete: "search" };
const DEFAULT_PAGE_SIZE = 7;

function adaptChoice(choice) {
  if (choice && typeof choice === "object" && choice.type === "separator") {
    const { Separator } = getInquirer();
    return new Separator(choice.line || choice.separator);
  }
  return choice;
}

/**
 * Translate one inquirer-8 style question.
 */
function adaptQuestion(question) {
  const type = TYPE_ALIASES[question.type] || question.type || "input";
  const { prefix, source, ...rest } = question;
  const adapted = { ...rest, type };
  const theme = { ...(question.theme || {}) };

  if (prefix !== undefined && prefix !== null) theme.prefix = prefix;

  if (Array.isArray(question.choices)) {
    adapted.choices = question.choices.map(adaptChoice);
  }

  if (type === "select" || type === "search") {
    // The menus speak for themselves; no "↑↓ navigate" line under each.
    theme.style = { keysHelpTip: () => undefined, ...(theme.style || {}) };
  }

  if (type === "select") {
    // `loop` makes the highlight wrap around, but on a list longer than
    // the page inquirer then also scrolls the items in an endless circle.
    // Wrap only when the whole list is on screen.
    const pageSize = question.pageSize || DEFAULT_PAGE_SIZE;
    adapted.loop =
      question.loop !== false &&
      Array.isArray(question.choices) &&
      question.choices.length <= pageSize;
  }

  if (type === "search") {
    // inquirer 8's autocomplete called source(answers, input).
    adapted.source = async (term) =>
      (await source({}, term || "")).map(adaptChoice);
  }

  if (Object.keys(theme).length > 0) adapted.theme = theme;
  return adapted;
}

/**
 * Ask one question or a list of them; resolves to the answers by name.
 * Ctrl+C ends the program like any other interrupt instead of surfacing
 * as a rejected prompt.
 */
async function ask(questions, ...rest) {
  const list = Array.isArray(questions) ? questions : [questions];
  try {
    return await getInquirer().prompt(list.map(adaptQuestion), ...rest);
  } catch (error) {
    if (error && error.name === "ExitPromptError") {
      process.kill(process.pid, "SIGINT");
      // The signal handler exits; don't let the caller carry on meanwhile.
      return new Promise(() => {});
    }
    throw error;
  }
}

module.exports = { ask, adaptQuestion };
