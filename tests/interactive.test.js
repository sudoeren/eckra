const { EventEmitter } = require("events");
const {
  ALT_SCREEN_ON,
  ALT_SCREEN_OFF,
  enterInteractiveScreen,
  leaveInteractiveScreen,
  runInteractive,
} = require("../src/ui/common");

jest.mock("../src/helpers/config", () => ({
  getConfig: jest.fn(() => ({})),
}));

function fakeStdout(isTTY) {
  return { isTTY, write: jest.fn() };
}

describe("Interactive screen lifecycle", () => {
  test("enters and leaves the alternate screen on a TTY", () => {
    const stdout = fakeStdout(true);

    expect(enterInteractiveScreen({ stdout, env: {} })).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith(ALT_SCREEN_ON);

    expect(leaveInteractiveScreen({ stdout, env: {} })).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith(ALT_SCREEN_OFF);
  });

  test("is a no-op when stdout is not a TTY or TERM=dumb", () => {
    const noTty = fakeStdout(false);
    expect(enterInteractiveScreen({ stdout: noTty, env: {} })).toBe(false);
    expect(noTty.write).not.toHaveBeenCalled();

    const dumb = fakeStdout(true);
    expect(
      enterInteractiveScreen({ stdout: dumb, env: { TERM: "dumb" } })
    ).toBe(false);
    expect(dumb.write).not.toHaveBeenCalled();
  });

  test("runInteractive restores the screen and removes its listeners", async () => {
    const stdout = fakeStdout(true);
    const proc = new EventEmitter();
    proc.exit = jest.fn();

    await runInteractive(async () => {}, { stdout, process: proc });

    expect(stdout.write).toHaveBeenCalledWith(ALT_SCREEN_ON);
    expect(stdout.write).toHaveBeenCalledWith(ALT_SCREEN_OFF);
    expect(proc.listenerCount("exit")).toBe(0);
    expect(proc.listenerCount("SIGINT")).toBe(0);
    expect(proc.listenerCount("SIGTERM")).toBe(0);
    expect(proc.listenerCount("uncaughtException")).toBe(0);
    expect(proc.listenerCount("unhandledRejection")).toBe(0);
  });

  test("runInteractive cleans up and exits with 130 on SIGINT", async () => {
    const stdout = fakeStdout(true);
    const proc = new EventEmitter();
    proc.exit = jest.fn();

    let release;
    const pending = runInteractive(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      { stdout, process: proc }
    );

    proc.emit("SIGINT");

    expect(stdout.write).toHaveBeenCalledWith(ALT_SCREEN_OFF);
    expect(proc.exit).toHaveBeenCalledWith(130);

    release();
    await pending;
  });
});
