import { describe, expect, it } from "vitest";
import { initialSttMode } from "../../app/aide/voice-engine";

// Which recognizer Aide starts with decides whether it can hear at all in a
// given browser. The rule: use the configured path when this browser can run
// it, otherwise whichever path it can run, and only fall back to speak-only
// mode when it can run neither.

describe("initialSttMode", () => {
  it("starts on the server recognizer when configured for it and the browser can record", () => {
    expect(initialSttMode("server", true, true)).toBe("server");
    expect(initialSttMode("server", true, false)).toBe("server");
  });

  it("uses the built-in recognizer when the browser cannot record but has one", () => {
    expect(initialSttMode("server", false, true)).toBe("browser");
  });

  it("starts on the built-in recognizer when configured for it", () => {
    expect(initialSttMode("browser", true, true)).toBe("browser");
  });

  it("records instead when configured for the built-in recognizer but the browser has none, as in Firefox", () => {
    expect(initialSttMode("browser", true, false)).toBe("server");
  });

  it("returns no recognizer only when the browser can do neither", () => {
    expect(initialSttMode("server", false, false)).toBeNull();
    expect(initialSttMode("browser", false, false)).toBeNull();
  });
});
