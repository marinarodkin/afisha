import { appendFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { readJson, sortEvents } from "./lib/events.mjs";
import { appendToSourceBase, collectNewEvents, emptyStore, pruneStoreByDate, splitByAiTagExceptions } from "./lib/source-workflow.mjs";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "rawSources");
const LOG_FILE = path.join(ROOT, "logs", "update-sources.log");
const ITEMS_FOR_TEST = Number.parseInt(process.env.ITEMS_FOR_TEST ?? "0", 10);
const SKIP_SCRAPE = parseBoolean(process.env.SKIP_SCRAPE ?? process.env.skip_scrape ?? "false");

async function main() {
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await log("start", envSnapshot());

  if (SKIP_SCRAPE) {
    await log("skip-scrape", { rawDir: RAW_DIR });
  } else {
    await run("npm", ["run", "scrape:raw"]);
  }
  const rawSources = await readRawSources();
  const sourceBase = pruneStoreByDate(await readStore("sourceBase.json"), todayIso());
  const exceptedItems = pruneStoreByDate(await readStore("exceptedItems.json"), todayIso());
  const exceptionCategories = await readJson(path.join(ROOT, "exceptionCategories.json"), []);

  await log("pruned-stores", { sourceBasePruned: sourceBase.prunedCount ?? 0, exceptedPruned: exceptedItems.prunedCount ?? 0, sourceBaseTotal: sourceBase.eventCount, exceptedTotal: exceptedItems.eventCount });

  const collected = collectNewEvents(rawSources, sourceBase, emptyStore(), exceptedItems, exceptionCategories, ITEMS_FOR_TEST);
  let newSources = {
    generatedAt: new Date().toISOString(),
    eventCount: collected.events.length,
    events: collected.events
  };
  await writeJson("newSources.json", newSources);
  await log("collected-new-sources", collected.stats);

  if (newSources.events.length > 0) {
    await run("npm", ["run", "enrich:api"]);
    newSources = await readStore("newSources.json");
  }

  const exceptionAiTags = await readJson(path.join(ROOT, "exceptionAiTags.json"), []);
  const allAiStageExceptions = [...new Set([...exceptionCategories, ...exceptionAiTags])];
  const split = splitByAiTagExceptions(newSources, exceptedItems, allAiStageExceptions);
  const updatedExcepted = {
    generatedAt: new Date().toISOString(),
    eventCount: split.exceptedEvents.length,
    events: split.exceptedEvents
  };
  const relevantNewSources = {
    ...newSources,
    generatedAt: new Date().toISOString(),
    eventCount: split.kept.length,
    events: sortEvents(split.kept)
  };
  await writeJson("exceptedItems.json", updatedExcepted);
  await writeJson("newSources.json", relevantNewSources);
  await log("filtered-ai-tags", { rejected: split.rejected.length, kept: split.kept.length, exceptionAiTags, exceptionCategories });

  const updatedBase = appendToSourceBase(sourceBase, relevantNewSources);
  await writeJson("sourceBase.json", updatedBase);
  await writeJson(path.join("export", "index.json"), updatedBase);
  await log("source-base-updated", { appended: updatedBase.appendedCount, total: updatedBase.eventCount });
  await run("npm", ["run", "build:personal"]);
  await log("personal-index-updated", { sourceBaseCount: updatedBase.eventCount });
}

async function readRawSources() {
  const files = (await readdir(RAW_DIR)).filter((file) => file.endsWith(".json")).sort();
  const rawSources = [];
  for (const file of files) {
    rawSources.push(await readJson(path.join(RAW_DIR, file)));
  }
  await log("raw-sources-read", { files, count: rawSources.length });
  return rawSources;
}

async function readStore(fileName) {
  return readJson(path.join(ROOT, fileName), emptyStore());
}

async function writeJson(fileName, value) {
  const target = path.isAbsolute(fileName) ? fileName : path.join(ROOT, fileName);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function log(stage, data) {
  const entry = { at: new Date().toISOString(), stage, data };
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`);
  console.log(`${stage}: ${JSON.stringify(data)}`);
}

function envSnapshot() {
  return {
    source_offset: process.env.source_offset ?? process.env.SOURCE_OFFSET ?? "0",
    source_amount: process.env.source_amount ?? process.env.SOURCE_AMOUNT ?? process.env.SOURCES_AMOUNT ?? "2",
    ITEMS_FOR_TEST,
    MONTH: process.env.MONTH ?? "3",
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    SKIP_SCRAPE
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell: false });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

main().catch(async (error) => {
  await log("error", { message: error.message, stack: error.stack });
  process.exit(1);
});
