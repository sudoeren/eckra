/**
 * Legacy wrapper for backward compatibility.
 * Use src/helpers/ai.js instead.
 */
const ai = require("./ai");

module.exports = {
  generateCommitMessage: ai.generateCommitMessage,
  checkLMStudioConnection: ai.checkAIConnection,
  generateCommitSuggestions: ai.generateCommitSuggestions,
};