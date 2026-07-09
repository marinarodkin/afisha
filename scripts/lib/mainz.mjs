import { categoryHints, cleanText, toIsoDate, toTime, withinRange } from "./events.mjs";

export const MAINZ_ORIGIN = "https://www.mainz.de";
export const MAINZ_CALENDAR_TITLE = "Veranstaltungskalender | Landeshauptstadt Mainz";

const MAINZ_SEARCH_QUERY = `query Search($searchInput: SearchInput!) {
  search(input: $searchInput) {
    total
    offset
    limit
    queryTime
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
          schedulings { start end isFullDay hasStartTime hasEndTime }
        }
      }
    }
  }
}`;

export function buildMainzSearchBody({ offset, limit, startDate, endDate }) {
  return {
    query: MAINZ_SEARCH_QUERY,
    variables: {
      searchInput: {
        offset,
        limit,
        archive: false,
        filter: [
          { groups: ["1417"] },
          { relativeDateRange: { from: "P0D", to: durationForMonthRange(startDate, endDate) } }
        ],
        sort: [{ date: "ASC" }, { natural: "ASC" }],
        spellcheck: true,
        lang: "de-DE"
      }
    }
  };
}

export function parseMainzSearchPage(payload, source, exportedAt, startDate, endDate) {
  const search = payload?.data?.search;
  const events = [];
  const seen = new Set();
  if (!search?.results?.length) {
    return {
      source,
      sourceName: MAINZ_CALENDAR_TITLE,
      exportedUntil: endDate,
      exportedAt,
      eventCount: 0,
      events,
      hasMore: false,
      firstStart: null
    };
  }

  for (const result of search.results) {
    const teaser = result?.teaser;
    if (teaser?.__typename !== "EventTeaser") continue;
    for (const scheduling of teaser.schedulings ?? []) {
      if (!withinRange(scheduling.start, startDate, endDate)) continue;
      const event = {
        id: `mainz-${result.id}-${scheduling.start}`,
        sourceName: MAINZ_CALENDAR_TITLE,
        sourceUrl: source.link,
        titleDe: cleanText(teaser.headline),
        date: toIsoDate(scheduling.start),
        time: scheduling.hasStartTime ? toTime(scheduling.start) : null,
        price: { min: null, max: null, currency: "EUR", note: null },
        city: "Mainz",
        venue: cleanText(teaser.venue) || null,
        url: normalizeMainzUrl(teaser.link?.url),
        descriptionDe: cleanText(teaser.text || teaser.headline),
        rawType: cleanText(teaser.kicker) || result.objectType || "Mainz Event",
        exportedAt
      };
      event.rawCategoryHints = categoryHints(event);
      const key = `${event.date}|${event.time ?? ""}|${event.city}|${event.titleDe}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
  }

  return {
    source,
    sourceName: MAINZ_CALENDAR_TITLE,
    exportedUntil: endDate,
    exportedAt,
    eventCount: events.length,
    events,
    hasMore: (search.results?.length ?? 0) > 0,
    firstStart: firstSchedulingStart(search.results?.[0] ?? null)
  };
}

function normalizeMainzUrl(url) {
  if (!url) return null;
  return new URL(url, MAINZ_ORIGIN).href;
}

function firstSchedulingStart(result) {
  const starts = result?.teaser?.schedulings?.map((item) => item.start).filter(Boolean) ?? [];
  return starts.length > 0 ? starts[0] : null;
}

function durationForMonthRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000)));
  return `P${months}M`;
}
