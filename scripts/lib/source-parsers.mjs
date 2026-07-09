import { categoryHints, cleanText, normalizeUrl, toIsoDate, toTime, withinRange } from "./events.mjs";

export function parseTaunussteinEvents(html, source, exportedAt, startDate, endDate) {
  const pageTitle = extractTitle(html) || source.description || "Taunusstein";
  const events = [];
  const seen = new Set();
  const blockRe = /<a name="terminanker_[\s\S]*?<div class="managertrenner/g;

  for (const match of html.matchAll(blockRe)) {
    const block = match[0];
    const url = normalizeUrl(block.match(/<a href="(https:\/\/www\.taunusstein\.de\/regional\/veranstaltungen\/[^"]+)"\s+title="Detailseite"/i)?.[1] ?? null);
    const title = cleanText(decodeHtmlEntities(stripTags(block.match(/<span class="bezeichnung">([\s\S]*?)<\/span>/i)?.[1] ?? block.match(/<span class="manager_titel[^"]*">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "")));
    const rawDate = block.match(/<span class="datum">([\s\S]*?)<\/span>/i)?.[1] ?? block.match(/<span class="manager_untertitel[^"]*">([\s\S]*?)<\/span>/i)?.[1] ?? "";
    const description = cleanText(decodeHtmlEntities(stripTags(block.match(/<div class="kurzbeschreibung">([\s\S]*?)<\/div>/i)?.[1] ?? ""))) || title;
    const date = parseGermanDate(rawDate);
    const time = extractTime(rawDate);
    if (!title || !date || !withinRange(date, startDate, endDate)) continue;

    const event = {
      id: `taunusstein-${slugify(url ?? title)}-${date}-${time ?? "all-day"}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: title,
      date,
      time,
      price: { min: null, max: null, currency: "EUR", note: null },
      city: "Taunusstein",
      venue: extractTaunussteinVenue(title, description),
      url,
      descriptionDe: description,
      rawType: "Taunusstein Veranstaltungskalender",
      exportedAt
    };
    event.rawCategoryHints = categoryHints(event);

    const key = `${event.date}|${event.time ?? ""}|${event.titleDe}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
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

export function parseFrankfurt24Events(html, source, exportedAt, startDate, endDate) {
  const pageTitle = extractTitle(html) || source.description || "Frankfurt24";
  const events = [];
  const cardRe = /<a class="card-title[^"]*" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<span class="fw-bold">\s*📅\s*([^<]+)<\/span>\s*<span class="ms-2">([^<]*)<\/span>[\s\S]*?<p class="card-text[^"]*"[^>]*>([\s\S]*?)<\/p>[\s\S]*?<p class="fw-bold mb-0">([\s\S]*?)<\/p>/g;

  for (const match of html.matchAll(cardRe)) {
    const url = normalizeUrl(match[1]);
    const title = cleanText(decodeHtmlEntities(stripTags(match[2])));
    const date = parseGermanDate(match[3]);
    const time = cleanText(decodeHtmlEntities(match[4])) || null;
    const description = cleanText(decodeHtmlEntities(stripTags(match[5])));
    const venue = cleanText(decodeHtmlEntities(stripTags(match[6]))) || null;
    if (!url || !title || !date || !withinRange(date, startDate, endDate)) continue;

    events.push({
      id: `frankfurt24-${slugify(url)}-${date}-${time ?? "all-day"}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: title,
      date,
      time: time === "-" ? null : time,
      price: { min: null, max: null, currency: "EUR", note: null },
      city: "Frankfurt am Main",
      venue,
      url,
      descriptionDe: description || title,
      rawType: "Frankfurt24",
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

export async function parseBiletKartinaEvents(listHtml, source, exportedAt, startDate, endDate, fetchHtml) {
  const pageTitle = extractTitle(listHtml) || source.description || "BiletKartina";
  const searchUrl = toBiletKartinaSearchUrl(source.link);
  const hrefs = extractHrefs(listHtml, /href="(\/[a-z]{2}\/event\/[^"]+)"/g);
  const events = [];
  const seen = new Set();

  for (const href of hrefs) {
    const detailUrl = new URL(href, searchUrl).href;
    const detailHtml = await fetchHtml(detailUrl);
    const detailEvents = extractStructuredEvents(detailHtml, detailUrl, source, exportedAt, startDate, endDate, {
      defaultSourceName: pageTitle,
      defaultSourceUrl: source.link,
      defaultCity: inferBiletKartinaCity(source.link)
    });

    for (const event of detailEvents) {
      const key = `${event.date}|${event.time ?? ""}|${event.city}|${event.titleDe}`;
      if (seen.has(key)) continue;
      if (!isAllowedRussianSourceCity(source.link, event.city)) continue;
      seen.add(key);
      events.push(event);
    }
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

export async function parseKontramarkaEvents(listHtml, source, exportedAt, startDate, endDate, fetchHtml) {
  const pageTitle = extractTitle(listHtml) || source.description || "Kontramarka";
  const hrefs = extractHrefs(listHtml, /href="(\/[a-z]{2}\/tour\/[^"]+)"/g);
  const events = [];
  const seen = new Set();

  for (const href of hrefs) {
    const detailUrl = new URL(href, source.link).href;
    const detailHtml = await fetchHtml(detailUrl);
    const detailEvents = extractKontramarkaDetailEvents(detailHtml, detailUrl, source, exportedAt, startDate, endDate, pageTitle);

    for (const event of detailEvents) {
      const key = `${event.date}|${event.time ?? ""}|${event.city}|${event.titleDe}`;
      if (seen.has(key)) continue;
      if (!isAllowedRussianSourceCity(source.link, event.city)) continue;
      seen.add(key);
      events.push(event);
    }
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

export async function parseArtistProductionEvents(listHtml, source, exportedAt, startDate, endDate, fetchHtml) {
  const pageTitle = extractTitle(listHtml) || source.description || "Artist Production";
  const hrefs = extractHrefs(listHtml, /href="(https:\/\/artist-production\.de\/[^"]+\/)"/g);
  const events = [];
  const seen = new Set();

  for (const href of hrefs) {
    const detailHtml = await fetchHtml(href);
    const detailEvents = extractArtistProductionDetailEvents(detailHtml, href, source, exportedAt, startDate, endDate, pageTitle);

    for (const event of detailEvents) {
      const key = `${event.date}|${event.time ?? ""}|${event.city}|${event.titleDe}`;
      if (seen.has(key)) continue;
      if (!isAllowedRussianSourceCity(source.link, event.city)) continue;
      seen.add(key);
      events.push(event);
    }
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

export function parseLimburgDommusikEvents(html, source, exportedAt, startDate, endDate) {
  const pageTitle = extractTitle(html) || source.description || "Limburger Dommusik";
  const pageYear = extractYearFromMonthHeader(html) ?? Number.parseInt(startDate.slice(0, 4), 10);
  const events = [];
  const cardRe = /<(?:span|div) class="event-date-day">(\d{1,2})<\/(?:span|div)>[\s\S]*?<(?:span|div) class="event-date-month">([A-Za-zÄÖÜäöüß]+)<\/(?:span|div)>[\s\S]*?<a rel="nofollow" class="document-link" href="([^"]+)">\s*<h3 class="event-title">([\s\S]*?)<\/h3>[\s\S]*?<p class="abstract hide-mobile">([\s\S]*?)<\/p>[\s\S]*?<span class="event-location">([\s\S]*?)<\/span>/g;

  for (const match of html.matchAll(cardRe)) {
    const day = Number.parseInt(match[1] ?? "", 10);
    const monthName = match[2];
    const url = normalizeUrl(match[3]);
    const title = cleanText(decodeHtmlEntities(stripTags(match[4])));
    const abstract = cleanText(decodeHtmlEntities(stripTags(match[5])));
    const locationParts = extractLocationParts(match[6]);
    const date = day && monthName ? makeDate(pageYear, monthName, day) : null;
    if (!url || !title || !date || !withinRange(date, startDate, endDate)) continue;

    events.push({
      id: `limburg-${slugify(url)}-${date}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: title,
      date,
      time: extractTime(abstract),
      price: { min: null, max: null, currency: "EUR", note: null },
      city: "Limburg",
      venue: locationParts.venue,
      url,
      descriptionDe: abstract || title,
      rawType: "Limburger Dommusik",
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

export function extractStructuredEvents(html, pageUrl, source, exportedAt, startDate, endDate, options = {}) {
  const pageTitle = extractTitle(html) || options.defaultSourceName || source.description || "event";
  const events = [];
  for (const item of parseJsonLdEvents(html)) {
    const normalized = normalizeStructuredEvent(item, pageUrl, source, exportedAt, options);
    if (!normalized) continue;
    if (!withinRange(normalized.date, startDate, endDate)) continue;
    events.push({ ...normalized, sourceName: pageTitle, sourceUrl: options.defaultSourceUrl ?? source.link });
  }
  return events;
}

function normalizeStructuredEvent(item, pageUrl, source, exportedAt, options = {}) {
  const date = toIsoDate(item.startDate ?? item.date ?? item.startdate ?? null);
  if (!date) return null;
  const url = normalizeUrl(item.url) ?? pageUrl;
  const title = cleanText(decodeHtmlEntities(item.name ?? item.headline ?? options.defaultTitle ?? ""));
  const description = cleanText(decodeHtmlEntities(item.description ?? item.disambiguatingDescription ?? item.name ?? title));
  const cityVenue = extractCityAndVenueFromLocation(item.location ?? null, options.defaultCity ?? null);
  const price = extractPrice(item.offers);
  return {
    id: `event-${slugify(url)}-${date}-${toTime(item.startDate) ?? "all-day"}`,
    sourceName: options.defaultSourceName ?? source.description ?? extractTitleFromUrl(pageUrl),
    sourceUrl: options.defaultSourceUrl ?? source.link,
    titleDe: title || description,
    date,
    time: toTime(item.startDate),
    price,
    city: cityVenue.city ?? options.defaultCity ?? "Frankfurt am Main",
    venue: cityVenue.venue,
    url,
    descriptionDe: description,
    rawType: item.genre ?? item["@type"] ?? "Event",
    exportedAt
  };
}

function parseJsonLdEvents(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const events = [];
  for (const match of scripts) {
    const raw = decodeHtmlEntities(match[1]).trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const node of walkJsonLd(parsed)) {
      const type = node?.["@type"];
      if (type === "Event" || (Array.isArray(type) && type.includes("Event"))) {
        events.push(node);
      }
    }
  }
  return events;
}

function walkJsonLd(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => walkJsonLd(entry));
  }
  if (value && typeof value === "object") {
    const nodes = [value];
    if (Array.isArray(value["@graph"])) {
      nodes.push(...value["@graph"].flatMap((entry) => walkJsonLd(entry)));
    } else {
      for (const nested of Object.values(value)) {
        if (nested && typeof nested === "object") {
          nodes.push(...walkJsonLd(nested));
        }
      }
    }
    return nodes;
  }
  return [];
}

function extractKontramarkaDetailEvents(html, pageUrl, source, exportedAt, startDate, endDate, pageTitle) {
  const events = [];
  const title = cleanText(decodeHtmlEntities(stripTags(html.match(/<h1 class="tour-section-title title-1">[\s\S]*?<span class="d-block">([\s\S]*?)<\/span>/i)?.[1] ?? "")));
  const description = cleanText(decodeHtmlEntities(stripTags(html.match(/<div class="tour-section-description-wrapper">([\s\S]*?)<\/div>/i)?.[1] ?? ""))) || title;
  const rowRe = /<div class="schedule-row" data-concert-id="[^"]+">([\s\S]*?)<\/div>\s*<\/div>/g;

  for (const match of html.matchAll(rowRe)) {
    const block = match[1];
    const eventStart = block.match(/<span itemprop="startDate" content="([^"]+)"/i)?.[1] ?? null;
    const date = toIsoDate(eventStart);
    if (!date || !withinRange(date, startDate, endDate)) continue;

    const venue = cleanText(decodeHtmlEntities(stripTags(block.match(/<div itemprop="location"[\s\S]*?<meta itemprop="name" content="([^"]+)"/i)?.[1] ?? ""))) || null;
    const address = cleanText(decodeHtmlEntities(stripTags(block.match(/<meta itemprop="address" content="([^"]+)"/i)?.[1] ?? ""))) || null;
    const city = extractCityFromAddress(address) ?? extractCityFromText(block) ?? "Frankfurt am Main";
    const time = cleanText(block.match(/<span class="time">([^<]+)<\/span>/i)?.[1] ?? "") || null;
    const priceValue = block.match(/<meta itemprop="price" content="([^"]+)"/i)?.[1] ?? null;
    const price = priceValue ? Number.parseFloat(priceValue) : null;
    const detailUrl = normalizeUrl(block.match(/<meta itemprop="url" content="([^"]+)"/i)?.[1] ?? pageUrl);

    events.push({
      id: `kontramarka-${slugify(detailUrl)}-${date}-${time ?? "all-day"}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: title || pageTitle,
      date,
      time,
      price: { min: price, max: price, currency: "EUR", note: null },
      city,
      venue,
      url: detailUrl,
      descriptionDe: description,
      rawType: "Kontramarka",
      exportedAt
    });
  }

  return events;
}

function extractArtistProductionDetailEvents(html, pageUrl, source, exportedAt, startDate, endDate, pageTitle) {
  const events = [];
  const title =
    cleanText(decodeHtmlEntities(stripTags(html.match(/<h1[^>]*tour-section-title[^>]*>[\s\S]*?<span[^>]*d-block[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ""))) ||
    cleanText(decodeHtmlEntities(html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] ?? "")) ||
    pageTitle;
  const description =
    cleanText(decodeHtmlEntities(stripTags(html.match(/<meta itemprop="description" content="([^"]+)"/i)?.[1] ?? ""))) ||
    cleanText(decodeHtmlEntities(stripTags(html.match(/<div class="tour-section-description-wrapper">([\s\S]*?)<\/div>/i)?.[1] ?? ""))) ||
    title;
  const ticketRe = /<div class="ticket-item">([\s\S]*?)<div class="ticket-link ticked-desktop/g;

  for (const match of html.matchAll(ticketRe)) {
    const block = match[1];
    const city = cleanText(decodeHtmlEntities(stripTags(block.match(/<div class="ticket-place">[\s\S]*?<span>([^<]+)<\/span>/i)?.[1] ?? ""))) || "Frankfurt am Main";
    const venue = cleanText(decodeHtmlEntities(stripTags(block.match(/<span class="place">([^<]+)<\/span>/i)?.[1] ?? ""))) || null;
    const eventStart = block.match(/itemprop="startDate"\s+content="([^"]+)"/i)?.[1] ?? null;
    const date = toIsoDate(eventStart);
    if (!date || !withinRange(date, startDate, endDate)) continue;
    const time = cleanText(block.match(/<span class="day-time">([^<]+)<\/span>/i)?.[1] ?? "") || null;
    const priceValue = block.match(/itemprop="price"\s+content="([^"]+)"/i)?.[1] ?? null;
    const price = priceValue ? Number.parseFloat(priceValue) : null;

    events.push({
      id: `artist-production-${slugify(pageUrl)}-${date}-${city}-${venue ?? "event"}`,
      sourceName: pageTitle,
      sourceUrl: source.link,
      titleDe: title || pageTitle,
      date,
      time,
      price: { min: price, max: price, currency: "EUR", note: null },
      city,
      venue,
      url: pageUrl,
      descriptionDe: description,
      rawType: "Artist Production",
      exportedAt
    });
  }

  return events;
}

function extractTitle(html) {
  return cleanText(decodeHtmlEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "")).replace(/\s*\|.*$/, "");
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

function extractTitleFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "event";
  }
}

function extractPrice(offers) {
  if (!offers) return { min: null, max: null, currency: "EUR", note: null };
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const value = offer?.price ? Number.parseFloat(String(offer.price).replace(",", ".")) : null;
  const currency = offer?.priceCurrency ?? "EUR";
  return { min: value, max: value, currency, note: null };
}

function extractCityAndVenueFromLocation(location, fallbackCity = null) {
  if (!location) return { city: fallbackCity, venue: null };
  if (typeof location === "string") {
    return { city: fallbackCity, venue: cleanText(location) || null };
  }

  const venue = cleanText(location.name ?? "") || null;
  const address = location.address ?? location.streetAddress ?? null;
  const city = extractCityFromAddress(address) ?? (cleanText(location.addressLocality ?? "") || fallbackCity);
  return {
    city: city || fallbackCity,
    venue
  };
}

function extractCityFromAddress(address) {
  if (!address) return null;
  const text = cleanText(typeof address === "string" ? address : `${address.streetAddress ?? ""} ${address.postalCode ?? ""} ${address.addressLocality ?? ""}`);
  const postalCity = text.match(/\b\d{5}\s+([A-Za-zÄÖÜäöüß\- ]+)$/);
  if (postalCity) return cleanText(postalCity[1]);
  const simpleCity = text.match(/,\s*([A-Za-zÄÖÜäöüß\- ]+)$/);
  if (simpleCity) return cleanText(simpleCity[1]);
  if (typeof address === "object") {
    return cleanText(address.addressLocality ?? address.name ?? "") || null;
  }
  return null;
}

function extractCityFromText(text) {
  const value = cleanText(decodeHtmlEntities(stripTags(text)));
  const match = value.match(/\b(Berlin|Köln|Koeln|Wien|Frankfurt am Main|Frankfurt|Limburg|Mainz|Wiesbaden|Eltville|Bonn|München|Munich)\b/i);
  return match ? cleanText(match[1]) : null;
}

function extractLocationParts(text) {
  const value = cleanText(decodeHtmlEntities(stripTags(text)));
  const parts = value.split(/\s{2,}/).map((part) => cleanText(part)).filter(Boolean);
  return {
    venue: parts[0] ?? null,
    lines: parts
  };
}

function extractTaunussteinVenue(title, description) {
  const text = cleanText(`${title} ${description}`);
  const inMatch = text.match(/\bin\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+)/);
  if (inMatch) return cleanText(inMatch[1]);
  const imMatch = text.match(/\bim\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\- ]+)/);
  if (imMatch) return cleanText(imMatch[1]);
  return null;
}

function extractTime(text) {
  const match = cleanText(text).match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}

function extractYearFromMonthHeader(html) {
  const match = html.match(/month-header[\s\S]*?<span>([A-Za-zÄÖÜäöüß]+)\s+(\d{4})<\/span>/i);
  return match ? Number.parseInt(match[2], 10) : null;
}

function parseGermanDate(value) {
  const text = cleanText(value);
  const numeric = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (numeric) {
    const [, day, month, year] = numeric;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const named = text.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})/);
  if (named) {
    const [, day, monthName, year] = named;
    const month = GERMAN_MONTHS[normalizeMonth(monthName)];
    if (month !== undefined) {
      return new Date(Date.UTC(Number.parseInt(year, 10), month, Number.parseInt(day, 10))).toISOString().slice(0, 10);
    }
  }

  return null;
}

function makeDate(year, monthName, day) {
  const month = GERMAN_MONTHS[normalizeMonth(monthName)];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number.parseInt(year, 10), month, Number.parseInt(day, 10))).toISOString().slice(0, 10);
}

function normalizeMonth(value) {
  return cleanText(value).toLowerCase();
}

function slugify(value) {
  return cleanText(String(value))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function toBiletKartinaSearchUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  const locale = parsed.pathname.split("/").filter(Boolean)[0] || "ru";
  return `${parsed.origin}/${locale}/events/search`;
}

function inferBiletKartinaCity(sourceUrl) {
  const url = sourceUrl.toLowerCase();
  if (url.includes("/de/outskirts/frankfurt")) return "Frankfurt am Main";
  if (url.includes("/frankfurt")) return "Frankfurt am Main";
  return null;
}

function extractHrefs(html, hrefRe) {
  const hrefs = [];
  for (const match of html.matchAll(hrefRe)) {
    hrefs.push(match[1]);
  }
  return [...new Set(hrefs)];
}

const GERMAN_MONTHS = {
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
