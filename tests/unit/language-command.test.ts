import { describe, expect, it } from "vitest";
import { matchLanguageAnswer, matchLanguageCommand } from "../../app/aide/sahara-recognizer";

describe("spoken language switch", () => {
  it("switches on the language name itself", () => {
    expect(matchLanguageCommand("Pidgin")?.code).toBe("pcm");
    expect(matchLanguageCommand("Naija")?.code).toBe("pcm");
    expect(matchLanguageCommand("Yoruba")?.code).toBe("yo");
    expect(matchLanguageCommand("Igbo")?.code).toBe("ig");
    expect(matchLanguageCommand("Hausa")?.code).toBe("ha");
  });

  it("still switches when the recogniser mishears the name", () => {
    // Live-tested: "Pidgin" came back as "peagon".
    expect(matchLanguageCommand("peagon")?.code).toBe("pcm");
    expect(matchLanguageCommand("Pigeon.")?.code).toBe("pcm");
    expect(matchLanguageCommand("switch to pidgeon")?.code).toBe("pcm");
    expect(matchLanguageCommand("Yorùbá")?.code).toBe("yo");
    expect(matchLanguageCommand("Ibo")?.code).toBe("ig");
    expect(matchLanguageCommand("Housa")?.code).toBe("ha");
  });

  it("does not hijack ordinary requests that mention a language", () => {
    expect(matchLanguageCommand("find me transcription work for Yoruba speakers in Lagos please")).toBeNull();
    expect(matchLanguageCommand("find me house cleaning work")).toBeNull();
  });

  it("switches on a close mishearing the alias list was never written for", () => {
    // Live-tested: "Naija" came back as "Naja", one letter short, and no
    // hardcoded regex will ever predict every possible mishearing.
    expect(matchLanguageCommand("Naja")?.code).toBe("pcm");
    expect(matchLanguageCommand("Yorba")?.code).toBe("yo");
    expect(matchLanguageCommand("Housa")?.code).toBe("ha");
  });

  it("stays quiet on an ordinary short utterance that is nowhere near a language name", () => {
    expect(matchLanguageCommand("I no wan chop")).toBeNull();
    expect(matchLanguageCommand("start my assessment")).toBeNull();
    expect(matchLanguageCommand("yes please")).toBeNull();
  });

  it("accepts a bare answer to the language question", () => {
    expect(matchLanguageAnswer("I speak peagon")?.code).toBe("pcm");
  });
});
