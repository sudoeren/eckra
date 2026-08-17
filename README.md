<p align="center">
  <img src="https://raw.githubusercontent.com/sudoeren/eckra/master/screenshot.png" alt="eckra terminal preview" width="800">
</p>

# Eckra

**AI-powered Git assistant that analyzes your code changes and generates meaningful commit messages using OpenAI, Anthropic, Gemini, OpenRouter, Ollama, or LM Studio**

<p align="center">
  <a href="https://www.npmjs.com/package/eckra"><img src="https://img.shields.io/npm/dt/eckra?label=total%20downloads" alt="npm total downloads"></a>
  <a href="https://www.npmjs.com/package/eckra"><img src="https://img.shields.io/npm/v/eckra" alt="npm version"></a>
</p>

---

## Overview

**eckra** is an interactive Git management tool designed for developers who value both speed and clarity. It integrates with multiple AI providers to analyze your staged changes and suggest context-aware commit messages, ensuring your project history remains professional and descriptive without the manual overhead.

## Key Features

- **AI-Powered Suggestions**: Automatically generates commit messages based on actual code diffs. Supports **LM Studio**, **OpenAI**, **Anthropic**, **Ollama**, **OpenRouter**, and **Google Gemini**.
- **Select & Edit**: Pick an AI suggestion and refine it instantly to match your specific needs.
- **Staged Diff Review**: Inspect your changes in a beautiful, syntax-highlighted format directly before committing.
- **Project Story**: AI analyzes your commit history and generates a human-readable timeline — understand any repo's evolution at a glance.
- **Interactive Dashboard**: A comprehensive menu system for staging files, managing branches, stashing changes, and syncing with remotes.
- **Built for Speed**: Zero-config required for standard Git operations. Fast, responsive, and intuitive.

## Installation

Install eckra globally using npm:

```bash
npm install -g eckra
```

## Usage

Just type `eckra` in any Git repository to launch the interactive dashboard:

```bash
eckra
```

### Quick Commands

Skip the menu and jump straight into action:

| Command          | Alias | Action                                        |
| :--------------- | :---- | :-------------------------------------------- |
| `eckra commit`   | `c`   | Start the AI-assisted commit flow             |
| `eckra status`   | `st`  | Check repository status and staged files      |
| `eckra push`     | `p`   | Sync local commits with the remote repository |
| `eckra easy`     | `e`   | Full workflow: Stage all, AI commit, and push |
| `eckra story`    | `t`   | AI-generated project timeline from commit history |
| `eckra start`    | `s`   | Start the interactive dashboard               |
| `eckra config`   | `cfg` | View or edit configuration (non-interactive)  |
| `eckra doctor`   | `dr`  | Health check: git, config, AI provider        |
| `eckra suggest`  | `sg`  | Print an AI commit message (non-interactive)  |
| `eckra lazygit`  | `lg`  | Manage the lazygit AI-commit integration      |

> **Pro tip:** Use `eckra e` as a shortcut for the full automated workflow — it stages all changes, generates an AI commit message, and pushes in one go.

## AI Configuration

eckra supports multiple AI providers. You can switch between them using the built-in settings menu (`Settings > Change Provider`).

### Supported Providers

| Provider          | Type            | Default Model                |
| :---------------- | :-------------- | :--------------------------- |
| **LM Studio**     | Local           | — (user-configured)          |
| **Ollama**        | Local           | — (user-configured)          |
| **OpenAI**        | Cloud (API Key) | `gpt-5-mini`                 |
| **Anthropic**     | Cloud (API Key) | `claude-sonnet-4-6`          |
| **OpenRouter**    | Cloud (API Key) | `openai/gpt-oss-120b`        |
| **Google Gemini** | Cloud (API Key) | `gemini-3.1-flash-lite`       |

### Default Setup (LM Studio)

By default, eckra connects to **LM Studio**'s local server:

- **URL**: `http://localhost:1234`
- **Requirement**: Ensure LM Studio is running and the "Local Server" is started with a loaded model.

### Configuration

You can configure your provider in two ways:

1. **Interactive**: Run `eckra`, go to `More > Settings`, and select your provider and enter your credentials.
2. **Config file**: Edit `~/.eckra/config.json` directly:

```json
{
  "aiProvider": "openrouter",
  "openrouterApiKey": "sk-or-...",
  "openrouterModel": "anthropic/claude-3.5-sonnet"
}
```

You can also create a `.eckrarc` file in your project root to override global settings per-repository. `.eckrarc` is ignored by default because it may contain API keys; avoid committing provider secrets to your repository.

### CLI Config Commands

View, edit, and manage configuration without the interactive menu. These work from any directory (no Git repo required). API keys are masked by default — pass `--show-secrets` to reveal them.

```bash
eckra config                    # Show effective config (JSON, secrets masked)
eckra config get aiProvider     # Print a single value
eckra config set theme dark     # Set a value (writes to ~/.eckra/config.json)
eckra config unset aiInstruction# Remove a key
eckra config reset              # Restore defaults
eckra config path               # Print the config file path
```

Use `--local` to operate on the project's `.eckrarc` instead of the global config:

```bash
eckra config set aiProvider gemini --local
eckra config unset ollamaUrl --local
eckra config path --local
```

### Health Check

`eckra doctor` runs a series of health checks across three areas — Git, configuration, and the AI provider connection — and prints a pass/warn/fail report with an overall summary. It works from any directory.

```bash
eckra doctor             # Run all checks (live provider test)
eckra doctor --no-provider  # Skip the network check (offline)
eckra doctor --json      # Machine-readable JSON report (for scripts/CI)
```

It exits with code `1` when any check fails, making it usable in CI pipelines.

### Lazygit Integration

Use eckra's AI commit flow directly inside [lazygit](https://github.com/jesseduffield/lazygit). Install the integration with:

```bash
eckra lazygit install
```

If you don't have a lazygit config file yet (lazygit ships without one), `install` creates `~/.config/lazygit/config.yml` (and the folder) for you. It adds one custom command:

| Key | Action                                    |
| :-- | :---------------------------------------- |
| `C` | Open eckra's aicommits-style AI commit flow for the staged files |

Restart lazygit, stage files, then press `C` in the files view. eckra opens full-screen: it generates an AI commit message, shows it, asks for your confirmation, and commits once you approve.

Manage the integration:

```bash
eckra lazygit            # Show status + the YAML snippet
eckra lazygit install    # Add the custom command to lazygit's config
eckra lazygit remove     # Remove it
```

### aicommits-style Commits

`eckra commit` works like [aicommits](https://github.com/Nutlope/aicommits): generate a message, review it, confirm, and it commits:

```bash
git add <files...>
eckra commit
```

Options:

```bash
eckra commit -a                 # Stage all changes first
eckra commit -y                 # Skip the confirmation prompt
eckra commit -g 3               # Generate 3 messages to pick from
eckra commit -m "feat: manual"  # Commit with your own message
eckra commit --instruction "focus on tests"  # Steer the AI
eckra commit --no-commit        # Only show the message, don't commit
```

If you decline the AI message, eckra lets you write your own (or cancel). If the AI fails, it falls back to a manual message.

### Non-Interactive Commit Messages

For scripts and CI, `eckra suggest` prints a single AI commit message to stdout without any prompts:

```bash
eckra suggest                # Message for staged changes
eckra suggest --all          # Stage everything first
eckra suggest --instruction "focus on the why" --output .git/msg.txt
```

## Troubleshooting

| Problem | Likely Cause | Solution |
| :------ | :----------- | :------- |
| "This folder is not a Git repository!" | Not inside a git repo | Run `git init` or `cd` into a repo |
| "Not connected" (LM Studio / Ollama) | Local server not running | Start LM Studio server on `:1234` or Ollama on `:11434` |
| "AI Provider Error: 401" | Wrong or missing API key | Check `~/.eckra/config.json` or re-enter key via `Settings` menu |
| "AI returned no choices" | Invalid model name | Verify the model name in settings matches your provider |
| "AI returned empty or too short response" | Local model not loaded | Load a model in LM Studio / Ollama before using eckra |
| "Malformed config file" | Bad JSON in config | Fix or delete `~/.eckra/config.json` — defaults will be used |
| Push fails: "no upstream" | First push on a new branch | eckra auto-detects this and offers to set upstream for you |
| Rebase / cherry-pick failed | Merge conflicts | Resolve conflicts manually, then continue from the rebase menu |
| Timeout / "ECONNABORTED" | Provider slow or unreachable | Check your network, firewall, or provider status page |

## Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Uninstall

You can uninstall Eckra either from the app or manually:

### In-App Uninstall (Recommended)

1. Run `eckra` and go to **More > Settings**
2. Select **"Uninstall Eckra"**
3. Confirm by typing `uninstall`

This will remove all configuration files (`~/.eckra/`) and the global npm package.

### Manual Uninstall

```bash
npm uninstall -g eckra
rm -rf ~/.eckra
```

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.


