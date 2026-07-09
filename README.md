# Afisha

Статический агрегатор мероприятий для Rhein-Main. Основной workflow скрапит источники в raw JSON, собирает новые события в `newSources.json`, обогащает их через OpenAI API, фильтрует исключения и добавляет релевантные события в `sourceBase.json`, из которого строится фронтенд.

## Структура

- `sources.json` - список источников.
- `scripts/update-sources.mjs` - команда обновления источников.
- `scripts/scrape-raw.mjs` - сырой скрапинг источников в `rawSources/`.
- `scripts/enrich-openai.mjs` - OpenAI API enrichment через строгий JSON schema output.
- `scripts/lib/source-workflow.mjs` - чистые функции workflow и дедупликации по ключу.
- `prompts/enrich-events.yaml` - YAML-промпт для AI enrichment.
- `rawSources/` - сырые файлы, один JSON на источник.
- `newSources.json` - новые события текущего обновления.
- `sourceBase.json` - источник правды для фронтенда.
- `exceptedItems.json` - исключенные события, которые больше не отправляются в AI.
- `exceptionCategories.json` - raw-категории, исключаемые до AI.
- `exceptionAiTags.json` - AI-теги, исключаемые после AI.
- `export/index.json` - копия текущей базы для совместимости.
- `public/` - статический сайт.
- `docs/UPDATE_WORKFLOW.md` - подробное описание workflow.
- `AGENTS_LOG.md` - журнал выполненных действий.

## JSON события

Каждое мероприятие экспортируется в структуре:

```json
{
  "title": "Deutscher Titel / Русский перевод",
  "titleDe": "Deutscher Titel",
  "titleRu": "Русский перевод",
  "date": "2026-05-27",
  "time": "19:00",
  "type": "concert",
  "tags": ["concert", "museum"],
  "price": { "min": null, "max": null, "currency": "EUR", "note": null },
  "city": "Wiesbaden",
  "description": "Описание на русском",
  "descriptionDe": "Beschreibung auf Deutsch",
  "descriptionRu": "Описание на русском"
}
```

Дополнительные поля: `id`, `sourceName`, `sourceUrl`, `venue`, `url`, `rawType`, `exportedAt`.

`type` хранит основную категорию для совместимости, а `tags` хранит все категории мероприятия. Поддерживаются `concert`, `student_concert`, `spektakl`, `opera`, `fest`, `sport`, `kino`, `arthouse_cinema`, `museum`, `exhibition`, `wochenmarkt`, `children`, `master_class`, `course`, `excursion`, `church`, `reading_club`, `lecture`, `civic`, `poetry_evening`, `poetry_slam`, `handicraft`, `creative_meeting`, `reading`, `lang_ru`, `lang_en`, `free`, `other`.

Для русскоязычных источников дополнительно включен city whitelist: `Frankfurt`, `Mainz`, `Wiesbaden`, `Köln`, `Karlsruhe`. События из других городов, например `Berlin` или `Istanbul`, не попадают в базу.

## Исключения

Файл `exceptionCategories.json` содержит raw-категории, которые удаляются до AI. Сейчас исключена категория:

```json
["wochenmarkt"]
```

Файл `exceptionAiTags.json` содержит AI-теги, которые удаляются после enrichment и добавляются в `exceptedItems.json`, чтобы повторно не гонять их через AI. Сейчас исключены:

```json
["civic", "poetry_evening", "poetry_slam", "handicraft"]
```

## Команды

```bash
npm install
source_amount=2 ITEMS_FOR_TEST=100 MONTH=3 npm run update:sources
npm run build
npm run serve
npm run test
```

Русский алиас основной команды:

```bash
npm run "обновить источники"
```

По умолчанию workflow использует:

- `source_amount=2`
- `ITEMS_FOR_TEST=100`
- `MONTH=3`
- `START_DATE=текущая дата`
- `OPENAI_MODEL=gpt-4o-mini`
- `ENRICH_BATCH_SIZE=1`
- `ENRICH_MAX_COMPLETION_TOKENS=2500`

OpenAI API enrichment отдельно запускается так:

```bash
npm run enrich:api
```

`OPENAI_API_KEY` загружается из локального `.env` проекта. Файл `.env` не коммитится.

## Источники фазы 1

1. `https://www.wiesbaden.de/veranstaltungen` - официальный календарь Wiesbaden, события получаются через публичный GraphQL API сайта.
2. `https://www.wiesbaden.de/kultur/kultur-erleben/musik/kirchenmusik-choere-orchester` - справочная страница про Kirchenmusik, Chöre und Orchester. На выбранной странице нет датированных событий, поэтому raw-файл источника содержит `eventCount: 0` и пояснение в `notes`.

## Публикация

Сайт публикуется как статический сайт на VPS под доменом:

```text
https://afisha.softdock.de
```

Публичная директория на сервере:

```text
/var/www/sites/afisha/public
```

Nginx обслуживает поддомен `afisha.softdock.de` из этой директории, Caddy принимает HTTPS и проксирует запросы в nginx на порт `8090`. После каждого обновления нужно выполнить `npm run update:sources`, `npm run build`, синхронизировать `public/` в `/var/www/sites/afisha/public` и проверить сайт.

## Тестирование

Функциональность проверяется Playwright smoke-тестом:

```bash
npm run test
```

Тест открывает сайт, проверяет рендер карточек, мультивыбор категорий, исключение `wochenmarkt`, фильтр по дате и мобильный viewport.

Последняя проверка `2026-05-27` после workflow `sourceBase.json` и `ITEMS_FOR_TEST=100` выполнена локально и на `https://afisha.softdock.de`:

- 170 карточек;
- фильтр `kino` - 27 карточек;
- мультвыбор `excursion + master_class` - 61 карточка;
- диапазон `2026-05-28` - `2026-05-29` - 30 карточек;
- мобильный viewport - 30 карточек.

API enrichment выполнен на `gpt-4o-mini` с батчем 10 событий и лимитом `ENRICH_MAX_COMPLETION_TOKENS=8000`. В `categoryHints` добавлены `church` для церковных мероприятий и `civic` для демонстраций, Pride и тем про меньшинства; эти события отдаются в исключения как `political/social`. `sourceBase.json` получен через OpenAI API, не через headless Codex.

Русскоязычные источники фильтруются по городам до попадания в `newSources.json`: разрешены только `Frankfurt`, `Mainz`, `Wiesbaden`, `Köln`, `Karlsruhe`.

В карточке заголовок ведет прямо на страницу события, а источник показывается отдельной строкой внизу мелким шрифтом.
