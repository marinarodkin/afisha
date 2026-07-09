import { cleanText, normalizeUrl, toIsoDate, toTime, withinRange } from "./events.mjs";

const MONTHS = {
  januar: 0,
  februar: 1,
  maerz: 2,
  märz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11
};

const EVENTFINDER_CITIES = [
  ["ingelheim-am-rhein", "Ingelheim am Rhein"],
  ["oestrich-winkel", "Oestrich-Winkel"],
  ["budenheim", "Budenheim"],
  ["wiesbaden", "Wiesbaden"],
  ["eltville", "Eltville am Rhein"]
];

export function extractTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return cleanText(decodeHtmlEntities(match?.[1] ?? ""));
}

export function parseEltvilleFesteEvents(html, source, exportedAt, startDate, endDate) {
  const pageTitle = extractTitle(html) || source.description || "Eltville";
  const events = [];
  const itemRe = /<h4[^>]*class="image-with-text__headline[^"]*"[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<p[^>]*class="image-with-text__text[^"]*"[^>]*>([\s\S]*?)<\/p>/g;

  for (const match of html.matchAll(itemRe)) {
    const segment = html.slice(match.index ?? 0, (match.index ?? 0) + 4000);
    const moreMatch = segment.match(/<a[^>]*class="image-with-text__more-button[^"]*"[^>]*href="([^"]+)"/i);
    const title = cleanText(decodeHtmlEntities(stripTags(match[1])));
    const rawText = cleanText(decodeHtmlEntities(stripTags(match[2])));
    if (!title || !rawText) continue;
    const parsed = parseEltvilleCardText(rawText);
    if (!parsed || !parsed.date) continue;
    if (!withinRange(parsed.startDate, startDate, endDate)) continue;

    events.push({
      id: `eltville-${slugify(title)}-${parsed.date}-${parsed.time ?? "all-day"}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: title,
      date: parsed.date,
      time: parsed.time,
      price: { min: null, max: null, currency: "EUR", note: null },
      city: "Eltville am Rhein",
      venue: parsed.venue,
      url: normalizeUrl(moreMatch?.[1]),
      descriptionDe: rawText,
      rawType: "Feste & Events",
      exportedAt
    });
  }

  return {
    source,
    sourceName: pageTitle,
    exportedUntil: endDate,
    exportedAt,
    eventCount: events.length,
    events
  };
}

export function extractEventfinderEvents(html, pageUrl, source, exportedAt, startDate, endDate) {
  const pageTitle = extractTitle(html) || source.description || "eventfinder";
  const graph = parseJsonLdGraph(html);
  const events = [];

  for (const item of graph.filter((node) => node?.["@type"] === "Event")) {
    const url = normalizeUrl(item.url);
    if (!url) continue;
    const date = toIsoDate(item.startDate);
    if (!date || !withinRange(item.startDate, startDate, endDate)) continue;
    const city = inferEventfinderCity(url);
    const venue = inferEventfinderVenue(url, item.name);

    events.push({
      id: `eventfinder-${item["@id"]?.split("/").filter(Boolean).at(-2) ?? slugify(item.name)}-${date}-${toTime(item.startDate) ?? "all-day"}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: cleanText(decodeHtmlEntities(item.name ?? "")),
      date,
      time: toTime(item.startDate),
      price: { min: null, max: null, currency: "EUR", note: null },
      city,
      venue,
      url,
      descriptionDe: cleanText(decodeHtmlEntities(item.description ?? item.name ?? "")) || cleanText(decodeHtmlEntities(item.name ?? "")),
      rawType: "Eventfinder",
      exportedAt
    });
  }

  return {
    source,
    sourceName: pageTitle,
    exportedUntil: endDate,
    exportedAt,
    eventCount: events.length,
    events,
    nextUrl: extractNextLink(html, pageUrl)
  };
}

function parseJsonLdGraph(html) {
  const match = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].find((entry) => entry[1].includes("\"@type\""));
  if (!match) return [];
  const json = JSON.parse(match[1]);
  return Array.isArray(json) ? json : json["@graph"] ?? [];
}

function extractNextLink(html, pageUrl) {
  const match = html.match(/<link rel="next" href="([^"]+)"/i);
  if (!match) return null;
  return new URL(match[1], pageUrl).href;
}

function parseEltvilleCardText(text) {
  const normalized = cleanText(text);
  let match = normalized.match(/^ab\s+1\.\s*Advent\s+bis\s+(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})([\s\S]*)$/i);
  if (match) {
    const end = makeDate(match[3], match[2], match[1]);
    const start = firstAdvent(Number.parseInt(match[3], 10) - 1);
    return {
      startDate: start,
      date: start,
      endDate: end,
      time: null,
      venue: extractVenue(match[4] ?? "")
    };
  }

  match = normalized.match(/^(\d{1,2})\.\s+und\s+(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})([\s\S]*)$/i);
  if (match) {
    const start = makeDate(match[4], match[3], match[1]);
    const end = makeDate(match[4], match[3], match[2]);
    return {
      startDate: start,
      date: start,
      endDate: end,
      time: null,
      venue: extractVenue(match[5] ?? "")
    };
  }

  match = normalized.match(/^(\d{1,2})\.\s+bis\s+(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})([\s\S]*)$/i);
  if (match) {
    const start = makeDate(match[4], match[3], match[1]);
    const end = makeDate(match[4], match[3], match[2]);
    return {
      startDate: start,
      date: start,
      endDate: end,
      time: null,
      venue: extractVenue(match[5] ?? "")
    };
  }

  match = normalized.match(/^(\d{1,2})\.\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{4})([\s\S]*)$/i);
  if (match) {
    const start = makeDate(match[3], match[2], match[1]);
    return {
      startDate: start,
      date: start,
      endDate: start,
      time: null,
      venue: extractVenue(match[4] ?? "")
    };
  }

  return null;
}

function extractVenue(remainder) {
  let value = cleanText(remainder);
  value = value.replace(/^[-:]\s*/, "");
  value = value.replace(/^(?:auf dem|auf der|in der|im der|im|in|am|an|auf|bei)\s+/i, "");
  value = value.replace(/\s*\(.*\)$/, "");
  value = value.replace(/[.]+$/, "");
  return value || null;
}

function makeDate(year, monthName, day) {
  const monthIndex = MONTHS[normalizeMonth(monthName)];
  if (monthIndex === undefined) return null;
  const date = new Date(Date.UTC(Number.parseInt(year, 10), monthIndex, Number.parseInt(day, 10)));
  return date.toISOString().slice(0, 10);
}

function firstAdvent(year) {
  const christmas = new Date(Date.UTC(year, 11, 25));
  const day = christmas.getUTCDay();
  const offset = (day + 7 - 0) % 7;
  const fourthSundayBeforeChristmas = new Date(Date.UTC(year, 11, 25 - offset));
  const firstAdventDate = new Date(fourthSundayBeforeChristmas);
  firstAdventDate.setUTCDate(firstAdventDate.getUTCDate() - 21);
  return firstAdventDate.toISOString().slice(0, 10);
}

function normalizeMonth(value) {
  return cleanText(value).toLowerCase().replace("ä", "ä").replace("ü", "ü").replace("ö", "ö");
}

function inferEventfinderCity(url) {
  const lower = url.toLowerCase();
  for (const [needle, city] of EVENTFINDER_CITIES) {
    if (lower.includes(needle)) return city;
  }
  return "Eltville am Rhein";
}

function inferEventfinderVenue(url, name) {
  const match = url.match(/\/veranstaltung\/\d+\/([^/]+)\/?$/i);
  if (!match) return null;
  const slug = match[1];
  const titleSlug = slugify(name ?? "");
  const remainder = slug.startsWith(`${titleSlug}-`) ? slug.slice(titleSlug.length + 1) : slug;
  const venueSlug = remainder.replace(/-(?:am|an|auf|bei|im|in)-\d{4}-\d{2}-\d{2}-um-.*/i, "").replace(/^(?:auf-dem|auf-der|in-der|im-der|im|in|am|an|auf|bei)-/i, "");
  if (!venueSlug) return null;
  return cleanText(decodeHtmlEntities(venueSlug.replace(/-/g, " ")));
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
