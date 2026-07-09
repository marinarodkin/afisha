# Update Sources Workflow

Команда обновления источников:

```bash
npm run update:sources
```

Русский алиас:

```bash
npm run "обновить источники"
```

## Env

- `source_amount` / `SOURCE_AMOUNT` / `SOURCES_AMOUNT` - сколько источников обрабатывать, по умолчанию `2`.
- `source_offset` / `SOURCE_OFFSET` - с какого источника начинать, по умолчанию `0`.
- `ITEMS_FOR_TEST` - сколько новых событий отправлять в AI, по умолчанию `100`.
- `MONTH` - горизонт скрапинга в месяцах от даты старта, по умолчанию `3`.
- `START_DATE` - дата старта, по умолчанию текущая дата.
- `OPENAI_MODEL` - модель enrichment, по умолчанию `gpt-4o-mini`.
- `ENRICH_BATCH_SIZE` - размер батча AI enrichment, по умолчанию `1`.
- `ENRICH_MAX_COMPLETION_TOKENS` - лимит completion tokens для AI enrichment, по умолчанию `2500`.

## Files

- `rawSources/` - raw JSON по каждому источнику.
- `sourceBase.json` - источник правды для фронтенда, аналог базы данных.
- `newSources.json` - новые релевантные события текущего обновления.
- `exceptedItems.json` - события, которые уже исключены и больше не отправляются в AI.
- `exceptionCategories.json` - raw-категории, удаляемые до AI, сейчас `wochenmarkt`.
- `exceptionAiTags.json` - AI-теги, удаляемые после AI.
- `prompts/enrich-events.yaml` - единственный файл с промптом для OpenAI enrichment.
- `logs/update-sources.log` - подробный лог этапов.
- `categoryHints` автоматически добавляет `church` для церковных мероприятий и `civic` для демонстраций, Pride и тем про меньшинства; дальше эти события идут по обычным исключениям.
- Для русскоязычных источников действует city whitelist: `Frankfurt`, `Mainz`, `Wiesbaden`, `Köln`, `Karlsruhe`. Все остальные города, например `Berlin` или `Istanbul`, отбрасываются до попадания в `newSources.json`.

## Matching

События считаются совпадающими по ключу:

```text
date + time + venue + first 5 normalized title chars
```

Этот ключ используется для проверки `sourceBase.json`, `newSources.json` и `exceptedItems.json`.

## Steps

1. Скрапинг источников в `rawSources/`.
   - Если отдельный источник не отвечает в пределах retry timeout, он сохраняется как пустой raw-файл с `notes`, а весь batch продолжает работу.
2. Для каждого raw source:
   - удалить события с raw-категориями из `exceptionCategories.json`;
   - для русскоязычных источников оставить только события из городов `Frankfurt`, `Mainz`, `Wiesbaden`, `Köln`, `Karlsruhe`;
   - удалить события, которые уже есть в `exceptedItems.json`;
   - пропустить события, которые уже есть в `sourceBase.json`;
   - пропустить события, которые уже есть в текущем `newSources.json`;
   - добавить оставшиеся события в `newSources.json` без дублей.
3. Обрезать `newSources.json` до `ITEMS_FOR_TEST`.
4. Отправить `newSources.json` в OpenAI API.
5. OpenAI добавляет русский заголовок, русское описание, категории и теги.
6. Отфильтровать события с тегами из `exceptionAiTags.json` и категориями из `exceptionCategories.json`, если AI снова поставил исключенную raw-категорию как тег.
7. Отфильтрованные AI события добавить в `exceptedItems.json`.
8. Оставшиеся события записать в `newSources.json`.
9. Добавить `newSources.json` в `sourceBase.json` без дублей.
10. Фронтенд читает `sourceBase.json`.
