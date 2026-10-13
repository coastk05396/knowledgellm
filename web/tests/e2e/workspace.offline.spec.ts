import { expect, test, type Page } from "@playwright/test";

async function signInWithLongAnswers(page: Page) {
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
            documents: [
              {
                id: "finance-1",
                title: "Expense policy",
                department: "finance",
              },
            ],
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
    await history.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const bottom = await history.evaluate((element) => element.scrollTop);
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
