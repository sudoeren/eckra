const { link } = require("../src/ui/common");

jest.mock("../src/helpers/config", () => ({
  getConfig: jest.fn(() => ({})),
}));

describe("Common helpers", () => {
  test("link wraps the URL in OSC 8 hyperlink escape sequences", () => {
    const url = "https://github.com/sudoeren/eckra";
    expect(link(url)).toBe(`\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\`);
  });

  test("link supports a custom display text", () => {
    expect(link("https://example.com", "example")).toBe(
      "\u001b]8;;https://example.com\u001b\\example\u001b]8;;\u001b\\"
    );
  });
});
