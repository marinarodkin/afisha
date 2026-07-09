import { cleanText, hasFreeEntryEvidence } from "./events.mjs";

const DEFAULT_SCORING = {
  preferredCityBonus: 40,
  preferredTagBonus: 20,
  keywordBonus: 15,
  freeBonus: 10,
  weekendBonus: 10,
  excludedPenalty: 100,
  minimumScore: 15
};

export function buildEffectiveExcludeKeywords(preferences = {}) {
  const base = normalizeUniqueList(preferences.excludeKeywords ?? []);
  const learned = [];
  const mappings = Array.isArray(preferences.learnedMappings) ? preferences.learnedMappings : [];

  for (const mapping of mappings) {
    const trigger = normalizeToken(mapping?.ifKeyword);
    if (!trigger || !base.includes(trigger)) continue;
    for (const extra of mapping?.alsoExclude ?? []) {
      const normalized = normalizeToken(extra);
      if (normalized) learned.push(normalized);
    }
  }

  return normalizeUniqueList([...base, ...learned]);
}

export function scoreEventForPreferences(event, preferences = {}, options = {}) {
  const scoring = { ...DEFAULT_SCORING, ...(preferences.scoring ?? {}) };
  const reasons = [];
  const text = buildSearchText(event);
  const tags = collectEventTags(event);
  const excludeTags = new Set(normalizeUniqueList(preferences.excludeTags ?? []));
  const includeTags = new Set(normalizeUniqueList(preferences.includeTags ?? []));
  const boostTags = new Set(normalizeUniqueList(preferences.boostTags ?? []));
  const excludeKeywords = buildEffectiveExcludeKeywords(preferences);
  const excludeRawPatterns = normalizeUniqueList(preferences.excludeRawPatterns ?? []);

  for (const tag of tags) {
    if (excludeTags.has(tag)) {
      reasons.push(`excluded-tag:${tag}`);
      return { score: -scoring.excludedPenalty, excluded: true, reasons };
    }
  }

  for (const keyword of excludeKeywords) {
    if (keyword && text.includes(keyword)) {
      reasons.push(`excluded-keyword:${keyword}`);
      return { score: -scoring.excludedPenalty, excluded: true, reasons };
    }
  }

  for (const pattern of excludeRawPatterns) {
    if (pattern && text.includes(pattern)) {
      reasons.push(`excluded-pattern:${pattern}`);
      return { score: -scoring.excludedPenalty, excluded: true, reasons };
    }
  }

  let score = 0;

  if (isPreferredCity(event.city, preferences.citiesPriority ?? [])) {
    score += scoring.preferredCityBonus;
    reasons.push("preferred-city");
  }

  for (const tag of tags) {
    if (includeTags.has(tag) || boostTags.has(tag)) {
      score += scoring.preferredTagBonus;
      reasons.push(`preferred-tag:${tag}`);
    }
  }

  for (const keyword of normalizeUniqueList(preferences.boostKeywords ?? [])) {
    if (keyword && text.includes(keyword)) {
      score += scoring.keywordBonus;
      reasons.push(`preferred-keyword:${keyword}`);
    }
  }

  if (tags.includes("free") || hasFreeEntryEvidence(event)) {
    score += scoring.freeBonus;
    reasons.push("free-entry");
  }

  if (isWeekendEvent(event.date, options.now)) {
    score += scoring.weekendBonus;
    reasons.push("weekend");
  }

  return { score, excluded: false, reasons: [...new Set(reasons)] };
}

export function buildPersonalIndex(sourceBase = {}, preferences = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const today = toIsoDateUtc(now);
  const minimumScore = Number.isFinite(preferences?.scoring?.minimumScore)
    ? preferences.scoring.minimumScore
    : DEFAULT_SCORING.minimumScore;

  const scoredEvents = [];
  const hiddenEvents = [];

  for (const event of sourceBase.events ?? []) {
    if (!event?.date || event.date < today) continue;

    const result = scoreEventForPreferences(event, preferences, { now });
    if (result.excluded || result.score < minimumScore) {
      hiddenEvents.push({ id: event.id, score: result.score, reasons: result.reasons });
      continue;
    }

    scoredEvents.push({
      ...event,
      personalScore: result.score,
      matchReasons: result.reasons
    });
  }

  scoredEvents.sort((a, b) => {
    if (b.personalScore !== a.personalScore) return b.personalScore - a.personalScore;
    const aKey = `${a.date}T${a.time ?? "00:00"}`;
    const bKey = `${b.date}T${b.time ?? "00:00"}`;
    return aKey.localeCompare(bKey);
  });

  return {
    generatedAt: new Date().toISOString(),
    basedOnGeneratedAt: sourceBase.generatedAt ?? null,
    profile: preferences.profile ?? "default-personal-profile",
    eventCount: scoredEvents.length,
    hiddenCount: hiddenEvents.length,
    events: scoredEvents,
    hiddenEvents
  };
}

function normalizeUniqueList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeToken(value)).filter(Boolean))];
}

function normalizeToken(value) {
  return cleanText(String(value ?? ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchText(event) {
  return normalizeToken([
    event.titleDe,
    event.title,
    event.descriptionDe,
    event.description,
    event.venue,
    event.city,
    event.rawType,
    ...(event.tags ?? []),
    ...(event.rawCategoryHints ?? [])
  ].join(" "));
}

function collectEventTags(event) {
  return normalizeUniqueList([...(event.tags ?? []), ...(event.categories ?? []), event.type, ...(event.rawCategoryHints ?? [])]);
}

function isPreferredCity(city, priorities) {
  const normalizedCity = normalizeToken(city);
  return normalizeUniqueList(priorities).includes(normalizedCity);
}

function isWeekendEvent(date, nowInput) {
  if (!date) return false;
  const dateObj = new Date(`${date}T12:00:00Z`);
  const day = dateObj.getUTCDay();
  if (day === 0 || day === 6) return true;

  if (!nowInput) return false;
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const nowDay = now.getUTCDay();
  if (nowDay >= 4 && nowDay <= 6) {
    const diffDays = Math.round((dateObj.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0)) / 86400000);
    return diffDays >= 0 && diffDays <= 3;
  }

  return false;
}

function toIsoDateUtc(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
