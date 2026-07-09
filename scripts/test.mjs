import { chromium } from "playwright";

const baseUrl = process.env.TEST_URL ?? "http://127.0.0.1:4173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".event-card", { timeout: 10000 });

  const totalText = await page.locator("#resultCount").innerText();
  const cards = await page.locator(".event-card").count();
  if (cards < 1) throw new Error("No event cards rendered");
  if (cards < 2) throw new Error("Need at least two cards for reaction smoke test");
  const firstTitleHref = await page.locator(".event-title-link").first().getAttribute("href");
  if (!firstTitleHref) throw new Error("Event title is not linked");
  const firstSourceText = await page.locator(".source-line").first().innerText();
  if (!firstSourceText.toLowerCase().includes("источник")) throw new Error("Source line is missing");
  const firstCard = page.locator(".event-card").nth(0);
  const secondCard = page.locator(".event-card").nth(1);
  const firstTitle = (await firstCard.locator(".event-title").innerText()).trim();
  const secondTitle = (await secondCard.locator(".event-title").innerText()).trim();
  const secondTitleHref = await secondCard.locator(".event-title-link").getAttribute("href");
  const firstLikeButton = firstCard.locator('[data-reaction="liked"]');
  const firstDislikeButton = firstCard.locator('[data-reaction="disliked"]');
  const firstLikeText = await firstLikeButton.evaluate((button) => button.textContent?.trim() ?? "");
  const firstDislikeText = await firstDislikeButton.evaluate((button) => button.textContent?.trim() ?? "");
  if (firstLikeText || firstDislikeText) {
    throw new Error("Reaction controls should be icon-only");
  }
  if ((await firstLikeButton.getAttribute("aria-label")) !== "Поставить лайк") {
    throw new Error("Like button is missing the inactive aria label");
  }
  if ((await firstLikeButton.locator("svg").count()) !== 1 || (await firstDislikeButton.locator("svg").count()) !== 1) {
    throw new Error("Reaction buttons should render SVG icons");
  }
  if ((await firstLikeButton.getAttribute("data-variant")) !== "outline" || (await firstDislikeButton.getAttribute("data-variant")) !== "outline") {
    throw new Error("Inactive reaction buttons should use outline icons");
  }

  await firstCard.locator('[data-reaction="liked"]').click();
  await secondCard.locator('[data-reaction="disliked"]').click();
  await page.waitForTimeout(200);

  const storedReactions = await page.evaluate(() => JSON.parse(localStorage.getItem("afisha:reactions:v1") || "{}"));
  if (!storedReactions.liked?.length || !storedReactions.disliked?.length) {
    throw new Error("Reactions were not written to localStorage");
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".event-card", { timeout: 10000 });

  const likedCardAfterReload = page.locator(`.event-card:has(.event-title-link[href="${firstTitleHref}"])`);
  const dislikedCardAfterReload = page.locator(`.event-card:has(.event-title-link[href="${secondTitleHref}"])`);
  await page.waitForTimeout(200);
  if ((await likedCardAfterReload.locator('[data-reaction="liked"]').getAttribute("aria-pressed")) !== "true") {
    throw new Error("Liked state did not persist after reload");
  }
  if ((await likedCardAfterReload.locator('[data-reaction="liked"]').getAttribute("data-variant")) !== "filled") {
    throw new Error("Liked state should use the filled icon");
  }
  if ((await dislikedCardAfterReload.locator('[data-reaction="disliked"]').getAttribute("aria-pressed")) !== "true") {
    throw new Error("Disliked state did not persist after reload");
  }
  if ((await dislikedCardAfterReload.locator('[data-reaction="disliked"]').getAttribute("data-variant")) !== "filled") {
    throw new Error("Disliked state should use the filled icon");
  }

  const totalCountBeforeReactionFilters = await page.locator(".event-card").count();
  await page.locator("#hideDislikedFilter").click();
  await page.waitForTimeout(200);
  const afterHideDislikedCount = await page.locator(".event-card").count();
  if (afterHideDislikedCount >= totalCountBeforeReactionFilters) {
    throw new Error("Hide disliked filter did not reduce the visible card count");
  }
  if (await page.locator(`.event-card:has(.event-title-link[href="${secondTitleHref}"])`).count()) {
    throw new Error("Disliked card is still visible after hide disliked");
  }
  await page.locator("#hideDislikedFilter").click();
  await page.waitForTimeout(200);

  await page.locator("#favoritesFilter").click();
  await page.waitForTimeout(200);
  const favoritesCount = await page.locator(".event-card").count();
  if (favoritesCount < 1) throw new Error("Favorites filter returned no cards");
  if (await page.locator(`.event-card:has(.event-title-link[href="${firstTitleHref}"])`).count() !== 1) {
    throw new Error("Liked card is missing from favorites");
  }
  if (await page.locator(`.event-card:has(.event-title-link[href="${secondTitleHref}"])`).count()) {
    throw new Error("Disliked card should not appear in favorites");
  }
  await page.locator("#favoritesFilter").click();
  await page.waitForTimeout(200);

  await page.locator("#categoryDropdown").click();
  await page.locator("#category-kino").check();
  await page.waitForTimeout(250);
  const filteredCards = await page.locator(".event-card").count();
  const filteredText = await page.locator("#resultCount").innerText();
  if (!(await page.locator("#exclude-category-none").isChecked())) {
    throw new Error("Exclude dropdown was not reset after category selection");
  }

  await page.locator("#category-kino").uncheck();
  const multiCategoryIds = await page
    .locator("#categorySelect input:not([data-default])")
    .evaluateAll((inputs) =>
      inputs
        .map((input) => input.id)
        .filter((id) => ["category-spektakl", "category-museum", "category-excursion", "category-master_class"].includes(id))
        .slice(0, 2)
    );
  if (multiCategoryIds.length < 2) throw new Error("Not enough category checkboxes for multi-category test");
  for (const id of multiCategoryIds) {
    await page.locator(`#${id}`).check();
  }
  await page.waitForTimeout(250);
  const multiCategoryCards = await page.locator(".event-card").count();

  await page.locator("#excludeCategoryDropdown").click();
  await page.locator("#exclude-category-kino").check();
  await page.waitForTimeout(250);
  const excludedCards = await page.locator(".event-card").count();
  if (!(await page.locator("#category-all").isChecked())) {
    throw new Error("Category dropdown was not reset after exclude selection");
  }

  await page.locator("#resetFilters").click();
  await page.fill("#dateFrom", "2026-05-28");
  await page.fill("#dateTo", "2026-05-29");
  await page.waitForTimeout(250);
  const dateRangeCards = await page.locator(".event-card").count();

  const visibleText = await page.locator("body").innerText();
  if (visibleText.toLowerCase().includes("wochenmarkt")) {
    throw new Error("Excluded wochenmarkt category is visible");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const mobileCards = await page.locator(".event-card").count();

  console.log(JSON.stringify({ totalText, cards, filteredText, filteredCards, multiCategoryIds, multiCategoryCards, excludedCards, dateRangeCards, mobileCards, favoritesCount, afterHideDislikedCount }, null, 2));
} finally {
  await browser.close();
}
