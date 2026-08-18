const {
  parseRefs,
  buildGraphLayout,
  LANE_COLORS,
} = require("../src/helpers/graph");

const commit = (hash, parents, subject = "") => ({ hash, parents, subject });

const chars = (rows) =>
  rows.map((r) =>
    r.cells
      .map((c) => (c ? c.char : " "))
      .join("")
      .replace(/\s+$/, "")
  );

describe("parseRefs", () => {
  test("handles empty decorations", () => {
    expect(parseRefs("")).toEqual({
      head: null,
      branches: [],
      tags: [],
      remotes: [],
    });
    expect(parseRefs(null)).toEqual({
      head: null,
      branches: [],
      tags: [],
      remotes: [],
    });
  });

  test("parses HEAD -> branch, tag and remote", () => {
    const r = parseRefs("HEAD -> main, tag: v1.4.10, origin/main", ["origin"]);
    expect(r.head).toBe("HEAD");
    expect(r.branches).toEqual(["main"]);
    expect(r.tags).toEqual(["v1.4.10"]);
    expect(r.remotes).toEqual(["origin/main"]);
  });

  test("parses branch and remote without HEAD", () => {
    const r = parseRefs("feature, origin/feature", ["origin"]);
    expect(r.head).toBeNull();
    expect(r.branches).toEqual(["feature"]);
    expect(r.remotes).toEqual(["origin/feature"]);
  });

  test("parses a bare HEAD with no branch", () => {
    const r = parseRefs("HEAD");
    expect(r.head).toBe("HEAD");
    expect(r.branches).toEqual([]);
  });

  test("keeps slashed local branches as branches when no remote matches", () => {
    const r = parseRefs("feature/x, origin/y", ["origin"]);
    expect(r.branches).toEqual(["feature/x"]);
    expect(r.remotes).toEqual(["origin/y"]);
  });
});

describe("buildGraphLayout", () => {
  test("linear history renders plain nodes with a stable lane color", () => {
    const rows = buildGraphLayout([
      commit("a", ["b"], "two"),
      commit("b", ["c"], "one"),
      commit("c", [], "root"),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.type === "node")).toBe(true);
    expect(chars(rows)).toEqual(["●", "●", "●"]);
    expect(rows[0].commit.subject).toBe("two");
    expect(rows[0].cells[0].color).toBe("primary");
  });

  test("simple branch + merge matches git's topology", () => {
    const rows = buildGraphLayout([
      commit("merge", ["mp", "w"]),
      commit("w", ["add"]),
      commit("add", ["init"]),
      commit("mp", ["init"]),
      commit("init", []),
    ]);

    expect(rows.map((r) => r.type)).toEqual([
      "node",
      "connector",
      "node",
      "node",
      "node",
      "connector",
      "node",
    ]);
    // merge node, then "\" to the side branch, side commits, then the
    // main line staying straight while the feature line bends in with "/"
    expect(chars(rows)).toEqual(["◆", "│\\", "│●", "│●", "●│", "│/", "●"]);
  });

  test("merge node marker differs from regular commits", () => {
    const rows = buildGraphLayout([
      commit("m", ["a", "b"]),
      commit("a", []),
      commit("b", []),
    ]);
    expect(rows[0].cells[0].char).toBe("◆");
    // a (first parent, main line) then b (side branch) are plain nodes
    expect(rows[2].cells[0].char).toBe("●");
    expect(rows[3].cells[1].char).toBe("●");
  });

  test("first parent inherits the node's lane color", () => {
    const rows = buildGraphLayout([
      commit("m", ["a", "b"]),
      commit("a", []),
      commit("b", []),
    ]);
    const mergeColor = rows[0].cells[0].color;
    // the main line (first parent) keeps the merge's color
    expect(rows[1].cells[0].color).toBe(mergeColor);
    // the side branch gets its own color
    expect(rows[1].cells[1].color).not.toBe(mergeColor);
  });

  test("forked history (two children, one parent) converges with /", () => {
    const rows = buildGraphLayout([
      commit("a", ["b"]),
      commit("c", ["b"]),
      commit("b", []),
    ]);
    expect(chars(rows)).toEqual(["●", "│●", "│/", "●"]);
  });

  test("truncated parents do not leak trailing lanes", () => {
    const rows = buildGraphLayout([commit("a", ["unknown"])]);
    expect(rows).toHaveLength(1);
    expect(chars(rows)).toEqual(["●"]);
  });

  test("empty history produces no rows", () => {
    expect(buildGraphLayout([])).toEqual([]);
  });

  test("lane colors cycle through the palette", () => {
    const rows = buildGraphLayout([
      commit("a", ["x"]),
      commit("b", ["y"]),
      commit("c", ["z"]),
    ]);
    // three separate new lanes take three palette entries
    const used = new Set(
      rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c.color))
    );
    expect(used.size).toBeLessThanOrEqual(LANE_COLORS.length);
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("color consistency", () => {
  test("a branch keeps one color across its commits", () => {
    const rows = buildGraphLayout([
      commit("merge", ["mp", "w"]),
      commit("w", ["add"]),
      commit("add", ["init"]),
      commit("mp", ["init"]),
      commit("init", []),
    ]);
    const featureCells = rows
      .map((r) => r.cells)
      .flat()
      .filter(Boolean)
      .filter((c) => c.char === "●" && c.color === "ai");
    expect(featureCells.length).toBeGreaterThan(0);
    // the two feature commits share the ai lane color
    const nodeColors = rows
      .filter((r) => r.type === "node")
      .map((r) => r.cells.find((c) => c && c.char !== "│").color);
    expect(nodeColors).toEqual(["primary", "ai", "ai", "primary", "ai"]);
  });
});
