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

## Testing

We use **Jest** for testing. To run the tests:

```bash
npm test
```

Please ensure that all tests pass before submitting a pull request. Adding new tests for new features is highly encouraged.

## Architecture

The project is structured into three main layers:

### 1. Entry Point (`src/index.js`)

Handles CLI command definitions using `commander`. It routes commands to the appropriate UI or helper functions.

### 2. UI Layer (`src/ui/`)

Responsible for all user interactions.

- **`app.js`**: The main application loop and dashboard menu.
- **`common.js`**: Shared styles, icons, and UI utility functions (like `clear`, `header`, `box`).
- **`modules/`**: Contains individual feature modules. Each module (e.g., `commit.js`, `status.js`) handles a specific git flow.

#### UI Module Pattern

Most UI modules follow this pattern:

```javascript
async function doFeature(info) {
  // 1. Clear screen and show header
  clear();
  header();

  // 2. Perform logic or ask questions via inquirer
  const { choice } = await inquirer.prompt([...]);

  // 3. Execute git/helper operations
  // 4. Show results/feedback
}
```

### 3. Helpers (`src/helpers/`)

Core business logic separated from the UI.

- **`git.js`**: Wraps `simple-git` for all Git operations.
- **`ai.js`**: Handles communication with AI providers (LM Studio, OpenAI, Anthropic, Ollama, OpenRouter, Google Gemini) for commit message suggestions.
- **`config.js`**: Manages user configuration.
- **`patch.js`**: Utilities for handling git patches and diffs.

## Style Guide

- Use the styles defined in `src/ui/common.js` (e.g., `s.primary`, `s.success`) to maintain visual consistency.
- Prefer `inquirer` for interactive prompts.
- Keep UI logic in `src/ui/modules` and Git/AI logic in `src/helpers`.

## Pull Request Process

1. Create a new branch for your feature or bugfix.
2. Make your changes and add tests if applicable.
3. Ensure `npm test` passes.
4. Commit your changes with a clear and descriptive message.
5. Submit a pull request!
