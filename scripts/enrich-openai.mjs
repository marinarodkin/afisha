import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CATEGORIES, hasFreeEntryEvidence, hasLanguageEvidence, primaryType, readJson, sortEvents } from "./lib/events.mjs";

const ROOT = process.cwd();
const WORK_DIR = path.join(ROOT, "export", "work");
const INPUT_FILE = process.env.ENRICH_INPUT_FILE ? path.resolve(ROOT, process.env.ENRICH_INPUT_FILE) : path.join(ROOT, "newSources.json");
const OUTPUT_FILE = process.env.ENRICH_OUTPUT_FILE ? path.resolve(ROOT, process.env.ENRICH_OUTPUT_FILE) : path.join(ROOT, "newSources.json");
const PROMPT_FILE = path.join(ROOT, "prompts", "enrich-events.yaml");
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const BATCH_SIZE = Number.parseInt(process.env.ENRICH_BATCH_SIZE ?? "1", 10);
const MAX_COMPLETION_TOKENS = Number.parseInt(process.env.ENRICH_MAX_COMPLETION_TOKENS ?? "2500", 10);

const eventSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "sourceName",
    "sourceUrl",
    "titleDe",
    "titleRu",
    "title",
    "date",
    "time",
    "type",
    "tags",
    "price",
    "city",
    "venue",
    "url",
    "descriptionDe",
    "descriptionRu",
    "description",
    "rawType",
    "rawCategoryHints",
    "exportedAt"
  ],
  properties: {
    id: { type: "string" },
    sourceName: { type: "string" },
    sourceUrl: { type: "string" },
    titleDe: { type: "string" },
    titleRu: { type: "string" },
    title: { type: "string" },
    date: { type: "string" },
    time: { type: ["string", "null"] },
    type: { type: "string", enum: CATEGORIES },
    tags: { type: "array", minItems: 1, items: { type: "string", enum: CATEGORIES } },
    price: {
      type: "object",
      additionalProperties: false,
      required: ["min", "max", "currency", "note"],
      properties: {
        min: { type: ["number", "null"] },
        max: { type: ["number", "null"] },
        currency: { type: "string" },
        note: { type: ["string", "null"] }
      }
    },
    city: { type: "string" },
    venue: { type: ["string", "null"] },
    url: { type: ["string", "null"] },
    descriptionDe: { type: "string" },
    descriptionRu: { type: "string" },
    description: { type: "string" },
    rawType: { type: "string" },
    rawCategoryHints: { type: "array", items: { type: "string" } },
    exportedAt: { type: "string" }
  }
};

const batchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: eventSchema
    }
  }
};

async function main() {
  await loadDotEnv(path.join(ROOT, ".env"));
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Run with OPENAI_API_KEY=... or export it in the environment.");
  }

  await mkdir(WORK_DIR, { recursive: true });
  const input = await readJson(INPUT_FILE);
  const promptYaml = await readFile(PROMPT_FILE, "utf8");
  const prompt = YAML.parse(promptYaml);
  const client = new OpenAI();
  const enrichedEvents = [];

  for (let index = 0; index < input.events.length; index += BATCH_SIZE) {
    const batch = {
      ...input,
      eventCount: Math.min(BATCH_SIZE, input.events.length - index),
      events: input.events.slice(index, index + BATCH_SIZE)
    };
    let batchResult = await enrichBatch(client, prompt, promptYaml, batch);
    try {
      validateEnriched(batch, batchResult);
    } catch (error) {
      console.warn(`Batch validation failed, retrying: ${error.message}`);
      batchResult = await enrichBatch(client, prompt, promptYaml, batch, error.message);
      validateEnriched(batch, batchResult);
    }
    enrichedEvents.push(...batchResult.events);
    console.log(`OpenAI API enriched ${enrichedEvents.length}/${input.events.length} events`);
  }

  const enriched = {
    ...input,
    generatedAt: new Date().toISOString(),
    events: enrichedEvents,
    eventCount: enrichedEvents.length
  };
  validateEnriched(input, enriched);
  enriched.enrichment = {
    method: "openai-api",
    model: MODEL,
    batchSize: BATCH_SIZE,
    promptFile: "prompts/enrich-events.yaml",
    inputFile: path.relative(ROOT, INPUT_FILE)
  };
  enriched.events = sortEvents(enriched.events).map((event) => ({
    ...event,
    tags: normalizeTags(event.tags),
    type: normalizeType(event.type, event.tags)
  }));
  enriched.eventCount = enriched.events.length;

  await writeFile(OUTPUT_FILE, `${JSON.stringify(enriched, null, 2)}\n`);
  console.log(`OpenAI API enriched ${enriched.events.length} events with ${MODEL}`);
}

async function enrichBatch(client, prompt, promptYaml, input, retryReason = "") {
  const aiInput = {
    ...input,
    events: (input.events ?? []).map(shrinkEventForAi)
  };
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: prompt.system_prompt
      },
      {
        role: "user",
        content: [
          prompt.user_prompt,
          retryReason ? `Previous output was invalid: ${retryReason}. Return a corrected complete JSON object.` : "",
          "YAML prompt:",
          promptYaml,
          "Input JSON:",
          JSON.stringify(aiInput)
        ].join("\n\n")
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "afisha_enriched_event_batch",
        strict: true,
        schema: batchSchema
      }
    },
    temperature: 0.2,
    max_completion_tokens: MAX_COMPLETION_TOKENS
  });

  const parsed = { ...input, ...JSON.parse(completion.choices[0].message.content) };
  const sourceEvents = new Map((input.events ?? []).map((event) => [event.id, event]));
  const outputEvents = new Map((parsed.events ?? []).map((event) => [event.id, event]));
  parsed.events = (input.events ?? []).map((sourceEvent) => {
    const outputEvent = outputEvents.get(sourceEvent.id);
    if (outputEvent) return repairEvent(outputEvent, sourceEvent);
    return repairEvent(
      {
        ...sourceEvent,
        titleRu: sourceEvent.titleDe ?? sourceEvent.title ?? "",
        descriptionRu: sourceEvent.descriptionDe ?? sourceEvent.description ?? "",
        title: sourceEvent.titleDe ?? sourceEvent.title ?? "",
        description: sourceEvent.descriptionDe ?? sourceEvent.description ?? ""
      },
      sourceEvent
    );
  });
  return parsed;
}

function shrinkEventForAi(event) {
  const descriptionDe = typeof event.descriptionDe === "string" ? event.descriptionDe.slice(0, 900) : event.descriptionDe;
  return {
    ...event,
    descriptionDe
  };
}

function normalizeTags(tags) {
  const normalized = Array.isArray(tags) ? tags.filter((tag) => CATEGORIES.includes(tag)) : [];
  return normalized.length > 0 ? [...new Set(normalized)] : ["other"];
}

function normalizeType(type, tags) {
  return CATEGORIES.includes(type) ? type : primaryType(normalizeTags(tags));
}

function validateEnriched(input, enriched) {
  if (!Array.isArray(enriched.events)) throw new Error("enriched output must contain events array");
  if (enriched.events.length !== input.events.length) {
    throw new Error(`Expected ${input.events.length} events, got ${enriched.events.length}`);
  }

  const inputIds = input.events.map((event) => event.id).sort();
  const outputIds = enriched.events.map((event) => event.id).sort();
  if (JSON.stringify(inputIds) !== JSON.stringify(outputIds)) {
    throw new Error("Enriched output event ids do not match merged input ids");
  }

  for (const event of enriched.events) {
    const tags = normalizeTags(event.tags);
    if (!event.titleDe || !event.titleRu || !event.title || !event.descriptionRu || !event.description) {
      throw new Error(`Event ${event.id} is missing translated display fields`);
    }
    if (!event.title.includes(" / ")) throw new Error(`Event ${event.id} title must use German / Russian format`);
    if (!tags.every((tag) => CATEGORIES.includes(tag))) throw new Error(`Event ${event.id} has invalid tags`);
  }
}

function repairEvent(event, sourceEvent = null) {
  const repaired = { ...(sourceEvent ?? {}), ...event };
  repaired.titleDe = repaired.titleDe ?? sourceEvent?.titleDe ?? sourceEvent?.title ?? "";
  repaired.descriptionDe = repaired.descriptionDe ?? sourceEvent?.descriptionDe ?? sourceEvent?.description ?? "";
  repaired.titleRu = repaired.titleRu || sourceEvent?.titleRu || sourceEvent?.titleDe || repaired.titleDe || repaired.title || "";
  repaired.descriptionRu = repaired.descriptionRu || sourceEvent?.descriptionRu || sourceEvent?.descriptionDe || repaired.descriptionDe || repaired.description || "";
  if (repaired.titleDe && repaired.titleRu) {
    repaired.title = `${repaired.titleDe} / ${repaired.titleRu}`;
  }
  if (!repaired.titleDe) {
    repaired.titleDe = repaired.titleRu || repaired.title || "";
  }
  if (!repaired.title) {
    repaired.title = repaired.titleDe && repaired.titleRu ? `${repaired.titleDe} / ${repaired.titleRu}` : (repaired.titleDe ?? repaired.titleRu ?? "");
  }
  if (!repaired.descriptionDe) {
    repaired.descriptionDe = repaired.descriptionRu || repaired.description || "";
  }
  if (repaired.descriptionRu) {
    repaired.description = repaired.descriptionRu;
  }
  if (!repaired.description) {
    repaired.description = repaired.descriptionRu ?? repaired.descriptionDe ?? "";
  }
  repaired.tags = normalizeTags(repaired.tags);
  repaired.tags = sanitizeEvidenceTags(repaired, repaired.tags);
  repaired.type = normalizeType(repaired.type, repaired.tags);
  if (!repaired.tags.includes(repaired.type)) {
    repaired.tags = [repaired.type, ...repaired.tags];
  }
  return repaired;
}

function sanitizeEvidenceTags(event, tags) {
  const filtered = new Set(tags);
  const freeEvidence = hasFreeEntryEvidence(event);
  const ruEvidence = hasLanguageEvidence(event, "ru");
  const enEvidence = hasLanguageEvidence(event, "en");

  if (freeEvidence) filtered.add("free");
  else filtered.delete("free");

  if (ruEvidence) filtered.add("lang_ru");
  else filtered.delete("lang_ru");

  if (enEvidence) filtered.add("lang_en");
  else filtered.delete("lang_en");

  return [...filtered];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function loadDotEnv(filePath) {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}
