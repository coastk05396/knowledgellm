import { expect, test, type Page } from "@playwright/test";

const excerpt =
  "- **Lodging**: Standard business hotel cap is **200 credits/night**.";
const policy = [
  "# Northstar Finance — Corporate Expense Policy",
  "",
  "> Fictional sample for public demonstration; not real company data or policy.",
  "",
  ...Array.from({ length: 12 }, (_, index) => [
    `## ${index + 1}. Section ${index + 1}`,
    "Expenses must be legitimate, reasonable, and necessary business costs.",
    "",
  ]).flat(),
  "## 13. Travel",
  "- **Flights**: Economy class is mandatory for flights under 6 hours.",
  excerpt,
  "",
  "## 14. Non-reimbursable expenses",
  "The company does not reimburse personal grooming.",
].join("\n");

async function signInWithLongAnswers(page: Page, documentCount = 1) {
  await page.route("https://cognito-idp.*.amazonaws.com/**", async (route) => {
    const initiating = route
      .request()
      .headers()
      ["x-amz-target"]?.endsWith("InitiateAuth");
    await route.fulfill({
      json: initiating
        ? { ChallengeName: "CUSTOM_CHALLENGE", Session: "offline-challenge" }
        : { AuthenticationResult: { AccessToken: "offline-fixture-token" } },
    });
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/documents") {
        await route.fulfill({
          json: {
            documents: Array.from({ length: documentCount }, (_, index) => ({
              id: `finance-${index + 1}`,
              title:
                index === 0 ? "Expense policy" : `Expense policy ${index + 1}`,
              department: "finance",
            })),
          },
        });
      } else if (path === "/api/chat") {
        await route.fulfill({
          json: {
            answer:
              "Review the expense policy and submit the required receipts. ".repeat(
                60,
              ),
            citations: [
              { document_id: "finance-1", title: "Expense policy", excerpt },
            ],
            guardrail_action: "pass",
          },
        });
      } else if (path.startsWith("/api/documents/")) {
        const id = decodeURIComponent(path.slice("/api/documents/".length));
        await route.fulfill({
          json: {
            document: {
              id,
              title: "Expense policy",
              url: "https://documents.example.com/finance/expense-policy.md",
              content: policy,
            },
          },
        });
      } else {
        await route.abort();
      }
    },
  );
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 1440) <= 760) {
    await page.getByRole("button", { name: "Sources", exact: true }).click();
  }
  await page.getByRole("button", { name: /another account: Alex/ }).click();
  await expect(page.locator(".composer textarea")).toBeEnabled();
  if ((page.viewportSize()?.width ?? 1440) <= 760) {
    await expect(
      page.getByRole("button", { name: "Sources", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Chat", exact: true }).click();
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`history scrolls independently with an anchored composer at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInWithLongAnswers(page);
    const input = page.getByRole("textbox", { name: "Your question" });
    for (let turn = 1; turn <= 3; turn += 1) {
      await input.fill(`Explain expense policy ${turn}`);
      await page.getByRole("button", { name: "Send question" }).click();
      await expect(
        page.getByRole("button", {
          name: "Source: Expense policy",
          exact: true,
        }),
      ).toHaveCount(turn);
      await expect(input).toBeEnabled();
    }
    const assistantMessages = page.locator(".assistant-message");
    await expect(assistantMessages).toHaveCount(3);
    await expect(assistantMessages.nth(0)).not.toHaveClass(/answer-entry/);
    await expect(assistantMessages.nth(1)).not.toHaveClass(/answer-entry/);
    await expect(assistantMessages.nth(2)).toHaveClass(/answer-entry/);
    const motion = await assistantMessages.nth(2).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        name: style.animationName,
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
      };
    });
    expect(motion).toEqual({
      name: "answer-entry",
      duration: "0.16s",
      timing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
    const chat = page.locator(".chat-area");
    await chat.scrollIntoViewIfNeeded();
    const chatBox = await chat.boundingBox();
    expect(chatBox).not.toBeNull();
    const history = page.getByRole("region", {
      name: "Conversation",
      exact: true,
    });
    const composer = page.locator(".composer-wrap");
    const before = await composer.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.y).toBeGreaterThanOrEqual(0);
    expect(before!.y + before!.height).toBeLessThanOrEqual(viewport.height);
    expect(before!.y).toBeGreaterThanOrEqual(chatBox!.y);
    expect(before!.y + before!.height).toBeLessThanOrEqual(
      chatBox!.y + chatBox!.height,
    );
    const geometry = await history.evaluate((element) => ({
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
      bottom: element.getBoundingClientRect().bottom,
    }));
    expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.contentHeight).toBeGreaterThan(geometry.height);
    expect(geometry.bottom).toBeLessThanOrEqual(before!.y + 1);
    await expect
      .poll(() => history.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const bottom = await history.evaluate((element) => element.scrollTop);
    const afterAnswer = await history.evaluate((element) => ({
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(
      afterAnswer.scrollTop + afterAnswer.clientHeight,
    ).toBeGreaterThanOrEqual(afterAnswer.scrollHeight - 1);
    expect(bottom).toBeGreaterThan(0);
    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    const box = await history.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -300);
    await expect
      .poll(() => history.evaluate((element) => element.scrollTop))
      .toBeLessThan(bottom);
    const scrolledUp = await history.evaluate((element) => element.scrollTop);
    await page.mouse.wheel(0, 150);
    await expect
      .poll(() => history.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(scrolledUp);
    const after = await composer.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await input.fill("A follow-up question");
    await expect(input).toHaveValue("A follow-up question");
    await expect(
      page.getByRole("button", { name: "Send question" }),
    ).toBeEnabled();
  });
}

test("desktop citation opens the cited passage in the reader column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithLongAnswers(page);
  const reader = page.getByRole("complementary", { name: "Source content" });
  await expect(reader).toContainText(
    "Select a source or a citation to read it here.",
  );
  await page.getByRole("textbox", { name: "Your question" }).fill("Lodging?");
  const popups: Page[] = [];
  page.on("popup", (popup) => popups.push(popup));
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".user-message .message-text")).toHaveText(
    "Lodging?",
  );
  const history = page.getByRole("region", { name: "Conversation" });
  const card = page.getByRole("button", {
    name: "Source: Expense policy",
    exact: true,
  });
  await expect(card).toContainText("Finance");
  await expect(page.locator(".answer-status")).toContainText("No PII detected");
  const scrolled = await history.evaluate((element) => element.scrollTop);
  await page
    .getByRole("button", { name: "Source 1: Expense policy", exact: true })
    .click();
  await expect(reader.getByText("Source 1 · Finance")).toBeVisible();
  await expect(
    reader.getByRole("heading", { name: "Expense policy", exact: true }),
  ).toBeVisible();
  const cited = reader.locator("[data-cited]");
  await expect(cited).toHaveCount(1);
  await expect(cited).toHaveText(
    "Lodging: Standard business hotel cap is 200 credits/night.",
  );
  await expect(cited).toBeInViewport();
  expect(
    await reader
      .locator(".reader-body")
      .evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  expect(await history.evaluate((element) => element.scrollTop)).toBe(scrolled);
  await expect(reader.locator(".reader-text")).not.toContainText("**");
  const link = reader.getByRole("link", {
    name: "Open full document in a new tab",
  });
  await expect(link).toHaveAttribute(
    "href",
    "https://documents.example.com/finance/expense-policy.md",
  );
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(card).toContainText("Open on the right");
  expect(popups).toHaveLength(0);
  const columns = await page.evaluate(() =>
    [".sidebar", ".chat-area", ".reader-panel"].map(
      (selector) =>
        document.querySelector(selector)!.getBoundingClientRect().width,
    ),
  );
  expect(columns[0]).toBe(280);
  expect(columns[2]).toBe(320);
  await reader.getByRole("button", { name: "Close source content" }).click();
  await expect(reader).toContainText(
    "Select a source or a citation to read it here.",
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`mobile reader is a dismissible bottom sheet at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInWithLongAnswers(page);
    await page.getByRole("textbox", { name: "Your question" }).fill("Lodging?");
    await page.getByRole("button", { name: "Send question" }).click();
    const card = page.getByRole("button", {
      name: "Source: Expense policy",
      exact: true,
    });
    await card.click();
    const sheet = page.getByRole("dialog", { name: "Source content" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    const close = sheet.getByRole("button", { name: "Close source content" });
    await expect(close).toBeFocused();
    await expect(sheet.locator("[data-cited]")).toBeInViewport();
    await expect(page.locator(".reader-backdrop")).toBeVisible();
    await expect(page.locator("#chat-panel")).toHaveAttribute("inert", "");
    const motion = await sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        property: style.transitionProperty,
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
      };
    });
    expect(motion).toEqual({
      property: "transform",
      duration: "0.28s",
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
    });
    await sheet.evaluate((element) =>
      Promise.all(element.getAnimations().map((item) => item.finished)),
    );
    const box = await sheet.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeCloseTo(viewport.height, 0);
    const closeBox = await close.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await page.keyboard.press("Escape");
    await expect(page.locator(".reader-panel")).toHaveClass(/closing/);
    await expect(sheet).toBeHidden();
    await expect(card).toBeFocused();
    await card.click();
    await expect(sheet).toBeVisible();
    await page
      .locator(".reader-backdrop")
      .click({ position: { x: 10, y: 10 } });
    await expect(sheet).toBeHidden();
  });
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`desktop panels fit at 100% zoom at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInWithLongAnswers(page);
    for (const selector of [".sidebar", ".reader-panel"]) {
      const dimensions = await page.locator(selector).evaluate((element) => ({
        height: element.clientHeight,
        contentHeight: element.scrollHeight,
      }));
      expect(dimensions.contentHeight).toBeLessThanOrEqual(
        dimensions.height + 1,
      );
    }
    await expect(page.locator(".folder-hint")).toHaveText([
      "Switch to Sam to view and ask",
      "Switch to Priya to view and ask",
    ]);
    await expect(page.locator(".composer-scope")).toHaveText(
      "Asking as Alex · searches only Finance's 1 source",
    );
    const chips = page.locator(".suggestion-chips button");
    await expect(chips).toHaveCount(7);
    const sizes = await chips.evaluateAll((elements) =>
      elements.map((element) => ({
        top: element.getBoundingClientRect().top,
        height: element.getBoundingClientRect().height,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
        borderStyle: getComputedStyle(element).borderTopStyle,
      })),
    );
    for (const size of sizes) {
      expect(size.top).toBe(sizes[0].top);
      expect(size.height).toBeGreaterThanOrEqual(44);
      expect(size.fontSize).toBeGreaterThanOrEqual(14);
    }
    expect(sizes.map((size) => size.borderStyle)).toEqual([
      ...Array<string>(5).fill("solid"),
      "dashed",
      "dashed",
    ]);
    const row = page.locator(".suggestion-chips");
    const composer = await page.locator(".composer").boundingBox();
    const rowBox = await row.boundingBox();
    expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(composer!.y + 5);
    expect(
      await row.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
  });
}

test("composer remains visible and editable after a short viewport resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInWithLongAnswers(page);
  const input = page.getByRole("textbox", { name: "Your question" });
  await input.focus();
  await page.setViewportSize({ width: 320, height: 400 });
  const composer = await page.locator(".composer-wrap").boundingBox();
  expect(composer).not.toBeNull();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(400);
  await input.fill("Keyboard-sized viewport question");
  await expect(input).toHaveValue("Keyboard-sized viewport question");
});

test("mobile workspace tabs switch panels and keep sources and chips compact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInWithLongAnswers(page);
  const nav = page.getByRole("navigation", { name: "Workspace views" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("button")).toHaveText(["Sources", "Chat"]);
  const sourceTab = nav.getByRole("button", { name: "Sources" });
  const chatTab = nav.getByRole("button", { name: "Chat" });
  await expect(chatTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".brand-bar")).toBeHidden();
  await expect(page.locator("#sources-panel")).toBeHidden();
  const indicator = await nav.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return {
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
      width: parseFloat(style.width),
    };
  });
  expect(indicator.duration).toBe("0.18s");
  expect(indicator.easing).toBe("cubic-bezier(0.77, 0, 0.175, 1)");
  await expect
    .poll(() =>
      nav.evaluate(
        (element) =>
          new DOMMatrixReadOnly(getComputedStyle(element, "::before").transform)
            .m41,
      ),
    )
    .toBeCloseTo(indicator.width + 8, 1);

  await sourceTab.click();
  await expect(page.locator("#sources-panel")).toBeVisible();
  await expect(page.locator(".brand-bar")).toBeVisible();
  const summary = page.locator(".sidebar .system-monitor");
  await expect(summary).toContainText("This session");
  await expect(summary.locator(".monitor-item")).toHaveText([
    "Answers0",
    "Token costUnavailable",
  ]);
  await expect(page.locator("#chat-panel")).toBeHidden();
  const folder = await page.locator(".folder-button").first().boundingBox();
  expect(folder).not.toBeNull();
  expect(folder!.height).toBeLessThanOrEqual(56);

  await chatTab.click();
  const chips = page.locator(".suggestion-chips button");
  const row = await page.locator(".suggestion-chips").boundingBox();
  const chip = await chips.first().boundingBox();
  expect(chip!.height).toBeGreaterThanOrEqual(44);
  expect(row!.height).toBeLessThanOrEqual(64);
  await chips.first().click();
  await expect(page.locator(".user-message .message-text")).toHaveText(
    "What is the total approved Q4 budget?",
  );
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Your question" }),
  ).toHaveValue("");
  const navBox = await nav.boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(844);
});

test("keyboard-selected chip sends without tab motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInWithLongAnswers(page);
  const chatTab = page.getByRole("button", { name: "Chat", exact: true });
  await chatTab.focus();
  await page.keyboard.press("Enter");
  await page.locator(".suggestion-chips button").last().focus();
  await expect(
    page.locator(".suggestion-chips button").last(),
  ).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(chatTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-mobile-motion",
    "false",
  );
  expect(
    await page
      .locator(".mobile-view-nav")
      .evaluate(
        (element) => getComputedStyle(element, "::before").transitionDuration,
      ),
  ).toBe("0s");
  await expect(page.locator(".assistant-message")).toHaveCount(1);
});

test("reduced motion uses opacity-only answer, tab and reader entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInWithLongAnswers(page);
  const sourceTab = page.getByRole("button", { name: "Sources", exact: true });
  await sourceTab.click();
  const reducedTabMotion = await page
    .locator(".folders")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        property: style.transitionProperty,
        duration: style.transitionDuration,
        transform: style.transform,
      };
    });
  expect(reducedTabMotion).toEqual({
    property: "opacity",
    duration: "0.08s",
    transform: "none",
  });
  expect(
    await page
      .locator(".mobile-view-nav")
      .evaluate(
        (element) => getComputedStyle(element, "::before").transitionDuration,
      ),
  ).toBe("0s");
  const chatTab = page.getByRole("button", { name: "Chat", exact: true });
  await chatTab.focus();
  await page.keyboard.press("Enter");
  await expect(chatTab).toHaveAttribute("aria-pressed", "true");
  const input = page.getByRole("textbox", { name: "Your question" });
  await input.fill("Explain expense policy");
  await page.getByRole("button", { name: "Send question" }).click();
  const answer = page.locator(".assistant-message.answer-entry");
  await expect(answer).toBeVisible();
  const motion = await answer.evaluate((element) => {
    const style = getComputedStyle(element);
    const animations = element.getAnimations() as (Animation & {
      animationName?: string;
    })[];
    const animation = animations.find(
      (item) => item.animationName === "answer-entry-reduced",
    );
    const keyframes = (
      animation?.effect as KeyframeEffect | null
    )?.getKeyframes();
    return {
      name: style.animationName,
      duration: style.animationDuration,
      keyframes,
    };
  });
  expect(motion.name).toBe("answer-entry-reduced");
  expect(motion.duration).toBe("0.08s");
  expect(
    motion.keyframes?.every((frame) => frame.transform === undefined),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Source: Expense policy", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Source content" });
  await expect(sheet).toBeVisible();
  for (const target of [sheet, page.locator(".reader-backdrop")]) {
    expect(
      await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          property: style.transitionProperty,
          duration: style.transitionDuration,
          transform: style.transform,
        };
      }),
    ).toEqual({ property: "opacity", duration: "0.08s", transform: "none" });
  }
});

test("source list scrolls independently when many authorized documents are listed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithLongAnswers(page, 20);
  await page.getByRole("button", { name: /Finance \/ Alex.*Unlocked/ }).click();
  const sidebar = page.locator(".sidebar");
  const geometry = await sidebar.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.height);
  expect(geometry.overflowY).toBe("auto");
  await sidebar.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await sidebar.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
});

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`tablet panels remain inside the viewport at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const sidebar = await page.locator(".sidebar").boundingBox();
    const chat = await page.locator(".chat-area").boundingBox();
    const chips = await page.locator(".suggestion-row").boundingBox();
    const composer = await page.locator(".composer-wrap").boundingBox();
    expect(sidebar).not.toBeNull();
    expect(chat).not.toBeNull();
    expect(chips).not.toBeNull();
    expect(composer).not.toBeNull();
    await expect(page.locator(".reader-panel")).toBeHidden();
    expect(chat!.y + chat!.height).toBeLessThanOrEqual(viewport.height);
    expect(chips!.y + chips!.height).toBeLessThanOrEqual(composer!.y + 1);
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(
      chat!.y + chat!.height,
    );
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    expect(dimensions.scrollHeight).toBe(dimensions.height);
  });
}
