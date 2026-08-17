# Contributing to eckra

Thank you for your interest in contributing to eckra! This guide will help you get started with the development environment and understand the project structure.

## Getting Started

### Prerequisites

- **Node.js**: Version 20.0.0 or higher.
- **Git**: Installed and configured on your system.
- **LM Studio** (Optional): For local AI-powered features. Other supported providers include OpenAI, Anthropic, Ollama, OpenRouter, and Google Gemini.

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/sudoeren/eckra.git
   cd eckra
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development mode:
   ```bash
   npm start
   ```

## Testing & Linting

We use **Jest** for testing and **ESLint + Prettier** for code style. Before committing:

```bash
npm run lint
npm test
```

Please ensure both pass before submitting a pull request. Adding new tests for new features is highly encouraged.

## Architecture

The project is structured into three main layers:

### 1. Entry Point (`src/index.js`)

Handles CLI command definitions using `commander`. It routes commands to the appropriate UI or helper functions.

### 2. UI Layer (`src/ui/`)

Responsible for all user interactions.

- **`app.js`**: The main application loop and dashboard menu.
- **`common.js`**: Shared theme-aware styles (`s.primary`, `s.success`, ...) and UI utilities (`clear`, `header`, `pause`).
- **`screen.js`**: Inquirer prompt wrappers and `spinner` / `done` / `fail` feedback helpers.
- **`modules/`**: Contains individual feature modules. Each module (e.g., `commit.js`, `status.js`) handles a specific git flow.

#### UI Module Pattern

Most UI modules follow this pattern:

```javascript
const { open, menuItem, backItem, prompt } = require("../screen");

async function doFeature(info) {
  // 1. Clear the screen and show the feature header
  open("Feature");

  // 2. Ask questions via the themed prompt helper
  const { choice } = await prompt([
    {
      type: "list",
      name: "choice",
      message: "Action:",
      choices: [menuItem("Option A", "primary", "a"), backItem()],
    },
  ]);

  // 3. Execute git/helper operations
  // 4. Show results/feedback with spinner/done/fail
}
```

### 3. Helpers (`src/helpers/`)

Core business logic separated from the UI.

- **`git.js`**: Wraps `simple-git` for all Git operations.
- **`ai.js`**: Handles communication with AI providers (LM Studio, OpenAI, Anthropic, Ollama, OpenRouter, Google Gemini) for commit message suggestions.
- **`config.js`**: Manages user configuration (global `~/.eckra/config.json` + repo-local `.eckrarc`).
- **`patch.js`**: Utilities for handling git patches and diffs.
- **`lazygit.js`**: Manages the lazygit custom-command integration (configurable key).
- **`suggest.js`**: Non-interactive AI commit message generation (`eckra suggest`).
- **`doctor.js`**: Health checks for git, config, and the AI provider.

## Style Guide

- Use the styles defined in `src/ui/common.js` (e.g., `s.primary`, `s.success`) to maintain visual consistency.
- Use the themed `prompt` helper from `src/ui/screen.js` for interactive prompts (not raw `inquirer`).
- Keep UI logic in `src/ui/modules` and Git/AI logic in `src/helpers`.

## Pull Request Process

1. Create a new branch for your feature or bugfix.
2. Make your changes and add tests if applicable.
3. Ensure `npm test` passes.
4. Commit your changes with a clear and descriptive message.
5. Submit a pull request!
