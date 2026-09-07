import { matchLanguageCommand } from "../app/aide/sahara-recognizer.js";

const cases = [
  "Ọ̀gá mi sweet to Yorùbá",
  "Ogami, switch to your Uber",
  "switch to Yoruba",
  "I dey speak Igbo",
  "just Hausa",
  "I translate Yoruba documents for a living",
];

for (const c of cases) {
  console.log(JSON.stringify(c), "->", JSON.stringify(matchLanguageCommand(c)));
}
