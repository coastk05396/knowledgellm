import { expect, test, type Page } from "@playwright/test";

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
            citations: [{ document_id: "finance-1", title: "Expense policy" }],
            guardrail_action: "pass",
          },
        });
      } else {
        await route.abort();
      }
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /another account: Alex/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Your question" }),
  ).toBeEnabled();
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

test("Pen layout keeps source status left and makes desktop Studio cards reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 985 });
  await signInWithLongAnswers(page);
  await page.screenshot({
    path: "../docs/screenshots/notebook-workspace-pen-match.png",
  });

  await page.setViewportSize({ width: 1440, height: 400 });
  await expect(
    page.getByRole("complementary", { name: "Studio" }),
  ).toBeVisible();
  await expect(page.locator(".sidebar .system-monitor")).toBeVisible();
  const rail = page.locator(".suggestion-rail");
  const geometry = await rail.evaluate((element) => ({
    height: element.clientHeight,
    contentHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(geometry.overflowY).toBe("auto");
  expect(geometry.contentHeight).toBeGreaterThan(geometry.height);
  await rail.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await rail.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    0,
  );
});

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
    for (const selector of [".sidebar", ".suggestion-rail"]) {
      const dimensions = await page.locator(selector).evaluate((element) => ({
        height: element.clientHeight,
        contentHeight: element.scrollHeight,
      }));
      expect(dimensions.contentHeight).toBeLessThanOrEqual(
        dimensions.height + 1,
      );
    }
    const cards = page.locator(".suggestion-buttons button");
    await expect(cards).toHaveCount(7);
    const sizes = await cards.evaluateAll((elements) =>
      elements.map((element) => ({
        height: element.getBoundingClientRect().height,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      })),
    );
    for (const size of sizes) {
      expect(size.height).toBeGreaterThanOrEqual(44);
      expect(size.fontSize).toBeGreaterThanOrEqual(15);
    }
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

test("mobile workspace tabs switch panels and keep source and prompt cards compact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInWithLongAnswers(page);
  const nav = page.getByRole("navigation", { name: "Workspace views" });
  await expect(nav).toBeVisible();
  const sourceTab = nav.getByRole("button", { name: "Sources" });
  const chatTab = nav.getByRole("button", { name: "Chat" });
  const studioTab = nav.getByRole("button", { name: "Studio" });
  await expect(chatTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sources-panel")).toBeHidden();
  await expect(page.locator("#suggestions-panel")).toBeHidden();

  await sourceTab.click();
  await expect(page.locator("#sources-panel")).toBeVisible();
  await expect(page.locator("#chat-panel")).toBeHidden();
  const folder = await page.locator(".folder-button").first().boundingBox();
  expect(folder).not.toBeNull();
  expect(folder!.height).toBeLessThanOrEqual(56);

  await studioTab.click();
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await expect(page.locator("#sources-panel")).toBeHidden();
  await expect(page.locator("#chat-panel")).toBeHidden();
  await page.screenshot({
    path: "../docs/screenshots/notebook-workspace-mobile-studio.png",
  });
  const prompt = page.locator(".suggestion-buttons button").first();
  const promptStyle = await prompt.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    fontSize: getComputedStyle(element).fontSize,
  }));
  expect(promptStyle.fontSize).toBe("15px");
  expect(promptStyle.height).toBeLessThanOrEqual(76);

  await prompt.click();
  await expect(chatTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chat-panel")).toBeVisible();
  await expect(page.locator("#suggestions-panel")).toBeHidden();
  await expect(page.locator(".assistant-message")).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Your question" }),
  ).toHaveValue("");
  const navBox = await nav.boundingBox();
  expect(navBox).not.toBeNull();
  expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(844);
});

test("reduced motion uses opacity-only answer entry and mobile tabs remain keyboard accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInWithLongAnswers(page);
  const studioTab = page.getByRole("button", { name: "Studio", exact: true });
  await studioTab.focus();
  await page.keyboard.press("Enter");
  await expect(studioTab).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Studio", exact: true }),
  ).toBeVisible();
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
    const studio = await page.locator(".suggestion-rail").boundingBox();
    const composer = await page.locator(".composer-wrap").boundingBox();
    expect(sidebar).not.toBeNull();
    expect(chat).not.toBeNull();
    expect(studio).not.toBeNull();
    expect(composer).not.toBeNull();
    expect(studio!.y + studio!.height).toBeLessThanOrEqual(viewport.height);
    expect(chat!.y + chat!.height).toBeLessThanOrEqual(studio!.y + 1);
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
