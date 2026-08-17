<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/sudoeren/eckra@master/eckra.png" alt="eckra terminal preview" width="800">
</p>

<h1 align="center">Eckra</h1>

<p align="center">
  <strong>AI-powered Git management: commits, stories, and the whole repo in one place</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/eckra"><img src="https://img.shields.io/npm/v/eckra?style=flat-square&color=1f6feb" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/eckra"><img src="https://img.shields.io/npm/dt/eckra?style=flat-square&color=1f6feb" alt="total downloads"></a>
  <a href="https://github.com/sudoeren/eckra/actions"><img src="https://img.shields.io/github/actions/workflow/status/sudoeren/eckra/ci.yml?style=flat-square&color=1f6feb" alt="CI status"></a>
</p>

---

## What is eckra?

eckra is an interactive, AI-powered Git management tool. It writes context-aware commit messages, turns your commit history into readable project stories, and brings staging, branches, stashes, and remotes into one dashboard. No config required to get started.

## Features

- **Interactive dashboard**: manage staging, branches, stashes, and remotes from one menu
- **AI commit messages** based on your actual diff (OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio)
- **Select & edit** any suggestion before committing
- **Staged diff review** with syntax highlighting
- **Project story**: AI timeline of your commit history
- **Lazygit integration**: run eckra's commit flow inside lazygit

## Installation

Install eckra globally:

```bash
npm install -g eckra
```

eckra can bind directly to [lazygit](https://github.com/jesseduffield/lazygit) right after installing:

```bash
eckra lazygit install
```

Then press `C` in lazygit's files view for an AI commit.

## Usage

Run `eckra` in any Git repository to open the dashboard:

```bash
eckra
```

Or jump straight into action:

| Command         | Alias | Action                        |
| :-------------- | :---- | :---------------------------- |
| `eckra commit`  | `c`   | AI-assisted commit flow       |
| `eckra status`  | `st`  | Status and staged files       |
| `eckra push`    | `p`   | Push to remote                |
| `eckra easy`    | `e`   | Stage all, AI commit, push (confirms each step) |
| `eckra story`   | `t`   | AI project timeline           |
| `eckra start`   | `s`   | Interactive dashboard         |
| `eckra lazygit` | `lg`  | Lazygit AI-commit integration |
| `eckra config`  | `cfg` | View or edit config           |
| `eckra doctor`  | `dr`  | Health check                  |
| `eckra suggest` | `sg`  | Print an AI commit message    |

> [!TIP]
> `eckra e` stages everything, generates an AI message, and asks you before committing and pushing.

### Lazygit Integration

Use eckra's AI commit flow inside [lazygit](https://github.com/jesseduffield/lazygit):

```bash
eckra lazygit install
```

1. Restart lazygit and stage your files
2. Open the **files view** and press **`C`** (uppercase)
3. Review the generated commit message and confirm

eckra opens full-screen, writes the message, and commits once you approve.

#### Change the shortcut key

The key defaults to `C` (uppercase). If it collides with a lazygit shortcut you already use, pick another letter:

```bash
eckra config set lazygitKey g
eckra lazygit install    # re-applies the new key to lazygit's config
```

eckra warns you when the chosen letter is bound by a default lazygit shortcut, but lets you keep it anyway.

Manage the integration:

```bash
eckra lazygit            # Status + YAML snippet
eckra lazygit install    # Add the custom command
eckra lazygit remove     # Remove it
```

## AI Configuration

eckra works out of the box with **Ollama** (`http://localhost:11434`) using the lightweight [qwen3.5:2b](https://ollama.com/library/qwen3.5:2b) model:

```bash
ollama pull qwen3.5:2b
```

Other providers are configured via the settings menu (`More > Settings`) or `~/.eckra/config.json`:

| Provider          | Type            | Default Model           |
| :---------------- | :-------------- | :---------------------- |
| **Ollama**        | Local           | `qwen3.5:2b`            |
| **LM Studio**     | Local           | (user-configured)       |
| **OpenAI**        | Cloud (API Key) | `gpt-5-mini`            |
| **Anthropic**     | Cloud (API Key) | `claude-sonnet-4-6`     |
| **OpenRouter**    | Cloud (API Key) | `openai/gpt-oss-120b`   |
| **Google Gemini** | Cloud (API Key) | `gemini-3.1-flash-lite` |

> [!NOTE]
> Per-repository overrides go in `.eckrarc` (gitignored, as it can hold API keys).

### Config CLI

```bash
eckra config                    # Show config (secrets masked)
eckra config get aiProvider     # Print a value
eckra config set theme dark     # Set a value
eckra config unset aiInstruction# Remove a key
eckra config reset              # Restore defaults
eckra config path               # Config file path
```

> [!NOTE]
> Add `--local` to target the project's `.eckrarc` instead.

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

- **In-app:** `eckra` → **More > Settings** → **Uninstall Eckra** → type `uninstall`. This also removes the lazygit integration.
- **Manual:**

```bash
eckra lazygit remove   # remove the lazygit integration first (if you have it)
npm uninstall -g eckra
rm -rf ~/.eckra
```

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.