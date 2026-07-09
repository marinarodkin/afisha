import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  categoryHints,
  cleanText,
  dateWithZone,
  normalizeUrl,
  toIsoDate,
  toTime,
  WIESBADEN_ORIGIN,
  withinRange
} from "./lib/events.mjs";
import { extractEventfinderEvents, parseEltvilleFesteEvents } from "./lib/eltville.mjs";
import { buildMainzSearchBody, parseMainzSearchPage, MAINZ_CALENDAR_TITLE } from "./lib/mainz.mjs";
import {
  parseArtistProductionEvents,
  parseBadSchwalbachEvents,
  parseBiletKartinaEvents,
  parseFrankfurt24Events,
  parseIdsteinEvents,
  parseKontramarkaEvents,
  parseLimburgDommusikEvents,
  parseTaunussteinEvents
} from "./lib/source-parsers.mjs";

const ROOT = process.cwd();
const SOURCE_LIMIT = Number.parseInt(process.env.source_amount ?? process.env.SOURCE_AMOUNT ?? process.env.SOURCES_AMOUNT ?? "2", 10);
const SOURCE_OFFSET = Number.parseInt(process.env.source_offset ?? process.env.SOURCE_OFFSET ?? "0", 10);
const START_DATE = process.env.START_DATE ?? new Date().toISOString().slice(0, 10);
const MONTH = Number.parseInt(process.env.MONTH ?? "3", 10);
const END_DATE = process.env.END_DATE ?? addMonths(START_DATE, MONTH);
const RAW_DIR = path.join(ROOT, "rawSources");

async function scrapeWiesbadenCalendar(source) {
  const query = `
    query Search($searchInput: SearchInput!) {
      search(input: $searchInput) {
        total
        results {
          id
          objectType
          teaser {
            __typename
            ... on EventTeaser {
              headline
              text
              kicker
              venue
              link { url label }
              schedulings {
                start
                end
                isFullDay
                hasStartTime
                hasEndTime
              }
            }
          }
        }
      }
    }
  `;

  const limit = 100;
  let offset = 0;
  let total = null;
  const events = [];

  while (total === null || offset < total) {
    const response = await fetchWithRetry(`${WIESBADEN_ORIGIN}/api/graphql/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          searchInput: {
            limit,
            offset,
            archive: false,
            filter: [
              { groups: ["160418", "11475"] },
              { absoluteDateRange: { from: dateWithZone(START_DATE), to: dateWithZone(END_DATE, true) } }
            ],
            sort: [{ date: "ASC" }, { natural: "ASC" }],
            spellcheck: true
          }
        }
      })
    });

    if (!response.ok) throw new Error(`Wiesbaden GraphQL failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors) throw new Error(`Wiesbaden GraphQL errors: ${JSON.stringify(payload.errors)}`);

    total = payload.data.search.total;
    for (const result of payload.data.search.results) {
      const teaser = result.teaser;
      if (teaser?.__typename !== "EventTeaser") continue;
      for (const scheduling of teaser.schedulings ?? []) {
        if (!withinRange(scheduling.start, START_DATE, END_DATE)) continue;
        const event = {
          id: `${result.id}-${scheduling.start}`,
          sourceName: "Landeshauptstadt Wiesbaden Veranstaltungskalender",
          sourceUrl: source.link,
          titleDe: cleanText(teaser.headline),
          date: toIsoDate(scheduling.start),
          time: scheduling.hasStartTime ? toTime(scheduling.start) : null,
          price: { min: null, max: null, currency: "EUR", note: null },
          city: "Wiesbaden",
          venue: teaser.venue ?? null,
          url: normalizeUrl(teaser.link?.url),
          descriptionDe: cleanText(teaser.text),
          rawType: cleanText(teaser.kicker),
          exportedAt: new Date().toISOString()
        };
        event.rawCategoryHints = categoryHints(event);
        events.push(event);
      }
    }

    offset += limit;
  }

  return {
    source,
    sourceName: "Landeshauptstadt Wiesbaden Veranstaltungskalender",
    exportedUntil: END_DATE,
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    events
  };
}

async function scrapeStaticReferencePage(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Static source failed with HTTP ${response.status}`);

  const html = await response.text();
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s*\|.*$/, "").trim() ?? source.description;
  const linkCount = [...html.matchAll(/<a\s+[^>]*href=/gi)].length;

  return {
    source,
    sourceName: cleanText(title),
    exportedUntil: END_DATE,
    exportedAt: new Date().toISOString(),
    eventCount: 0,
    events: [],
    notes: [`Processed as a static reference page. It contains ${linkCount} links, but no dated event records were available on the selected page.`]
  };
}

async function scrapeSource(source) {
  if (source.link === "https://www.wiesbaden.de/veranstaltungen") return scrapeWiesbadenCalendar(source);
  if (source.link === "https://www.mainz.de/angebote-entdecken/freizeit/feste-und-veranstaltungen/veranstaltungskalender") {
    return scrapeMainzCalendar(source);
  }
  if (source.link === "https://www.eltville.de/freizeit-tourismus/kultur-veranstaltungen/feste-events/") {
    return scrapeEltvilleFesteEvents(source);
  }
  if (source.link === "https://www.eventfinder.de/eltville/veranstaltungen/") {
    return scrapeEventfinderEltville(source);
  }
  if (source.link === "https://www.taunusstein.de/mein-taunusstein/veranstaltungen/") {
    return scrapeTaunussteinCalendar(source);
  }
  if (source.link === "https://www.bad-schwalbach.de/freizeit-tourismus/veranstaltungen-mehr/veranstaltungskalender/") {
    return scrapeBadSchwalbachCalendar(source);
  }
  if (source.link === "https://www.idstein.de/tourismus/erleben-entdecken/veranstaltungskalender/") {
    return scrapeIdsteinCalendar(source);
  }
  if (source.link === "https://frankfurt24.ru/de/event") {
    return scrapeFrankfurt24(source);
  }
  if (source.link.includes("limburger-dommusik.de/kalender-dommusik") || source.link.includes("dom.bistumlimburg.de/gottesdienste-konzerte")) {
    return scrapeLimburgDommusik(source);
  }
  if (source.link.includes("biletkartina.tv")) {
    return scrapeBiletKartina(source);
  }
  if (source.link.includes("kontramarka.de/city/frankfurt-am-main")) {
    return scrapeKontramarka(source);
  }
  if (source.link === "https://artist-production.de") {
    return scrapeArtistProduction(source);
  }
  return scrapeStaticReferencePage(source);
}

async function scrapeEltvilleFesteEvents(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Eltville festa page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseEltvilleFesteEvents(html, source, new Date().toISOString(), START_DATE, END_DATE);
}

async function scrapeMainzCalendar(source) {
  const exportedAt = new Date().toISOString();
  const events = [];
  const seen = new Set();
  const limit = 100;
  let offset = 0;
  let page = 0;

  while (page < 20) {
    const response = await fetchWithRetry(new URL("/api/graphql/", source.link).href, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(buildMainzSearchBody({ offset, limit, startDate: START_DATE, endDate: END_DATE }))
    });

    if (!response.ok) throw new Error(`Mainz calendar failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors) throw new Error(`Mainz calendar errors: ${JSON.stringify(payload.errors)}`);

    const parsed = parseMainzSearchPage(payload, source, exportedAt, START_DATE, END_DATE);

    for (const event of parsed.events) {
      const key = `${event.date}|${event.time ?? ""}|${event.city}|${event.titleDe}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }

    const results = payload?.data?.search?.results ?? [];
    if (results.length < limit) break;
    if (!parsed.firstStart) break;
    if (parsed.firstStart.slice(0, 10) > END_DATE) break;
    offset += limit;
    page += 1;
  }

  return {
    source,
    sourceName: MAINZ_CALENDAR_TITLE,
    exportedUntil: END_DATE,
    exportedAt,
    eventCount: events.length,
    events
  };
}

async function scrapeEventfinderEltville(source) {
  const exportedAt = new Date().toISOString();
  const events = [];
  const seen = new Set();
  let pageUrl = source.link;
  let pageCount = 0;
  let pageTitle = null;

  while (pageUrl && pageCount < 5) {
    const response = await fetchWithRetry(pageUrl);
    if (!response.ok) throw new Error(`Eventfinder page failed with HTTP ${response.status}`);
    const html = await response.text();
    const parsed = extractEventfinderEvents(html, pageUrl, source, exportedAt, START_DATE, END_DATE);
    pageTitle = pageTitle ?? parsed.sourceName;
    for (const event of parsed.events) {
      const key = `${event.date}|${event.time ?? ""}|${event.city}|${event.titleDe}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
    if (!parsed.nextUrl || parsed.nextUrl === pageUrl) break;
    pageUrl = parsed.nextUrl;
    pageCount += 1;
  }

  return {
    source,
    sourceName: pageTitle ?? cleanText(source.description ?? source.link),
    exportedUntil: END_DATE,
    exportedAt,
    eventCount: events.length,
    events
  };
}

async function scrapeFrankfurt24(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Frankfurt24 page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseFrankfurt24Events(html, source, new Date().toISOString(), START_DATE, END_DATE);
}

async function scrapeTaunussteinCalendar(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Taunusstein page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseTaunussteinEvents(html, source, new Date().toISOString(), START_DATE, END_DATE);
}

async function scrapeBadSchwalbachCalendar(source) {
  return scrapeTvmCalendar(source, parseBadSchwalbachEvents, "Bad Schwalbach");
}

async function scrapeIdsteinCalendar(source) {
  return scrapeTvmCalendar(source, parseIdsteinEvents, "Idstein");
}

async function scrapeTvmCalendar(source, parseFn, label) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`${label} page failed with HTTP ${response.status}`);
  const html = await response.text();
  const endpoint = extractTvmEventListEndpoint(html, source.link, START_DATE);
  if (!endpoint) throw new Error(`${label} event-list endpoint not found`);
  const listResponse = await fetchWithRetry(endpoint, { headers: { "x-requested-with": "XMLHttpRequest" } });
  if (!listResponse.ok) throw new Error(`${label} event-list failed with HTTP ${listResponse.status}`);
  const listHtml = await listResponse.text();
  return parseFn(listHtml, source, new Date().toISOString(), START_DATE, END_DATE);
}

function extractTvmEventListEndpoint(html, sourceUrl, startDate) {
  const match = html.match(/event-list\.html\?[^"']+/i);
  if (!match) return null;
  const decoded = match[0].replace(/&amp;/g, "&");
  const url = new URL(decoded, sourceUrl);
  if (!url.searchParams.has("start")) url.searchParams.set("start", startDate);
  return url.href;
}

async function scrapeLimburgDommusik(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Limburg page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseLimburgDommusikEvents(html, source, new Date().toISOString(), START_DATE, END_DATE);
}

async function scrapeBiletKartina(source) {
  const response = await fetchWithRetry(toBiletKartinaSearchUrl(source.link));
  if (!response.ok) throw new Error(`BiletKartina page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseBiletKartinaEvents(html, source, new Date().toISOString(), START_DATE, END_DATE, fetchHtml);
}

async function scrapeKontramarka(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Kontramarka page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseKontramarkaEvents(html, source, new Date().toISOString(), START_DATE, END_DATE, fetchHtml);
}

async function scrapeArtistProduction(source) {
  const response = await fetchWithRetry(source.link);
  if (!response.ok) throw new Error(`Artist Production page failed with HTTP ${response.status}`);
  const html = await response.text();
  return parseArtistProductionEvents(html, source, new Date().toISOString(), START_DATE, END_DATE, fetchHtml);
}

async function main() {
  await rm(RAW_DIR, { recursive: true, force: true });
  await mkdir(RAW_DIR, { recursive: true });
  const sources = JSON.parse(await readFile(path.join(ROOT, "sources.json"), "utf8")).slice(SOURCE_OFFSET, SOURCE_OFFSET + SOURCE_LIMIT);

  for (const [index, source] of sources.entries()) {
    let result;
    try {
      result = await scrapeSource(source);
    } catch (error) {
      result = {
        source,
        sourceName: cleanText(source.description ?? source.link),
        exportedUntil: END_DATE,
        exportedAt: new Date().toISOString(),
        eventCount: 0,
        events: [],
        notes: [`Failed to scrape source: ${error.message}`]
      };
      console.error(`${result.sourceName}: scrape failed - ${error.message}`);
    }
    const fileName = `source-${String(index + 1).padStart(3, "0")}.json`;
    await writeFile(path.join(RAW_DIR, fileName), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`${result.sourceName}: ${result.eventCount} raw events exported until ${result.exportedUntil}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function addMonths(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

async function fetchWithRetry(url, options = {}, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Fetch timeout after 30000ms for ${url}`)), 30000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        continue;
      }
    }
  }
  throw lastError;
}

async function fetchHtml(url) {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`Fetch failed with HTTP ${response.status} for ${url}`);
  return response.text();
}

function toBiletKartinaSearchUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  const locale = parsed.pathname.split("/").filter(Boolean)[0] || "ru";
  return `${parsed.origin}/${locale}/events/search`;
}
