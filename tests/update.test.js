const axios = require("axios");
const { execSync } = require("child_process");
const {
  fetchLatestVersion,
  isVersionNewer,
  checkForUpdates,
  runGlobalUpgrade,
  UPGRADE_COMMAND,
} = require("../src/helpers/update");

jest.mock("axios");
jest.mock("child_process");

describe("Update Helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isVersionNewer", () => {
    test("detects a newer major/minor/patch version", () => {
      expect(isVersionNewer("1.5.0", "1.4.9")).toBe(true);
      expect(isVersionNewer("2.0.0", "1.9.9")).toBe(true);
      expect(isVersionNewer("1.4.10", "1.4.9")).toBe(true);
    });

    test("returns false for equal or older versions", () => {
      expect(isVersionNewer("1.4.9", "1.4.9")).toBe(false);
      expect(isVersionNewer("1.4.8", "1.4.9")).toBe(false);
      expect(isVersionNewer("0.9.0", "1.0.0")).toBe(false);
    });

    test("handles missing or malformed input", () => {
      expect(isVersionNewer(null, "1.4.9")).toBe(false);
      expect(isVersionNewer("2.0.0", null)).toBe(false);
      expect(isVersionNewer("", "")).toBe(false);
    });
  });

  describe("fetchLatestVersion", () => {
    test("returns the version from the registry", async () => {
      axios.get.mockResolvedValue({ data: { version: "2.0.0" } });

      const latest = await fetchLatestVersion();

      expect(latest).toBe("2.0.0");
      expect(axios.get).toHaveBeenCalledWith(
        "https://registry.npmjs.org/eckra/latest",
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });

    test("returns null when the registry is unreachable", async () => {
      axios.get.mockRejectedValue(new Error("network down"));

      const latest = await fetchLatestVersion();

      expect(latest).toBeNull();
    });

    test("returns null when the response has no version", async () => {
      axios.get.mockResolvedValue({ data: {} });

      const latest = await fetchLatestVersion();

      expect(latest).toBeNull();
    });
  });

  describe("checkForUpdates", () => {
    test("reports outdated when a newer version exists", async () => {
      axios.get.mockResolvedValue({ data: { version: "99.0.0" } });

      const result = await checkForUpdates();

      expect(result.current).toBe(require("../package.json").version);
      expect(result.latest).toBe("99.0.0");
      expect(result.outdated).toBe(true);
    });

    test("reports up to date when versions match", async () => {
      axios.get.mockResolvedValue({
        data: { version: require("../package.json").version },
      });

      const result = await checkForUpdates();

      expect(result.outdated).toBe(false);
    });

    test("reports up to date (not outdated) when offline", async () => {
      axios.get.mockRejectedValue(new Error("offline"));

      const result = await checkForUpdates();

      expect(result.latest).toBeNull();
      expect(result.outdated).toBe(false);
    });
  });

  describe("runGlobalUpgrade", () => {
    test("runs the global npm upgrade command", () => {
      execSync.mockReturnValue();

      runGlobalUpgrade();

      expect(execSync).toHaveBeenCalledWith(
        UPGRADE_COMMAND,
        expect.objectContaining({ stdio: "inherit" })
      );
    });
  });
});
