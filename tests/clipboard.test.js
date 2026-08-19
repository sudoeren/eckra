const {
  getClipboardCommand,
  copyToClipboard,
} = require("../src/helpers/clipboard");
const { spawn } = require("child_process");

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

describe("Clipboard Helper", () => {
  const ORIGINAL_PLATFORM = process.platform;

  afterEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM });
    delete process.env.WAYLAND_DISPLAY;
  });

  function mockSpawnStreams({ onError = false } = {}) {
    const streams = {
      stdin: { write: jest.fn(), end: jest.fn() },
      on: jest.fn((event, cb) => {
        if (onError && event === "error") cb(new Error("ENOENT"));
        if (!onError && event === "close") cb(0);
      }),
    };
    spawn.mockReturnValue(streams);
    return streams;
  }

  test("uses pbcopy on darwin", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const streams = mockSpawnStreams();

    const ok = await copyToClipboard("hello");

    expect(ok).toBe(true);
    expect(spawn).toHaveBeenCalledWith("pbcopy", [], expect.anything());
    expect(streams.stdin.write).toHaveBeenCalledWith("hello");
    expect(streams.stdin.end).toHaveBeenCalled();
  });

  test("uses xclip with the clipboard selection on linux (X11)", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockSpawnStreams();

    await copyToClipboard("hello");

    expect(spawn).toHaveBeenCalledWith(
      "xclip",
      ["-selection", "clipboard"],
      expect.anything()
    );
  });

  test("uses wl-copy on wayland", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    process.env.WAYLAND_DISPLAY = ":0";
    mockSpawnStreams();

    await copyToClipboard("hello");

    expect(spawn).toHaveBeenCalledWith("wl-copy", [], expect.anything());
  });

  test("resolves false when the clipboard command is missing", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockSpawnStreams({ onError: true });

    const ok = await copyToClipboard("hello");

    expect(ok).toBe(false);
  });

  test("getClipboardCommand picks clip on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(getClipboardCommand()).toEqual({
      cmd: "clip",
      args: [],
      shell: true,
    });
  });
});
