import assert from "node:assert/strict";
import { appendToSourceBase, collectNewEvents, eventKey, splitByAiTagExceptions } from "./lib/source-workflow.mjs";
import { categoryHints, hasFreeEntryEvidence, hasLanguageEvidence } from "./lib/events.mjs";
import { extractEventfinderEvents, parseEltvilleFesteEvents } from "./lib/eltville.mjs";
import { buildEffectiveExcludeKeywords, buildPersonalIndex, scoreEventForPreferences } from "./lib/personalization.mjs";
import {
  parseArtistProductionEvents,
  parseBiletKartinaEvents,
  parseFrankfurt24Events,
  parseKontramarkaEvents,
  parseLimburgDommusikEvents,
  parseTaunussteinEvents
} from "./lib/source-parsers.mjs";
import { parseMainzSearchPage } from "./lib/mainz.mjs";

const baseEvent = {
  id: "base",
  date: "2026-05-27",
  time: "19:00",
  venue: "Museum Wiesbaden",
  titleDe: "ABCDE Konzert",
  rawCategoryHints: ["concert"]
};

assert.equal(eventKey(baseEvent), eventKey({ ...baseEvent, id: "copy", titleDe: "ABCDEF andere Worte" }));
assert.notEqual(eventKey(baseEvent), eventKey({ ...baseEvent, time: "20:00" }));

const rawSources = [
  {
    events: [
      baseEvent,
      { ...baseEvent, id: "wochenmarkt", titleDe: "Markt", rawCategoryHints: ["wochenmarkt"] },
      { ...baseEvent, id: "excepted", titleDe: "EXCEP old", rawCategoryHints: ["concert"] },
      { ...baseEvent, id: "new-1", titleDe: "NEWAA first", rawCategoryHints: ["concert"] },
      { ...baseEvent, id: "new-duplicate", titleDe: "NEWAA duplicate", rawCategoryHints: ["concert"] },
      { ...baseEvent, id: "new-2", titleDe: "OTHER second", rawCategoryHints: ["museum"] }
    ]
  }
];

const sourceBase = { events: [baseEvent] };
const exceptedItems = { events: [{ ...baseEvent, id: "excepted-store", titleDe: "EXCEP old" }] };
const collected = collectNewEvents(rawSources, sourceBase, { events: [] }, exceptedItems, ["wochenmarkt"], 100);

assert.equal(collected.stats.raw, 6);
assert.equal(collected.stats.skippedByExceptionCategory, 1);
assert.equal(collected.stats.skippedByExceptedItems, 1);
assert.equal(collected.stats.skippedBySourceBase, 1);
assert.equal(collected.stats.skippedByNewSources, 1);
assert.deepEqual(collected.events.map((event) => event.id), ["new-1", "new-2"]);

const split = splitByAiTagExceptions(
  {
    events: [
      { ...baseEvent, id: "keep", titleDe: "KEEPA", categories: ["concert"], tags: ["free"] },
      { ...baseEvent, id: "reject", titleDe: "REJEC", categories: ["civic"], tags: ["lecture"] }
    ]
  },
  { events: [] },
  ["civic"]
);

assert.deepEqual(split.kept.map((event) => event.id), ["keep"]);
assert.deepEqual(split.rejected.map((event) => event.id), ["reject"]);
assert.equal(split.exceptedEvents.length, 1);

const appended = appendToSourceBase({ events: [baseEvent] }, { events: [baseEvent, { ...baseEvent, id: "fresh", titleDe: "FRESH" }] });
assert.equal(appended.events.length, 2);
assert.equal(appended.appendedCount, 1);
const unbounded = collectNewEvents(rawSources, { events: [] }, { events: [] }, { events: [] }, [], 0);
assert.equal(unbounded.events.length, 5);

assert.equal(
  categoryHints({
    titleDe: "Kirchenkonzert im Dom",
    descriptionDe: "Musik in der Kirche"
  }).includes("church"),
  true
);
assert.equal(
  categoryHints({
    titleDe: "Demonstration für Minderheiten",
    descriptionDe: "Pride und Solidarität"
  }).includes("civic"),
  true
);
assert.equal(
  categoryHints({
    titleDe: "Studentenkonzert an der Musikhochschule",
    descriptionDe: "Abschlusskonzert"
  }).includes("student_concert"),
  true
);
assert.equal(
  categoryHints({
    titleDe: "Ausstellung im Museum",
    descriptionDe: "Vernissage"
  }).includes("exhibition"),
  true
);
assert.equal(hasFreeEntryEvidence({ titleDe: "Eintritt frei, kostenlos" }), true);
assert.equal(hasFreeEntryEvidence({ titleDe: "Nur Kartenverkauf" }), false);
assert.equal(hasLanguageEvidence({ titleDe: "Lesung auf Russisch" }, "ru"), true);
assert.equal(hasLanguageEvidence({ titleDe: "Lecture in English" }, "en"), true);

const eltvilleHtml = `
  <html>
    <head><title>Feste &amp; Events | Eltville am Rhein</title></head>
    <body>
      <div class="image-with-text__item">
        <div data-element="content" class="image-with-text__wrapper">
          <div class="image-with-text__content">
            <div class="image-with-text__content-inner">
              <h4 class="image-with-text__headline">Eltviller Rosentage</h4>
              <p class="image-with-text__text">6. und 7. Juni 2026 - Innenstadt, Kurfürstliche Burg, Rheinufer</p>
            </div>
            <a class="image-with-text__more-button" href="/freizeit-tourismus/erleben-entdecken/stadtportrait/rosenstadt/rosentage/"><div>Mehr</div></a>
          </div>
        </div>
      </div>
      <div class="image-with-text__item">
        <div data-element="content" class="image-with-text__wrapper">
          <div class="image-with-text__content">
            <div class="image-with-text__content-inner">
              <h4 class="image-with-text__headline">Weihnachtstreiben</h4>
              <p class="image-with-text__text">ab 1. Advent bis 1. Januar 2027 auf dem Platz der Deutschen Einheit in Eltville</p>
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>
`;

const parsedEltville = parseEltvilleFesteEvents(
  eltvilleHtml,
  { link: "https://www.eltville.de/freizeit-tourismus/kultur-veranstaltungen/feste-events/", description: "Eltville" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2027-01-31"
);

assert.equal(parsedEltville.eventCount, 2);
assert.equal(parsedEltville.events[0].city, "Eltville am Rhein");
assert.equal(parsedEltville.events[0].venue, "Innenstadt, Kurfürstliche Burg, Rheinufer");
assert.equal(parsedEltville.events[1].date, "2026-11-29");

const eventfinderHtml = `
  <html>
    <head><title>Veranstaltungen Eltville am Rhein - Termine &amp; Tickets | Veranstaltungskalender Eltville am Rhein</title></head>
    <body>
      <script type="application/ld+json">
      [
        {
          "@type": "Event",
          "@id": "https://www.eventfinder.de/veranstaltung/3187155/#event",
          "url": "https://www.eventfinder.de/veranstaltung/3187155/zwischen-himmel-und-herz-in-eltville-hattenheim-am-2026-05-28-um-19-00-uhr/",
          "name": "Zwischen Himmel und Herz",
          "description": "Berührendes Konzert",
          "startDate": "2026-05-28T19:00:00+02:00"
        }
      ]
      </script>
      <link rel="next" href="/eltville/veranstaltungen/?page=2">
    </body>
  </html>
`;

const parsedEventfinder = extractEventfinderEvents(
  eventfinderHtml,
  "https://www.eventfinder.de/eltville/veranstaltungen/",
  { link: "https://www.eventfinder.de/eltville/veranstaltungen/", description: "eventfinder" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2026-12-31"
);

assert.equal(parsedEventfinder.eventCount, 1);
assert.equal(parsedEventfinder.events[0].city, "Eltville am Rhein");
assert.equal(parsedEventfinder.events[0].date, "2026-05-28");
assert.equal(parsedEventfinder.nextUrl, "https://www.eventfinder.de/eltville/veranstaltungen/?page=2");

const frankfurt24Html = `
  <html>
    <head><title>Frankfurt24 Events</title></head>
    <body>
      <a class="card-title fw-bold link-dark text-uppercase" href="https://frankfurt24.ru/de/event/9427">Event A</a>
      <div class="hstack mb-2"><span class="fw-bold">📅 31.05.2026</span><span class="ms-2">14:00</span></div>
      <p class="card-text d-none d-sm-block">Beschreibung A</p>
      <p class="fw-bold mb-0">Venue A</p>
    </body>
  </html>
`;
assert.equal(parseFrankfurt24Events(frankfurt24Html, { link: "https://frankfurt24.ru/de/event", description: "Frankfurt24" }, "2026-05-27T00:00:00.000Z", "2026-05-01", "2026-12-31").eventCount, 1);

const limburgHtml = `
  <html>
    <head><title>Limburger Dommusik</title></head>
    <body>
      <div class="month-header"><span>Mai 2026</span></div>
      <div class="event-date-day">31</div><div class="event-date-month">Mai</div>
      <a rel="nofollow" class="document-link" href="https://limburger-dommusik.de/kalender-dommusik/tag-der-offenen-tuer-und-familienkonzert">
        <h3 class="event-title">Tag der offenen Tür und Familienkonzert</h3>
      </a>
      <p class="abstract hide-mobile">Beginn: 13:00 Uhr Besichtigung</p>
      <div class="event-information">
        <div class="event-details">
          <span class="event-location"><span>Limburger Dommusik - Pädagogisches Haus und Verwaltung</span><span>Domplatz 3</span><span>65549 Limburg</span></span>
        </div>
      </div>
    </body>
  </html>
`;
assert.equal(parseLimburgDommusikEvents(limburgHtml, { link: "https://limburger-dommusik.de/kalender-dommusik", description: "Limburg" }, "2026-05-27T00:00:00.000Z", "2026-05-01", "2026-12-31").eventCount, 1);

const mainzPayload = {
  data: {
    search: {
      total: 1,
      offset: 0,
      limit: 5,
      results: [
        {
          id: "info-networking-event-165071",
          objectType: "infoNetworkingEvent",
          teaser: {
            __typename: "EventTeaser",
            headline: "Mainzer Sommerkonzert",
            text: "Open-Air Konzert im Innenhof",
            kicker: "Veranstaltungskalender",
            venue: "Innenhof",
            link: { url: "/info-networking-event?id=165071", label: "" },
            schedulings: [
              { start: "2026-05-29T19:00:00+02:00", end: "2026-05-29T21:00:00+02:00", isFullDay: false, hasStartTime: true, hasEndTime: true }
            ]
          }
        }
      ]
    }
  }
};

const parsedMainz = parseMainzSearchPage(
  mainzPayload,
  { link: "https://www.mainz.de/angebote-entdecken/freizeit/feste-und-veranstaltungen/veranstaltungskalender", description: "Mainz" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2026-12-31"
);

assert.equal(parsedMainz.eventCount, 1);
assert.equal(parsedMainz.events[0].city, "Mainz");
assert.equal(parsedMainz.events[0].url, "https://www.mainz.de/info-networking-event?id=165071");
assert.equal(parsedMainz.events[0].titleDe, "Mainzer Sommerkonzert");

const taunussteinHtml = `
  <a name="terminanker_900011422"></a>
  <div class="style4 managerbox">
    <h5 class="zugeklappt">
      <span class="head_container">
        <span class="funktionicons">
          <span class="manager_andere_icons">
            <a href="https://www.taunusstein.de/regional/veranstaltungen/klangvielfalt-im-doppelpack-900011422-29880.html?naviID=0" title="Detailseite"></a>
          </span>
        </span>
      </span>
      <span id="manager_titel_termine_internet90000011923" class="manager_titel_container zugeklappt">
        <span class="manager_titel" style="max-width: 893px;">
          <a class="toggle" title="zuklappen / aufklappen">Klangvielfalt im Doppelpack</a>
        </span>
        <span class="manager_untertitel" style="max-width: 893px;">Do., 06.08.2026, 18:30<span class="span_enduhrzeit">&nbsp;-&nbsp;20:30</span> Uhr</span>
      </span>
    </h5>
    <div id="managerboxinfo_termine_internet90000011923" class="box_info_area hide">
      <div class="main_1">
        <div class="veranstaltung_grunddaten">
          <span class="bezeichnung">Klangvielfalt im Doppelpack</span>
          <span class="datum">Do., 06.08.2026, 18:30<span class="span_enduhrzeit">&nbsp;-&nbsp;20:30</span> Uhr</span>
          <div class="kurzbeschreibung">Zwei der besten Akkordeonorchester Deutschlands präsentieren sich in Wehen mit einem bunten Programm von Klassik bis Tango.</div>
        </div>
      </div>
    </div>
  </div>
  <div class="managertrenner"></div>
  <a name="terminanker_900007985"></a>
  <div class="style4 managerbox">
    <h5 class="zugeklappt">
      <span class="head_container">
        <span class="funktionicons">
          <span class="manager_andere_icons">
            <a href="https://www.taunusstein.de/regional/veranstaltungen/wochenmarkt-in-hahn-900007985-29880.html?naviID=0" title="Detailseite"></a>
          </span>
        </span>
      </span>
      <span id="manager_titel_termine_internet9000001190" class="manager_titel_container zugeklappt">
        <span class="manager_titel"><a class="toggle">Wochenmarkt in Hahn</a></span>
        <span class="manager_untertitel">Do., 09.07.2026, 14:00<span class="span_enduhrzeit">&nbsp;-&nbsp;18:00</span> Uhr</span>
      </span>
    </h5>
    <div id="managerboxinfo_termine_internet9000001190" class="box_info_area hide">
      <div class="main_1"><div class="veranstaltung_grunddaten"><span class="bezeichnung">Wochenmarkt in Hahn</span><span class="datum">Do., 09.07.2026, 14:00<span class="span_enduhrzeit">&nbsp;-&nbsp;18:00</span> Uhr</span></div></div>
    </div>
  </div>
  <div class="managertrenner"></div>
`;

const parsedTaunusstein = parseTaunussteinEvents(
  taunussteinHtml,
  { link: "https://www.taunusstein.de/mein-taunusstein/veranstaltungen/", description: "Taunusstein" },
  "2026-07-09T00:00:00.000Z",
  "2026-07-01",
  "2026-08-31"
);

assert.equal(parsedTaunusstein.eventCount, 2);
assert.equal(parsedTaunusstein.events[0].titleDe, "Klangvielfalt im Doppelpack");
assert.equal(parsedTaunusstein.events[0].date, "2026-08-06");
assert.equal(parsedTaunusstein.events[0].time, "18:30");
assert.equal(parsedTaunusstein.events[0].city, "Taunusstein");
assert.equal(parsedTaunusstein.events[0].url, "https://www.taunusstein.de/regional/veranstaltungen/klangvielfalt-im-doppelpack-900011422-29880.html?naviID=0");
assert.equal(parsedTaunusstein.events[0].rawCategoryHints.includes("concert"), true);
assert.equal(parsedTaunusstein.events[1].rawCategoryHints.includes("wochenmarkt"), true);

const preferences = {
  profile: "marina-personal-mvp",
  citiesPriority: ["Bad Schwalbach", "Idstein", "Taunusstein", "Wiesbaden"],
  includeTags: ["church", "concert", "arthouse_cinema", "kino"],
  boostTags: ["church", "concert", "arthouse_cinema"],
  excludeTags: ["civic", "handicraft"],
  excludeKeywords: ["salsa"],
  excludeRawPatterns: ["politik", "demo"],
  learnedMappings: [{ ifKeyword: "salsa", alsoExclude: ["bachata", "latin dance"] }],
  scoring: {
    preferredCityBonus: 40,
    preferredTagBonus: 20,
    keywordBonus: 15,
    freeBonus: 10,
    weekendBonus: 10,
    excludedPenalty: 100,
    minimumScore: 15
  }
};

assert.deepEqual(buildEffectiveExcludeKeywords(preferences), ["salsa", "bachata", "latin dance"]);

const churchConcert = {
  id: "church-concert",
  titleDe: "Orgelkonzert in der Kirche",
  descriptionDe: "Klassische Musik mit freiem Eintritt",
  date: "2026-07-11",
  time: "19:00",
  city: "Bad Schwalbach",
  venue: "Evangelische Kirche",
  type: "concert",
  tags: ["concert", "church", "free"]
};

const salsaEvent = {
  id: "salsa-night",
  titleDe: "Salsa & Bachata Sommernacht",
  descriptionDe: "Latin Dance Open Air",
  date: "2026-07-11",
  time: "20:00",
  city: "Wiesbaden",
  venue: "Kurpark",
  type: "other",
  tags: ["other"]
};

const politicalEvent = {
  id: "politics",
  titleDe: "Politik und Stadtgesellschaft",
  descriptionDe: "Öffentliche Demo und Diskussion",
  date: "2026-07-11",
  time: "18:00",
  city: "Taunusstein",
  venue: "Marktplatz",
  type: "lecture",
  tags: ["civic", "lecture"]
};

const score = scoreEventForPreferences(churchConcert, preferences);
assert.equal(score.excluded, false);
assert.equal(score.score >= 100, true);
assert.equal(score.reasons.includes("preferred-city"), true);
assert.equal(score.reasons.includes("preferred-tag:church"), true);

const excludedByKeyword = scoreEventForPreferences(salsaEvent, preferences);
assert.equal(excludedByKeyword.excluded, true);
assert.equal(excludedByKeyword.reasons.includes("excluded-keyword:salsa"), true);

const excludedByTag = scoreEventForPreferences(politicalEvent, preferences);
assert.equal(excludedByTag.excluded, true);
assert.equal(excludedByTag.reasons.includes("excluded-tag:civic"), true);

const personalIndex = buildPersonalIndex(
  {
    generatedAt: "2026-07-09T00:00:00.000Z",
    events: [churchConcert, salsaEvent, politicalEvent]
  },
  preferences,
  { now: "2026-07-10T12:00:00.000Z" }
);

assert.equal(personalIndex.profile, "marina-personal-mvp");
assert.equal(personalIndex.eventCount, 1);
assert.deepEqual(personalIndex.events.map((event) => event.id), ["church-concert"]);
assert.equal(personalIndex.events[0].personalScore >= 100, true);
assert.equal(personalIndex.events[0].matchReasons.includes("preferred-city"), true);

const biletListHtml = `
  <div class="event-card-component group relative">
    <a class="absolute w-full h-full top-0 left-0 m-p-0 bg-transparent z-[3] pointer-events-none group-hover:pointer-events-auto" href="/ru/event/Lekcii_Natasi_Panfilovoj_v_Berline_i_Vene"></a>
    <span class="event-card-hover-info-date-component">28 Мая - 29 Мая</span>
    <span class="event-card-hover-info-name-component">Лекции Наташи Панфиловой в Берлине и Вене</span>
    <span class="event-card-hover-info-cities-component">Berlin, Wien</span>
    <h3 class="event-card-title-component">Лекции Наташи Панфиловой в Берлине и Вене</h3>
  </div>
`;
const biletDetailHtml = `
  <script type="application/ld+json">
    [
      {
        "@context":"http://schema.org",
        "@type":"Event",
        "name":"Лекции Наташи Панфиловой в Берлине и Вене",
        "description":"Лекции Наташи Панфиловой",
        "startDate":"2026-05-28",
        "location":{"@type":"Place","name":"Ko3","address":"Koblenzer Str. 3, 10715 Berlin"},
        "offers":{"@type":"Offer","price":"37","priceCurrency":"EUR"}
      }
    ]
  </script>
`;
const biletBerlinParsed = await parseBiletKartinaEvents(
  biletListHtml,
  { link: "https://biletkartina.tv/ru/all", description: "BiletKartina" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2026-12-31",
  async () => biletDetailHtml
);
assert.equal(biletBerlinParsed.eventCount, 0);

const biletFrankfurtDetailHtml = `
  <script type="application/ld+json">
    [
      {
        "@context":"http://schema.org",
        "@type":"Event",
        "name":"Лекция в Франкфурте",
        "description":"Лекция в Франкфурте",
        "startDate":"2026-05-28",
        "location":{"@type":"Place","name":"Ko3","address":"Koblenzer Str. 3, 60311 Frankfurt am Main"},
        "offers":{"@type":"Offer","price":"37","priceCurrency":"EUR"}
      }
    ]
  </script>
`;
const biletFrankfurtParsed = await parseBiletKartinaEvents(
  biletListHtml,
  { link: "https://biletkartina.tv/ru/all", description: "BiletKartina" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2026-12-31",
  async () => biletFrankfurtDetailHtml
);
assert.equal(biletFrankfurtParsed.eventCount, 1);
assert.equal(biletFrankfurtParsed.events[0].city, "Frankfurt am Main");

const kontramarkaListHtml = `
  <div class="events__item" data-data-layer="eyJuYW1lIjoiRGllIEJhbmQgXCJTdXNpZHkgU3RlcnBseWF0XCIgaW4gRGV1dHNjaGxhbmQiLCJpZCI6IjIxMTkiLCJwcmljZSI6ImFiIDMzLjYwIiwiYnJhbmQiOiJLb250cmFtYXJrYS5kZSIsImNhdGVnb3JpZXMiOlt7ImlkIjoiMiIsImFsdF9uYW1lIjoia29uY2VydGkiLCJuYW1lIjoiQ29uY2VydHMiLCJsaW5rIjoiPGEgaHJlZj1cIi9kZS9rb25jZXJ0aS9cIiByZWw9XCJ2OnVybFwiIHByb3BlcnR5PVwidjp0aXRsZVwiPjwvYT4iLCJ1cmwiOiJodHRwczpcL1wvd3d3LmtvbnRyYW1hcmthLmRlXC9kZVwva29uY2VydGlcLyJ9XSwidmFyaWFudCI6IlRvdXIiLCJsaXN0Ijp7Im5hbWUiOiJLb256ZXJ0ZSB1bmQgQXVmZsO8aHJ1bmdlbiBpbiBGcmFua2Z1cnQgYW0gTWFpbiIsImlkIjoiZXZlbnRzX2luX2ZyYW5rZnVydC1hbS1tYWluIn19">
    <a href="/de/tour/susidy-sterplyat/" class="block-title"><div class="lc-3"><span class="block-title__text">Die Band \"Susidy Sterplyat\" in Deutschland</span></div></a>
  </div>
`;
const kontramarkaDetailHtml = `
  <h1 class="tour-section-title title-1"><span class="d-block">Die Band "Susidy Sterplyat" in Deutschland</span></h1>
  <div class="schedule-row" data-concert-id="12305">
    <div class="schema d-none" itemscope="" itemtype="http://schema.org/Event">
      <div itemprop="location" itemscope="" itemtype="http://schema.org/EventVenue">
        <meta itemprop="name" content="Club Volta">
        <meta itemprop="address" content="Gebäude, 51063 Köln">
      </div>
      <span itemprop="startDate" content="2026-05-28">28.05.2026</span>
      <div itemprop="offers" itemscope="" itemtype="http://schema.org/Offer"><meta itemprop="price" content="33.60"></div>
    </div>
  </div>
`;
const kontramarkaParsed = await parseKontramarkaEvents(
  kontramarkaListHtml,
  { link: "https://www.kontramarka.de/city/frankfurt-am-main/", description: "Kontramarka" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2026-12-31",
  async () => kontramarkaDetailHtml
);
assert.equal(kontramarkaParsed.eventCount, 1);
assert.equal(kontramarkaParsed.events[0].city, "Köln");

const artistListHtml = `
  <article class="col-12 col-md-5ths event flip-container" data-date='{"1779998400":"20260528"}'>
    <a href="https://artist-production.de/susidy-sterplyat/" title="Susidy Sterplyat" class="flipper new row">
      <div class="event-title">Susidy Sterplyat</div>
    </a>
  </article>
`;
const artistDetailHtml = `
  <h1 class="tour-section-title title-1"><span class="d-block">Susidy Sterplyat</span></h1>
  <div class="ticket-item">
    <div itemprop="location" itemscope="" itemtype="http://schema.org/Place">
      <meta itemprop="name" content="Club Volta"/>
      <meta itemprop="address" content="Schanzenstraße 6, 51063 Köln"/>
    </div>
    <div itemprop="offers" itemscope="" itemtype="http://schema.org/Offer"><meta itemprop="price" content="28"/></div>
    <div class="ticket-place"><a><span>Кёльн</span><span class="place">Club Volta</span></a></div>
    <div class="ticket-date"><span class="date" itemprop="startDate" content="2026-05-28">28.05.2026</span><span class="day-time">Чт, 20:00</span></div>
    <div class="ticket-price">28</div>
    <div class="ticket-link ticked-desktop"></div>
  </div>
`;
const artistParsed = await parseArtistProductionEvents(
  artistListHtml,
  { link: "https://artist-production.de", description: "Artist" },
  "2026-05-27T00:00:00.000Z",
  "2026-05-01",
  "2026-12-31",
  async () => artistDetailHtml
);
assert.equal(artistParsed.eventCount, 1);
assert.equal(artistParsed.events[0].city, "Кёльн");

console.log("workflow tests passed");
