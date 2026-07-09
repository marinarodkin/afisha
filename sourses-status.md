# Sources Status

Date: 2026-05-29

This is a working audit of `sources.json`, `rawSources/`, and `sourceBase.json`.
It reflects the current pipeline state after the full `MONTH=1` run; `sourceBase.json` currently contains 560 events after the Russian-source city whitelist cleanup on 2026-05-29.

Note: a new Mainz GraphQL parser was added after the last completed full publish. The Mainz rows below still describe the previously persisted `sourceBase.json`; the live parser is now able to extract Mainz calendar events, but the long Mainz AI run was interrupted before publishing a refreshed base.

Current filtering rule: Russian-language sources are kept only for `Frankfurt`, `Mainz`, `Wiesbaden`, `Köln`, and `Karlsruhe`. Events for other cities such as `Berlin` or `Istanbul` are filtered out before they reach `newSources.json`.

## Parsed Successfully

| Source | Status | Raw events | Kept in `sourceBase.json` | Notes |
| --- | --- | ---: | ---: | --- |
| `https://www.wiesbaden.de/veranstaltungen` | parsed | 577 | 485 | Main feed. This is still the largest single source. |
| `https://www.eltville.de/freizeit-tourismus/kultur-veranstaltungen/feste-events/` | parsed | 3 | 9 | Dedicated Eltville fixed events feed. |
| `https://www.eventfinder.de/eltville/veranstaltungen/` | parsed | 12 | 61 | Eltville eventfinder feed with JSON-LD events and pagination. |
| `https://limburger-dommusik.de/kalender-dommusik` | parsed | 6 | 2 | Limburg calendar parser works; the feed is small. |
| `https://biletkartina.tv` | parsed | 8 | 8 | Russian-language ticket source, contributes usable events. |
| `https://biletkartina.tv/de/outskirts/Frankfurt%20am%20Main/events` | parsed | 8 | 5 | Frankfurt/Rhein-Main slice of BiletKartina. |
| `https://frankfurt24.ru/de/event` | parsed | 1 | 1 | Clean HTML card feed, one event retained in the current window. |
| `https://artist-production.de` | parsed | 56 | 34 | Works, but many cards are multi-city / multi-date and need downstream enrichment. |

## Parsed, But No New Unique Value

These sources either produced raw items that were fully deduplicated or they only exposed discovery pages without new dated records.

| Source | Status | Raw events | Kept in `sourceBase.json` | Notes |
| --- | --- | ---: | ---: | --- |
| `https://biletkartina.tv/ru/all` | no new unique events | 8 | 0 | Raw items existed, but nothing new survived dedupe/filtering in the final base. |
| `https://www.wiesbaden.de/kultur/kultur-erleben/musik/kirchenmusik-choere-orchester` | no dated records | 0 | 0 | Discovery/reference page only. |
| `https://www.einkaufen-wiesbaden.de/kirchenmusik-in-wiesbaden/` | no dated records | 0 | 0 | Discovery/reference page only. |
| `https://www.bonifatius-wiesbaden.de/kirchenmusik` | no dated records | 0 | 0 | Discovery/reference page only. |
| `https://www.dekanat-wiesbaden.de/angebote/veranstaltungen` | no dated records | 0 | 0 | Discovery/reference page only. |
| `https://rausgegangen.de/wiesbaden/` | no dated records | 0 | 0 | Landing/discovery page; no dated items extracted yet. |
| `https://stadtleben.de/wiesbaden/kalender/` | no dated records | 0 | 0 | Landing/discovery page; no dated items extracted yet. |
| `https://www.ffh.de/freizeit/was-ist-los/wiesbaden.html` | no dated records | 0 | 0 | Discovery page only. |
| `https://www.staatstheater-wiesbaden.de` | no dated records | 0 | 0 | Homepage; no event list extracted yet. |
| `https://www.staatstheater-wiesbaden.de/spielplan/` | no dated records | 0 | 0 | Selected page did not expose dated event cards in the current parser. |
| `https://www.mainz-tourismus.com/entdecken-erleben/kultur-erleben/musik-konzerte` | no dated records | 0 | 0 | Discovery page only. |
| `https://www.mainz.de/angebote-entdecken/freizeit/feste-und-veranstaltungen/veranstaltungskalender` | no dated records | 0 | 0 | Calendar shell present, but no extractable dated records yet. |
| `https://rausgegangen.de/mainz/` | no dated records | 0 | 0 | Discovery page only. |
| `https://staatstheater-mainz.com` | no dated records | 0 | 0 | Homepage only. |
| `https://www.staatstheater-mainz.com/uebersicht/maerz` | no dated records | 0 | 0 | Selected monthly page did not yield extractable records yet. |
| `https://www.rheingau.com/events` | no dated records | 0 | 0 | Discovery page only. |
| `https://www.eltville.de/freizeit-tourismus/kultur-veranstaltungen/` | no dated records | 0 | 0 | Navigation page, not the event feed. |
| `https://www.eltville.de/freizeit-tourismus/kultur-veranstaltungen/veranstaltungskalender/` | no dated records | 0 | 0 | Calendar shell only. |
| `https://www.eltville.de/freizeit-tourismus/kultur-veranstaltungen/feste-events/sound-of-eltville/` | no dated records | 0 | 0 | Discovery page only. |
| `https://www.taunus.info/freizeit-geniessen/veranstaltungskalender` | no dated records | 0 | 0 | Discovery page only. |
| `https://www.reservix.de/tickets-in-taunusstein` | blocked / no usable data | 0 | 0 | HTTP 403. |
| `https://limburger-dommusik.de` | no dated records | 0 | 0 | Homepage only. |
| `https://dom.bistumlimburg.de/gottesdienste-konzerte` | no dated records | 0 | 0 | No dated records extracted by the current parser. |
| `https://veranstaltungen.meinestadt.de/wiesbaden/alle/alle` | failed | 0 | 0 | Fetch timeout. |
| `https://www.reservix.de` | blocked / no usable data | 0 | 0 | HTTP 403. |
| `https://www.adticket.de` | blocked / no usable data | 0 | 0 | HTTP 403. |
| `https://veranstaltungen.meinestadt.de/mainz` | failed | 0 | 0 | Fetch timeout. |
| `https://veranstaltungen.meinestadt.de/mainz/sport/alle` | failed | 0 | 0 | Fetch timeout. |
| `https://veranstaltungen.meinestadt.de/wiesbaden/sport/alle` | failed | 0 | 0 | Fetch timeout. |
| `https://veranstaltungen.meinestadt.de/taunusstein/partys-feiern/alle` | failed | 0 | 0 | Fetch timeout. |
| `https://www.mainz.de/freizeit-und-sport/veranstaltungskalender-sport.php` | failed | 0 | 0 | HTTP 404. |
| `https://www.mainz.de/freizeit-und-sport/sportveranstaltungen.php` | no dated records | 0 | 0 | Discovery page only. |
| `https://sporthilfe-wiesbaden.de/sporthilfe/veranstaltungen/` | no dated records | 0 | 0 | Discovery page only. |
| `https://www.wiesbadener-lv.de/home/terminkalender/` | no dated records | 0 | 0 | Discovery page only. |
| `https://rausgegangen.de/wiesbaden/kategorie/sport/` | no dated records | 0 | 0 | Discovery page only. |

## What This Means

- Wiesbaden is still the only city with deep coverage.
- Eltville is now the only other local area with a meaningful second feed.
- Limburg, Frankfurt24, BiletKartina, and Artist Production add real value.
- Mainz is present in `sources.json`, but the current parser still does not extract dated events from its official pages.
- A lot of the remaining sources are discovery pages, redirects, or blocked pages. They are useful as source pointers, but not as event feeds yet.

## Next Useful Work

1. Build dedicated parsers for Mainz if we want real Mainz coverage.
2. Decide whether `Meinestadt` sources are worth a browser-based or API-based path, since the current fetch-based approach times out.
3. Keep discovery pages in `sources.json` only if they are useful as source pointers; otherwise they can be pruned later.
