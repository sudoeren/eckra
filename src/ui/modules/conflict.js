const { execFile } = require("child_process");
const {
  getConflictDetails,
  getConflictedDiff,
  acceptOurs,
  acceptTheirs,
  acceptBoth,
  abortMerge,
  stageFiles,
  readConflictedFile,
  writeResolvedFile,
} = require("../../helpers/git");
const {
  parseConflicts,
  getConflicts,
  applyResolutions,
  describeConflicts,
} = require("../../helpers/conflict");
const { generateConflictResolution } = require("../../helpers/ai");
const { s, pause, sleep } = require("../common");
const {
  open,
  menuItem,
  backItem,
  sep,
  prompt,
  spinner,
  fail,
} = require("../screen");
const { renderDiff } = require("../diff-view");
const { renderMarkdown } = require("../markdown");

// Lines of each side shown in the AI preview before it is cut short.
const PREVIEW_LINES = 12;

async function doConflict() {
  open("Conflict Resolver");

  const conflicts = await getConflictDetails();

  if (conflicts.length === 0) {
    console.log(s.success(`  ${s.text("✓")} No conflicts!\n`));
    await pause();
    return;
  }

  const diff = await getConflictedDiff();
  const lines = renderDiff(diff);
  if (lines.length > 0) {
    console.log(s.bold(`  ${conflicts.length} conflicted file(s) — diff:\n`));
    for (const line of lines) console.log(line);
    console.log();
    await pause();
  }

  const { action } = await prompt([
    {
      type: "list",
      name: "action",
      message: s.muted(`Found ${conflicts.length} conflicted files:`),
      choices: [
        menuItem("Resolve file by file", "text", "each"),
        menuItem("Accept all 'ours'", "success", "ours"),
        menuItem("Accept all 'theirs'", "primary", "theirs"),
        sep(),
        menuItem("Abort merge", "danger", "abort"),
        backItem(),
      ],
      pageSize: 20,
    },
  ]);

  if (action === "back") return;

  if (action === "each") {
    for (const file of conflicts) {
      await resolveFile(file);
    }
  } else if (action === "ours") {
    for (const file of conflicts) await acceptOurs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'ours'!"));
  } else if (action === "theirs") {
    for (const file of conflicts) await acceptTheirs(file);
    console.log(s.success("\n  ✓ All conflicts resolved as 'theirs'!"));
  } else if (action === "abort") {
    await abortMerge();
    console.log(s.warning("\n  Merge aborted."));
  }

  await sleep(600);
}

function printSide(label, lines, style) {
  console.log(s.muted(`    ${label}`));
  if (lines.length === 0) console.log(s.dim("      (nothing)"));
  lines
    .slice(0, PREVIEW_LINES)
    .forEach((line) => console.log(style("      " + line)));
  if (lines.length > PREVIEW_LINES) {
    console.log(s.dim(`      … ${lines.length - PREVIEW_LINES} more lines`));
  }
}

/**
 * Ask the AI for a resolution, show it next to both sides, and apply it
 * only when the user accepts. Returns true when the file was resolved.
 */
async function suggestWithAI(file) {
  const content = await readConflictedFile(file);
  const parsed = content === null ? null : parseConflicts(content);
  const conflicts = parsed ? getConflicts(parsed) : [];
  if (conflicts.length === 0) {
    console.log(
      s.warning(
        "\n  No conflict markers in this file (deleted on one side, or binary). Pick ours or theirs instead."
      )
    );
    await pause();
    return false;
  }

  const spin = spinner(
    `Asking AI to resolve ${conflicts.length} conflict(s)...`
  );
  spin.start();
  let suggestion;
  let resolved;
  try {
    suggestion = await generateConflictResolution({
      file,
      description: describeConflicts(parsed),
      count: conflicts.length,
    });
    resolved = applyResolutions(parsed, suggestion.resolutions);
    spin.stop();
  } catch (err) {
    fail(spin, `AI error: ${err.message}`);
    await pause();
    return false;
  }

  open(
    `AI suggestion: ${file}`,
    "Review it before applying; nothing is changed yet."
  );
  conflicts.forEach((conflict, i) => {
    console.log(
      s.bold(
        `  Conflict ${i + 1} of ${conflicts.length}` +
          s.dim(`  (line ${conflict.line})`)
      )
    );
    printSide(`Ours (${conflict.oursLabel}):`, conflict.ours, s.muted);
    printSide(`Theirs (${conflict.theirsLabel}):`, conflict.theirs, s.muted);
    printSide(
      "Suggested:",
      suggestion.resolutions[i] === ""
        ? []
        : suggestion.resolutions[i].split(/\r?\n/),
      s.success
    );
    console.log();
  });
  if (suggestion.explanation) {
    console.log(s.ai("  Why"));
    renderMarkdown(suggestion.explanation).forEach((line) => console.log(line));
    console.log();
  }

  const { apply } = await prompt([
    {
      type: "list",
      name: "apply",
      message: s.muted("Use this resolution?"),
      choices: [
        menuItem("Apply and stage the file", "success", true),
        backItem("Back (leave the file as it is)", false),
      ],
      pageSize: 5,
    },
  ]);
  if (!apply) return false;

  try {
    await writeResolvedFile(file, resolved);
    console.log(s.success(`\n  ✓ ${file} resolved and staged.`));
    await sleep(600);
    return true;
  } catch (err) {
    console.log(s.error(`\n  ✗ ${err.message}`));
    await pause();
    return false;
  }
}

async function askResolution(file) {
  open(`Resolving: ${file}`);

  const { choice } = await prompt([
    {
      type: "list",
      name: "choice",
      message: s.muted(`How to resolve ${file}?`),
      choices: [
        menuItem("Suggest a resolution with AI", "ai", "ai"),
        menuItem("Accept 'Ours' (Current Branch)", "success", "ours"),
        menuItem("Accept 'Theirs' (Incoming Branch)", "primary", "theirs"),
        menuItem(
          "Accept Both (Keep markers for manual merge)",
          "warning",
          "both"
        ),
        menuItem("Edit manually (Opens default editor)", "warning", "manual"),
        menuItem("Skip for now", "muted", "skip"),
      ],
      pageSize: 15,
    },
  ]);
  return choice;
}

async function resolveFile(file) {
  // Declining an AI suggestion comes back here to choose something else.
  let choice;
  do {
    choice = await askResolution(file);
  } while (choice === "ai" && !(await suggestWithAI(file)));
  if (choice === "ai") return;

  if (choice === "ours") await acceptOurs(file);
  if (choice === "theirs") await acceptTheirs(file);
  if (choice === "both") await acceptBoth(file);
  if (choice === "manual") {
    const editor =
      process.env.EDITOR || (process.platform === "win32" ? "notepad" : "code");
    console.log(s.muted(`  Opening ${editor}...`));
    // EDITOR may include flags (e.g. "code --wait"); split it ourselves
    // instead of routing through a shell, so a crafted value can't inject
    // commands.
    const launch = (target) => {
      const [bin, ...args] = editor.trim().split(/\s+/);
      return execFile(bin, [...args, target], { stdio: "inherit" });
    };
    try {
      await new Promise((resolve, reject) => {
        const child = launch(file);
        child.on("close", resolve);
        child.on("error", reject);
      });
    } catch (err) {
      console.log(s.error(`  Could not launch ${editor}: ${err.message}`));
      console.log(
        s.muted(
          `  Resolve the conflicts in ${file} manually, then run: git add ${file}`
        )
      );
      return;
    }

    await prompt([
      {
        type: "input",
        name: "done",
        message: s.success(
          "  Press Enter once you saved the file and resolved conflicts..."
        ),
      },
    ]);

    // After manual edit, we should add the file to mark as resolved
    await stageFiles([file]);
  }
}

module.exports = { doConflict };
