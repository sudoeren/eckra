const { selectTargets } = require("../scripts/targets");

describe("build targets", () => {
  test("defaults to linux + win", () => {
    expect(selectTargets([]).map((t) => t.output)).toEqual([
      "eckra-linux-x64",
      "eckra-linux-arm64",
      "eckra-win-x64.exe",
    ]);
  });

  test("macos group covers both architectures", () => {
    expect(selectTargets(["macos"])).toEqual([
      { target: "node22-macos-x64", output: "eckra-macos-x64" },
      { target: "node22-macos-arm64", output: "eckra-macos-arm64" },
    ]);
  });

  test("all includes every platform exactly once", () => {
    const outputs = selectTargets(["all"]).map((t) => t.output);
    expect(outputs).toEqual([
      "eckra-linux-x64",
      "eckra-linux-arm64",
      "eckra-win-x64.exe",
      "eckra-macos-x64",
      "eckra-macos-arm64",
    ]);
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  test("throws on unknown groups", () => {
    expect(() => selectTargets(["solaris"])).toThrow(/unknown target group/);
  });
});
