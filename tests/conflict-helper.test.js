const {
  parseConflicts,
  getConflicts,
  applyResolutions,
  describeConflicts,
} = require("../src/helpers/conflict");
const { parseConflictResponse } = require("../src/helpers/ai");

const file = (eol = "\n") =>
  [
    "top",
    "<<<<<<< HEAD",
    "ours 1",
    "||||||| base",
    "old 1",
    "=======",
    "theirs 1",
    ">>>>>>> feature/x",
    "middle",
    "<<<<<<< HEAD",
    "=======",
    "theirs 2",
    ">>>>>>> feature/x",
    "bottom",
    "",
  ].join(eol);

describe("conflict parsing", () => {
  test("finds each conflict with both sides, labels and line", () => {
    expect(getConflicts(parseConflicts(file()))).toEqual([
      {
        type: "conflict",
        ours: ["ours 1"],
        base: ["old 1"],
        theirs: ["theirs 1"],
        oursLabel: "HEAD",
        theirsLabel: "feature/x",
        line: 2,
      },
      {
        type: "conflict",
        ours: [],
        base: null,
        theirs: ["theirs 2"],
        oursLabel: "HEAD",
        theirsLabel: "feature/x",
        line: 10,
      },
    ]);
  });

  test("a file without markers has no conflicts", () => {
    expect(getConflicts(parseConflicts("just\ntext\n"))).toEqual([]);
  });

  test("an unterminated marker is treated as text", () => {
    const parsed = parseConflicts("a\n<<<<<<< HEAD\nb\n=======\nc\n");

    expect(getConflicts(parsed)).toEqual([]);
    expect(applyResolutions(parsed, [])).toBe(
      "a\n<<<<<<< HEAD\nb\n=======\nc\n"
    );
  });

  test("applyResolutions rebuilds the file around the resolutions", () => {
    expect(
      applyResolutions(parseConflicts(file()), ["merged\nlines", ""])
    ).toBe("top\nmerged\nlines\nmiddle\nbottom\n");
  });

  test("CRLF files stay CRLF", () => {
    expect(
      applyResolutions(parseConflicts(file("\r\n")), ["one\ntwo", "three"])
    ).toBe("top\r\none\r\ntwo\r\nmiddle\r\nthree\r\nbottom\r\n");
  });

  test("applyResolutions refuses a wrong count or leftover markers", () => {
    const parsed = parseConflicts(file());

    expect(() => applyResolutions(parsed, ["only one"])).toThrow(
      "Expected 2 resolution(s), got 1."
    );
    expect(() => applyResolutions(parsed, ["a\n=======\nb", "c"])).toThrow(
      /conflict markers/
    );
  });

  test("describeConflicts numbers conflicts and adds nearby code", () => {
    const description = describeConflicts(parseConflicts(file()));

    expect(description).toContain("### Conflict 1\nCode before:\ntop\n");
    expect(description).toContain("||||||| COMMON ANCESTOR\nold 1");
    expect(description).toContain(
      ">>>>>>> THEIRS (feature/x)\nCode after:\nmiddle"
    );
    expect(description).toContain("### Conflict 2\nCode before:\nmiddle\n");
  });
});

describe("parseConflictResponse", () => {
  test("reads the explanation and resolutions in order", () => {
    const answer = [
      "=== EXPLANATION ===",
      "Kept both.",
      "Check the import.",
      "=== RESOLUTION 2 ===",
      "",
      "=== END ===",
      "=== RESOLUTION 1 ===",
      "  indented();",
      "  kept();",
      "=== END ===",
    ].join("\n");

    expect(parseConflictResponse(answer, 2)).toEqual({
      explanation: "Kept both.\nCheck the import.",
      resolutions: ["  indented();\n  kept();", ""],
    });
  });

  test("strips a code fence the model added anyway", () => {
    const answer =
      "=== RESOLUTION 1 ===\n```js\nconst a = 1;\n```\n=== END ===";

    expect(parseConflictResponse(answer, 1).resolutions).toEqual([
      "const a = 1;",
    ]);
  });

  test("throws when a resolution is missing", () => {
    expect(() =>
      parseConflictResponse("=== RESOLUTION 1 ===\nx\n=== END ===", 2)
    ).toThrow(/each of the 2 conflict/);
    expect(() => parseConflictResponse("no idea", 1)).toThrow();
  });
});
