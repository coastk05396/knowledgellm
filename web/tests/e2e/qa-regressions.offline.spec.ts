// QA regression tests for defects found in the 2026-10-14 workspace redesign.
import { expect, test, type Page } from "@playwright/test";

const excerpt =
  "- **Lodging**: Standard business hotel cap is **200 credits/night**.";

async function signIn(page: Page) {
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
            answer: "Lodging is capped at 200 credits per night.",
            citations: [
              { document_id: "finance-1", title: "Expense policy", excerpt },
            ],
            guardrail_action: "pass",
          },
        });
      } else if (path.startsWith("/api/documents/")) {
        await route.fulfill({
          json: {
            document: {
              id: "finance-1",
              title: "Expense policy",
              url: "https://documents.example.com/finance/expense-policy.md",
              content: `# Expense policy\n\n## Travel\n${excerpt}\n`,
            },
          },
        });
      } else {
        await route.abort();
      }
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /another account: Alex/ }).click();
  await expect(page.locator(".composer textarea")).toBeEnabled();
}

test("a chip focused with Tab is scrolled into view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.screenshot({ path: "/tmp/knowledgellm-redesign-desktop.png" });
  const chips = page.locator(".suggestion-chips button");
  const count = await chips.count();
  expect(count).toBeGreaterThan(3);
  await page.getByRole("button", { name: "New chat" }).focus();
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press("Tab");
    await expect(chips.nth(index)).toBeFocused();
    // The readable start of the focused chip must be inside the row.
    await expect
      .poll(
        () =>
          chips.nth(index).evaluate((chip) => {
            const box = chip.getBoundingClientRect();
            const row = chip.parentElement!.getBoundingClientRect();
            const visible =
              Math.min(box.right, row.right) - Math.max(box.left, row.left);
            return visible >= Math.min(box.width, row.width) - 8;
          }),
        {
          message: `chip ${index + 1} is clipped while focused`,
          timeout: 1500,
        },
      )
      .toBe(true);
  }
});

test("clicking the opener while the sheet is leaving re-opens it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await signIn(page);
  await page.getByRole("textbox", { name: "Your question" }).fill("Lodging?");
  await page.getByRole("button", { name: "Send question" }).click();
  const card = page.getByRole("button", {
    name: "Source: Expense policy",
    exact: true,
  });
  const box = (await card.boundingBox())!;
  await card.click();
  const sheet = page.getByRole("dialog", { name: "Source content" });
  await expect(sheet).toBeVisible();
  await sheet.evaluate((element) =>
    Promise.all(element.getAnimations().map((item) => item.finished)),
  );
  const sheetBox = (await sheet.boundingBox())!;
  // The opener must be reachable beside the sheet for this check to be valid.
  expect(box.y + box.height / 2).toBeLessThan(sheetBox.y);
  await page.keyboard.press("Escape");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await expect(sheet).toBeVisible();
  await expect(page.locator(".reader-panel")).not.toHaveClass(/closing/);
});

for (const language of ["EN", "CH"] as const) {
  test(`pointer focus does not move a chip away before its click submits (${language})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.getByRole("button", { name: language, exact: true }).click();
    await expect(page.locator(".composer textarea")).toBeEnabled();
    let requests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/chat") requests++;
    });
    const chip = page.locator(".suggestion-chips button").nth(1);
    const question = (await chip.innerText()).trim();
    const box = (await chip.boundingBox())!;
    const rowBefore = await chip.evaluate((el) => el.parentElement!.scrollLeft);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const rowAfter = await chip.evaluate((el) => el.parentElement!.scrollLeft);
    await page.mouse.up();
    expect(rowAfter).toBe(rowBefore);
    await expect.poll(() => requests).toBe(1);
    await expect(page.locator(".message-text").first()).toContainText(question);
  });
}
