const TYPE_LABELS = {
  concert: "Концерт",
  student_concert: "Студенческий концерт",
  spektakl: "Спектакль",
  opera: "Опера",
  fest: "Фест",
  sport: "Спорт",
  kino: "Кино",
  arthouse_cinema: "Авторское кино",
  museum: "Музей",
  exhibition: "Выставка",
  wochenmarkt: "Еженедельный рынок",
  children: "Детское",
  master_class: "Мастер-класс",
  course: "Курс",
  excursion: "Экскурсия",
  church: "Церковь",
  reading_club: "Читательский клуб",
  lecture: "Лекция",
  civic: "Политико/общественное",
  poetry_evening: "Поэтический вечер",
  poetry_slam: "Poetry slam",
  handicraft: "Рукоделие",
  creative_meeting: "Творческая встреча",
  reading: "Чтение",
  lang_ru: "Русский язык",
  lang_en: "Английский язык",
  free: "Бесплатно",
  other: "Другое"
};

const REACTIONS_STORAGE_KEY = "afisha:reactions:v1";
const REACTION_LABELS = {
  liked: "Лайк",
  disliked: "Не мое"
};
const REACTION_ARIA_LABELS = {
  liked: {
    active: "Убрать лайк",
    inactive: "Поставить лайк"
  },
  disliked: {
    active: "Убрать не мое",
    inactive: "Поставить не мое"
  }
};
const REACTION_ICONS = {
  liked: {
    outline: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 11v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm4.5-8 1.6 4.8c.15.44.17.92.04 1.37L12.6 12h6.85a2 2 0 0 1 1.99 2.2l-.67 6a2 2 0 0 1-1.99 1.8H9c-1.1 0-2-.9-2-2v-8.5L10.2 3h1.3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    `,
    filled: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 11v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zm4.5-8 1.6 4.8c.15.44.17.92.04 1.37L12.6 12h6.85a2 2 0 0 1 1.99 2.2l-.67 6a2 2 0 0 1-1.99 1.8H9c-1.1 0-2-.9-2-2v-8.5L10.2 3h1.3Z" fill="currentColor"/>
      </svg>
    `
  },
  disliked: {
    outline: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M17 13V3h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2zm-4.5 8-1.6-4.8c-.15-.44-.17-.92-.04-1.37L11.4 12H4.55a2 2 0 0 1-1.99-2.2l.67-6a2 2 0 0 1 1.99-1.8H15c1.1 0 2 .9 2 2v8.5L13.8 21h-1.3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    `,
    filled: `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M17 13V3h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2zm-4.5 8-1.6-4.8c-.15-.44-.17-.92-.04-1.37L11.4 12H4.55a2 2 0 0 1-1.99-2.2l.67-6a2 2 0 0 1 1.99-1.8H15c1.1 0 2 .9 2 2v8.5L13.8 21h-1.3Z" fill="currentColor"/>
      </svg>
    `
  }
};

const state = {
  data: null,
  events: [],
  excludedCategories: [],
  selectedCategories: [],
  selectedExcludedCategories: [],
  categoryValues: [],
  reactions: {
    liked: new Set(),
    disliked: new Set()
  },
  favoritesOnly: false,
  hideDisliked: false
};

const controls = {
  dateFrom: document.querySelector("#dateFrom"),
  dateTo: document.querySelector("#dateTo"),
  categorySelect: document.querySelector("#categorySelect"),
  excludeCategorySelect: document.querySelector("#excludeCategorySelect"),
  city: document.querySelector("#cityFilter"),
  reset: document.querySelector("#resetFilters"),
  statusRow: document.querySelector(".status-row"),
  favoritesFilter: null,
  hideDislikedFilter: null
};

const eventsEl = document.querySelector("#events");
const emptyEl = document.querySelector("#emptyState");
const resultCountEl = document.querySelector("#resultCount");
const summaryEl = document.querySelector("#sourceSummary");
const periodEl = document.querySelector("#periodLabel");

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function formatPrice(price) {
  if (!price || (price.min === null && price.max === null)) return "Цена не указана";
  if (price.min !== null && price.max !== null) return `${price.min}-${price.max} ${price.currency}`;
  if (price.min !== null) return `от ${price.min} ${price.currency}`;
  return `до ${price.max} ${price.currency}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeKeyPart(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function eventKey(event) {
  return [event.date ?? "", event.time ?? "", normalizeKeyPart(event.venue ?? ""), normalizeKeyPart(event.title ?? "").slice(0, 5)].join("|");
}

function loadReactions() {
  try {
    const raw = localStorage.getItem(REACTIONS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.reactions.liked = new Set(Array.isArray(parsed?.liked) ? parsed.liked : []);
    state.reactions.disliked = new Set(Array.isArray(parsed?.disliked) ? parsed.disliked : []);
  } catch (error) {
    console.warn("Failed to load reactions", error);
  }
}

function saveReactions() {
  try {
    localStorage.setItem(
      REACTIONS_STORAGE_KEY,
      JSON.stringify({
        liked: [...state.reactions.liked],
        disliked: [...state.reactions.disliked]
      })
    );
  } catch (error) {
    console.warn("Failed to save reactions", error);
  }
}

function isLiked(event) {
  return state.reactions.liked.has(eventKey(event));
}

function isDisliked(event) {
  return state.reactions.disliked.has(eventKey(event));
}

function reactionLabel(reaction, active) {
  return REACTION_ARIA_LABELS[reaction][active ? "active" : "inactive"];
}

function reactionIcon(reaction, active) {
  return REACTION_ICONS[reaction][active ? "filled" : "outline"];
}

function applyReactionButtonState(button, reaction, active) {
  if (!button) return;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", reactionLabel(reaction, active));
  button.title = reactionLabel(reaction, active);
  button.dataset.variant = active ? "filled" : "outline";
  button.innerHTML = reactionIcon(reaction, active);
}

function setReaction(event, reaction) {
  const key = eventKey(event);
  if (reaction === "liked") {
    if (state.reactions.liked.has(key)) {
      state.reactions.liked.delete(key);
    } else {
      state.reactions.liked.add(key);
      state.reactions.disliked.delete(key);
    }
  } else if (reaction === "disliked") {
    if (state.reactions.disliked.has(key)) {
      state.reactions.disliked.delete(key);
    } else {
      state.reactions.disliked.add(key);
      state.reactions.liked.delete(key);
    }
  }

  saveReactions();
  render();
}

function fillSelect(select, values, labels = {}) {
  const current = select.value;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels[value] ?? value;
    select.append(option);
  }
  select.value = current;
}

function createMultiSelect(root, config) {
  root.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "multi-select-button";
  button.id = config.buttonId;
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `<span class="multi-select-value"></span>`;

  const menu = document.createElement("div");
  menu.className = "multi-select-menu";
  menu.hidden = true;

  const defaultOption = document.createElement("label");
  defaultOption.className = "select-option select-default";
  defaultOption.htmlFor = config.defaultId;
  defaultOption.innerHTML = `
    <input id="${config.defaultId}" type="checkbox" data-default="true" checked>
    <span>${config.defaultLabel}</span>
  `;
  menu.append(defaultOption);

  for (const value of config.values) {
    const id = `${config.optionPrefix}-${value}`;
    const label = document.createElement("label");
    label.className = "select-option";
    label.htmlFor = id;
    label.innerHTML = `
      <input id="${id}" type="checkbox" value="${value}">
      <span>${TYPE_LABELS[value] ?? value}</span>
    `;
    menu.append(label);
  }

  button.addEventListener("click", () => {
    const isOpen = !menu.hidden;
    closeMultiSelects();
    setMultiSelectOpen(root, !isOpen);
  });

  menu.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    handleMultiSelectChange(root, config.kind, input);
  });

  root.append(button, menu);
  updateMultiSelect(root, config);
}

function closeMultiSelects() {
  setMultiSelectOpen(controls.categorySelect, false);
  setMultiSelectOpen(controls.excludeCategorySelect, false);
}

function setMultiSelectOpen(root, isOpen) {
  const button = root.querySelector(".multi-select-button");
  const menu = root.querySelector(".multi-select-menu");
  if (!button || !menu) return;
  menu.hidden = !isOpen;
  button.setAttribute("aria-expanded", String(isOpen));
}

function handleMultiSelectChange(root, kind, changedInput) {
  const inputs = [...root.querySelectorAll("input[type='checkbox']:not([data-default])")];
  const defaultInput = root.querySelector("input[data-default]");
  if (changedInput.dataset.default === "true") {
    for (const input of inputs) input.checked = false;
  } else if (defaultInput) {
    defaultInput.checked = inputs.every((input) => !input.checked);
  }

  const selected = inputs.filter((input) => input.checked).map((input) => input.value);
  if (kind === "include") {
    state.selectedCategories = selected;
    if (selected.length > 0) clearMultiSelect(controls.excludeCategorySelect, "exclude");
  } else {
    state.selectedExcludedCategories = selected;
    if (selected.length > 0) clearMultiSelect(controls.categorySelect, "include");
  }

  updateAllMultiSelects();
  render();
}

function clearMultiSelect(root, kind) {
  const inputs = [...root.querySelectorAll("input[type='checkbox']:not([data-default])")];
  const defaultInput = root.querySelector("input[data-default]");
  for (const input of inputs) input.checked = false;
  if (defaultInput) defaultInput.checked = true;
  if (kind === "include") state.selectedCategories = [];
  if (kind === "exclude") state.selectedExcludedCategories = [];
}

function updateAllMultiSelects() {
  updateMultiSelect(controls.categorySelect, includeSelectConfig());
  updateMultiSelect(controls.excludeCategorySelect, excludeSelectConfig());
}

function updateMultiSelect(root, config) {
  const selected = config.kind === "include" ? state.selectedCategories : state.selectedExcludedCategories;
  const button = root.querySelector(".multi-select-button");
  const value = root.querySelector(".multi-select-value");
  const defaultInput = root.querySelector("input[data-default]");
  if (defaultInput) defaultInput.checked = selected.length === 0;
  for (const input of root.querySelectorAll("input[type='checkbox']:not([data-default])")) {
    input.checked = selected.includes(input.value);
  }
  if (value) {
    value.textContent = selected.length === 0
      ? config.defaultLabel
      : selected.map((item) => TYPE_LABELS[item] ?? item).join(", ");
  }
  if (button) button.title = selected.length === 0 ? config.defaultLabel : selected.map((item) => TYPE_LABELS[item] ?? item).join(", ");
}

function includeSelectConfig() {
  return {
    kind: "include",
    values: state.categoryValues,
    defaultLabel: "Все",
    defaultId: "category-all",
    buttonId: "categoryDropdown",
    optionPrefix: "category"
  };
}

function excludeSelectConfig() {
  return {
    kind: "exclude",
    values: state.categoryValues,
    defaultLabel: "Ничего не исключать",
    defaultId: "exclude-category-none",
    buttonId: "excludeCategoryDropdown",
    optionPrefix: "exclude-category"
  };
}

function fillCategoryOptions(values) {
  state.categoryValues = values;
  createMultiSelect(controls.categorySelect, includeSelectConfig());
  createMultiSelect(controls.excludeCategorySelect, excludeSelectConfig());
}

function ensureReactionControls() {
  if (controls.favoritesFilter && controls.hideDislikedFilter) return;
  const toolbar = document.createElement("div");
  toolbar.className = "reaction-toolbar";
  toolbar.innerHTML = `
    <button id="favoritesFilter" type="button" class="filter-toggle">Избранные</button>
    <button id="hideDislikedFilter" type="button" class="filter-toggle">Убрать не мое</button>
  `;
  controls.statusRow.insertBefore(toolbar, periodEl);
  controls.favoritesFilter = toolbar.querySelector("#favoritesFilter");
  controls.hideDislikedFilter = toolbar.querySelector("#hideDislikedFilter");

  controls.favoritesFilter.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    updateReactionFilterButtons();
    render();
  });

  controls.hideDislikedFilter.addEventListener("click", () => {
    state.hideDisliked = !state.hideDisliked;
    updateReactionFilterButtons();
    render();
  });
}

function eventTags(event) {
  return event.tags ?? [event.type];
}

function dateBounds(events) {
  const dates = unique(events.map((event) => event.date));
  return {
    startDate: dates[0] ?? "",
    endDate: dates.at(-1) ?? ""
  };
}

function applyFilters() {
  const from = controls.dateFrom.value;
  const to = controls.dateTo.value;
  const categories = state.selectedCategories;
  const excludedByUser = state.selectedExcludedCategories;
  const city = controls.city.value;

  return state.events.filter((event) => {
    const tags = eventTags(event);
    const liked = isLiked(event);
    const disliked = isDisliked(event);
    if (from && event.date < from) return false;
    if (to && event.date > to) return false;
    if (state.excludedCategories.some((category) => tags.includes(category))) return false;
    if (categories.length > 0 && !categories.some((category) => tags.includes(category))) return false;
    if (excludedByUser.length > 0 && excludedByUser.some((category) => tags.includes(category))) return false;
    if (state.favoritesOnly && !liked) return false;
    if (state.hideDisliked && disliked) return false;
    if (city && event.city !== city) return false;
    return true;
  });
}

function updateReactionFilterButtons() {
  if (!controls.favoritesFilter || !controls.hideDislikedFilter) return;
  controls.favoritesFilter.classList.toggle("is-active", state.favoritesOnly);
  controls.hideDislikedFilter.classList.toggle("is-active", state.hideDisliked);
  controls.favoritesFilter.setAttribute("aria-pressed", String(state.favoritesOnly));
  controls.hideDislikedFilter.setAttribute("aria-pressed", String(state.hideDisliked));
}

function updateReactionButtons() {
  for (const card of eventsEl.querySelectorAll(".event-card")) {
    const key = card.dataset.eventKey;
    const liked = state.reactions.liked.has(key);
    const disliked = state.reactions.disliked.has(key);
    card.classList.toggle("is-liked", liked);
    card.classList.toggle("is-disliked", disliked);
    const likeButton = card.querySelector('[data-reaction="liked"]');
    const dislikeButton = card.querySelector('[data-reaction="disliked"]');
    applyReactionButtonState(likeButton, "liked", liked);
    applyReactionButtonState(dislikeButton, "disliked", disliked);
  }
}

function render() {
  const events = applyFilters();
  eventsEl.replaceChildren();
  emptyEl.hidden = events.length > 0;
  resultCountEl.textContent = `${events.length} ${plural(events.length, ["мероприятие", "мероприятия", "мероприятий"])}`;

  for (const event of events) {
    const card = document.createElement("article");
    card.className = "event-card";
    card.dataset.eventKey = eventKey(event);
    card.innerHTML = `
      <div class="date-box">
        <span>${formatDate(event.date)}</span>
        <strong>${event.time ?? "Весь день"}</strong>
      </div>
      <div class="card-body">
        <div class="card-head">
          <div class="card-title-block">
            <div class="card-meta">
              ${(event.tags ?? [event.type]).map((tag) => `<span>${TYPE_LABELS[tag] ?? tag}</span>`).join("")}
              <span>${event.city}</span>
            </div>
            <h2 class="event-title">
              ${
                event.url
                  ? `<a class="event-title-link" href="${escapeHtml(event.url)}" target="_blank" rel="noopener">${escapeHtml(event.title)}</a>`
                  : escapeHtml(event.title)
              }
            </h2>
          </div>
          <div class="reaction-actions" aria-label="Реакции">
            <button type="button" class="reaction-button" data-reaction="liked" aria-pressed="${isLiked(event)}"></button>
            <button type="button" class="reaction-button" data-reaction="disliked" aria-pressed="${isDisliked(event)}"></button>
          </div>
        </div>
        <p>${escapeHtml(event.description || event.rawType || "")}</p>
        <div class="details">
          <span>${escapeHtml(event.venue || "Место уточняется")}</span>
          <span>${formatPrice(event.price)}</span>
        </div>
        ${
          event.sourceName
            ? `<div class="source-line">Источник: ${
                event.sourceUrl
                  ? `<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(event.sourceName)}</a>`
                  : escapeHtml(event.sourceName)
              }</div>`
            : ""
        }
      </div>
    `;
    const likeButton = card.querySelector('[data-reaction="liked"]');
    const dislikeButton = card.querySelector('[data-reaction="disliked"]');
    applyReactionButtonState(likeButton, "liked", isLiked(event));
    applyReactionButtonState(dislikeButton, "disliked", isDisliked(event));
    likeButton?.addEventListener("click", () => setReaction(event, "liked"));
    dislikeButton?.addEventListener("click", () => setReaction(event, "disliked"));
    eventsEl.append(card);
  }
  updateReactionButtons();
  updateReactionFilterButtons();
}

function plural(count, forms) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  loadReactions();
  ensureReactionControls();
  const [eventsResponse, exclusionsResponse] = await Promise.all([
    fetch("data/events.json", { cache: "no-store" }),
    fetch("data/category-exclusions.json", { cache: "no-store" })
  ]);
  state.data = await eventsResponse.json();
  state.excludedCategories = exclusionsResponse.ok ? await exclusionsResponse.json() : [];
  state.events = state.data.events;
  const bounds = dateBounds(state.events);
  state.data.startDate = state.data.startDate ?? bounds.startDate;
  state.data.endDate = state.data.endDate ?? bounds.endDate;

  controls.dateFrom.value = state.data.startDate;
  controls.dateTo.value = state.data.endDate;
  periodEl.textContent = `${state.data.startDate} - ${state.data.endDate}`;

  fillCategoryOptions(unique(state.events.flatMap(eventTags)).filter((tag) => !state.excludedCategories.includes(tag)));
  fillSelect(controls.city, unique(state.events.map((event) => event.city)));

  if (Array.isArray(state.data.sources) && state.data.sources.length > 0) {
    summaryEl.textContent = state.data.sources
      .map((source) => `${source.sourceName}: до ${source.exportedUntil}, ${source.eventCount} событий`)
      .join(" | ");
  } else {
    summaryEl.textContent = `База обновлена: ${state.data.generatedAt ?? "дата неизвестна"}, ${state.events.length} событий`;
  }

  for (const control of [controls.dateFrom, controls.dateTo, controls.city]) {
    control.addEventListener("input", render);
  }
  controls.reset.addEventListener("click", () => {
    controls.dateFrom.value = state.data.startDate;
    controls.dateTo.value = state.data.endDate;
    clearMultiSelect(controls.categorySelect, "include");
    clearMultiSelect(controls.excludeCategorySelect, "exclude");
    updateAllMultiSelects();
    controls.city.value = "";
    state.favoritesOnly = false;
    state.hideDisliked = false;
    updateReactionFilterButtons();
    render();
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".multi-select")) return;
    closeMultiSelects();
  });

  render();
}

init().catch((error) => {
  summaryEl.textContent = "Не удалось загрузить экспорт мероприятий.";
  console.error(error);
});
