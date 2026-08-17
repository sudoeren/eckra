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

## What is eckra?

eckra is an interactive Git management tool. It analyzes your changes and suggests context-aware commit messages — no config required to get started.

## Features

- **AI commit messages** based on your actual diff (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio)
- **Select & edit** any suggestion before committing
- **Staged diff review** with syntax highlighting
- **Project story** — AI timeline of your commit history
- **Interactive dashboard** for staging, branches, stashes, and remotes

## Installation

```bash
npm install -g eckra
```

## Usage

Run `eckra` in any Git repository to open the dashboard:

```bash
eckra
```

Or jump straight into action:

| Command          | Alias | Action                          |
| :--------------- | :---- | :------------------------------ |
| `eckra commit`   | `c`   | AI-assisted commit flow         |
| `eckra status`   | `st`  | Status and staged files         |
| `eckra push`     | `p`   | Push to remote                  |
| `eckra easy`     | `e`   | Stage all, AI commit, push      |
| `eckra story`    | `t`   | AI project timeline             |
| `eckra start`    | `s`   | Interactive dashboard           |
| `eckra lazygit`  | `lg`  | Lazygit AI-commit integration   |
| `eckra config`   | `cfg` | View or edit config             |
| `eckra doctor`   | `dr`  | Health check                    |
| `eckra suggest`  | `sg`  | Print an AI commit message      |

> **Tip:** `eckra e` stages everything, commits with AI, and pushes in one go.

## Lazygit Integration

Use eckra's AI commit flow inside [lazygit](https://github.com/jesseduffield/lazygit):

```bash
eckra lazygit install
```

Restart lazygit, stage files, then press `C` in the files view. eckra opens full-screen, generates a commit message, and commits once you confirm.

Manage the integration:

```bash
eckra lazygit            # Status + YAML snippet
eckra lazygit install    # Add the custom command
eckra lazygit remove     # Remove it
```

## AI Configuration

eckra works out of the box with **LM Studio** (`http://localhost:1234`). Other providers are configured via the settings menu (`More > Settings`) or `~/.eckra/config.json`:

| Provider          | Type            | Default Model                |
| :---------------- | :-------------- | :--------------------------- |
| **LM Studio**     | Local           | — (user-configured)          |
| **Ollama**        | Local           | — (user-configured)          |
| **OpenAI**        | Cloud (API Key) | `gpt-5-mini`                 |
| **Anthropic**     | Cloud (API Key) | `claude-sonnet-4-6`          |
| **OpenRouter**    | Cloud (API Key) | `openai/gpt-oss-120b`        |
| **Google Gemini** | Cloud (API Key) | `gemini-3.1-flash-lite`       |

Per-repository overrides go in `.eckrarc` (gitignored — it can hold API keys).

### Config CLI

```bash
eckra config                    # Show config (secrets masked)
eckra config get aiProvider     # Print a value
eckra config set theme dark     # Set a value
eckra config unset aiInstruction# Remove a key
eckra config reset              # Restore defaults
eckra config path               # Config file path
```

Add `--local` to target the project's `.eckrarc` instead.

### Health check

`eckra doctor` checks Git, config, and the AI provider connection. Use `--no-provider` for an offline check or `--json` for CI. It exits with code `1` when any check fails.

### Scripts & CI

`eckra suggest` prints a commit message to stdout without any prompts:

```bash
eckra suggest                    # Message for staged changes
eckra suggest --all              # Stage everything first
eckra suggest --instruction "focus on the why"
```

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md).

## Uninstall

- **In-app:** `eckra` → **More > Settings** → **Uninstall Eckra** → type `uninstall`
- **Manual:**

```bash
npm uninstall -g eckra
rm -rf ~/.eckra
```

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.