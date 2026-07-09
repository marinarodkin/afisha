import { cleanText, sortEvents } from "./events.mjs";

export function eventKey(event) {
  const date = event.date ?? "";
  const time = event.time ?? "";
  const venue = normalizeKeyPart(event.venue ?? "");
  const title = normalizeKeyPart(event.titleDe ?? event.title ?? "").slice(0, 5);
  return [date, time, venue, title].join("|");
}

export function normalizeKeyPart(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-яё0-9]+/gi, "");
}

export function collectNewEvents(rawSources, sourceBase, currentNewSources, exceptedItems, exceptionCategories, limit) {
  const baseKeys = new Set((sourceBase.events ?? []).map(eventKey));
  const newKeys = new Set((currentNewSources.events ?? []).map(eventKey));
  const exceptedKeys = new Set((exceptedItems.events ?? []).map(eventKey));
  const exceptionSet = new Set(exceptionCategories);
  const events = [];
  const stats = {
    raw: 0,
    skippedByExceptionCategory: 0,
    skippedByRussianCity: 0,
    skippedByExceptedItems: 0,
    skippedBySourceBase: 0,
    skippedByNewSources: 0,
    added: 0
  };

  for (const source of rawSources) {
    const sourceLink = source?.source?.link ?? source?.sourceUrl ?? "";
    for (const event of source.events ?? []) {
      stats.raw += 1;
      const key = eventKey(event);
      const hints = event.rawCategoryHints ?? [];
      if (!isAllowedRussianSourceCity(sourceLink, event.city)) {
        stats.skippedByRussianCity += 1;
        continue;
      }
      if (hints.some((category) => exceptionSet.has(category))) {
        stats.skippedByExceptionCategory += 1;
        continue;
      }
      if (exceptedKeys.has(key)) {
        stats.skippedByExceptedItems += 1;
        continue;
      }
      if (baseKeys.has(key)) {
        stats.skippedBySourceBase += 1;
        continue;
      }
      if (newKeys.has(key)) {
        stats.skippedByNewSources += 1;
        continue;
      }
      newKeys.add(key);
      events.push(event);
      stats.added += 1;
    }
  }

  const limited = Number.isFinite(limit) && limit > 0 ? sortEvents(events).slice(0, limit) : sortEvents(events);
  return { events: limited, stats: { ...stats, limited: limited.length } };
}

function isAllowedRussianSourceCity(sourceUrl, city) {
  if (!isRussianSource(sourceUrl)) return true;
  return ALLOWED_RUSSIAN_CITIES.has(normalizeCityToken(city));
}

function isRussianSource(sourceUrl) {
  const url = String(sourceUrl ?? "").toLowerCase();
  return [
    "biletkartina.tv",
    "kontramarka.de",
    "artist-production.de",
    "frankfurt24.ru"
  ].some((needle) => url.includes(needle));
}

function normalizeCityToken(value) {
  const text = cleanText(String(value ?? ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (/франкфурт/.test(text) || /frankfurt/.test(text)) return "frankfurt";
  if (/майнц/.test(text) || /mainz/.test(text)) return "mainz";
  if (/висбаден/.test(text) || /wiesbaden/.test(text)) return "wiesbaden";
  if (/(кельн|кёльн|koeln|koln|cologne|keln)/.test(text)) return "koln";
  if (/карлсруэ/.test(text) || /karlsruhe/.test(text)) return "karlsruhe";
  return text;
}

const ALLOWED_RUSSIAN_CITIES = new Set(["frankfurt", "mainz", "wiesbaden", "koln", "karlsruhe"]);

export function splitByAiTagExceptions(newSources, exceptedItems, exceptionAiTags) {
  const exceptionSet = new Set(exceptionAiTags);
  const exceptedKeys = new Set((exceptedItems.events ?? []).map(eventKey));
  const kept = [];
  const rejected = [];

  for (const event of newSources.events ?? []) {
    const values = [...(event.categories ?? []), ...(event.tags ?? [])];
    if (values.some((tag) => exceptionSet.has(tag))) {
      if (!exceptedKeys.has(eventKey(event))) {
        rejected.push(toExceptedItem(event, "exceptionAiTags"));
        exceptedKeys.add(eventKey(event));
      }
    } else {
      kept.push(event);
    }
  }

  return {
    kept,
    exceptedEvents: [...(exceptedItems.events ?? []), ...rejected],
    rejected
  };
}

export function appendToSourceBase(sourceBase, newSources) {
  const keys = new Set((sourceBase.events ?? []).map(eventKey));
  const appended = [];
  for (const event of newSources.events ?? []) {
    const key = eventKey(event);
    if (keys.has(key)) continue;
    keys.add(key);
    appended.push(event);
  }

  return {
    ...sourceBase,
    generatedAt: new Date().toISOString(),
    events: sortEvents([...(sourceBase.events ?? []), ...appended]),
    eventCount: (sourceBase.events ?? []).length + appended.length,
    appendedCount: appended.length
  };
}

export function emptyStore(extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    eventCount: 0,
    events: [],
    ...extra
  };
}

function toExceptedItem(event, reason) {
  return {
    id: event.id,
    date: event.date,
    time: event.time,
    venue: event.venue ?? null,
    titleDe: event.titleDe ?? event.title ?? "",
    title: event.title ?? event.titleDe ?? "",
    key: eventKey(event),
    reason,
    categories: event.categories ?? [],
    tags: event.tags ?? [],
    addedAt: new Date().toISOString()
  };
}
