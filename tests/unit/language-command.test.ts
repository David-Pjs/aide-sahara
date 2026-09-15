import { describe, expect, it } from "vitest";
import { matchLanguageAnswer, matchLanguageCommand, matchVoiceCommand } from "../../app/aide/sahara-recognizer";

describe("spoken language switch", () => {
  it("switches on the language name itself", () => {
    expect(matchLanguageCommand("Pidgin")?.code).toBe("pcm");
    expect(matchLanguageCommand("Naija")?.code).toBe("pcm");
    // "Broken" (as in "broken English") is how Pidgin is actually named in
    // everyday Nigerian speech, more natural than the word "Pidgin" itself.
    expect(matchLanguageCommand("Broken")?.code).toBe("pcm");
    expect(matchLanguageCommand("Broken English")?.code).toBe("pcm");
    expect(matchLanguageCommand("talk broken to me")?.code).toBe("pcm");
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

  it("does not treat a complaint that something is broken as a switch to Pidgin", () => {
    // "Broken" alone is a deliberate command, but it is also an ordinary
    // English word someone frustrated with the app might easily say.
    expect(matchLanguageCommand("it's broken")).toBeNull();
    expect(matchLanguageCommand("this thing is broken")).toBeNull();
    expect(matchLanguageCommand("the app is broken again")).toBeNull();
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

describe("spoken voice switch (which voice Aide speaks with, not which language it hears)", () => {
  it("switches to Sahara's voice on its own trigger words", () => {
    expect(matchVoiceCommand("use Nigerian voice")).toBe("sahara");
    expect(matchVoiceCommand("Sahara voice please")).toBe("sahara");
    expect(matchVoiceCommand("switch to native voice")).toBe("sahara");
    // "Naija voice" mirrors "Naija" for language; "real voice" is the
    // plainest possible way to ask for it.
    expect(matchVoiceCommand("Naija voice")).toBe("sahara");
    expect(matchVoiceCommand("use the real voice")).toBe("sahara");
  });

  it("switches back to the fast voice on its own trigger words", () => {
    expect(matchVoiceCommand("fast voice")).toBe("default");
    expect(matchVoiceCommand("normal voice")).toBe("default");
    expect(matchVoiceCommand("go back to default voice")).toBe("default");
  });

  it("never collides with the language-switch words, on purpose", () => {
    // "Yoruba" and "English" must only ever be read as the LISTENING
    // language, never as a voice command, or the two features would fight
    // over the same utterance.
    expect(matchVoiceCommand("Yoruba")).toBeNull();
    expect(matchVoiceCommand("English")).toBeNull();
    expect(matchLanguageCommand("nigerian voice")).toBeNull();
  });

  it("does not misfire on ordinary speech", () => {
    expect(matchVoiceCommand("find me transcription work")).toBeNull();
    expect(matchVoiceCommand("I like your voice")).toBeNull();
  });
});
