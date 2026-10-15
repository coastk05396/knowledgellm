import { expect, test, type Page } from "@playwright/test";

async function mockServices(page: Page) {
  const apiRequests: string[] = [];
  await page.route("https://cognito-idp.*.amazonaws.com/**", async (route) => {
    const initiating = route
      .request()
      .headers()
      ["x-amz-target"]?.endsWith("InitiateAuth");
    await route.fulfill({
      json: initiating
        ? { ChallengeName: "CUSTOM_CHALLENGE", Session: "offline-challenge" }
        : {
            AuthenticationResult: {
              AccessToken: "offline-fixture-token",
              ExpiresIn: 60,
            },
          },
    });
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      apiRequests.push(path);
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
            answer: "Fictional expenses require receipts.",
            citations: [
              {
                document_id: "finance-1",
                title: "Expense policy",
                excerpt: "Receipts are required.",
              },
            ],
            guardrail_action: "pass",
          },
        });
      } else if (path === "/api/documents/finance-1") {
        await route.fulfill({
          json: {
            document: {
              id: "finance-1",
              title: "Expense policy",
              url: "https://documents.example.com/expense-policy.md",
              content: "# Fictional expense policy\n\nReceipts are required.",
            },
          },
        });
      } else {
        await route.abort();
      }
    },
  );
  return apiRequests;
}

async function expectSignedOut(page: Page) {
  await expect(
    page.getByRole("button", { name: /another account: Alex/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Your question" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Your question" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Send question" }),
  ).toBeDisabled();
  await expect(page.locator(".identity-card[aria-pressed=true]")).toHaveCount(
    0,
  );
  await expect(page.locator(".folder-button:enabled")).toHaveCount(0);
  await expect(page.locator(".assistant-message")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Source content" }),
  ).not.toContainText("Receipts are required.");
}

test("persona expiry clears conversation and source access without reloading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  const requests = await mockServices(page);
  await page.goto("/");
  await page.getByRole("button", { name: /another account: Alex/ }).click();
  const input = page.getByRole("textbox", { name: "Your question" });
  await expect(input).toBeEnabled();
  await input.fill("What receipts are needed?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".assistant-message")).toContainText(
    "Fictional expenses require receipts.",
  );
  await page
    .getByRole("button", { name: "Source: Expense policy", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Source content" }),
  ).toContainText("Receipts are required.");
  await input.fill("Unsent question");
  const beforeExpiry = requests.length;
  await page.clock.fastForward(61_000);
  await expectSignedOut(page);
  await expect(
    page.getByText("Your session expired. Sign in again to continue.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(beforeExpiry);
  await page.screenshot({
    path: "/tmp/knowledgellm-session-expired.png",
    fullPage: true,
  });
  await page.reload();
  await expectSignedOut(page);
  expect(requests).toHaveLength(beforeExpiry);
});

for (const persistedSession of [
  { name: "already expired", expiresAt: 1 },
  { name: "legacy session missing expiry" },
]) {
  test(`reload rejects ${persistedSession.name} before requesting sources`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requests = await mockServices(page);
    await page.goto("/");
    // Only synthetic fixture data is written; no existing credentials are read.
    await page.evaluate(
      (fixture) => {
        sessionStorage.setItem(
          "knowledge-direct-session",
          JSON.stringify({
            accessToken: "offline-fixture-token",
            name: "Alex Morgan",
            ...fixture,
          }),
        );
      },
      "expiresAt" in persistedSession
        ? { expiresAt: persistedSession.expiresAt }
        : {},
    );
    await page.reload();
    await expectSignedOut(page);
    expect(requests).toHaveLength(0);
  });
}
