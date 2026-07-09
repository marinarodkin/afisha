import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { primaryType, readJson, sortEvents } from "./lib/events.mjs";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "export", "raw");
const WORK_DIR = path.join(ROOT, "export", "work");
const START_DATE = process.env.START_DATE ?? "2026-05-27";
const END_DATE = process.env.END_DATE ?? "2026-08-27";
const EVENT_LIMIT = Number.parseInt(process.env.EVENT_LIMIT ?? "50", 10);

function deduplicateEvents(events) {
  return events;
}

async function main() {
  await mkdir(WORK_DIR, { recursive: true });
  const exclusions = await readJson(path.join(ROOT, "category-exclusions.json"), []);
  const files = (await readdir(RAW_DIR)).filter((file) => file.endsWith(".json")).sort();
  const sources = [];
  const events = [];

  for (const fileName of files) {
    const sourceExport = await readJson(path.join(RAW_DIR, fileName));
    sources.push({ fileName, ...sourceExport, notes: sourceExport.notes ?? [], events: undefined });
    events.push(...sourceExport.events);
  }

  const filtered = events.filter((event) => !exclusions.some((category) => event.rawCategoryHints?.includes(category)));
  const deduped = deduplicateEvents(filtered);
  const limited = sortEvents(deduped).slice(0, EVENT_LIMIT).map((event) => ({
    ...event,
    tags: event.rawCategoryHints ?? ["other"],
    type: primaryType(event.rawCategoryHints ?? ["other"]),
    title: event.titleDe,
    description: event.descriptionDe
  }));

  const merged = {
    generatedAt: new Date().toISOString(),
    startDate: START_DATE,
    endDate: END_DATE,
    eventLimit: EVENT_LIMIT,
    sourcesAmount: sources.length,
    sources,
    exclusions,
    eventCountBeforeExclusions: events.length,
    eventCountAfterExclusions: filtered.length,
    eventCount: limited.length,
    events: limited
  };

  await writeFile(path.join(WORK_DIR, "merged-events.json"), `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Merged ${events.length} raw events, ${filtered.length} after exclusions, ${limited.length} limited events`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
