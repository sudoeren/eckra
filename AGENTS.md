# AGENTS.md

AI-powered Git management CLI (Node.js, CommonJS). Zero config required: run `eckra` in any git repo for the interactive dashboard. Node >= 20.

## Commands

- `npm test` — Jest (node env, verbose). Fast, fully mocked; no services required.
- `npm run lint` — ESLint + `prettier --check` on `src/**/*.js` and `tests/**/*.js`. Must pass before committing.
- `npm run lint:fix` — ESLint `--fix` + prettier `--write`.
- `npm run format` — prettier `--write` only.
- `node src/index.js` — run the CLI directly (this repo is itself the package; `npm start`).

Verification order: `npm run lint` then `npm test`.

## Release flow

`npm run release:patch|minor|major` runs `npm version <x> && git push --follow-tags`. Do **not** add `npm publish` to release scripts — a regression test (`tests/project.test.js`) fails if present, and publishing happens automatically via `.github/workflows/publish.yml` on a pushed `v*` tag (npm + GitHub Packages + GitHub release). CI (`ci.yml`) runs tests on Node 20 and 22; `publish.yml` uses Node 22.

## Architecture

- `src/index.js` — single entrypoint. `commander` CLI, defines subcommands + aliases (`c`=commit, `e`=easy, `st`=status, `p`=push, `t`=story, `s`=start). UI modules are **lazy-loaded** via `app()`/`require()` to keep startup fast — don't eagerly require UI modules at the top of index.js.
- `src/helpers/` — pure logic: `git.js` (wraps `simple-git`), `ai.js` (provider HTTP via axios), `config.js`, `patch.js`.
- `src/ui/` — all interaction: `app.js` (main menu loop), `common.js` (styles `s.*`, `clear`, `header`), `screen.js` (inquirer prompts, `spinner`/`done`/`fail`), `diff-view.js`.
- `src/ui/modules/` — one file per feature, each exporting `doXxx(info)` for the menu flow plus smaller helpers. Follow this pattern for new features; keep git/AI logic in `helpers/`.

## Gotchas

- **Module-level caches**: `helpers/config.js` caches config (`getConfig` returns the same object), `helpers/git.js` caches the simple-git instance, `helpers/ai.js` caches provider connection status. Tests must call `resetConfigCache()` / `resetGitCache()` / `resetAIConnectionCache()` in `beforeEach` (existing tests do this).
- **Config precedence**: defaults ← `~/.eckra/config.json` ← repo-local `.eckrarc` (searched up the directory tree). `.eckrarc` is gitignored because it can hold API keys. Global config is written with `0600` permissions — keep that security behavior.
- **Provider URLs**: `lmStudioUrl` / `ollamaUrl` are normalized (trailing slashes stripped) in `getConfig` so downstream path concatenation doesn't double up `/`.
- **Conventional commits**: AI-generated messages follow `type: subject` style; keep new commit messages consistent with the repo history (`feat:`, `fix:`, `refactor:`, `docs:`…).
- `.eckrarc`, `.eckra/`, `docs/`, `*.log` are gitignored.

## Style

- CommonJS (`require`/`module.exports`) everywhere — no ESM.
- Prettier: double quotes, semicolons, ES5 trailing commas, 80 cols.
- ESLint: `no-console` off (this is a CLI), unused args/vars must be prefixed `_`; `*.config.js` files are ignored.
