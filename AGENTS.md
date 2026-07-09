# AGENTS

## Текущий агент

- Роль: Codex CLI coding agent.
- Задача: реализовать первую фазу агрегатора мероприятий.
- Источники: `sources.json`, на первой фазе используется `SOURCES_AMOUNT=2`.

## Правила работы

- Все существенные действия фиксируются в `AGENTS_LOG.md`.
- Raw export пишется в `rawSources/`, один JSON-файл на источник.
- `newSources.json` хранит новые события текущего обновления, `sourceBase.json` является источником правды для фронтенда.
- OpenAI API enrichment обогащает `newSources.json`, затем AI-исключения попадают в `exceptedItems.json`, а релевантные события добавляются в `sourceBase.json`.
- Исключенные raw-категории хранятся в `exceptionCategories.json`, AI-теги исключений - в `exceptionAiTags.json`.
- Промпт enrichment хранится в `prompts/enrich-events.yaml`.
- Для API enrichment требуется `OPENAI_API_KEY`; он загружается из локального `.env`. Модель по умолчанию `gpt-4o-mini`, переопределяется через `OPENAI_MODEL`.
- Headless Codex fallback удален из проекта.
- Публичный статический сайт лежит в `public/`.
- Для полного обновления использовать `npm run update:sources` или `npm run "обновить источники"`.
- Для проверки использовать `npm run build`, локальный `npm run serve`, затем `npm run test`.
