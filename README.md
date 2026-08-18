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

- **Works out of the box with [Ollama](https://ollama.com)**: no API key needed to start, cloud providers are optional
- **Interactive dashboard**: manage staging, branches, stashes, and remotes from one menu
- **AI commit messages** based on your actual diff, with 11 AI providers (OpenAI, Anthropic, Gemini, DeepSeek, Amazon Bedrock, OpenCode Go, and more; see the [provider table](#ai-configuration))
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

> [!NOTE]
> On first run, eckra walks you through a quick setup wizard. You can re-run the setup anytime with `eckra setup`.

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
| `eckra setup`   |       | Run the setup/onboarding wizard |

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

### CLI options

`eckra commit` flags:

| Flag                   | Alias | Action                                 |
| :--------------------- | :---- | :------------------------------------- |
| `--message <text>`     | `-m`  | Commit with this message, skip AI      |
| `--all`                | `-a`  | Stage all changes before generating    |
| `--yes`                | `-y`  | Skip the confirmation prompt           |
| `--generate <count>`   | `-g`  | Generate N messages to pick from       |
| `--instruction <text>` |       | Extra instruction for the AI           |
| `--no-commit`          |       | Only generate and show the message     |

Other commands:

```bash
eckra suggest --all --instruction "focus on the why"   # non-interactive, stdout
eckra suggest --output commit-msg.txt                  # write to a file (CI-friendly)
eckra story --count 20                                 # analyze the last 20 commits
```

## AI Configuration

eckra works out of the box with **Ollama** (`http://localhost:11434`) using the lightweight [qwen3.5:2b](https://ollama.com/library/qwen3.5:2b) model:

```bash
ollama pull qwen3.5:2b
```

### Local providers (no API key)

| Provider      | Setup                                          | Default Model     |
| :------------ | :--------------------------------------------- | :---------------- |
| **Ollama**    | Local server, default `http://localhost:11434` | `qwen3.5:2b`      |
| **LM Studio** | Local server, default `http://localhost:1234`  | (user-configured) |

### Cloud providers (API key)

| Provider                  | Requires                                                     | Default Model             |
| :------------------------ | :----------------------------------------------------------- | :------------------------ |
| **OpenAI**                | OpenAI API key                                               | `gpt-5-mini`              |
| **Anthropic (Claude)**    | Anthropic API key                                            | `claude-sonnet-4-6`       |
| **Google Gemini**         | Google AI Studio API key                                     | `gemini-3.1-flash-lite`   |
| **OpenRouter**            | OpenRouter API key                                           | `openai/gpt-oss-120b`     |
| **DeepSeek**              | DeepSeek API key                                             | `deepseek-chat`           |
| **OpenCode Go**           | OpenCode Go API key                                          | `deepseek-v4-flash`       |
| **Ollama Cloud**          | Ollama Cloud API key (ollama.com/settings/keys)              | `qwen3.5:2b`              |
| **Amazon Bedrock**        | Bedrock API key + AWS Region (`bedrock-runtime` endpoint)    | `us.anthropic.claude-sonnet-4-6` |
| **Amazon Bedrock Mantle** | Bedrock API key + AWS Region (`bedrock-mantle` endpoint)     | `us.anthropic.claude-sonnet-4-6` |

Providers are configured via the settings menu (`More > Settings`) or `~/.eckra/config.json`. eckra fetches the available models for you.

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

### Updating

`eckra update` checks the npm registry and upgrades the global package:

```bash
eckra update            # Check and update (asks for confirmation)
eckra update --check    # Check only (exit code 1 if an update is available)
eckra update --yes      # Update without confirmation
```

You can also check from the menu: **More > Check for Updates**.

> [!NOTE]
> Running eckra via `npx eckra` always uses the latest version, no update needed.

### Scripts & CI

`eckra suggest` prints a commit message to stdout without any prompts:

```bash
eckra suggest                    # Message for staged changes
eckra suggest --all              # Stage everything first
eckra suggest --instruction "focus on the why"
```

## Troubleshooting

- **"AI Provider Error" / connection failed**: run `eckra doctor` to see exactly what's failing, then check the API key and model in **More > Settings**.
- **Ollama errors**: make sure the server is running (`ollama serve`) and the model is pulled: `ollama pull qwen3.5:2b`.
- **401 Unauthorized**: the API key is wrong or expired. Re-enter it in **More > Settings** or set it via `eckra config set <key> <value>`.
- **AI returns a warning or empty message**: some providers flag safe content; try a different model or check the provider's dashboard for rate limits.
- **Large diffs are truncated**: prompts are capped at 2000 characters by design. Commit in smaller chunks or stage related files only.

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