import { readFile } from "node:fs/promises";

export const WIESBADEN_ORIGIN = "https://www.wiesbaden.de";

export const CATEGORIES = [
  "concert",
  "student_concert",
  "spektakl",
  "opera",
  "fest",
  "sport",
  "kino",
  "arthouse_cinema",
  "museum",
  "exhibition",
  "wochenmarkt",
  "children",
  "master_class",
  "course",
  "excursion",
  "church",
  "reading_club",
  "lecture",
  "civic",
  "poetry_evening",
  "poetry_slam",
  "handicraft",
  "creative_meeting",
  "reading",
  "lang_ru",
  "lang_en",
  "free",
  "other"
];

export const CATEGORY_LABELS = {
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

const HINT_RULES = [
  ["wochenmarkt", ["wochenmarkt"]],
  ["children", ["kinder", "jugendliche", "familien", "schulklassen"]],
  ["master_class", ["workshop", "meisterkurs", "masterclass", "atelier", "werkstatt"]],
  ["course", ["kurs", "seminar", "fortbildung"]],
  ["excursion", ["führung", "fuehrung", "exkursion", "rundgang"]],
  ["church", ["kirche", "church", "gottesdienst", "dom", "pfarr"]],
  ["museum", ["museum", "muwi"]],
  ["arthouse_cinema", ["arthouse", "autorenkino", "autorenfilm", "filmkunst", "programmkino", "kunstkino"]],
  ["exhibition", ["ausstellung", "vernissage", "galerie", "exhibit", "exposition"]],
  ["kino", ["kino", "film"]],
  ["sport", ["sport", "lauf", "yoga", "fitness"]],
  ["opera", ["oper", "opera"]],
  ["spektakl", ["theater", "kleinkunst", "schauspiel", "ballett", "tanz"]],
  ["student_concert", ["studentenkonzert", "studierendenkonzert", "hochschulkonzert", "musikhochschule", "hochschule für musik", "student orchestra", "student choir"]],
  ["fest", ["fest", "wein", "volksfest", "festival", "fastnacht"]],
  ["concert", ["konzert", "musik", "chor", "orchester", "kirchenmusik"]],
  ["civic", ["demonstration", "demo", "pride", "minderheit", "minderheiten", "queer", "lgbtq", "solidarity", "protest", "protestaktion"]]
];

export function cleanText(value) {
  return String(value ?? "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toIsoDate(value) {
  return value ? value.slice(0, 10) : null;
}

export function toTime(value) {
  if (!value) return null;
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export function normalizeUrl(url) {
  if (!url) return null;
  return url.startsWith("/") ? `${WIESBADEN_ORIGIN}${url}` : url;
}

export function dateWithZone(day, end = false) {
  return `${day}T${end ? "23:59:59" : "00:00:00"}+02:00`;
}

export function withinRange(start, startDate, endDate) {
  const day = toIsoDate(start);
  return day && day >= startDate && day <= endDate;
}

export function categoryHints(event) {
  const text = `${event.titleDe ?? event.title ?? ""} ${event.descriptionDe ?? event.description ?? ""} ${event.rawType ?? ""} ${event.venue ?? ""}`.toLowerCase();
  const tags = HINT_RULES.filter(([, words]) => words.some((word) => text.includes(word))).map(([tag]) => tag);
  return tags.length > 0 ? [...new Set(tags)] : ["other"];
}

export function hasFreeEntryEvidence(event) {
  const text = `${event.titleDe ?? event.title ?? ""} ${event.descriptionDe ?? event.description ?? ""} ${event.rawType ?? ""}`.toLowerCase();
  return /kostenlos|kostenfrei|gratis|ohne\s+eintritt|eintritt\s+frei|free\s+admission/.test(text);
}

export function hasLanguageEvidence(event, language) {
  const text = `${event.titleDe ?? event.title ?? ""} ${event.descriptionDe ?? event.description ?? ""}`.toLowerCase();
  if (language === "ru") {
    return /auf\s+russisch|in\s+russischer\s+sprache|russischsprach|russisch|русск|русский/.test(text);
  }
  if (language === "en") {
    return /auf\s+englisch|in\s+englischer\s+sprache|englischsprach|english|englisch/.test(text);
  }
  return false;
}

export function primaryType(tags) {
  return CATEGORIES.find((tag) => tags.includes(tag)) ?? "other";
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

export function sortEvents(events) {
  return events.sort((a, b) => `${a.date}T${a.time ?? "00:00"}`.localeCompare(`${b.date}T${b.time ?? "00:00"}`));
}
