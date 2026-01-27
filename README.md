# Eckra

Eckra is a CLI tool that wraps standard Git commands in an interactive terminal interface. It integrates with various AI models (OpenAI, Anthropic, Ollama, LM Studio) to automate commit message generation based on your diffs.

It is designed to speed up routine Git tasks like staging, committing, branch management, and conflict resolution without leaving the keyboard or memorizing complex flags.

## Installation

You can install it globally or run it directly from the source.

### From Source

1.  Clone the repo:
    ```bash
    git clone https://github.com/yourusername/eckra.git
    cd eckra
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Link command:
    ```bash
    npm link
    ```

Now you can use the `eckra` command in any directory.

## Getting Started

Run the tool in your git repository:

```bash
eckra
```

This opens the main dashboard. You can navigate menus using arrow keys.

### Command Line Arguments

If you prefer skipping the menu for specific tasks:

*   `eckra status` - View changed files.
*   `eckra commit` - Go straight to the AI commit generation flow.
*   `eckra push` - Push current branch.

## AI Configuration

Eckra supports multiple AI providers. You can switch between them in the **Settings** menu.

*   **LM Studio**: Default. Connects to `http://localhost:1234`. Good for offline use.
*   **Ollama**: Connects to `http://localhost:11434`.
*   **OpenAI**: Requires an API Key.
*   **Anthropic**: Requires an API Key.

The tool will send the `git diff` of your staged files to the selected provider to generate a Conventional Commit message.

## Configuration (.eckrarc)

Eckra looks for configuration in two places:
1.  **Global**: `~/.eckra/config.json` (User defaults)
2.  **Local**: `.eckrarc` (Project specific)

Local configuration overrides global settings. This is useful if you work on different projects that require different commit styles or AI instructions.

**Example `.eckrarc` content:**

```json
{
  "aiProvider": "ollama",
  "ollamaModel": "llama3",
  "aiInstruction": "Keep messages under 50 chars. No punctuation at the end."
}
```

## Features

*   **Partial Staging**: Select specific file chunks (hunks) to stage.
*   **Visual Graph**: Displays `git log --graph` inside the terminal.
*   **Branch Management**: Create, delete, switch, and compare branches (shows ahead/behind counts).
*   **Stash**: Interactive list to apply, pop, or drop specific stashes.
*   **Conflict Resolution**: UI for choosing 'ours', 'theirs', or launching a manual editor for merge conflicts.

## Development

The project uses `simple-git` for Git operations and `inquirer` for the UI.

To run the test suite:

```bash
npm test
```

Tests cover configuration logic, AI provider switching, and patch parsing utilities.