const {
  getClipboardCommand,
  copyToClipboard,
  canUseOsc52,
  osc52,
  OSC52_MAX_BYTES,
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

    const ok = await copyToClipboard("hello", { isTTY: false });

    expect(ok).toBe(false);
  });

  test("falls back to OSC 52 when the command is missing and stdout is a TTY", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockSpawnStreams({ onError: true });
    const write = jest.fn();

    const ok = await copyToClipboard("hello", { isTTY: true, write });

    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledWith("\u001b]52;c;aGVsbG8=\u001b\\");
  });

  test("does not use OSC 52 when stdout is not a TTY", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockSpawnStreams({ onError: true });
    const write = jest.fn();

    const ok = await copyToClipboard("hello", { isTTY: false, write });

    expect(ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  test("ECKRA_CLIPBOARD=osc52 forces the terminal clipboard", async () => {
    const write = jest.fn();

    const ok = await copyToClipboard("hello", {
      env: { ECKRA_CLIPBOARD: "osc52" },
      write,
    });

    expect(ok).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith("\u001b]52;c;aGVsbG8=\u001b\\");
  });

  test("ECKRA_CLIPBOARD=system disables the OSC 52 fallback", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockSpawnStreams({ onError: true });
    const write = jest.fn();

    const ok = await copyToClipboard("hello", {
      env: { ECKRA_CLIPBOARD: "system" },
      isTTY: true,
      write,
    });

    expect(ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  test("osc52 encodes UTF-8 and refuses oversized payloads", () => {
    const write = jest.fn();

    expect(osc52("héllo", { write })).toBe(true);
    expect(write).toHaveBeenCalledWith("\u001b]52;c;aMOpbGxv\u001b\\");

    write.mockClear();
    const huge = "x".repeat(OSC52_MAX_BYTES + 1);
    expect(osc52(huge, { write })).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  test("canUseOsc52 reflects preference and TTY state", () => {
    expect(canUseOsc52({ env: {}, isTTY: true })).toBe(true);
    expect(canUseOsc52({ env: {}, isTTY: false })).toBe(false);
    expect(
      canUseOsc52({ env: { ECKRA_CLIPBOARD: "osc52" }, isTTY: false })
    ).toBe(true);
    expect(
      canUseOsc52({ env: { ECKRA_CLIPBOARD: "system" }, isTTY: true })
    ).toBe(false);
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
