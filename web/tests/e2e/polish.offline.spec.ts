import { expect, test, type Page } from "@playwright/test";

async function mockExternalServices(page: Page) {
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
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/documents") {
      await route.fulfill({
        json: {
          documents: [
            {
              id: "finance-1",
              title: "Q4 budget overview",
              department: "finance",
            },
            { id: "finance-2", title: "Expense policy", department: "finance" },
          ],
        },
      });
    } else {
      await route.abort();
    }
  });
}

test.beforeEach(async ({ page }) => {
  await mockExternalServices(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /another account: Alex/ }),
  ).toBeEnabled();
});

for (const width of [320, 390, 768, 1440]) {
  test(`signed-out layout fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("textbox")).toBeDisabled();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  });
}

test("fine pointer hover and press, keyboard activation, and disabled buttons", async ({
  page,
}) => {
  const button = page.getByRole("button", { name: "New chat", exact: true });
  await page.mouse.move(0, 0);
  const idle = await button.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await button.hover();
  await expect
    .poll(() =>
      button.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(idle);
  await page.mouse.down();
  await expect(button).toHaveCSS(
    "transform",
    "matrix(0.985, 0, 0, 0.985, 0, 0)",
  );
  await page.mouse.up();
  await page.keyboard.press("Tab");
  await button.focus();
  await page.keyboard.down("Space");
  await expect(button).toHaveCSS("transform", "none");
  await page.keyboard.up("Space");
  const disabled = page.locator(".folder-button").first();
  await expect(disabled).toBeDisabled();
  await disabled.hover();
  await page.mouse.down();
  await expect(disabled).toHaveCSS("transform", "none");
  await page.mouse.up();
});

test("touch input keeps hover styling unchanged", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await mockExternalServices(page);
    await page.goto(baseURL!);
    expect(
      await page.evaluate(
        () => matchMedia("(hover: hover) and (pointer: fine)").matches,
      ),
    ).toBe(false);
    const button = page.getByRole("button", { name: "New chat", exact: true });
    const idle = await button.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await button.tap();
    await expect(button).toHaveCSS("background-color", idle);
    await expect(button).toHaveCSS(
      "-webkit-tap-highlight-color",
      "rgba(0, 0, 0, 0)",
    );
  } finally {
    await context.close();
  }
});

test("reduced-motion pointer press uses opacity without scaling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const button = page.getByRole("button", { name: "New chat", exact: true });
  await button.hover();
  await page.mouse.down();
  await expect(button).toHaveCSS("transform", "none");
  await expect(button).toHaveCSS("opacity", "0.85");
  await page.mouse.up();
  await expect(button).toHaveCSS("opacity", "1");
});

for (const reduced of [false, true]) {
  for (const dismissal of ["manual", "automatic"] as const) {
    test(`toast ${dismissal} exit ${reduced ? "with reduced motion" : "with motion"}`, async ({
      page,
    }) => {
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.getByRole("button", { name: /another account: Alex/ }).click();
      const toast = page.locator(".toast");
      await expect(toast).toContainText("Alex signed in successfully");
      await expect(page.getByRole("textbox")).toBeEnabled();
      await expect(toast).toHaveCSS(
        "transition-duration",
        reduced ? "0.08s" : "0.18s, 0.18s",
      );
      const entrance = await toast.evaluate((element) =>
        element.getAnimations().map((animation) => ({
          property:
            animation instanceof CSSTransition
              ? animation.transitionProperty
              : "",
          frames: (animation.effect as KeyframeEffect).getKeyframes(),
        })),
      );
      expect(
        entrance
          .find((animation) => animation.property === "opacity")
          ?.frames.map((frame) => frame.opacity),
      ).toEqual(["0", "1"]);
      if (!reduced) {
        expect(
          entrance
            .find((animation) => animation.property === "transform")
            ?.frames.map((frame) => frame.transform),
        ).toEqual(["translateY(8px)", "translateY(0px)"]);
      }
      await page.clock.runFor(180);
      await expect(toast).toHaveCSS("opacity", "1");
      await expect(toast).toHaveCSS(
        "transform",
        reduced ? "none" : "matrix(1, 0, 0, 1, 0, 0)",
      );
      if (dismissal === "manual") {
        await page
          .getByRole("button", { name: "Dismiss notification" })
          .click();
      } else {
        await page.clock.runFor(3820);
      }
      await expect(toast).toHaveClass(/closing/);
      await expect(toast).toHaveCSS(
        "transition-duration",
        reduced ? "0.08s" : "0.14s, 0.14s",
      );
      const exit = await toast.evaluate((element) =>
        element.getAnimations().map((animation) => ({
          property:
            animation instanceof CSSTransition
              ? animation.transitionProperty
              : "",
          frames: (animation.effect as KeyframeEffect).getKeyframes(),
        })),
      );
      expect(
        exit
          .find((animation) => animation.property === "opacity")
          ?.frames.map((frame) => frame.opacity),
      ).toEqual(["1", "0"]);
      if (!reduced) {
        expect(
          exit
            .find((animation) => animation.property === "transform")
            ?.frames.map((frame) => frame.transform),
        ).toEqual(["translateY(0px)", "translateY(8px)"]);
      }
      if (reduced) await expect(toast).toHaveCSS("transform", "none");
      const exitMs = reduced ? 80 : 140;
      await page.clock.runFor(exitMs - 1);
      await expect(toast).toHaveCount(1);
      await page.clock.runFor(1);
      await expect(toast).toHaveCount(0);
    });
  }
}
