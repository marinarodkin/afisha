import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "./lib/events.mjs";
import { buildPersonalIndex } from "./lib/personalization.mjs";

const ROOT = process.cwd();
const SOURCE_BASE_FILE = path.join(ROOT, "sourceBase.json");
const PREFERENCES_FILE = path.join(ROOT, "userPreferences.json");
const OUTPUT_FILE = path.join(ROOT, "personalIndex.json");
const FEEDBACK_LOG_FILE = path.join(ROOT, "feedbackLog.json");

const sourceBase = await readJson(SOURCE_BASE_FILE, { generatedAt: null, events: [] });
const preferences = await readJson(PREFERENCES_FILE, defaultPreferences());
await ensureFile(FEEDBACK_LOG_FILE, defaultFeedbackLog());

const personalIndex = buildPersonalIndex(sourceBase, preferences, {
  now: process.env.PERSONAL_INDEX_NOW ?? new Date().toISOString()
});

await writeJson(OUTPUT_FILE, personalIndex);
console.log(JSON.stringify({ profile: personalIndex.profile, eventCount: personalIndex.eventCount, hiddenCount: personalIndex.hiddenCount }, null, 2));

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function ensureFile(filePath, value) {
  const existing = await readJson(filePath, null);
  if (existing !== null) return;
  await writeJson(filePath, value);
}

function defaultPreferences() {
  return {
    profile: "marina-personal-mvp",
    citiesPriority: ["Bad Schwalbach", "Idstein", "Taunusstein", "Wiesbaden", "Eltville", "Mainz", "Limburg"],
    includeTags: ["church", "concert", "arthouse_cinema", "kino", "exhibition", "excursion", "lecture"],
    boostTags: ["church", "concert", "arthouse_cinema", "kino"],
    boostKeywords: ["orgel", "kirchenmusik", "klassik", "kammermusik", "open air", "sommerkino", "eintritt frei", "kostenlos", "jazz", "kurpark"],
    excludeTags: ["civic", "handicraft"],
    excludeKeywords: ["salsa", "stricken", "haekeln", "crochet", "knitting", "schülerkonzert", "schuelerkonzert", "musikschule", "vorspiel", "jahreskonzert", "abschlusskonzert", "laientheater", "amateurtheater", "schultheater"],
    excludeRawPatterns: ["politik", "demo", "pride"],
    learnedMappings: [
      { ifKeyword: "salsa", alsoExclude: ["bachata", "latin dance", "latin party"] }
    ],
    scoring: {
      preferredCityBonus: 40,
      preferredTagBonus: 20,
      keywordBonus: 15,
      freeBonus: 25,
      weekendBonus: 10,
      excludedPenalty: 100,
      minimumScore: 15
    }
  };
}

function defaultFeedbackLog() {
  return {
    generatedAt: new Date().toISOString(),
    entries: []
  };
}
